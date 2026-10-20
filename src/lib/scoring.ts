import { probTouch } from './bs'
import { midPrice, spreadPct, type ExpiryInfo, type TickerMetrics } from './metrics'
import { clamp, piecewise } from './stats'
import type { OptionContract, OptionType, Thresholds } from './types'

export type FactorStatus = 'good' | 'ok' | 'warn' | 'bad'

export interface Factor {
  key: string
  label: string
  points: number
  max: number
  value: string
  reason: string
  status: FactorStatus
}

export type Verdict = 'favorable' | 'acceptable' | 'wait'

export interface SideScore {
  side: OptionType
  score: number
  verdict: Verdict
  headline: string
  factors: Factor[]
  caps: string[] // hard gates that limited the verdict
}

export interface StrikeRow {
  contract: OptionContract
  strike: number
  mid: number
  bid: number
  ask: number
  spreadPct: number
  delta: number
  iv: number
  openInterest: number
  volume: number
  premiumYield: number // mid / collateral per share
  annualized: number
  breakeven: number
  cushion: number // distance from spot to breakeven (put) or to strike (call), decimal
  probOTM: number
  probTouch: number
  sigmas: number
  thetaDay: number
  collateral: number // per contract
  inBand: boolean
  belowBasis: boolean
  score: number
  flags: string[]
}

export interface StrikeAnalysis {
  side: OptionType
  expiry: ExpiryInfo
  rows: StrikeRow[]
  recommended?: StrikeRow
}

function statusFor(points: number, max: number): FactorStatus {
  const r = points / max
  if (r >= 0.8) return 'good'
  if (r >= 0.55) return 'ok'
  if (r >= 0.3) return 'warn'
  return 'bad'
}

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—')
const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—')

export function analyzeStrikes(
  side: OptionType,
  m: TickerMetrics,
  exp: ExpiryInfo,
  t: Thresholds,
  costBasis?: number,
): StrikeAnalysis {
  const contracts = side === 'put' ? exp.puts : exp.calls
  const T = exp.dte / 365
  const [dMin, dMax] = side === 'put' ? [t.putDeltaMin, t.putDeltaMax] : [t.callDeltaMin, t.callDeltaMax]
  const rows: StrikeRow[] = []
  for (const c of contracts) {
    const otm = side === 'put' ? c.strike < m.price : c.strike > m.price
    if (!otm) continue
    const mid = midPrice(c)
    if (!(mid > 0)) continue
    const absDelta = Math.abs(c.delta)
    const iv = c.iv > 0 ? c.iv : exp.atmIv
    const premiumYield = side === 'put' ? mid / c.strike : mid / m.price
    const annualized = premiumYield * (365 / exp.dte)
    const breakeven = side === 'put' ? c.strike - mid : c.strike + mid
    const cushion = side === 'put' ? (m.price - breakeven) / m.price : (c.strike - m.price) / m.price
    const sigmas = Math.abs(Math.log(c.strike / m.price)) / (iv * Math.sqrt(T))
    const sp = spreadPct(c)
    const inBand = absDelta >= dMin && absDelta <= dMax
    const belowBasis = side === 'call' && costBasis != null && costBasis > 0 && c.strike < costBasis
    const flags: string[] = []

    // Strike score: 0-100 ranking within the chain for this side.
    let score = 0
    score += piecewise(absDelta, [[dMin - 0.1, 0], [dMin, 22], [(dMin + dMax) / 2, 30], [dMax, 22], [dMax + 0.1, 0]])
    score += piecewise(annualized / t.minAnnualizedReturn, [[0.5, 0], [1, 18], [1.6, 28]])
    score += piecewise(sigmas, [[0.4, 0], [0.8, 10], [1, 16], [1.6, 18]])
    score += piecewise(sp, [[0.03, 14], [0.1, 8], [0.2, 2], [0.4, 0]])
    score += piecewise(c.openInterest, [[0, 0], [t.minOpenInterest, 7], [t.minOpenInterest * 5, 10]])
    if (belowBasis) {
      score *= 0.35
      flags.push('Strike below cost basis: assignment locks in a loss on shares')
    }
    if (!inBand) flags.push(absDelta < dMin ? 'Below delta band: thin premium' : 'Above delta band: elevated assignment odds')
    if (Number.isFinite(sp) && sp > t.maxSpreadPct) flags.push('Wide bid-ask spread')
    if (c.openInterest < t.minOpenInterest) flags.push('Low open interest')
    if (annualized < t.minAnnualizedReturn) flags.push('Annualized return below floor')

    rows.push({
      contract: c,
      strike: c.strike,
      mid,
      bid: c.bid,
      ask: c.ask,
      spreadPct: sp,
      delta: c.delta,
      iv,
      openInterest: c.openInterest,
      volume: c.volume,
      premiumYield,
      annualized,
      breakeven,
      cushion,
      probOTM: 1 - absDelta,
      probTouch: probTouch(m.price, c.strike, T, iv),
      sigmas,
      thetaDay: c.theta ?? NaN,
      collateral: side === 'put' ? c.strike * 100 : m.price * 100,
      inBand,
      belowBasis,
      score: clamp(score, 0, 100),
      flags,
    })
  }
  rows.sort((a, b) => (side === 'put' ? b.strike - a.strike : a.strike - b.strike))
  const candidates = rows.filter((r) => r.inBand && !r.belowBasis)
  const pool = candidates.length ? candidates : rows.filter((r) => !r.belowBasis)
  const recommended = pool.slice().sort((a, b) => b.score - a.score)[0]
  return { side, expiry: exp, rows, recommended }
}

export function scoreSide(
  side: OptionType,
  m: TickerMetrics,
  t: Thresholds,
  analysis: StrikeAnalysis | undefined,
  costBasis?: number,
): SideScore {
  const f: Factor[] = []
  const rec = analysis?.recommended
  const dte = analysis?.expiry.dte ?? (t.dteMin + t.dteMax) / 2

  // 1. Premium richness: IV rank proxy (20)
  {
    const max = 20
    const pts = piecewise(m.ivRank, [[0, 0], [t.minIvRank, 9], [50, 15], [70, 20]])
    f.push({
      key: 'ivrank',
      label: 'Vol rank',
      points: pts,
      max,
      value: num(m.ivRank, 0),
      reason:
        m.ivRank >= 50
          ? 'Volatility sits in the upper half of its trailing-year range. Premium is rich relative to normal.'
          : m.ivRank >= t.minIvRank
            ? 'Volatility is mid-range. Premium is fair, not generous.'
            : 'Volatility is near the bottom of its range. You are selling cheap premium.',
      status: statusFor(pts, max),
    })
  }

  // 2. Volatility risk premium: IV vs 20d realized (15)
  {
    const max = 15
    const pts = piecewise(m.ivHvRatio, [[0.8, 0], [1, 6], [1.2, 11], [1.5, 15]])
    f.push({
      key: 'vrp',
      label: 'IV / realized vol',
      points: pts,
      max,
      value: `${num(m.ivHvRatio, 2)}×`,
      reason:
        m.ivHvRatio >= 1.2
          ? 'Options price in more movement than the stock has delivered. That gap is your edge.'
          : m.ivHvRatio >= 1
            ? 'Implied roughly matches realized. Edge is modest.'
            : 'The stock is moving more than options imply. Premium does not cover the risk.',
      status: statusFor(pts, max),
    })
  }

  // 3. Entry timing: RSI (12) + trend structure (8)
  {
    const max = 12
    const pts =
      side === 'put'
        ? piecewise(m.rsi14, [[15, 3], [25, 6], [32, 11], [40, 12], [52, 12], [62, 8], [70, 4], [80, 1]])
        : piecewise(m.rsi14, [[20, 1], [35, 3], [48, 7], [58, 11], [70, 12], [78, 9], [88, 4]])
    const reason =
      side === 'put'
        ? m.rsi14 < 28
          ? 'Oversold, but momentum is still pointing down. Selling into a falling knife is the classic wheel mistake. Wait for a stabilizing day.'
          : m.rsi14 <= 52
            ? 'Pullback without panic. This is the zone where selling puts pays best.'
            : m.rsi14 <= 65
              ? 'Momentum is neutral to firm. Puts are fine but offer less cushion.'
              : 'Stock is extended. A put sold here has little margin for a reversal.'
        : m.rsi14 >= 58 && m.rsi14 <= 75
          ? 'Momentum is strong but not parabolic. Good window to sell upside.'
          : m.rsi14 > 75
            ? 'Overbought. Calls sell well, but expect a sharp move either way.'
            : 'Momentum is soft. Calls pay less and you risk capping a rebound.'
    f.push({ key: 'rsi', label: 'RSI (14)', points: pts, max, value: num(m.rsi14, 0), reason, status: statusFor(pts, max) })
  }
  {
    const max = 8
    let pts: number
    let reason: string
    if (side === 'put') {
      pts = m.trend === 'uptrend' ? 8 : m.trend === 'range' ? 5 : 1.5
      if (m.trend !== 'downtrend' && m.pctFromSma50 < -0.08) pts = Math.max(pts - 2, 1)
      reason =
        m.trend === 'uptrend'
          ? 'Price is above the 50 and 200-day averages. Dips are being bought.'
          : m.trend === 'range'
            ? 'Mixed trend. Lean on support levels rather than the trend.'
            : 'Price is below both major averages. Assignment risk is structural, not just a dip.'
    } else {
      pts = m.pctFromSma50 > 0.08 ? 8 : m.pctFromSma50 > 0 ? 6 : m.trend === 'downtrend' ? 5 : 3
      reason =
        m.pctFromSma50 > 0.08
          ? 'Price is stretched above its 50-day average. Upside strikes carry more premium and more cushion.'
          : m.pctFromSma50 > 0
            ? 'Price is above its 50-day average. Reasonable spot for a call.'
            : 'Price is below its 50-day average. A call here caps the rebound you are waiting for.'
    }
    f.push({
      key: 'trend',
      label: 'Trend structure',
      points: pts,
      max,
      value: `${pct(m.pctFromSma50)} vs 50d`,
      reason,
      status: statusFor(pts, max),
    })
  }

  // 4. Event risk: earnings inside the holding window (12) + ex-dividend for calls (3)
  {
    const max = 12
    const ed = m.earningsDays
    const inside = ed != null && ed <= dte
    const pts = ed == null ? 9 : inside ? (t.avoidEarnings ? 1 : 6) : ed <= dte + 7 ? 8 : 12
    f.push({
      key: 'earnings',
      label: 'Earnings window',
      points: pts,
      max,
      value: ed == null ? 'unknown' : `${ed}d`,
      reason:
        ed == null
          ? 'No earnings date on file. Confirm before trading.'
          : inside
            ? `Earnings land in ${ed} days, inside this expiry. IV will collapse after, but the gap risk is yours.`
            : ed <= dte + 7
              ? 'Earnings fall just after expiry. Pre-earnings IV inflation helps you, with no event risk.'
              : 'No earnings before expiry. Clean window.',
      status: statusFor(pts, max),
    })
  }
  {
    const max = 3
    const xd = m.exDivDays
    let pts = 3
    let reason = 'No ex-dividend date inside the window.'
    if (xd != null && xd <= dte) {
      if (side === 'call') {
        pts = 1
        reason = `Ex-dividend in ${xd} days. An in-the-money call risks early assignment and losing the dividend.`
      } else {
        pts = 3
        reason = `Ex-dividend in ${xd} days. The expected price drop is already in put pricing.`
      }
    }
    f.push({ key: 'exdiv', label: 'Ex-dividend', points: pts, max, value: xd == null ? '—' : `${xd}d`, reason, status: statusFor(pts, max) })
  }

  // 5. Return on capital at the recommended strike (15)
  {
    const max = 15
    const ann = rec?.annualized ?? NaN
    const pts = piecewise(ann / t.minAnnualizedReturn, [[0.5, 0], [1, 9], [1.5, 15]])
    f.push({
      key: 'return',
      label: 'Annualized return',
      points: pts,
      max,
      value: pct(ann, 0),
      reason: !rec
        ? 'No strike inside your delta band for this expiry.'
        : ann >= t.minAnnualizedReturn
          ? `The ${rec.strike} strike pays ${pct(ann, 0)} annualized against a ${pct(t.minAnnualizedReturn, 0)} floor.`
          : `Best in-band strike pays ${pct(ann, 0)} annualized, under your ${pct(t.minAnnualizedReturn, 0)} floor. Premium is too thin for the risk.`,
      status: statusFor(pts, max),
    })
  }

  // 6. Liquidity (10)
  {
    const max = 10
    const sp = rec?.spreadPct ?? m.medianSpreadPct
    const oi = rec?.openInterest ?? NaN
    let pts = piecewise(sp, [[0.03, 10], [t.maxSpreadPct, 6], [0.25, 1], [0.5, 0]])
    if (Number.isFinite(oi) && oi < t.minOpenInterest) pts = Math.min(pts, 4)
    f.push({
      key: 'liquidity',
      label: 'Liquidity',
      points: pts,
      max,
      value: `${pct(sp, 0)} spread`,
      reason:
        pts >= 8
          ? 'Tight spreads and healthy open interest. Entry and any roll will fill near mid.'
          : pts >= 5
            ? 'Workable liquidity. Use limit orders at or above mid.'
            : 'Thin market. Spreads will eat a meaningful share of the premium on entry and on rolls.',
      status: statusFor(pts, max),
    })
  }

  // 7. Position sizing (5)
  {
    const max = 5
    const collateral = rec?.collateral ?? m.price * 100
    const share = collateral / t.accountSize
    const pts = piecewise(share / t.maxPositionPct, [[0.5, 5], [1, 4], [1.5, 2], [2.5, 0]])
    f.push({
      key: 'sizing',
      label: 'Position size',
      points: pts,
      max,
      value: pct(share, 1),
      reason:
        share <= t.maxPositionPct
          ? `One contract ties up ${pct(share)} of the account, inside your ${pct(t.maxPositionPct, 0)} cap.`
          : `One contract is ${pct(share)} of the account, above your ${pct(t.maxPositionPct, 0)} cap. Consider a smaller underlying.`,
      status: statusFor(pts, max),
    })
  }

  // Hard gates: a strong score elsewhere cannot paper over these.
  const caps: string[] = []
  let cap = 100
  if (t.avoidEarnings && m.earningsDays != null && m.earningsDays <= dte) {
    cap = Math.min(cap, 64)
    caps.push('Earnings report falls inside this expiry')
  }
  if (rec && rec.annualized < t.minAnnualizedReturn) {
    cap = Math.min(cap, 60)
    caps.push('Best in-band strike pays under your annualized return floor')
  }
  if (!rec) {
    cap = Math.min(cap, 50)
    caps.push('No strike inside your delta band for this expiry')
  }
  if (side === 'put' && m.trend === 'downtrend' && (m.rsi14 < 35 || m.ret5d < -0.05)) {
    cap = Math.min(cap, 60)
    caps.push('Downtrend with fresh selling pressure (falling knife)')
  }
  if (side === 'call' && costBasis != null && costBasis > 0 && rec && rec.strike < costBasis) {
    cap = Math.min(cap, 45)
    caps.push('Recommended strike is below your cost basis')
  }

  const total = Math.min(cap, clamp(f.reduce((a, x) => a + x.points, 0), 0, 100))
  const verdict: Verdict = total >= 72 ? 'favorable' : total >= 55 ? 'acceptable' : 'wait'
  const headline =
    side === 'put'
      ? verdict === 'favorable'
        ? 'Good time to sell a put'
        : verdict === 'acceptable'
          ? 'Puts are sellable with conditions'
          : 'Wait on puts'
      : verdict === 'favorable'
        ? 'Good time to sell a call'
        : verdict === 'acceptable'
          ? 'Calls are sellable with conditions'
          : 'Hold off on calls'
  return { side, score: Math.round(total), verdict, headline, factors: f, caps }
}

export function verdictLabel(v: Verdict) {
  return v === 'favorable' ? 'Favorable' : v === 'acceptable' ? 'Acceptable' : 'Wait'
}
