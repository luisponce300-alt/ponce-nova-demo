import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyWallet,
  applyTrade,
  executeTrade,
  replayLedger,
  valuation,
  normalizeMarkets,
  normalizePools,
  isFresh,
  clockParts,
  candidates,
  INITIAL_CASH,
} from "../core.js";
const now = Date.parse("2026-10-23T12:00:00Z");
const quote = (overrides = {}) => ({
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  price: 100,
  change: 3,
  tradable: true,
  updated: now,
  source: "CoinGecko",
  ...overrides,
});
const trade = (overrides = {}) => ({
  id: "bitcoin",
  side: "buy",
  quantity: 2,
  price: 100,
  time: now,
  ...overrides,
});
test("buy then partial sell uses average cost; replay reproduces balances", () => {
  const ledger = [
    trade(),
    trade({ quantity: 2, price: 200 }),
    trade({ side: "sell", quantity: 1, price: 180 }),
  ];
  const w = replayLedger(ledger);
  assert.equal(w.cash, 9580);
  assert.equal(w.realized, 30);
  assert.equal(w.wins, 1);
  assert.equal(w.positions.bitcoin.quantity, 3);
  assert.equal(w.positions.bitcoin.cost, 450);
});
test("sell full holding removes position, loss tracked", () => {
  const w = applyTrade(
    applyTrade(emptyWallet(), trade()),
    trade({ side: "sell", quantity: 2, price: 80 }),
  );
  assert.equal(w.cash, 9960);
  assert.equal(w.losses, 1);
  assert.equal(w.realized, -40);
  assert.deepEqual(w.positions, {});
});
test("cannot overspend, short, or use invalid side/quantity; wallet immutable", () => {
  const w = emptyWallet();
  for (const t of [
    trade({ quantity: 101 }),
    trade({ side: "sell" }),
    trade({ side: "oops" }),
    trade({ quantity: -1 }),
    trade({ quantity: 0 }),
    trade({ quantity: NaN }),
    trade({ price: Infinity }),
    trade({ id: "__proto__" }),
  ])
    assert.throws(() => applyTrade(w, t));
  assert.deepEqual(w, emptyWallet());
});
test("fractional trades support small holdings and exact full close", () => {
  const w = applyTrade(
    emptyWallet(),
    trade({ quantity: 0.00000001, price: 60000 }),
  );
  const closed = applyTrade(
    w,
    trade({ side: "sell", quantity: 0.00000001, price: 60000 }),
  );
  assert.equal(closed.cash, INITIAL_CASH);
  assert.deepEqual(closed.positions, {});
});
test("paper order requires tradable fresh priced quote", () => {
  assert.equal(
    executeTrade(emptyWallet(), quote(), "buy", 1, now).wallet.cash,
    9900,
  );
  for (const q of [
    undefined,
    quote({ updated: now - 300001 }),
    quote({ updated: NaN }),
    quote({ updated: now + 60001 }),
    quote({ price: 0 }),
    quote({ price: null }),
    quote({ tradable: false }),
  ])
    assert.throws(() => executeTrade(emptyWallet(), q, "buy", 1, now));
  assert.ok(isFresh(quote({ updated: now - 300000 }), now));
});
test("portfolio total is unavailable if any held quote is missing/stale", () => {
  const w = applyTrade(emptyWallet(), trade());
  assert.equal(valuation(w, new Map(), now), null);
  assert.equal(
    valuation(w, new Map([["bitcoin", quote({ updated: now - 300001 })]]), now),
    null,
  );
  assert.equal(
    valuation(w, new Map([["bitcoin", quote({ price: 110 })]]), now),
    10020,
  );
});
test("ledger rejects malformed persisted state", () => {
  for (const value of [
    null,
    {},
    [{}],
    [trade({ time: "bad" })],
    Array(1001).fill(trade()),
  ])
    assert.throws(() => replayLedger(value));
});
test("missing API prices and changes stay missing rather than becoming zero", () => {
  const [q] = normalizeMarkets([
    {
      id: "x",
      name: "X",
      symbol: "xx",
      current_price: null,
      market_cap: null,
      price_change_percentage_24h: null,
      last_updated: null,
    },
  ]);
  assert.equal(q.price, null);
  assert.equal(q.change, null);
  assert.equal(q.cap, null);
  assert.ok(!isFresh(q));
  for (const v of [{}, [], { error: "limit" }])
    assert.throws(() => normalizeMarkets(v));
});
test("CoinGecko response normalization retains source timestamp", () => {
  const [q] = normalizeMarkets([
    {
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "btc",
      current_price: 100,
      price_change_percentage_24h: -4,
      market_cap: 1000,
      last_updated: new Date(now).toISOString(),
    },
  ]);
  assert.equal(q.updated, now);
  assert.equal(q.source, "CoinGecko");
  assert.equal(q.change, -4);
});
test("new pools have liquidity and identity and cannot be paper traded", () => {
  const [q] = normalizePools(
    {
      data: [
        {
          id: "eth_pool",
          attributes: {
            name: "Token / WETH",
            base_token_price_usd: "0.01",
            reserve_in_usd: "123",
            price_change_percentage: { h24: "12" },
            pool_created_at: "2026-10-23T00:00:00Z",
          },
          relationships: { base_token: { data: { id: "eth_token" } } },
        },
      ],
      included: [
        { id: "eth_token", attributes: { name: "Token", symbol: "T" } },
      ],
    },
    now,
  );
  assert.equal(q.name, "Token");
  assert.equal(q.cap, 123);
  assert.equal(q.price, 0.01);
  assert.equal(q.tradable, false);
  assert.equal(q.address, "eth_token");
  assert.throws(() => normalizePools({ data: [] }));
});
test("watchlist excludes stale quotes and ranks absolute moves", () => {
  const qs = [
    quote({ id: "a", change: 1 }),
    quote({ id: "b", change: -7 }),
    quote({ id: "c", change: 3 }),
    quote({ id: "d", change: 99, updated: 0 }),
    quote({ id: "e", change: 100, tradable: false }),
  ];
  assert.deepEqual(
    candidates(new Map(qs.map((q) => [q.id, q])), now).map((q) => q.id),
    ["b", "c", "a"],
  );
});
test("world clocks use named zones across differing daylight-saving transitions", () => {
  const date = new Date("2026-10-26T12:00:00Z");
  assert.equal(clockParts(date, "Europe/Stockholm").time, "13:00");
  assert.equal(clockParts(date, "America/New_York").time, "08:00");
  assert.equal(clockParts(date, "America/Toronto").time, "08:00");
  const winter = new Date("2026-12-10T12:00:00Z");
  assert.equal(clockParts(winter, "America/New_York").time, "07:00");
});

test("costed round trip loses only explicit fees and adverse price movement; old ledger still replays", () => {
  const costs = { feeBps: 10, slippageBps: 5 };
  const buy = executeTrade(emptyWallet(), quote(), "buy", 2, now, costs);
  const sell = executeTrade(buy.wallet, quote(), "sell", 2, now, costs);
  assert.ok(buy.trade.price > quote().price);
  assert.ok(sell.trade.price < quote().price);
  const loss = 2 * (buy.trade.price - sell.trade.price) + buy.trade.fee + sell.trade.fee;
  assert.ok(Math.abs(sell.wallet.cash - (INITIAL_CASH - loss)) < 1e-9);
  assert.ok(Math.abs(sell.wallet.realized + loss) < 1e-9);
  assert.deepEqual(sell.wallet.positions, {});
  assert.deepEqual(replayLedger([buy.trade, sell.trade]), sell.wallet);
  assert.equal(replayLedger([trade()]).cash, 9800);
});
test("fees prevent overspending and invalid costs cannot create money", () => {
  assert.throws(() => executeTrade(emptyWallet(), quote(), "buy", 100, now, { feeBps: 10 }), /saldo/);
  for (const fee of [-1, Infinity, NaN, 201])
    assert.throws(() => applyTrade(emptyWallet(), trade({ fee })));
  for (const costs of [{feeBps:-1},{slippageBps:NaN},{slippageBps:101}])
    assert.throws(() => executeTrade(emptyWallet(), quote(), "buy", 1, now, costs));
});
test("observed order book simulates adverse spread and partial IOC fill without inventing liquidity",()=>{
  const q=quote({price:100,bid:99,ask:101,bidSize:0.5,askSize:1,source:"Coinbase Exchange orderbok"});
  const buy=executeTrade(emptyWallet(),q,"buy",2,now,{feeBps:10,useOrderBook:true});
  assert.equal(buy.trade.quantity,1);assert.equal(buy.trade.remainingQuantity,1);assert.equal(buy.trade.price,101);
  assert.equal(buy.wallet.cash,10000-101-0.101);
  const sell=executeTrade(buy.wallet,q,"sell",1,now,{useOrderBook:true});
  assert.equal(sell.trade.quantity,0.5);assert.equal(sell.wallet.positions.bitcoin.quantity,0.5);
  for(const bad of [quote(),{...q,askSize:0},{...q,updated:now-10001}])
    assert.throws(()=>executeTrade(emptyWallet(),bad,"buy",1,now,{useOrderBook:true}));
});
