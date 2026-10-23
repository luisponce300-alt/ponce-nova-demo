# Market data and execution model

## Crypto feeds

The isolated Render preview uses actual public USD prices, never generated fallback prices. CoinGecko supplies ranked large/small-cap lists; GeckoTerminal supplies newly created Ethereum pools, which are not necessarily new tokens and cannot be paper traded. If the large list fails, an explicitly labeled Coinbase Exchange USD-pair subset can replace it. The subset has no market-cap rank, invented cap or invented 24-hour change. Small/pool-source failures remain visible.

With MARKET_FEEDS_ENABLED=true, the browser refreshes every held asset independently of the selected list, approximately every 30 seconds while visible and automatic fetching is enabled. Requests are batched in groups of 50 IDs. Eight major USD pairs use Coinbase; unsupported or failed exchange pairs can try a fixed CoinGecko endpoint. Missing/stale holdings make total valuation unavailable. Valuation uses reference/last-trade prices, not guaranteed liquidation proceeds after exit costs.

The selected market list polls approximately every 65 seconds. Source update time and server receipt/observation time are separate. Failure preserves old quote times and rows; it never turns old data into a fresh observation. The server caches responses, shares in-flight work and observes bounded provider cooldowns. Public quotas/availability, data licensing and provider behavior can change. These endpoints do not promise a continuous exchange tick stream.

## Simulated execution

Supported Coinbase USD pairs can request a level-1 order-book snapshot on explicit order confirmation. Best bid/ask and displayed quantities are read only. The timestamp is explicitly the server's observation time because the book response has no authoritative quote timestamp. A snapshot older than ten seconds is rejected. The simulator waits 0.5 seconds, fills at the appropriate observed side with optional declared adverse adjustment, and caps the fill to the displayed quantity at that best level. Unfilled quantity is canceled (IOC model), not left as a real or pending order.

No liquidity is reserved/consumed on the exchange, snapshots can be cached for two seconds, and repeated test orders can reuse observed liquidity. The model does not reconstruct a complete order book, queue priority, hidden orders, exchange risk checks, price impact or actual settlement. A live market can change during/after observation. This is a controlled simulation, not an execution guarantee.

Default assumptions add a 0.10% fee and a 0.05% adverse price adjustment per side. The fee enters cash and average-cost basis/realized P/L. The assumptions can be disabled for comparison; actual observed bid/ask spread remains in the order-book model. Orders record requested/filled/remaining quantity, model, execution/reference prices, source, quote time and costs. Unsupported assets can use the explicitly labeled reference-price simulation with five-minute maximum quote age. Existing historical zero-cost orders replay unchanged.

## Overview and calendar

The Yahoo Finance chart adapter requests OMX Stockholm 30, S&P 500 and S&P/TSX Composite, plus GC=F gold futures in USD per troy ounce. The gold future is not spot XAU/USD and can be affected by contract rolling. Data can be delayed, stale while an exchange is closed, unavailable or subject to provider changes; quote times are displayed. These panels have no order execution. The original clocks work independently of quote availability.

The official U.S. Bureau of Labor Statistics ICS adapter displays future events with supported UTC source timestamps. Unsupported time zones are not guessed. It is not a complete global calendar, and empty/failed responses are explicitly explained. The implementation of an adapter is not evidence that its external endpoint currently responds: use Driftstatus and the PR's actual live check.

## Storage and monitoring

Driftstatus shows observed provider requests, last successful timestamps, AI configuration/usage/error and database availability. Metrics reset with the server process and do not represent complete external-provider account quotas. An HTTP success is not proof of fresh executable prices; individual quote timestamps and order-book checks still apply.

Neon persistence, conflict handling and backup import/export are described in [the testing guide](SERIOUS_TESTING.md). Full backups include chats. No actual orders or paid model fallback are introduced. Main/Pages are unchanged.
