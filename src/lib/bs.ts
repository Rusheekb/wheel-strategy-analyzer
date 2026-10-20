// Black-Scholes pricing, greeks and an implied-volatility solver.
// All rates and vols are decimals; time is in years.

const SQRT_2PI = Math.sqrt(2 * Math.PI)

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI
}

// Abramowitz-Stegun approximation of the standard normal CDF (error < 7.5e-8).
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z)
  return 0.5 * (1 + sign * y)
}

export interface BsInputs {
  S: number // spot
  K: number // strike
  T: number // years
  r: number // risk-free rate
  sigma: number // vol
  q?: number // dividend yield
}

function d1d2({ S, K, T, r, sigma, q = 0 }: BsInputs) {
  const sqrtT = Math.sqrt(Math.max(T, 1e-9))
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  return { d1, d2: d1 - sigma * sqrtT, sqrtT }
}

export function bsPrice(type: 'put' | 'call', inp: BsInputs): number {
  const { S, K, T, r, q = 0 } = inp
  if (T <= 0) return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0)
  const { d1, d2 } = d1d2(inp)
  if (type === 'call') return S * Math.exp(-q * T) * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
  return K * Math.exp(-r * T) * normCdf(-d2) - S * Math.exp(-q * T) * normCdf(-d1)
}

export interface Greeks {
  delta: number
  gamma: number
  theta: number // per calendar day
  vega: number // per 1 vol point (0.01)
}

export function bsGreeks(type: 'put' | 'call', inp: BsInputs): Greeks {
  const { S, K, T, r, sigma, q = 0 } = inp
  if (T <= 0) {
    const itm = type === 'call' ? S > K : S < K
    return { delta: itm ? (type === 'call' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 }
  }
  const { d1, d2, sqrtT } = d1d2(inp)
  const eqT = Math.exp(-q * T)
  const erT = Math.exp(-r * T)
  const pdf = normPdf(d1)
  const delta = type === 'call' ? eqT * normCdf(d1) : -eqT * normCdf(-d1)
  const gamma = (eqT * pdf) / (S * sigma * sqrtT)
  const common = -(S * eqT * pdf * sigma) / (2 * sqrtT)
  const thetaYear =
    type === 'call'
      ? common - r * K * erT * normCdf(d2) + q * S * eqT * normCdf(d1)
      : common + r * K * erT * normCdf(-d2) - q * S * eqT * normCdf(-d1)
  const vega = (S * eqT * pdf * sqrtT) / 100
  return { delta, gamma, theta: thetaYear / 365, vega }
}

// Implied volatility via bisection with a Newton polish. Returns NaN when the
// price is outside no-arbitrage bounds.
export function impliedVol(type: 'put' | 'call', price: number, inp: Omit<BsInputs, 'sigma'>): number {
  const { S, K, T, r, q = 0 } = inp
  if (T <= 0 || price <= 0) return NaN
  const intrinsic =
    type === 'call' ? Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0) : Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0)
  if (price < intrinsic - 1e-6) return NaN
  let lo = 0.005
  let hi = 5
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const p = bsPrice(type, { ...inp, sigma: mid })
    if (p > price) hi = mid
    else lo = mid
    if (hi - lo < 1e-6) break
  }
  return (lo + hi) / 2
}

export function yearsBetween(from: Date, to: Date): number {
  return Math.max((to.getTime() - from.getTime()) / (365 * 24 * 3600 * 1000), 0)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000))
}

// Probability the option finishes in the money under the risk-neutral measure.
export function probITM(type: 'put' | 'call', inp: BsInputs): number {
  if (inp.T <= 0) return type === 'call' ? (inp.S > inp.K ? 1 : 0) : inp.S < inp.K ? 1 : 0
  const { d2 } = d1d2(inp)
  return type === 'call' ? normCdf(d2) : normCdf(-d2)
}

// Probability of touching the strike before expiry (reflection principle, drift ignored).
export function probTouch(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return S === K ? 1 : 0
  const x = Math.abs(Math.log(K / S)) / (sigma * Math.sqrt(T))
  return Math.min(1, 2 * (1 - normCdf(x)))
}
