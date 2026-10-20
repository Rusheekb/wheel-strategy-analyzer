import type { TickerMetrics } from '../lib/metrics'
import { fmtMoney, fmtNum, fmtPct } from '../lib/format'

interface TileProps {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}

function Tile({ label, value, sub, tone = 'neutral' }: TileProps) {
  const color = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warning)' : tone === 'bad' ? 'var(--critical)' : undefined
  return (
    <div className="tile">
      <div className="label">
        <span>{label}</span>
        {tone !== 'neutral' && <i className="dot" style={{ background: color, marginTop: 5 }} aria-hidden />}
      </div>
      <div className="value num">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function MetricTiles({ m, expectedMove, dte }: { m: TickerMetrics; expectedMove: number; dte: number }) {
  const rsiTone = m.rsi14 < 30 || m.rsi14 > 70 ? 'warn' : 'neutral'
  return (
    <div className="tiles fade-in">
      <Tile label="Vol rank" value={fmtNum(m.ivRank, 0)} sub={`${fmtNum(m.ivPercentile, 0)}th pct of 1y`} tone={m.ivRank >= 50 ? 'good' : m.ivRank >= 30 ? 'neutral' : 'bad'} />
      <Tile label="ATM IV (30d)" value={fmtPct(m.atmIv, 0)} sub={`${fmtNum(m.ivHvRatio, 2)}× realized`} tone={m.ivHvRatio >= 1.2 ? 'good' : m.ivHvRatio < 1 ? 'bad' : 'neutral'} />
      <Tile label="Realized vol 20d" value={fmtPct(m.hv20, 0)} sub={`1y ${fmtPct(m.hv1y, 0)}`} />
      <Tile label="Expected move" value={`±${fmtMoney(expectedMove)}`} sub={`1σ to ${dte} DTE, ${fmtPct(expectedMove / m.price)}`} />
      <Tile label="RSI (14)" value={fmtNum(m.rsi14, 0)} sub={m.rsi14 < 30 ? 'Oversold' : m.rsi14 > 70 ? 'Overbought' : 'Neutral'} tone={rsiTone} />
      <Tile label="vs 50-day avg" value={fmtPct(m.pctFromSma50)} sub={`vs 200-day ${fmtPct(m.pctFromSma200)}`} tone={m.trend === 'uptrend' ? 'good' : m.trend === 'downtrend' ? 'bad' : 'neutral'} />
      <Tile label="Bollinger %B" value={fmtNum(m.bollingerB, 2)} sub={m.bollingerB < 0.2 ? 'Near lower band' : m.bollingerB > 0.8 ? 'Near upper band' : 'Mid-band'} />
      <Tile label="52-week range" value={fmtPct(m.pos52w, 0)} sub={`20d: ${fmtPct(m.pctFrom20dHigh)} from high`} />
      <Tile label="Earnings" value={m.earningsDays == null ? '—' : `${m.earningsDays}d`} sub={m.earningsDays == null ? 'No date on file' : m.earningsDays <= dte ? 'Inside this expiry' : 'After expiry'} tone={m.earningsDays != null && m.earningsDays <= dte ? 'warn' : 'neutral'} />
      <Tile label="Ex-dividend" value={m.exDivDays == null ? '—' : `${m.exDivDays}d`} sub={m.exDivDays == null ? 'None scheduled' : m.exDivDays <= dte ? 'Inside this expiry' : 'After expiry'} />
      <Tile label="Spread (ATM)" value={fmtPct(m.medianSpreadPct, 1)} sub="median bid-ask / mid" tone={m.medianSpreadPct <= 0.05 ? 'good' : m.medianSpreadPct > 0.15 ? 'bad' : 'neutral'} />
      <Tile label="20-day return" value={fmtPct(m.ret20d)} sub={`5-day ${fmtPct(m.ret5d)}`} />
    </div>
  )
}
