// GET/POST /api/chat-admin — usage numbers and the on/off switch for the owner page.
// Needs the CHAT_ADMIN_TOKEN environment variable, sent as "Authorization: Bearer <token>".
import { getStore } from "@netlify/blobs";
import { createAdminHandler } from "../lib/chat-core.mjs";

let handler;

export default async (request) => {
  handler ??= createAdminHandler({
    stores: {
      sessions: getStore({ name: "chat-sessions", consistency: "strong" }),
      usage: getStore({ name: "chat-usage", consistency: "strong" }),
      settings: getStore({ name: "chat-settings", consistency: "strong" }),
    },
    env: (name) => Netlify.env.get(name),
  });
  return handler(request);
};

export const config = {
  path: "/api/chat-admin",
  method: ["GET", "POST"],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
