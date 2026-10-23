import { normalizeMarkets } from "../core.js";

export const PRODUCTS = Object.freeze({
  bitcoin: ["BTC-USD", "Bitcoin"], ethereum: ["ETH-USD", "Ethereum"],
  solana: ["SOL-USD", "Solana"], ripple: ["XRP-USD", "XRP"],
  cardano: ["ADA-USD", "Cardano"], dogecoin: ["DOGE-USD", "Dogecoin"],
  chainlink: ["LINK-USD", "Chainlink"], litecoin: ["LTC-USD", "Litecoin"],
});
const DEFAULT_IDS = ["bitcoin", "ethereum", "solana", "ripple", "cardano", "dogecoin"];
const error = (message, status = 502) => Object.assign(new Error(message), { status });
const number = (v) => v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

export function createFeeds({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), status = new Map(), pauses = new Map();
  async function request(id, url, ttl = 60000, json = true) {
    const old = cache.get(id);
    if (old && now() - old.received < ttl) return old;
    if (pending.has(id)) return pending.get(id);
    const host = new URL(url).host;
    if (now() < (pauses.get(host) || 0)) throw error("Datakällans anropsgräns är pausad.", 429);
    const task = (async () => {
      try {
        const response = await fetcher(url, {
          headers: { Accept: json ? "application/json" : "text/calendar", "User-Agent": "PonceNovaPreview/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          if (response.status === 429) pauses.set(host, now() + Math.max(60000, Math.min(900000, (Number(response.headers.get("Retry-After")) || 60) * 1000)));
          throw error(`Datakällan svarade HTTP ${response.status}.`, response.status === 429 ? 429 : 502);
        }
        const text = await response.text();
        if (text.length > 3000000) throw error("Datakällans svar är för stort.");
        const entry = { data: json ? JSON.parse(text) : text, received: now() };
        cache.set(id, entry);
        if (cache.size > 256) cache.delete(cache.keys().next().value);
        status.set(id, { state: "ok", lastSuccess: entry.received, lastAttempt: entry.received });
        if (status.size > 256) status.delete(status.keys().next().value);
        return entry;
      } catch (e) {
        status.set(id, { state: "error", lastSuccess: old?.received || null, lastAttempt: now(), message: e.status ? e.message : "Datakällan kunde inte nås eller tolkas." });
        throw error(e.status ? e.message : "Datakällan kunde inte nås eller tolkas.", e.status || 502);
      }
    })();
    pending.set(id, task);
    try { return await task; } finally { pending.delete(id); }
  }
  function validateIds(ids) {
    if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)))
      throw error("Ogiltig lista med innehav.", 400);
    return [...new Set(ids)];
  }
  async function ticker(id) {
    const [product, name] = PRODUCTS[id];
    const entry = await request(`coinbase:${id}`, `https://api.exchange.coinbase.com/products/${product}/ticker`, 15000);
    const d = entry.data, price = number(d.price), updated = Date.parse(d.time);
    if (!(price > 0) || !Number.isFinite(updated)) throw error("Börsen saknar giltig kurs/tid.");
    return { id, name, symbol: product.split("-")[0], price, updated,
      bid: number(d.bid), ask: number(d.ask), bookObserved: entry.received,
      volume24h: number(d.volume), change: null, cap: null,
      source: "Coinbase Exchange", tradable: true, received: entry.received };
  }
  async function crypto(ids = DEFAULT_IDS) {
    ids = validateIds(ids);
    const quotes = [];
    let missing = [];
    const supported = ids.filter(id => Object.hasOwn(PRODUCTS, id));
    // Three concurrent public exchange requests, bounded independently of user input.
    for (let i = 0; i < supported.length; i += 3) {
      const results = await Promise.allSettled(supported.slice(i, i + 3).map(ticker));
      results.forEach((r, j) => r.status === "fulfilled" ? quotes.push(r.value) : missing.push(supported[i + j]));
    }
    const rest = [...ids.filter(id => !Object.hasOwn(PRODUCTS, id)), ...missing];
    missing = [];
    if (rest.length) {
      try {
        const entry = await request(`holdings:${rest.slice().sort().join(",")}`, `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(rest.join(","))}&sparkline=false`);
        const rows = normalizeMarkets(entry.data);
        quotes.push(...rows);
        missing.push(...rest.filter(id => !rows.some(q => q.id === id)));
      } catch { missing.push(...rest); }
    }
    return { quotes, missing, received: now() };
  }
  async function executionQuote(id) {
    if (!Object.hasOwn(PRODUCTS, id)) throw error("Orderboksmodellen stöder inte denna token. Använd tydligt märkt referenssimulering.", 400);
    const [product, name] = PRODUCTS[id];
    const e = await request(`book:${id}`, `https://api.exchange.coinbase.com/products/${product}/book?level=1`, 2000);
    const bid = number(e.data.bids?.[0]?.[0]), ask = number(e.data.asks?.[0]?.[0]);
    const bidSize = number(e.data.bids?.[0]?.[1]), askSize = number(e.data.asks?.[0]?.[1]);
    if (!(bid > 0 && ask >= bid && bidSize > 0 && askSize > 0)) throw error("Orderboken saknar användbara köp-/säljkurser.");
    return { id, name, symbol: product.split("-")[0], price: (bid + ask) / 2,
      bid, ask, bidSize, askSize, updated: e.received, received: e.received,
      timestampType: "server-observation", source: "Coinbase Exchange orderbok", tradable: true };
  }
  async function overview() {
    const instruments = [
      ["stockholm", "^OMX", "OMX Stockholm 30", "indexpunkter"],
      ["new-york", "^GSPC", "S&P 500", "indexpunkter"],
      ["toronto", "^GSPTSE", "S&P/TSX Composite", "indexpunkter"],
      ["gold", "GC=F", "Guldtermin (GC=F)", "USD/troy ounce"],
    ];
    return Promise.all(instruments.map(async ([id, symbol, name, unit]) => {
      try {
        const e = await request(`overview:${id}`, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`, 300000);
        const m = e.data.chart?.result?.[0]?.meta;
        if (!(number(m?.regularMarketPrice) > 0) || !Number.isFinite(m?.regularMarketTime)) throw error("Kurs saknas.");
        return { id, name, unit, price: m.regularMarketPrice, updated: m.regularMarketTime * 1000,
          currency: m.currency, delayMinutes: number(m.exchangeDataDelayedBy), source: "Yahoo Finance", received: e.received };
      } catch { return { id, name, unit, price: null, source: "Yahoo Finance", error: "Källan är inte tillgänglig." }; }
    }));
  }
  async function calendar() {
    const e = await request("calendar:bls", "https://www.bls.gov/schedule/news_release/bls.ics", 3600000, false);
    const unfolded = e.data.replace(/\r?\n[ \t]/g, "");
    const events = [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].map(([, block]) => {
      const start = block.match(/^DTSTART(?:;[^:]*)?:(\d{8}T\d{6}Z)\s*$/m)?.[1];
      const summary = block.match(/^SUMMARY:(.*)$/m)?.[1]?.trim();
      if (!start || !summary) return null; // Never guess unsupported local-time/TZID timestamps.
      const iso = `${start.slice(0,4)}-${start.slice(4,6)}-${start.slice(6,8)}T${start.slice(9,11)}:${start.slice(11,13)}:${start.slice(13,15)}Z`;
      return { title: summary.replace(/\\n/g, " ").replace(/\\([,;\\])/g, "$1").slice(0,240), time: Date.parse(iso) };
    }).filter(e => e && Number.isFinite(e.time) && e.time >= now()).sort((a,b) => a.time-b.time).slice(0,20);
    return { events, source: "U.S. Bureau of Labor Statistics", scope: "Endast amerikanska BLS-publiceringar med UTC-tid i källan", received: e.received };
  }
  return { crypto, executionQuote, overview, calendar, status: () => Object.fromEntries(status) };
}
