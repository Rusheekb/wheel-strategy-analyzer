import type { SideScore } from '../lib/scoring'
import { verdictLabel } from '../lib/scoring'
import { IconAlert } from './Icons'

export function VerdictCard({ s, active, onSelect }: { s: SideScore; active: boolean; onSelect: () => void }) {
  const r = 46
  const c = 2 * Math.PI * r
  const dash = (s.score / 100) * c
  const top = s.factors
    .slice()
    .sort((a, b) => b.points / b.max - a.points / a.max)
  const strongest = top[0]
  const weakest = top[top.length - 1]
  return (
    <button
      type="button"
      className="card verdict fade-in"
      data-tone={s.verdict}
      onClick={onSelect}
      style={{ textAlign: 'left', cursor: 'pointer', outline: active ? '2px solid var(--tone)' : 'none', outlineOffset: -2, font: 'inherit', color: 'inherit' }}
      aria-pressed={active}
    >
      <div className="ring" aria-label={`Score ${s.score} of 100`}>
        <svg viewBox="0 0 104 104">
          <circle className="track" cx="52" cy="52" r={r} strokeWidth="7" fill="none" />
          <circle className="arc" cx="52" cy="52" r={r} strokeWidth="7" fill="none" strokeDasharray={`${dash} ${c - dash}`} />
        </svg>
        <div className="score num">
          <div>
            {s.score}
            <div>
              <small>/100</small>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="eyebrow">{s.side === 'put' ? 'Sell put' : 'Sell call'}</span>
          <span className={`pill ${s.verdict === 'favorable' ? 'pill-good' : s.verdict === 'acceptable' ? 'pill-warn' : 'pill-bad'}`}>
            <i className="dot" />
            {verdictLabel(s.verdict)}
          </span>
        </div>
        <h3>{s.headline}</h3>
        <p className="small muted">
          Strongest: {strongest.label} ({strongest.value}). Weakest: {weakest.label} ({weakest.value}).
        </p>
        {s.caps.length > 0 && (
          <div className="caps">
            {s.caps.map((cap) => (
              <div key={cap}>
                <IconAlert width={14} height={14} />
                <span>{cap}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
