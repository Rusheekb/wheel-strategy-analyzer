// Synthetic market data so the app is fully usable without an API key.
// Prices follow a seeded random walk with a chosen regime; option chains are
// priced with Black-Scholes using a skewed, term-structured vol surface.
import { bsGreeks, bsPrice } from '../lib/bs'
import type { CompanyInfo, OptionContract, PricePoint, TickerSnapshot } from '../lib/types'
import type { DataProvider } from './provider'

interface Profile {
  name: string
  sector: string
  start: number
  drift: number // annual
  vol: number // annual realized
  ivPremium: number // multiplier IV vs realized
  skew: number // put-call skew strength
  earningsIn: number // days from today (negative: none soon)
  exDivIn: number | null
  dividendYield: number
  beta: number
  regime: 'uptrend' | 'pullback' | 'downtrend' | 'range' | 'spike'
  liquidity: number // 0.3 (thin) .. 1 (deep)
}

export const DEMO_PROFILES: Record<string, Profile> = {
  AAPL: { name: 'Apple Inc.', sector: 'Technology', start: 232, drift: 0.12, vol: 0.24, ivPremium: 1.18, skew: 0.9, earningsIn: 9, exDivIn: 24, dividendYield: 0.0045, beta: 1.2, regime: 'pullback', liquidity: 1 },
  MSFT: { name: 'Microsoft Corp.', sector: 'Technology', start: 418, drift: 0.14, vol: 0.21, ivPremium: 1.12, skew: 0.8, earningsIn: 38, exDivIn: 29, dividendYield: 0.0075, beta: 0.95, regime: 'uptrend', liquidity: 1 },
  AMD: { name: 'Advanced Micro Devices', sector: 'Semiconductors', start: 158, drift: 0.1, vol: 0.46, ivPremium: 1.1, skew: 1.1, earningsIn: 16, exDivIn: null, dividendYield: 0, beta: 1.7, regime: 'spike', liquidity: 0.95 },
  KO: { name: 'Coca-Cola Co.', sector: 'Consumer Staples', start: 64, drift: 0.05, vol: 0.14, ivPremium: 1.25, skew: 0.7, earningsIn: 52, exDivIn: 12, dividendYield: 0.03, beta: 0.55, regime: 'range', liquidity: 0.8 },
  SOFI: { name: 'SoFi Technologies', sector: 'Financials', start: 14.2, drift: 0.05, vol: 0.62, ivPremium: 1.05, skew: 1.2, earningsIn: 21, exDivIn: null, dividendYield: 0, beta: 2.1, regime: 'downtrend', liquidity: 0.7 },
  PLTR: { name: 'Palantir Technologies', sector: 'Software', start: 112, drift: 0.25, vol: 0.58, ivPremium: 1.15, skew: 1.0, earningsIn: 44, exDivIn: null, dividendYield: 0, beta: 2.4, regime: 'uptrend', liquidity: 0.9 },
  F: { name: 'Ford Motor Co.', sector: 'Autos', start: 11.1, drift: 0.02, vol: 0.3, ivPremium: 1.2, skew: 0.9, earningsIn: 6, exDivIn: 40, dividendYield: 0.054, beta: 1.4, regime: 'range', liquidity: 0.75 },
  XOM: { name: 'Exxon Mobil', sector: 'Energy', start: 118, drift: 0.06, vol: 0.22, ivPremium: 1.1, skew: 0.8, earningsIn: 60, exDivIn: 18, dividendYield: 0.033, beta: 0.85, regime: 'pullback', liquidity: 0.9 },
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function gaussian(rand: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

function tradingDays(end: Date, n: number): Date[] {
  const out: Date[] = []
  const d = new Date(end)
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.unshift(new Date(d))
    d.setDate(d.getDate() - 1)
  }
  return out
}

function genHistory(p: Profile, rand: () => number, today: Date): PricePoint[] {
  const n = 320
  const days = tradingDays(today, n)
  const dt = 1 / 252
  // Regime shaping over the final 60 sessions.
  const shape = (i: number): number => {
    const k = i - (n - 60)
    if (k < 0) return 0
    switch (p.regime) {
      case 'uptrend':
        return 0.9
      case 'downtrend':
        return -1.6
      case 'pullback':
        return k < 40 ? 0.8 : -2.4
      case 'spike':
        return k < 45 ? 0.6 : 4
      case 'range':
        return Math.sin(k / 6) * 1.2
    }
  }
  const out: PricePoint[] = []
  // Work backwards from target so the final price lands near `start`.
  let price = p.start * Math.exp(-p.drift * (n / 252) * 0.5)
  for (let i = 0; i < n; i++) {
    const z = gaussian(rand)
    const dailyVol = p.vol * Math.sqrt(dt) * (p.regime === 'spike' && i > n - 15 ? 1.6 : 1)
    const r = p.drift * dt + shape(i) * 0.0025 + dailyVol * z
    const open = price * (1 + 0.3 * dailyVol * gaussian(rand))
    price = price * Math.exp(r)
    const hi = Math.max(open, price) * (1 + Math.abs(gaussian(rand)) * dailyVol * 0.6)
    const lo = Math.min(open, price) * (1 - Math.abs(gaussian(rand)) * dailyVol * 0.6)
    out.push({
      date: iso(days[i]),
      open: +open.toFixed(2),
      high: +hi.toFixed(2),
      low: +lo.toFixed(2),
      close: +price.toFixed(2),
      volume: Math.round((2e7 + rand() * 4e7) * p.liquidity),
    })
  }
  // Rescale so the last close equals the profile's anchor price.
  const k = p.start / out[out.length - 1].close
  return out.map((pt) => ({ ...pt, open: +(pt.open * k).toFixed(2), high: +(pt.high * k).toFixed(2), low: +(pt.low * k).toFixed(2), close: +(pt.close * k).toFixed(2) }))
}

function nextFridays(today: Date): string[] {
  const out: string[] = []
  const d = new Date(today)
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  for (let w = 0; w < 10; w++) {
    out.push(iso(d))
    d.setDate(d.getDate() + 7)
  }
  // Two further monthlies (third Fridays).
  for (let mo = 3; mo <= 4; mo++) {
    const m = new Date(today.getFullYear(), today.getMonth() + mo, 1)
    const offset = (5 - m.getDay() + 7) % 7
    m.setDate(1 + offset + 14)
    out.push(iso(m))
  }
  return out
}

function strikeStep(price: number) {
  if (price < 25) return 0.5
  if (price < 100) return 1
  if (price < 250) return 2.5
  return 5
}

function genChain(sym: string, p: Profile, history: PricePoint[], rand: () => number, today: Date): OptionContract[] {
  const S = history[history.length - 1].close
  const r = 0.043
  const q = p.dividendYield
  const closes = history.slice(-21).map((h) => h.close)
  let sum = 0
  for (let i = 1; i < closes.length; i++) sum += Math.log(closes[i] / closes[i - 1]) ** 2
  const hv20 = Math.sqrt((sum / (closes.length - 1)) * 252)
  const baseIv = Math.max(hv20, p.vol * 0.85) * p.ivPremium
  const step = strikeStep(S)
  const out: OptionContract[] = []
  for (const expiry of nextFridays(today)) {
    const dte = Math.round((new Date(expiry + 'T16:00:00').getTime() - today.getTime()) / 86400000)
    if (dte <= 0) continue
    const T = dte / 365
    const earningsInside = p.earningsIn >= 0 && p.earningsIn <= dte
    // Term structure: short-dated IV elevated when earnings sit inside the expiry.
    const term = 1 + (earningsInside ? 0.18 * Math.sqrt(30 / Math.max(dte, 7)) : 0) - 0.04 * Math.log(Math.max(dte, 7) / 30)
    const lo = Math.floor((S * 0.75) / step) * step
    const hi = Math.ceil((S * 1.25) / step) * step
    for (let K = lo; K <= hi + 1e-9; K += step) {
      const strike = +K.toFixed(2)
      const moneyness = Math.log(strike / S) / (baseIv * Math.sqrt(T))
      for (const type of ['put', 'call'] as const) {
        // Smile with put skew.
        const skew = -0.09 * p.skew * moneyness + 0.03 * moneyness * moneyness
        const iv = Math.max(0.08, baseIv * term * (1 + skew))
        const inp = { S, K: strike, T, r, sigma: iv, q }
        const theo = bsPrice(type, inp)
        const g = bsGreeks(type, inp)
        const otmDist = Math.abs(moneyness)
        const relSpread = (0.012 + 0.03 * otmDist) / p.liquidity + (dte > 70 ? 0.01 : 0)
        const half = Math.max(0.01, theo * relSpread * 0.5 + 0.005)
        const bid = Math.max(0, +(theo - half).toFixed(2))
        const ask = +(theo + half).toFixed(2)
        if (ask < 0.02) continue
        const oiBase = 4000 * p.liquidity * Math.exp(-otmDist * 1.3) * (dte <= 45 ? 1 : 0.4)
        out.push({
          symbol: `${sym}${expiry.replace(/-/g, '').slice(2)}${type === 'put' ? 'P' : 'C'}${strike}`,
          type,
          strike,
          expiry,
          bid,
          ask,
          last: +((bid + ask) / 2).toFixed(2),
          mark: +((bid + ask) / 2).toFixed(2),
          volume: Math.round(oiBase * (0.05 + rand() * 0.3)),
          openInterest: Math.round(oiBase * (0.6 + rand() * 0.8)),
          iv: +iv.toFixed(4),
          delta: +g.delta.toFixed(4),
          gamma: +g.gamma.toFixed(5),
          theta: +g.theta.toFixed(4),
          vega: +g.vega.toFixed(4),
        })
      }
    }
  }
  return out
}

export function demoSnapshot(symbolRaw: string, today = new Date()): TickerSnapshot {
  const symbol = symbolRaw.toUpperCase()
  const profile: Profile = DEMO_PROFILES[symbol] ?? {
    name: `${symbol} (synthetic)`,
    sector: 'Unknown',
    start: 40 + (hash(symbol) % 200),
    drift: 0.06,
    vol: 0.2 + ((hash(symbol) >> 8) % 40) / 100,
    ivPremium: 1.1,
    skew: 0.9,
    earningsIn: 10 + ((hash(symbol) >> 4) % 70),
    exDivIn: null,
    dividendYield: 0,
    beta: 1,
    regime: (['uptrend', 'pullback', 'downtrend', 'range', 'spike'] as const)[hash(symbol) % 5],
    liquidity: 0.6,
  }
  const rand = seeded(hash(symbol) ^ 0x9e3779b9)
  const history = genHistory(profile, rand, today)
  const chain = genChain(symbol, profile, history, rand, today)
  const info: CompanyInfo = {
    name: profile.name,
    sector: profile.sector,
    beta: profile.beta,
    dividendYield: profile.dividendYield,
    exDividendDate: profile.exDivIn == null ? null : iso(addDays(today, profile.exDivIn)),
    nextEarningsDate: profile.earningsIn < 0 ? null : iso(addDays(today, profile.earningsIn)),
    week52High: Math.max(...history.slice(-252).map((h) => h.high)),
    week52Low: Math.min(...history.slice(-252).map((h) => h.low)),
  }
  return {
    symbol,
    asOf: iso(today),
    source: 'demo',
    history,
    chain,
    info,
    note: DEMO_PROFILES[symbol]
      ? 'Demo data: a synthetic series built to resemble this name. Add an API key in Settings for live quotes.'
      : 'Demo data: this symbol is not in the demo set, so a generic synthetic series is shown.',
  }
}

export const demoProvider: DataProvider = {
  id: 'demo',
  label: 'Demo data',
  async fetchSnapshot(symbol) {
    await new Promise((r) => setTimeout(r, 350))
    return demoSnapshot(symbol)
  },
}
