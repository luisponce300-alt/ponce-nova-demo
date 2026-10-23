# Ponce & Nova

A private paper-trading test dashboard built from the approved design and Issue #1. All 16 panels, portraits, five departments, world clocks, pixel city/office, agent tools and voice controls are retained. The compact market table and both chat channels scroll internally. The original GitHub Pages site on main is unchanged.

[Test service](https://ponce-nova-test.onrender.com) · [PR #2](https://github.com/luisponce300-alt/ponce-nova-demo/pull/2) · [Swedish serious-testing guide](docs/SERIOUS_TESTING.md)

## Private server

The Node server provides password/signed-session authentication, same-origin writes, fixed upstream hosts, input/time/concurrency limits, real public market feeds and seven on-demand AI roles. No real orders, accounts, autonomous agents or model training are connected.

Install with `npm ci --include=dev --ignore-scripts --cache /tmp/ponce-npm-cache`. Supply a strong PREVIEW_PASSWORD (16+ characters) and SESSION_SECRET (32+ characters) outside Git, then run `npm start`. Production additionally requires an HTTPS PUBLIC_ORIGIN or RENDER_EXTERNAL_URL. The Render blueprint targets the isolated Free test service and feature branch with auto-deploy off; production installs omit dev dependencies.

- `MARKET_FEEDS_ENABLED=true`: enable Coinbase USD tickers/order books, holdings refresh independent of the selected tab, index/gold-futures overview and BLS calendar adapter.
- `DATABASE_URL`: optional Neon PostgreSQL connection. Server-only, TLS certificate verification enforced. Tables and previous-version backups initialize automatically. Invalid/missing configuration is visible in Driftstatus and leaves local mode available.
- AI uses Gemini 3.8 Flash in owner-confirmed Free tier, no paid fallback. See [provider setup and limits](docs/AI_PROVIDERS.md). No key belongs in browser code or Git.

## Data and simulation

CoinGecko supplies ranked crypto lists and GeckoTerminal supplies new Ethereum pools. If the large-cap list fails, the server can show a clearly labeled subset of Coinbase Exchange USD pairs. Unsupported exchange holdings can use a CoinGecko fallback. Missing prices, market caps and changes remain missing; source timestamps are preserved. All holdings refresh independently every 30 seconds while visible; selected lists poll approximately every 65 seconds. HTTP failures and quotas can still interrupt free feeds.

Supported Coinbase pairs can use an observed best bid/ask and size. The simulator applies declared fees/extra adverse price adjustment, a 0.5-second delay and partial IOC fills with the unfilled remainder canceled. It does not reserve real liquidity or execute an order. The reference-price model remains available for unsupported tokens; new pools cannot be traded. Historical zero-cost orders replay unchanged. See [market-data limits](docs/MARKET_DATA.md).

The overview adapter uses Yahoo Finance for OMX Stockholm 30, S&P 500, S&P/TSX Composite and **GC=F gold futures**, not XAU/USD spot. Quotes can be delayed or unavailable. The calendar adapter is limited to official U.S. BLS events with supported source timestamps; it is not a complete global economic calendar. Actual availability is recorded in acceptance/PR evidence, not inferred from configuration.

## Storage and privacy

Without a database, the wallet/ledger/chats/events remain in browser localStorage. With Neon, the private workspace is shared by all holders of the preview password. Initial local-history migration requires an explicit choice. Optimistic revisions reject conflicts; the unsynced copy is preserved and new trades pause until resolved. The server retains the previous 20 state versions in the same database. Full JSON backup export/import includes chat; ordinary trading-report export does not. Local deletion does not delete database rows or backups. Neon account/project lifecycle and external backup retention remain the owner's responsibility.

This is a development simulator, not a tamper-proof or multi-tenant financial ledger. Use only test data. Free model terms may permit provider product improvement with submitted data.

## Static/download review

Static HTML/CSS/ES modules need no backend or npm dependencies. Serve the repository with a trusted local static server. Cloud onboarding does not provide shareable localhost URLs.

The self-contained [review HTML](review/Ponce_Nova_Forhandsvisning.html) is available via GitHub's Download raw file action. It embeds the same frontend with separate local storage and server features disabled. Generate with `python3 tools/build_review.py`; see [review instructions](review/README.md). Managed Chromium blocks file navigation here, so bundle tests use an internal temporary HTTP server without asset dependencies.

## Validation

```
npm test
python3 tests/browser_test.py
python3 tests/server_browser_test.py
python3 tests/serious_browser_test.py
python3 tests/review_test.py
```

Node tests cover accounting, source freshness, provider boundaries, authentication/CSRF, fallback feeds and SQL persistence/revision/backups using a PGlite PostgreSQL engine. Browser tests explicitly stub feed/model output; serious-test flows cover cross-device conflict/migration/backup restore, order-book partial fills, off-tab holdings and monitoring. These are not proof of external provider availability. Use [acceptance evidence](docs/ACCEPTANCE.md) and current Driftstatus for live checks. Microphone/device support needs manual testing.

Only the separately authorized test service may be updated. Do not merge main, change Pages or publish production without the owner's approval.
