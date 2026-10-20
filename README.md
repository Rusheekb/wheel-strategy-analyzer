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
- **Tradier** (recommended): a free developer sandbox account at developer.tradier.com gives a token with 15-minute delayed quotes, full chains, and ORATS greeks and IV. Limits are per minute rather than per day, so the scanner is practical. Each ticker uses three requests plus one per expiry inside the DTE range, and responses are cached for 15 minutes. A brokerage production token also works. Earnings and ex-dividend dates come from Tradier's beta fundamentals endpoints, which may not be available on every token; when they are missing the app says so and treats the date as unknown.
- **Alpha Vantage**: paste a free key. Each ticker uses four requests (daily prices, options chain with greeks, company overview, earnings calendar). The free tier allows 25 requests per day, so responses are cached per calendar day.

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
