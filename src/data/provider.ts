import type { ProviderId, TickerSnapshot } from '../lib/types'

export interface FetchOptions {
  // Only load option expiries up to this many days out. Providers that
  // fetch one request per expiry use it to keep scans cheap.
  maxDte?: number
  // Called with short status lines while a slow (rate-limited) fetch runs.
  onProgress?: (message: string) => void
}

export interface DataProvider {
  id: ProviderId
  label: string
  fetchSnapshot(symbol: string, opts?: FetchOptions): Promise<TickerSnapshot>
  // Cheap call to confirm credentials work. Resolves to a short status line.
  testConnection(): Promise<string>
}

export class ProviderError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'ProviderError'
    this.hint = hint
  }
}
