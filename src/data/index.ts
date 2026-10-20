import type { Settings } from '../lib/types'
import { alphaVantageProvider } from './alphaVantage'
import { demoProvider } from './demo'
import type { DataProvider } from './provider'
import { tradierProvider } from './tradier'

export function providerFor(settings: Settings): DataProvider {
  if (settings.provider === 'alphavantage') return alphaVantageProvider(settings.apiKey)
  if (settings.provider === 'tradier') return tradierProvider(settings.tradierToken, settings.tradierEnv)
  return demoProvider
}

export { ProviderError } from './provider'
export { DEMO_PROFILES } from './demo'
