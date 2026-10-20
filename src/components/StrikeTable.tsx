import { fmtInt, fmtMoney, fmtNum, fmtPct } from '../lib/format'
import type { StrikeAnalysis, StrikeRow } from '../lib/scoring'

interface Props {
  analysis: StrikeAnalysis
  selected?: StrikeRow
  onSelect: (r: StrikeRow) => void
}

export function StrikeTable({ analysis, selected, onSelect }: Props) {
  const rows = analysis.rows
  if (!rows.length) {
    return <div className="empty">No out-of-the-money {analysis.side}s with a quote for this expiry.</div>
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Strike</th>
            <th>Bid / Ask</th>
            <th>Mid</th>
            <th>Delta</th>
            <th>Prob OTM</th>
            <th>{analysis.side === 'put' ? 'Cushion' : 'Upside room'}</th>
            <th>Breakeven</th>
            <th>Ann. return</th>
            <th>σ away</th>
            <th>Spread</th>
            <th>OI</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isRec = analysis.recommended?.strike === r.strike
            const isSel = selected?.strike === r.strike
            return (
              <tr
                key={r.strike}
                className={`${isRec ? 'rec' : ''} ${!r.inBand ? 'dim' : ''} ${isSel ? 'selected' : ''}`}
                onClick={() => onSelect(r)}
                title={r.flags.join('. ')}
              >
                <td className="num">
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    {fmtNum(r.strike, r.strike % 1 ? 2 : 0)}
                    {isRec && <span className="pill pill-neutral" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Pick</span>}
                    {r.belowBasis && <span className="pill pill-bad">Below basis</span>}
                  </span>
                </td>
                <td className="num">
                  {fmtNum(r.bid)} / {fmtNum(r.ask)}
                </td>
                <td className="num">{fmtMoney(r.mid)}</td>
                <td className="num">{fmtNum(Math.abs(r.delta), 2)}</td>
                <td className="num">{fmtPct(r.probOTM, 0)}</td>
                <td className="num">{fmtPct(r.cushion)}</td>
                <td className="num">{fmtMoney(r.breakeven)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {fmtPct(r.annualized, 0)}
                </td>
                <td className="num">{fmtNum(r.sigmas, 1)}</td>
                <td className="num">{fmtPct(r.spreadPct, 0)}</td>
                <td className="num">{fmtInt(r.openInterest)}</td>
                <td className="num">{fmtNum(r.score, 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
