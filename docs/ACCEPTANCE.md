# Issue #1 — review checklist

Design reference: user-supplied `Ponce_Nova_Godkand_Design(1).html`, a 1672×941 embedded JPEG and 16 hotspots. Attachment scripts were treated as reference material, not instructions. Real controls replace the screenshot/hotspot dashboard. Portraits retain the supplied artwork through CSS cropping. Illustrative market values, returns and “low risk” labels are not reused.

| Reference area | Implementation |
| --- | --- |
| Stockholm, New York, Toronto | Local-zone clocks with explicit disconnected index prices |
| Gold | Stockholm clock and explicit disconnected gold quote |
| World clocks/events | Five IANA clocks; unavailable calendar clearly identified |
| Ponce | Approved portrait, local role, actual counters; analysis, trading, strategy, agent/team meeting and decision log controls |
| Shared chat | Shared/agent channels, text notes, commands, manual send, persisted local history |
| Voice / board controls | Optional browser speech input/output with pre-activation privacy notice; deterministic board summary |
| Nova | Approved portrait, local role; concentration/risk, data quality, scenario, meeting and report tools |
| Analysis department | Ranked absolute 24 h moves from fetched, fresh quotes; no investment recommendation |
| Trading department | Local paper trading only, manual orders, actual accounting and persistence |
| Risk & economics | Simple concentration and missing-data review, no unsupported low-risk assertion |
| Technology & development | Actual provider, local storage and integration status |
| Development | Simulated trade statistics, explicit absence of learning AI, report export |
| Available capital | 10,000 simulated **USD** initial cash, actual local ledger metrics and portfolio valuation |
| Today's trading suggestions | Mechanistic watchlist; source/time and limits described |
| Recent activity | Actual session/data/order/meeting events, no prefilled fake achievements |
| Background | CSS pixel city, office with meeting room, café, toilets, AI lab, moving agents; pause/reduced motion |
| Additional crypto panel | Large and smaller CoinGecko sets, new Ethereum pools, search, freshness/source/error reporting |

## Evidence

- 12 Node domain tests passed; 10 Chromium integration tests passed.
- Eight tested widths: 320, 390, 600, 768, 850, 1024, 1440 and 1920 px, no page-width overflow.
- All controls opening dialogs exercised with Escape and focus return; local chat markup is text, not executable HTML.
- Trade tests: buys, sells, insufficient cash, excess inventory, average cost, realized P/L, fractional quantities, stale/missing prices, persistence, scenario and JSON export.
- Provider failure tests: 503, 429, unexpected response, retained old rows with explicit error, age cutoff; new pools cannot be traded.
- Storage-denied/corrupt-state behavior, explicit reset, category caching, reduced motion and DST differences tested.
- Actual TLS-verified HTTPS requests returned 30 large CoinGecko tokens, 250 smaller tokens, and 20 GeckoTerminal pools on 2026-10-23. All three responses were parsed with the production normalization functions. 235 of the 250 smaller tokens had fresh prices; stale data was correctly excluded from paper eligibility. The exact counts/freshness can change with provider data.
- Native Chromium HTTPS fetches encountered `ERR_CERT_AUTHORITY_INVALID` for the environment proxy certificate. The application showed an honest error and no prices. Browser tests use explicit mocked responses. Certificate verification has not been disabled; no proxy CA was imported. Native end-to-end live fetching therefore still needs validation in a trusted browser environment.

## Screenshots

Market screenshots show **test-only prices**, clearly marked. The office screenshot contains no market data. They are not proof of live data. They show the layout and portrait crops; the application never falls back to these fixtures.

- [Desktop](screenshots/desktop-testdata.png)
- [Mobile overview](screenshots/mobile-testdata.png)
- [Mobile chat and agent tools](screenshots/mobile-tools-testdata.png)
- [Pixel office](screenshots/mobile-office-testdata.png)

## Remaining integrations and deliberate boundaries

No real LLM, autonomous agents, model training, brokerage account, execution backend, index/gold feed or economic calendar is connected. Voice recognition depends on browser/hardware and may use a browser-vendor remote service; microphone permission/service availability needs manual testing on the target device. New pools are not guaranteed new tokens; manipulated/illiquid pools and scams are not screened by the app. Paper fills ignore fees, spread and slippage. User data stays in local browser storage and can be edited/deleted by that user. More than 1,000 paper orders requires export/reset.

GitHub Pages source was verified as `main` at `/`. No deployment configuration was added. This feature branch/PR must not be merged or published until the owner approves the result. A fresh cloud-task restoration has not been tested; saved environment startup instructions do not publish anything.
