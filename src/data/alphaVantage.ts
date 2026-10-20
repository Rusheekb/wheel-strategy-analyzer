// Alpha Vantage client. Free tier: 25 requests/day. Each ticker costs four
// requests (daily prices, options chain, overview, earnings calendar), so
// results are cached per calendar day in localStorage.
import { cacheGet, cacheSet } from '../lib/storage'
import type { CompanyInfo, OptionContract, PricePoint } from '../lib/types'
import { ProviderError, type DataProvider } from './provider'

const BASE = 'https://www.alphavantage.co/query'

async function getJson(params: Record<string, string>, apiKey: string): Promise<Record<string, unknown>> {
  const key = Object.values(params).join(':')
  const cached = cacheGet<Record<string, unknown>>(key)
  if (cached) return cached
  const url = `${BASE}?${new URLSearchParams({ ...params, apikey: apiKey })}`
  const res = await fetch(url)
  if (!res.ok) throw new ProviderError(`Alpha Vantage returned HTTP ${res.status}`)
  const json = (await res.json()) as Record<string, unknown>
  const notice = (json['Information'] ?? json['Note'] ?? json['Error Message']) as string | undefined
  if (notice) {
    if (/rate limit|per day|per minute|premium/i.test(notice))
      throw new ProviderError('Alpha Vantage request limit reached.', 'The free tier allows 25 requests per day and 5 per minute. Results are cached per day, so retry tomorrow or switch to Demo data.')
    throw new ProviderError(notice)
  }
  cacheSet(key, json)
  return json
}

async function getCsv(params: Record<string, string>, apiKey: string): Promise<string> {
  const key = Object.values(params).join(':')
  const cached = cacheGet<string>(key)
  if (cached) return cached
  const url = `${BASE}?${new URLSearchParams({ ...params, apikey: apiKey })}`
  const res = await fetch(url)
  if (!res.ok) throw new ProviderError(`Alpha Vantage returned HTTP ${res.status}`)
  const text = await res.text()
  if (text.trim().startsWith('{')) {
    // Error payloads come back as JSON even for CSV endpoints.
    const j = JSON.parse(text) as Record<string, string>
    throw new ProviderError(j['Information'] ?? j['Note'] ?? j['Error Message'] ?? 'Unexpected response')
  }
  cacheSet(key, text)
  return text
}

function parseDaily(json: Record<string, unknown>): PricePoint[] {
  const series = json['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined
  if (!series) throw new ProviderError('No price history returned. Check the ticker symbol.')
  return Object.entries(series)
    .map(([date, v]) => ({
      date,
      open: +v['1. open'],
      high: +v['2. high'],
      low: +v['3. low'],
      close: +v['4. close'],
      volume: +v['5. volume'],
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function parseChain(json: Record<string, unknown>): OptionContract[] {
  const data = json['data'] as Array<Record<string, string>> | undefined
  if (!data || !Array.isArray(data)) return []
  return data.map((c) => {
    const bid = +c.bid || 0
    const ask = +c.ask || 0
    const mark = +c.mark || (bid && ask ? (bid + ask) / 2 : +c.last || 0)
    return {
      symbol: c.contractID,
      type: c.type === 'call' ? 'call' : 'put',
      strike: +c.strike,
      expiry: c.expiration,
      bid,
      ask,
      last: +c.last || 0,
      mark,
      volume: +c.volume || 0,
      openInterest: +c.open_interest || 0,
      iv: +c.implied_volatility || 0,
      delta: +c.delta || 0,
      gamma: +c.gamma || undefined,
      theta: +c.theta || undefined,
      vega: +c.vega || undefined,
    }
  })
}

function parseEarnings(csv: string, symbol: string): string | null {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return null
  const header = lines[0].split(',')
  const si = header.indexOf('symbol')
  const di = header.indexOf('reportDate')
  const dates = lines
    .slice(1)
    .map((l) => l.split(','))
    .filter((cols) => cols[si]?.toUpperCase() === symbol)
    .map((cols) => cols[di])
    .filter(Boolean)
    .sort()
  return dates[0] ?? null
}

export function alphaVantageProvider(apiKey: string): DataProvider {
  return {
    id: 'alphavantage',
    label: 'Alpha Vantage',
    async fetchSnapshot(symbolRaw) {
      const symbol = symbolRaw.toUpperCase()
      if (!apiKey) throw new ProviderError('No Alpha Vantage API key set.', 'Add a free key in Settings, or switch to Demo data.')
      const [daily, options, overview, earningsCsv] = await Promise.all([
        getJson({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'full' }, apiKey),
        getJson({ function: 'HISTORICAL_OPTIONS', symbol }, apiKey),
        getJson({ function: 'OVERVIEW', symbol }, apiKey).catch(() => ({}) as Record<string, unknown>),
        getCsv({ function: 'EARNINGS_CALENDAR', symbol, horizon: '3month' }, apiKey).catch(() => ''),
      ])
      const history = parseDaily(daily).slice(-400)
      const chain = parseChain(options)
      if (!chain.length) throw new ProviderError(`No options chain returned for ${symbol}.`, 'The symbol may have no listed options, or the market data is not yet published for the last session.')
      const ov = overview as Record<string, string>
      const info: CompanyInfo = {
        name: ov.Name ?? symbol,
        sector: ov.Sector,
        beta: ov.Beta ? +ov.Beta : undefined,
        marketCap: ov.MarketCapitalization ? +ov.MarketCapitalization : undefined,
        dividendYield: ov.DividendYield ? +ov.DividendYield : undefined,
        exDividendDate: ov.ExDividendDate && ov.ExDividendDate !== 'None' ? ov.ExDividendDate : null,
        nextEarningsDate: parseEarnings(earningsCsv, symbol),
        week52High: ov['52WeekHigh'] ? +ov['52WeekHigh'] : undefined,
        week52Low: ov['52WeekLow'] ? +ov['52WeekLow'] : undefined,
      }
      const asOf = (chain[0] as unknown as { date?: string }).date ?? history[history.length - 1].date
      return {
        symbol,
        asOf,
        source: 'alphavantage',
        history,
        chain,
        info,
        note: 'Alpha Vantage end-of-day data from the last completed session. Greeks and IV are provider-supplied.',
      }
    },
    async testConnection() {
      if (!apiKey) throw new ProviderError('No Alpha Vantage API key set.')
      const j = await getJson({ function: 'GLOBAL_QUOTE', symbol: 'SPY' }, apiKey)
      const q = j['Global Quote'] as Record<string, string> | undefined
      if (!q || !q['05. price']) throw new ProviderError('Unexpected response from Alpha Vantage.')
      return `Connected. SPY last ${(+q['05. price']).toFixed(2)} (${q['07. latest trading day']}).`
    },
  }
}
