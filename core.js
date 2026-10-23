// Pure domain logic, shared by the browser and Node tests. No credentials required.
export const INITIAL_CASH = 10000;
export const MAX_QUOTE_AGE = 5 * 60 * 1000;
export const ENDPOINTS = {
  large:
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false",
  small:
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=3&sparkline=false",
  new: "https://api.geckoterminal.com/api/v2/networks/eth/new_pools?include=base_token",
};
const positive = (n) => Number.isFinite(n) && n > 0;
const numeric = (n) =>
  n !== null && n !== "" && n !== undefined && Number.isFinite(Number(n))
    ? Number(n)
    : null;
export function isFresh(quote, now = Date.now()) {
  return (
    !!quote &&
    positive(quote.price) &&
    Number.isFinite(quote.updated) &&
    now - quote.updated <= MAX_QUOTE_AGE &&
    now - quote.updated >= -60000
  );
}
export function normalizeMarkets(data) {
  if (!Array.isArray(data))
    throw new Error("Datakällan returnerade ett oväntat format.");
  const coins = data
    .filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
    .map((c) => ({
      id: c.id,
      name: c.name.slice(0, 160),
      symbol: String(c.symbol || "")
        .slice(0, 30)
        .toUpperCase(),
      price: numeric(c.current_price),
      change: numeric(c.price_change_percentage_24h),
      cap: numeric(c.market_cap),
      updated: Date.parse(c.last_updated),
      source: c._source === "Coinbase Exchange" ? "Coinbase Exchange" : "CoinGecko",
      bid: numeric(c.bid),
      ask: numeric(c.ask),
      tradable: true,
    }));
  if (!coins.length) throw new Error("Datakällan saknar användbara tokens.");
  return coins;
}
export function normalizePools(payload, received = Date.now()) {
  if (!Array.isArray(payload?.data))
    throw new Error("Poolkällan returnerade ett oväntat format.");
  const tokens = new Map(
    (payload.included || []).map((t) => [t.id, t.attributes]),
  );
  const seen = new Set();
  const coins = payload.data
    .filter((p) => p?.attributes && p?.id)
    .map((p) => {
      const a = p.attributes;
      const tokenId = p.relationships?.base_token?.data?.id;
      const token = tokens.get(tokenId);
      return {
        id: p.id,
        name: String(token?.name || a.name || p.id).slice(0, 160),
        symbol: String(token?.symbol || "POOL").slice(0, 30),
        price: numeric(a.base_token_price_usd),
        change: numeric(a.price_change_percentage?.h24),
        cap: numeric(a.reserve_in_usd),
        updated: received,
        created: a.pool_created_at,
        source: "GeckoTerminal",
        tradable: false,
        address: tokenId || p.id,
      };
    })
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  if (!coins.length)
    throw new Error("Inga nya pooler rapporterades av källan.");
  return coins;
}
export function emptyWallet() {
  return { cash: INITIAL_CASH, positions: {}, realized: 0, wins: 0, losses: 0 };
}
export function applyTrade(wallet, trade) {
  const { id, side, quantity, price } = trade;
  if (
    typeof id !== "string" ||
    !id ||
    ["__proto__", "constructor", "prototype"].includes(id)
  )
    throw new Error("Ogiltig token.");
  if (
    !["buy", "sell"].includes(side) ||
    !positive(quantity) ||
    !positive(price) ||
    !positive(quantity * price)
  )
    throw new Error("Ange ett giltigt positivt antal.");
  const next = structuredClone(wallet);
  const old = Object.hasOwn(next.positions, id)
    ? next.positions[id]
    : { quantity: 0, cost: 0 };
  const amount = quantity * price;
  const fee = trade.fee ?? 0; // Existing saved orders retain their original zero costs.
  if (!Number.isFinite(fee) || fee < 0 || fee > amount)
    throw new Error("Ogiltig simulerad avgift.");
  if (side === "buy") {
    if (amount + fee > next.cash) throw new Error("Otillräckligt simulerat saldo.");
    next.cash -= amount + fee;
    next.positions[id] = {
      quantity: old.quantity + quantity,
      cost: old.cost + amount + fee,
    };
  } else {
    if (quantity > old.quantity)
      throw new Error("Du kan inte sälja fler tokens än du äger.");
    const basis = old.cost * (quantity / old.quantity);
    const result = amount - fee - basis;
    next.realized += result;
    next.wins += Number(result > 0);
    next.losses += Number(result < 0);
    next.cash += amount - fee;
    if (quantity === old.quantity) delete next.positions[id];
    else
      next.positions[id] = {
        quantity: old.quantity - quantity,
        cost: old.cost - basis,
      };
  }
  if (!Number.isFinite(next.cash) || !Number.isFinite(next.realized))
    throw new Error("Orderbeloppet är för stort.");
  return next;
}
export function replayLedger(trades) {
  if (!Array.isArray(trades) || trades.length > 1000)
    throw new Error("Ogiltig orderhistorik.");
  return trades.reduce((wallet, trade) => {
    if (
      !trade ||
      typeof trade.time !== "number" ||
      !Number.isFinite(trade.time)
    )
      throw new Error("Ogiltig ordertid.");
    return applyTrade(wallet, trade);
  }, emptyWallet());
}
export function executeTrade(wallet, quote, side, quantity, now = Date.now(), costs = {}) {
  if (!quote?.tradable || !isFresh(quote, now))
    throw new Error(
      "Kursen saknas eller är äldre än fem minuter. Uppdatera data först.",
    );
  const { feeBps = 0, slippageBps = 0, useOrderBook = false } = costs;
  if (![feeBps, slippageBps].every((n) => Number.isFinite(n) && n >= 0 && n <= 100))
    throw new Error("Ogiltiga simulerade handelskostnader.");
  if (!positive(quantity)) throw new Error("Ange ett giltigt positivt antal.");
  const requestedQuantity = quantity;
  const bookPrice = side === "buy" ? quote.ask : quote.bid;
  const bookSize = side === "buy" ? quote.askSize : quote.bidSize;
  if (useOrderBook) {
    if (!(positive(bookPrice) && positive(bookSize)) || now - quote.updated > 10000)
      throw new Error("Färsk orderbok saknas. Ordern avvisades utan avslut.");
    quantity = Math.min(quantity, bookSize);
  }
  const price = (useOrderBook ? bookPrice : quote.price) * (1 + (side === "buy" ? 1 : -1) * slippageBps / 10000);
  const trade = {
    id: quote.id,
    symbol: quote.symbol,
    side,
    quantity,
    price,
    referencePrice: quote.price,
    fee: quantity * price * feeBps / 10000,
    feeBps,
    slippageBps,
    requestedQuantity,
    remainingQuantity: requestedQuantity - quantity,
    executionModel: useOrderBook ? "observed-best-level-ioc-simulation" : "reference-simulation",
    time: now,
    quoteTime: quote.updated,
    source: quote.source,
  };
  return { wallet: applyTrade(wallet, trade), trade };
}
export function valuation(wallet, quotes, now = Date.now()) {
  let invested = 0;
  for (const [id, position] of Object.entries(wallet.positions)) {
    const q = quotes.get(id);
    if (!isFresh(q, now)) return null;
    invested += position.quantity * q.price;
  }
  return wallet.cash + invested;
}
export function clockParts(date, zone) {
  return {
    time: new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    date: new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date),
  };
}
export function candidates(quotes, now = Date.now()) {
  return [...quotes.values()]
    .filter((q) => q.tradable && isFresh(q, now) && Number.isFinite(q.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3);
}
