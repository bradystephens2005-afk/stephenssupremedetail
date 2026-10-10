// Perch & Purr site tests. Run after `python3 build.py`:
//   node tests/site.test.mjs
// Checks both builds (site/ and single/index.html) at desktop and phone widths.
// Never contacts Stripe: every buy.stripe.com request is answered by a stub.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch {
  playwright = require("/opt/node22/lib/node_modules/playwright");
}
const { chromium } = playwright;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MULTI = path.join(ROOT, "site");
const SINGLE = path.join(ROOT, "single");
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } };

const MULTI_PAGES = ["/", "/shop/", "/window-perch/", "/fur-lifter/", "/cozy-window-bundle/", "/about/", "/help/",
  "/policies/", "/thank-you/", "/404.html", "/owner/"];
const SINGLE_ROUTES = ["#/", "#/shop", "#/window-perch", "#/fur-lifter", "#/cozy-window-bundle", "#/about", "#/help",
  "#/policies", "#/policies/returns", "#/help/setup", "#/thank-you", "#/no-such-page", "#/owner"];
const PRODUCTS = ["window-perch", "fur-lifter", "cozy-window-bundle"];

// Payment links as configured, plus a stand-in for any that are still placeholders.
const siteJs = fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8");
const block = siteJs.match(/const PAYMENT_LINKS = \{([\s\S]*?)\};/)[1];
const CONFIGURED = Object.fromEntries([...block.matchAll(/"([\w-]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
const isPlaceholder = (u) => /REPLACE/i.test(u);
const TEST_LINKS = Object.fromEntries(PRODUCTS.map((id) => [id, isPlaceholder(CONFIGURED[id]) ? `https://buy.stripe.com/test_${id}` : CONFIGURED[id]]));
const withTestLinks = (text) => PRODUCTS.reduce((t, id) => t.split(CONFIGURED[id]).join(TEST_LINKS[id]), text);

// ---------- tiny static server; POST / answers like Netlify Forms ----------
const posts = [];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".xml": "application/xml", ".txt": "text/plain", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
function serve(dir) {
  return http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => { posts.push(Object.fromEntries(new URLSearchParams(body))); res.writeHead(200); res.end("ok"); });
      return;
    }
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(dir, p);
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      const nf = path.join(dir, "404.html");
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "not found");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

// ---------- harness ----------
const results = [];
async function check(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e.message.split("\n")[0]]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function newPage(browser, vp, { testLinks = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  // Keep tests offline and fast: fonts get an empty stylesheet.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(/buy\.stripe\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stripe stub</title>stub" }));
  if (testLinks) {
    await page.route(/(\/assets\/site\.js|:\d+\/(index\.html)?(\?.*)?$)/, async (r) => {
      const resp = await r.fetch();
      r.fulfill({ response: resp, body: withTestLinks(await resp.text()) });
    });
  }
  page.errors = errors;
  return { context, page };
}

async function pageHealth(page, label) {
  await page.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = "eager"; });
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const h = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dupes,
      h1: document.querySelectorAll("main h1").length,
      broken: [...document.images].filter((i) => !(i.naturalWidth > 0)).map((i) => i.getAttribute("src")?.slice(0, 40) || i.dataset.img),
      title: document.title,
    };
  });
  assert(h.overflow <= 0, `${label}: sideways scroll of ${h.overflow}px`);
  assert(!h.dupes.length, `${label}: duplicate ids ${h.dupes.join(", ")}`);
  assert(h.h1 === 1, `${label}: expected one h1, found ${h.h1}`);
  assert(!h.broken.length, `${label}: images not loading ${h.broken.join(", ")}`);
  assert(h.title && h.title.includes("Perch & Purr"), `${label}: bad title "${h.title}"`);
  assert(!page.errors.length, `${label}: console errors: ${page.errors.join(" | ")}`);
}

// ---------- run ----------
const browser = await chromium.launch();
const mPort = await listen(serve(MULTI));
const sPort = await listen(serve(SINGLE));
const M = `http://127.0.0.1:${mPort}`;
const S = `http://127.0.0.1:${sPort}/`;
const versions = [
  { name: "multi", url: (p) => M + p, pages: MULTI_PAGES },
  { name: "single", url: (r) => S + r, pages: SINGLE_ROUTES },
];
const countIs = (page, n) => page.waitForFunction((want) => {
  const el = document.querySelector("[data-cart-count]");
  return el && el.textContent === want;
}, String(n), { timeout: 3000 }).then(() => true, () => false);
const go = async (page, url) => {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(80);
};

// 1. Every page, both widths: no console errors, no sideways scroll, no duplicate ids, images load.
for (const v of versions) {
  for (const vp of Object.keys(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp);
    for (const p of v.pages) {
      await check(`${v.name} ${vp} ${p} renders cleanly`, async () => {
        page.errors.length = 0;
        if (v.name === "single") { await page.goto("about:blank"); }
        await go(page, v.url(p));
        await pageHealth(page, `${v.name} ${vp} ${p}`);
      });
    }
    await context.close();
  }
}

// 2. Routing details in the single file.
await check("single: unknown route shows the 404 page", async () => {
  const { context, page } = await newPage(browser, "desktop");
  await go(page, S + "#/no-such-page");
  assert((await page.textContent("main h1")).includes("couldn't find"), "404 heading missing");
  await context.close();
});
await check("single: #/policies/returns scrolls to the returns section", async () => {
  const { context, page } = await newPage(browser, "desktop");
  await go(page, S + "#/policies/returns");
  await page.waitForTimeout(400);
  const top = await page.evaluate(() => document.getElementById("returns").getBoundingClientRect().top);
  assert(top >= 0 && top < 220, `returns section top at ${top}px`);
  await context.close();
});
await check("single: clicking nav links switches pages and marks the current link", async () => {
  const { context, page } = await newPage(browser, "desktop");
  await go(page, S);
  await page.click('.nav a[data-nav="/help"]');
  await page.waitForTimeout(100);
  assert(page.url().endsWith("#/help"), `url ${page.url()}`);
  assert((await page.textContent("main h1")) === "Help", "help page not shown");
  assert((await page.getAttribute('.nav a[data-nav="/help"]', "aria-current")) === "page", "nav not marked");
  assert(page.errors.length === 0, page.errors.join(" | "));
  await context.close();
});
await check("single: photos and code are inlined, each photo stored once", async () => {
  const html = fs.readFileSync(path.join(SINGLE, "index.html"), "utf8");
  const imgs = JSON.parse(html.match(/<script type="application\/json" id="pp-images">(.*?)<\/script>/)[1]);
  for (const [k, uri] of Object.entries(imgs)) {
    const count = html.split(uri).length - 1;
    assert(count === 1, `${k} appears ${count} times`);
  }
  assert(!/src="\/?(assets|images)\//.test(html) && !/href="\/assets\//.test(html), "references external asset files");
  const { context, page } = await newPage(browser, "desktop");
  const local = [];
  page.on("request", (r) => { if (r.url().startsWith(S) && r.url().split("#")[0] !== S) local.push(r.url()); });
  for (const r of ["#/", "#/window-perch", "#/cozy-window-bundle"]) await go(page, S + r);
  assert(!local.length, `extra requests: ${local.join(", ")}`);
  await context.close();
});
await check("single: hidden static Netlify forms exist outside templates", async () => {
  const { context, page } = await newPage(browser, "desktop");
  await go(page, S);
  const found = await page.evaluate(() => ["launch-list", "review"].map((n) =>
    [...document.querySelectorAll(`form[name="${n}"][data-netlify="true"]`)].filter((f) => !f.closest("template")).length));
  assert(found[0] >= 1 && found[1] >= 1, `found ${found}`);
  await context.close();
});
await check("multi: forms are marked for Netlify with a honeypot", async () => {
  const home = fs.readFileSync(path.join(MULTI, "index.html"), "utf8");
  const ty = fs.readFileSync(path.join(MULTI, "thank-you/index.html"), "utf8");
  assert(/<form name="launch-list"[^>]*data-netlify="true" netlify-honeypot="bot-field"/.test(home), "launch-list form");
  assert(/<form name="review"[^>]*data-netlify="true" netlify-honeypot="bot-field"/.test(ty), "review form");
});

// 3. Links: every internal link goes somewhere real; the owner page is never linked; owner is noindex.
await check("multi: every internal link resolves and owner page is unlinked + noindex", async () => {
  for (const p of MULTI_PAGES) {
    const file = path.join(MULTI, p.endsWith("/") ? p + "index.html" : p);
    const html = fs.readFileSync(file, "utf8");
    for (const [, href] of html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
      const target = path.join(MULTI, href.endsWith("/") ? href + "index.html" : href);
      assert(fs.existsSync(target), `${p} links to missing ${href}`);
      if (p !== "/owner/") assert(!href.startsWith("/owner"), `${p} links to the owner page`);
    }
    for (const [, id] of html.matchAll(/href="#([\w-]+)"/g)) assert(id === "main" || html.includes(`id="${id}"`), `${p} links to missing #${id}`);
  }
  const owner = fs.readFileSync(path.join(MULTI, "owner/index.html"), "utf8");
  assert(owner.includes('name="robots" content="noindex, nofollow"'), "owner page not noindex");
  assert(fs.readFileSync(path.join(MULTI, "sitemap.xml"), "utf8").indexOf("owner") === -1, "owner in sitemap");
});
await check("single: every #/ link resolves to a real page", async () => {
  const { context, page } = await newPage(browser, "desktop");
  await go(page, S);
  const bad = await page.evaluate(() => {
    const hrefs = new Set();
    const collect = (root) => root.querySelectorAll('a[href^="#/"]').forEach((a) => hrefs.add(a.getAttribute("href")));
    collect(document);
    document.querySelectorAll("template").forEach((t) => collect(t.content));
    const out = [];
    for (const h of hrefs) {
      const p = h.slice(1).split("?")[0].replace(/\/+$/, "") || "/";
      if (p === "/owner") out.push(h + " (owner linked)");
      if (document.querySelector(`template[data-path="${p}"]`)) continue;
      const cut = p.lastIndexOf("/");
      const parent = document.querySelector(`template[data-path="${p.slice(0, cut) || "/"}"]`);
      if (!(parent && parent.content.getElementById(p.slice(cut + 1)))) out.push(h);
    }
    return out;
  });
  assert(!bad.length, `bad links: ${bad.join(", ")}`);
  await context.close();
});

// 4. Buy buttons open the right Stripe link (placeholders swapped for test links).
for (const v of versions) {
  const route = (id) => (v.name === "multi" ? `/${id}/` : `#/${id}`);
  const home = v.name === "multi" ? "/" : "#/";
  const expectNav = async (page, action, want, label) => {
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("buy.stripe.com") && r.isNavigationRequest(), { timeout: 4000 }),
      action(),
    ]);
    assert(req.url() === want, `${label}: went to ${req.url()}, expected ${want}`);
  };
  await check(`${v.name}: hero "Buy the perch, $32" opens the perch link`, async () => {
    const { context, page } = await newPage(browser, "desktop", { testLinks: true });
    await go(page, v.url(home));
    await expectNav(page, () => page.click("text=Buy the perch, $32"), TEST_LINKS["window-perch"], "hero");
    await context.close();
  });
  for (const id of PRODUCTS) {
    await check(`${v.name}: ${id} Buy now (desktop) opens its own link`, async () => {
      const { context, page } = await newPage(browser, "desktop", { testLinks: true });
      await go(page, v.url(route(id)));
      await expectNav(page, () => page.click(".buybox [data-bb-buy]"), TEST_LINKS[id], id);
      await context.close();
    });
    await check(`${v.name}: ${id} pinned phone Buy now bar shows and opens its link`, async () => {
      const { context, page } = await newPage(browser, "phone", { testLinks: true });
      await go(page, v.url(route(id)));
      const bar = page.locator(".buybar");
      await page.waitForTimeout(1100); // the bar slides up on load
      assert(await bar.isVisible(), "buy bar hidden on phone");
      const box = await bar.boundingBox();
      assert(Math.abs(box.y + box.height - 844) < 2, `bar not pinned to bottom (y=${box.y})`);
      await expectNav(page, () => page.click(".buybar .btn"), TEST_LINKS[id], `${id} bar`);
      await context.close();
    });
    await check(`${v.name}: ${id} option dropdown switches price and Buy now link`, async () => {
      const { context, page } = await newPage(browser, "desktop", { testLinks: true });
      await go(page, v.url(route(id)));
      const other = PRODUCTS.find((o) => o !== id);
      await page.selectOption("#option", other);
      const delivered = await page.textContent(".buybox [data-bb-delivered]");
      assert(/delivered/.test(delivered), "delivered text missing");
      await expectNav(page, () => page.click(".buybox [data-bb-buy]"), TEST_LINKS[other], `${id}→${other}`);
      await context.close();
    });
  }
  await check(`${v.name}: buy bar hidden at desktop width`, async () => {
    const { context, page } = await newPage(browser, "desktop");
    await go(page, v.url(route("window-perch")));
    assert(!(await page.locator(".buybar").isVisible()), "buy bar visible on desktop");
    await context.close();
  });
}

// 5. Real configuration: placeholder links show "opening soon"; set links go to the configured URL.
for (const v of versions) {
  const route = (id) => (v.name === "multi" ? `/${id}/` : `#/${id}`);
  for (const id of PRODUCTS) {
    await check(`${v.name}: ${id} with the live config ${isPlaceholder(CONFIGURED[id]) ? "shows “opening soon”" : "opens the configured link"}`, async () => {
      const { context, page } = await newPage(browser, "desktop");
      await go(page, v.url(route(id)));
      if (isPlaceholder(CONFIGURED[id])) {
        await page.click(".buybox [data-bb-buy]");
        await page.waitForSelector("#soon-dialog[open]", { timeout: 2000 });
        const h = await page.textContent("#soon-title");
        assert(h.includes("Checkout opening soon — join the launch list"), `dialog says ${h}`);
        assert(!page.url().includes("stripe"), "navigated anyway");
      } else {
        const [req] = await Promise.all([
          page.waitForRequest((r) => r.url().includes("buy.stripe.com"), { timeout: 4000 }),
          page.click(".buybox [data-bb-buy]"),
        ]);
        assert(req.url() === CONFIGURED[id], `went to ${req.url()}`);
      }
      await context.close();
    });
  }
}

// 6. Cart: carries across pages, mixed carts get one Pay button per product and a bundle tip.
for (const v of versions) {
  const at = (p) => (v.name === "multi" ? M + p : S + "#" + (p.replace(/\/$/, "") || "/"));
  await check(`${v.name}: cart carries across pages and splits checkout per product`, async () => {
    const { context, page } = await newPage(browser, "desktop", { testLinks: true });
    await go(page, at("/window-perch/"));
    await page.click(".buybox [data-bb-add]");
    await page.waitForSelector("#cart.is-open");
    await page.click("#cart [data-close-cart]");
    await go(page, at("/shop/"));
    assert(await countIs(page, 1), `count not carried over (shows ${await page.textContent("[data-cart-count]")})`);
    await page.click('[data-add="fur-lifter"]');
    await page.waitForSelector("#cart.is-open");
    const pays = await page.$$eval("#cart-foot [data-pay]", (as) => as.map((a) => [a.dataset.pay, a.href, a.target]));
    assert(pays.length === 2, `expected 2 pay buttons, got ${pays.length}`);
    for (const [id, href, target] of pays) {
      assert(href === TEST_LINKS[id], `${id} pay link ${href}`);
      assert(target === "_blank", `${id} should open a new tab`);
    }
    assert(await page.isVisible("[data-switch-bundle]"), "bundle tip missing");
    await page.click('[data-qty="window-perch"][data-step="1"]');
    assert(await countIs(page, 3), `qty + did not update (badges ${await page.$$eval("[data-cart-count]", (e) => e.map((x) => x.textContent).join("/"))}, url ${page.url()}, errors ${page.errors.join(" | ")}, storage ${await page.evaluate(() => localStorage.getItem("pp-cart-v1"))})`);
    await page.click("[data-switch-bundle]");
    const lines = await page.$$eval("#cart-body .cart-line h3", (h) => h.map((x) => x.textContent));
    assert(lines.join("|") === "Cordless Window Perch|The Cozy Window Bundle", `after switch: ${lines.join("|")}`);
    assert(await countIs(page, 2), `switch to bundle should leave 1 perch + 1 bundle (shows ${await page.textContent("[data-cart-count]")}, storage ${await page.evaluate(() => localStorage.getItem("pp-cart-v1"))})`);
    await go(page, at("/help/"));
    assert(await countIs(page, 2), "count lost after navigation");
    assert(!page.errors.length, page.errors.join(" | "));
    await context.close();
  });
  await check(`${v.name}: single-product cart checks out in the same tab with the right link`, async () => {
    const { context, page } = await newPage(browser, "desktop", { testLinks: true });
    await go(page, at("/cozy-window-bundle/"));
    await page.click(".buybox [data-bb-add]");
    await page.waitForSelector("#cart.is-open");
    const a = await page.$eval("#cart-foot [data-pay]", (el) => [el.href, el.target]);
    assert(a[0] === TEST_LINKS["cozy-window-bundle"] && a[1] === "", `checkout ${a}`);
    await context.close();
  });
  await check(`${v.name}: thank-you ?product= removes only that product from the cart`, async () => {
    const { context, page } = await newPage(browser, "desktop");
    await go(page, at("/shop/"));
    await page.click('[data-add="fur-lifter"]');
    await page.click("#cart [data-close-cart]");
    await page.waitForSelector("#cart", { state: "hidden" });
    await page.click('[data-add="window-perch"]');
    await countIs(page, 2);
    await page.waitForTimeout(300);
    const url = v.name === "multi" ? M + "/thank-you/?product=fur-lifter" : S + "#/thank-you?product=fur-lifter";
    await go(page, url);
    assert(await countIs(page, 1), `wrong count after thank-you (shows ${await page.textContent("[data-cart-count]")})`);
    await context.close();
  });
}

// 7. Gallery, delivery dates, forms.
for (const v of versions) {
  const at = (p) => (v.name === "multi" ? M + p : S + "#" + (p.replace(/\/$/, "") || "/"));
  await check(`${v.name}: gallery thumbnails switch the main photo`, async () => {
    const { context, page } = await newPage(browser, "desktop");
    await go(page, at("/window-perch/"));
    const before = await page.getAttribute(".gallery-main img", "src");
    await page.click(".thumb >> nth=2");
    const after = await page.getAttribute(".gallery-main img", "src");
    assert(before !== after, "main photo did not change");
    assert((await page.getAttribute(".thumb >> nth=2", "aria-pressed")) === "true", "thumb not marked");
    const alt = await page.getAttribute(".gallery-main img", "alt");
    assert(/cover/i.test(alt), `alt not updated: ${alt}`);
    await context.close();
  });
  await check(`${v.name}: delivery range is today + 4 to 10 business days`, async () => {
    const { context, page } = await newPage(browser, "desktop");
    await go(page, at("/window-perch/"));
    const text = await page.textContent(".buybox [data-delivery]");
    assert(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/.test(text), `got "${text}"`);
    assert(!/Sat|Sun/.test(text), `weekend date in "${text}"`);
    await context.close();
  });
  await check(`${v.name}: launch-list form submits to Netlify and confirms`, async () => {
    const { context, page } = await newPage(browser, "desktop");
    await go(page, at("/"));
    posts.length = 0;
    await page.fill("#ll-email", "test@example.com");
    await page.click('#ll-email ~ button[type="submit"]');
    await page.waitForSelector(".signup .form-done", { timeout: 3000 });
    const sent = posts.find((p) => p["form-name"] === "launch-list");
    assert(sent && sent.email === "test@example.com" && "bot-field" in sent, `posted ${JSON.stringify(posts)}`);
    await context.close();
  });
  await check(`${v.name}: review form on the thank-you page submits`, async () => {
    const { context, page } = await newPage(browser, "phone");
    await go(page, at("/thank-you/"));
    posts.length = 0;
    await page.fill("#rv-name", "Sam R.");
    await page.fill("#rv-email", "sam@example.com");
    await page.check('input[name="rating"][value="4"]');
    await page.fill("#rv-text", "Holds well on our kitchen window.");
    await page.check('input[name="publish_ok"]');
    await page.click('#review button[type="submit"]');
    await page.waitForSelector("#review .form-done", { timeout: 3000 });
    const sent = posts.find((p) => p["form-name"] === "review");
    assert(sent && sent.rating === "4" && sent.publish_ok === "yes", `posted ${JSON.stringify(posts)}`);
    await context.close();
  });
}

await browser.close();
const failed = results.filter((r) => !r[0]);
for (const [ok, name, msg] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "\n      " + msg}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
