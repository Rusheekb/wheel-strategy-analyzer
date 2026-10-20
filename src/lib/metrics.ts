import { daysBetween } from './bs'
import { bollinger, closes, lastFinite, percentileOf, rankWithin, realizedVol, rollingRealizedVol, rsi, sma } from './stats'
import type { OptionContract, OptionType, TickerSnapshot } from './types'

export interface ExpiryInfo {
  expiry: string
  dte: number
  atmIv: number
  expectedMove: number // 1-sigma dollar move to expiry
  puts: OptionContract[]
  calls: OptionContract[]
}

export interface TickerMetrics {
  symbol: string
  asOf: string
  price: number
  change1d: number // decimal
  hv20: number
  hv30: number
  hv1y: number
  hvSeries20: number[]
  atmIv: number // ~30 DTE ATM IV
  ivHvRatio: number
  ivRank: number // 0-100 volatility-regime rank: current 20d realized vol within its trailing-year range (IV-rank proxy)
  ivPercentile: number // 0-100 share of trailing-year 20d-vol readings below the current reading
  rsi14: number
  sma20: number
  sma50: number
  sma200: number
  pctFromSma50: number
  pctFromSma200: number
  bollingerB: number // 0 = lower band, 1 = upper band
  pctFrom20dHigh: number
  pctFrom20dLow: number
  pos52w: number // 0-1
  ret5d: number
  ret20d: number
  earningsDays: number | null
  exDivDays: number | null
  medianSpreadPct: number
  totalOpenInterest: number
  expiries: ExpiryInfo[]
  trend: 'uptrend' | 'downtrend' | 'range'
}

export function midPrice(c: OptionContract): number {
  if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2
  return c.mark || c.last || 0
}

export function spreadPct(c: OptionContract): number {
  const mid = midPrice(c)
  if (mid <= 0 || c.ask <= 0 || c.bid < 0) return NaN
  return (c.ask - c.bid) / mid
}

function nearest<T>(items: T[], target: number, key: (t: T) => number): T | undefined {
  let best: T | undefined
  let bestD = Infinity
  for (const it of items) {
    const d = Math.abs(key(it) - target)
    if (d < bestD) {
      bestD = d
      best = it
    }
  }
  return best
}

export function buildExpiries(snapshot: TickerSnapshot, today: Date, price: number): ExpiryInfo[] {
  const byExpiry = new Map<string, OptionContract[]>()
  for (const c of snapshot.chain) {
    if (!byExpiry.has(c.expiry)) byExpiry.set(c.expiry, [])
    byExpiry.get(c.expiry)!.push(c)
  }
  const out: ExpiryInfo[] = []
  for (const [expiry, contracts] of byExpiry) {
    const dte = daysBetween(today, new Date(expiry + 'T16:00:00'))
    if (dte <= 0) continue
    const puts = contracts.filter((c) => c.type === 'put').sort((a, b) => a.strike - b.strike)
    const calls = contracts.filter((c) => c.type === 'call').sort((a, b) => a.strike - b.strike)
    const atmPut = nearest(puts.filter((c) => c.iv > 0), price, (c) => c.strike)
    const atmCall = nearest(calls.filter((c) => c.iv > 0), price, (c) => c.strike)
    const ivs = [atmPut?.iv, atmCall?.iv].filter((x): x is number => Number.isFinite(x) && (x as number) > 0)
    const atmIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : NaN
    out.push({ expiry, dte, atmIv, expectedMove: price * atmIv * Math.sqrt(dte / 365), puts, calls })
  }
  return out.sort((a, b) => a.dte - b.dte)
}

export function pickTargetExpiry(expiries: ExpiryInfo[], dteMin: number, dteMax: number): ExpiryInfo | undefined {
  const inRange = expiries.filter((e) => e.dte >= dteMin && e.dte <= dteMax)
  const target = (dteMin + dteMax) / 2
  return nearest(inRange.length ? inRange : expiries, target, (e) => e.dte)
}

export function computeMetrics(snapshot: TickerSnapshot, today = new Date()): TickerMetrics {
  const hist = snapshot.history
  const cl = closes(hist)
  const price = cl[cl.length - 1]
  const prev = cl[cl.length - 2] ?? price
  const hvSeries20 = rollingRealizedVol(cl, 20)
  const yearHv = hvSeries20.slice(-252)
  const expiries = buildExpiries(snapshot, today, price)
  const near30 = nearest(expiries.filter((e) => Number.isFinite(e.atmIv)), 30, (e) => e.dte)
  const atmIv = near30?.atmIv ?? NaN
  const hv20 = realizedVol(cl, 20)
  const s20 = lastFinite(sma(cl, 20))
  const s50 = lastFinite(sma(cl, 50))
  const s200 = lastFinite(sma(cl, 200))
  const bb = bollinger(cl, 20, 2)
  const bU = lastFinite(bb.upper)
  const bL = lastFinite(bb.lower)
  const last20 = hist.slice(-20)
  const hi20 = Math.max(...last20.map((p) => p.high))
  const lo20 = Math.min(...last20.map((p) => p.low))
  const year = hist.slice(-252)
  const hi52 = snapshot.info.week52High ?? Math.max(...year.map((p) => p.high))
  const lo52 = snapshot.info.week52Low ?? Math.min(...year.map((p) => p.low))

  const nearAtm = snapshot.chain.filter((c) => Math.abs(c.strike - price) / price < 0.08 && near30 && c.expiry === near30.expiry)
  const spreads = nearAtm.map(spreadPct).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  const medianSpreadPct = spreads.length ? spreads[Math.floor(spreads.length / 2)] : NaN

  const daysTo = (iso: string | null | undefined) => {
    if (!iso) return null
    const d = daysBetween(today, new Date(iso + 'T00:00:00'))
    return d < 0 ? null : d
  }

  const trend: TickerMetrics['trend'] =
    price > s50 && s50 > s200 ? 'uptrend' : price < s50 && s50 < s200 ? 'downtrend' : 'range'

  return {
    symbol: snapshot.symbol,
    asOf: snapshot.asOf,
    price,
    change1d: price / prev - 1,
    hv20,
    hv30: realizedVol(cl, 30),
    hv1y: realizedVol(cl, Math.min(252, cl.length - 1)),
    hvSeries20,
    atmIv,
    ivHvRatio: atmIv / hv20,
    ivRank: rankWithin(hv20, yearHv),
    ivPercentile: percentileOf(hv20, yearHv),
    rsi14: lastFinite(rsi(cl, 14)),
    sma20: s20,
    sma50: s50,
    sma200: s200,
    pctFromSma50: price / s50 - 1,
    pctFromSma200: price / s200 - 1,
    bollingerB: (price - bL) / (bU - bL),
    pctFrom20dHigh: price / hi20 - 1,
    pctFrom20dLow: price / lo20 - 1,
    pos52w: (price - lo52) / (hi52 - lo52),
    ret5d: price / cl[cl.length - 6] - 1,
    ret20d: price / cl[cl.length - 21] - 1,
    earningsDays: daysTo(snapshot.info.nextEarningsDate),
    exDivDays: daysTo(snapshot.info.exDividendDate),
    medianSpreadPct,
    totalOpenInterest: snapshot.chain.reduce((a, c) => a + (Number.isFinite(c.openInterest) ? c.openInterest : 0), 0),
    expiries,
    trend,
  }
}

export function contractsFor(exp: ExpiryInfo, side: OptionType): OptionContract[] {
  return side === 'put' ? exp.puts : exp.calls
}
