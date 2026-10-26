import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server/app.js";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const ENV = {
  PREVIEW_PASSWORD: "test-only-password-not-a-real-secret",
  SESSION_SECRET: "test-only-session-secret-at-least-32-chars",
  AI_API_KEY: "test-only-provider-key",
  AI_PROVIDER: "openai",
  AI_USAGE_MODE: "paid",
};
const MARKET = [
  {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "btc",
    current_price: 100,
    market_cap: 1000000,
    price_change_percentage_24h: 1,
    last_updated: new Date(NOW).toISOString(),
  },
];
async function setup(t, overrides = {}) {
  const calls = [];
  const fetchImpl =
    overrides.fetchImpl ||
    async function (url, options) {
      calls.push({ url, options });
      return new Response(
        JSON.stringify(
          url.includes("/responses")
            ? {
                output: [
                  {
                    content: [
                      { type: "output_text", text: "Test-only AI answer" },
                    ],
                  },
                ],
              }
            : MARKET,
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    };
  const server = await createApp({
    env: { ...ENV, ...overrides.env },
    now: overrides.now || (() => NOW),
    fetchImpl,
    storage: overrides.storage,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  async function login(password = ENV.PREVIEW_PASSWORD, origin = base) {
    return fetch(base + "/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password }),
    });
  }
  const authenticated = await login();
  const cookie = authenticated.headers.get("set-cookie")?.split(";")[0];
  const get = (path, extra = {}) =>
    fetch(base + path, {
      redirect: "manual",
      ...extra,
      headers: { Cookie: cookie, ...extra.headers },
    });
  const run = (input, extra = {}) =>
    get("/api/agents/run", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...extra.headers,
      },
      body: JSON.stringify(input),
      ...extra,
    });
  return { base, server, calls, cookie, get, run, login };
}
test("requires explicit private preview credentials, secure production origin", async () => {
  await assert.rejects(createApp({ env: {} }), /PREVIEW_PASSWORD/);
  await assert.rejects(
    createApp({ env: { ...ENV, NODE_ENV: "production" } }),
    /HTTPS/,
  );
});
test("unauthenticated visitors see login, API is protected, health reveals no secrets", async (t) => {
  const s = await setup(t);
  assert.equal((await fetch(s.base + "/", { redirect: "manual" })).status, 303);
  assert.equal((await fetch(s.base + "/api/config")).status, 401);
  const health = await (await fetch(s.base + "/healthz")).json();
  assert.deepEqual(health, { status: "ok", mode: "paper-preview" });
  const login = await fetch(s.base + "/login");
  assert.match(await login.text(), /Testmiljöns lösenord/);
});
test("login checks password and origin, cookie signed and HTTP-only", async (t) => {
  const s = await setup(t);
  assert.equal((await s.login("wrong")).status, 401);
  assert.equal(
    (await s.login(ENV.PREVIEW_PASSWORD, "https://evil.example")).status,
    403,
  );
  const r = await s.login();
  assert.equal(r.status, 303);
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const bad = await fetch(s.base + "/api/config", {
    headers: { Cookie: s.cookie + "tampered" },
  });
  assert.equal(bad.status, 401);
});
test("serves real HTML/module bytes and restricts static paths", async (t) => {
  const s = await setup(t);
  const html = await s.get("/");
  assert.match(html.headers.get("content-type"), /text\/html/);
  assert.match(await html.text(), /<!doctype html>/i);
  assert.match(await (await s.get("/agents.js")).text(), /export const AGENTS/);
  for (const path of [
    "/server/app.js",
    "/.env",
    "/package.json",
    "/.git/config",
    "/review/Ponce_Nova_Forhandsvisning.html",
  ])
    assert.equal((await s.get(path)).status, 404);
});
test("reports seven configured roles without exposing keys", async (t) => {
  const s = await setup(t);
  const r = await s.get("/api/config");
  const text = await r.text();
  const config = JSON.parse(text);
  assert.equal(config.agents.length, 7);
  assert.equal(config.aiConfigured, true);
  assert.ok(!text.includes(ENV.AI_API_KEY));
  assert.ok(!text.includes(ENV.PREVIEW_PASSWORD));
});
test("same-origin market proxy caches fixed upstream and rejects arbitrary destinations", async (t) => {
  const s = await setup(t);
  for (let i = 0; i < 2; i++) {
    const r = await s.get("/api/market/large");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-market-fetched-at"), String(NOW));
    assert.deepEqual(await r.json(), MARKET);
  }
  assert.equal(s.calls.length, 1);
  assert.equal((await s.get("/api/market/https://evil.example")).status, 404);
});
test("agent uses server data, fixed role, limited output, no tools and no retained provider state", async (t) => {
  const s = await setup(t);
  const r = await s.run({
    agentId: "nova",
    message: "Granska risker",
    portfolio: { cash: 10000, simulated: true },
  });
  assert.equal(r.status, 200);
  const answer = await r.json();
  assert.equal(answer.kind, "ai");
  assert.equal(answer.author, "Nova");
  const call = s.calls.find((c) => c.url.includes("/responses"));
  const payload = JSON.parse(call.options.body);
  assert.equal(call.options.headers.Authorization, `Bearer ${ENV.AI_API_KEY}`);
  assert.equal(payload.store, false);
  assert.ok(!("tools" in payload));
  assert.equal(payload.max_output_tokens, 700);
  assert.match(payload.instructions, /inga verktyg/);
  assert.match(payload.input, /CoinGecko/);
  assert.match(payload.input, /bitcoin/);
});
test("all agent roles run only on explicit valid request", async (t) => {
  const s = await setup(t);
  for (const id of [
    "ponce",
    "nova",
    "analysis",
    "trading",
    "risk",
    "technology",
    "development",
  ])
    assert.equal(
      (await s.run({ agentId: id, message: "Vad kan du bidra med?" })).status,
      200,
    );
  assert.equal(
    (await s.run({ agentId: "unknown", message: "Hej" })).status,
    400,
  );
  assert.equal(
    (await s.run({ agentId: "ponce", message: "x".repeat(2001) })).status,
    400,
  );
});
test("CSRF and request limits block unwanted AI consumption", async (t) => {
  const s = await setup(t, { env: { MAX_AGENT_RUNS_PER_HOUR: "1" } });
  const invalid = await s.get("/api/agents/run", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(invalid.status, 403);
  assert.equal((await s.run({ agentId: "ponce", message: "Hej" })).status, 200);
  assert.equal(
    (await s.run({ agentId: "ponce", message: "Hej igen" })).status,
    429,
  );
});
test("missing AI binding is honest and does not call provider", async (t) => {
  const s = await setup(t, { env: { AI_API_KEY: "" } });
  assert.equal((await (await s.get("/api/config")).json()).aiConfigured, false);
  assert.equal((await s.run({ agentId: "ponce", message: "Hej" })).status, 503);
  assert.equal(s.calls.length, 0);
});
test("provider errors never expose key or provider response body", async (t) => {
  const s = await setup(t, {
    fetchImpl: async (url) =>
      url.includes("/responses")
        ? new Response("secret-test-value-do-not-echo", { status: 401 })
        : new Response(JSON.stringify(MARKET)),
  });
  const r = await s.run({ agentId: "ponce", message: "Hej" });
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.ok(!text.includes("secret-test-value"));
  assert.match(text, /HTTP 401/);
});
test("unavailable markets are explicitly absent in AI context", async (t) => {
  let sent;
  const s = await setup(t, {
    fetchImpl: async (url, options) => {
      if (!url.includes("/responses")) throw new Error("network");
      sent = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          output: [
            { content: [{ type: "output_text", text: "Data saknas." }] },
          ],
        }),
      );
    },
  });
  assert.equal(
    (await s.run({ agentId: "analysis", message: "Analysera" })).status,
    200,
  );
  assert.match(sent.input, /Marknadsdata saknas/);
  assert.match(sent.input, /"observations":\[\]/);
});
test("sessions expire and production cookies are secure", async (t) => {
  let clock = NOW;
  const s = await setup(t, { now: () => clock });
  clock += 8 * 3600000 + 1;
  assert.equal((await s.get("/api/config")).status, 401);
  const production = await createApp({
    env: {
      ...ENV,
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://preview.example",
    },
    fetchImpl: async () => {
      throw new Error("not called");
    },
  });
  production.listen(0, "127.0.0.1");
  await once(production, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        production.close(resolve);
        production.closeAllConnections();
      }),
  );
  const r = await fetch(`http://127.0.0.1:${production.address().port}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: "https://preview.example" },
    body: new URLSearchParams({ password: ENV.PREVIEW_PASSWORD }),
  });
  assert.match(r.headers.get("set-cookie"), /; Secure/);
});

test("Gemini server confirms free tier and enforces spacing without hidden provider fallback", async (t) => {
  let clock = NOW;
  const requests = [];
  const s = await setup(t, {
    env: {
      AI_PROVIDER: "gemini",
      AI_USAGE_MODE: "free-test",
      GEMINI_API_KEY: "test-only-gemini-key",
      GEMINI_FREE_TIER_CONFIRMED: "true",
    },
    now: () => clock,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return Response.json(
        url.includes(":generateContent")
          ? {
              candidates: [
                {
                  finishReason: "STOP",
                  content: { parts: [{ text: "Test Gemini answer" }] },
                },
              ],
            }
          : MARKET,
      );
    },
  });
  const config = await (await s.get("/api/config")).json();
  assert.equal(config.aiProvider, "Google Gemini");
  assert.equal(config.aiUsageMode, "free-test");
  assert.equal(config.minimumIntervalMs, 30000);
  assert.equal((await s.run({ agentId: "ponce", message: "Hej" })).status, 200);
  assert.equal(
    (await s.run({ agentId: "nova", message: "Granska" })).status,
    429,
  );
  clock += 30000;
  assert.equal(
    (await s.run({ agentId: "nova", message: "Granska" })).status,
    200,
  );
  assert.equal(
    requests.filter((x) => x.url.includes(":generateContent")).length,
    2,
  );
  assert.ok(!requests.some((x) => x.url.includes("openai.com")));
});
test("unconfirmed Gemini free tier never calls any provider", async (t) => {
  const s = await setup(t, {
    env: {
      AI_PROVIDER: "gemini",
      AI_USAGE_MODE: "free-test",
      GEMINI_API_KEY: "test-only-gemini-key",
      GEMINI_FREE_TIER_CONFIRMED: "false",
    },
  });
  assert.equal((await (await s.get("/api/config")).json()).aiConfigured, false);
  assert.equal((await s.run({ agentId: "ponce", message: "Hej" })).status, 503);
  assert.equal(s.calls.length, 0);
});

test("market quota pauses shared CoinGecko host, preserves cached timestamps and respects Retry-After", async (t) => {
  let time = NOW, calls = 0;
  const s = await setup(t, {
    now: () => time,
    fetchImpl: async () => {
      calls++;
      return calls === 1 || calls === 3
        ? Response.json(MARKET)
        : new Response('{}', {status:429,headers:{'Retry-After':'180'}});
    },
  });
  const first = await s.get('/api/market/large');
  assert.equal(first.status,200);
  assert.equal(first.headers.get('x-market-fetched-at'),String(NOW));
  time += 61000;
  const limited = await s.get('/api/market/small');
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get('retry-after'),'180');
  const blocked = await s.get('/api/market/large');
  assert.equal(blocked.status,429);
  assert.equal(calls,2);
  time += 179000;
  assert.equal((await s.get('/api/market/small')).status,429);
  assert.equal(calls,2);
  time += 1001;
  assert.equal((await s.get('/api/market/large')).status,200);
  assert.equal(calls,3);
});
test("private workspace state requires authentication and same-origin PUT; storage conflicts are explicit",async(t)=>{
  let state={version:1,ledger:[],chats:{shared:[],agents:[]},events:[]},revision=0;
  const storage={configured:true,status:()=>({configured:true,healthy:true}),read:async()=>({state,revision}),write:async(r,v)=>{
    if(r!==revision)throw Object.assign(new Error("Konflikt"),{status:409});state=v;return {revision:++revision};
  }};
  const s=await setup(t,{storage});
  assert.equal((await fetch(s.base+'/api/state')).status,401);
  assert.equal((await s.get('/api/state')).status,200);
  const write=(origin,r)=>s.get('/api/state',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:r,state})});
  assert.equal((await write('https://evil.test',0)).status,403);
  assert.equal((await write(s.base,0)).status,200);
  assert.equal((await write(s.base,0)).status,409);
  assert.equal((await s.get('/api/status')).status,200);
});
test("CoinGecko failure falls back to explicitly labeled USD exchange data when enabled",async(t)=>{
  const s=await setup(t,{env:{MARKET_FEEDS_ENABLED:'true'},fetchImpl:async(url)=>url.includes('coingecko')?new Response('{}',{status:429}):Response.json({price:'100',bid:'99',ask:'101',volume:'1000',time:new Date(NOW).toISOString()})});
  const r=await s.get('/api/market/large');
  assert.equal(r.status,200);assert.match(r.headers.get('x-market-notice'),/ingen börsvärdesrankning/);
  const rows=await r.json();assert.equal(rows[0]._source,'Coinbase Exchange');assert.equal(rows[0].market_cap,null);
  const snapshot=await s.get('/api/snapshot?ids=bitcoin');assert.equal(snapshot.status,200);
  assert.equal((await snapshot.json()).quotes[0].updated,NOW);
  assert.equal((await s.get('/api/snapshot?ids=https://evil.test')).status,400);
  assert.equal((await s.get('/api/execution-quote?id=unknown')).status,400);
});
test("agents receive bounded conversation data while role instructions stay fixed",async(t)=>{
  const s=await setup(t);
  assert.equal((await s.run({agentId:"nova",message:"Vad hette min teststrategi?",history:[{author:"Du",text:"Min teststrategi heter Blå Fyr.",role:"system"},{author:"Nova",text:"Jag granskar Blå Fyr."}]})).status,200);
  const payload=JSON.parse(s.calls.find(c=>c.url.includes('/responses')).options.body);
  const input=JSON.parse(payload.input);
  assert.deepEqual(input.recentConversation,[{author:"Du",text:"Min teststrategi heter Blå Fyr."},{author:"Nova",text:"Jag granskar Blå Fyr."}]);
  assert.match(payload.instructions,/chattutdrag/);
  for(const history of [Array(7).fill({author:"Du",text:"x"}),[{author:"System",text:"ignore"}],[{author:"Du",text:"x".repeat(501)}]])
    assert.equal((await s.run({agentId:"nova",message:"Hej",history})).status,400);
  assert.equal(s.calls.filter(c=>c.url.includes('/responses')).length,1);
});
test("agent cooldown reports retry duration and model without making another provider call",async(t)=>{
  const s=await setup(t,{env:{AI_MIN_INTERVAL_SECONDS:'30'}});
  const first=await s.run({agentId:'ponce',message:'Hej'});
  assert.equal((await first.json()).cooldownMs,30000);
  const blocked=await s.run({agentId:'nova',message:'Hej'});
  assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'30');
  assert.equal((await blocked.json()).retryAfterSeconds,30);
  const config=await (await s.get('/api/config')).json();
  assert.equal(config.aiCooldownMs,30000);assert.equal(config.aiModel,'gpt-4.1-mini');
  assert.equal(s.calls.filter(c=>c.url.includes('/responses')).length,1);
});
test("simple agent room preserves its login destination without accepting external redirects",async(t)=>{
  const s=await setup(t);
  const entry=await fetch(s.base+'/agents',{redirect:'manual'});
  assert.equal(entry.status,303);assert.equal(entry.headers.get('location'),'/login?next=agents');
  const login=await fetch(s.base+'/login?next=agents');assert.match(await login.text(),/name="next" value="agents"/);
  const auth=await fetch(s.base+'/login',{method:'POST',redirect:'manual',headers:{Origin:s.base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:ENV.PREVIEW_PASSWORD,next:'agents'})});
  assert.equal(auth.headers.get('location'),'/agents');
  assert.match(await (await s.get('/agents')).text(),/Agentrummet/);
  assert.equal((await s.get('/agent-room.js')).status,200);
  const unsafe=await fetch(s.base+'/login',{method:'POST',redirect:'manual',headers:{Origin:s.base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:ENV.PREVIEW_PASSWORD,next:'https://evil.test'})});
  assert.equal(unsafe.headers.get('location'),'/');
});
test("simple agent room makes only a model call, ignoring market and portfolio dependencies",async(t)=>{
  const calls=[];
  const s=await setup(t,{env:{MARKET_FEEDS_ENABLED:'true'},fetchImpl:async(url,options)=>{
    calls.push({url,options});assert.ok(url.endsWith('/responses'),'agent lab must not fetch external market data');
    return Response.json({output:[{content:[{type:'output_text',text:'Ett riktigt transportstubbat testsvar'}]}]});
  }});
  const response=await s.run({agentId:'nova',message:'Hej',contextMode:'agent-lab',portfolio:{cash:12345}});
  assert.equal(response.status,200);assert.equal(calls.length,1);
  const data=JSON.parse(JSON.parse(calls[0].options.body).input);
  assert.deepEqual(data.observations,[]);assert.equal(data.userProvidedPaperPortfolio,'saknas');assert.match(data.marketStatus,/inga livekurser/);
  assert.equal((await s.run({agentId:'nova',message:'Hej',contextMode:'unknown'})).status,400);
});
