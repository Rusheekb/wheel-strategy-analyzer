export type OptionType = 'put' | 'call'

export interface PricePoint {
  date: string // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OptionContract {
  symbol: string
  type: OptionType
  strike: number
  expiry: string // YYYY-MM-DD
  bid: number
  ask: number
  last: number
  mark: number
  volume: number
  openInterest: number
  iv: number // decimal, e.g. 0.32
  delta: number
  gamma?: number
  theta?: number
  vega?: number
}

export interface CompanyInfo {
  name: string
  sector?: string
  beta?: number
  marketCap?: number
  dividendYield?: number
  exDividendDate?: string | null
  nextEarningsDate?: string | null
  week52High?: number
  week52Low?: number
}

export interface TickerSnapshot {
  symbol: string
  asOf: string
  source: 'demo' | 'alphavantage'
  history: PricePoint[]
  chain: OptionContract[]
  info: CompanyInfo
  note?: string
}

export interface Thresholds {
  putDeltaMin: number
  putDeltaMax: number
  callDeltaMin: number
  callDeltaMax: number
  dteMin: number
  dteMax: number
  minAnnualizedReturn: number // decimal
  minIvRank: number // 0-100
  maxSpreadPct: number // decimal, of mid
  minOpenInterest: number
  accountSize: number
  maxPositionPct: number // decimal
  avoidEarnings: boolean
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  putDeltaMin: 0.15,
  putDeltaMax: 0.3,
  callDeltaMin: 0.2,
  callDeltaMax: 0.35,
  dteMin: 21,
  dteMax: 45,
  minAnnualizedReturn: 0.18,
  minIvRank: 30,
  maxSpreadPct: 0.1,
  minOpenInterest: 100,
  accountSize: 100000,
  maxPositionPct: 0.1,
  avoidEarnings: true,
}

export interface Settings {
  apiKey: string
  provider: 'demo' | 'alphavantage'
  thresholds: Thresholds
  theme: 'system' | 'light' | 'dark'
}

export type JournalKind = 'csp' | 'cc' | 'assigned' | 'called_away' | 'shares'
export type JournalStatus = 'open' | 'expired' | 'closed' | 'assigned' | 'rolled'

export interface JournalEntry {
  id: string
  symbol: string
  kind: JournalKind
  openDate: string
  expiry?: string
  strike?: number
  contracts: number // for shares: number of shares / 100
  premium: number // per share credit received (positive) or debit paid (negative)
  closePrice?: number // per share paid to close (positive)
  sharePrice?: number // for assigned/shares: price per share
  status: JournalStatus
  notes?: string
}
