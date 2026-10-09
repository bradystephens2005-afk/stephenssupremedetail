#!/usr/bin/env python3
"""Build Perch & Purr.

    python3 build.py

Makes two versions from the same content:
  site/            the multi-page store (one folder per page)
  single/index.html  the whole store in one file, for Netlify drag-and-drop

Prices and product text live in PRODUCTS below. Stripe Payment Links live
at the top of assets/site.js. Photos live in /images and are listed in IMAGES.
"""
import base64
import datetime
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_MULTI = ROOT / "site"
OUT_SINGLE = ROOT / "single"

SITE_URL = "https://perch-and-purr.netlify.app"
EMAIL = "perchandpurr@gmail.com"
YEAR = datetime.date.today().year

# ---------------------------------------------------------------- photos
# To use a real photo: put it in /images and change "file" (and w/h).
IMAGES = {
    "photo-two-cats": dict(file="images/photo-two-cats.jpg", w=1000, h=1000,
                           alt="Two cats sharing the perch on a high-rise window, held up by two suction-cup brackets"),
    "photo-ragdoll": dict(file="images/photo-ragdoll.jpg", w=1000, h=1000,
                          alt="A ragdoll cat stretched out on the mesh side of the perch, looking into the room"),
    "photo-plush": dict(file="images/photo-plush.jpg", w=1000, h=1000,
                        alt="A tabby Maine Coon resting on the plush side of the cover, with both suction-cup brackets on the glass"),
    "hero-window": dict(file="images/hero-window.svg", w=800, h=1000,
                        alt="A cat loafing on a cordless perch stuck to a sunny window"),
    "perch-window": dict(file="images/perch-window.svg", w=1000, h=1000,
                         alt="The Cordless Window Perch on a window pane with a cat resting on it"),
    "perch-cups": dict(file="images/perch-cups.svg", w=1000, h=1000,
                       alt="Drawing of a suction cup pressed flat against glass, with the bracket bolted to it"),
    "perch-cover": dict(file="images/perch-cover.svg", w=1000, h=1000,
                        alt="The reversible cover, fleece on one side and breathable mesh on the other, with a zipper around the edge"),
    "perch-folded": dict(file="images/perch-folded.svg", w=1000, h=1000,
                         alt="The perch folded flat for storage"),
    "fur-lifter": dict(file="images/fur-lifter.svg", w=1000, h=1000,
                       alt="The Reusable Fur Lifter, a handheld pet hair remover"),
    "fur-lifter-couch": dict(file="images/fur-lifter-couch.svg", w=1000, h=1000,
                             alt="The Fur Lifter clearing cat fur from a couch cushion"),
    "bundle": dict(file="images/bundle.svg", w=1000, h=1000,
                   alt="Everything in the Cozy Window Bundle: the perch, the Fur Lifter, a spare fleece pad and the gift box"),
    "gift-box": dict(file="images/gift-box.svg", w=1000, h=1000,
                     alt="The gift-ready box with a honey-colored band"),
    "about-tools": dict(file="images/about-tools.svg", w=1000, h=1000,
                        alt="A tape measure, level and pencil on a workbench by a window"),
}

# ---------------------------------------------------------------- products
# Prices are in cents. "ship" is the shipping charge for one checkout.
PRODUCTS = {
    "window-perch": dict(
        name="Cordless Window Perch",
        path="/window-perch/",
        price=3200, ship=0, compare=None,
        option="Cordless Window Perch, $32.00",
        card="A sturdy window seat that holds on with four suction cups. No cords, no drilling.",
        sub="A sturdy window seat that holds on with four suction cups and a stainless steel frame. No cords, no drilling, no floor space.",
        images=["photo-two-cats", "photo-ragdoll", "photo-plush", "perch-cover", "perch-folded"],
        description="A cordless suction-cup cat window perch with a painted stainless steel frame, tested to 40 lb, and a reversible fleece and mesh cover. $32, free shipping.",
    ),
    "fur-lifter": dict(
        name="Reusable Fur Lifter",
        path="/fur-lifter/",
        price=1999, ship=599, compare=None,
        option="Reusable Fur Lifter, $19.99",
        card="Lifts loose fur from couches, beds and cat trees. Reusable, so no sticky refills.",
        sub="A reusable pet hair remover for couches, beds and cat trees. No sticky sheets, no refills to buy.",
        images=["fur-lifter", "fur-lifter-couch"],
        description="A reusable pet hair remover for couches, bedding and cat trees. No sticky refills. $19.99.",
    ),
    "cozy-window-bundle": dict(
        name="The Cozy Window Bundle",
        path="/cozy-window-bundle/",
        price=4999, ship=0, compare=5199,
        option="Cozy Window Bundle, $49.99",
        card="The perch, the Fur Lifter and a spare fleece pad, in a gift-ready box.",
        sub="Everything for a cat's window seat in one gift-ready box: the perch, the Fur Lifter and a spare fleece pad for laundry day.",
        images=["bundle", "photo-ragdoll", "gift-box", "perch-cover", "fur-lifter"],
        description="The Cordless Window Perch, the Reusable Fur Lifter and a spare fleece pad in a gift-ready box. $49.99, free shipping.",
    ),
}
ORDER = ["window-perch", "cozy-window-bundle", "fur-lifter"]

# Fill in once the folded perch has been measured, e.g. "22 x 12 in, folds to 1.5 in thick".
PERCH_SIZE = None


def money(cents):
    return f"${cents / 100:.2f}"


def delivered_text(p):
    if p["ship"]:
        return f"{money(p['price'] + p['ship'])} delivered ({money(p['price'])} + {money(p['ship'])} shipping)"
    return f"{money(p['price'])} delivered, free shipping included"


def short_price(p):
    if p["ship"]:
        return f"{money(p['price'] + p['ship'])} delivered"
    return f"{money(p['price'])}, free shipping"


def ship_line(p):
    if p["ship"]:
        return f"Ships in 3 business days for {money(p['ship'])}, tracking by email"
    return "Ships free in 3 business days, tracking by email"


esc = html.escape

# ---------------------------------------------------------------- icons
ICON = {
    "check": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#E8F2FC" stroke="#0071E3" stroke-width="1.5"/><path d="m7.2 12.4 3.1 3L16.8 9" fill="none" stroke="#1D1D1F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "no": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#F5F5F7"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="#86868B" stroke-width="2" stroke-linecap="round"/></svg>',
    "truck": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1D1D1F" stroke-width="1.6" stroke-linejoin="round"><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.8" fill="#0071E3"/><circle cx="17" cy="17" r="1.8" fill="#0071E3"/></svg>',
    "return": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1D1D1F" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-3"/></svg>',
    "lock": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1D1D1F" stroke-width="1.6" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.5" fill="#0071E3" stroke="none"/></svg>',
    "calendar": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1D1D1F" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="15.5" cy="15" r="1.6" fill="#0071E3" stroke="none"/></svg>',
    "cart": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.1 11h10.4l2-7.5H6.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/></svg>',
    "menu": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    "close": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1D1D1F" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/></svg>',
    "quote": '<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M8 50V24a20 20 0 0 1 40 0v26Z" fill="#F5F5F7" stroke="#C5D4DC" stroke-width="2.5"/><path d="M28 4v46M8 32h40" stroke="#C5D4DC" stroke-width="2.5"/><circle cx="40" cy="14" r="5" fill="#0071E3" opacity=".7"/></svg>',
}

BRAND_MARK = ('<svg viewBox="0 0 30 34" aria-hidden="true"><path d="M3 32V15a12 12 0 0 1 24 0v17Z" fill="#DCE6EC" stroke="#1D1D1F" stroke-width="2"/>'
              '<circle cx="20" cy="11" r="3.5" fill="#E9B04F"/><path d="M15 3v29M3 20h24" stroke="#1F2D33" stroke-width="1.6"/>'
              '<path d="M1 32.5h28" stroke="#1F2D33" stroke-width="2.4" stroke-linecap="round"/></svg>')

FAVICON = ("data:image/svg+xml," +
           "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M4 30V15a12 12 0 0 1 24 0v15Z' "
           "fill='%23DCE6EC' stroke='%231F2D33' stroke-width='2.5'/%3E%3Ccircle cx='21' cy='11' r='4' fill='%23E9B04F'/%3E%3C/svg%3E")

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">')


# ---------------------------------------------------------------- context
class Ctx:
    """Knows which version is being built, so links and images come out right."""

    def __init__(self, mode):
        self.mode = mode
        self.single = mode == "single"

    def link(self, path, anchor=None):
        if self.single:
            base = path.rstrip("/")
            return "#" + (base + ("/" + anchor if anchor else "") or "/")
        return path + (f"#{anchor}" if anchor else "")

    def src(self, key):
        return key if self.single else "/" + IMAGES[key]["file"]

    def img(self, key, alt=None, eager=False, cls=None):
        im = IMAGES[key]
        text = im["alt"] if alt is None else alt
        src = f'data-img="{key}"' if self.single else f'src="/{im["file"]}"'
        load = 'fetchpriority="high"' if eager else 'loading="lazy"'
        klass = f' class="{cls}"' if cls else ""
        return f'<img {src} alt="{esc(text)}" width="{im["w"]}" height="{im["h"]}" {load} decoding="async"{klass}>'

    def netlify(self, name):
        """Attributes for a Netlify form. The single file uses hidden copies for detection."""
        base = f'name="{name}" method="POST" data-pp-form'
        if self.single:
            return base
        return base + ' data-netlify="true" netlify-honeypot="bot-field"'


def nav_key(path):
    return path.rstrip("/") or "/"


# ---------------------------------------------------------------- shared pieces
NAV = [("/shop/", "Shop"), ("/window-perch/", "Window Perch"), ("/cozy-window-bundle/", "Bundle"),
       ("/help/", "Help"), ("/about/", "About")]


def header(ctx, page):
    links = []
    for path, label in NAV:
        cur = ' aria-current="page"' if (not ctx.single and page.get("nav") == nav_key(path)) else ""
        links.append(f'<a href="{ctx.link(path)}" data-nav="{nav_key(path)}"{cur}>{label}</a>')
    return f"""<a class="skip" href="#main">Skip to content</a>
<div class="announce">Free shipping on the perch and the bundle, anywhere in the lower 48. <a href="{ctx.link('/policies/', 'shipping')}">Shipping details</a></div>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="{ctx.link('/')}">{BRAND_MARK}<span>Perch &amp; Purr</span></a>
    <nav class="nav" id="site-nav" aria-label="Main">
      {"".join(links)}
    </nav>
    <div class="header-actions">
      <button type="button" class="icon-btn" data-open-cart data-cart-label aria-haspopup="dialog" aria-expanded="false" aria-label="Cart, 0 items">{ICON['cart']}<span class="cart-label">Cart</span><span class="cart-count" data-cart-count data-count="0">0</span></button>
      <button type="button" class="icon-btn menu-btn" data-menu aria-controls="site-nav" aria-expanded="false"><span class="i-open">{ICON['menu']}</span><span class="i-close">{ICON['close']}</span><span class="visually-hidden">Menu</span></button>
    </div>
  </div>
</header>"""


def footer(ctx):
    return f"""<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="{ctx.link('/')}">{BRAND_MARK}<span>Perch &amp; Purr</span></a>
        <p>A small shop in Greenville, South Carolina, selling a cordless window perch and a few things that go with it.</p>
      </div>
      <div>
        <h2>Shop</h2>
        <ul>
          <li><a href="{ctx.link('/window-perch/')}">Cordless Window Perch</a></li>
          <li><a href="{ctx.link('/cozy-window-bundle/')}">The Cozy Window Bundle</a></li>
          <li><a href="{ctx.link('/fur-lifter/')}">Reusable Fur Lifter</a></li>
          <li><a href="{ctx.link('/shop/')}">All products</a></li>
        </ul>
      </div>
      <div>
        <h2>Help</h2>
        <ul>
          <li><a href="{ctx.link('/help/', 'setup')}">Setup guide</a></li>
          <li><a href="{ctx.link('/help/', 'faq')}">Questions</a></li>
          <li><a href="{ctx.link('/policies/', 'shipping')}">Shipping</a></li>
          <li><a href="{ctx.link('/policies/', 'returns')}">Returns</a></li>
        </ul>
      </div>
      <div>
        <h2>Contact</h2>
        <ul>
          <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
          <li>Replies within 1 business day</li>
          <li>Greenville, South Carolina</li>
        </ul>
      </div>
    </div>
    <div class="footer-base">
      <span>&copy; {YEAR} Perch &amp; Purr. Secure checkout by Stripe.</span>
      <ul>
        <li><a href="{ctx.link('/policies/', 'privacy')}">Privacy</a></li>
        <li><a href="{ctx.link('/policies/', 'terms')}">Terms</a></li>
        <li><a href="{ctx.link('/about/')}">About</a></li>
      </ul>
    </div>
  </div>
</footer>"""


def launch_fields(prefix, source="", button="Join the list"):
    return f"""<input type="hidden" name="form-name" value="launch-list">
      <input type="hidden" name="source" value="{source}">
      <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
      <label class="label" for="{prefix}-email">Email address</label>
      <div class="inline-form" style="margin-top:6px">
        <input class="input" id="{prefix}-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button class="btn" type="submit">{button}</button>
      </div>
      <p class="form-msg" role="alert"></p>"""


LAUNCH_DONE = "You're on the list. We'll email you when there's news, and that's all."


def overlays(ctx):
    """Cart drawer, the 'checkout opening soon' dialog and the toast. Same on every page."""
    return f"""<div class="overlay" id="cart-overlay" hidden></div>
<aside class="drawer" id="cart" role="dialog" aria-modal="true" aria-labelledby="cart-title" hidden>
  <div class="drawer-head">
    <h2 id="cart-title">Your cart</h2>
    <button type="button" class="icon-btn" data-close-cart aria-label="Close cart">{ICON['close']}</button>
  </div>
  <div class="drawer-body" id="cart-body"></div>
  <div class="drawer-foot" id="cart-foot" hidden></div>
</aside>
<dialog class="dialog" id="soon-dialog" aria-labelledby="soon-title">
  <div class="dialog-inner">
    <button type="button" class="icon-btn dialog-close" data-close-dialog aria-label="Close">{ICON['close']}</button>
    <h2 id="soon-title">Checkout opening soon — join the launch list</h2>
    <p><span data-soon-name>This item</span> isn't ready to order online yet. Leave your email and we'll write once, the day checkout opens.</p>
    <form {ctx.netlify('launch-list')} data-done="{LAUNCH_DONE}">
      {launch_fields('soon', 'checkout-soon')}
    </form>
    <p class="small muted" style="margin:14px 0 0">Questions in the meantime? <a href="mailto:{EMAIL}">{EMAIL}</a></p>
  </div>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>"""


def checks(items, inline=False):
    cls = "checks checks--inline" if inline else "checks"
    return f'<ul class="{cls}">' + "".join(f"<li>{ICON['check']}<span>{t}</span></li>" for t in items) + "</ul>"


def product_card(ctx, pid, eager=False):
    p = PRODUCTS[pid]
    compare = f" <s>{money(p['compare'])}</s>" if p["compare"] else ""
    ship = "Free shipping" if not p["ship"] else f"+ {money(p['ship'])} shipping"
    tag = '<p class="tag">Gift-ready</p>' if pid == "cozy-window-bundle" else '<p class="tag" aria-hidden="true">&nbsp;</p>'
    return f"""<article class="card" data-reveal>
  <a class="card-media" href="{ctx.link(p['path'])}" tabindex="-1" aria-hidden="true">{ctx.img(p['images'][0], alt='', eager=eager)}</a>
  <div class="card-body">
    {tag}
    <h3><a href="{ctx.link(p['path'])}">{p['name']}</a></h3>
    <p>{p['card']}</p>
    <p class="price">{money(p['price'])}{compare}</p>
    <p class="ship-note">{ship}</p>
    <div class="card-actions">
      <button type="button" class="btn btn--small" data-add="{pid}" aria-label="Add {p['name']} to cart">Add to cart</button>
      <a class="link-more" href="{ctx.link(p['path'])}" aria-label="Learn more about {p['name']}">Learn more</a>
    </div>
  </div>
</article>"""


# FAQ: (question, answer html, tags)
def faqs(ctx):
    returns = ctx.link("/policies/", "returns")
    setup = ctx.link("/help/", "setup")
    return [
        ("Will it really hold my cat?",
         f"<p>The frame is painted stainless steel and the perch is tested to 40 lb, which covers almost every house cat. That number comes from a load test on clean, smooth glass. How well suction cups hold in your home depends on your glass and how they're pressed on, so always press down on the perch with your hand before your cat uses it.</p>",
         {"home", "perch", "bundle", "help"}),
        ("What kind of window does it need?",
         "<p>Smooth, flat glass with room for all four cups. Double-pane windows are fine. It won't hold on textured or frosted glass, window film, screens, or wood and painted surfaces. A pane that doesn't open is best. If it does open, keep that window shut while the perch is up.</p>",
         {"home", "perch", "bundle", "help"}),
        ("How long does setup take?",
         f"<p>About a minute once the glass is clean. Press on the four cups, zip on the cover, and press-test it. The <a href=\"{setup}\">setup guide</a> walks through it.</p>",
         {"home", "perch", "help"}),
        ("What if a suction cup lets go?",
         "<p>It's usually dust, dry cups, or a big temperature swing at the window. Take the cup off, rinse it in warm water, clean the glass, and press it back on. Press down on the perch once a week to check the cups.</p>",
         {"perch", "bundle", "help"}),
        ("How do I wash the cover?",
         "<p>Unzip it from the frame and wash it as the care tag says. Let it dry all the way before zipping it back on. The bundle comes with a spare fleece pad, so your cat still has a seat on laundry day.</p>",
         {"perch", "bundle", "help"}),
        ("How does the Fur Lifter work?",
         "<p>Run it back and forth over couches, bedding or a cat tree and it lifts the loose fur. It's reusable, so there are no sticky sheets or refills to buy.</p>",
         {"lifter", "bundle", "help"}),
        ("Is the Fur Lifter safe on every fabric?",
         "<p>It's made for upholstery, bedding and other everyday fabrics. On delicate fabrics like silk or velvet, try a hidden spot first. It's not meant for brushing your cat.</p>",
         {"lifter", "help"}),
        ("How long does shipping take?",
         "<p>Orders ship within 3 business days, and delivery takes 3 to 7 business days after that. You'll get a tracking number by email. We ship to the 48 contiguous US states.</p>",
         {"home", "perch", "lifter", "bundle", "help"}),
        ("Do you ship to Alaska, Hawaii or outside the US?",
         "<p>Not yet. For now we only ship within the 48 contiguous states.</p>",
         {"help"}),
        ("What if it doesn't work for us?",
         f"<p>You have 30 days from delivery to send it back. Email <a href=\"mailto:{EMAIL}\">{EMAIL}</a> and you'll hear back within one business day. The <a href=\"{returns}\">return policy</a> has the details.</p>",
         {"home", "perch", "lifter", "bundle", "help"}),
        ("Is checkout secure?",
         "<p>Yes. You pay on Stripe's secure checkout page. We never see or store your card number.</p>",
         {"home", "help"}),
        ("Why does each product check out separately?",
         "<p>Our checkout uses Stripe Payment Links, and each link sells one product. If your cart has two different products, you'll pay for each on its own page and get a receipt for each. The bundle is one product, so it checks out in one go.</p>",
         {"help"}),
        ("Is the bundle good as a gift?",
         "<p>That's what it's for. It comes in a gift-ready box, so it's ready to hand over.</p>",
         {"bundle"}),
    ]


def faq_block(ctx, tag, limit=None):
    items = [f for f in faqs(ctx) if tag in f[2]]
    if limit:
        items = items[:limit]
    return '<div class="faq">' + "".join(
        f"<details><summary>{q}</summary><div class=\"answer\">{a}</div></details>" for q, a, _ in items
    ) + "</div>"


def signup_section(ctx, source):
    return f"""<section class="section" aria-labelledby="signup-title">
  <div class="wrap">
    <div class="signup" data-reveal>
      <div>
        <h2 id="signup-title">Join the launch list.</h2>
        <p class="muted" style="margin:0">One email when new things are ready to order, and a short note now and then. No spam, and you can leave any time.</p>
      </div>
      <form {ctx.netlify('launch-list')} data-done="{LAUNCH_DONE}">
        {launch_fields('ll', source)}
      </form>
    </div>
  </div>
</section>"""


def page_head(title, lede, crumbs=None):
    c = ""
    if crumbs:
        c = '<nav class="crumbs" aria-label="Breadcrumb">' + '<span aria-hidden="true">/</span>'.join(crumbs) + "</nav>"
    return f"""<div class="page-head"><div class="wrap">{c}<h1>{title}</h1>{f'<p>{lede}</p>' if lede else ''}</div></div>"""


# ---------------------------------------------------------------- pages
def page_home(ctx):
    yes = lambda t: f'<span class="yes">{ICON["check"]}<span>{t}</span></span>'
    no = lambda t: f'<span class="no">{ICON["no"]}<span>{t}</span></span>'
    rows = [
        ("Dangling cords or cables", yes("None"), no("Yes, it hangs from them"), yes("None")),
        ("Floor space", yes("None"), yes("None"), no("A few square feet")),
        ("Setup", yes("About a minute"), "5 to 10 minutes", no("20+ minutes of assembly")),
        ("Folds away", yes("Yes, flat"), "Partly", no("No")),
        ("Right up at the glass", yes("Yes"), yes("Yes"), "Depends where it fits"),
        ("Typical price", "$32", "$20 to $40", "$50 to $200"),
    ]
    table_rows = "".join(
        f'<tr><th scope="row">{r[0]}</th><td class="ours">{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>' for r in rows
    )
    perch, bundle = ctx.link("/window-perch/"), ctx.link("/cozy-window-bundle/")

    return f"""
<section class="hero">
  <div class="wrap hero-copy" data-reveal>
    <p class="eyebrow">Cordless Window Perch</p>
    <h1>The window seat your cat already wants.</h1>
    <p class="hero-sub">Four suction cups. Stainless steel. Tested to 40&nbsp;lb.</p>
    <p class="hero-price">$32 with free shipping.</p>
    <div class="btn-row btn-row--center">
      <button type="button" class="btn" data-buy="window-perch">Buy the perch, $32</button>
      <a class="btn btn--ghost" href="{bundle}">See the bundle</a>
    </div>
    {checks(["Free shipping in the lower 48", "30-day returns from delivery", "Secure checkout by Stripe"], inline=True)}
  </div>
  <div class="wrap hero-media" data-reveal>{ctx.img('photo-ragdoll', eager=True)}</div>
</section>

<section class="spec-strip" aria-label="At a glance">
  <div class="wrap spec-grid" data-reveal>
    <div class="spec"><b>40 lb</b><span>tested load</span></div>
    <div class="spec"><b>4 cups</b><span>suction grip</span></div>
    <div class="spec"><b>1 minute</b><span>to set up</span></div>
    <div class="spec"><b>30 days</b><span>to return it</span></div>
  </div>
</section>

<section class="section section--tint" aria-labelledby="why-title">
  <div class="wrap">
    <div class="section-head center" data-reveal><h2 id="why-title">Made for the sunny spot.</h2>
      <p>Cats go where the light is. This puts a soft, steady seat right at the glass, without cables, tools or a tower in the corner.</p></div>
    <div class="tiles">
      <article class="tile tile--wide" data-reveal>
        <div class="tile-copy">
          <h3>Holds on without cords or drilling.</h3>
          <p>A rigid, painted stainless steel frame and four suction cups pressed flat against the glass. Nothing dangles, nothing gets screwed into your window frame, and it comes off clean.</p>
          <p class="tile-note">Tested to 40 lb on clean, smooth glass. Press-test it by hand before your cat hops up.</p>
        </div>
        <div class="tile-media">{ctx.img('photo-plush')}</div>
      </article>
      <article class="tile" data-reveal>
        <div class="tile-copy">
          <h3>A cover for every season.</h3>
          <p>Fleece side up for warm winter mornings. Mesh side up when the sun is strong. It zips off to wash.</p>
        </div>
        <div class="tile-media">{ctx.img('perch-cover')}</div>
      </article>
      <article class="tile" data-reveal>
        <div class="tile-copy">
          <h3>Folds flat when you want the window back.</h3>
          <p>Pop the cups off and it slides behind a bookcase. Back up in about a minute.</p>
        </div>
        <div class="tile-media">{ctx.img('perch-folded')}</div>
      </article>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="shop-title">
  <div class="wrap">
    <div class="section-head center" data-reveal><h2 id="shop-title">Which one is right for you?</h2><p>The perch on its own, the Fur Lifter on its own, or both in a gift-ready box.</p></div>
    <div class="grid-3">{"".join(product_card(ctx, pid) for pid in ORDER)}</div>
  </div>
</section>

<section class="section section--tint" aria-labelledby="setup-title">
  <div class="wrap">
    <div class="section-head center" data-reveal><h2 id="setup-title">Up in three steps.</h2><p>No tools. The <a href="{ctx.link('/help/', 'setup')}">full setup guide</a> has extra tips.</p></div>
    <ol class="steps" data-reveal>
      <li><h3>Clean the glass</h3><p>Wipe the pane with glass cleaner or rubbing alcohol, then dry it. Rinse the cups in warm water.</p></li>
      <li><h3>Press on the cups</h3><p>Hold the perch level at your cat's height and press each cup flat until the air is out.</p></li>
      <li><h3>Test, then invite</h3><p>Press down hard on the bed with your hand. If nothing moves, it's ready for your cat.</p></li>
    </ol>
  </div>
</section>

<section class="section section--dark" aria-labelledby="compare-title">
  <div class="wrap">
    <div class="section-head center" data-reveal><h2 id="compare-title">Why cordless.</h2><p>How the perch compares with the two usual ways to give a cat a view.</p></div>
    <div class="table-card" data-reveal>
      <table class="compare">
        <thead><tr><th scope="col"><span class="visually-hidden">Feature</span></th><th scope="col" class="ours">Cordless perch</th><th scope="col">Corded hammock</th><th scope="col">Cat tree</th></tr></thead>
        <tbody>{table_rows}</tbody>
      </table>
    </div>
    <p class="table-note center">Hammock and cat tree figures are typical for each type, not any one brand.</p>
    <div class="btn-row btn-row--center" style="margin-top:28px">
      <a class="btn" href="{perch}">Get the perch</a>
    </div>
  </div>
</section>

<section class="section promise-section" aria-labelledby="promise-title">
  <div class="narrow center" data-reveal>
    <h2 id="promise-title">If it doesn't suit your window, send it back.</h2>
    <p class="lede center">You have 30 days from delivery. Email <a href="mailto:{EMAIL}">{EMAIL}</a> and you'll hear back within one business day from Brady, who runs the shop.</p>
    <a class="link-more" href="{ctx.link('/policies/', 'returns')}">Read the return policy</a>
  </div>
</section>

<section class="section section--tint" aria-labelledby="faq-title" id="faq">
  <div class="narrow">
    <h2 id="faq-title" class="center">Questions.</h2>
    {faq_block(ctx, 'home')}
    <p class="center" style="margin-top:24px"><a class="link-more" href="{ctx.link('/help/', 'faq')}">More answers in Help</a></p>
  </div>
</section>

<section class="section" aria-labelledby="reviews-title">
  <div class="narrow center reviews-empty" data-reveal>
    {ICON['quote']}
    <h2 id="reviews-title">No reviews yet.</h2>
    <p>We're a new shop, so there's nothing to show here yet, and we won't fill the space with made-up quotes or borrowed star ratings. When customers tell us how their perch is working, good or bad, their reviews will go here.</p>
    <a class="link-more" href="{ctx.link('/thank-you/', 'review')}">Already have one? Leave a review</a>
  </div>
</section>
{signup_section(ctx, 'home')}
"""


def specs_table(rows):
    return '<table class="specs"><tbody>' + "".join(
        f'<tr><th scope="row">{k}</th><td>{v}</td></tr>' for k, v in rows if v
    ) + "</tbody></table>"


PERCH_SAFETY = """<div class="safety">
  <h3>Where it fits</h3>
  <ul>
    <li>Smooth, flat glass with room for all four cups. Double-pane is fine.</li>
    <li>Not for textured or frosted glass, window film, screens, wood or painted surfaces.</li>
    <li>A pane that doesn't open is best. If it opens, keep it shut while the perch is up.</li>
  </ul>
  <h3>Keeping it safe</h3>
  <ul>
    <li>Press down hard on the bed with your hand before your cat's first jump.</li>
    <li>Mount it at a height your cat can reach and get down from easily.</li>
    <li>Check the cups once a week, and after big temperature swings at the window.</li>
    <li>Tested to 40 lb on clean glass. Keep the total weight on it, cats included, under that.</li>
    <li>Watch the first few visits until you're both sure of it.</li>
  </ul>
</div>"""

LIFTER_SAFETY = """<div class="safety">
  <h3>Good to know</h3>
  <ul>
    <li>Works on upholstery, bedding, cat trees and other everyday fabrics.</li>
    <li>On delicate fabrics like silk or velvet, try a hidden spot first.</li>
    <li>Clear out the collected fur after each use so it keeps working well.</li>
    <li>It's for furniture and fabric, not for brushing your cat.</li>
  </ul>
</div>"""


def product_page(ctx, pid):
    p = PRODUCTS[pid]
    imgs = p["images"]
    first = IMAGES[imgs[0]]
    thumbs = "".join(
        f'<button type="button" class="thumb" aria-pressed="{"true" if i == 0 else "false"}" data-full="{ctx.src(k)}" data-alt="{esc(IMAGES[k]["alt"])}" aria-label="Show photo {i + 1}: {esc(IMAGES[k]["alt"])}">{ctx.img(k, alt="")}</button>'
        for i, k in enumerate(imgs)
    )
    drawn = [str(i + 1) for i, k in enumerate(imgs) if IMAGES[k]["file"].endswith(".svg")]
    note = ""
    if drawn:
        which = drawn[0] if len(drawn) == 1 else ", ".join(drawn[:-1]) + " and " + drawn[-1]
        note = f'<p class="gallery-note">Picture{"s" if len(drawn) > 1 else ""} {which} {"are drawings" if len(drawn) > 1 else "is a drawing"} until we have photos of {"them" if len(drawn) > 1 else "it"}.</p>'
    options = "".join(
        f'<option value="{oid}"{" selected" if oid == pid else ""}>{PRODUCTS[oid]["option"]}</option>' for oid in ORDER
    )
    compare_hidden = "" if p["compare"] else " hidden"
    compare_val = money(p["compare"]) if p["compare"] else ""

    if pid == "window-perch":
        extra = f"""<div class="upsell">
      {ctx.img('bundle', alt='')}
      <div><strong>Make it the Cozy Window Bundle</strong>
        <p>Add the Fur Lifter, a spare fleece pad and a gift-ready box for $17.99 more, still with free shipping.</p>
        <a class="link-btn" href="{ctx.link('/cozy-window-bundle/')}" data-choose="cozy-window-bundle">Choose the bundle</a></div>
    </div>"""
    elif pid == "fur-lifter":
        extra = f"""<div class="upsell">
      {ctx.img('bundle', alt='')}
      <div><strong>Free shipping in the bundle</strong>
        <p>The Cozy Window Bundle adds the perch, a spare fleece pad and a gift-ready box. $49.99 with shipping included.</p>
        <a class="link-btn" href="{ctx.link('/cozy-window-bundle/')}" data-choose="cozy-window-bundle">Choose the bundle</a></div>
    </div>"""
    else:
        extra = """<div class="in-box"><h2>In the box</h2><ul>
      <li>Cordless Window Perch with reversible fleece and mesh cover</li>
      <li>Reusable Fur Lifter</li>
      <li>Spare fleece pad, so there's a seat on laundry day</li>
      <li>Gift-ready box</li></ul></div>"""

    perch_rows = [
        ("Frame", "Painted stainless steel"),
        ("Tested load", "40 lb, on clean smooth glass"),
        ("Grip", "4 suction cups"),
        ("Cover", "Reversible and zip-off: fleece on one side, mesh on the other"),
        ("Storage", "Folds flat"),
        ("Size", PERCH_SIZE),
        ("Tools needed", "None"),
    ]
    if pid == "window-perch":
        rows = perch_rows + [("Shipping", "Free, to the 48 contiguous US states")]
        safety_title, safety = "Fit and safety", PERCH_SAFETY
    elif pid == "fur-lifter":
        rows = [
            ("Type", "Reusable pet hair remover"),
            ("Refills", "None needed"),
            ("Use on", "Couches, bedding, cat trees and other everyday fabrics"),
            ("Shipping", "$5.99 to the 48 contiguous US states, or free in the bundle"),
        ]
        safety_title, safety = "Fit and safety", LIFTER_SAFETY
    else:
        rows = [
            ("In the box", "Cordless Window Perch, Reusable Fur Lifter, spare fleece pad, gift-ready box"),
        ] + perch_rows + [
            ("Bought separately", "$51.99, plus $5.99 shipping on the Fur Lifter"),
            ("Shipping", "Free, to the 48 contiguous US states"),
        ]
        safety_title, safety = "Fit and safety", PERCH_SAFETY

    faq_tag = {"window-perch": "perch", "fur-lifter": "lifter", "cozy-window-bundle": "bundle"}[pid]
    others = [o for o in ORDER if o != pid]

    return f"""
<div class="product-nav" aria-label="{p['name']}">
  <div class="wrap product-nav-row">
    <span class="product-nav-name">{p['name']}</span>
    <nav class="product-nav-links" aria-label="On this page">
      <a href="{ctx.link(p['path'], 'specs')}">Specs</a>
      <a href="{ctx.link(p['path'], 'questions')}">Questions</a>
    </nav>
    <button type="button" class="btn btn--small" data-bb-buy data-buy="{pid}">Buy</button>
  </div>
</div>
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb" style="padding-top:28px"><a href="{ctx.link('/')}">Home</a><span aria-hidden="true">/</span><a href="{ctx.link('/shop/')}">Shop</a><span aria-hidden="true">/</span><span>{p['name']}</span></nav>
  <div class="product">
    <div data-gallery>
      <div class="gallery-main">{ctx.img(imgs[0], eager=True)}</div>
      <div class="thumbs" role="group" aria-label="Choose a photo">{thumbs}</div>
      {note}
    </div>
    <div class="buybox" data-buybox>
      <h1>{p['name']}</h1>
      <p class="sub">{p['sub']}</p>
      <div class="buy-price"><span class="amount" data-bb-price>{money(p['price'])}</span>
        <span data-bb-compare{compare_hidden}><s>{compare_val}</s> <span class="was">if bought separately</span></span></div>
      <div class="field">
        <label for="option">Choose</label>
        <select class="input" id="option" data-option>{options}</select>
      </div>
      <div class="delivered"><strong data-bb-delivered>{delivered_text(p)}</strong>
        <span class="muted">Sales tax, if any, is added at checkout.</span></div>
      <p class="arrives">{ICON['calendar']}<span>Arrives <strong data-delivery>in 4 to 10 business days</strong> if you order today.</span></p>
      <div class="buy-actions">
        <button type="button" class="btn btn--ghost" data-bb-add data-add="{pid}">Add to cart</button>
        <button type="button" class="btn" data-bb-buy data-buy="{pid}">Buy now</button>
      </div>
      <ul class="trust">
        <li>{ICON['truck']}<span data-bb-ship>{ship_line(p)}</span></li>
        <li>{ICON['return']}<span>30-day returns from delivery. <a href="{ctx.link('/policies/', 'returns')}">Return policy</a></span></li>
        <li>{ICON['lock']}<span>Secure checkout by Stripe</span></li>
      </ul>
      {extra}
    </div>
  </div>
</div>

<section class="section section--tint" id="specs" aria-labelledby="details-title">
  <div class="wrap detail-grid">
    <div><h2 id="details-title">Specs</h2>{specs_table(rows)}</div>
    <div><h2>{safety_title}</h2>{safety}</div>
  </div>
</section>

<section class="section" id="questions" aria-labelledby="pfaq-title">
  <div class="narrow">
    <h2 id="pfaq-title">Questions</h2>
    {faq_block(ctx, faq_tag)}
    <p style="margin-top:20px">Still wondering? Email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
  </div>
</section>

<section class="section section--tint" aria-labelledby="more-title">
  <div class="wrap">
    <h2 id="more-title" class="center">You might also like.</h2>
    <div class="grid-3 grid-3--two" style="margin-top:28px">{"".join(product_card(ctx, o) for o in others)}</div>
  </div>
</section>

<div class="buybar" aria-label="Quick buy">
  <div class="buybar-info"><span class="buybar-name" data-bb-name>{p['name']}</span><span class="buybar-price" data-bb-short>{short_price(p)}</span></div>
  <button type="button" class="btn" data-bb-buy data-buy="{pid}">Buy now</button>
</div>
"""


def page_shop(ctx):
    return page_head("Shop", "Three things, chosen with care. Every order ships within 3 business days to the lower 48, with tracking by email.",
                     [f'<a href="{ctx.link("/")}">Home</a>', "<span>Shop</span>"]) + f"""
<div class="wrap">
  <div class="grid-3">{"".join(product_card(ctx, pid, eager=True) for pid in ORDER)}</div>
</div>
<section class="section" aria-labelledby="pick-title">
  <div class="wrap">
    <div class="detail-grid">
      <div>
        <h2 id="pick-title">Not sure which?</h2>
        <p class="muted">Get the <a href="{ctx.link('/window-perch/')}">perch</a> if you just need the seat. Get the <a href="{ctx.link('/cozy-window-bundle/')}">bundle</a> if you want the fur covered too, want a spare pad for laundry day, or are giving it as a gift. It costs less than buying the two separately.</p>
      </div>
      <div>
        {checks(["Free shipping on the perch and the bundle", "Fur Lifter ships for $5.99", "30-day returns from delivery", "Secure checkout by Stripe"])}
      </div>
    </div>
  </div>
</section>
"""


def page_about(ctx):
    return f"""
<section class="section">
  <div class="wrap about-grid">
    <div class="about-photo">{ctx.img('about-tools', eager=True)}</div>
    <div class="prose">
      <h1>A small shop in Greenville, South Carolina</h1>
      <p class="lede">Perch &amp; Purr is run by one person. I'm Brady.</p>
      <p>I work construction Monday through Thursday and run this shop the rest of the week. Building things for a living makes me picky about what holds weight and how it's installed, and that's how I chose what to sell.</p>
      <p>The Cordless Window Perch is the heart of the shop. It skips the dangling cables most window hammocks use. It holds on with four suction cups and a stainless steel frame, goes up in about a minute, and folds flat when you need the window back.</p>
      <p>I don't make the perch myself. My job is choosing products carefully, describing them honestly, getting them to you quickly, and standing behind them with a 30-day return window.</p>
    </div>
  </div>
</section>
<section class="section section--tint" aria-labelledby="values-title">
  <div class="wrap">
    <h2 id="values-title" class="section-head">How the shop works</h2>
    <div class="values">
      <div><h3>Straight answers</h3><p>Specs, limits and all. If the perch won't work on your window, I'd rather tell you before you buy.</p></div>
      <div><h3>Real reviews only</h3><p>No made-up testimonials, no fake countdown timers, no "only 2 left." Reviews will show up as real customers write them.</p></div>
      <div><h3>A person on the other end</h3><p>Email <a href="mailto:{EMAIL}">{EMAIL}</a> and you'll get a reply within one business day.</p></div>
    </div>
  </div>
</section>
"""


def page_help(ctx):
    steps = [
        ("photo-plush", "1. Pick the pane",
         "<p>Choose smooth, flat glass with room for all four cups, at a height your cat can reach and get down from easily. A pane that doesn't open is best.</p>"),
        ("perch-cups", "2. Clean the glass and the cups",
         "<p>Wipe the glass with glass cleaner or rubbing alcohol and let it dry. Rinse the suction cups in warm water so they're soft and free of dust.</p>"),
        ("perch-folded", "3. Press each cup on",
         "<p>Unfold the perch and hold it level. Press the top cups on first, then the bottom ones, pushing each flat until the air is out.</p>"),
        ("photo-two-cats", "4. Press-test, then invite your cat",
         "<p>Push down hard on the bed with your hand. If nothing shifts, zip on the cover, fleece side up for cold weather or mesh side up for warm weather, and let your cat take it from there.</p>"),
    ]
    step_html = "".join(f'<div class="guide-step">{ctx.img(k, alt="")}<div><h3>{t}</h3>{b}</div></div>' for k, t, b in steps)
    return page_head("Help", "How to set up the perch, what to do if a cup slips, and answers to common questions.",
                     [f'<a href="{ctx.link("/")}">Home</a>', "<span>Help</span>"]) + f"""
<div class="wrap side-layout" style="padding-bottom:24px">
  <nav class="side-nav" aria-label="On this page">
    <a href="{ctx.link('/help/', 'setup')}">Setup guide</a>
    <a href="{ctx.link('/help/', 'slipping')}">If a cup slips</a>
    <a href="{ctx.link('/help/', 'care')}">Caring for the cover</a>
    <a href="{ctx.link('/help/', 'faq')}">Questions</a>
    <a href="{ctx.link('/help/', 'contact')}">Contact</a>
  </nav>
  <div>
    <section id="setup" aria-labelledby="setup-h" class="policy">
      <h2 id="setup-h">Setup guide</h2>
      <p class="muted">About a minute, no tools.</p>
      {step_html}
      <h3 style="margin-top:28px">Once a week</h3>
      <p class="muted">Press down on the bed to check the cups. Re-seat any cup that has lifted at the edge. Check again after a big change in weather, since cold glass and dry air are hard on suction cups.</p>
    </section>
    <section id="slipping" aria-labelledby="slip-h" class="policy prose">
      <h2 id="slip-h">If a cup slips</h2>
      <ol>
        <li>Take the perch down.</li>
        <li>Rinse each cup in warm water and dry it. Warm cups are softer and seal better.</li>
        <li>Clean the glass again with rubbing alcohol. Hand lotion, dust and cleaning residue all break the seal.</li>
        <li>Press the cups back on, top ones first, and press-test before your cat uses it.</li>
      </ol>
      <p>Still slipping? The glass may be textured or coated. Email us and we'll help you sort it out, or set up a return.</p>
    </section>
    <section id="care" aria-labelledby="care-h" class="policy prose">
      <h2 id="care-h">Caring for the cover</h2>
      <ul>
        <li>Unzip the cover from the frame before washing.</li>
        <li>Wash it the way the care tag says, and let it dry completely.</li>
        <li>Flip it with the seasons: fleece up for cold weather, mesh up for warm weather.</li>
        <li>Wipe the frame with a damp cloth when you need to.</li>
      </ul>
    </section>
    <section id="faq" aria-labelledby="faq-h" class="policy">
      <h2 id="faq-h">Questions</h2>
      {faq_block(ctx, 'help')}
    </section>
    <section id="contact" aria-labelledby="contact-h" class="policy">
      <div class="contact-card">
        <h2 id="contact-h">Still need help?</h2>
        <p class="muted">Email <a href="mailto:{EMAIL}">{EMAIL}</a>. You'll get a reply within one business day. If it's about an order, include the email you used at checkout.</p>
      </div>
    </section>
  </div>
</div>
"""


def page_policies(ctx):
    updated = "Last updated October 2026"
    return page_head("Policies", "Shipping, returns, privacy and terms, in plain English.",
                     [f'<a href="{ctx.link("/")}">Home</a>', "<span>Policies</span>"]) + f"""
<div class="wrap side-layout" style="padding-bottom:24px">
  <nav class="side-nav" aria-label="Policies">
    <a href="{ctx.link('/policies/', 'shipping')}">Shipping</a>
    <a href="{ctx.link('/policies/', 'returns')}">Returns</a>
    <a href="{ctx.link('/policies/', 'privacy')}">Privacy</a>
    <a href="{ctx.link('/policies/', 'terms')}">Terms</a>
    <a href="{ctx.link('/policies/', 'contact')}">Contact</a>
  </nav>
  <div class="prose">
    <section id="shipping" class="policy" aria-labelledby="ship-h">
      <h2 id="ship-h">Shipping</h2>
      <p class="updated">{updated}</p>
      <ul>
        <li><strong>Where:</strong> the 48 contiguous US states. We don't ship to Alaska, Hawaii, US territories, military addresses or outside the US yet.</li>
        <li><strong>When:</strong> orders are processed within 3 business days (Monday to Friday, not counting US holidays). Transit takes 3 to 7 business days after that.</li>
        <li><strong>Tracking:</strong> we email you a tracking number when your order ships.</li>
        <li><strong>Cost:</strong> the Cordless Window Perch and The Cozy Window Bundle ship free. The Reusable Fur Lifter ships for $5.99.</li>
        <li><strong>More than one product:</strong> each product checks out on its own Stripe page, so the Fur Lifter's shipping is charged on its checkout.</li>
      </ul>
      <p>If your order arrives damaged, or tracking says it was delivered and you can't find it, email us within 7 days of the delivery date with your order email and, if damaged, a photo. We'll work with you and the carrier to replace it or refund it.</p>
    </section>
    <section id="returns" class="policy" aria-labelledby="ret-h">
      <h2 id="ret-h">Returns</h2>
      <p class="updated">{updated}</p>
      <p>You have <strong>30 days from delivery</strong> to return anything you bought from us.</p>
      <ol>
        <li>Email <a href="mailto:{EMAIL}">{EMAIL}</a> with the email you used at checkout and a line about what's going on. We reply within one business day with the return address.</li>
        <li>Pack up all the parts (perch, cups, cover, and anything else that came with it), cleaned of cat hair if you can.</li>
        <li>Ship it back and send us the tracking number.</li>
      </ol>
      <ul>
        <li><strong>Refunds</strong> go back to your original payment method through Stripe within 5 business days of the return reaching us. Your bank may take a few more days to show it.</li>
        <li><strong>Return shipping:</strong> if the item arrived damaged, defective or wrong, we pay for return shipping. For other returns, return shipping is up to you.</li>
        <li><strong>Exchanges:</strong> return the item and place a new order.</li>
      </ul>
    </section>
    <section id="privacy" class="policy" aria-labelledby="priv-h">
      <h2 id="priv-h">Privacy</h2>
      <p class="updated">{updated}</p>
      <p><strong>What we collect.</strong> When you buy, Stripe collects your name, email, shipping address and payment details on its secure checkout page. We receive your name, email, address and what you ordered. We never see your full card number. If you join the launch list or leave a review, we get what you type into that form.</p>
      <p><strong>What stays in your browser.</strong> Your cart is saved in your own browser (local storage) so it's still there when you change pages. It isn't sent to us. This site has no advertising trackers and no analytics cookies.</p>
      <p><strong>How we use it.</strong> To fill and ship your order, send tracking, answer your emails, and send launch-list emails if you signed up. We don't sell or rent your information.</p>
      <p><strong>Who else handles it.</strong> Stripe (payments and sales tax), Netlify (hosting this site and receiving form entries), and the shipping carrier and supplier that get your order to you, who see only your name and address.</p>
      <p><strong>Your choices.</strong> Email <a href="mailto:{EMAIL}">{EMAIL}</a> to see, correct or delete what we have about you, or to leave the launch list.</p>
    </section>
    <section id="terms" class="policy" aria-labelledby="terms-h">
      <h2 id="terms-h">Terms</h2>
      <p class="updated">{updated}</p>
      <p>Perch &amp; Purr is a small business in Greenville, South Carolina. By ordering, you agree to these terms.</p>
      <ul>
        <li>Prices are in US dollars. Sales tax is added at checkout where required.</li>
        <li>If we list a wrong price or can't fill an order, we'll tell you and refund you in full.</li>
        <li>Please set up and check the perch as the <a href="{ctx.link('/help/', 'setup')}">setup guide</a> describes. Suction cups need clean, smooth glass and a weekly check.</li>
        <li>As far as the law allows, our responsibility for any order is limited to what you paid for it.</li>
        <li>These terms follow South Carolina law.</li>
      </ul>
    </section>
    <section id="contact" class="policy" aria-labelledby="pcontact-h">
      <h2 id="pcontact-h">Contact</h2>
      <p>Email <a href="mailto:{EMAIL}">{EMAIL}</a>. We reply within one business day. Perch &amp; Purr, Greenville, South Carolina.</p>
    </section>
  </div>
</div>
"""


def page_thank_you(ctx):
    product_opts = "".join(f'<option value="{PRODUCTS[o]["name"]}">{PRODUCTS[o]["name"]}</option>' for o in ORDER)
    ratings = "".join(
        f'<label><input type="radio" name="rating" value="{n}" required> {n}</label>' for n in (5, 4, 3, 2, 1)
    )
    return f"""
<div data-thank-you>
  <section class="thanks-hero">
    <div class="narrow">
      <h1>Thank you for your order</h1>
      <p class="lede">Stripe has emailed your receipt. Here's what happens next.</p>
    </div>
  </section>
  <div class="narrow" style="padding-bottom:24px">
    <ol class="next-steps">
      <li><p><strong>We pack it within 3 business days.</strong></p></li>
      <li><p><strong>You get a tracking number by email</strong> when it ships.</p></li>
      <li><p><strong>It arrives 3 to 7 business days after that.</strong> For an order placed today, that's about <span data-delivery>4 to 10 business days from now</span>.</p></li>
      <li><p><strong>Set it up in about a minute</strong> with the <a href="{ctx.link('/help/', 'setup')}">setup guide</a>.</p></li>
    </ol>
    <p class="muted" style="margin-top:24px">Questions about your order? Email <a href="mailto:{EMAIL}">{EMAIL}</a> with the email you used at checkout.</p>
  </div>
  <section class="section" id="review" aria-labelledby="review-title">
    <div class="narrow">
      <div class="review-card">
        <h2 id="review-title">Once it's up, tell us how it's going</h2>
        <p class="muted">We publish every review that's about the product, good or bad. We don't edit what you write, pay for reviews, or give anything in exchange for one.</p>
        <form {ctx.netlify('review')} data-done="Thank you. We'll publish your review once we've matched it to an order.">
          <input type="hidden" name="form-name" value="review">
          <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
          <div class="field"><label for="rv-name">Name to show with your review</label>
            <input class="input" id="rv-name" name="name" required autocomplete="name" placeholder="For example, Sam R."></div>
          <div class="field"><label for="rv-email">Email you used at checkout (never shown)</label>
            <input class="input" id="rv-email" type="email" name="email" required autocomplete="email"></div>
          <div class="field"><label for="rv-product">What you bought</label>
            <select class="input" id="rv-product" name="product">{product_opts}</select></div>
          <fieldset class="stars-pick"><legend>Your rating, out of 5</legend>{ratings}</fieldset>
          <div class="field"><label for="rv-text">Your review</label>
            <textarea class="input" id="rv-text" name="review" required placeholder="How's it holding up? What does your cat think?"></textarea></div>
          <label class="check-field"><input type="checkbox" name="publish_ok" value="yes" required> <span>It's OK to publish my review and the name above on this site.</span></label>
          <button class="btn" type="submit">Send review</button>
          <p class="form-msg" role="alert"></p>
        </form>
      </div>
    </div>
  </section>
</div>
"""


def page_404(ctx):
    return f"""
<section class="not-found">
  <div class="narrow">
    <svg class="arch-mini" viewBox="0 0 120 140" aria-hidden="true"><path d="M8 136V60a52 52 0 0 1 104 0v76Z" fill="#EBF0F3" stroke="#C5D4DC" stroke-width="4"/><path d="M60 8v128M8 84h104" stroke="#C5D4DC" stroke-width="3"/><circle cx="86" cy="44" r="10" fill="#E9B04F" opacity=".8"/></svg>
    <h1>We couldn't find that page</h1>
    <p class="lede" style="margin-inline:auto">The link may be old, or the page may have moved.</p>
    <div class="btn-row" style="justify-content:center">
      <a class="btn" href="{ctx.link('/')}">Go to the home page</a>
      <a class="btn btn--ghost" href="{ctx.link('/shop/')}">Visit the shop</a>
    </div>
  </div>
</section>
"""


def page_owner(ctx):
    thank = (lambda pid: f"{SITE_URL}/#/thank-you?product={pid}") if ctx.single else (lambda pid: f"{SITE_URL}/thank-you/?product={pid}")
    redirects = "".join(f"<li>{PRODUCTS[p]['name']}: <code>{thank(p)}</code></li>" for p in ORDER)
    return f"""
<div data-owner>
{page_head("Owner notes", "Private checklist and tools for running the shop. This page isn't linked anywhere and asks search engines not to list it. Don't put passwords or bank details here.")}
<div class="wrap owner-grid" style="padding-bottom:24px">
  <section class="panel" aria-labelledby="o-links">
    <h2 id="o-links">Stripe Payment Links</h2>
    <ul class="status-list" data-link-status></ul>
    <p class="small muted" style="margin-top:14px">Links are set at the top of <code>assets/site.js</code>. After editing, run <code>python3 build.py</code> and redeploy.</p>
    <p class="small"><strong>Each link should have:</strong> customer name required, US shipping address, adjustable quantity, Stripe Tax on, and the right price and shipping rate.</p>
    <p class="small"><strong>Optional:</strong> in each link's "After payment" setting, redirect to:</p>
    <ul class="small">{redirects}</ul>
  </section>
  <section class="panel" aria-labelledby="o-calc">
    <h2 id="o-calc">USPS box calculator</h2>
    <p class="small muted">Measure the folded perch in its shipping box. Over 1 cubic foot, USPS bills by size (volume ÷ 139). Any side over 22 in adds a $4.50 fee.</p>
    <form class="calc" data-ship-calc onsubmit="return false">
      <div class="field"><label for="calc-len">Length (in)</label><input class="input" id="calc-len" name="len" type="number" min="0" step="0.25" inputmode="decimal"></div>
      <div class="field"><label for="calc-wid">Width (in)</label><input class="input" id="calc-wid" name="wid" type="number" min="0" step="0.25" inputmode="decimal"></div>
      <div class="field"><label for="calc-hgt">Height (in)</label><input class="input" id="calc-hgt" name="hgt" type="number" min="0" step="0.25" inputmode="decimal"></div>
      <div class="field"><label for="calc-lb">Weight (lb)</label><input class="input" id="calc-lb" name="lb" type="number" min="0" step="0.1" inputmode="decimal"></div>
      <div class="calc-out" data-calc-out style="grid-column:1/-1" aria-live="polite"></div>
    </form>
  </section>
  <section class="panel" aria-labelledby="o-launch">
    <h2 id="o-launch">Before launch</h2>
    <ol>
      <li>Fix the perch Payment Link in Stripe so it charges $32.00 with free shipping, then paste it into <code>site.js</code>.</li>
      <li>Swap the drawings in <code>/images</code> for your own photos. Don't use Amazon or manufacturer photos without written permission.</li>
      <li>Measure the folded perch box and run the calculator above to make sure free shipping still pays.</li>
      <li>Add the perch size to <code>PERCH_SIZE</code> in <code>build.py</code>.</li>
      <li>In Netlify, turn on form detection (Forms), then redeploy.</li>
      <li>Get the SC Retail License ($50) through MyDORWAY.</li>
      <li>Place one real order yourself, then refund it in Stripe.</li>
      <li>Read the About page and policies and change anything that isn't right.</li>
    </ol>
  </section>
  <section class="panel" aria-labelledby="o-ship">
    <h2 id="o-ship">Fulfillment options</h2>
    <ul>
      <li><strong>Amazon shipped to the customer:</strong> a gray area in Amazon's terms, and it arrives in an Amazon box.</li>
      <li><strong>CJ Dropshipping, US warehouse:</strong> hands-off, but check stock, ship times and packaging before promising 3 days.</li>
      <li><strong>Ship from home:</strong> buy stock, print labels with Pirate Ship. Most control, most work.</li>
    </ul>
  </section>
  <section class="panel" aria-labelledby="o-tax">
    <h2 id="o-tax">SC sales tax</h2>
    <ul>
      <li>Retail License: $50 through MyDORWAY, before your first sale.</li>
      <li>File Form ST-3 every month, even with zero sales.</li>
      <li>Stripe Tax collects the tax but doesn't file it. Pull Stripe's tax report each month and use it to file.</li>
    </ul>
  </section>
  <section class="panel" aria-labelledby="o-tools">
    <h2 id="o-tools">Tools</h2>
    <ul>
      <li><a href="https://dashboard.stripe.com/payment-links" rel="noopener">Stripe Payment Links</a></li>
      <li><a href="https://app.netlify.com/" rel="noopener">Netlify (form entries under Forms)</a></li>
      <li><a href="https://www.pirateship.com/" rel="noopener">Pirate Ship</a></li>
      <li><a href="https://dor.sc.gov/" rel="noopener">SC Department of Revenue (MyDORWAY)</a></li>
    </ul>
    <button type="button" class="btn btn--ghost btn--small" data-clear-cart>Clear this browser's cart</button>
  </section>
</div>
</div>
"""


# ---------------------------------------------------------------- page list
# path: multi-page URL. nav: which header link is highlighted.
PAGES = [
    dict(path="/", out="index.html", nav="/", title="Perch & Purr | Cordless cat window perch, $32 with free shipping",
         description="A cordless suction-cup cat window perch with a stainless steel frame, tested to 40 lb. $32 with free shipping in the lower 48 and 30-day returns.",
         body=page_home),
    dict(path="/shop/", out="shop/index.html", nav="/shop", title="Shop | Perch & Purr",
         description="The Cordless Window Perch, the Reusable Fur Lifter and The Cozy Window Bundle. Free shipping on the perch and bundle.",
         body=page_shop),
    *[dict(path=PRODUCTS[pid]["path"], out=PRODUCTS[pid]["path"].strip("/") + "/index.html",
           nav=nav_key(PRODUCTS[pid]["path"]) if pid != "fur-lifter" else "/shop",
           title=f"{PRODUCTS[pid]['name']} | Perch & Purr", description=PRODUCTS[pid]["description"],
           body=(lambda ctx, pid=pid: product_page(ctx, pid)), product=pid, buybar=True) for pid in ORDER],
    dict(path="/about/", out="about/index.html", nav="/about", title="About | Perch & Purr",
         description="Perch & Purr is a one-person shop in Greenville, South Carolina.", body=page_about),
    dict(path="/help/", out="help/index.html", nav="/help", title="Help: setup guide and questions | Perch & Purr",
         description="How to set up the cordless window perch, what to do if a suction cup slips, and answers to common questions.",
         body=page_help),
    dict(path="/policies/", out="policies/index.html", nav=None, title="Shipping, returns and privacy | Perch & Purr",
         description="Shipping within the lower 48, 30-day returns from delivery, and how we handle your information.",
         body=page_policies),
    dict(path="/thank-you/", out="thank-you/index.html", nav=None, title="Thank you | Perch & Purr",
         description="Thanks for your order. Here's what happens next.", body=page_thank_you, noindex=True),
    dict(path="/404", out="404.html", nav=None, title="Page not found | Perch & Purr",
         description="We couldn't find that page.", body=page_404, noindex=True),
    dict(path="/owner/", out="owner/index.html", nav=None, title="Owner notes | Perch & Purr",
         description="", body=page_owner, noindex=True),
]


def catalog_json(ctx):
    data = {
        pid: dict(name=p["name"], price=p["price"], ship=p["ship"], compare=p["compare"],
                  path=p["path"], img=ctx.src(p["images"][0]))
        for pid, p in PRODUCTS.items()
    }
    return json.dumps(data, separators=(",", ":"))


def product_ld(pid):
    p = PRODUCTS[pid]
    data = {
        "@context": "https://schema.org", "@type": "Product", "name": p["name"],
        "description": p["description"], "image": [SITE_URL + "/" + IMAGES[k]["file"] for k in p["images"]],
        "offers": {"@type": "Offer", "price": f"{p['price'] / 100:.2f}", "priceCurrency": "USD", "url": SITE_URL + p["path"]},
    }
    return f'<script type="application/ld+json">{json.dumps(data)}</script>'


def head_common(title, description, noindex):
    robots = "noindex, nofollow" if noindex else "index, follow"
    return f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="{robots}">
<meta name="theme-color" content="#F7F9FA">
<link rel="icon" href="{FAVICON}">
{FONTS}"""


# ---------------------------------------------------------------- multi-page build
def build_multi():
    ctx = Ctx("multi")
    if OUT_MULTI.exists():
        shutil.rmtree(OUT_MULTI)
    OUT_MULTI.mkdir()
    shutil.copytree(ROOT / "assets", OUT_MULTI / "assets")
    shutil.copytree(ROOT / "images", OUT_MULTI / "images")

    for page in PAGES:
        canonical = SITE_URL + (page["path"] if page["path"] != "/404" else "/404.html")
        og_img = SITE_URL + "/" + IMAGES["photo-ragdoll"]["file"]
        extra = product_ld(page["product"]) if page.get("product") else ""
        body_cls = ' class="has-buybar"' if page.get("buybar") else ""
        doc = f"""<!doctype html>
<html lang="en" data-mode="multi">
<head>
{head_common(page['title'], page['description'], page.get('noindex'))}
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="{'product' if page.get('product') else 'website'}">
<meta property="og:site_name" content="Perch &amp; Purr">
<meta property="og:title" content="{esc(page['title'])}">
<meta property="og:description" content="{esc(page['description'])}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{og_img}">
<link rel="stylesheet" href="/assets/site.css">
{extra}
</head>
<body{body_cls}>
{header(ctx, page)}
<main id="main" tabindex="-1">
{page['body'](ctx)}
</main>
{footer(ctx)}
{overlays(ctx)}
<script type="application/json" id="pp-catalog">{catalog_json(ctx)}</script>
<script src="/assets/site.js" defer></script>
</body>
</html>
"""
        out = OUT_MULTI / page["out"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(doc, encoding="utf-8")

    listed = [p for p in PAGES if not p.get("noindex")]
    sitemap = "".join(f"<url><loc>{SITE_URL}{p['path']}</loc></url>" for p in listed)
    (OUT_MULTI / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sitemap}</urlset>\n')
    (OUT_MULTI / "robots.txt").write_text(f"User-agent: *\nDisallow: /owner/\nSitemap: {SITE_URL}/sitemap.xml\n")
    print(f"multi-page site: {len(PAGES)} pages in {OUT_MULTI.relative_to(ROOT)}/")


# ---------------------------------------------------------------- single-file build
MIME = {".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif"}


def hidden_netlify_forms():
    """Static copies so Netlify's deploy scan finds the forms that live inside <template>s."""
    return """<div hidden aria-hidden="true">
  <form name="launch-list" data-netlify="true" netlify-honeypot="bot-field" hidden>
    <input name="email"><input name="source"><input name="bot-field">
  </form>
  <form name="review" data-netlify="true" netlify-honeypot="bot-field" hidden>
    <input name="name"><input name="email"><input name="product"><input name="rating"><textarea name="review"></textarea><input name="publish_ok"><input name="bot-field">
  </form>
</div>"""


def single_path(path):
    return path.rstrip("/") or "/"


def build_single():
    ctx = Ctx("single")
    css = (ROOT / "assets/site.css").read_text(encoding="utf-8")
    js = (ROOT / "assets/site.js").read_text(encoding="utf-8")
    assert "</script" not in js.lower(), "site.js can't contain a closing script tag"

    templates = []
    for page in PAGES:
        attrs = {
            "data-path": single_path(page["path"]),
            "data-title": page["title"],
            "data-description": page["description"],
        }
        if page.get("nav"):
            attrs["data-nav"] = page["nav"]
        if page.get("noindex"):
            attrs["data-noindex"] = "true"
        if page.get("buybar"):
            attrs["data-buybar"] = "true"
        a = " ".join(f'{k}="{esc(v)}"' for k, v in attrs.items())
        templates.append(f"<template {a}>\n{page['body'](ctx)}\n</template>")

    used = "".join(templates) + catalog_json(ctx)
    images = {}
    for key, im in IMAGES.items():
        if f'"{key}"' not in used:
            continue
        f = ROOT / im["file"]
        images[key] = f"data:{MIME[f.suffix.lower()]};base64," + base64.b64encode(f.read_bytes()).decode()

    home = PAGES[0]
    doc = f"""<!doctype html>
<html lang="en" data-mode="single">
<head>
{head_common(home['title'], home['description'], False)}
<link rel="canonical" href="{SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Perch &amp; Purr">
<meta property="og:title" content="{esc(home['title'])}">
<meta property="og:description" content="{esc(home['description'])}">
<style>
{css}
</style>
</head>
<body>
{header(ctx, {})}
<main id="main" tabindex="-1">
<noscript><div class="wrap section"><h1>Perch &amp; Purr</h1><p>This store needs JavaScript to show its pages. Please turn it on, or email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></div></noscript>
</main>
{footer(ctx)}
{overlays(ctx)}
{hidden_netlify_forms()}
{"".join(templates)}
<script type="application/json" id="pp-catalog">{catalog_json(ctx)}</script>
<script type="application/json" id="pp-images">{json.dumps(images, separators=(",", ":"))}</script>
<script>
{js}
</script>
</body>
</html>
"""
    if OUT_SINGLE.exists():
        shutil.rmtree(OUT_SINGLE)
    OUT_SINGLE.mkdir()
    out = OUT_SINGLE / "index.html"
    out.write_text(doc, encoding="utf-8")
    print(f"single file: {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB, {len(images)} images stored once)")


if __name__ == "__main__":
    build_multi()
    build_single()
