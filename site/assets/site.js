/* Perch & Purr — site.js */

/* ============================================================
   STRIPE PAYMENT LINKS (live) — one per product.
   Paste each link from Stripe → Payment Links → Copy link.
   Any link that still contains "REPLACE" is treated as not ready:
   its buttons say "Checkout opening soon — join the launch list".

   Note: the perch link currently charges $32.99 + $5.99 shipping in
   Stripe, while the site shows $32.00 with free shipping.
   ============================================================ */
const PAYMENT_LINKS = {
  "window-perch": "https://buy.stripe.com/28EaEY3ch4gc2TN61f5wI00",
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

  /* ---------- cart ---------- */
  let memoryCart = [];
  const cart = {
    items() {
      let raw = store.get(CART_KEY);
      let list;
      try { list = raw ? JSON.parse(raw) : memoryCart; } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      return list
        .filter((l) => l && CATALOG[l.id])
        .map((l) => ({ id: l.id, qty: Math.max(1, Math.min(20, parseInt(l.qty, 10) || 1)) }));
    },
    save(list) {
      memoryCart = list;
      store.set(CART_KEY, JSON.stringify(list));
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
      body.insertAdjacentHTML("beforeend", `<div class="cart-tip">
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

  /* ---------- reveal sections as they scroll into view ---------- */
  const revealer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revealer.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" })
    : null;
  if (revealer) doc.documentElement.classList.add("js-reveal");
  function initReveal(scope) {
    if (!revealer) return;
    scope.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => revealer.observe(el));
  }

  /* ---------- per-page setup (runs on load, and on every route in the single file) ---------- */
  function initPage(scope) {
    initReveal(scope);
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

  window.addEventListener("storage", (e) => { if (e.key === CART_KEY) renderCart(); });

  const header = doc.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- start ---------- */
  onScroll();
  renderCart();
  scheduleMidnightRefresh();
  if (SINGLE) {
    window.addEventListener("hashchange", route);
    route();
  } else {
    initPage(doc);
  }
})();
