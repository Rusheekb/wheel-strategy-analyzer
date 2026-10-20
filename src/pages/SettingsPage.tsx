import { useRef, useState } from 'react'
import { IconCheck, IconAlert } from '../components/Icons'
import { ProviderError, providerFor } from '../data'
import { cacheClear, loadRaw, save } from '../lib/storage'
import type { JournalEntry, ProviderId, Thresholds } from '../lib/types'
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

const PROVIDERS: Array<{ id: ProviderId; title: string; tag: string; blurb: string }> = [
  { id: 'demo', title: 'Demo data', tag: 'No key', blurb: 'Synthetic prices and chains. Good for learning the tool and testing your rules.' },
  { id: 'alpaca', title: 'Alpaca', tag: 'Recommended · free', blurb: 'Free paper-trading account, email signup only. Live chains with implied volatility and greeks, 200 requests a minute. Quotes are indicative rather than exchange NBBO.' },
  { id: 'alphavantage', title: 'Alpha Vantage', tag: '25 / day', blurb: 'End-of-day chains with greeks from the prior session. Four requests per ticker, so about six tickers a day.' },
]

export function SettingsPage() {
  const { settings, update, updateThresholds, resetThresholds } = useSettings()
  const journal = useJournal()
  const t = settings.thresholds
  const set = (k: keyof Thresholds) => (v: number) => updateThresholds({ [k]: v })
  const fileRef = useRef<HTMLInputElement>(null)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string; hint?: string }>({ state: 'idle' })

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      const msg = await providerFor(settings).testConnection()
      setTest({ state: 'ok', message: msg })
    } catch (e) {
      const err = e as ProviderError
      setTest({ state: 'fail', message: err.message || 'Connection failed', hint: err instanceof ProviderError ? err.hint : undefined })
    }
  }

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

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Settings</span>
        <h1 className="display">Your rules, encoded.</h1>
        <p>The scores on the research desk are built from these thresholds. Tighten them as you learn what you can hold through.</p>
      </section>

      <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
        <div>
          <h3>Market data</h3>
          <p className="small muted">Keys are stored in this browser only and sent straight to the provider.</p>
        </div>
        <div className="grid grid-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card card-pad"
              onClick={() => {
                update({ provider: p.id })
                setTest({ state: 'idle' })
              }}
              style={{ textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 6, alignContent: 'start', outline: settings.provider === p.id ? '2px solid var(--accent)' : 'none', outlineOffset: -2, background: settings.provider === p.id ? 'var(--accent-soft)' : undefined }}
              aria-pressed={settings.provider === p.id}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{p.title}</b>
                <span className="pill pill-neutral">{p.tag}</span>
              </div>
              <span className="small muted">{p.blurb}</span>
            </button>
          ))}
        </div>

        {settings.provider === 'alpaca' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <ol className="small muted" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
              <li>
                Sign up at{' '}
                <a href="https://app.alpaca.markets/signup" target="_blank" rel="noreferrer">
                  alpaca.markets
                </a>{' '}
                with an email address. Stop when it offers to open a live brokerage account: paper trading is all this needs, and no identity details or funding are required.
              </li>
              <li>On the dashboard switch to Paper Trading, open the API keys panel, and generate a key.</li>
              <li>Paste the key ID and the secret below, then run the connection test. It reports which fields your account returns.</li>
            </ol>
            <div className="form-grid">
              <label className="field">
                <span>API key ID</span>
                <input className="input mono" type="password" value={settings.alpacaKeyId} onChange={(e) => update({ alpacaKeyId: e.target.value.trim() })} placeholder="PK..." autoComplete="off" />
              </label>
              <label className="field">
                <span>API secret key</span>
                <input className="input mono" type="password" value={settings.alpacaSecret} onChange={(e) => update({ alpacaSecret: e.target.value.trim() })} placeholder="Secret" autoComplete="off" />
              </label>
            </div>
            <span className="field-help">Keys stay in this browser and go straight to Alpaca. The app always requests the free indicative feed, so no OPRA agreement is needed.</span>
          </div>
        )}

        {settings.provider === 'alphavantage' && (
          <label className="field">
            <span>Alpha Vantage API key</span>
            <input className="input mono" type="password" value={settings.apiKey} onChange={(e) => update({ apiKey: e.target.value.trim() })} placeholder="Paste your key" autoComplete="off" />
            <span className="field-help">
              Free at{' '}
              <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">
                alphavantage.co
              </a>
              . 25 requests a day; each ticker uses four. Responses are cached for the day.
            </span>
          </label>
        )}

        <div className="row">
          <button className="btn" type="button" onClick={() => void runTest()} disabled={test.state === 'running'}>
            {test.state === 'running' ? 'Testing' : 'Test connection'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              cacheClear()
              setTest({ state: 'ok', message: 'Cached quotes cleared.' })
            }}
          >
            Clear cached quotes
          </button>
          {test.state === 'ok' && (
            <span className="pill pill-good">
              <IconCheck width={12} height={12} /> {test.message}
            </span>
          )}
          {test.state === 'fail' && (
            <span className="small" style={{ color: 'var(--critical)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <IconAlert width={14} height={14} /> {test.message} {test.hint && <span className="muted">{test.hint}</span>}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
          <div className="row">
            <h3>Trading rules</h3>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" type="button" onClick={resetThresholds}>
              Reset defaults
            </button>
          </div>
          <div className="form-grid" style={{ alignItems: 'start' }}>
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

        <div className="card card-pad" style={{ display: 'grid', gap: 14, alignContent: 'start', alignSelf: 'start' }}>
          <h3>Appearance</h3>
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
      </div>
    </div>
  )
}
