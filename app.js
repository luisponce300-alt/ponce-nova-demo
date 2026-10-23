import {
  ENDPOINTS,
  INITIAL_CASH,
  isFresh,
  normalizeMarkets,
  normalizePools,
  emptyWallet,
  replayLedger,
  executeTrade,
  valuation,
  clockParts,
  candidates,
} from "./core.js";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = "ponce-nova:v1";
const money = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n > 0 && n < 1 ? 8 : 2,
      }).format(n)
    : "—";
const percent = (n) =>
  Number.isFinite(n)
    ? `${n > 0 ? "+" : ""}${n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} %`
    : "—";
const number = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("sv-SE", { maximumFractionDigits: 8 })
    : "—";
const time = (n) => clockParts(new Date(n), "Europe/Stockholm").time;
const timestamp = (n) =>
  Number.isFinite(n)
    ? new Date(n).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }) +
      " Stockholm"
    : "saknas";
function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
function button(text, fn, className) {
  const n = el("button", text, className);
  n.type = "button";
  n.addEventListener("click", fn);
  return n;
}
function paragraph(text, cls) {
  return el("p", text, cls);
}
function storageWarning(text) {
  $("#storage-status").textContent = text;
}
let ledger = [],
  wallet = emptyWallet(),
  chats = { shared: [], agents: [] },
  events = [],
  storageOK = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved) {
    if (saved.version !== 1) throw new Error("Okänd version");
    wallet = replayLedger(saved.ledger);
    ledger = saved.ledger;
    for (const channel of ["shared", "agents"])
      chats[channel] = (
        Array.isArray(saved.chats?.[channel]) ? saved.chats[channel] : []
      )
        .filter(
          (m) =>
            m &&
            typeof m.text === "string" &&
            ["Du", "Ponce", "Nova", "System"].includes(m.author) &&
            Number.isFinite(m.time),
        )
        .slice(-100)
        .map((m) => ({ ...m, text: m.text.slice(0, 2000) }));
    events = (Array.isArray(saved.events) ? saved.events : [])
      .filter((e) => e && typeof e.text === "string" && Number.isFinite(e.time))
      .slice(-100);
  }
} catch {
  storageOK = false;
  storageWarning(
    "Sparade data kunde inte läsas. Ursprunglig lagring bevaras; sessionen körs i minnet.",
  );
}
function save() {
  if (!storageOK) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, ledger, chats, events }),
    );
  } catch {
    storageOK = false;
    storageWarning(
      "Lagring otillgänglig/full. Nya ändringar sparas bara denna session.",
    );
  }
}
let channel = "shared",
  category = "large",
  analysisCount = 0;
const cache = new Map(),
  quotes = new Map();
let request = null,
  requestId = 0,
  cooldownUntil = 0,
  cooldownTimer;
const dialog = $("#dialog"),
  content = $("#dialog-content");
let dialogCleanup = () => {};
function open(title, ...nodes) {
  dialogCleanup();
  dialogCleanup = () => {};
  $("#dialog-title").textContent = title;
  content.replaceChildren(...nodes);
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener("close", () => {
  dialogCleanup();
  dialogCleanup = () => {};
});
$("#close-dialog").onclick = () => dialog.close();
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
function activity(text) {
  events.push({ text, time: Date.now() });
  events = events.slice(-100);
  save();
  renderActivities();
}
function renderActivities() {
  $("#activities").replaceChildren(
    ...events
      .slice(-5)
      .reverse()
      .map((e) => {
        const li = el("li");
        li.append(el("time", time(e.time)), document.createTextNode(e.text));
        return li;
      }),
  );
}
function addMessage(author, text, target = channel) {
  chats[target].push({ author, text: text.slice(0, 2000), time: Date.now() });
  chats[target] = chats[target].slice(-100);
  save();
  if (target === channel) renderChat();
}
function renderChat() {
  const list = chats[channel].length
    ? chats[channel]
    : [
        {
          author: "System",
          text: "Välkommen. Chatt och assistenter körs lokalt utan ansluten AI. Skriv /hjälp för kommandon.",
          time: Date.now(),
        },
      ];
  $("#messages").replaceChildren(
    ...list.map((m) => {
      const n = el("div", undefined, "message");
      const h = el("div", undefined, "message-heading");
      h.append(
        el(
          "b",
          m.author +
            (m.author === "Ponce" || m.author === "Nova"
              ? " · lokal regelassistent"
              : ""),
        ),
        el("time", time(m.time)),
      );
      n.append(h, document.createTextNode(m.text));
      return n;
    }),
  );
  $("#messages").scrollTop = $("#messages").scrollHeight;
  $$("[data-channel]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.channel === channel)),
  );
}
const help =
  "Kommandon: /saldo, /analys, /risk, /möte och /hjälp. Övriga meddelanden blir lokala anteckningar. Inga meddelanden skickas till en AI-tjänst.";
function riskText() {
  const value = valuation(wallet, quotes);
  const positions = Object.entries(wallet.positions);
  if (!positions.length)
    return "Inga öppna paper-positioner. Marknads-, likviditets- och nyhetsrisk är inte fullständigt bedömda.";
  if (value === null)
    return "Portföljvärdet kan inte beräknas: aktuell kurs saknas för minst ett innehav. Risk är inte bedömd.";
  const largest = Math.max(
    ...positions.map(
      ([id, p]) => ((p.quantity * quotes.get(id).price) / value) * 100,
    ),
  );
  return `Investerat: ${percent(((value - wallet.cash) / value) * 100)} av simulerat kapital. Största token: ${percent(largest)}.${largest > 25 ? " Koncentrationen överskrider bevakningsgränsen 25 %." : ""} Detta är en enkel koncentrationskontroll, ingen heltäckande riskbedömning.`;
}
function analysisText() {
  const list = candidates(quotes);
  if (!list.length)
    return "Inga aktuella, verifierade kryptokurser att analysera. Uppdatera marknadsdata först.";
  return (
    list
      .map(
        (q) =>
          `${q.name}: ${money(q.price)}, 24 h ${percent(q.change)}. Källa ${q.source}, kurstid ${timestamp(q.updated)}.`,
      )
      .join("\n") +
    "\nRegel: de tre största absoluta 24 h-rörelserna bland hämtade CoinGecko-tokens. Historik förutsäger inte avkastning; detta är inte köpråd."
  );
}
$("#chat").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#message").value.trim();
  if (!text) return;
  addMessage("Du", text);
  $("#message").value = "";
  const command = text.toLowerCase();
  if (command === "/saldo")
    addMessage(
      "Ponce",
      `Tillgängligt simulerat kapital: ${money(wallet.cash)}. Start: ${money(INITIAL_CASH)}. Inget verkligt konto är anslutet.`,
    );
  else if (command === "/analys") {
    analysisCount++;
    renderSummary();
    addMessage("Ponce", analysisText());
  } else if (command === "/risk") addMessage("Nova", riskText());
  else if (command === "/möte") meeting(false);
  else
    addMessage(
      "System",
      command === "/hjälp"
        ? help
        : "Anteckning sparad lokalt. Skriv /hjälp för regelbaserade kommandon.",
    );
};
$$("[data-channel]").forEach(
  (b) =>
    (b.onclick = () => {
      channel = b.dataset.channel;
      renderChat();
    }),
);
function renderSummary() {
  $("#cash").textContent = money(wallet.cash);
  $("#realized").textContent = money(wallet.realized);
  $("#trade-count").textContent = String(ledger.length);
  $("#decision-count").textContent = String(ledger.length);
  $("#wins").textContent = String(wallet.wins);
  $("#losses").textContent = String(wallet.losses);
  $("#analysis-count").textContent = String(analysisCount);
  const value = valuation(wallet, quotes);
  $("#profit").textContent =
    value === null
      ? "Totalresultat: kursunderlag saknas"
      : `Totalresultat ${money(value - INITIAL_CASH)} (${percent((value / INITIAL_CASH - 1) * 100)})`;
  $("#risk-summary").textContent = Object.keys(wallet.positions).length
    ? "Kontrollera innehav"
    : "Inga positioner";
  const list = candidates(quotes);
  $("#suggestions").replaceChildren(
    ...(list.length
      ? list.map((q) => {
          const row = el("div", undefined, "suggestion");
          row.append(
            el("span", q.symbol),
            el("span", percent(q.change), q.change < 0 ? "red" : "green"),
            button("Granska", () => openAnalysis(q)),
          );
          return row;
        })
      : [paragraph("Inga förslag utan aktuellt dataunderlag.", "muted")]),
  );
}
function renderMarket() {
  const entry = cache.get(category);
  const query = $("#search").value.trim().toLowerCase();
  const rows = (entry?.coins || []).filter((q) =>
    `${q.name} ${q.symbol} ${q.address || ""}`.toLowerCase().includes(query),
  );
  const source =
    category === "new"
      ? "GeckoTerminal · nya Ethereum-pooler (inte nödvändigtvis nya tokens). Likviditet ersätter börsvärde. Poolens pris är observerat vid hämtning; exakt kurstid saknas."
      : "CoinGecko · " +
        (category === "small"
          ? "börsvärdesrankning 501–750, mindre än topplistan; inte en garanti för småbolagsstatus."
          : "börsvärdesrankning 1–30.");
  $("#data-source").textContent =
    source +
    (entry?.received
      ? ` Hämtad ${timestamp(entry.received)}.`
      : " Ingen lyckad hämtning ännu.");
  if (!entry?.loading)
    $("#data-status").textContent = entry?.error
      ? `Datafel: ${entry.error} ${entry.coins.length ? "Tidigare data visas; kontrollera kurstiden." : "Inga kurser visas."}`
      : entry
        ? category === "new"
          ? `${rows.length} pooler visas. Exakt kurstid saknas; hämtningstid visas.`
          : `${rows.length} tokens visas. ${entry.coins.some((q) => !isFresh(q)) ? "Vissa kurser saknas eller är inaktuella." : "Kurserna är högst fem minuter gamla."}`
        : "Ingen data hämtad.";
  $("#coins").replaceChildren(
    ...rows.map((q) => {
      const row = el("tr");
      const name = el("td");
      name.append(
        el("b", q.name),
        el("small", `${q.symbol} · ${q.source}`),
        el(
          "small",
          category === "new"
            ? `Pool skapad: ${q.created || "okänt"}`
            : `Kurstid: ${timestamp(q.updated)}`,
        ),
      );
      row.append(
        name,
        el("td", money(q.price)),
        el("td", percent(q.change), q.change < 0 ? "red" : "green"),
        el("td", money(q.cap)),
      );
      const action = el("td");
      action.append(
        button(q.tradable ? "Paper-order" : "Pooldetaljer", () =>
          q.tradable ? openTrade(q.id) : openPool(q),
        ),
      );
      row.append(action);
      return row;
    }),
  );
  if (!rows.length) {
    const cell = el(
      "td",
      entry?.loading
        ? "Hämtar data…"
        : query
          ? "Inga träffar i hämtad lista."
          : "Ingen marknadsdata tillgänglig.",
    );
    cell.colSpan = 5;
    const row = el("tr");
    row.append(cell);
    $("#coins").append(row);
  }
}
function refreshCooldown() {
  clearTimeout(cooldownTimer);
  $("#refresh").disabled = !!request || Date.now() < cooldownUntil;
  if (!request && Date.now() < cooldownUntil)
    cooldownTimer = setTimeout(
      refreshCooldown,
      cooldownUntil - Date.now() + 20,
    );
}
async function loadMarket(force = false) {
  const selected = category;
  const old = cache.get(selected);
  if (
    !force &&
    old &&
    !old.loading &&
    !old.error &&
    Date.now() - old.received < 60000
  ) {
    renderMarket();
    return;
  }
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const serial = ++requestId;
  cache.set(selected, {
    coins: old?.coins || [],
    received: old?.received || null,
    loading: true,
  });
  $("#data-status").textContent =
    "Hämtar data från " +
    (selected === "new" ? "GeckoTerminal" : "CoinGecko") +
    "…";
  refreshCooldown();
  renderMarket();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ENDPOINTS[selected], {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "Anropsgräns nådd (429). Vänta minst en minut."
          : `Datakällan svarade HTTP ${response.status}.`,
      );
    const body = await response.json();
    const received = Date.now();
    const coins =
      selected === "new"
        ? normalizePools(body, received)
        : normalizeMarkets(body);
    if (serial !== requestId) return;
    cache.set(selected, { coins, received, error: null, loading: false });
    if (selected !== "new") coins.forEach((q) => quotes.set(q.id, q));
    activity(
      `${coins.length} ${selected === "new" ? "pooler" : "kryptokurser"} hämtade från ${selected === "new" ? "GeckoTerminal" : "CoinGecko"}.`,
    );
  } catch (error) {
    if (serial !== requestId) return;
    cache.set(selected, {
      coins: old?.coins || [],
      received: old?.received || null,
      error: controller.signal.aborted
        ? "Begäran tog för lång tid. Försök igen."
        : error.message || "Nätverk/CORS blockerar datakällan.",
      loading: false,
    });
  } finally {
    clearTimeout(timeout);
    if (serial === requestId) {
      request = null;
      cooldownUntil = Date.now() + 60000;
      refreshCooldown();
      renderMarket();
      renderSummary();
    }
  }
}
$$("[data-category]").forEach(
  (b) =>
    (b.onclick = () => {
      if (category === b.dataset.category) return;
      // Switching cancels the previous request even when the new category is cached.
      request?.abort();
      request = null;
      requestId++;
      category = b.dataset.category;
      $("#search").value = "";
      $$("[data-category]").forEach((n) =>
        n.setAttribute("aria-pressed", String(n === b)),
      );
      renderMarket();
      loadMarket();
      refreshCooldown();
    }),
);
$("#refresh").onclick = () => {
  if (!$("#refresh").disabled) loadMarket(true);
};
$("#search").oninput = renderMarket;
function openPool(q) {
  open(
    q.name,
    paragraph(
      "Ny Ethereum-pool · hög risk. En ny pool behöver inte betyda att token är ny. Ingen paper trading på dessa poolkurser.",
      "notice warning",
    ),
    paragraph(
      `Pris ${money(q.price)}. Likviditet ${money(q.cap)}. 24 h ${percent(q.change)}.\nPool-id: ${q.id}\nToken-id: ${q.address}\nPool skapad: ${q.created || "saknas"}\nKälla: GeckoTerminal. Observerad ${timestamp(q.updated)}; leverantören anger ingen exakt kurstid i detta svar.`,
    ),
  );
}
function openTrade(preselected) {
  const available = [...quotes.values()].filter((q) => q.tradable);
  if (!available.length) {
    open(
      "Handel · paper trading",
      paragraph(
        "Inga kurser tillgängliga. Hämta CoinGecko-data under Stora eller Mindre tokens först.",
        "notice warning",
      ),
    );
    return;
  }
  const form = el("form", undefined, "form-grid");
  const select = el("select");
  select.id = "trade-token";
  select.name = "token";
  available.forEach((q) => {
    const o = el("option", `${q.name} (${q.symbol})`);
    o.value = q.id;
    select.append(o);
  });
  if (preselected && available.some((q) => q.id === preselected))
    select.value = preselected;
  const side = el("select");
  side.id = "trade-side";
  for (const [v, t] of [
    ["buy", "Köp"],
    ["sell", "Sälj"],
  ]) {
    const o = el("option", t);
    o.value = v;
    side.append(o);
  }
  const qty = el("input");
  qty.id = "trade-quantity";
  qty.type = "number";
  qty.min = "0.00000001";
  qty.step = "any";
  qty.required = true;
  qty.inputMode = "decimal";
  const price = paragraph("", "notice");
  const result = paragraph("", "form-result");
  result.setAttribute("role", "status");
  for (const [text, control] of [
    ["Token", select],
    ["Riktning", side],
    ["Antal tokens", qty],
  ]) {
    const label = el("label", text);
    label.append(control);
    form.append(label);
  }
  const submit = el("button", "Bekräfta simulerad order");
  submit.type = "submit";
  form.append(submit);
  function preview() {
    const q = quotes.get(select.value);
    price.textContent = `${q.symbol}: ${money(q.price)} · Kurstid ${timestamp(q.updated)} · ${isFresh(q) ? "Giltigt underlag" : "Inaktuell/saknad kurs: order blockeras"}. Äger ${number(wallet.positions[q.id]?.quantity || 0)}. Indikativt belopp: ${money(q.price * Number(qty.value))}.`;
  }
  select.onchange = preview;
  qty.oninput = preview;
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      if (ledger.length >= 1000)
        throw new Error(
          "Maximalt 1 000 lokala order. Exportera rapport och återställ för en ny simulering.",
        );
      const { wallet: next, trade } = executeTrade(
        wallet,
        quotes.get(select.value),
        side.value,
        Number(qty.value),
      );
      wallet = next;
      ledger.push(trade);
      activity(
        `${trade.side === "buy" ? "Köp" : "Sälj"} ${number(trade.quantity)} ${trade.symbol} · ${money(trade.quantity * trade.price)} (paper).`,
      );
      save();
      renderSummary();
      preview();
      result.textContent = `Simulerad order genomförd. ${trade.side === "buy" ? "Köpt" : "Sålt"} ${number(trade.quantity)} ${trade.symbol}. Saldo ${money(wallet.cash)}. Ingen verklig order har skickats.`;
      qty.value = "";
    } catch (error) {
      result.textContent = error.message;
    }
  };
  open(
    "Handel · paper trading",
    paragraph(
      "Simulerade USD. Inga avgifter, ingen spread/slippage. Endast CoinGecko-kurser högst fem minuter gamla accepteras.",
      "notice warning",
    ),
    price,
    form,
    result,
  );
  preview();
}
function portfolioNodes() {
  const nodes = [
    paragraph(
      `Tillgängligt: ${money(wallet.cash)}. Realiserat resultat: ${money(wallet.realized)}.`,
    ),
  ];
  const value = valuation(wallet, quotes);
  nodes.push(
    paragraph(
      value === null
        ? "Portföljvärde: ej tillgängligt; aktuell kurs saknas för något innehav."
        : `Portföljvärde: ${money(value)}. Totalresultat: ${money(value - INITIAL_CASH)}.`,
    ),
  );
  const list = el("ul");
  for (const [id, p] of Object.entries(wallet.positions)) {
    const q = quotes.get(id);
    list.append(
      el(
        "li",
        `${q?.symbol || id}: ${number(p.quantity)}, anskaffning ${money(p.cost)}, marknadsvärde ${isFresh(q) ? money(p.quantity * q.price) : "kurs saknas/inaktuell"}.`,
      ),
    );
  }
  if (!list.children.length)
    list.append(el("li", "Inga öppna paper-positioner."));
  nodes.push(list);
  const history = el("div", undefined, "history");
  const table = el("table");
  const caption = el("caption", "Orderhistorik · simulerad");
  table.append(caption);
  const head = el("thead");
  const hr = el("tr");
  ["Tid (Stockholm)", "Sida", "Token", "Antal", "Pris USD"].forEach((t) =>
    hr.append(el("th", t)),
  );
  head.append(hr);
  table.append(head);
  const body = el("tbody");
  ledger
    .slice()
    .reverse()
    .forEach((t) => {
      const row = el("tr");
      [
        timestamp(t.time),
        t.side === "buy" ? "Köp" : "Sälj",
        t.symbol || t.id,
        number(t.quantity),
        money(t.price),
      ].forEach((v) => row.append(el("td", v)));
      body.append(row);
    });
  table.append(body);
  history.append(table);
  nodes.push(history);
  return nodes;
}
function openAnalysis(q) {
  analysisCount++;
  renderSummary();
  open(
    q ? `Analys · ${q.name}` : "Analys & bevakning",
    paragraph(
      q
        ? `${q.name} · ${money(q.price)} · 24 h ${percent(q.change)}.\nKälla ${q.source} · Kurstid ${timestamp(q.updated)}.\n${isFresh(q) ? "Aktuell enligt femminutersgränsen." : "Inaktuell kurs: uppdatera data."}`
        : analysisText(),
      "notice",
    ),
    paragraph(
      "Prisrörelser visar historik, inte framtida avkastning. Nyhets-, likviditets- och fundamental analys är inte anslutna.",
    ),
    ...(q ? [button("Öppna paper-order", () => openTrade(q.id))] : []),
  );
}
function meeting(show = true) {
  addMessage("Ponce", "Lokalt mötesunderlag:\n" + analysisText(), "agents");
  addMessage(
    "Nova",
    riskText() +
      "\nBeslut kräver ditt manuella val; inga order utförs av mötet.",
    "agents",
  );
  activity("Lokalt mötesunderlag sammanställt.");
  channel = "agents";
  renderChat();
  if (show)
    open(
      "Styrelsemöte · lokal simulering",
      paragraph(
        "Ponces marknadsunderlag och Novas riskkontroll finns i chatten Ponce & Nova. Mötet är regelbaserat, ingen extern AI deltar.",
      ),
      button("Till möteschatten", () => {
        dialog.close();
        $("#message").focus();
      }),
    );
}
function report() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: "local-paper-trading",
    currency: "USD",
    initialCash: INITIAL_CASH,
    wallet,
    ledger,
    events,
    notes:
      "Simulerat. Inga avgifter, spread eller slippage. Ingen verklig AI eller handel.",
  };
}
function downloadReport() {
  const blob = new Blob([JSON.stringify(report(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = "ponce-nova-paper-rapport.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function voice(name) {
  const status = paragraph(
    "Röst är frivilligt. Starta mikrofon kräver webbläsarens tillstånd. Taligenkänning kan behandlas av webbläsarleverantörens molntjänst. Alternativ: skriv i chatten.",
    "notice warning",
  );
  const actions = el("div", undefined, "dialog-actions");
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  if (Recognition) {
    const start = button("Starta mikrofon", () => {
      try {
        recognition = new Recognition();
        recognition.lang = "sv-SE";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
          $("#message").value = e.results[0][0].transcript.slice(0, 2000);
          status.textContent =
            "Tal infogat som utkast. Granska och skicka själv i chatten.";
        };
        recognition.onerror = (e) =>
          (status.textContent = `Röstinmatning misslyckades (${e.error}). Skriv i chatten i stället.`);
        recognition.onend = () => (start.disabled = false);
        recognition.start();
        start.disabled = true;
        status.textContent =
          "Lyssnar. Tal kan behandlas av webbläsarleverantören.";
      } catch {
        start.disabled = false;
        status.textContent =
          "Mikrofonen kunde inte startas. Skriv i chatten i stället.";
      }
    });
    actions.append(
      start,
      button("Stoppa mikrofon", () => recognition?.stop()),
    );
  } else
    actions.append(paragraph("Taligenkänning stöds inte i denna webbläsare."));
  if ("speechSynthesis" in window)
    actions.append(
      button(`Läs senaste ${name}-svar`, () => {
        const m = [...chats[channel]].reverse().find((m) => m.author === name);
        if (!m) {
          status.textContent = `Inget ${name}-svar i denna chatt ännu.`;
          return;
        }
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(m.text);
        utterance.lang = "sv-SE";
        speechSynthesis.speak(utterance);
      }),
    );
  open(
    `Prata med ${name}`,
    status,
    actions,
    button("Till chattutkastet", () => {
      dialog.close();
      $("#message").focus();
    }),
  );
  dialogCleanup = () => {
    recognition?.abort();
    window.speechSynthesis?.cancel();
  };
}
const handlers = {
  office: () => {
    const tour = el("div", undefined, "office-tour");
    tour.append($(".office").cloneNode(true));
    open(
      "Pixelkontoret",
      paragraph(
        "Mötesrum, fikarum, toaletter och AI-labb. Karaktärerna är visuella animationer, inga självständiga AI-agenter.",
      ),
      tour,
    );
  },
  exchange: (n) =>
    open(
      n,
      paragraph(
        "Klockan visar korrekt lokal tidszon. Börs- och guldkurser samt öppettider är inte anslutna. Vi visar inga illustrativa priser som live-data.",
        "notice",
      ),
      paragraph("Riktiga kryptokurser finns i marknadsbevakningen längst ned."),
    ),
  calendar: () =>
    open(
      "Kommande händelser",
      paragraph(
        "Ingen kalenderkälla är ansluten. Inga exempel på ekonomiska händelser visas som verkliga.",
      ),
    ),
  analysis: () => openAnalysis(),
  trade: () => openTrade(),
  strategy: () =>
    open(
      "Strategi",
      paragraph(
        "Bevakningsregel: rangordna hämtade CoinGecko-tokens efter absolut 24 h-rörelse. Order kräver ditt manuella beslut. Regelassistenten tränas inte och förutsäger inte marknaden.",
      ),
      paragraph(
        "Riskbevakning: markera koncentration över 25 % och blockera order med äldre kurser än fem minuter. Ingen automatisk handel eller stop-loss finns.",
      ),
    ),
  meeting: () => meeting(),
  board: () => meeting(),
  log: () =>
    open(
      "Beslutslogg & aktiviteter",
      ...events
        .slice()
        .reverse()
        .map((e) => paragraph(`${timestamp(e.time)} · ${e.text}`)),
      ...portfolioNodes(),
    ),
  risk: () =>
    open(
      "Risk & ekonomi",
      paragraph(riskText(), "notice warning"),
      paragraph(
        "Marknadsrisk: ej helt bedömd. Likviditetsrisk: ej helt bedömd. Nyhetsrisk: källa ej ansluten. Historisk volatilitet: 24 h-förändring är inte ett volatilitetsmått.",
      ),
    ),
  quality: () =>
    open(
      "Kvalitet & datakontroll",
      paragraph(
        "Priser, källor och tidsstämplar visas i kryptotabellen. Saknade priser blir —, aldrig nollkurser. Order blockeras om kurstid saknas, ligger i framtiden eller är äldre än fem minuter.",
      ),
      paragraph(
        "Nya pooler saknar exakt kurstid och är spärrade för paper trading. Fel och tomma svar redovisas utan fabricerade ersättningskurser.",
      ),
    ),
  scenario: () => scenario(),
  report: () =>
    open(
      "Rapport · paper trading",
      ...portfolioNodes(),
      button("Exportera rapport (JSON)", downloadReport),
    ),
  portfolio: () => open("Portfölj & historik", ...portfolioNodes()),
  tech: () =>
    open(
      "Teknik & utveckling",
      paragraph(
        "Statisk HTML/CSS/JavaScript. CoinGecko levererar marknadsdata; GeckoTerminal levererar nya Ethereum-pooler. Inga API-nycklar används i klienten. Marknadsdata hämtas manuellt, med en minuts paus mellan uppdateringar i samma vy.",
      ),
      paragraph(
        "Ponce och Nova är lokala regelassistenter. En riktig AI-integration kräver separat backend och serverlagrade hemligheter.",
      ),
      paragraph(
        `Lagring: ${storageOK ? "tillgänglig" : "endast sessionsminne"}. ${ledger.length} lokala order. Ingen mäklaranslutning.`,
      ),
    ),
  development: () =>
    open(
      "Utveckling & statistik",
      paragraph(
        `${ledger.length} paper-affärer. ${wallet.wins} vinnande och ${wallet.losses} förlorande säljorder. Realiserat: ${money(wallet.realized)}.`,
      ),
      paragraph(
        "Vinst/förlust räknas per säljorder med genomsnittligt anskaffningsvärde. Inga lärande modeller eller automatisk strategioptimering är anslutna.",
      ),
      button("Exportera för egen uppföljning", downloadReport),
    ),
  "chat-help": () => open("Chattkommandon", paragraph(help)),
  voice,
  privacy: () => privacy(),
};
function scenario() {
  const input = el("input");
  input.id = "scenario-change";
  input.type = "number";
  input.min = "-100";
  input.max = "1000";
  input.value = "-10";
  input.step = "any";
  input.required = true;
  const label = el("label", "Gemensam prisförändring (%) ");
  label.append(input);
  const form = el("form", undefined, "form-grid");
  form.append(label);
  const submit = el("button", "Beräkna scenario");
  submit.type = "submit";
  form.append(submit);
  const result = paragraph("", "notice");
  result.setAttribute("role", "status");
  form.onsubmit = (e) => {
    e.preventDefault();
    const change = Number(input.value);
    const value = valuation(wallet, quotes);
    if (!Number.isFinite(change) || change < -100 || change > 1000) {
      result.textContent = "Ange ett värde mellan −100 och 1 000 %.";
      return;
    }
    result.textContent =
      value === null
        ? "Aktuell kurs saknas för något innehav. Uppdatera data först."
        : `Scenariovärde: ${money(wallet.cash + (value - wallet.cash) * (1 + change / 100))}. Kontanter påverkas inte. Ingen order genomförs.`;
  };
  open(
    "Scenarier",
    paragraph(
      "Applicera samma prisförändring på alla öppna paper-positioner. En förenklad känslighetsanalys, inte en prognos.",
    ),
    form,
    result,
  );
}
function privacy() {
  const confirm = el("input");
  confirm.id = "confirm-reset";
  confirm.type = "checkbox";
  const label = el(
    "label",
    " Jag vill radera lokal historik, chatt och simulering.",
  );
  label.prepend(confirm);
  const reset = button(
    "Radera lokala data",
    () => {
      if (!confirm.checked) return;
      try {
        localStorage.removeItem(KEY);
        storageOK = true;
        $("#storage-status").textContent = "";
      } catch {
        storageOK = false;
        storageWarning(
          "Lagringen kunde inte raderas. Använd webbläsarens webbplatsinställningar.",
        );
      }
      wallet = emptyWallet();
      ledger = [];
      chats = { shared: [], agents: [] };
      events = [];
      renderChat();
      renderSummary();
      renderActivities();
      dialog.close();
    },
    "danger",
  );
  open(
    "Lagring & integritet",
    paragraph(
      "Chattar, order och aktiviteter lagras i localStorage för denna webbläsare och webbplats. Dela inte hemligheter i chatten. Export innehåller order och aktiviteter, men inte chatten. Röstfunktioner använder webbläsarens tjänster först efter ditt val.",
    ),
    button("Exportera rapport före radering", downloadReport),
    label,
    reset,
  );
}
$$("[data-action]").forEach(
  (b) => (b.onclick = () => handlers[b.dataset.action]?.(b.dataset.name)),
);
function tick() {
  const now = new Date();
  $$("[data-zone]").forEach((n) => {
    n.textContent = clockParts(now, n.dataset.zone).time;
    n.dateTime = now.toISOString();
  });
  $$("[data-date]").forEach(
    (n) => (n.textContent = clockParts(now, n.dataset.date).date),
  );
  renderSummary();
  if (!request) renderMarket();
}
$("#motion").onclick = () => {
  const paused = document.body.classList.toggle("paused");
  $("#motion").setAttribute("aria-pressed", String(paused));
  $("#motion").textContent = paused ? "Starta stad" : "Pausa stad";
};
for (let i = 0; i < 28; i++) {
  const b = el("div", undefined, "building");
  b.style.height = 35 + ((i * 37) % 64) + "%";
  $("#skyline").append(b);
}
renderChat();
renderSummary();
renderActivities();
tick();
setInterval(tick, 30000);
loadMarket();
