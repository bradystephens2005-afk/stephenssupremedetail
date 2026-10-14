// Chat assistant logic, kept apart from Netlify so tests can run it with fakes.
//
// stores: { sessions, usage, settings } — Netlify Blobs stores (or anything with
//   get(key, {type: "json"}), getWithMetadata(key, {type: "json"}), setJSON(key, value, opts), list({prefix})).
// anthropic: an Anthropic client. env: (name) => string | undefined.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { CONTACT_EMAIL, KNOWLEDGE_VERSION, STORE_NAME } from "./knowledge.mjs";
import { NO_INFO, SYSTEM_PROMPT } from "./prompt.mjs";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const DEFAULT_DAILY_BUDGET_USD = 5;

// Dollars per million tokens, for prompts up to 100K tokens (ours is about 6K).
// Cache reads cost 0.1x input; cache writes 2x input for the 1-hour TTL used here, 1.25x for 5 minutes.
export const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export const LIMITS = {
  messageChars: 800,     // longest message a visitor can send
  historyMessages: 12,   // earlier messages sent back to the model (6 exchanges)
  sessionMessages: 40,   // visitor messages per chat before we point them to email
  maxTokens: 2048,
};

export const REPLIES = {
  filtered: `Let's keep it friendly. I'm happy to help with questions about the perch, the Fur Lifter, shipping or returns.`,
  sessionFull: `This chat has gotten long. For anything else, please email ${CONTACT_EMAIL} and Brady will reply within one business day.`,
  budget: `The assistant is resting for the rest of today. Please email ${CONTACT_EMAIL} and you'll get a reply within one business day.`,
  refusal: `${NO_INFO}. I can help with questions about ${STORE_NAME}'s products, shipping and returns.`,
  busy: `The assistant is busy right now. Please try again in a minute, or email ${CONTACT_EMAIL}.`,
  error: `Sorry, something went wrong on our end. Please try again, or email ${CONTACT_EMAIL}.`,
  cutShort: ` (That answer got cut short. Email ${CONTACT_EMAIL} for the rest.)`,
  disabled: `Chat is turned off right now. Please email ${CONTACT_EMAIL} and you'll get a reply within one business day.`,
};

// Checked before anything reaches the model. Whole words only, so "Scunthorpe" and "class" pass.
const BLOCKED = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|motherfuck\w*|n[i1]gg\w*|fag+(ot)?s?|retard\w*|whore\w*|slut\w*)\b/i;

export function screen(text) {
  return BLOCKED.test(text) ? "filtered" : null;
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The shop is in South Carolina, so days roll over at Eastern midnight.
export function dayKey(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
}

export function costUsd(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  const cc = usage.cache_creation || {};
  const write1h = cc.ephemeral_1h_input_tokens ?? (usage.cache_creation_input_tokens || 0);
  const write5m = cc.ephemeral_5m_input_tokens || 0;
  const perToken = (rate) => rate / 1e6;
  return (usage.input_tokens || 0) * perToken(p.input)
    + (usage.cache_read_input_tokens || 0) * perToken(p.input * 0.1)
    + write1h * perToken(p.input * 2)
    + write5m * perToken(p.input * 1.25)
    + (usage.output_tokens || 0) * perToken(p.output);
}

export function config(env) {
  const budget = parseFloat(env("CHAT_DAILY_BUDGET_USD"));
  return {
    model: env("CHAT_MODEL") || DEFAULT_MODEL,
    dailyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : DEFAULT_DAILY_BUDGET_USD,
    envEnabled: (env("CHAT_ENABLED") || "true").toLowerCase() !== "false",
    hasKey: Boolean(env("ANTHROPIC_API_KEY")),
  };
}

// The kill switch. CHAT_ENABLED=false turns chat off for a whole deploy; the
// owner page flips the stored setting, which takes effect on the next message.
export async function readSettings(stores) {
  const s = await stores.settings.get("settings", { type: "json" });
  return { enabled: s?.enabled !== false, updatedAt: s?.updatedAt || null };
}

const EMPTY_TOTALS = { messages: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0,
  firstTokenMsSum: 0, timed: 0, filtered: 0, refusals: 0, errors: 0, limited: 0 };

// Adds one message's numbers to the day's totals. Conditional writes keep two
// messages finishing at once from overwriting each other.
async function addToTotals(store, day, add) {
  const key = `totals/${day}`;
  const tries = 10;
  for (let attempt = 0; attempt < tries; attempt++) {
    const found = await store.getWithMetadata(key, { type: "json" });
    const next = { ...EMPTY_TOTALS, ...(found?.data || {}) };
    for (const [k, v] of Object.entries(add)) next[k] = (next[k] || 0) + v;
    const res = await store.setJSON(key, next, found ? { onlyIfMatch: found.etag } : { onlyIfNew: true });
    if (res?.modified !== false) return;
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * (attempt + 1)));
  }
  console.warn(`chat: gave up updating ${key} after ${tries} tries`);
}

async function record(stores, entry, isNewSession) {
  const day = dayKey(entry.at);
  const rand = randomUUID().slice(0, 8);
  await stores.usage.setJSON(`log/${day}/${String(entry.at).padStart(13, "0")}-${rand}`, entry);
  const u = entry.usage || {};
  await addToTotals(stores.usage, day, {
    messages: 1,
    sessions: isNewSession ? 1 : 0,
    input: u.input || 0, output: u.output || 0, cacheRead: u.cacheRead || 0, cacheWrite: u.cacheWrite || 0,
    usd: entry.usd || 0,
    firstTokenMsSum: entry.firstTokenMs || 0, timed: entry.firstTokenMs ? 1 : 0,
    filtered: entry.outcome === "filtered" ? 1 : 0,
    refusals: entry.outcome === "refusal" ? 1 : 0,
    errors: entry.outcome === "error" ? 1 : 0,
    limited: entry.outcome === "budget" || entry.outcome === "session-full" ? 1 : 0,
  });
}

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

// Replies stream as newline-delimited JSON:
//   {"t":"start","sessionId"}  {"t":"delta","text"}  {"t":"replace","text"}  {"t":"done"}
function ndjson(run) {
  const enc = new TextEncoder();
  let open = true; // false once the visitor closes the page; the work still finishes and gets logged
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + "\n")); } catch { open = false; }
      };
      try { await run(send); } catch (e) {
        console.error("chat: stream failed", e);
        send({ t: "replace", text: REPLIES.error });
        send({ t: "done" });
      }
      if (open) controller.close();
    },
    cancel() { open = false; },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export function createChatHandler({ anthropic, stores, env, now = Date.now }) {
  return async function handle(request) {
    if (request.method !== "POST") return json(405, { error: "POST only" });
    const cfg = config(env);
    if (!cfg.envEnabled || !cfg.hasKey || !(await readSettings(stores)).enabled) {
      return json(503, { disabled: true, message: REPLIES.disabled });
    }

    let body;
    try { body = await request.json(); } catch { return json(400, { error: "Send JSON." }); }
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return json(400, { error: "Type a question first." });
    if (message.length > LIMITS.messageChars) {
      return json(400, { error: `Please keep it under ${LIMITS.messageChars} characters.` });
    }
    const page = typeof body.page === "string" ? body.page.slice(0, 200) : "";

    const started = now();
    let sessionId = typeof body.sessionId === "string" && SESSION_ID.test(body.sessionId) ? body.sessionId : null;
    let session = sessionId ? await stores.sessions.get(sessionId, { type: "json" }) : null;
    const isNewSession = !session;
    if (!session) {
      sessionId = randomUUID();
      session = { id: sessionId, createdAt: started, messages: [], usd: 0 };
    }
    const visitorCount = session.messages.filter((m) => m.role === "user").length;

    const base = { at: started, sessionId, model: cfg.model, knowledge: KNOWLEDGE_VERSION, page };
    const save = async (userText, reply, entry) => {
      session.messages.push({ role: "user", text: userText, at: started }, { role: "assistant", text: reply, at: now() });
      session.updatedAt = now();
      session.usd = (session.usd || 0) + (entry.usd || 0);
      await stores.sessions.setJSON(sessionId, session);
      await record(stores, { ...base, ...entry, ms: now() - started }, isNewSession);
    };
    const canned = (outcome, reply, userText = message) => ndjson(async (send) => {
      send({ t: "start", sessionId });
      send({ t: "delta", text: reply });
      await save(userText, reply, { outcome, q: outcome === "filtered" ? "" : message.slice(0, 160) });
      send({ t: "done" });
    });

    // Guardrails before any tokens are spent.
    if (screen(message)) return canned("filtered", REPLIES.filtered, "[filtered]");
    if (visitorCount >= LIMITS.sessionMessages) return canned("session-full", REPLIES.sessionFull);
    const today = await stores.usage.get(`totals/${dayKey(started)}`, { type: "json" });
    if ((today?.usd || 0) >= cfg.dailyBudgetUsd) return canned("budget", REPLIES.budget);

    let history = session.messages.slice(-LIMITS.historyMessages).map((m) => ({ role: m.role, content: m.text }));
    while (history.length && history[0].role !== "user") history = history.slice(1);

    return ndjson(async (send) => {
      send({ t: "start", sessionId });
      let text = "";
      let firstTokenMs = null;
      let outcome = "answered";
      let final = null;
      try {
        const stream = anthropic.messages.stream({
          model: cfg.model,
          max_tokens: LIMITS.maxTokens,
          // Frozen system prompt + shop knowledge, cached for an hour so quiet hours still hit.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
          // Short FAQ answers: low effort keeps the first word quick and the bill small.
          output_config: { effort: "low" },
          messages: [...history, { role: "user", content: message }],
        }, { signal: request.signal });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (firstTokenMs === null) firstTokenMs = now() - started;
            text += event.delta.text;
            send({ t: "delta", text: event.delta.text });
          }
        }
        final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          outcome = "refusal";
          text = REPLIES.refusal;
          send({ t: "replace", text });
        } else if (final.stop_reason === "max_tokens") {
          text += REPLIES.cutShort;
          send({ t: "delta", text: REPLIES.cutShort });
        } else if (!text.trim()) {
          outcome = "error";
          text = REPLIES.error;
          send({ t: "replace", text });
        }
      } catch (e) {
        if (request.signal?.aborted) {
          outcome = "aborted";
        } else {
          outcome = "error";
          const busy = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529);
          console.error(`chat: ${cfg.model} request failed`, e?.status ?? "", e?.message ?? e);
          text = busy ? REPLIES.busy : REPLIES.error;
          send({ t: "replace", text });
        }
      }

      const u = final?.usage;
      const usage = u ? {
        input: u.input_tokens || 0,
        output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheWrite: u.cache_creation_input_tokens || 0,
      } : null;
      await save(message, text, {
        outcome, q: message.slice(0, 160), usage, usd: costUsd(cfg.model, u) || 0, firstTokenMs,
        stop: final?.stop_reason || null, requestId: final?._request_id || null,
      });
      if (outcome !== "aborted") send({ t: "done" });
    });
  };
}

// ---------------------------------------------------------------- owner endpoints
function sameSecret(given, expected) {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function summarize(stores, env, { days = 14, recent = 30, now = Date.now } = {}) {
  const cfg = config(env);
  const t = now();
  const keys = [];
  for (let i = 0; i < days; i++) keys.push(dayKey(t - i * 86400000));
  const unique = [...new Set(keys)];
  const rows = await Promise.all(unique.map(async (day) => {
    const tot = { ...EMPTY_TOTALS, ...((await stores.usage.get(`totals/${day}`, { type: "json" })) || {}) };
    const promptTokens = tot.input + tot.cacheRead + tot.cacheWrite;
    return {
      day, sessions: tot.sessions, messages: tot.messages, usd: tot.usd,
      input: tot.input, output: tot.output, cacheRead: tot.cacheRead, cacheWrite: tot.cacheWrite,
      cacheHitRate: promptTokens ? tot.cacheRead / promptTokens : null,
      avgFirstTokenMs: tot.timed ? Math.round(tot.firstTokenMsSum / tot.timed) : null,
      filtered: tot.filtered, refusals: tot.refusals, errors: tot.errors, limited: tot.limited,
    };
  }));

  // Most recent questions: today's log first, then yesterday's.
  const latest = [];
  for (const day of unique.slice(0, 2)) {
    const { blobs } = await stores.usage.list({ prefix: `log/${day}/` });
    latest.push(...blobs.map((b) => b.key).sort().reverse());
    if (latest.length >= recent) break;
  }
  const entries = (await Promise.all(latest.slice(0, recent).map((k) => stores.usage.get(k, { type: "json" })))).filter(Boolean);

  return {
    settings: await readSettings(stores),
    envEnabled: cfg.envEnabled,
    hasKey: cfg.hasKey,
    model: cfg.model,
    dailyBudgetUsd: cfg.dailyBudgetUsd,
    knowledge: KNOWLEDGE_VERSION,
    days: rows,
    recent: entries.map((e) => ({ at: e.at, q: e.q, outcome: e.outcome, usd: e.usd, firstTokenMs: e.firstTokenMs, page: e.page })),
  };
}

export function createAdminHandler({ stores, env, now = Date.now }) {
  return async function handle(request) {
    const expected = env("CHAT_ADMIN_TOKEN");
    if (!expected) return json(404, { error: "Set CHAT_ADMIN_TOKEN in Netlify to use the chat dashboard." });
    const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!sameSecret(given, expected)) return json(401, { error: "Wrong owner token." });

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json(400, { error: "Send JSON." }); }
      if (typeof body?.enabled !== "boolean") return json(400, { error: "Send {\"enabled\": true|false}." });
      await stores.settings.setJSON("settings", { enabled: body.enabled, updatedAt: now() });
    } else if (request.method !== "GET") {
      return json(405, { error: "GET or POST only" });
    }
    return json(200, await summarize(stores, env, { now }));
  };
}
