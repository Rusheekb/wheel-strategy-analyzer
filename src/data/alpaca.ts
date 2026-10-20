// Alpaca Market Data client for a free Basic account (paper trading only,
// email signup). Stock bars come from the IEX feed, option chains from the
// free "indicative" feed, which carries model-derived quotes, implied
// volatility and greeks. Open interest comes from the Trading API contract
// list and is typically a couple of days old.
import { cacheGet, cacheSet } from '../lib/storage'
import type { CompanyInfo, OptionContract, OptionType, PricePoint } from '../lib/types'
import { ProviderError, type DataProvider, type FetchOptions } from './provider'

const DATA = 'https://data.alpaca.markets'
const PAPER = 'https://paper-api.alpaca.markets'
const TTL = 15 * 60 * 1000
const TTL_SLOW = 12 * 60 * 60 * 1000

type Json = Record<string, unknown>
const iso = (d: Date) => d.toISOString().slice(0, 10)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

// OCC symbol: ROOT + YYMMDD + C|P + strike*1000 as 8 digits.
export function parseOcc(symbol: string): { root: string; expiry: string; type: OptionType; strike: number } | null {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(symbol)
  if (!m) return null
  return { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === 'P' ? 'put' : 'call', strike: parseInt(m[6], 10) / 1000 }
}

export function parseBars(json: Json): PricePoint[] {
  const bars = (json.bars as Json[] | undefined) ?? []
  return bars
    .filter((b) => Number.isFinite(num(b.c)) && typeof b.t === 'string')
    .map((b) => ({
      date: (b.t as string).slice(0, 10),
      open: Number.isFinite(num(b.o)) ? (b.o as number) : (b.c as number),
      high: Number.isFinite(num(b.h)) ? (b.h as number) : (b.c as number),
      low: Number.isFinite(num(b.l)) ? (b.l as number) : (b.c as number),
      close: b.c as number,
      volume: Number.isFinite(num(b.v)) ? (b.v as number) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface ChainParse {
  contracts: OptionContract[]
  withGreeks: number
  withIv: number
  withQuote: number
}

export function parseChain(json: Json): ChainParse {
  const snaps = (json.snapshots as Record<string, Json> | undefined) ?? {}
  const contracts: OptionContract[] = []
  let withGreeks = 0
  let withIv = 0
  let withQuote = 0
  for (const [symbol, s] of Object.entries(snaps)) {
    const occ = parseOcc(symbol)
    if (!occ) continue
    const q = (s.latestQuote ?? {}) as Json
    const tr = (s.latestTrade ?? {}) as Json
    const day = (s.dailyBar ?? {}) as Json
    const g = (s.greeks ?? null) as Json | null
    const bid = Number.isFinite(num(q.bp)) ? (q.bp as number) : 0
    const ask = Number.isFinite(num(q.ap)) ? (q.ap as number) : 0
    const last = Number.isFinite(num(tr.p)) ? (tr.p as number) : Number.isFinite(num(day.c)) ? (day.c as number) : 0
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : last
    if (!(mark > 0)) continue
    const iv = num(s.impliedVolatility)
    const delta = g ? num(g.delta) : NaN
    if (g && Number.isFinite(delta)) withGreeks += 1
    if (Number.isFinite(iv) && iv > 0) withIv += 1
    if (bid > 0 && ask > 0) withQuote += 1
    contracts.push({
      symbol,
      type: occ.type,
      strike: occ.strike,
      expiry: occ.expiry,
      bid,
      ask,
      last,
      mark,
      volume: Number.isFinite(num(day.v)) ? (day.v as number) : 0,
      openInterest: NaN,
      iv: Number.isFinite(iv) && iv > 0 ? iv : 0,
      delta: Number.isFinite(delta) ? delta : 0,
      gamma: g && Number.isFinite(num(g.gamma)) ? (g.gamma as number) : undefined,
      theta: g && Number.isFinite(num(g.theta)) ? (g.theta as number) : undefined,
      vega: g && Number.isFinite(num(g.vega)) ? (g.vega as number) : undefined,
    })
  }
  return { contracts, withGreeks, withIv, withQuote }
}

export function parseOpenInterest(json: Json): Map<string, { oi: number; date: string | null }> {
  const list = (json.option_contracts as Json[] | undefined) ?? []
  const out = new Map<string, { oi: number; date: string | null }>()
  for (const c of list) {
    const sym = String(c.symbol ?? '')
    const oi = typeof c.open_interest === 'string' ? parseFloat(c.open_interest) : num(c.open_interest)
    if (sym && Number.isFinite(oi)) out.set(sym, { oi, date: typeof c.open_interest_date === 'string' ? c.open_interest_date : null })
  }
  return out
}

export function parseNextExDividend(json: Json, todayISO: string): string | null {
  const ca = (json.corporate_actions ?? {}) as Json
  const divs = (ca.cash_dividends as Json[] | undefined) ?? []
  const dates = divs.map((d) => String(d.ex_date ?? '')).filter((d) => d >= todayISO).sort()
  return dates[0] ?? null
}

export function alpacaProvider(keyId: string, secret: string): DataProvider {
  const headers = { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json' }

  async function get(base: string, path: string, params: Record<string, string>, ttl: number): Promise<Json> {
    const url = `${base}${path}?${new URLSearchParams(params)}`
    const key = `alpaca:${url}`
    const cached = cacheGet<Json>(key, ttl)
    if (cached) return cached
    if (!keyId || !secret) throw new ProviderError('No Alpaca API keys set.', 'Create a free paper-trading account at alpaca.markets, generate paper API keys, and paste both values in Settings.')
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch (e) {
      throw new ProviderError('The browser could not reach Alpaca.', `This is usually a network problem or a cross-origin (CORS) block. Original error: ${(e as Error).message}`)
    }
    if (res.status === 401 || res.status === 403) {
      let message = ''
      try {
        message = String(((await res.json()) as Json).message ?? '')
      } catch {
        /* ignore */
      }
      if (/opra/i.test(message)) throw new ProviderError('Alpaca asked for an OPRA agreement.', 'The app requests the free indicative feed, so this should not happen. Confirm the keys are paper keys from a Basic account.')
      if (res.status === 403 && /forbidden/i.test(message)) throw new ProviderError('Alpaca rejected the keys.', 'Paste the key ID in the first field and the secret in the second. Paper keys are generated on the paper-trading dashboard.')
      throw new ProviderError(`Alpaca returned ${res.status}${message ? `: ${message}` : ''}.`, 'Check both keys in Settings. Regenerating paper keys is free.')
    }
    if (res.status === 429) throw new ProviderError('Alpaca rate limit reached.', 'The free plan allows 200 requests a minute. Wait a moment and try again.')
    if (!res.ok) {
      let message = ''
      try {
        message = String(((await res.json()) as Json).message ?? '')
      } catch {
        /* ignore */
      }
      throw new ProviderError(`Alpaca returned HTTP ${res.status}${message ? `: ${message}` : ''}.`)
    }
    const json = (await res.json()) as Json
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

  async function loadChain(symbol: string, lo: number, hi: number, from: string, to: string, limit = 1000, maxPages = 6): Promise<ChainParse> {
    const acc: ChainParse = { contracts: [], withGreeks: 0, withIv: 0, withQuote: 0 }
    let token: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        feed: 'indicative',
        expiration_date_gte: from,
        expiration_date_lte: to,
        strike_price_gte: lo.toFixed(2),
        strike_price_lte: hi.toFixed(2),
        limit: String(limit),
      }
      if (token) params.page_token = token
      const json = await get(DATA, `/v1beta1/options/snapshots/${encodeURIComponent(symbol)}`, params, TTL)
      const part = parseChain(json)
      acc.contracts.push(...part.contracts)
      acc.withGreeks += part.withGreeks
      acc.withIv += part.withIv
      acc.withQuote += part.withQuote
      token = typeof json.next_page_token === 'string' && json.next_page_token ? json.next_page_token : undefined
      if (!token) break
    }
    return acc
  }

  return {
    id: 'alpaca',
    label: 'Alpaca',
    async fetchSnapshot(symbolRaw, opts: FetchOptions = {}) {
      const symbol = symbolRaw.toUpperCase()
      const today = new Date()
      const start = new Date(today)
      start.setDate(start.getDate() - 420)
      const progress = opts.onProgress

      progress?.('Loading price history')
      const [barsJson, snapJson] = await Promise.all([
        get(DATA, `/v2/stocks/${encodeURIComponent(symbol)}/bars`, { timeframe: '1Day', start: iso(start), end: iso(today), limit: '10000', adjustment: 'split', feed: 'iex', sort: 'asc' }, TTL_SLOW),
        optional(() => get(DATA, `/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, { feed: 'iex' }, TTL)),
      ])
      let history = parseBars(barsJson)
      if (history.length < 60) throw new ProviderError(`Not enough price history for ${symbol}.`, 'Check the ticker symbol. Alpaca covers US-listed stocks and ETFs.')
      // Fold in the latest IEX trade as today's bar when it is newer than the last daily bar.
      const latest = (snapJson?.latestTrade ?? null) as Json | null
      const dayBar = (snapJson?.dailyBar ?? null) as Json | null
      if (latest && typeof latest.t === 'string' && Number.isFinite(num(latest.p))) {
        const day = (latest.t as string).slice(0, 10)
        const last = history[history.length - 1]
        if (day > last.date) {
          const p = latest.p as number
          history = [
            ...history,
            {
              date: day,
              open: dayBar && Number.isFinite(num(dayBar.o)) ? (dayBar.o as number) : p,
              high: dayBar && Number.isFinite(num(dayBar.h)) ? (dayBar.h as number) : p,
              low: dayBar && Number.isFinite(num(dayBar.l)) ? (dayBar.l as number) : p,
              close: p,
              volume: dayBar && Number.isFinite(num(dayBar.v)) ? (dayBar.v as number) : 0,
            },
          ]
        }
      }
      const price = history[history.length - 1].close

      const maxDte = opts.maxDte ?? 120
      const to = new Date(today)
      to.setDate(to.getDate() + maxDte)
      const lo = price * 0.7
      const hi = price * 1.3
      progress?.('Loading option chain')
      const chain = await loadChain(symbol, lo, hi, iso(today), iso(to))
      if (!chain.contracts.length) throw new ProviderError(`Alpaca returned no priced option contracts for ${symbol}.`, 'The symbol may have no listed options, or the indicative feed has no quotes right now.')

      progress?.('Loading open interest')
      const oiJson = await optional(async () => {
        const merged = new Map<string, { oi: number; date: string | null }>()
        let token: string | undefined
        for (let page = 0; page < 4; page++) {
          const params: Record<string, string> = {
            underlying_symbols: symbol,
            expiration_date_gte: iso(today),
            expiration_date_lte: iso(to),
            strike_price_gte: lo.toFixed(2),
            strike_price_lte: hi.toFixed(2),
            status: 'active',
            limit: '10000',
          }
          if (token) params.page_token = token
          const j = await get(PAPER, '/v2/options/contracts', params, TTL_SLOW)
          for (const [k, v] of parseOpenInterest(j)) merged.set(k, v)
          token = typeof j.next_page_token === 'string' && j.next_page_token ? j.next_page_token : undefined
          if (!token) break
        }
        return merged
      })
      let oiDate: string | null = null
      if (oiJson) {
        for (const c of chain.contracts) {
          const hit = oiJson.get(c.symbol)
          if (hit) {
            c.openInterest = hit.oi
            if (hit.date && (!oiDate || hit.date > oiDate)) oiDate = hit.date
          }
        }
      }

      progress?.('Loading dividends')
      const end = new Date(today)
      end.setDate(end.getDate() + 120)
      const div = await optional(() => get(DATA, '/v1/corporate-actions', { symbols: symbol, types: 'cash_dividend', start: iso(today), end: iso(end), limit: '100' }, TTL_SLOW))

      const info: CompanyInfo = {
        name: symbol,
        exDividendDate: div ? parseNextExDividend(div, iso(today)) : null,
        nextEarningsDate: null,
      }
      const n = chain.contracts.length
      const notes = [
        'Alpaca indicative feed: quotes are model-derived rather than exchange NBBO, so use them for research and confirm fills with your broker.',
        chain.withGreeks < n * 0.5 ? 'Greeks were missing on most contracts, so delta is computed locally from implied volatility.' : '',
        !oiJson ? 'Open interest was unavailable.' : oiDate ? `Open interest as of ${oiDate}.` : '',
        'Alpaca has no earnings calendar; confirm the earnings date yourself.',
      ].filter(Boolean)
      return { symbol, asOf: history[history.length - 1].date, source: 'alpaca', history: history.slice(-400), chain: chain.contracts, info, note: notes.join(' ') }
    },
    async testConnection() {
      const snap = await get(DATA, '/v2/stocks/SPY/snapshot', { feed: 'iex' }, 60 * 1000)
      const p = num(((snap.latestTrade ?? {}) as Json).p)
      if (!Number.isFinite(p)) throw new ProviderError('Keys accepted, but no stock quote came back.')
      const today = new Date()
      const from = new Date(today)
      from.setDate(from.getDate() + 20)
      const to = new Date(today)
      to.setDate(to.getDate() + 60)
      const chain = await loadChain('SPY', p * 0.9, p * 1.1, iso(from), iso(to), 60, 1)
      const n = chain.contracts.length
      if (!n) throw new ProviderError(`Keys work (SPY ${p.toFixed(2)}), but the option chain came back empty.`, 'The indicative feed may be quiet outside market hours. Try again during the trading day.')
      const oi = await optional(() => get(PAPER, '/v2/options/contracts', { underlying_symbols: 'SPY', limit: '1' }, 60 * 1000))
      const pct = (x: number) => `${Math.round((x / n) * 100)}%`
      return `Connected. SPY ${p.toFixed(2)}. Chain: ${n} contracts, greeks on ${pct(chain.withGreeks)}, IV on ${pct(chain.withIv)}, bid-ask on ${pct(chain.withQuote)}. Open interest: ${oi ? 'available' : 'unavailable'}.`
    },
  }
}
