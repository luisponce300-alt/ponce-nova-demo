# AI choice for development and later production

Decision: use **Gemini 3.8 Flash** through the Gemini Developer API during the build/test phase. Google's [current official pricing page](https://ai.google.dev/gemini-api/docs/pricing) was checked on 2026-10-23: standard text input and output have a Free Tier, with quotas. The model is pinned to `gemini-3.8-flash`; a `latest` alias is deliberately not used because an alias can change without review. A live setup check found that 2.5 Flash returns HTTP 404 for new users despite appearing in the model list; Google directs those users to 3.8 Flash. The [text generation API](https://ai.google.dev/gemini-api/docs/text-generation) uses `generateContent` with an API key in the `x-goog-api-key` header, never in a URL or browser script.

Free service depends on the **Google project's actual billing tier**, not merely the model name or a server flag. The owner must create/use a Google AI Studio project showing **Free tier** with no billing enabled. The server cannot independently inspect the project's billing account from an API key. `GEMINI_FREE_TIER_CONFIRMED=true` records the owner's check; it is not a billing-enforcement API. Adding an arbitrary billed-project key can incur charges even when the server is labeled a test.

Free-tier terms can permit Google to use input/output to improve products. The pricing table explicitly marks this as **Yes** for the checked model's free tier and **No** for the paid tier. Use only non-sensitive test data. The dashboard explains this before opting into AI. Before actual production, choose a paid provider/model after evaluating answer quality, privacy terms, reliability, latency and costs; do not claim a model is universally best. No paid mode is activated by the owner's willingness to consider it later.

## Test configuration

| Variable | Value / action |
| --- | --- |
| `AI_PROVIDER` | `gemini` |
| `AI_USAGE_MODE` | `free-test` |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `GEMINI_API_KEY` | Owner supplies it securely in Render, from the Free-tier Google project |
| `GEMINI_FREE_TIER_CONFIRMED` | `true` only after the owner checks that project is on Free tier without billing; defaults to `false` |
| `AI_MIN_INTERVAL_SECONDS` | `30` |
| `MAX_AGENT_RUNS_PER_HOUR` | `20` per server process |

Only `gemini-3.8-flash`, `gemini-2.5-flash` and `gemini-2.5-flash-lite` are permitted in free-test mode at this revision, based on their checked Free Tier listings. Unknown/paid-only models and OpenAI in free-test mode are rejected before any call. Configuration must be reviewed if provider pricing, availability or terms change. Free access may vary by account/region and is not guaranteed indefinitely.

All seven agent roles share the selected provider. A board review makes seven explicit calls with pauses between roles. The user can stop upcoming calls during a pause; a call already sent can still complete. Server-side spacing, per-process quotas and concurrency limits also apply. HTTP 429 stops the operation and asks the user to wait. No automatic retry, second model, OpenAI fallback or hidden paid upgrade occurs. Process limits reset on restart and are not guaranteed account spending caps.

Gemini receives fixed system instructions, a user message and the same server-verified fresh market observations / explicitly unverified local paper context used by the other adapter. There are no tools, automatic orders, background schedules, web search or grounding. Generated output (including any thinking tokens) is capped at 2,048 tokens. The legacy 2.5 Flash configuration also sets an explicit thinking budget; that legacy parameter is omitted for 3.8 Flash. Blocked, truncated and empty output is treated as a failure; internal thought parts are excluded from chat.

## Secure setup for the owner

1. Open [Google AI Studio API keys](https://aistudio.google.com/apikey) and sign in to Google.
2. Create/select a test project and create its API key. Verify that the project's API plan is **Free tier** and do not enable billing for this test.
3. Open [the Render test service](https://dashboard.render.com/web/srv-dbdntugae00c738rqj6g), then **Environment**.
4. Set **GEMINI_API_KEY** to the key in Render's protected value field. Keep the value out of chat, Git, screenshots and frontend code.
5. Once the free-tier check is complete, set **GEMINI_FREE_TIER_CONFIRMED** to **true**.
6. Save/redeploy the test service, then validate a real agent answer and the returned provider/model. The app will not claim connected AI until a configured key and confirmation exist; a configured key can still fail and must be live-tested.

The assistant does not have Google account access and cannot create/accept terms for an owner key. Existing Render management authentication is separate and already works; do not request it again. Do not copy a cloud-proxy credential placeholder into Render.

## Explicit paid mode later

The existing OpenAI Responses adapter remains available with `AI_PROVIDER=openai`, `AI_USAGE_MODE=paid`, server-only `AI_API_KEY` and `AI_MODEL`. Paid Gemini is also selectable with `AI_USAGE_MODE=paid`. These are explicit changes for a later approved production decision, not automatic fallbacks. The production website, broker integration and real trading still require separate review and authorization. Paid-provider selection does not itself make the app ready for real money.

## Tests

`npm test` covers provider selection, missing key and free-tier confirmation, paid-mode rejection, model allowlists, secure request shape, quota behavior without fallback, filtered/blocked/truncated output, and protected server integration. `python3 tests/server_browser_test.py` exercises both provider adapters with test-only transport, correct provider labels, opt-in chat, seven-role board, cancellation during a quota pause and unchanged paper balances. A real authenticated Nova reply through Gemini 3.8 Flash was verified on the isolated Render test service after the owner supplied the key and confirmed Free tier. The response explicitly identified its simulated role and lack of real-order authority. This is an integration check, not an evaluation of every role or model quality.
