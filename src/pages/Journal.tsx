import { useMemo, useState } from 'react'
import { IconPlus, IconTrash } from '../components/Icons'
import { fmtDate, fmtMoney, fmtPct, todayISO, uid } from '../lib/format'
import type { JournalEntry, JournalKind, JournalStatus } from '../lib/types'
import { positionsFrom, useJournal } from '../state/journal'

const KIND_LABEL: Record<JournalKind, string> = {
  csp: 'Cash-secured put',
  cc: 'Covered call',
  assigned: 'Shares assigned',
  called_away: 'Shares called away',
  shares: 'Shares bought',
}
const STATUS_LABEL: Record<JournalStatus, string> = { open: 'Open', expired: 'Expired worthless', closed: 'Closed early', assigned: 'Assigned / exercised', rolled: 'Rolled' }

const blank = (): JournalEntry => ({ id: uid(), symbol: '', kind: 'csp', openDate: todayISO(), expiry: '', strike: undefined, contracts: 1, premium: 0, status: 'open' })

export function Journal() {
  const { entries, add, update, remove } = useJournal()
  const [draft, setDraft] = useState<JournalEntry>(blank)
  const [showForm, setShowForm] = useState(false)

  const positions = useMemo(() => positionsFrom(entries), [entries])
  const totals = useMemo(() => {
    const optionTrades = entries.filter((e) => e.kind === 'csp' || e.kind === 'cc')
    const closed = optionTrades.filter((e) => e.status !== 'open')
    const wins = closed.filter((e) => e.premium - (e.closePrice ?? 0) > 0).length
    const premium = optionTrades.reduce((a, e) => a + e.premium * e.contracts * 100, 0)
    const realized = positions.reduce((a, p) => a + p.realized, 0)
    const open = optionTrades.filter((e) => e.status === 'open')
    const collateral = open.reduce((a, e) => a + (e.kind === 'csp' ? (e.strike ?? 0) * e.contracts * 100 : 0), 0)
    // Annualized realized yield on collateral for closed CSPs.
    const ann = closed
      .filter((e) => e.kind === 'csp' && e.strike && e.expiry)
      .map((e) => {
        const days = Math.max(1, (new Date(e.expiry!).getTime() - new Date(e.openDate).getTime()) / 86400000)
        return ((e.premium - (e.closePrice ?? 0)) / e.strike!) * (365 / days)
      })
    const avgAnn = ann.length ? ann.reduce((a, b) => a + b, 0) / ann.length : NaN
    return { premium, realized, winRate: closed.length ? wins / closed.length : NaN, openCount: open.length, collateral, avgAnn, closedCount: closed.length }
  }, [entries, positions])

  const isOption = draft.kind === 'csp' || draft.kind === 'cc'
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.symbol.trim()) return
    add({ ...draft, symbol: draft.symbol.trim().toUpperCase(), expiry: draft.expiry || undefined })
    setDraft(blank())
    setShowForm(false)
  }

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Journal</span>
        <h1 className="display">Every premium dollar, and what it did to your basis.</h1>
        <p>Log each wheel leg as you place it. The journal keeps net cost basis per name so the research desk can warn you before a covered call locks in a loss.</p>
      </section>

      <div className="stat-row">
        <div className="card stat">
          <span className="k">Premium collected</span>
          <span className="v num">{fmtMoney(totals.premium, 0)}</span>
        </div>
        <div className="card stat">
          <span className="k">Realized P/L</span>
          <span className="v num" style={{ color: totals.realized >= 0 ? 'var(--good)' : 'var(--critical)' }}>
            {fmtMoney(totals.realized, 0)}
          </span>
        </div>
        <div className="card stat">
          <span className="k">Win rate</span>
          <span className="v num">{fmtPct(totals.winRate, 0)}</span>
          <span className="xs faint">{totals.closedCount} closed option trades</span>
        </div>
        <div className="card stat">
          <span className="k">Avg annualized (closed puts)</span>
          <span className="v num">{fmtPct(totals.avgAnn, 0)}</span>
        </div>
        <div className="card stat">
          <span className="k">Open positions</span>
          <span className="v num">{totals.openCount}</span>
          <span className="xs faint">{fmtMoney(totals.collateral, 0)} cash secured</span>
        </div>
      </div>

      {positions.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Positions by symbol</h3>
            <span className="card-sub">Net basis = share cost less all premium on the name</span>
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Shares</th>
                  <th>Net basis / share</th>
                  <th>Premium collected</th>
                  <th>Realized</th>
                  <th>Open contracts</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 600 }}>{p.symbol}</td>
                    <td className="num">{p.shares}</td>
                    <td className="num">{p.shares > 0 ? fmtMoney(p.costBasis) : '—'}</td>
                    <td className="num">{fmtMoney(p.premiumCollected, 0)}</td>
                    <td className="num" style={{ color: p.realized >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                      {fmtMoney(p.realized, 0)}
                    </td>
                    <td className="num">{p.openContracts.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Trades</h3>
          <button className="btn btn-sm" type="button" onClick={() => setShowForm((s) => !s)}>
            <IconPlus /> {showForm ? 'Cancel' : 'Add trade'}
          </button>
        </div>
        {showForm && (
          <form onSubmit={submit} className="card-pad" style={{ display: 'grid', gap: 12 }}>
            <div className="form-grid">
              <label className="field">
                <span>Symbol</span>
                <input className="input" required value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} />
              </label>
              <label className="field">
                <span>Leg</span>
                <select className="select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as JournalKind })}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date</span>
                <input className="input" type="date" value={draft.openDate} onChange={(e) => setDraft({ ...draft, openDate: e.target.value })} />
              </label>
              {isOption && (
                <label className="field">
                  <span>Expiry</span>
                  <input className="input" type="date" value={draft.expiry ?? ''} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} />
                </label>
              )}
              {draft.kind !== 'shares' && (
                <label className="field">
                  <span>Strike</span>
                  <input className="input" type="number" step="0.01" value={draft.strike ?? ''} onChange={(e) => setDraft({ ...draft, strike: e.target.value === '' ? undefined : +e.target.value })} />
                </label>
              )}
              <label className="field">
                <span>{isOption ? 'Contracts' : 'Lots of 100 shares'}</span>
                <input className="input" type="number" min={1} value={draft.contracts} onChange={(e) => setDraft({ ...draft, contracts: Math.max(1, +e.target.value) })} />
              </label>
              {isOption ? (
                <label className="field">
                  <span>Premium / share</span>
                  <input className="input" type="number" step="0.01" value={draft.premium} onChange={(e) => setDraft({ ...draft, premium: +e.target.value })} />
                </label>
              ) : (
                <label className="field">
                  <span>Price / share</span>
                  <input className="input" type="number" step="0.01" value={draft.sharePrice ?? ''} onChange={(e) => setDraft({ ...draft, sharePrice: e.target.value === '' ? undefined : +e.target.value })} />
                </label>
              )}
              {isOption && (
                <label className="field">
                  <span>Status</span>
                  <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as JournalStatus })}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              <span>Notes</span>
              <input className="input" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Why this trade, what the score said, what you will do if it moves against you" />
            </label>
            <div>
              <button className="btn btn-primary" type="submit">
                Save trade
              </button>
            </div>
          </form>
        )}
        {entries.length === 0 ? (
          <div className="empty">
            <div>No trades yet. Log a candidate from the research desk, or add one here.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Leg</th>
                  <th>Opened</th>
                  <th>Expiry</th>
                  <th>Strike</th>
                  <th>Qty</th>
                  <th>Credit</th>
                  <th>Close</th>
                  <th>Status</th>
                  <th>Net</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isOpt = e.kind === 'csp' || e.kind === 'cc'
                  const net = isOpt ? (e.premium - (e.status === 'open' ? 0 : e.closePrice ?? 0)) * e.contracts * 100 : NaN
                  return (
                    <tr key={e.id} style={{ cursor: 'default' }}>
                      <td style={{ fontWeight: 600 }}>
                        {e.symbol}
                        {e.notes && <div className="xs faint" style={{ fontWeight: 400, whiteSpace: 'normal', maxWidth: 260 }}>{e.notes}</div>}
                      </td>
                      <td style={{ textAlign: 'left' }}>{KIND_LABEL[e.kind]}</td>
                      <td className="num">{fmtDate(e.openDate)}</td>
                      <td className="num">{e.expiry ? fmtDate(e.expiry) : '—'}</td>
                      <td className="num">{e.strike != null ? fmtMoney(e.strike) : e.sharePrice != null ? fmtMoney(e.sharePrice) : '—'}</td>
                      <td className="num">{e.contracts}</td>
                      <td className="num">{isOpt ? fmtMoney(e.premium) : '—'}</td>
                      <td className="num">
                        {isOpt && e.status !== 'open' && e.status !== 'expired' ? (
                          <input
                            className="input"
                            style={{ width: 90, padding: '4px 8px', textAlign: 'right' }}
                            type="number"
                            step="0.01"
                            value={e.closePrice ?? ''}
                            placeholder="0.00"
                            onChange={(ev) => update(e.id, { closePrice: ev.target.value === '' ? undefined : +ev.target.value })}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isOpt ? (
                          <select className="select" style={{ padding: '4px 8px', width: 'auto' }} value={e.status} onChange={(ev) => update(e.id, { status: ev.target.value as JournalStatus })}>
                            {Object.entries(STATUS_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num" style={{ color: net >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                        {Number.isFinite(net) ? fmtMoney(net, 0) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm btn-danger" type="button" aria-label="Delete" onClick={() => remove(e.id)}>
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
