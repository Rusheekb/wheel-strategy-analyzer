import type { TickerSnapshot } from '../lib/types'

export interface DataProvider {
  id: 'demo' | 'alphavantage'
  label: string
  fetchSnapshot(symbol: string): Promise<TickerSnapshot>
}

export class ProviderError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'ProviderError'
    this.hint = hint
  }
}
