import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../lib/format'
import type { ExpiryInfo, TickerMetrics } from '../lib/metrics'
import type { StrikeRow } from '../lib/scoring'
import type { OptionType } from '../lib/types'
import { IconAlert, IconPlus } from './Icons'

interface Props {
  symbol: string
  side: OptionType
  row?: StrikeRow
  expiry: ExpiryInfo
  m: TickerMetrics
  costBasis?: number
  onLog: () => void
}

export function TradeTicket({ symbol, side, row, expiry, m, costBasis, onLog }: Props) {
  if (!row) {
    return (
      <div className="card card-pad">
        <div className="empty" style={{ padding: 24 }}>
          <IconAlert />
          <div>No candidate strike for this expiry. Pick another expiry or widen the delta band in Settings.</div>
        </div>
      </div>
    )
  }
  const credit = row.mid * 100
  const target = row.mid * 0.5
  const manageDate = new Date(expiry.expiry + 'T00:00:00')
  manageDate.setDate(manageDate.getDate() - 21)
  const manageISO = manageDate.toISOString().slice(0, 10)
  const roc = credit / row.collateral
  return (
    <div className="card card-pad ticket fade-in">
      <div className="ticket-head">
        <div>
          <div className="eyebrow">Candidate trade</div>
          <div className="contract display">
            Sell 1 {symbol} {fmtDate(expiry.expiry)} {fmtNum(row.strike, row.strike % 1 ? 2 : 0)} {side === 'put' ? 'Put' : 'Call'}
          </div>
        </div>
        <div className="num" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(credit, 0)}</div>
          <div className="xs faint">credit at mid</div>
        </div>
      </div>
      <div className="kv">
        <div>
          <span className="k">{side === 'put' ? 'Cash secured' : 'Shares covered'}</span>
          <span className="v num">{fmtMoney(row.collateral, 0)}</span>
        </div>
        <div>
          <span className="k">Return on collateral</span>
          <span className="v num">
            {fmtPct(roc)} <span className="small muted">({fmtPct(row.annualized, 0)} ann.)</span>
          </span>
        </div>
        <div>
          <span className="k">Breakeven</span>
          <span className="v num">{fmtMoney(row.breakeven)}</span>
        </div>
        <div>
          <span className="k">{side === 'put' ? 'Cushion to breakeven' : 'Room to strike'}</span>
          <span className="v num">{fmtPct(row.cushion)}</span>
        </div>
        <div>
          <span className="k">Prob. expires OTM</span>
          <span className="v num">{fmtPct(row.probOTM, 0)}</span>
        </div>
        <div>
          <span className="k">Prob. of touch</span>
          <span className="v num">{fmtPct(row.probTouch, 0)}</span>
        </div>
        <div>
          <span className="k">Strike vs expected move</span>
          <span className="v num">{fmtNum(row.sigmas, 2)}σ</span>
        </div>
        <div>
          <span className="k">Theta / day</span>
          <span className="v num">{Number.isFinite(row.thetaDay) ? fmtMoney(Math.abs(row.thetaDay) * 100) : '—'}</span>
        </div>
        {side === 'call' && costBasis != null && costBasis > 0 && (
          <div>
            <span className="k">If called away vs basis</span>
            <span className="v num" style={{ color: row.strike + row.mid >= costBasis ? 'var(--good)' : 'var(--critical)' }}>
              {fmtMoney((row.strike + row.mid - costBasis) * 100, 0)}
            </span>
          </div>
        )}
      </div>
      {row.flags.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {row.flags.map((f) => (
            <div className="flag" key={f}>
              <IconAlert width={14} height={14} />
              <span>{f}</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Management plan
        </div>
        <div className="rules">
          <div>
            <b>Take profit</b>
            <span>
              Buy back at {fmtMoney(target)} (50% of credit). Expected around day {Math.round(expiry.dte * 0.55)} if the stock holds.
            </span>
          </div>
          <div>
            <b>Time stop</b>
            <span>Close or roll by {fmtDate(manageISO)} (21 DTE), before gamma risk picks up.</span>
          </div>
          <div>
            <b>Defend</b>
            <span>
              If {symbol} {side === 'put' ? 'falls below' : 'rises above'} {fmtMoney(row.strike)}, roll out and {side === 'put' ? 'down' : 'up'} for a net credit. Never roll for a debit.
            </span>
          </div>
          <div>
            <b>Accept</b>
            <span>
              {side === 'put'
                ? `Assignment at ${fmtMoney(row.strike)} means owning 100 shares at a ${fmtMoney(row.breakeven)} basis. Only sell this if you want that.`
                : `Being called away sells 100 shares at ${fmtMoney(row.strike)}, keeping ${fmtMoney(credit, 0)} of premium.`}
            </span>
          </div>
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary" type="button" onClick={onLog}>
          <IconPlus /> Log to journal
        </button>
        <span className="xs faint">Research only. Place the order with your broker.</span>
      </div>
      <div className="xs faint">
        Spot {fmtMoney(m.price)} · ATM IV {fmtPct(expiry.atmIv, 0)} · Expected move ±{fmtMoney(expiry.expectedMove)}
      </div>
    </div>
  )
}
