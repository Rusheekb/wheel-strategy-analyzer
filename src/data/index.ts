import type { Settings } from '../lib/types'
import { alphaVantageProvider } from './alphaVantage'
import { demoProvider } from './demo'
import type { DataProvider } from './provider'
import { alpacaProvider } from './alpaca'

export function providerFor(settings: Settings): DataProvider {
  if (settings.provider === 'alphavantage') return alphaVantageProvider(settings.apiKey)
  if (settings.provider === 'alpaca') return alpacaProvider(settings.alpacaKeyId, settings.alpacaSecret)
  return demoProvider
}

export { ProviderError } from './provider'
export { DEMO_PROFILES } from './demo'
