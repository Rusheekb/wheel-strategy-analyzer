import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { load, save } from '../lib/storage'
import { DEFAULT_THRESHOLDS, DEFAULT_WATCHLIST, type Settings, type Thresholds } from '../lib/types'

const DEFAULTS: Settings = { apiKey: '', alpacaKeyId: '', alpacaSecret: '', provider: 'demo', thresholds: DEFAULT_THRESHOLDS, theme: 'system', watchlist: DEFAULT_WATCHLIST }

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updateThresholds: (patch: Partial<Thresholds>) => void
  resetThresholds: () => void
}

const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = load<Settings>('settings', DEFAULTS)
    const provider: Settings['provider'] = s.provider === 'alpaca' || s.provider === 'alphavantage' ? s.provider : 'demo'
    return { ...s, provider, thresholds: { ...DEFAULT_THRESHOLDS, ...s.thresholds } }
  })
  useEffect(() => save('settings', settings), [settings])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
  }, [settings.theme])
  const value = useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      updateThresholds: (patch) => setSettings((s) => ({ ...s, thresholds: { ...s.thresholds, ...patch } })),
      resetThresholds: () => setSettings((s) => ({ ...s, thresholds: DEFAULT_THRESHOLDS })),
    }),
    [settings],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside provider')
  return ctx
}
