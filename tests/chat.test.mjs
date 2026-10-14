// Chat assistant server tests. No network: the model and Netlify Blobs are fakes.
//   node --test tests/chat.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {
  createAdminHandler, createChatHandler, costUsd, dayKey, LIMITS, REPLIES, screen,
} from "../netlify/lib/chat-core.mjs";
import { SYSTEM_PROMPT } from "../netlify/lib/prompt.mjs";
import { CONTACT_EMAIL, KNOWLEDGE } from "../netlify/lib/knowledge.mjs";
import { memoryStores } from "../tools/memory-store.mjs";

// ---------- fakes ----------
const stores = memoryStores;

const USAGE = { input_tokens: 40, output_tokens: 60, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 };
function fakeAnthropic({ chunks = ["Ships ", "free."], stop = "end_turn", usage = USAGE, error = null } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params);
        return {
          async *[Symbol.asyncIterator]() {
            if (error) throw error;
            yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
            for (const text of chunks) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
          },
          async finalMessage() {
            return { stop_reason: stop, usage, content: [{ type: "text", text: chunks.join("") }] };
          },
        };
      },
    },
  };
}
const envOf = (vars = {}) => (name) => ({ ANTHROPIC_API_KEY: "test-key", ...vars })[name];

const post = (body) => new Request("http://x/api/chat", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
async function events(res) {
  const text = await res.text();
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const replyText = (evs) => evs.reduce((s, e) => (e.t === "delta" ? s + e.text : e.t === "replace" ? e.text : s), "");

// ---------- prompt ----------
test("system prompt carries the shop knowledge and stays the same between requests", () => {
  assert.ok(SYSTEM_PROMPT.includes(KNOWLEDGE));
  assert.match(SYSTEM_PROMPT, /I don't have information about that/);
  assert.match(KNOWLEDGE, /\$32\.00/);
  assert.match(KNOWLEDGE, /30 days from delivery/);
  assert.doesNotMatch(SYSTEM_PROMPT, /\b20\d\d-\d\d-\d\d\b/, "no dates that would break the prompt cache");
});

test("knowledge lists only page links whose sections exist", () => {
  const links = [...KNOWLEDGE.matchAll(/^- (\/\S*) \(/gm)].map((m) => m[1]);
  for (const want of ["/help/#setup", "/help/#care", "/policies/#returns", "/policies/#shipping", "/window-perch/"]) {
    assert.ok(links.includes(want), `missing ${want}`);
  }
  assert.ok(!links.includes("/help/#cover") && !links.includes("/window-perch/#fit"), "listed a section that doesn't exist");
  assert.match(SYSTEM_PROMPT, /Page links/);
  assert.match(SYSTEM_PROMPT, /Call the owner "Brady"/);
});

// ---------- chat ----------
test("streams an answer, caches the system prompt and saves the session", async () => {
  const s = stores();
  const anthropic = fakeAnthropic();
  const handle = createChatHandler({ anthropic, stores: s, env: envOf() });
  const res = await handle(post({ message: "  How much is shipping? ", page: "/window-perch/" }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /ndjson/);
  const evs = await events(res);
  assert.equal(evs[0].t, "start");
  assert.equal(evs.at(-1).t, "done");
  assert.equal(replyText(evs), "Ships free.");

  const params = anthropic.calls[0];
  assert.equal(params.model, "claude-haiku-5-5");
  assert.deepEqual(params.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(params.system[0].text, SYSTEM_PROMPT);
  assert.deepEqual(params.output_config, { effort: "low" });
  assert.equal(params.temperature, undefined);
  assert.deepEqual(params.messages, [{ role: "user", content: "How much is shipping?" }]);

  const session = await s.sessions.get(evs[0].sessionId);
  assert.deepEqual(session.messages.map((m) => [m.role, m.text]), [["user", "How much is shipping?"], ["assistant", "Ships free."]]);
  const [logKey] = (await s.usage.list({ prefix: "log/" })).blobs.map((b) => b.key);
  const log = await s.usage.get(logKey);
  assert.equal(log.outcome, "answered");
  assert.equal(log.page, "/window-perch/");
  assert.equal(log.usage.cacheRead, 6000);
  assert.ok(log.usd > 0 && log.usd < 0.001, `cost ${log.usd}`);
  const totals = await s.usage.get(`totals/${dayKey(Date.now())}`);
  assert.equal(totals.messages, 1);
  assert.equal(totals.sessions, 1);
});

test("a second message in the session sends the earlier exchange as history", async () => {
  const s = stores();
  const anthropic = fakeAnthropic();
  const handle = createChatHandler({ anthropic, stores: s, env: envOf() });
  const first = await events(await handle(post({ message: "Hi" })));
  const sessionId = first[0].sessionId;
  const second = await events(await handle(post({ message: "And returns?", sessionId })));
  assert.equal(second[0].sessionId, sessionId);
  assert.deepEqual(anthropic.calls[1].messages.map((m) => m.role), ["user", "assistant", "user"]);
  const totals = await s.usage.get(`totals/${dayKey(Date.now())}`);
  assert.equal(totals.messages, 2);
  assert.equal(totals.sessions, 1);
});

test("history sent to the model is capped and starts with the visitor", async () => {
  const s = stores();
  const id = "11111111-2222-4333-8444-555555555555";
  const messages = [];
  for (let i = 0; i < 10; i++) messages.push({ role: "user", text: `q${i}` }, { role: "assistant", text: `a${i}` });
  await s.sessions.setJSON(id, { id, createdAt: 1, messages, usd: 0 });
  const anthropic = fakeAnthropic();
  await events(await createChatHandler({ anthropic, stores: s, env: envOf() })(post({ message: "next", sessionId: id })));
  const sent = anthropic.calls[0].messages;
  assert.equal(sent.length, LIMITS.historyMessages + 1);
  assert.equal(sent[0].role, "user");
  assert.equal(sent.at(-1).content, "next");
});

test("an unknown or malformed session id starts a fresh session", async () => {
  const s = stores();
  const handle = createChatHandler({ anthropic: fakeAnthropic(), stores: s, env: envOf() });
  const evs = await events(await handle(post({ message: "Hi", sessionId: "../../etc/passwd" })));
  assert.match(evs[0].sessionId, /^[0-9a-f-]{36}$/);
});

test("rejects empty, too-long and non-JSON messages without calling the model", async () => {
  const anthropic = fakeAnthropic();
  const handle = createChatHandler({ anthropic, stores: stores(), env: envOf() });
  assert.equal((await handle(post({ message: "   " }))).status, 400);
  assert.equal((await handle(post({ message: "x".repeat(LIMITS.messageChars + 1) }))).status, 400);
  assert.equal((await handle(new Request("http://x/api/chat", { method: "POST", body: "nope" }))).status, 400);
  assert.equal((await handle(new Request("http://x/api/chat"))).status, 405);
  assert.equal(anthropic.calls.length, 0);
});

test("profanity is answered politely without reaching the model, and isn't stored", async () => {
  const s = stores();
  const anthropic = fakeAnthropic();
  const evs = await events(await createChatHandler({ anthropic, stores: s, env: envOf() })(post({ message: "this is shit" })));
  assert.equal(replyText(evs), REPLIES.filtered);
  assert.equal(anthropic.calls.length, 0);
  const session = await s.sessions.get(evs[0].sessionId);
  assert.equal(session.messages[0].text, "[filtered]");
  assert.equal(screen("Does it fit a classic Scunthorpe window?"), null);
  assert.equal(screen("Is the glass hard to clean?"), null);
});

test("kill switch: env var, stored setting or missing key all turn chat off", async () => {
  const anthropic = fakeAnthropic();
  const off1 = await createChatHandler({ anthropic, stores: stores(), env: envOf({ CHAT_ENABLED: "false" }) })(post({ message: "Hi" }));
  assert.equal(off1.status, 503);
  assert.equal((await off1.json()).disabled, true);

  const s = stores();
  await s.settings.setJSON("settings", { enabled: false });
  assert.equal((await createChatHandler({ anthropic, stores: s, env: envOf() })(post({ message: "Hi" }))).status, 503);

  const noKey = (name) => (name === "ANTHROPIC_API_KEY" ? undefined : undefined);
  assert.equal((await createChatHandler({ anthropic, stores: stores(), env: noKey })(post({ message: "Hi" }))).status, 503);
  assert.equal(anthropic.calls.length, 0);
});

test("daily budget stops model calls once today's spend reaches the cap", async () => {
  const s = stores();
  await s.usage.setJSON(`totals/${dayKey(Date.now())}`, { usd: 2.5 });
  const anthropic = fakeAnthropic();
  const evs = await events(await createChatHandler({ anthropic, stores: s, env: envOf({ CHAT_DAILY_BUDGET_USD: "2.50" }) })(post({ message: "Hi" })));
  assert.equal(replyText(evs), REPLIES.budget);
  assert.equal(anthropic.calls.length, 0);
});

test("a long chat is pointed to email instead of running on", async () => {
  const s = stores();
  const id = "11111111-2222-4333-8444-555555555555";
  const messages = [];
  for (let i = 0; i < LIMITS.sessionMessages; i++) messages.push({ role: "user", text: "q" }, { role: "assistant", text: "a" });
  await s.sessions.setJSON(id, { id, messages });
  const anthropic = fakeAnthropic();
  const evs = await events(await createChatHandler({ anthropic, stores: s, env: envOf() })(post({ message: "one more", sessionId: id })));
  assert.equal(replyText(evs), REPLIES.sessionFull);
  assert.equal(anthropic.calls.length, 0);
});

test("a refusal replaces any partial text with the out-of-scope answer", async () => {
  const s = stores();
  const evs = await events(await createChatHandler({ anthropic: fakeAnthropic({ chunks: ["Sure"], stop: "refusal" }), stores: s, env: envOf() })(post({ message: "x" })));
  assert.equal(replyText(evs), REPLIES.refusal);
  const totals = await s.usage.get(`totals/${dayKey(Date.now())}`);
  assert.equal(totals.refusals, 1);
});

test("API errors become a friendly message and are counted", async () => {
  const s = stores();
  const err = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "rate limited", new Headers());
  const evs = await events(await createChatHandler({ anthropic: fakeAnthropic({ error: err }), stores: s, env: envOf() })(post({ message: "Hi" })));
  assert.equal(replyText(evs), REPLIES.busy);
  assert.equal(evs.at(-1).t, "done");
  const totals = await s.usage.get(`totals/${dayKey(Date.now())}`);
  assert.equal(totals.errors, 1);

  const evs2 = await events(await createChatHandler({ anthropic: fakeAnthropic({ error: new Error("boom") }), stores: stores(), env: envOf() })(post({ message: "Hi" })));
  assert.equal(replyText(evs2), REPLIES.error);
  assert.ok(REPLIES.error.includes(CONTACT_EMAIL));
});

test("a reply cut off at max_tokens says so", async () => {
  const evs = await events(await createChatHandler({ anthropic: fakeAnthropic({ stop: "max_tokens" }), stores: stores(), env: envOf() })(post({ message: "Hi" })));
  assert.ok(replyText(evs).endsWith(REPLIES.cutShort));
});

test("concurrent messages don't lose each other's totals", async () => {
  const s = stores();
  const handle = createChatHandler({ anthropic: fakeAnthropic(), stores: s, env: envOf() });
  await Promise.all(Array.from({ length: 8 }, () => handle(post({ message: "Hi" })).then(events)));
  const totals = await s.usage.get(`totals/${dayKey(Date.now())}`);
  assert.equal(totals.messages, 8);
  assert.equal(totals.sessions, 8);
});

// ---------- cost ----------
test("cost math uses Haiku 5.5 rates with cache reads at 0.1x and 1-hour writes at 2x", () => {
  const usd = costUsd("claude-haiku-5-5", {
    input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000,
  });
  assert.equal(usd.toFixed(4), (0.1 + 0.5 + 0.01 + 0.2).toFixed(4));
  assert.equal(costUsd("some-unknown-model", { input_tokens: 5 }), null);
});

// ---------- owner endpoint ----------
test("owner endpoint needs the token, reports usage and flips the kill switch", async () => {
  const s = stores();
  const env = envOf({ CHAT_ADMIN_TOKEN: "s3cret", CHAT_DAILY_BUDGET_USD: "3" });
  await events(await createChatHandler({ anthropic: fakeAnthropic(), stores: s, env })(post({ message: "Do you ship to Hawaii?" })));
  const admin = createAdminHandler({ stores: s, env });
  const req = (method, token, body) => new Request("http://x/api/chat-admin", {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body && JSON.stringify(body),
  });

  assert.equal((await admin(req("GET", "wrong"))).status, 401);
  assert.equal((await createAdminHandler({ stores: s, env: envOf() })(req("GET", "s3cret"))).status, 404);

  const summary = await (await admin(req("GET", "s3cret"))).json();
  assert.equal(summary.settings.enabled, true);
  assert.equal(summary.dailyBudgetUsd, 3);
  assert.equal(summary.model, "claude-haiku-5-5");
  assert.equal(summary.days[0].messages, 1);
  assert.ok(summary.days[0].cacheHitRate > 0.9);
  assert.equal(summary.recent[0].q, "Do you ship to Hawaii?");

  const off = await (await admin(req("POST", "s3cret", { enabled: false }))).json();
  assert.equal(off.settings.enabled, false);
  assert.equal((await createChatHandler({ anthropic: fakeAnthropic(), stores: s, env })(post({ message: "Hi" }))).status, 503);
  assert.equal((await admin(req("POST", "s3cret", { enabled: "yes" }))).status, 400);
});
