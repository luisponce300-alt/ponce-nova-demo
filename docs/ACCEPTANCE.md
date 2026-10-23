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

## Downloadable preview

The `review/Ponce_Nova_Forhandsvisning.html` artifact bundles the same app for direct `file://` use without a server. Its review banner contains a source-content fingerprint. CSS, JavaScript and portrait assets are embedded; public API requests are still real requests, never fixture fallbacks. The only application behavior override is an isolated review storage key. `tests/review_test.py` verifies reproducible generation, all tool dialogs, inline assets/no local dependency requests, clocks, paper order/chat/reload, separated storage, desktop/mobile widths and explicit network failure. The managed cloud browser blocks `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; direct file-opening tests could not execute here. The four artifact checks run over an internal temporary HTTP server with no external/local dependency files and pass separately from the original application suite. Direct opening on the target device is a remaining manual check; no browser policy is changed. Follow [the review guide](../review/README.md) to download and test in a normal trusted browser.

## Compact crypto panel

The crypto price list is capped at 220 px (or 40% of viewport height on short screens), scrolls internally and keeps its column headings sticky. Panel padding and row spacing are reduced. Verified with 40 test tokens at 320, 390 and 1440 px: keyboard scrolling works, the last token remains actionable, headings stay visible and there is no page-width overflow. The four downloadable-artifact tests pass after rebuilding the preview.

## Optional private Render server and seven roles

The user subsequently authorized preparation and administration of a separate Render test service, with the existing website unchanged. `render.yaml` targets the feature branch, Free plan and disabled auto-deployment; it does not configure GitHub Pages or production domains. `server/` adds password/session authentication, fixed upstream market routes, same-origin checks, a static-file allowlist, input/time/concurrency/rate limits and a server-only OpenAI Responses integration with no tools or order execution. `agents.js` defines Ponce, Nova and the five departmental roles. AI replies are opt-in and marked explicitly; the board can request seven role replies after a separate button click. Static/download mode remains local-only and the bundle disables server auto-detection.

Validation after this change: 25 Node tests (12 core + 13 server), the 10 static browser tests, four review-artifact tests and three authenticated server/browser tests passed. AI/provider tests use explicit stubs and are not proof of a real OpenAI reply. `npm ci --ignore-scripts`, `npm start` and `/healthz` were exercised. A real authenticated Chromium session loaded 30/250/20 market rows through the Node server's TLS-verified upstream proxy, with no CA imports or certificate bypasses. Thus the server mode resolves the earlier direct-browser certificate limitation for market data. Direct-provider/download mode still has the documented environment limitation.

A real Render service and real OpenAI response are not yet verified: no saved Render API-token binding was available in the checked cloud runtime, and the AI key must be supplied securely on Render. See [Render setup](RENDER.md). No Render service has been created, no main merge has occurred and the public site is unchanged. This is a prepared/tested implementation, not a claim of hosted readiness.

## Render deployment update — 2026-10-23

A separately authorized Free test service now exists at https://ponce-nova-test.onrender.com. Render reports deployment `dep-dbdntvgae00c738rqm80` live for application commit `30300c3`, with the feature branch, auto-deploy off and generated login/session secrets. The earlier absence of an accessible Render management key was resolved by reusing the saved credential under its actual configured binding. The original Render service, main and Pages remain unchanged. Real AI is still not enabled because AI_API_KEY is not supplied. The cloud egress policy currently blocks independent external HTTP/login tests of the new hostname; its exact domain is saved in the network draft. See docs/RENDER.md for the distinction between verified Render API state and pending external/AI readiness.

## Gemini build/test provider

The owner delegated provider selection for development, retaining a later paid-production decision. Gemini 2.5 Flash is now pinned for free-test mode, based on Google's official pricing page checked 2026-10-23. Server configuration rejects paid OpenAI in free-test mode, unapproved model aliases and missing owner confirmation that the Google project uses Free tier without billing. Configuration cannot independently inspect the Google billing tier; no unconditional zero-cost guarantee is made. There is no automatic paid fallback, retry or quota-driven model switch.

The client displays the selected provider and free-tier data-use disclosure, spaces board calls and lets the user cancel upcoming calls. Existing local/paper behavior is retained. Validation: 34 Node tests, 10 static browser tests, 4 downloadable-artifact tests and 7 authenticated browser tests passed (55 total). Gemini and OpenAI model output in tests is explicitly stubbed; a real Gemini reply still requires the owner's securely supplied key and free-tier confirmation. See [provider decision and secure setup](AI_PROVIDERS.md).

## New-account Gemini compatibility — 2026-10-23

After the owner supplied the Gemini key and confirmed Free tier, the protected live server accepted its configuration but the real provider returned HTTP 404: Gemini 2.5 Flash is no longer available to new users, even though the models endpoint still lists it. Google explicitly recommends Gemini 3.8 Flash. Its standard text input/output Free Tier was independently checked on the official pricing page. The default, Render blueprint and explicit allowlist now support pinned `gemini-3.8-flash`; no automatic model fallback or paid-mode change is introduced. The first direct 3.8 availability check returned HTTP 503 (temporary high demand), so that check alone does not establish a working agent reply.

Validation: all 34 Node tests and seven authenticated browser tests pass. The request-shape test asserts the pinned new endpoint and omission of the legacy thinking-budget parameter. Main/Pages remain unchanged; only the separately authorized test service is redeployed.

Live follow-up: deployment `dep-dbdrsbff3r2c73brh040` of application commit `db9445c` is live. Authenticated login/config returned HTTP 200 with seven roles, Google Gemini and free-test mode. A real `/api/agents/run` request for Nova returned HTTP 200, source Google Gemini, model gemini-3.8-flash and a coherent Swedish reply explaining its independent-review role and lack of real-trading authority. Market context was explicitly unavailable for this particular call; no current prices were invented. This verifies one real role call, not all roles or autonomous operation.

## Automatic real crypto data and costed simulation — 2026-10-23

The selected crypto view now polls real public data every 65 seconds while visible, with a pause checkbox, preserved provider/receipt timestamps, error backoff and server host-level Retry-After pauses. Paper trading defaults to declared 0.10% fees and a 0.05% adverse fill adjustment; historical zero-cost orders replay unchanged. Fee accounting and order previews/history/export are updated. No AI calls or real orders run automatically, and all panels including the compact scrolling crypto table remain.

Validation: 37 Node tests, 12 static browser tests, 7 authenticated server/browser tests and 4 regenerated review-bundle tests passed (60 total). New checks cover loss/cost accounting, insufficient cash including fees, legacy ledger replay, automatic changed-price updates and pause/resume, preserved timestamps during failures and shared-provider quota cooldown. Live pre-change checks returned 30 real large-cap rows; small-cap/pool sources returned HTTP 429 and are not claimed available. See [market-data details and limits](MARKET_DATA.md).

## Bounded scrolling chat — 2026-10-23

Both chat channels now use a bounded, keyboard-focusable scroll region with a stable scrollbar gutter and contained wheel/touch scrolling. The composer and agent controls stay outside that region. New replies follow the bottom only when the reader was already there; reading older replies preserves the current position and exposes a jump-to-latest button. Switching channels opens at the latest reply. Existing stored conversations remain intact.

Validation after the combined live-data/chat changes: 37 Node tests, 13 static browser tests, 7 authenticated server/browser tests and 4 review-artifact tests pass (61 total). The chat regression seeds long AI replies, scrolls with the keyboard, appends messages while reading above the bottom, checks jump-to-latest and composer position, and repeats at 1440, 390 and 320 px. No real order or production deployment is introduced.
