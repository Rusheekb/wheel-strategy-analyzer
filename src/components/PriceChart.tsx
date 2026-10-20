import { useMemo, useRef, useState } from 'react'
import { fmtMoney, fmtShortDate } from '../lib/format'
import { bollinger, sma } from '../lib/stats'
import type { OptionType, PricePoint } from '../lib/types'

interface Props {
  history: PricePoint[]
  expiry: string
  dte: number
  expectedMove: number
  strike?: number
  side: OptionType
}

const W = 820
const H = 320
const M = { top: 16, right: 64, bottom: 28, left: 8 }

export function PriceChart({ history, expiry, dte, expectedMove, strike, side }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const d = useMemo(() => {
    const window = 130
    const all = history.map((p) => p.close)
    const sma50 = sma(all, 50).slice(-window)
    const bb = bollinger(all, 20, 2)
    const pts = history.slice(-window)
    const upper = bb.upper.slice(-window)
    const lower = bb.lower.slice(-window)
    const last = pts[pts.length - 1].close
    const futureSessions = Math.max(1, Math.round(dte * (252 / 365)))
    const n = pts.length + futureSessions
    const ys = [
      ...pts.map((p) => p.high),
      ...pts.map((p) => p.low),
      ...upper.filter(Number.isFinite),
      ...lower.filter(Number.isFinite),
      last + 2 * expectedMove,
      last - 2 * expectedMove,
      ...(strike ? [strike] : []),
    ]
    const yMin = Math.min(...ys) * 0.985
    const yMax = Math.max(...ys) * 1.015
    const x = (i: number) => M.left + (i / (n - 1)) * (W - M.left - M.right)
    const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom)
    const line = (vals: number[]) =>
      vals
        .map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(vals[i - 1]) ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}` : ''))
        .join(' ')
    const bandPath = (() => {
      const idx = upper.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0)
      if (!idx.length) return ''
      const top = idx.map((i) => `${x(i).toFixed(1)},${y(upper[i]).toFixed(1)}`)
      const bot = idx.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(lower[i]).toFixed(1)}`)
      return `M${top.join(' L')} L${bot.join(' L')} Z`
    })()
    const i0 = pts.length - 1
    const i1 = n - 1
    const cone = (k: number) => `M${x(i0)},${y(last)} L${x(i1)},${y(last + k * expectedMove)} L${x(i1)},${y(last - k * expectedMove)} Z`
    // y ticks: 5 nice values
    const ticks: number[] = []
    const span = yMax - yMin
    const step = Math.pow(10, Math.floor(Math.log10(span / 4)))
    const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 6) ?? step
    for (let v = Math.ceil(yMin / nice) * nice; v <= yMax; v += nice) ticks.push(+v.toFixed(6))
    const xTicks = pts.map((p, i) => ({ i, p })).filter(({ i }) => i % 26 === 0 || i === pts.length - 1)
    return { pts, sma50, upper, lower, last, n, x, y, line, bandPath, cone, ticks, xTicks, i0, i1 }
  }, [history, dte, expectedMove, strike])

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const px = ((clientX - rect.left) / rect.width) * W
    const frac = (px - M.left) / (W - M.left - M.right)
    const i = Math.round(frac * (d.n - 1))
    setHover(i >= 0 && i < d.pts.length ? i : null)
  }

  const h = hover != null ? d.pts[hover] : null
  const tooltipLeft = hover != null ? (d.x(hover) / W) * 100 : 0

  return (
    <div className="chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price history with Bollinger band, 50-day average, expected move cone and selected strike">
        {d.ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.left} x2={W - M.right} y1={d.y(t)} y2={d.y(t)} />
            <text className="axis" x={W - M.right + 8} y={d.y(t) + 4}>
              {t >= 100 ? t.toFixed(0) : t.toFixed(t < 10 ? 2 : 1)}
            </text>
          </g>
        ))}
        {d.xTicks.map(({ i, p }) => (
          <text key={p.date} className="axis" x={d.x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === d.pts.length - 1 ? 'end' : 'middle'}>
            {fmtShortDate(p.date)}
          </text>
        ))}
        <text className="axis" x={d.x(d.i1)} y={H - 8} textAnchor="end">
          {fmtShortDate(expiry)}
        </text>
        {/* Future region */}
        <rect x={d.x(d.i0)} y={M.top} width={d.x(d.i1) - d.x(d.i0)} height={H - M.top - M.bottom} fill="var(--surface-2)" opacity="0.6" />
        <line x1={d.x(d.i0)} x2={d.x(d.i0)} y1={M.top} y2={H - M.bottom} stroke="var(--border-strong)" strokeDasharray="3 3" />
        {/* Bollinger band */}
        <path d={d.bandPath} fill="var(--series-3)" opacity="0.12" />
        <path d={d.line(d.upper)} stroke="var(--series-3)" strokeWidth="1" fill="none" opacity="0.7" />
        <path d={d.line(d.lower)} stroke="var(--series-3)" strokeWidth="1" fill="none" opacity="0.7" />
        {/* Expected move cones */}
        <path d={d.cone(2)} fill="var(--text-3)" opacity="0.1" />
        <path d={d.cone(1)} fill="var(--text-3)" opacity="0.18" />
        <text className="axis" x={d.x(d.i1) - 4} y={d.y(d.last + expectedMove) - 4} textAnchor="end">
          +1σ {fmtMoney(d.last + expectedMove, 0)}
        </text>
        <text className="axis" x={d.x(d.i1) - 4} y={d.y(d.last - expectedMove) + 12} textAnchor="end">
          −1σ {fmtMoney(d.last - expectedMove, 0)}
        </text>
        {/* SMA 50 */}
        <path d={d.line(d.sma50)} stroke="var(--series-2)" strokeWidth="1.5" fill="none" />
        {/* Price */}
        <path d={d.line(d.pts.map((p) => p.close))} stroke="var(--series-1)" strokeWidth="2" fill="none" />
        <circle cx={d.x(d.i0)} cy={d.y(d.last)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
        {/* Strike */}
        {strike && (
          <g>
            <line x1={d.x(d.i0)} x2={d.x(d.i1)} y1={d.y(strike)} y2={d.y(strike)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 4" />
            <rect x={d.x(d.i0) + 6} y={d.y(strike) - 18} width={86} height={16} rx="4" fill="var(--accent)" />
            <text x={d.x(d.i0) + 10} y={d.y(strike) - 6} fontSize="10" fontFamily="var(--font-mono)" fill="var(--accent-ink)" fontWeight="600">
              {side === 'put' ? 'PUT' : 'CALL'} {strike}
            </text>
          </g>
        )}
        {/* Crosshair */}
        {hover != null && h && (
          <g>
            <line x1={d.x(hover)} x2={d.x(hover)} y1={M.top} y2={H - M.bottom} stroke="var(--text-3)" strokeWidth="1" />
            <circle cx={d.x(hover)} cy={d.y(h.close)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div className="tooltip" style={{ left: `min(max(${tooltipLeft}%, 0px), calc(100% - 160px))`, top: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{fmtShortDate(h.date)}</b>
          </div>
          <div className="row">
            <span className="muted">Close</span>
            <span className="num">{fmtMoney(h.close)}</span>
          </div>
          {Number.isFinite(d.sma50[hover]) && (
            <div className="row">
              <span className="muted">50-day avg</span>
              <span className="num">{fmtMoney(d.sma50[hover])}</span>
            </div>
          )}
          {Number.isFinite(d.upper[hover]) && (
            <div className="row">
              <span className="muted">Bollinger</span>
              <span className="num">
                {fmtMoney(d.lower[hover], 0)}–{fmtMoney(d.upper[hover], 0)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ChartLegend() {
  return (
    <div className="legend">
      <span>
        <i style={{ ['--c' as string]: 'var(--series-1)' }} />
        Close
      </span>
      <span>
        <i style={{ ['--c' as string]: 'var(--series-2)' }} />
        50-day average
      </span>
      <span>
        <i className="band" style={{ ['--c' as string]: 'var(--series-3)', background: 'var(--series-3)' }} />
        Bollinger 20/2
      </span>
      <span>
        <i className="band" style={{ background: 'var(--text-3)' }} />
        Expected move 1σ / 2σ
      </span>
      <span>
        <i className="dash" style={{ ['--c' as string]: 'var(--accent)' }} />
        Selected strike
      </span>
    </div>
  )
}
