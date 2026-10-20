import { useRef } from 'react'
import { loadRaw, remove, save } from '../lib/storage'
import type { JournalEntry, Thresholds } from '../lib/types'
import { useJournal } from '../state/journal'
import { useSettings } from '../state/settings'

function NumField({ label, help, value, onChange, step = 1, pct = false, min, max }: { label: string; help?: string; value: number; onChange: (v: number) => void; step?: number; pct?: boolean; min?: number; max?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        step={step}
        min={min}
        max={max}
        value={pct ? +(value * 100).toFixed(2) : value}
        onChange={(e) => {
          const v = +e.target.value
          if (Number.isFinite(v)) onChange(pct ? v / 100 : v)
        }}
      />
      {help && <span className="field-help">{help}</span>}
    </label>
  )
}

export function SettingsPage() {
  const { settings, update, updateThresholds, resetThresholds } = useSettings()
  const journal = useJournal()
  const t = settings.thresholds
  const set = (k: keyof Thresholds) => (v: number) => updateThresholds({ [k]: v })
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJournal = () => {
    const blob = new Blob([JSON.stringify(journal.entries, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wheel-journal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJournal = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as JournalEntry[]
      if (!Array.isArray(parsed)) throw new Error('Not a list')
      const existing = loadRaw<JournalEntry[]>('journal', [])
      const ids = new Set(existing.map((e) => e.id))
      const merged = [...parsed.filter((e) => e && e.id && !ids.has(e.id)), ...existing]
      save('journal', merged)
      window.location.reload()
    } catch {
      alert('That file is not a journal export.')
    }
  }
  const clearCache = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('wheel.cache.'))
      .forEach((k) => remove(k.slice('wheel.'.length)))
    alert('Cached market data cleared.')
  }

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Settings</span>
        <h1 className="display">Your rules, encoded.</h1>
        <p>The scores on the research desk are built from these thresholds. Tighten them as you learn what you can hold through.</p>
      </section>

      <div className="grid grid-2">
        <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
          <h3>Market data</h3>
          <div className="row">
            <button className={`chip ${settings.provider === 'demo' ? 'active' : ''}`} type="button" onClick={() => update({ provider: 'demo' })}>
              Demo data
            </button>
            <button className={`chip ${settings.provider === 'alphavantage' ? 'active' : ''}`} type="button" onClick={() => update({ provider: 'alphavantage' })}>
              Alpha Vantage (live, end of day)
            </button>
          </div>
          <label className="field">
            <span>Alpha Vantage API key</span>
            <input className="input mono" type="password" value={settings.apiKey} onChange={(e) => update({ apiKey: e.target.value.trim() })} placeholder="Paste your key" autoComplete="off" />
            <span className="field-help">
              Free at alphavantage.co/support/#api-key. The free tier allows 25 requests a day; each ticker uses four, and results are cached for the day in this browser. The key never leaves your browser.
            </span>
          </label>
          <div className="row">
            <button className="btn btn-sm" type="button" onClick={clearCache}>
              Clear cached quotes
            </button>
          </div>
          <h3 style={{ marginTop: 8 }}>Appearance</h3>
          <div className="row">
            {(['system', 'light', 'dark'] as const).map((th) => (
              <button key={th} className={`chip ${settings.theme === th ? 'active' : ''}`} type="button" onClick={() => update({ theme: th })}>
                {th[0].toUpperCase() + th.slice(1)}
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: 8 }}>Journal data</h3>
          <div className="row">
            <button className="btn btn-sm" type="button" onClick={exportJournal}>
              Export JSON
            </button>
            <button className="btn btn-sm" type="button" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importJournal(e.target.files[0])} />
            <button
              className="btn btn-sm btn-danger"
              type="button"
              onClick={() => {
                if (confirm('Delete every journal entry? Export first if you want a copy.')) journal.clear()
              }}
            >
              Clear journal
            </button>
          </div>
          <span className="field-help">Everything is stored in this browser only. Export before clearing site data or switching devices.</span>
        </div>

        <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
          <div className="row">
            <h3>Trading rules</h3>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" type="button" onClick={resetThresholds}>
              Reset defaults
            </button>
          </div>
          <div className="form-grid">
            <NumField label="Put delta min" value={t.putDeltaMin} onChange={set('putDeltaMin')} step={0.01} min={0.02} max={0.6} />
            <NumField label="Put delta max" value={t.putDeltaMax} onChange={set('putDeltaMax')} step={0.01} min={0.05} max={0.7} />
            <NumField label="Call delta min" value={t.callDeltaMin} onChange={set('callDeltaMin')} step={0.01} min={0.02} max={0.6} />
            <NumField label="Call delta max" value={t.callDeltaMax} onChange={set('callDeltaMax')} step={0.01} min={0.05} max={0.7} />
            <NumField label="Min days to expiry" value={t.dteMin} onChange={set('dteMin')} min={1} max={120} />
            <NumField label="Max days to expiry" value={t.dteMax} onChange={set('dteMax')} min={2} max={180} />
            <NumField label="Min annualized return %" value={t.minAnnualizedReturn} onChange={set('minAnnualizedReturn')} pct step={1} help="On collateral, at the recommended strike" />
            <NumField label="Min vol rank" value={t.minIvRank} onChange={set('minIvRank')} min={0} max={100} />
            <NumField label="Max spread % of mid" value={t.maxSpreadPct} onChange={set('maxSpreadPct')} pct step={1} />
            <NumField label="Min open interest" value={t.minOpenInterest} onChange={set('minOpenInterest')} step={50} min={0} />
            <NumField label="Account size $" value={t.accountSize} onChange={set('accountSize')} step={1000} min={1000} />
            <NumField label="Max position % of account" value={t.maxPositionPct} onChange={set('maxPositionPct')} pct step={1} help="Collateral for one contract" />
          </div>
          <label className="check" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={t.avoidEarnings} onChange={(e) => updateThresholds({ avoidEarnings: e.target.checked })} />
            <div>
              <div className="t">Cap the verdict when earnings fall inside the expiry</div>
              <div className="d">Leave on unless you are deliberately trading the earnings premium.</div>
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
