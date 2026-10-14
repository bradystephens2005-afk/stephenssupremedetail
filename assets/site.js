/* Perch & Purr — site.js */

/* ============================================================
   STRIPE PAYMENT LINKS (live) — one per product.
   Paste each link from Stripe → Payment Links → Copy link.
   Any link that still contains "REPLACE" is treated as not ready:
   its buttons say "Checkout opening soon — join the launch list".
   ============================================================ */
const PAYMENT_LINKS = {
  "window-perch": "https://buy.stripe.com/4gM5kE6otaEA2TN75j5wI03",
  "fur-lifter": "https://buy.stripe.com/fZu00k9AF5kg1PJ75j5wI01",
  "cozy-window-bundle": "https://buy.stripe.com/9B6aEY7sx7soeCvblz5wI02",
};

(() => {
  "use strict";

  const doc = document;
  const SINGLE = doc.documentElement.dataset.mode === "single";
  const CART_KEY = "pp-cart-v1";
  const BUNDLE = "cozy-window-bundle";

  const readJSON = (id) => {
    const el = doc.getElementById(id);
    if (!el) return {};
    try { return JSON.parse(el.textContent); } catch (e) { return {}; }
  };
  const CATALOG = readJSON("pp-catalog");
  const IMAGES = readJSON("pp-images"); // single-file version only: name -> data URI
  const imgSrc = (ref) => IMAGES[ref] || ref;
  const money = (cents) => "$" + (cents / 100).toFixed(2);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isReady = (url) => typeof url === "string" && /^https:\/\/\S+$/.test(url) && !/REPLACE/i.test(url);
  const href = (path) => (SINGLE ? "#" + (path.replace(/\/$/, "") || "/") : path);

  const deliveredText = (p) => p.ship
    ? `${money(p.price + p.ship)} delivered (${money(p.price)} + ${money(p.ship)} shipping)`
    : `${money(p.price)} delivered, free shipping included`;

  /* ---------- storage (can be blocked in private windows) ---------- */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* cart lasts for this page only */ } },
  };

  /* ---------- cart ----------
     The page keeps the cart in memory and mirrors it to localStorage so it
     carries across pages and tabs. Storage is read when the page opens and
     when another tab changes it, never in the middle of this page's own edits. */
  const clean = (list) => (Array.isArray(list) ? list : [])
    .filter((l) => l && CATALOG[l.id])
    .map((l) => ({ id: l.id, qty: Math.max(1, Math.min(20, parseInt(l.qty, 10) || 1)) }));
  // Stored as {at, items}; "at" is when it was saved, so a stale copy never wins.
  const parse = (raw) => {
    try {
      const data = raw ? JSON.parse(raw) : null;
      if (Array.isArray(data)) return { at: 0, items: clean(data) };
      return { at: (data && +data.at) || 0, items: clean(data && data.items) };
    } catch (e) { return { at: 0, items: [] }; }
  };
  const loaded = parse(store.get(CART_KEY));
  let memoryCart = loaded.items;
  let version = loaded.at;
  const cart = {
    items() { return memoryCart.map((l) => ({ ...l })); },
    save(list) {
      memoryCart = clean(list);
      version = Math.max(Date.now(), version + 1);
      store.set(CART_KEY, JSON.stringify({ at: version, items: memoryCart }));
      renderCart();
    },
    // Take a newer cart saved by another tab or page; ignore older copies.
    sync(raw) {
      const incoming = parse(raw);
      if (incoming.at <= version) return;
      memoryCart = incoming.items;
      version = incoming.at;
      renderCart();
    },
    add(id, qty = 1) {
      const list = cart.items();
      const line = list.find((l) => l.id === id);
      if (line) line.qty = Math.min(20, line.qty + qty); else list.push({ id, qty });
      cart.save(list);
    },
    setQty(id, qty) {
      let list = cart.items();
      if (qty <= 0) list = list.filter((l) => l.id !== id);
      else list.forEach((l) => { if (l.id === id) l.qty = Math.min(20, qty); });
      cart.save(list);
    },
    remove(id) { cart.save(cart.items().filter((l) => l.id !== id)); },
    clear() { cart.save([]); },
  };

  function payButton(id, qty, label, newTab) {
    const url = PAYMENT_LINKS[id];
    if (!isReady(url)) {
      return `<button type="button" class="btn btn--block" data-buy="${id}">${esc(label)}</button>`;
    }
    const target = newTab ? ' target="_blank" rel="noopener"' : "";
    return `<a class="btn btn--block" href="${esc(url)}"${target} data-pay="${id}">${esc(label)}</a>`;
  }

  let renderedKey = null;
  function renderCart() {
    const items = cart.items();
    const count = items.reduce((n, l) => n + l.qty, 0);
    doc.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = count;
      el.dataset.count = count;
    });
    const label = doc.querySelector("[data-cart-label]");
    if (label) label.setAttribute("aria-label", `Cart, ${count} ${count === 1 ? "item" : "items"}`);

    const body = doc.getElementById("cart-body");
    const foot = doc.getElementById("cart-foot");
    if (!body || !foot) return;
    // Only rebuild the drawer when its contents changed, so nothing shifts under the pointer.
    const key = JSON.stringify(items);
    if (key === renderedKey && body.childElementCount) return;
    renderedKey = key;

    if (!items.length) {
      body.innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 56V30a20 20 0 0 1 40 0v26Z" fill="#EBF0F3" stroke="#C5D4DC" stroke-width="3"/><path d="M32 12v44M12 38h40" stroke="#C5D4DC" stroke-width="3"/></svg>
        <p>Your cart is empty.</p>
        <a class="btn btn--ghost" href="${href("/shop/")}" data-close-cart>Browse the shop</a></div>`;
      foot.hidden = true;
      foot.innerHTML = "";
      return;
    }

    body.innerHTML = items.map((l) => {
      const p = CATALOG[l.id];
      const shipping = p.ship ? `+ ${money(p.ship)} shipping` : "Free shipping";
      return `<div class="cart-line">
        <img src="${esc(imgSrc(p.img))}" alt="" width="72" height="72">
        <div>
          <h3><a href="${href(p.path)}" data-close-cart>${esc(p.name)}</a></h3>
          <span class="ship-note">${money(p.price)} each, ${shipping}</span>
          <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
            <button type="button" data-qty="${l.id}" data-step="-1" aria-label="One fewer">−</button>
            <output aria-live="polite">${l.qty}</output>
            <button type="button" data-qty="${l.id}" data-step="1" aria-label="One more">+</button>
          </div>
        </div>
        <div><div class="line-total">${money(p.price * l.qty)}</div>
          <button type="button" class="link-btn remove" data-remove="${l.id}">Remove</button></div>
      </div>`;
    }).join("");

    const has = (id) => items.some((l) => l.id === id);
    if (has("window-perch") && has("fur-lifter")) {
      const b = CATALOG[BUNDLE];
      const separate = CATALOG["window-perch"].price + CATALOG["fur-lifter"].price + CATALOG["fur-lifter"].ship;
      body.insertAdjacentHTML("afterbegin", `<div class="cart-tip">
        <p><strong>Better as a bundle.</strong> The Cozy Window Bundle has the perch and the Fur Lifter, plus a spare fleece pad and a gift-ready box, for ${money(b.price)} with free shipping. Bought separately, those two come to ${money(separate)}.</p>
        <button type="button" class="btn btn--small" data-switch-bundle>Switch to the bundle</button></div>`);
    }

    const subtotal = items.reduce((s, l) => s + CATALOG[l.id].price * l.qty, 0);
    // Each product checks out on its own Stripe page, so shipping is charged once per product.
    const shipping = items.reduce((s, l) => s + CATALOG[l.id].ship, 0);
    const multi = items.length > 1;
    const qtyNote = items.some((l) => l.qty > 1)
      ? `<p class="cart-note">Stripe starts each checkout at a quantity of 1. Change it there to match your cart.</p>` : "";

    let pay;
    if (multi) {
      pay = `<p class="cart-note">Stripe checks out one product at a time. Each button opens its own secure checkout in a new tab, and you'll get a receipt for each.</p>
        <div class="pay-list">${items.map((l) => {
          const p = CATALOG[l.id];
          const amount = money(p.price * l.qty + p.ship);
          return payButton(l.id, l.qty, `Pay for ${p.name}${l.qty > 1 ? ` (${l.qty})` : ""}, ${amount}`, true);
        }).join("")}</div>`;
    } else {
      pay = payButton(items[0].id, items[0].qty, "Checkout", false);
    }

    foot.hidden = false;
    foot.innerHTML = `
      <div class="sum-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="sum-row"><span>Shipping</span><span>${shipping ? money(shipping) : "Free"}</span></div>
      <div class="sum-row total"><span>Total</span><span>${money(subtotal + shipping)}</span></div>
      <p class="cart-note">Sales tax, if any, is added at checkout.</p>
      ${pay}${qtyNote}
      <p class="cart-note">Secure checkout by Stripe.</p>`;
  }

  /* ---------- cart drawer ---------- */
  let lastFocus = null;
  function openCart() {
    const drawer = doc.getElementById("cart");
    const overlay = doc.getElementById("cart-overlay");
    if (!drawer) return;
    lastFocus = doc.activeElement;
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add("is-open"); overlay.classList.add("is-open"); });
    doc.querySelectorAll("[data-open-cart]").forEach((b) => b.setAttribute("aria-expanded", "true"));
    drawer.querySelector("[data-close-cart]").focus();
  }
  function closeCart() {
    const drawer = doc.getElementById("cart");
    const overlay = doc.getElementById("cart-overlay");
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    doc.querySelectorAll("[data-open-cart]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    setTimeout(() => { drawer.hidden = true; overlay.hidden = true; }, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- buying ---------- */
  function buy(id) {
    const url = PAYMENT_LINKS[id];
    if (isReady(url)) {
      window.location.href = url;
      return;
    }
    const dlg = doc.getElementById("soon-dialog");
    const name = CATALOG[id] ? CATALOG[id].name : "This item";
    if (dlg && typeof dlg.showModal === "function") {
      dlg.querySelector("[data-soon-name]").textContent = name;
      const src = dlg.querySelector('input[name="source"]');
      if (src) src.value = "checkout-soon:" + id;
      if (!dlg.open) dlg.showModal();
    } else {
      toast("Checkout opening soon — join the launch list");
    }
  }

  let toastTimer;
  function toast(msg) {
    let el = doc.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
  }

  /* ---------- delivery dates: today + 4 to 10 business days ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const nth = (month, weekday, n) => { // nth weekday of month (n = -1 for last)
      if (n > 0) {
        const d = new Date(y, month, 1);
        d.setDate(1 + ((weekday - d.getDay() + 7) % 7) + (n - 1) * 7);
        return d;
      }
      const d = new Date(y, month + 1, 0);
      d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
      return d;
    };
    const observed = (month, day) => {
      const d = new Date(y, month, day);
      if (d.getDay() === 6) d.setDate(d.getDate() - 1);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      return d;
    };
    const list = [
      observed(0, 1), nth(0, 1, 3), nth(1, 1, 3), nth(4, 1, -1), observed(5, 19), observed(6, 4),
      nth(8, 1, 1), nth(9, 1, 2), observed(10, 11), nth(10, 4, 4), observed(11, 25),
    ];
    holidayCache[y] = new Set(list.map(ymd));
    return holidayCache[y];
  }
  const isBusinessDay = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !holidays(d.getFullYear()).has(ymd(d));
  function addBusinessDays(from, n) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (n > 0) {
      d.setDate(d.getDate() + 1);
      if (isBusinessDay(d)) n -= 1;
    }
    return d;
  }
  const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
  function renderDelivery(scope) {
    const now = new Date();
    const text = `${dayFmt.format(addBusinessDays(now, 4))} – ${dayFmt.format(addBusinessDays(now, 10))}`;
    scope.querySelectorAll("[data-delivery]").forEach((el) => { el.textContent = text; });
  }
  function scheduleMidnightRefresh() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => { renderDelivery(doc); scheduleMidnightRefresh(); }, next - now);
  }

  /* ---------- product buy box ---------- */
  function syncBuybox(box) {
    const select = box.querySelector("[data-option]");
    if (!select) return;
    const id = select.value;
    const p = CATALOG[id];
    if (!p) return;
    const set = (sel, fn) => doc.querySelectorAll(sel).forEach(fn);
    set("[data-bb-price]", (el) => { el.textContent = money(p.price); });
    set("[data-bb-compare]", (el) => {
      el.hidden = !p.compare;
      const s = el.querySelector("s");
      if (s && p.compare) s.textContent = money(p.compare);
    });
    set("[data-bb-delivered]", (el) => { el.textContent = deliveredText(p); });
    set("[data-bb-short]", (el) => { el.textContent = p.ship ? `${money(p.price + p.ship)} delivered` : `${money(p.price)}, free shipping`; });
    set("[data-bb-name]", (el) => { el.textContent = p.name; });
    set("[data-bb-buy]", (el) => { el.dataset.buy = id; });
    set("[data-bb-add]", (el) => { el.dataset.add = id; });
    set("[data-bb-ship]", (el) => {
      el.textContent = p.ship ? `Ships in 3 business days for ${money(p.ship)}, tracking by email` : "Ships free in 3 business days, tracking by email";
    });
  }

  /* ---------- forms (Netlify) ---------- */
  async function submitForm(form) {
    const msg = form.querySelector(".form-msg");
    const button = form.querySelector('[type="submit"]');
    const fail = (text) => {
      if (msg) { msg.textContent = text; msg.className = "form-msg is-error"; }
      if (button) button.disabled = false;
    };
    if (form.querySelector('[name="bot-field"]') && form.querySelector('[name="bot-field"]').value) return;
    if (location.protocol === "file:") {
      fail("Forms work once the site is live on Netlify.");
      return;
    }
    if (button) button.disabled = true;
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const done = doc.createElement("div");
      done.className = "form-done";
      done.setAttribute("role", "status");
      done.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#DCEBE3"/><path d="m7 12.5 3.2 3L17 9" fill="none" stroke="#3D6B57" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${esc(form.dataset.done || "Thanks, got it.")}</span>`;
      form.replaceWith(done);
    } catch (e) {
      fail("That didn't send. Please try again, or email perchandpurr@gmail.com.");
    }
  }

  /* ---------- owner page ---------- */
  function initOwner(scope) {
    const panel = scope.querySelector("[data-owner]");
    if (!panel) return;
    const list = panel.querySelector("[data-link-status]");
    if (list) {
      list.innerHTML = Object.keys(CATALOG).map((id) => {
        const ready = isReady(PAYMENT_LINKS[id]);
        return `<li><span>${esc(CATALOG[id].name)}</span><span class="${ready ? "status-ok" : "status-warn"}">${ready ? "Live link set" : "Not set (shows “opening soon”)"}</span></li>`;
      }).join("");
    }
    const calc = panel.querySelector("[data-ship-calc]");
    if (calc) {
      const out = calc.querySelector("[data-calc-out]");
      const run = () => {
        const v = (n) => parseFloat(calc.querySelector(`[name="${n}"]`).value) || 0;
        const L = v("len"), W = v("wid"), H = v("hgt"), lb = v("lb");
        if (!L || !W || !H) { out.innerHTML = "Enter the folded box size to see how USPS will bill it."; return; }
        const cubicIn = L * W * H;
        const cubicFt = cubicIn / 1728;
        const longest = Math.max(L, W, H);
        const lines = [`Box volume: <strong>${cubicFt.toFixed(2)} cubic feet</strong> (${Math.round(cubicIn)} cubic inches).`];
        let billable = Math.ceil(lb || 0);
        if (cubicIn > 1728) {
          const dim = Math.ceil(cubicIn / 139);
          billable = Math.max(billable, dim);
          lines.push(`Over 1 cubic foot, so USPS bills by size: ${Math.round(cubicIn)} ÷ 139 = <strong>${dim} lb</strong> “dimensional weight”.`);
        } else {
          lines.push("Under 1 cubic foot, so USPS bills by actual weight.");
        }
        lines.push(`Billed as <strong>${billable || "—"} lb</strong>.`);
        lines.push(longest > 22
          ? `Longest side is ${longest} in, over 22 in, so add the <strong>$4.50</strong> oversize fee.`
          : `Longest side is ${longest} in, so no oversize fee.`);
        lines.push("Price that weight to a far-away zip (like 98101) in Pirate Ship to set shipping safely.");
        out.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
      };
      calc.addEventListener("input", run);
      run();
    }
  }

  /* ============================================================
     CHAT ASSISTANT — talks to /api/chat (netlify/functions/chat.mjs).
     <html data-chat> says who sees it: "on", "off", or "beta" (only
     browsers that opened a page with ?chat=beta; ?chat=off undoes it).
     The conversation lives in sessionStorage so it follows the visitor
     from page to page and ends when the tab closes.
     ============================================================ */
  const CHAT_KEY = "pp-chat-v1";
  const CHAT_BETA_KEY = "pp-chat-beta";
  const CHAT_API = "/api/chat";
  const CHAT_OFFLINE = "Chat isn't available right now. Please email perchandpurr@gmail.com and you'll get a reply within one business day.";
  const tabStore = {
    get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { sessionStorage.setItem(key, val); } catch (e) { /* chat lasts for this page only */ } },
  };
  const PAGE_PATHS = "shop|window-perch|cozy-window-bundle|fur-lifter|help|policies|about";
  const CHAT_LINKS = new RegExp(`(https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?'"]|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|\\/(?:${PAGE_PATHS})\\/(?:#[\\w-]+)?)`, "g");
  const pagePath = () => (SINGLE ? (location.hash.replace(/^#/, "") || "/") : location.pathname);
  const linkTo = (path, anchor) => (SINGLE
    ? "#" + (path.replace(/\/$/, "") || "/") + (anchor ? "/" + anchor : "")
    : path + (anchor ? "#" + anchor : ""));

  // Escape the reply, then turn emails, site paths and web addresses into links.
  function chatHtml(text) {
    return String(text).split(CHAT_LINKS).map((part, i) => {
      if (i % 2 === 0) return esc(part);
      if (part.includes("@") && !part.startsWith("http")) return `<a href="mailto:${esc(part)}">${esc(part)}</a>`;
      if (part.startsWith("/")) {
        const [path, anchor] = part.split("#");
        return `<a href="${esc(linkTo(path, anchor))}" data-chat-link>${esc(part)}</a>`;
      }
      return `<a href="${esc(part)}" rel="noopener" target="_blank">${esc(part)}</a>`;
    }).join("");
  }

  function chatAllowed() {
    if (location.protocol === "file:") return false; // the one-file store opened from disk has no server
    const mode = doc.documentElement.dataset.chat || "off";
    const flag = new URLSearchParams(location.search).get("chat");
    if (flag === "beta") store.set(CHAT_BETA_KEY, "1");
    if (flag === "off") store.set(CHAT_BETA_KEY, "0");
    if (mode === "on") return true;
    return mode === "beta" && store.get(CHAT_BETA_KEY) === "1";
  }

  function initChat() {
    const panel = doc.getElementById("chat");
    const launch = doc.querySelector("[data-chat-open]");
    if (!panel || !launch || !chatAllowed()) return;
    const log = panel.querySelector(".chat-log");
    const form = panel.querySelector("[data-chat-form]");
    const input = panel.querySelector("#chat-input");
    const send = form.querySelector('button[type="submit"]');
    const chips = panel.querySelector("[data-chat-chips]");
    const reset = panel.querySelector("[data-chat-reset]");
    const greeting = panel.dataset.greeting;

    let state = { sessionId: null, messages: [], open: false };
    try { state = { ...state, ...JSON.parse(tabStore.get(CHAT_KEY) || "{}") }; } catch (e) { /* start fresh */ }
    state.messages = (Array.isArray(state.messages) ? state.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-60);
    const persist = () => tabStore.set(CHAT_KEY, JSON.stringify(state));
    let busy = false;
    let offline = false;

    const bubble = (role, text) => {
      const el = doc.createElement("div");
      el.className = `chat-msg chat-msg--${role}`;
      if (role === "assistant") el.innerHTML = chatHtml(text); else el.textContent = text;
      return el;
    };
    function render() {
      log.replaceChildren(bubble("assistant", greeting), ...state.messages.map((m) => bubble(m.role, m.text)));
      chips.hidden = state.messages.length > 0 || offline;
      reset.hidden = state.messages.length === 0;
      log.scrollTop = log.scrollHeight;
    }
    const setBusy = (on) => {
      busy = on;
      send.disabled = on || offline;
      log.setAttribute("aria-busy", String(on));
    };
    const fit = () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 132) + "px";
    };

    function open(focus = true) {
      state.open = true;
      persist();
      panel.hidden = false;
      launch.hidden = true;
      launch.setAttribute("aria-expanded", "true");
      doc.documentElement.classList.add("chat-open");
      render();
      if (focus) input.focus();
    }
    function close() {
      state.open = false;
      persist();
      panel.hidden = true;
      launch.hidden = false;
      launch.setAttribute("aria-expanded", "false");
      doc.documentElement.classList.remove("chat-open");
      launch.focus();
    }

    async function ask(text) {
      text = text.trim();
      if (!text || busy || offline) return;
      setBusy(true);
      state.messages.push({ role: "user", text });
      persist();
      render();
      const reply = bubble("assistant", "");
      reply.classList.add("is-typing");
      reply.innerHTML = '<span class="chat-dots" aria-label="Typing"><i></i><i></i><i></i></span>';
      log.append(reply);
      log.scrollTop = log.scrollHeight;

      let answer = "";
      const show = () => {
        reply.classList.remove("is-typing");
        reply.innerHTML = chatHtml(answer);
        log.scrollTop = log.scrollHeight;
      };
      try {
        const res = await fetch(CHAT_API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, sessionId: state.sessionId, page: pagePath() }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 503) { offline = true; answer = data.message || CHAT_OFFLINE; }
          else if (res.status === 429) answer = "You're sending messages quickly. Please wait a minute and try again.";
          else answer = data.error || CHAT_OFFLINE;
          show();
        } else {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop();
            for (const line of lines) {
              if (!line.trim()) continue;
              let ev;
              try { ev = JSON.parse(line); } catch (e) { continue; }
              if (ev.t === "start" && ev.sessionId) state.sessionId = ev.sessionId;
              else if (ev.t === "delta") { answer += ev.text; show(); }
              else if (ev.t === "replace") { answer = ev.text; show(); }
            }
          }
          if (!answer) { answer = CHAT_OFFLINE; show(); }
        }
      } catch (e) {
        answer = answer || CHAT_OFFLINE;
        show();
      }
      state.messages.push({ role: "assistant", text: answer });
      persist();
      setBusy(false);
      render();
      if (offline) input.disabled = true;
    }

    launch.hidden = false;
    launch.addEventListener("click", () => open());
    panel.querySelector("[data-chat-close]").addEventListener("click", close);
    reset.addEventListener("click", () => {
      state = { sessionId: null, messages: [], open: true };
      persist();
      render();
      input.focus();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value;
      input.value = "";
      fit();
      ask(text);
    });
    input.addEventListener("input", fit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    chips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-chat-ask]");
      if (chip) ask(chip.textContent);
    });
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    // On a phone the panel covers the page, so following a link closes it.
    log.addEventListener("click", (e) => {
      if (e.target.closest("[data-chat-link]") && window.innerWidth <= 640) close();
    });
    if (state.open) open(false); else render();
  }

  /* ---------- owner page: chat usage and on/off switch ---------- */
  const OWNER_TOKEN_KEY = "pp-chat-owner";
  function initChatOwner(scope) {
    const root = scope.querySelector("[data-chat-owner]");
    if (!root) return;
    const form = root.querySelector("[data-chat-token]");
    const msg = root.querySelector("[data-chat-msg]");
    const toggle = root.querySelector("[data-chat-toggle]");
    const tokenInput = form.querySelector('input[name="token"]');
    tokenInput.value = tabStore.get(OWNER_TOKEN_KEY) || "";
    let enabled = null;
    const usd = (n) => (n >= 1 ? "$" + n.toFixed(2) : n > 0 ? "$" + n.toFixed(4) : "$0");
    const pct = (n) => (n === null || n === undefined ? "—" : Math.round(n * 100) + "%");
    const secs = (ms) => (ms ? (ms / 1000).toFixed(1) + " s" : "—");

    function show(data) {
      enabled = data.settings.enabled;
      const live = data.envEnabled && data.hasKey && enabled;
      const rows = [
        ["Status", live ? '<span class="status-ok">On</span>' : '<span class="status-warn">Off</span>'],
        ["Switch on this page", enabled ? "On" : "Off"],
        ["CHAT_ENABLED in Netlify", data.envEnabled ? "Not blocking" : '<span class="status-warn">false (chat off for this deploy)</span>'],
        ["Anthropic API key", data.hasKey ? "Set" : '<span class="status-warn">Missing</span>'],
        ["Model", esc(data.model)],
        ["Daily spending cap", usd(data.dailyBudgetUsd)],
        ["Knowledge version", esc(data.knowledge)],
      ];
      root.querySelector("[data-chat-status]").innerHTML = rows.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join("");
      toggle.hidden = false;
      toggle.textContent = enabled ? "Turn chat off" : "Turn chat on";
      root.querySelector("[data-chat-days] tbody").innerHTML = data.days.map((d) => `<tr>
        <th scope="row">${esc(d.day)}</th><td>${d.sessions}</td><td>${d.messages}</td><td>${usd(d.usd)}</td>
        <td>${pct(d.cacheHitRate)}</td><td>${secs(d.avgFirstTokenMs)}</td><td>${d.refusals}</td><td>${d.filtered}</td><td>${d.errors}</td></tr>`).join("");
      const recent = root.querySelector("[data-chat-recent]");
      recent.innerHTML = data.recent.length
        ? data.recent.map((r) => `<li><span>${esc(r.q || "(filtered)")}</span><span class="muted">${esc(r.outcome)} · ${new Date(r.at).toLocaleString()}</span></li>`).join("")
        : '<li><span class="muted">No questions yet.</span></li>';
    }

    async function call(method, body) {
      msg.textContent = "";
      msg.classList.remove("is-error");
      try {
        const res = await fetch("/api/chat-admin", {
          method,
          headers: { authorization: "Bearer " + tokenInput.value, "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `The server said ${res.status}.`);
        tabStore.set(OWNER_TOKEN_KEY, tokenInput.value);
        show(data);
      } catch (e) {
        msg.classList.add("is-error");
        msg.textContent = e.message || "Couldn't reach the chat server.";
      }
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); call("GET"); });
    toggle.addEventListener("click", () => call("POST", { enabled: !enabled }));
    if (tokenInput.value) call("GET");
  }

  /* ============================================================
     MOTION — one scroll loop drives every scroll effect.
     Everything below is decoration: with reduced motion, or without
     JavaScript, the page shows its finished state.
     ============================================================ */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isWide = () => window.innerWidth > 860;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  let scrollers = [];   // page effects, rebuilt on every route
  let layouts = [];     // things to re-measure on resize
  let observers = [];
  let ticking = false;

  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    for (const fn of scrollers) fn(vh);
  }
  function requestFrame() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", () => { layouts.forEach((fn) => fn()); requestFrame(); });

  /* reveal on enter */
  const revealer = "IntersectionObserver" in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revealer.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" })
    : null;
  if (revealer) doc.documentElement.classList.add("js-reveal");

  function observe(el, opts, fn) {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach(fn), opts);
    io.observe(el);
    observers.push(io);
  }

  /* numbers count up when the spec window comes into view */
  function countUp(el) {
    const target = parseInt(el.dataset.countup, 10);
    if (reduceMotion || !target) return;
    el.textContent = "0";
    observe(el, { threshold: .6 }, (en) => {
      if (!en.isIntersecting || el.dataset.done) return;
      el.dataset.done = "1";
      const t0 = performance.now();
      const dur = 1400;
      const step = (now) => {
        const k = clamp((now - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* reversible cover: the slider flips the pad and warms the room */
  function initFlip(sec) {
    const input = sec.querySelector("[data-weather]");
    const pad = sec.querySelector(".pad");
    const out = sec.querySelector("[data-cover-out]");
    if (!input || !pad) return;
    let side = null;
    const update = () => {
      const v = input.value / 100;
      const deg = v * 180;
      sec.style.setProperty("--warm", v.toFixed(3));
      pad.style.setProperty("--flip", deg.toFixed(1) + "deg");
      sec.style.setProperty("--edge", Math.abs(Math.cos(deg * Math.PI / 180)).toFixed(3));
      const next = v < .5 ? "fleece" : "mesh";
      if (next !== side) {
        side = next;
        out.innerHTML = next === "fleece"
          ? "<strong>Fleece side up.</strong> A warm spot for cold-glass mornings."
          : "<strong>Mesh side up.</strong> Breathable when the sun is strong.";
      }
    };
    input.addEventListener("input", update);
    // tapping the pad flips it the rest of the way
    sec.querySelector(".pad-stage").addEventListener("click", () => {
      const from = +input.value;
      const to = from < 50 ? 82 : 18;
      if (reduceMotion) { input.value = to; update(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const k = clamp((now - t0) / 900);
        const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        input.value = from + (to - from) * e;
        update();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    update();
  }

  /* a day at the window: vertical scroll moves the day sideways */
  function initHScroll(sec) {
    const track = sec.querySelector(".day-track");
    const dial = sec.querySelector(".day-dial");
    if (!track) return;
    let dist = 0;
    const layout = () => {
      if (!isWide() || reduceMotion) {
        sec.classList.remove("is-pinned");
        sec.style.height = "";
        track.style.transform = "";
        return;
      }
      sec.classList.add("is-pinned");
      dist = Math.max(0, track.scrollWidth - window.innerWidth);
      sec.style.height = (dist + window.innerHeight) + "px";
    };
    layout();
    layouts.push(layout);
    scrollers.push((vh) => {
      if (!sec.classList.contains("is-pinned")) return;
      const r = sec.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      track.style.transform = `translate3d(${(-p * dist).toFixed(1)}px,0,0)`;
      if (dial) dial.style.setProperty("--p", p.toFixed(3));
    });
    track.addEventListener("scroll", () => {
      const max = track.scrollWidth - track.clientWidth;
      if (dial && max > 0) dial.style.setProperty("--p", (track.scrollLeft / max).toFixed(3));
    }, { passive: true });
  }

  /* setup story: the drawing follows whichever step is in the middle */
  function initStory(sec) {
    const visual = sec.querySelector(".story-visual");
    const steps = [...sec.querySelectorAll("[data-step-trigger]")];
    if (reduceMotion || !("IntersectionObserver" in window)) {
      visual.dataset.step = "3";
      steps.forEach((s) => s.classList.add("is-active"));
      return;
    }
    visual.dataset.step = "0";
    steps.forEach((s) => observe(s, { rootMargin: "-42% 0px -42% 0px" }, (en) => {
      if (!en.isIntersecting) return;
      steps.forEach((x) => x.classList.toggle("is-active", x === s));
      visual.dataset.step = s.dataset.stepTrigger;
    }));
  }

  /* hero: the arch leans toward the pointer, the light moves the other way */
  function initHero(hero) {
    const layers = [...hero.querySelectorAll("[data-depth]")];
    const arch = hero.querySelector(".arch");
    const photo = hero.querySelector(".arch-photo");
    if (!reduceMotion) {
      scrollers.push((vh) => {
        const p = clamp(window.scrollY / vh);
        if (photo) photo.style.setProperty("--zoom", (1.1 - p * .1).toFixed(3));
      });
    }
    if (!finePointer || reduceMotion || !layers.length) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const tick = () => {
      x += (tx - x) * .08;
      y += (ty - y) * .08;
      layers.forEach((el) => {
        const d = parseFloat(el.dataset.depth);
        const rot = el === arch ? ` rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 5).toFixed(2)}deg)` : "";
        el.style.transform = `translate3d(${(x * d).toFixed(1)}px,${(y * d).toFixed(1)}px,0)${rot}`;
      });
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .001 ? requestAnimationFrame(tick) : 0;
    };
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - .5;
      ty = (e.clientY - r.top) / r.height - .5;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    hero.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  }

  function initMotion(scope) {
    scrollers = [];
    layouts = [];
    observers.forEach((io) => io.disconnect());
    observers = [];

    if (revealer) scope.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => revealer.observe(el));
    scope.querySelectorAll("[data-countup]").forEach(countUp);
    scope.querySelectorAll("[data-flip]").forEach(initFlip);
    scope.querySelectorAll("[data-hscroll]").forEach(initHScroll);
    scope.querySelectorAll("[data-story]").forEach(initStory);
    scope.querySelectorAll("[data-hero]").forEach(initHero);

    // spotlight that follows the pointer across the featured product
    scope.querySelectorAll("[data-spot]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--sx", `${e.clientX - r.left}px`);
        el.style.setProperty("--sy", `${e.clientY - r.top}px`);
      });
    });

    if (!reduceMotion) {
      // depth: light and photos drift at different speeds
      scope.querySelectorAll("[data-parallax], .lightfall").forEach((el) => {
        const f = parseFloat(el.dataset.parallax || "0.14");
        const ref = el.parentElement;
        scrollers.push((vh) => {
          const r = ref.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          el.style.setProperty("--py", `${(-(r.top + r.height / 2 - vh / 2) * f).toFixed(1)}px`);
        });
      });

      // the statement lights up word by word as it crosses the screen
      scope.querySelectorAll("[data-scrub]").forEach((el) => {
        const words = [...el.querySelectorAll(".w")];
        scrollers.push((vh) => {
          const r = el.getBoundingClientRect();
          const p = clamp((vh * .85 - r.top) / (vh * .4 + r.height));
          const lit = Math.round(p * words.length);
          words.forEach((w, i) => w.classList.toggle("is-lit", i < lit));
        });
      });

      // the promise arch draws itself; the dusk sun sets
      scope.querySelectorAll("[data-draw]").forEach((sec) => {
        const path = sec.querySelector(".draw");
        scrollers.push((vh) => {
          const r = sec.getBoundingClientRect();
          const p = clamp((vh - r.top) / (r.height * .9));
          path.style.setProperty("--draw", (1 - p).toFixed(3));
        });
      });
      scope.querySelectorAll("[data-sunset]").forEach((sec) => {
        scrollers.push((vh) => {
          const r = sec.getBoundingClientRect();
          sec.style.setProperty("--p", clamp((vh - r.top) / (vh + r.height)).toFixed(3));
        });
      });
    } else {
      scope.querySelectorAll("[data-scrub] .w").forEach((w) => w.classList.add("is-lit"));
    }
    requestFrame();
  }

  /* header shrinks and shows the day's progress */
  const header = doc.querySelector(".site-header");
  scrollersGlobal();
  function scrollersGlobal() {
    const update = () => {
      if (!header) return;
      const max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      header.style.setProperty("--progress", clamp(window.scrollY / max).toFixed(4));
    };
    window.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- per-page setup (runs on load, and on every route in the single file) ---------- */
  function initPage(scope) {
    if (SINGLE) {
      scope.querySelectorAll("img[data-img]").forEach((img) => { img.src = imgSrc(img.dataset.img); });
    }
    renderDelivery(scope);
    scope.querySelectorAll("[data-buybox]").forEach(syncBuybox);
    scope.querySelectorAll('input[name="source"]').forEach((el) => {
      if (!el.value) el.value = SINGLE ? (location.hash || "#/") : location.pathname;
    });
    if (scope.querySelector("[data-thank-you]")) {
      const params = new URLSearchParams(SINGLE ? (location.hash.split("?")[1] || "") : location.search);
      // Stripe sends buyers here as /thank-you/?product=<id> (or ?paid=all).
      // Without either, someone is just visiting to leave a review: keep the cart.
      const paid = params.get("product");
      if (paid && CATALOG[paid]) cart.remove(paid);
      else if (params.get("paid") === "all") cart.clear();
    }
    initOwner(scope);
    initChatOwner(scope);
    initMotion(scope);
  }

  /* ---------- single-file router: #/window-perch, #/policies/returns ---------- */
  function findTemplate(path) {
    return doc.querySelector(`template[data-path="${CSS.escape(path)}"]`);
  }
  function route() {
    const raw = location.hash.replace(/^#/, "");
    if (raw && !raw.startsWith("/")) return; // a plain in-page anchor
    const path = ((raw.split("?")[0] || "/").replace(/\/+$/, "")) || "/";
    let tpl = findTemplate(path);
    let anchor = null;
    if (!tpl) {
      const cut = path.lastIndexOf("/");
      const parent = findTemplate(path.slice(0, cut) || "/");
      const id = path.slice(cut + 1);
      if (parent && cut > 0 && parent.content.getElementById(id)) { tpl = parent; anchor = id; }
    }
    if (!tpl) tpl = findTemplate("/404");

    closeCart();
    const main = doc.getElementById("main");
    main.replaceChildren(tpl.content.cloneNode(true));
    doc.title = tpl.dataset.title;
    const desc = doc.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", tpl.dataset.description || "");
    const robots = doc.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute("content", tpl.dataset.noindex ? "noindex, nofollow" : "index, follow");
    doc.body.classList.toggle("has-buybar", !!tpl.dataset.buybar);
    const navPath = tpl.dataset.nav || tpl.dataset.path;
    doc.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === navPath) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    doc.getElementById("site-nav").classList.remove("is-open");
    doc.documentElement.classList.remove("menu-open");
    doc.querySelectorAll("[data-menu]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    initPage(main);
    if (anchor) {
      const el = doc.getElementById(anchor);
      requestAnimationFrame(() => el.scrollIntoView());
    } else {
      window.scrollTo(0, 0);
    }
    main.focus({ preventScroll: true });
  }

  /* ---------- events (delegated, so they survive route changes) ---------- */
  doc.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-close-cart]");
    if (!t) return;

    if (t.matches("[data-buy]")) { e.preventDefault(); closeCart(); buy(t.dataset.buy); return; }
    if (t.matches("[data-add]")) {
      e.preventDefault();
      cart.add(t.dataset.add, 1);
      openCart();
      return;
    }
    if (t.matches("[data-open-cart]")) { e.preventDefault(); openCart(); return; }
    if (t.matches("[data-close-cart]")) {
      if (t.tagName === "BUTTON") e.preventDefault();
      closeCart();
      return;
    }
    if (t.matches("[data-qty]")) {
      const id = t.dataset.qty;
      const line = cart.items().find((l) => l.id === id);
      if (line) cart.setQty(id, line.qty + parseInt(t.dataset.step, 10));
      return;
    }
    if (t.matches("[data-remove]")) { cart.remove(t.dataset.remove); return; }
    if (t.matches("[data-switch-bundle]")) {
      const list = cart.items();
      const perch = list.find((l) => l.id === "window-perch");
      const lifter = list.find((l) => l.id === "fur-lifter");
      if (!perch || !lifter) return;
      const n = Math.min(perch.qty, lifter.qty);
      perch.qty -= n;
      lifter.qty -= n;
      const next = list.filter((l) => l.qty > 0);
      const b = next.find((l) => l.id === BUNDLE);
      if (b) b.qty += n; else next.push({ id: BUNDLE, qty: n });
      cart.save(next);
      toast("Switched to the Cozy Window Bundle");
      return;
    }
    if (t.matches("[data-choose]")) {
      const select = doc.querySelector("[data-buybox] [data-option]");
      if (select) {
        e.preventDefault();
        select.value = t.dataset.choose;
        syncBuybox(select.closest("[data-buybox]"));
        select.focus();
      }
      return;
    }
    if (t.matches(".thumb")) {
      const gallery = t.closest("[data-gallery]");
      const main = gallery.querySelector(".gallery-main img");
      main.src = imgSrc(t.dataset.full);
      main.alt = t.dataset.alt;
      gallery.querySelectorAll(".thumb").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
      return;
    }
    if (t.matches("[data-menu]")) {
      const nav = doc.getElementById("site-nav");
      const open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      doc.documentElement.classList.toggle("menu-open", open);
      t.setAttribute("aria-expanded", String(open));
      return;
    }
    if (t.matches("[data-close-dialog]")) { t.closest("dialog").close(); return; }
    if (t.matches("[data-clear-cart]")) { cart.clear(); toast("Cart cleared"); return; }
    if (t.matches(".skip")) {
      e.preventDefault();
      const main = doc.getElementById("main");
      main.focus();
      main.scrollIntoView();
    }
  });

  doc.addEventListener("change", (e) => {
    if (e.target.matches("[data-option]")) syncBuybox(e.target.closest("[data-buybox]"));
  });

  doc.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-pp-form]");
    if (!form) return;
    e.preventDefault();
    submitForm(form);
  });

  doc.addEventListener("keydown", (e) => {
    const drawer = doc.getElementById("cart");
    if (!drawer || drawer.hidden) return;
    if (e.key === "Escape") { closeCart(); return; }
    if (e.key === "Tab") { // keep focus inside the open cart
      const f = [...drawer.querySelectorAll("a[href], button:not([disabled]), input, select")].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  doc.addEventListener("click", (e) => {
    if (e.target.id === "cart-overlay") closeCart();
    if (e.target.matches("dialog.dialog")) e.target.close(); // click on the backdrop
  });

  window.addEventListener("storage", (e) => { if (e.key === CART_KEY) cart.sync(e.newValue); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) cart.sync(store.get(CART_KEY)); });


  /* ---------- start ---------- */
  renderCart();
  initChat();
  scheduleMidnightRefresh();
  if (SINGLE) {
    window.addEventListener("hashchange", route);
    route();
  } else {
    initPage(doc);
  }
})();
