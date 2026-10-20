import type { PricePoint } from './types'

export function logReturns(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]))
  return out
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)
  return Math.sqrt(v)
}

// Annualized close-to-close realized volatility over the trailing `window` sessions.
export function realizedVol(closes: number[], window = 20): number {
  const rets = logReturns(closes.slice(-(window + 1)))
  return stdev(rets) * Math.sqrt(252)
}

// Rolling realized vol series aligned to closes (NaN until enough data).
export function rollingRealizedVol(closes: number[], window = 20): number[] {
  const out: number[] = new Array(closes.length).fill(NaN)
  for (let i = window; i < closes.length; i++) {
    out[i] = realizedVol(closes.slice(i - window, i + 1), window)
  }
  return out
}

export function sma(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    if (i >= window - 1) out[i] = sum / window
  }
  return out
}

export function ema(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  const k = 2 / (window + 1)
  let prev = NaN
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) continue
    if (i === window - 1) prev = values.slice(0, window).reduce((a, b) => a + b, 0) / window
    else prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// Wilder RSI.
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export function bollinger(closes: number[], window = 20, mult = 2) {
  const mid = sma(closes, window)
  const upper: number[] = new Array(closes.length).fill(NaN)
  const lower: number[] = new Array(closes.length).fill(NaN)
  for (let i = window - 1; i < closes.length; i++) {
    const sd = stdev(closes.slice(i - window + 1, i + 1))
    upper[i] = mid[i] + mult * sd
    lower[i] = mid[i] - mult * sd
  }
  return { mid, upper, lower }
}

// Position of `value` inside [min,max] of `series`, as 0-100.
export function rankWithin(value: number, series: number[]): number {
  const clean = series.filter((x) => Number.isFinite(x))
  if (!clean.length) return NaN
  const lo = Math.min(...clean)
  const hi = Math.max(...clean)
  if (hi === lo) return 50
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100))
}

// Share of series values below `value`, as 0-100.
export function percentileOf(value: number, series: number[]): number {
  const clean = series.filter((x) => Number.isFinite(x))
  if (!clean.length) return NaN
  const below = clean.filter((x) => x < value).length
  return (below / clean.length) * 100
}

export function last<T>(xs: T[]): T {
  return xs[xs.length - 1]
}

export function lastFinite(xs: number[]): number {
  for (let i = xs.length - 1; i >= 0; i--) if (Number.isFinite(xs[i])) return xs[i]
  return NaN
}

export function closes(history: PricePoint[]): number[] {
  return history.map((p) => p.close)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

// Linear interpolation of a score between breakpoints [[x,y],...] sorted by x.
export function piecewise(x: number, pts: Array<[number, number]>): number {
  if (!Number.isFinite(x)) return 0
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return pts[pts.length - 1][1]
}
