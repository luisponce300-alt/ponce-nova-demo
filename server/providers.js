// Provider choice is explicit. Never switch to a paid provider on quota/error.
export function providerConfig(env) {
  const id = env.AI_PROVIDER || "gemini";
  if (!["gemini", "openai"].includes(id))
    throw new Error("AI_PROVIDER måste vara gemini eller openai.");
  const mode = env.AI_USAGE_MODE || "free-test";
  if (!["free-test", "paid"].includes(mode))
    throw new Error("AI_USAGE_MODE måste vara free-test eller paid.");
  if (id === "openai" && mode !== "paid")
    throw new Error(
      "OpenAI kräver uttrycklig AI_USAGE_MODE=paid. Ingen betald fallback är tillåten.",
    );
  const model =
    id === "gemini"
      ? env.GEMINI_MODEL || "gemini-3.8-flash"
      : env.AI_MODEL || "gpt-4.1-mini";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model))
    throw new Error("Ogiltigt modellnamn.");
  if (
    id === "gemini" &&
    mode === "free-test" &&
    !["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(model)
  )
    throw new Error(
      "Modellen är inte tillåten i gratis-testläget. Betald drift kräver ett uttryckligt byte.",
    );
  const key = id === "gemini" ? env.GEMINI_API_KEY : env.AI_API_KEY;
  const freeTierConfirmed =
    id !== "gemini" ||
    mode !== "free-test" ||
    env.GEMINI_FREE_TIER_CONFIRMED === "true";
  const seconds = Number(
    env.AI_MIN_INTERVAL_SECONDS ?? (id === "gemini" ? 30 : 0),
  );
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
    throw new Error("AI_MIN_INTERVAL_SECONDS måste vara 0–120.");
  return {
    id,
    name: id === "gemini" ? "Google Gemini" : "OpenAI",
    mode,
    model,
    key,
    freeTierConfirmed,
    configured: !!key && freeTierConfirmed,
    minimumIntervalMs: seconds * 1000,
  };
}
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
export async function providerReply(config, fetcher, instructions, input) {
  let url, headers, payload;
  if (config.id === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": config.key,
    };
    payload = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: {
        maxOutputTokens: 2048,
        ...(config.model === "gemini-2.5-flash"
          ? { thinkingConfig: { thinkingBudget: 512 } }
          : {}),
      },
    };
  } else {
    url = "https://api.openai.com/v1/responses";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    };
    payload = {
      model: config.model,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 700,
      store: false,
    };
  }
  let response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw failure(502, "AI-tjänsten kunde inte nås inom tidsgränsen.");
  }
  if (response.status === 429)
    throw failure(
      429,
      `${config.name}: kvot eller anropsgräns nådd. Vänta och försök senare. Ingen annan eller betald modell anropades.`,
    );
  if ([502, 503, 504].includes(response.status))
    throw failure(503, `${config.name} är tillfälligt otillgänglig eller överbelastad. Försök senare. Ingen annan eller betald modell anropades.`);
  if (!response.ok)
    throw failure(
      502,
      `${config.name} avvisade anropet (HTTP ${response.status}). Kontrollera serverinställningarna.`,
    );
  let result;
  try {
    result = await response.json();
  } catch {
    throw failure(502, "AI-tjänsten gav ett ogiltigt svar.");
  }
  let text;
  if (config.id === "gemini") {
    const candidate = result.candidates?.[0];
    if (
      result.promptFeedback?.blockReason ||
      candidate?.finishReason !== "STOP"
    )
      throw failure(
        502,
        "Gemini-svaret blockerades eller avbröts. Inget ofullständigt agentsvar har sparats.",
      );
    text = (candidate?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
  } else {
    if (result.status === "incomplete")
      throw failure(
        502,
        "AI-svaret avbröts. Inget ofullständigt agentsvar har sparats.",
      );
    text = (result.output || [])
      .flatMap((item) => item.content || [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n")
      .trim();
  }
  if (!text) throw failure(502, "AI-tjänsten gav inget textsvar.");
  return text.slice(0, 12000);
}
