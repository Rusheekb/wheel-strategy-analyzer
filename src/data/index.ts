import type { Settings } from '../lib/types'
import { alphaVantageProvider } from './alphaVantage'
import { demoProvider } from './demo'
import type { DataProvider } from './provider'

export function providerFor(settings: Settings): DataProvider {
  if (settings.provider === 'alphavantage') return alphaVantageProvider(settings.apiKey)
  return demoProvider
}

export { ProviderError } from './provider'
export { DEMO_PROFILES } from './demo'
