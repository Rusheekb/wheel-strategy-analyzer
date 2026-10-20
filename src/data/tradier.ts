// Tradier market data client. Works with a free developer sandbox token
// (15-minute delayed data) or a brokerage production token. Options
// chains are fetched one expiry at a time with greeks and IV attached.
import { cacheGet, cacheSet } from '../lib/storage'
import type { CompanyInfo, OptionContract, PricePoint } from '../lib/types'
import { ProviderError, type DataProvider, type FetchOptions } from './provider'

const HOSTS = { sandbox: 'https://sandbox.tradier.com', production: 'https://api.tradier.com' }
const TTL = 15 * 60 * 1000 // quotes and chains refresh every 15 minutes
const TTL_SLOW = 12 * 60 * 60 * 1000 // calendars and history refresh twice a day

type Json = Record<string, unknown>

// Tradier returns a bare object instead of a one-element array when a list
// has a single item. Normalize to an array.
export function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

export function parseHistory(json: Json): PricePoint[] {
  const hist = json.history as { day?: unknown } | null | undefined
  const days = asArray(hist?.day as Json | Json[] | undefined)
  return days
    .filter((d) => d && typeof d.close === 'number')
    .map((d) => ({
      date: String(d.date),
      open: +(d.open as number),
      high: +(d.high as number),
      low: +(d.low as number),
      close: +(d.close as number),
      volume: +((d.volume as number) ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function parseExpirations(json: Json): string[] {
  const exp = json.expirations as { date?: unknown } | null | undefined
  return asArray(exp?.date as string | string[] | undefined).map(String)
}

export function parseChain(json: Json): OptionContract[] {
  const opts = json.options as { option?: unknown } | null | undefined
  const list = asArray(opts?.option as Json | Json[] | undefined)
  const out: OptionContract[] = []
  for (const o of list) {
    const type = o.option_type === 'put' ? 'put' : o.option_type === 'call' ? 'call' : null
    if (!type) continue
    const g = (o.greeks ?? {}) as Record<string, number | string | null>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    const bid = num(o.bid)
    const ask = num(o.ask)
    const last = num(o.last)
    const iv = num(g.mid_iv) || num(g.smv_vol) || (num(g.bid_iv) && num(g.ask_iv) ? (num(g.bid_iv) + num(g.ask_iv)) / 2 : 0)
    out.push({
      symbol: String(o.symbol),
      type,
      strike: num(o.strike),
      expiry: String(o.expiration_date),
      bid,
      ask,
      last,
      mark: bid > 0 && ask > 0 ? (bid + ask) / 2 : last,
      volume: num(o.volume),
      openInterest: num(o.open_interest),
      iv,
      delta: num(g.delta),
      gamma: num(g.gamma) || undefined,
      theta: num(g.theta) || undefined,
      vega: num(g.vega) || undefined,
    })
  }
  return out
}

export function parseQuote(json: Json): Json | null {
  const q = json.quotes as { quote?: unknown } | null | undefined
  const list = asArray(q?.quote as Json | Json[] | undefined)
  return list[0] ?? null
}

// Beta fundamentals endpoints return [{ request, type, results: [{ tables: {...} }] }].
function tablesFrom(json: unknown): Json[] {
  const out: Json[] = []
  for (const item of asArray(json as Json | Json[])) {
    for (const r of asArray(item?.results as Json | Json[] | undefined)) {
      const t = r?.tables
      if (t && typeof t === 'object') out.push(t as Json)
    }
  }
  return out
}

export function parseNextEarnings(json: unknown, today = new Date()): string | null {
  const todayISO = today.toISOString().slice(0, 10)
  const dates: string[] = []
  for (const t of tablesFrom(json)) {
    for (const ev of asArray(t.corporate_calendars as Json | Json[] | undefined)) {
      const label = String(ev.event ?? '')
      const date = String(ev.begin_date_time ?? '').slice(0, 10)
      if (/earnings/i.test(label) && date >= todayISO) dates.push(date)
    }
  }
  return dates.sort()[0] ?? null
}

export function parseNextExDividend(json: unknown, today = new Date()): string | null {
  const todayISO = today.toISOString().slice(0, 10)
  const dates: string[] = []
  for (const t of tablesFrom(json)) {
    for (const d of asArray(t.cash_dividends as Json | Json[] | undefined)) {
      const date = String(d.ex_date ?? '').slice(0, 10)
      if (date >= todayISO) dates.push(date)
    }
  }
  return dates.sort()[0] ?? null
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

export function tradierProvider(token: string, env: 'sandbox' | 'production'): DataProvider {
  const host = HOSTS[env]

  async function get(path: string, params: Record<string, string>, ttl: number, attempt = 0): Promise<Json> {
    const key = `tradier:${env}:${path}:${Object.values(params).join(':')}`
    const cached = cacheGet<Json>(key, ttl)
    if (cached) return cached
    if (!token) throw new ProviderError('No Tradier access token set.', 'Create a free developer account at developer.tradier.com, copy the sandbox token, and paste it in Settings.')
    const res = await fetch(`${host}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (res.status === 401) throw new ProviderError('Tradier rejected the access token.', 'Sandbox tokens can expire. Generate a new one in the Tradier developer dashboard and paste it in Settings.')
    if (res.status === 429) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1))
        return get(path, params, ttl, attempt + 1)
      }
      throw new ProviderError('Tradier rate limit reached.', 'Wait a minute and try again. Scans load fewer expiries to stay under the limit.')
    }
    if (!res.ok) throw new ProviderError(`Tradier returned HTTP ${res.status}.`)
    const text = await res.text()
    let json: Json
    try {
      json = JSON.parse(text) as Json
    } catch {
      throw new ProviderError('Tradier returned a non-JSON response.', 'If this is a production token, confirm your brokerage account has market data enabled.')
    }
    cacheSet(key, json)
    return json
  }

  async function optional(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      return await fn()
    } catch {
      return null
    }
  }

  return {
    id: 'tradier',
    label: env === 'sandbox' ? 'Tradier sandbox' : 'Tradier',
    async fetchSnapshot(symbolRaw, opts: FetchOptions = {}) {
      const symbol = symbolRaw.toUpperCase()
      const today = new Date()
      const start = new Date(today)
      start.setDate(start.getDate() - 420)
      const iso = (d: Date) => d.toISOString().slice(0, 10)

      const [quoteJson, histJson, expJson] = await Promise.all([
        get('/v1/markets/quotes', { symbols: symbol, greeks: 'false' }, TTL),
        get('/v1/markets/history', { symbol, interval: 'daily', start: iso(start), end: iso(today), session_filter: 'all' }, TTL_SLOW),
        get('/v1/markets/options/expirations', { symbol, includeAllRoots: 'true', strikes: 'false' }, TTL_SLOW),
      ])
      const quote = parseQuote(quoteJson)
      if (!quote || quote.type === undefined) throw new ProviderError(`Tradier has no quote for ${symbol}.`, 'Check the ticker symbol.')
      let history = parseHistory(histJson)
      if (history.length < 60) throw new ProviderError(`Not enough price history for ${symbol}.`)
      // Append today's delayed quote as the live bar when history ends earlier.
      const lastQuote = typeof quote.last === 'number' ? (quote.last as number) : null
      const lastHist = history[history.length - 1]
      if (lastQuote && lastHist.date < iso(today) && typeof quote.trade_date === 'number') {
        const tradeDay = new Date(quote.trade_date as number).toISOString().slice(0, 10)
        if (tradeDay > lastHist.date) {
          history = [
            ...history,
            {
              date: tradeDay,
              open: typeof quote.open === 'number' && (quote.open as number) > 0 ? (quote.open as number) : lastQuote,
              high: typeof quote.high === 'number' && (quote.high as number) > 0 ? (quote.high as number) : lastQuote,
              low: typeof quote.low === 'number' && (quote.low as number) > 0 ? (quote.low as number) : lastQuote,
              close: lastQuote,
              volume: typeof quote.volume === 'number' ? (quote.volume as number) : 0,
            },
          ]
        }
      }

      const maxDte = opts.maxDte ?? 120
      const expiries = parseExpirations(expJson).filter((e) => {
        const dte = (new Date(e + 'T16:00:00').getTime() - today.getTime()) / 86400000
        return dte > 0 && dte <= maxDte
      })
      if (!expiries.length) throw new ProviderError(`No listed options for ${symbol} inside ${maxDte} days.`)

      // Fetch chains with limited concurrency to respect per-minute limits.
      const chain: OptionContract[] = []
      const queue = expiries.slice()
      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const exp = queue.shift()!
          const j = await get('/v1/markets/options/chains', { symbol, expiration: exp, greeks: 'true' }, TTL)
          chain.push(...parseChain(j))
        }
      })
      await Promise.all(workers)
      if (!chain.length) throw new ProviderError(`Tradier returned an empty options chain for ${symbol}.`)

      const [calJson, divJson] = await Promise.all([
        optional(() => get('/beta/markets/fundamentals/calendars', { symbols: symbol }, TTL_SLOW)),
        optional(() => get('/beta/markets/fundamentals/dividends', { symbols: symbol }, TTL_SLOW)),
      ])

      const info: CompanyInfo = {
        name: String(quote.description ?? symbol),
        week52High: typeof quote.week_52_high === 'number' && (quote.week_52_high as number) > 0 ? (quote.week_52_high as number) : undefined,
        week52Low: typeof quote.week_52_low === 'number' && (quote.week_52_low as number) > 0 ? (quote.week_52_low as number) : undefined,
        nextEarningsDate: calJson ? parseNextEarnings(calJson, today) : null,
        exDividendDate: divJson ? parseNextExDividend(divJson, today) : null,
      }
      const notes = [
        env === 'sandbox' ? 'Tradier sandbox: quotes and chains are delayed 15 minutes.' : 'Tradier live data.',
        'Greeks and IV are provider-supplied (ORATS).',
        !calJson ? 'Earnings calendar unavailable on this token; confirm the date yourself.' : '',
      ].filter(Boolean)
      return {
        symbol,
        asOf: history[history.length - 1].date,
        source: 'tradier',
        history: history.slice(-400),
        chain,
        info,
        note: notes.join(' '),
      }
    },
    async testConnection() {
      const j = await get('/v1/markets/quotes', { symbols: 'SPY', greeks: 'false' }, 60 * 1000)
      const q = parseQuote(j)
      if (!q || typeof q.last !== 'number') throw new ProviderError('Connected, but no quote came back.', 'If this is a production token, confirm market data is enabled on the account.')
      return `Connected to Tradier ${env}. SPY last ${(q.last as number).toFixed(2)}.`
    },
  }
}
