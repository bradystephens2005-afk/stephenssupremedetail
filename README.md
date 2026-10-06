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

## Change something, then rebuild

```
python3 build.py
node tests/site.test.mjs
```

## Deploy (Netlify drag-and-drop)

1. Log in at app.netlify.com and open the `perch-and-purr` site.
2. Go to **Deploys** and drag the `single` folder (or the `site` folder) onto the drop area.
3. First time only: **Forms → Enable form detection**, then deploy again.

## Swap in a real photo

Put the photo in `images/`, then change that entry's `file`, `w` and `h` in `IMAGES` in `build.py`.
When every drawing is replaced, set `PLACEHOLDER_ART = False` to remove the note under the gallery.
