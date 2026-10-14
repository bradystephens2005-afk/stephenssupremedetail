// POST /api/chat — the website's chat assistant. Logic lives in ../lib/chat-core.mjs.
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import { createChatHandler } from "../lib/chat-core.mjs";

const env = (name) => Netlify.env.get(name);
let handler;

export default async (request) => {
  handler ??= createChatHandler({
    anthropic: new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") || "missing", maxRetries: 1, timeout: 30_000 }),
    stores: {
      sessions: getStore({ name: "chat-sessions", consistency: "strong" }),
      usage: getStore({ name: "chat-usage", consistency: "strong" }),
      settings: getStore({ name: "chat-settings", consistency: "strong" }),
    },
    env,
  });
  return handler(request);
};

export const config = {
  path: "/api/chat",
  method: "POST",
  // Per visitor IP: 20 messages a minute is plenty for a person and stops scripts.
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
