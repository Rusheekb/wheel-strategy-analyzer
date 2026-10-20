import { useEffect, useMemo, useState } from 'react'
import { DEMO_PROFILES, ProviderError, providerFor } from '../data'
import { FactorList } from '../components/FactorList'
import { IconAlert, IconArrow, IconInfo, IconSearch } from '../components/Icons'
import { MetricTiles } from '../components/MetricTiles'
import { ChartLegend, PriceChart } from '../components/PriceChart'
import { StrikeTable } from '../components/StrikeTable'
import { TradeTicket } from '../components/TradeTicket'
import { VerdictCard } from '../components/VerdictCard'
import { fmtDate, fmtMoney, fmtPct, todayISO, uid } from '../lib/format'
import { computeMetrics, pickTargetExpiry } from '../lib/metrics'
import { analyzeStrikes, scoreSide, type StrikeRow } from '../lib/scoring'
import type { OptionType, TickerSnapshot } from '../lib/types'
import { loadRaw, save } from '../lib/storage'
import { positionsFrom, useJournal } from '../state/journal'
import { useSettings } from '../state/settings'

export function Research({ onGoSettings }: { onGoSettings: () => void }) {
  const { settings } = useSettings()
  const journal = useJournal()
  const [query, setQuery] = useState(() => loadRaw<string>('lastSymbol', 'AAPL'))
  const [snapshot, setSnapshot] = useState<TickerSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const [side, setSide] = useState<OptionType>('put')
  const [expiryKey, setExpiryKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<StrikeRow | undefined>()
  const [logged, setLogged] = useState<string | null>(null)

  const t = settings.thresholds

  const run = async (sym: string) => {
    const s = sym.trim().toUpperCase()
    if (!s) return
    setLoading(true)
    setError(null)
    setLogged(null)
    try {
      const snap = await providerFor(settings).fetchSnapshot(s)
      setSnapshot(snap)
      setExpiryKey(null)
      setSelected(undefined)
      setQuery(s)
      save('lastSymbol', s)
    } catch (e) {
      const err = e as ProviderError
      setError({ message: err.message || 'Failed to load data', hint: err instanceof ProviderError ? err.hint : undefined })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void run(loadRaw<string>('lastSymbol', 'AAPL'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const m = useMemo(() => (snapshot ? computeMetrics(snapshot) : null), [snapshot])
  const expiry = useMemo(() => {
    if (!m) return undefined
    return m.expiries.find((e) => e.expiry === expiryKey) ?? pickTargetExpiry(m.expiries, t.dteMin, t.dteMax)
  }, [m, expiryKey, t.dteMin, t.dteMax])

  const position = useMemo(() => (snapshot ? positionsFrom(journal.entries).find((p) => p.symbol === snapshot.symbol) : undefined), [journal.entries, snapshot])
  const costBasis = position && position.shares > 0 ? position.costBasis : undefined

  const analysis = useMemo(() => {
    if (!m || !expiry) return null
    return {
      put: analyzeStrikes('put', m, expiry, t),
      call: analyzeStrikes('call', m, expiry, t, costBasis),
    }
  }, [m, expiry, t, costBasis])

  const scores = useMemo(() => {
    if (!m || !analysis) return null
    return {
      put: scoreSide('put', m, t, analysis.put),
      call: scoreSide('call', m, t, analysis.call, costBasis),
    }
  }, [m, analysis, t, costBasis])

  const current = analysis?.[side]
  const row = selected && current?.rows.find((r) => r.strike === selected.strike) ? selected : current?.recommended

  useEffect(() => setSelected(undefined), [side, expiryKey])

  const log = () => {
    if (!snapshot || !row || !expiry) return
    journal.add({
      id: uid(),
      symbol: snapshot.symbol,
      kind: side === 'put' ? 'csp' : 'cc',
      openDate: todayISO(),
      expiry: expiry.expiry,
      strike: row.strike,
      contracts: 1,
      premium: +row.mid.toFixed(2),
      status: 'open',
      notes: `Score ${scores?.[side].score}. Delta ${Math.abs(row.delta).toFixed(2)}, ${fmtPct(row.annualized, 0)} annualized.`,
    })
    setLogged(`Logged ${snapshot.symbol} ${row.strike} ${side} to the journal as an open position.`)
  }

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Wheel research desk</span>
        <h1 className="display">Is now the time to sell the put, or the call?</h1>
        <p>
          Enter a ticker. The desk scores premium richness, entry timing, event risk, return on capital and liquidity, then picks a strike inside your delta band and writes the management plan.
        </p>
      </section>

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault()
          void run(query)
        }}
      >
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ticker" aria-label="Ticker symbol" autoCapitalize="characters" spellCheck={false} />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          <IconSearch /> {loading ? 'Loading' : 'Analyze'}
        </button>
      </form>
      <div className="row">
        <span className="xs faint">{settings.provider === 'demo' ? 'Demo set:' : 'Quick picks:'}</span>
        <div className="chips">
          {Object.keys(DEMO_PROFILES).map((s) => (
            <button key={s} type="button" className={`chip ${snapshot?.symbol === s ? 'active' : ''}`} onClick={() => void run(s)}>
              {s}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className={`pill ${settings.provider === 'demo' ? 'pill-neutral' : 'pill-good'}`}>{settings.provider === 'demo' ? 'Demo data' : 'Alpha Vantage'}</span>
      </div>

      {error && (
        <div className="banner error">
          <IconAlert />
          <div>
            <b>{error.message}</b>
            {error.hint && <div>{error.hint}</div>}
            <button className="btn btn-sm" type="button" style={{ marginTop: 8 }} onClick={onGoSettings}>
              Open settings <IconArrow />
            </button>
          </div>
        </div>
      )}

      {loading && !snapshot && (
        <div className="grid grid-2">
          <div className="skeleton" style={{ height: 150 }} />
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      )}

      {snapshot && m && expiry && analysis && scores && current && (
        <>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 className="display" style={{ fontSize: 34 }}>
              {snapshot.symbol}
            </h2>
            <span className="muted">{snapshot.info.name}</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>
              {fmtMoney(m.price)}
            </span>
            <span className="num" style={{ color: m.change1d >= 0 ? 'var(--good)' : 'var(--critical)' }}>
              {m.change1d >= 0 ? '+' : ''}
              {fmtPct(m.change1d)}
            </span>
            <span className="spacer" />
            <span className="xs faint">
              As of {fmtDate(snapshot.asOf)} · {snapshot.info.sector ?? ''}
              {costBasis ? ` · Holding ${position?.shares} shares, net basis ${fmtMoney(costBasis)}` : ''}
            </span>
          </div>
          {snapshot.note && (
            <div className="banner">
              <IconInfo />
              <span>{snapshot.note}</span>
            </div>
          )}

          <div className="grid grid-2">
            <VerdictCard s={scores.put} active={side === 'put'} onSelect={() => setSide('put')} />
            <VerdictCard s={scores.call} active={side === 'call'} onSelect={() => setSide('call')} />
          </div>

          <MetricTiles m={m} expectedMove={expiry.expectedMove} dte={expiry.dte} />

          <div className="row">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={side === 'put'} className={side === 'put' ? 'active' : ''} onClick={() => setSide('put')}>
                Sell put
              </button>
              <button role="tab" aria-selected={side === 'call'} className={side === 'call' ? 'active' : ''} onClick={() => setSide('call')}>
                Sell call
              </button>
            </div>
            <div className="expiries" style={{ flex: 1 }}>
              {m.expiries.map((e) => (
                <button key={e.expiry} type="button" className={`chip ${e.expiry === expiry.expiry ? 'active' : ''}`} onClick={() => setExpiryKey(e.expiry)}>
                  <span className="num">{fmtDate(e.expiry).replace(/, \d{4}/, '')}</span>
                  <small>
                    {e.dte} DTE{e.dte >= t.dteMin && e.dte <= t.dteMax ? ' · target' : ''}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-research">
            <div className="card">
              <div className="card-head">
                <h3>Price, volatility bands and expected move</h3>
                <span className="card-sub">130 sessions, cone to {fmtDate(expiry.expiry)}</span>
              </div>
              <div style={{ padding: '8px 12px 0' }}>
                <PriceChart history={snapshot.history} expiry={expiry.expiry} dte={expiry.dte} expectedMove={expiry.expectedMove} strike={row?.strike} side={side} />
              </div>
              <ChartLegend />
            </div>
            <TradeTicket symbol={snapshot.symbol} side={side} row={row} expiry={expiry} m={m} costBasis={costBasis} onLog={log} />
          </div>
          {logged && (
            <div className="banner">
              <IconInfo />
              <span>{logged}</span>
            </div>
          )}

          <div className="grid">
            <div className="card">
              <div className="card-head">
                <h3>Strike ladder</h3>
                <span className="card-sub">
                  Delta band {t[side === 'put' ? 'putDeltaMin' : 'callDeltaMin'].toFixed(2)}–{t[side === 'put' ? 'putDeltaMax' : 'callDeltaMax'].toFixed(2)} · click a row to load it into the ticket
                </span>
              </div>
              <StrikeTable analysis={current} selected={row} onSelect={setSelected} />
            </div>
            <FactorList s={scores[side]} />
          </div>
        </>
      )}
    </div>
  )
}
