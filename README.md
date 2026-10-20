# Wheelhouse · Wheel Strategy Analyzer

A research desk for the options wheel strategy. Enter a ticker and Wheelhouse scores whether now is a good time to sell a cash-secured put or a covered call, picks a strike inside your delta band, writes the management plan, and keeps a journal that tracks net cost basis per name.

Live app: https://rusheekb.github.io/wheel-strategy-analyzer/

Wheelhouse is a research and education tool. It does not place trades, and nothing in it is investment advice.

## What it scores

Each side (sell put, sell call) gets a 0–100 score built from nine factors, then a verdict: **Favorable**, **Acceptable**, or **Wait**.

| Factor | Points | What it measures |
| --- | --- | --- |
| Vol rank | 20 | Where current volatility sits in its one-year range |
| IV / realized vol | 15 | Whether options price in more movement than the stock delivers |
| RSI (14) | 12 | Entry timing. Puts favor 30–50 after a pullback, calls favor 55–75 |
| Trend structure | 8 | Price versus the 50 and 200-day averages |
| Earnings window | 12 | Whether an earnings report lands before expiry |
| Ex-dividend | 3 | Early-assignment risk for calls |
| Annualized return | 15 | Premium on collateral at the recommended strike versus your floor |
| Liquidity | 10 | Bid-ask spread and open interest |
| Position size | 5 | Collateral for one contract versus your per-position cap |

Hard caps limit the verdict regardless of score: earnings inside the expiry, a return under your floor, no strike inside your delta band, a falling knife (downtrend with fresh selling), or a call strike below your cost basis.

The strike ladder ranks every out-of-the-money strike for the chosen expiry by delta band fit, annualized return, distance in expected-move sigmas, spread and open interest. The trade ticket shows credit, collateral, breakeven, probability of expiring OTM, probability of touch, theta per day and a management plan (50% profit target, 21 DTE time stop, roll rules).

## Scanner

The Scanner page scores every symbol on your watchlist for the target expiry and sorts by the better side, with the recommended strike and annualized return for each. Click a row to open it on the research desk. The watchlist is editable and persists in the browser.

## Data

Pick a source in Settings. Keys are stored in the browser only and sent straight to the provider.

- **Demo data** (default): synthetic price series and Black-Scholes option chains for eight profiles (AAPL, MSFT, AMD, KO, SOFI, PLTR, F, XOM) and a generic series for any other symbol. The app is fully usable with no key.
- **Alpaca** (recommended): a free paper-trading account at alpaca.markets needs only an email address. No funding, no identity verification. Paper API keys work against the market data API on the free Basic plan: IEX stock bars, and option chains from the free indicative feed with implied volatility and greeks, at 200 requests a minute. Indicative quotes are model-derived rather than exchange NBBO, so they are for research, not execution. Open interest comes from the contracts endpoint and is typically two days old. Alpaca has no earnings calendar, so the earnings factor scores as unknown. The connection test in Settings reports which fields your account actually returns.
- **Alpha Vantage**: paste a free key. Each ticker uses four requests (daily prices, options chain with greeks, company overview, earnings calendar). The free tier allows 25 requests per day, so responses are cached per calendar day.

Providers that need a paid plan or a brokerage account (Massive, Tradier) were removed after research showed their free paths cannot return chains without payment or identity verification. Every supported source is personal-use licensed, so the app is bring-your-own-key: data goes from the provider to your browser and nowhere else.

Vol rank is computed from 20-day realized volatility because none of the free feeds carry implied-volatility history. Treat it as the volatility regime, and prefer your broker's true IV rank when you have it.

## Running locally

```bash
npm install
npm run dev
```

`npm run build` type-checks and produces `dist/`. `npm run lint` runs oxlint.

## Deployment

Pushes to `main` build the site and publish it to GitHub Pages through `.github/workflows/deploy.yml`. If the first run fails on enabling Pages, open the repository's Settings → Pages and set the source to **GitHub Actions**, then re-run the workflow.

## Stack

Vite, React 19, TypeScript. No UI framework, no chart library: the price chart is hand-drawn SVG. All state (settings, thresholds, journal, cache) lives in `localStorage`. Export the journal from Settings before clearing site data.
