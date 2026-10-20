import { useState } from 'react'

const CHECKLIST = [
  { t: 'I would be happy to own 100 shares at the strike', d: 'The wheel only works on names you want at that price. If assignment would feel like a loss, do not sell the put.' },
  { t: 'Vol rank is above my floor and IV exceeds realized vol', d: 'You are paid for implied volatility. Confirm you are being paid more than the stock actually moves.' },
  { t: 'No earnings before expiry (or I am choosing the earnings trade on purpose)', d: 'A gap through the strike wipes out months of premium. Know the date.' },
  { t: 'The strike is inside my delta band and beyond one expected move where possible', d: 'Delta is your probability dial. Outside the band you are either underpaid or over-exposed.' },
  { t: 'Annualized return clears my floor after the spread', d: 'Thin premium is not worth tying up collateral. Compute it on collateral, not on the stock price.' },
  { t: 'Bid-ask spread is tight enough to roll', d: 'Wide spreads cost you twice: on entry and on every adjustment.' },
  { t: 'One contract fits inside my position-size cap', d: 'Concentration, not strike choice, is what blows up wheel accounts.' },
  { t: 'For a covered call: the strike is above my net cost basis', d: 'Being called away below basis converts paper loss into a realized one.' },
  { t: 'I have written the exit: 50% profit target, 21 DTE time stop, roll rule', d: 'Decide before you are in the trade, when you are still objective.' },
]

const GUIDE: Array<{ h: string; body: string[] }> = [
  {
    h: 'Vol rank and IV percentile',
    body: [
      'Where today\'s volatility sits in its own one-year range. A rank of 70 means vol is higher than it has been 70% of the time. Premium sellers want high numbers.',
      'This app computes the rank from 20-day realized volatility because the free data feed has no implied-volatility history. True IV rank from your broker is better. Treat this as the volatility regime, not a precise IV figure.',
      'Rule of thumb: sell above 30, prefer above 50, be aggressive above 70 but expect sharp moves.',
    ],
  },
  {
    h: 'IV versus realized volatility',
    body: [
      'Implied volatility is what options price in. Realized volatility is what the stock actually did. When implied is above realized, you are being paid for movement that tends not to happen. That gap is the structural edge in option selling.',
      'A ratio of 1.2 or more is attractive. Below 1.0 the stock is moving more than options imply and premium is not covering the risk.',
    ],
  },
  {
    h: 'Delta, probability OTM and probability of touch',
    body: [
      'Delta approximates the chance the option finishes in the money. A 0.25 delta put expires worthless about 75% of the time. Common wheel bands are 0.15 to 0.30 for puts and 0.20 to 0.35 for calls.',
      'Probability of touch is roughly double the delta. It tells you how often the stock will test your strike before expiry, which is what you will feel while holding.',
    ],
  },
  {
    h: 'Expected move and sigma distance',
    body: [
      'Expected move = price × IV × √(days / 365). Strikes beyond one expected move line up with roughly 16 delta. Selling just inside one sigma is where premium and probability balance for most wheel traders.',
    ],
  },
  {
    h: 'Annualized return on capital',
    body: [
      'For a cash-secured put: premium ÷ strike × 365 ÷ days to expiry. For a covered call: premium ÷ share price, same scaling. This normalizes trades of different lengths so a 7-day and a 45-day trade compare fairly.',
      'Most wheel traders set a floor between 15% and 30% annualized. Below it, the collateral is better used elsewhere.',
    ],
  },
  {
    h: 'RSI, moving averages and Bollinger bands',
    body: [
      'RSI between 30 and 50 after a pullback is the best spot to sell puts: fear is elevated, premium is rich, and the stock is not in freefall. RSI under 25 with price below the 50 and 200-day averages is a falling knife. Wait for a stabilizing session.',
      'For covered calls, RSI 55 to 75 with price stretched above the 50-day average means more premium and more room before the strike is tested.',
      'Bollinger %B near 0 means price is at the lower band (favors puts). Near 1 means the upper band (favors calls).',
    ],
  },
  {
    h: 'Earnings and ex-dividend dates',
    body: [
      'IV inflates into earnings and collapses afterwards. Selling before the report is a bet that the move will be smaller than priced. Most wheel traders prefer to sell the put the day after earnings when IV is still elevated but the gap risk is gone.',
      'For calls, an in-the-money call near an ex-dividend date risks early assignment, which costs you the dividend. Puts gain slightly, since the expected price drop is in the pricing.',
    ],
  },
  {
    h: 'Liquidity',
    body: [
      'Spread as a share of the mid price is the cost of doing business. Under 5% is excellent, under 10% is workable, above 20% will eat your edge on entry and on rolls. Open interest above a few hundred contracts means you can get out.',
    ],
  },
  {
    h: 'Managing the trade',
    body: [
      'Take profit at 50% of the credit. The last half of the premium takes most of the time and carries most of the gamma risk.',
      'Close or roll at 21 days to expiry regardless of P/L. Gamma accelerates inside three weeks and a small move does outsized damage.',
      'Roll for a net credit only. Rolling out and down (puts) or out and up (calls) for a debit is paying to postpone a loss.',
      'Accept assignment when the thesis is intact. Then sell calls above your net basis and keep collecting. That is the wheel.',
    ],
  },
]

export function Playbook() {
  const [done, setDone] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const all = done.size === CHECKLIST.length
  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Playbook</span>
        <h1 className="display">The checklist you run before you touch the account.</h1>
        <p>Consistency comes from doing the same nine checks every time. Tick them off below, then read up on any metric you cannot explain to someone else.</p>
      </section>

      <div className="grid grid-research">
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="row">
            <h3>Pre-trade checklist</h3>
            <span className="spacer" />
            <span className={`pill ${all ? 'pill-good' : 'pill-neutral'}`}>
              {done.size} / {CHECKLIST.length}
            </span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDone(new Set())}>
              Reset
            </button>
          </div>
          <div className="checklist">
            {CHECKLIST.map((c, i) => (
              <label key={c.t} className={`check ${done.has(i) ? 'done' : ''}`}>
                <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
                <div>
                  <div className="t">{c.t}</div>
                  <div className="d">{c.d}</div>
                </div>
              </label>
            ))}
          </div>
          {all && (
            <div className="banner" style={{ background: 'var(--good-soft)', borderColor: 'transparent', color: 'var(--text)' }}>
              All checks pass. Size the position, place the order with a limit at or above mid, and log it in the journal.
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h3>Metric guide</h3>
          {GUIDE.map((g) => (
            <details className="guide" key={g.h}>
              <summary>{g.h}</summary>
              <div className="body">
                {g.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
