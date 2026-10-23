# Ponce & Nova

An interactive, static dashboard based on the supplied `Ponce_Nova_Godkand_Design(1).html` and Issue #1. The approved order of all 16 panels, portraits, cyan glass styling, five departments, chat channels, agent tools, meeting controls, voice controls and bottom summaries are retained. The aurora background is replaced by a CSS pixel city and office with meeting room, café, toilets, AI lab and moving characters. Reduced motion and a pause button are supported.

The dashboard is HTML/CSS/JavaScript, not a screenshot with hotspots. An optional authenticated Node server and Render Blueprint now support seven on-demand AI roles and a server-side market proxy; see [Render setup](docs/RENDER.md). Static/download mode remains local-only. No Render service or real AI connection is implied by the presence of configuration files. `assets/approved-design.jpg` is the supplied reference JPEG, used **only for CSS portrait crops**. No illustrative balances, market charts, risk values or messages from that image are presented as real data. Index/gold feeds and the economic calendar remain explicitly disconnected.

## Downloadable review

For a browser review without a server or deployment, download [`review/Ponce_Nova_Forhandsvisning.html`](review/Ponce_Nova_Forhandsvisning.html) using GitHub's **Download raw file** button and open it locally. See [Swedish review instructions](review/README.md). The file embeds the same application code/styles/portraits, uses a separate local-storage key and fetches real public APIs rather than bundled test prices. Regenerate with `python3 tools/build_review.py` and verify with `python3 tests/review_test.py`. This is a local review artifact, not a hosted preview or publication. Native live API fetching in the cloud browser retains the certificate limitation described below.

## AI choice

Build/test uses Gemini 2.5 Flash on an owner-confirmed Google Free-tier project, with no automatic paid fallback. See [provider decision, cost boundaries and secure setup](docs/AI_PROVIDERS.md). Actual AI remains disabled until a Gemini key and free-tier confirmation are supplied securely on Render. Paid production provider/model selection is deferred until evaluation and explicit approval.

## Run the optional private server

See [Render setup and secure environment requirements](docs/RENDER.md). `npm ci --ignore-scripts` and `npm start` run the dependency-free Node server after a strong `PREVIEW_PASSWORD` and `SESSION_SECRET` are injected. No credentials belong in this repository. `npm test` covers both core and server tests; `python3 tests/server_browser_test.py` covers login and agent flows with test-only provider responses. Actual AI access and Render deployment still require secure configuration and live verification.

## Run locally (static mode)

No application dependencies, secrets, package installation, build or backend are required. Use a static HTTP server; ES modules should not be opened using `file://`.

```sh
cd /workspace/ponce-nova-demo
python3 -m http.server 8000 --bind 127.0.0.1
```

On other machines, run the command from the checkout directory. Visit the server in your local browser. Cloud onboarding does not support shareable localhost preview links.

## Data sources

- **CoinGecko public API**, `GET https://api.coingecko.com/api/v3/coins/markets`. `vs_currency=usd`, `order=market_cap_desc`, `sparkline=false`. Large tokens: `per_page=30&page=1`. Smaller tokens: `per_page=250&page=3`, ranks 501–750; this is relative rank, not a guarantee of small capitalization. See [CoinGecko markets documentation](https://docs.coingecko.com/reference/coins-markets).
- **GeckoTerminal public API**, `GET https://api.geckoterminal.com/api/v2/networks/eth/new_pools?include=base_token`. New **Ethereum pools**, not guaranteed newly issued tokens. Liquidity is displayed instead of market cap. Pool identity, base-token identity and creation time appear in details. Exact quote time is not supplied by this endpoint: display time is explicitly the observation time. These pools are excluded from paper trading. See [GeckoTerminal API](https://apiguide.geckoterminal.com/).
- APIs are requested directly from the browser without credentials. No proxy or backend is deployed by this project. API availability, CORS, regional restrictions, delays and rate limits are outside this application's control. Domain access is needed for `api.coingecko.com` and `api.geckoterminal.com`. Cloud GitHub operations also need `api.github.com`.
- Initial data loads automatically. Refresh is manual with a 60-second cooldown; changing categories uses a separate cache. There is no continuous polling. A 15-second timeout and HTTP/invalid-payload error states are surfaced. Failed refreshes keep existing rows with an explicit error; they never create replacement prices.
- Missing price/change/market cap stays `—`. Source update time is shown per CoinGecko row and fetch time per list. A five-minute age limit gates paper trades and analysis; source timestamps more than one minute in the future are rejected. No API keys are included. If a future provider requires keys, use a separately reviewed backend with server-side secrets, never a Pages script.

## What works

- Stockholm, New York, Toronto, London and Tokyo clocks use IANA zones and handle DST. Index cards show clocks, not fabricated exchange session status.
- Search within fetched tokens, category selection, source/error/freshness details, and movement-based watchlists.
- Local paper trading starts with **10,000 simulated USD**, with explicit USD units rather than applying an invented SEK conversion. Buy/sell, fractional quantities, cash/inventory validation, average-cost realized P/L, position valuation, winning/losing sell counts, history, a price-shock scenario and JSON report export work locally.
- Valuation becomes unavailable if any held position lacks a fresh quote. Refresh the corresponding token category after reopening the page; quotes are deliberately not persisted. There are no fees, spreads, slippage, market depth, short selling or live orders. Maximum 1,000 local orders per simulation.
- Shared and agent chat channels persist locally. `/hjälp`, `/saldo`, `/analys`, `/risk`, `/möte` produce deterministic local responses. Other messages are notes. Agent/team/board meetings write Ponce's analysis and Nova's concentration review into the agent channel. In static mode there is **no connected LLM**. In the optional server preview, explicitly selected AI replies use the explicitly selected server-side provider integration. There are no autonomous background agents, model training or automatic trading.
- Voice buttons offer optional browser speech recognition where supported; they only create a draft for manual sending. Recognition may use the browser vendor's remote services; this is disclosed before microphone activation. Browser speech synthesis can read an existing agent reply. Unsupported browsers get an explicit explanation and can use text chat.
- Risk checks expose concentration (25% watch threshold) and missing data. They do not claim a verified low-risk classification, news analysis or full risk model.
- Native modal dialogs support keyboard navigation, Escape and focus return. Text from users/providers is inserted as text, never HTML.

## Local data and privacy

Chat, paper ledger and activities are stored under `ponce-nova:v1` in this browser's `localStorage`. No account syncing. Anyone with access to that browser profile may see them; do not enter secrets. Reports include simulated orders/activities but exclude chat. A checkbox is required for explicit reset under “Lagring & integritet”. Invalid saved state is preserved without overwriting it; the app continues in memory. Denied/full storage shows a warning. This is a development simulator, not a tamper-proof financial ledger.

## Tests

Verified with Node 24.19.0, Python 3.12.14, Playwright 1.62.0 and system Chromium. Node 22+ supports the ES modules used by the unit tests. The cloud environment already supplies Python Playwright and `/usr/bin/chromium`.

```sh
node --test tests/core.test.js
python3 tests/browser_test.py
```

On another Linux machine, install Python Playwright 1.62.0 and Chromium using trusted package sources. Browser tests currently use `/usr/bin/chromium`. The Python suite starts its own temporary HTTP server, so it needs no running development server.

The deterministic browser suite intercepts API calls with **test-only fixtures**, never production fallback data. It covers all panels/tools, dialog Escape/focus, eight widths (320–1920 px), reduced motion, channels, HTML injection as text, categories/search, new pool limits, buying/selling, insufficient cash/inventory, reloading, scenario calculation, JSON export, stale/missing quotes, HTTP 503/429, invalid responses, failed refresh, and corrupt/denied storage. Unit tests cover accounting, normalization, source-age enforcement, valuation and DST differences. These do not substitute for live API validation; see the PR for the actual live-check outcome and any limitations. Microphone hardware and external speech services require manual browser/device testing.

## Review and publication

Work belongs on `feature/issue-1-interactive-dashboard` and is delivered through a PR. GitHub Pages is currently configured to deploy from `main`, repository root. **Do not merge, push changes to main, deploy or publish until the owner approves.** No deployment workflow is added here. See [acceptance evidence and screenshots](docs/ACCEPTANCE.md) for the implemented controls and validation limits. A feature-branch push and PR do not change the existing Pages source.
