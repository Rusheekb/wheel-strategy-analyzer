import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { load, save } from '../lib/storage'
import { DEFAULT_THRESHOLDS, type Settings, type Thresholds } from '../lib/types'

const DEFAULTS: Settings = { apiKey: '', provider: 'demo', thresholds: DEFAULT_THRESHOLDS, theme: 'system' }

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
    return { ...s, thresholds: { ...DEFAULT_THRESHOLDS, ...s.thresholds } }
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
