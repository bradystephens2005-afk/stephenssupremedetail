# Perch & Purr

Static store for a cordless cat window perch. No framework.

## Folders

| Path | What it is |
|---|---|
| `build.py` | Makes every page. Prices, product text and the photo list are at the top. |
| `assets/site.css`, `assets/site.js` | Shared styles and code. **Stripe Payment Links are at the top of `site.js`.** |
| `images/` | Photos (drawings for now, made by `tools/draw_placeholders.py`). |
| `site/` | Built multi-page store. |
| `single/index.html` | Built one-file store (hash routes like `#/window-perch`). |
| `tests/site.test.mjs` | Playwright checks for both versions. |
| `netlify/functions/` | The chat assistant's server: `chat.mjs` (`/api/chat`) and `chat-admin.mjs` (`/api/chat-admin`). |
| `netlify/lib/` | Chat logic (`chat-core.mjs`), its instructions (`prompt.mjs`) and `knowledge.mjs`, which `build.py` writes from the site's pages. |
| `tests/chat.test.mjs` | Chat server checks (no network). |
| `tools/chat_eval.mjs` | 20 real questions against the real model, with pass/fail targets. |

## Change something, then rebuild

```
python3 build.py
npm install          # first time only
npm test             # chat server checks, then the Playwright checks
```

## Deploy (Netlify CLI)

Drag-and-drop can't deploy the chat's server functions, so deploy from this folder instead.
It publishes `single/` plus `netlify/functions/` (set in `netlify.toml`).

First time only:

1. `npm install -g netlify-cli`, then `netlify login`, then `netlify link` and pick `perch-and-purr`.
2. In Netlify, open **Project configuration → Environment variables** and add these with the **Functions** scope:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com. Mark it secret.
   - `CHAT_ADMIN_TOKEN`: any long random password. It opens `/owner/chat/`.
   - Optional: `CHAT_DAILY_BUDGET_USD` (default `5`), `CHAT_MODEL` (default `claude-haiku-5-5`), `CHAT_ENABLED=false` to keep chat off for a whole deploy.
3. **Forms → Enable form detection** if it isn't on already.

Every time: `npm run deploy` (it rebuilds, then deploys to production).

## Chat assistant

A "Ask a question" button that answers from the site's own help, product and policy pages using Claude Haiku 5.5.

- **What it knows.** `build.py` copies the text of the public pages into `netlify/lib/knowledge.mjs` on every build. To teach it something, put it on a page and redeploy. It's told to say "I don't have information about that" and give the email address for anything else, and it can't see or change orders.
- **Who sees it.** `CHAT_MODE` near the top of `build.py`. It starts as `"beta"`: only browsers that opened any page with `?chat=beta` see the button (`?chat=off` hides it again). After a week of good numbers, change it to `"on"` and deploy.
- **Off switch.** `/owner/chat/` (with `CHAT_ADMIN_TOKEN`) turns it off or on immediately, no deploy needed. Visitors then see the email address instead.
- **Cost.** `/owner/chat/` shows spend, cache hits, wait times and recent questions for the last 14 days. A typical answer costs well under a tenth of a cent. Once a day's spend reaches `CHAT_DAILY_BUDGET_USD`, it stops calling the model until midnight Eastern.
- **Limits.** 800 characters a message, 40 messages a chat, 20 messages a minute per visitor, and rude messages get a polite reply without reaching the model.
- **Before turning it on for everyone,** run the eval with a real key and make sure every target passes:
  ```
  ANTHROPIC_API_KEY=sk-ant-... npm run eval:chat
  ```
  Targets: the first word arrives within 1.5 s (median), 90% of in-scope answers carry the right facts, and 80% of out-of-scope questions are declined.
- **Saved chats.** Conversations and usage are stored in Netlify Blobs (stores `chat-sessions`, `chat-usage`, `chat-settings`). The privacy policy says so.

## Swap in a real photo

Put the photo in `images/`, then change that entry's `file`, `w` and `h` in `IMAGES` in `build.py`.
The note under each gallery lists which pictures are still drawings, and disappears once they are all photos.
