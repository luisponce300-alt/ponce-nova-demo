import test from "node:test";
import assert from "node:assert/strict";
import { createFeeds } from "../server/feeds.js";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const ticker = { price:"100",bid:"99",ask:"101",volume:"1200",time:new Date(NOW).toISOString() };
test("exchange USD quotes preserve provider time through caching and reject arbitrary symbols", async()=>{
  let calls=0, time=NOW;
  const feeds=createFeeds({now:()=>time,fetcher:async(url)=>{calls++;assert.match(url,/^https:\/\/api.exchange.coinbase.com\/products\/BTC-USD\/ticker$/);return Response.json(ticker);}});
  const first=await feeds.crypto(["bitcoin"]);
  assert.equal(first.quotes[0].source,"Coinbase Exchange");assert.equal(first.quotes[0].updated,NOW);
  assert.equal(first.quotes[0].bid,99);assert.equal(first.quotes[0].cap,null);
  time+=10000;
  assert.equal((await feeds.crypto(["bitcoin"])).quotes[0].updated,NOW);
  assert.equal(calls,1);
  await assert.rejects(feeds.crypto(["https://evil.test"]),e=>e.status===400);
  await assert.rejects(feeds.crypto(Array(51).fill("bitcoin")),e=>e.status===400);
});
test("quota/failure produces missing data, host cooldown and observable error, never substitute prices", async()=>{
  let calls=0;
  const feeds=createFeeds({now:()=>NOW,fetcher:async()=>{calls++;return new Response("{}",{status:429});}});
  assert.deepEqual((await feeds.crypto(["bitcoin"])).missing,["bitcoin"]);
  assert.equal((await feeds.crypto(["ethereum"])).quotes.length,0);
  assert.equal(calls,2); // Exchange failed once; independent CoinGecko fallback failed once.
  assert.equal(feeds.status()["coinbase:bitcoin"].state,"error");
});
test("best-level order book is an explicit observation with sizes and rejects crossed/invalid books",async()=>{
  let crossed=false;
  const feeds=createFeeds({now:()=>NOW,fetcher:async()=>Response.json({bids:[[crossed?"102":"99","2","1"]],asks:[["101","3","1"]]})});
  const quote=await feeds.executionQuote("bitcoin");
  assert.equal(quote.askSize,3);assert.equal(quote.bidSize,2);assert.equal(quote.timestampType,"server-observation");
  assert.equal(quote.updated,NOW);
  await assert.rejects(feeds.executionQuote("unknown"),e=>e.status===400);
  const bad=createFeeds({now:()=>NOW,fetcher:async()=>Response.json({bids:[["102","2"]],asks:[["101","3"]]})});
  await assert.rejects(bad.executionQuote("bitcoin"));
});
test("overview labels a gold future accurately and preserves unavailable instruments",async()=>{
  const feeds=createFeeds({now:()=>NOW,fetcher:async(url)=>url.includes("GSPTSE")?new Response("{}",{status:503}):Response.json({chart:{result:[{meta:{regularMarketPrice:100,regularMarketTime:NOW/1000,currency:"USD",exchangeDataDelayedBy:15}}]}})});
  const data=await feeds.overview();
  assert.equal(data.length,4);assert.equal(data[2].price,null);
  assert.equal(data[3].name,"Guldtermin (GC=F)");assert.equal(data[3].updated,NOW);assert.equal(data[3].delayMinutes,15);
});
test("official calendar only accepts supported source UTC dates and future events",async()=>{
  const ics="BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261024T123000Z\r\nSUMMARY:Employment\\, report\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Unknown:20261025T083000\r\nSUMMARY:Never guess this zone\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const feeds=createFeeds({now:()=>NOW,fetcher:async()=>new Response(ics)});
  const data=await feeds.calendar();
  assert.equal(data.events.length,1);assert.equal(data.events[0].title,"Employment, report");
  assert.equal(data.events[0].time,Date.parse("2026-10-24T12:30:00Z"));
});
