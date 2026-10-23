import test from "node:test";
import assert from "node:assert/strict";
import { providerConfig, providerReply } from "../server/providers.js";
const FREE = {
  AI_PROVIDER: "gemini",
  AI_USAGE_MODE: "free-test",
  GEMINI_API_KEY: "test-only-gemini-key",
  GEMINI_FREE_TIER_CONFIRMED: "true",
};
test("defaults are Gemini/free test, without a key it is disconnected", () => {
  const c = providerConfig({});
  assert.equal(c.id, "gemini");
  assert.equal(c.model, "gemini-3.8-flash");
  assert.equal(c.mode, "free-test");
  assert.equal(c.configured, false);
  assert.equal(c.minimumIntervalMs, 30000);
});
test("free test does not activate a key before owner confirms free project", () => {
  assert.equal(
    providerConfig({ ...FREE, GEMINI_FREE_TIER_CONFIRMED: "false" }).configured,
    false,
  );
  assert.equal(providerConfig(FREE).configured, true);
});
test("paid provider requires explicit paid mode and own key; no fallback", () => {
  assert.throws(
    () => providerConfig({ AI_PROVIDER: "openai", AI_API_KEY: "test" }),
    /paid/,
  );
  assert.equal(
    providerConfig({
      AI_PROVIDER: "openai",
      AI_USAGE_MODE: "paid",
      AI_API_KEY: "test",
    }).configured,
    true,
  );
  assert.equal(
    providerConfig({
      ...FREE,
      GEMINI_API_KEY: "",
      AI_API_KEY: "test-only-openai-key",
    }).configured,
    false,
  );
});
test("invalid provider/model/interval rejected before any network call", () => {
  for (const env of [
    { AI_PROVIDER: "unknown" },
    { GEMINI_MODEL: "https://evil.example/" },
    { AI_MIN_INTERVAL_SECONDS: "NaN" },
    { AI_MIN_INTERVAL_SECONDS: "-1" },
    { AI_USAGE_MODE: "unknown" },
    { GEMINI_MODEL: "gemini-flash-latest" },
    { GEMINI_MODEL: "gemini-paid-only-model" },
  ])
    assert.throws(() => providerConfig(env));
});
test("Gemini uses a fixed HTTPS host, header key, system role and no tools", async () => {
  const c = providerConfig(FREE);
  let captured;
  const text = await providerReply(
    c,
    async (url, options) => {
      captured = { url, options };
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "hidden reasoning" },
                { text: "Visible test answer" },
              ],
            },
          },
        ],
      });
    },
    "Fixed role",
    { message: "Untrusted question" },
  );
  assert.equal(text, "Visible test answer");
  assert.ok(
    captured.url.startsWith("https://generativelanguage.googleapis.com/"),
  );
  assert.ok(!captured.url.includes(FREE.GEMINI_API_KEY));
  assert.equal(captured.options.headers["x-goog-api-key"], FREE.GEMINI_API_KEY);
  const p = JSON.parse(captured.options.body);
  assert.equal(p.systemInstruction.parts[0].text, "Fixed role");
  assert.match(p.contents[0].parts[0].text, /Untrusted question/);
  assert.ok(!("tools" in p));
  assert.equal(p.generationConfig.maxOutputTokens, 2048);
  assert.ok(captured.url.endsWith("/gemini-3.8-flash:generateContent"));
  assert.ok(!("thinkingConfig" in p.generationConfig));
});
test("quota error makes exactly one call and never falls back", async () => {
  let calls = 0;
  await assert.rejects(
    providerReply(
      providerConfig(FREE),
      async () => {
        calls++;
        return new Response("test-only-sensitive-provider-body", {
          status: 429,
        });
      },
      "role",
      {},
    ),
    (e) => e.status === 429 && !e.message.includes("sensitive"),
  );
  assert.equal(calls, 1);
});
test("temporary provider overload is reported honestly without blaming credentials or retrying",async()=>{
  let calls=0;
  await assert.rejects(providerReply(providerConfig(FREE),async()=>{calls++;return new Response("private-body",{status:503});},"role",{}),e=>e.status===503 && /överbelastad/.test(e.message) && !/serverinställning/.test(e.message));
  assert.equal(calls,1);
});
test("blocked/truncated/empty/malformed replies are not fabricated", async () => {
  for (const data of [
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "partial" }] },
        },
      ],
    },
    { candidates: [] },
  ])
    await assert.rejects(
      providerReply(
        providerConfig(FREE),
        async () => Response.json(data),
        "role",
        {},
      ),
    );
  await assert.rejects(
    providerReply(
      providerConfig(FREE),
      async () => new Response("invalid-json"),
      "role",
      {},
    ),
    /ogiltigt/,
  );
});
