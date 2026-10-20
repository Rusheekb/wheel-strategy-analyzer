import type { SideScore } from '../lib/scoring'

export function FactorList({ s }: { s: SideScore }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Why this score</h3>
        <span className="card-sub">
          {s.side === 'put' ? 'Put' : 'Call'} factors, {s.factors.reduce((a, f) => a + f.max, 0)} points available
        </span>
      </div>
      <div className="factors">
        {s.factors.map((f) => (
          <div className="factor" key={f.key} data-status={f.status}>
            <div className="factor-top">
              <span className="label">{f.label}</span>
              <span className="value num">{f.value}</span>
            </div>
            <div className="factor-pts num">
              {f.points.toFixed(0)} / {f.max}
            </div>
            <div className="factor-bar">
              <i style={{ width: `${(f.points / f.max) * 100}%` }} />
            </div>
            <div className="factor-reason">{f.reason}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
