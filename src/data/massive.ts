// Massive (formerly Polygon.io) client. The free Options Basic plan allows
// 5 requests a minute with end-of-day data, so requests are paced and every
// response is cached. The option chain comes from the snapshot endpoint,
// which carries greeks, IV and open interest; whether a key is entitled to
// it depends on the plan, and testConnection reports that explicitly.
import { cacheGet, cacheSet } from '../lib/storage'
import type { CompanyInfo, OptionContract, PricePoint } from '../lib/types'
import { ProviderError, type DataProvider, type FetchOptions } from './provider'

const BASE = 'https://api.massive.com'
const TTL = 6 * 60 * 60 * 1000 // end-of-day data: refresh a few times a day
const MIN_INTERVAL = 12_500 // 5 requests per minute, with margin

type Json = Record<string, unknown>

// Serializes uncached requests so a free key never trips the per-minute cap.
class Pacer {
  private last = 0
  private chain: Promise<void> = Promise.resolve()
  private interval: number
  constructor(interval: number) {
    this.interval = interval
  }
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.interval - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      this.last = Date.now()
    })
    this.chain = run.catch(() => undefined)
    return run.then(fn)
  }
}
const pacer = new Pacer(MIN_INTERVAL)

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function parseAggs(json: Json): PricePoint[] {
  const results = (json.results as Json[] | undefined) ?? []
  return results
    .filter((r) => typeof r.c === 'number' && typeof r.t === 'number')
    .map((r) => ({
      date: new Date(r.t as number).toISOString().slice(0, 10),
      open: (r.o as number) ?? (r.c as number),
      high: (r.h as number) ?? (r.c as number),
      low: (r.l as number) ?? (r.c as number),
      close: r.c as number,
      volume: (r.v as number) ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function parseSnapshot(json: Json): OptionContract[] {
  const results = (json.results as Json[] | undefined) ?? []
  const out: OptionContract[] = []
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  for (const r of results) {
    const d = (r.details ?? {}) as Json
    const type = d.contract_type === 'put' ? 'put' : d.contract_type === 'call' ? 'call' : null
    if (!type) continue
    const g = (r.greeks ?? {}) as Json
    const q = (r.last_quote ?? {}) as Json
    const day = (r.day ?? {}) as Json
    const bid = num(q.bid)
    const ask = num(q.ask)
    const close = num(day.close) || num(((r.last_trade ?? {}) as Json).price)
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : close
    if (!(mark > 0)) continue
    out.push({
      symbol: String(d.ticker ?? ''),
      type,
      strike: num(d.strike_price),
      expiry: String(d.expiration_date ?? ''),
      bid,
      ask,
      last: close,
      mark,
      volume: num(day.volume),
      openInterest: num(r.open_interest),
      iv: num(r.implied_volatility),
      delta: num(g.delta),
      gamma: num(g.gamma) || undefined,
      theta: num(g.theta) || undefined,
      vega: num(g.vega) || undefined,
    })
  }
  return out
}

export function parseNextDividend(json: Json, todayISO: string): string | null {
  const results = (json.results as Json[] | undefined) ?? []
  const dates = results.map((r) => String(r.ex_dividend_date ?? '')).filter((d) => d >= todayISO).sort()
  return dates[0] ?? null
}

export function massiveProvider(apiKey: string): DataProvider {
  async function get(pathOrUrl: string, params: Record<string, string> = {}, onProgress?: (m: string) => void, attempt = 0): Promise<Json> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`
    const key = `massive:${url}`
    const cached = cacheGet<Json>(key, TTL)
    if (cached) return cached
    if (!apiKey) throw new ProviderError('No Massive API key set.', 'Create a free key at massive.com and paste it in Settings.')
    const res = await pacer.schedule(() => {
      onProgress?.('Requesting data (paced to 5 calls a minute)')
      return fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    })
    if (res.status === 401 || res.status === 403) {
      let message = ''
      try {
        message = String(((await res.json()) as Json).message ?? '')
      } catch {
        /* ignore */
      }
      if (/not authorized|entitle|plan|upgrade/i.test(message) || res.status === 403)
        throw new ProviderError('Your Massive plan is not entitled to this endpoint.', `${message || 'The option chain snapshot is not included on the free Options Basic plan.'} Options Starter adds chain snapshots with greeks. Until then, use Alpha Vantage or Demo data.`)
      throw new ProviderError('Massive rejected the API key.', 'Check the key in Settings.')
    }
    if (res.status === 429) {
      if (attempt < 3) {
        onProgress?.('Rate limited, waiting before retrying')
        await new Promise((r) => setTimeout(r, 20_000))
        return get(pathOrUrl, params, onProgress, attempt + 1)
      }
      throw new ProviderError('Massive rate limit reached.', 'The free plan allows 5 requests a minute. Wait a minute and try again.')
    }
    if (!res.ok) throw new ProviderError(`Massive returned HTTP ${res.status}.`)
    const json = (await res.json()) as Json
    if (json.status === 'ERROR') throw new ProviderError(String(json.error ?? json.message ?? 'Massive returned an error.'))
    cacheSet(key, json)
    return json
  }

  async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch {
      return null
    }
  }

  return {
    id: 'massive',
    label: 'Massive',
    async fetchSnapshot(symbolRaw, opts: FetchOptions = {}) {
      const symbol = symbolRaw.toUpperCase()
      const today = new Date()
      const start = new Date(today)
      start.setDate(start.getDate() - 420)
      const progress = opts.onProgress

      progress?.('Loading price history')
      const aggs = await get(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${iso(start)}/${iso(today)}`, { adjusted: 'true', sort: 'asc', limit: '50000' }, progress)
      const history = parseAggs(aggs)
      if (history.length < 60) throw new ProviderError(`Not enough price history for ${symbol}.`, 'Check the ticker symbol.')
      const price = history[history.length - 1].close

      const maxDte = opts.maxDte ?? 120
      const lte = new Date(today)
      lte.setDate(lte.getDate() + maxDte)
      const chain: OptionContract[] = []
      let url: string | null = null
      let page = 0
      const params = {
        'expiration_date.gte': iso(today),
        'expiration_date.lte': iso(lte),
        'strike_price.gte': (price * 0.7).toFixed(2),
        'strike_price.lte': (price * 1.3).toFixed(2),
        limit: '250',
        sort: 'expiration_date',
        order: 'asc',
      }
      do {
        page += 1
        progress?.(`Loading option chain, page ${page}`)
        const json: Json = url ? await get(url, {}, progress) : await get(`/v3/snapshot/options/${encodeURIComponent(symbol)}`, params, progress)
        chain.push(...parseSnapshot(json))
        url = typeof json.next_url === 'string' ? json.next_url : null
      } while (url && page < 6)
      if (!chain.length) throw new ProviderError(`Massive returned an empty options chain for ${symbol}.`, 'The symbol may have no listed options, or your plan does not return prices for them.')

      progress?.('Loading dividends')
      const div = await optional(() => get('/v3/reference/dividends', { ticker: symbol, 'ex_dividend_date.gte': iso(today), order: 'asc', sort: 'ex_dividend_date', limit: '1' }, progress))
      const hasQuotes = chain.some((c) => c.bid > 0 && c.ask > 0)
      const info: CompanyInfo = {
        name: symbol,
        exDividendDate: div ? parseNextDividend(div, iso(today)) : null,
        nextEarningsDate: null,
      }
      return {
        symbol,
        asOf: history[history.length - 1].date,
        source: 'massive',
        history: history.slice(-400),
        chain,
        info,
        note: [
          'Massive end-of-day data from the last completed session. Greeks and IV are provider-supplied.',
          hasQuotes ? '' : 'This plan returns closing prices without bid-ask quotes, so spreads are unknown and marks use the last close.',
          'Massive has no earnings calendar; confirm the earnings date yourself.',
        ]
          .filter(Boolean)
          .join(' '),
      }
    },
    async testConnection() {
      const prev = await get('/v2/aggs/ticker/SPY/prev', { adjusted: 'true' })
      const bar = ((prev.results as Json[] | undefined) ?? [])[0]
      if (!bar) throw new ProviderError('Key accepted but no price data came back.')
      try {
        const snap = await get('/v3/snapshot/options/SPY', { limit: '1' })
        const first = (((snap.results as Json[] | undefined) ?? [])[0] ?? {}) as Json
        const hasGreeks = !!first.greeks
        const hasQuote = !!(first.last_quote as Json | undefined)?.bid
        return `Key works (SPY close ${(bar.c as number).toFixed(2)}). Option chain snapshot: entitled${hasGreeks ? ', greeks included' : ', no greeks'}${hasQuote ? ', bid-ask included' : ', closes only'}.`
      } catch (e) {
        const err = e as ProviderError
        throw new ProviderError(`Key works (SPY close ${(bar.c as number).toFixed(2)}), but the option chain snapshot is not available on this plan.`, err.hint ?? err.message)
      }
    },
  }
}
