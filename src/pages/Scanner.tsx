import { useMemo, useRef, useState } from 'react'
import { IconAlert, IconArrow, IconPlus, IconTrash } from '../components/Icons'
import { providerFor } from '../data'
import { fmtMoney, fmtNum, fmtPct } from '../lib/format'
import { computeMetrics, pickTargetExpiry, type TickerMetrics } from '../lib/metrics'
import { analyzeStrikes, scoreSide, verdictLabel, type SideScore, type StrikeRow } from '../lib/scoring'
import { save } from '../lib/storage'
import { useSettings } from '../state/settings'

interface ScanRow {
  symbol: string
  status: 'pending' | 'loading' | 'done' | 'error'
  error?: string
  m?: TickerMetrics
  dte?: number
  put?: SideScore
  call?: SideScore
  putPick?: StrikeRow
  callPick?: StrikeRow
}

function tone(s?: SideScore) {
  if (!s) return 'pill-neutral'
  return s.verdict === 'favorable' ? 'pill-good' : s.verdict === 'acceptable' ? 'pill-warn' : 'pill-bad'
}

export function Scanner({ onOpen }: { onOpen: (symbol: string) => void }) {
  const { settings, update } = useSettings()
  const t = settings.thresholds
  const [rows, setRows] = useState<ScanRow[]>([])
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [sort, setSort] = useState<'best' | 'put' | 'call' | 'symbol'>('best')
  const cancel = useRef(false)

  const watchlist = settings.watchlist
  const setWatchlist = (w: string[]) => update({ watchlist: w })

  const addSymbols = () => {
    const syms = input
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z.-]{1,6}$/.test(s))
    if (!syms.length) return
    setWatchlist([...new Set([...watchlist, ...syms])])
    setInput('')
  }

  const run = async () => {
    if (!watchlist.length || running) return
    cancel.current = false
    setRunning(true)
    const provider = providerFor(settings)
    const initial: ScanRow[] = watchlist.map((symbol) => ({ symbol, status: 'pending' }))
    setRows(initial)
    const patch = (symbol: string, p: Partial<ScanRow>) => setRows((rs) => rs.map((r) => (r.symbol === symbol ? { ...r, ...p } : r)))
    for (const symbol of watchlist) {
      if (cancel.current) break
      patch(symbol, { status: 'loading' })
      try {
        const snap = await provider.fetchSnapshot(symbol, { maxDte: t.dteMax + 10 })
        const m = computeMetrics(snap)
        const exp = pickTargetExpiry(m.expiries, t.dteMin, t.dteMax)
        if (!exp) throw new Error('No expiry inside the DTE range')
        const puts = analyzeStrikes('put', m, exp, t)
        const calls = analyzeStrikes('call', m, exp, t)
        patch(symbol, {
          status: 'done',
          m,
          dte: exp.dte,
          put: scoreSide('put', m, t, puts),
          call: scoreSide('call', m, t, calls),
          putPick: puts.recommended,
          callPick: calls.recommended,
        })
      } catch (e) {
        patch(symbol, { status: 'error', error: (e as Error).message })
      }
    }
    setRunning(false)
  }

  const sorted = useMemo(() => {
    const score = (r: ScanRow) => Math.max(r.put?.score ?? -1, r.call?.score ?? -1)
    const xs = rows.slice()
    xs.sort((a, b) => {
      if (sort === 'symbol') return a.symbol.localeCompare(b.symbol)
      if (sort === 'put') return (b.put?.score ?? -1) - (a.put?.score ?? -1)
      if (sort === 'call') return (b.call?.score ?? -1) - (a.call?.score ?? -1)
      return score(b) - score(a)
    })
    return xs
  }, [rows, sort])

  const done = rows.filter((r) => r.status === 'done' || r.status === 'error').length
  const open = (symbol: string) => {
    save('lastSymbol', symbol)
    onOpen(symbol)
  }

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Scanner</span>
        <h1 className="display">Rank your watchlist before you pick a trade.</h1>
        <p>Scores every name on your list for the target expiry and sorts by the better side. Open the best one on the research desk to see the strike ladder.</p>
      </section>

      <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
        <div className="row">
          <h3>Watchlist</h3>
          <span className="faint small">{watchlist.length} symbols</span>
          <span className="spacer" />
          <button className="btn btn-primary" type="button" onClick={() => void run()} disabled={running || !watchlist.length}>
            {running ? `Scanning ${done} / ${rows.length}` : 'Run scan'}
          </button>
          {running && (
            <button className="btn" type="button" onClick={() => (cancel.current = true)}>
              Stop
            </button>
          )}
        </div>
        <div className="chips">
          {watchlist.map((s) => (
            <span key={s} className="chip" style={{ cursor: 'default' }}>
              <span className="mono">{s}</span>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setWatchlist(watchlist.filter((x) => x !== s))} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--text-3)', display: 'inline-flex' }}>
                <IconTrash width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            addSymbols()
          }}
        >
          <input className="input mono" style={{ maxWidth: 420 }} placeholder="Add symbols, e.g. NVDA, TSLA, JPM" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn" type="submit">
            <IconPlus /> Add
          </button>
        </form>
        <div className="xs faint">
          {settings.provider === 'demo'
            ? 'Demo data: symbols outside the demo set get a generic synthetic series.'
            : settings.provider === 'tradier'
              ? 'Tradier: each symbol uses about three requests plus one per expiry inside your DTE range. Results are cached for 15 minutes.'
              : 'Alpha Vantage: each symbol uses four of your 25 daily requests. Keep the list short.'}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Results</h3>
            <div className="tabs" style={{ padding: 3 }}>
              {(['best', 'put', 'call', 'symbol'] as const).map((k) => (
                <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)} style={{ padding: '5px 10px', fontSize: 13 }}>
                  {k === 'best' ? 'Best side' : k === 'put' ? 'Put score' : k === 'call' ? 'Call score' : 'Symbol'}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Sell put</th>
                  <th>Put pick</th>
                  <th>Sell call</th>
                  <th>Call pick</th>
                  <th>Vol rank</th>
                  <th>IV / RV</th>
                  <th>RSI</th>
                  <th>Earnings</th>
                  <th>DTE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.symbol} onClick={() => r.status === 'done' && open(r.symbol)} style={{ cursor: r.status === 'done' ? 'pointer' : 'default' }}>
                    <td style={{ fontWeight: 600 }}>
                      {r.symbol}
                      {r.status === 'loading' && <span className="xs faint" style={{ marginLeft: 8 }}>loading</span>}
                      {r.status === 'pending' && <span className="xs faint" style={{ marginLeft: 8 }}>queued</span>}
                    </td>
                    {r.status === 'error' ? (
                      <td colSpan={11} style={{ textAlign: 'left', color: 'var(--critical)' }}>
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <IconAlert width={14} height={14} /> {r.error}
                        </span>
                      </td>
                    ) : r.status !== 'done' || !r.m ? (
                      <td colSpan={11}>
                        <div className="skeleton" style={{ height: 14 }} />
                      </td>
                    ) : (
                      <>
                        <td className="num">{fmtMoney(r.m.price)}</td>
                        <td>
                          <span className={`pill ${tone(r.put)}`}>
                            <span className="num">{r.put?.score}</span> {verdictLabel(r.put!.verdict)}
                          </span>
                        </td>
                        <td className="num">{r.putPick ? `${fmtNum(r.putPick.strike, r.putPick.strike % 1 ? 2 : 0)} · ${fmtPct(r.putPick.annualized, 0)}` : '—'}</td>
                        <td>
                          <span className={`pill ${tone(r.call)}`}>
                            <span className="num">{r.call?.score}</span> {verdictLabel(r.call!.verdict)}
                          </span>
                        </td>
                        <td className="num">{r.callPick ? `${fmtNum(r.callPick.strike, r.callPick.strike % 1 ? 2 : 0)} · ${fmtPct(r.callPick.annualized, 0)}` : '—'}</td>
                        <td className="num">{fmtNum(r.m.ivRank, 0)}</td>
                        <td className="num">{fmtNum(r.m.ivHvRatio, 2)}×</td>
                        <td className="num">{fmtNum(r.m.rsi14, 0)}</td>
                        <td className="num" style={{ color: r.m.earningsDays != null && r.dte != null && r.m.earningsDays <= r.dte ? 'var(--warning)' : undefined }}>
                          {r.m.earningsDays == null ? '—' : `${r.m.earningsDays}d`}
                        </td>
                        <td className="num">{r.dte}</td>
                        <td>
                          <span className="btn btn-ghost btn-sm">
                            Open <IconArrow />
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
