# Probe Recipes — find the exact selector/color before fixing

> **Phases 5 & 7 toolbox — the eight `scripts/` scanners.** Computed-value-first, the method
> design-review verification also uses.

The core technique: **never guess a selector or color.** Read `getComputedStyle`. This turns
"the border looks heavy" into "`.item .top-border` has `border-top-color: rgb(233,236,239)` from
the bundle" — which you override precisely in one shot. `<DARK>` = your dark hook.

## Two ways to probe (use whichever is set up)

**A) Playwright MCP (simplest — no scratch dir, no npm).** Drive the live page with
`browser_navigate` + `browser_evaluate`. Set the theme by toggling or forcing the hook, then read
computed styles. Reach for this first if the MCP is available.

```js
// browser_evaluate
() => {
  document.documentElement.classList.add('t4-dark');   // force dark (T3: set data-theme)
  const e = document.querySelector('.item-content');
  const cs = getComputedStyle(e);
  return { color: cs.color, bg: cs.backgroundColor,
           border: `${cs.borderTopWidth} ${cs.borderTopColor}`, mTop: cs.marginTop };
}
```

**B) Scripted (`scripts/*.mjs`) — for batch/headless/CI.** Set up once (gitignored scratch dir):
```bash
mkdir -p .darkmode-work && cd .darkmode-work && npm i playwright@1 >/dev/null 2>&1
npx playwright install chromium >/dev/null 2>&1
node <skill>/scripts/probe.mjs <url> dark '.item-content' 'a'
```

## 1. Compare LIGHT vs DARK — rest, hover, AND active (the verify-before-fix check)
Read the same selector in both themes and all states. **If light == the value you were about to
"fix", it's by design — stop.**
```js
() => { const sel='.t4-megamenu .active > a', out={};
  const read=()=>{const cs=getComputedStyle(document.querySelector(sel));return {color:cs.color,bg:cs.backgroundColor};};
  document.documentElement.classList.remove('t4-dark'); out.light=read();
  document.documentElement.classList.add('t4-dark');    out.dark =read();
  return out; }   // hover/active: add the class, or use browser_hover
```
⚠️ **This flip-and-read is WRONG for TRANSITIONED properties** (`transition: border-color .15s` on
`.form-control` is standard in JA templates): `getComputedStyle` returns the mid-transition value,
so `out.dark` comes back as the OLD LIGHT value → a phantom "dark is broken" finding that survives
even an inline `!important` (gotcha §38c). Read **steady state**: settle after the flip, or — best
on T4 — load the page natively in each theme via the cookie, with NO JS flipping:
```js
const ctx = await b.newContext({ignoreHTTPSErrors:true});
await ctx.addCookies([{name:'ja_<name>-theme', value:'dark', url:BASE}]);  // server-resolves, no FOUC
// …goto, then: await p.waitForTimeout(600) before reading any transitioned property
```

## 2. Find the SOURCE rule (so you can out-specify it)
When your value is wrong OR your override "doesn't win", grep the served bundle for the winning
selector + its specificity:
```bash
BUNDLE=$(curl -s "<url>" | grep -oE '/media/t4/optimize/css/[^"?]+' | head -1)
curl -s "<url>$BUNDLE" | grep -oE "[^{}]*<selectorPart>[^{}]*\{[^}]*\}" | head
# look for: an #id, an !important utility (.text-primary), or a 4-class chain — then match/beat it
```

## 3. Probe VISIBLE elements only (avoid hidden owl clones)
The first `querySelector` match is often an off-screen carousel clone → misleading.
```js
() => [...document.querySelectorAll('.tour-item')]
  .filter(e => { const r=e.getBoundingClientRect(); return r.width>2 && r.height>2 && e.offsetParent; })
  .slice(0,3).map(e => getComputedStyle(e).backgroundColor)
```

## 4. Pseudo-element + background-image audit (bg-color audits MISS these)
```js
() => { const out=[];
  for (const e of document.querySelectorAll('*')) {
    for (const p of ['::before','::after']) { const cs=getComputedStyle(e,p);
      if (cs.content!=='none' && (cs.backgroundColor!=='rgba(0, 0, 0, 0)' || cs.borderTopWidth!=='0px'))
        out.push([(e.className||'').toString().slice(0,30)+p, cs.backgroundColor, cs.borderTopColor]); }
    const bi=getComputedStyle(e).backgroundImage;
    if (bi && bi!=='none') out.push([(e.className||'').toString().slice(0,30), 'IMG '+bi.slice(0,40)]);
    if (out.length>40) break; }
  return out; }
```

## 5. The seam / "gap" between two elements (box model lies — read pixels)
`getComputedStyle` won't explain a visible gap (rounded corners, overlap). Walk `elementFromPoint`
down the seam, or screenshot a zoomed strip:
```js
(cx, top) => { const out=[];           // cx = element centre x; top = its top y
  for (let y=top-70; y<=top+10; y+=8) { const el=document.elementFromPoint(cx,y);
    out.push([y, el?el.tagName+'.'+(el.className||'').toString().slice(0,24):'null', el&&getComputedStyle(el).backgroundColor]); }
  return out; }
```

## 6. Automated scanners (run across EVERY page before declaring done)
```bash
# WCAG contrast: flags text/bg pairs below the ratio (filter the by-design set yourself)
node <skill>/scripts/contrast-audit.mjs <url> 3.0

# White-leak (visible white-ish bg on a dark page) and dark-on-dark text:
node <skill>/scripts/leak-scan.mjs <url> white     # white backgrounds leaking
node <skill>/scripts/leak-scan.mjs <url> darktext  # near-black text on dark

# Bright borders (luma threshold). NOTE: box-shadow frames are INVISIBLE to this —
# sweep box-shadow separately (gotcha §40):
node <skill>/scripts/border-scan.mjs <url> 80

# Coincident 1px lines — stacked borders + inset rings that read as "fat" 2px seams:
node <skill>/scripts/seam-scan.mjs <url>

# Interactive states: hover/focus measured in BOTH themes on the same element;
# flags where dark is notably worse than light (the verify gate, automated).
# Blind spot: items inside CLOSED menus — open dropdowns first (gotcha §47):
node <skill>/scripts/hover-scan.mjs <url>

# Toggle BEHAVIOUR (not just looks): default light → click → dark + persisted → reload persists →
# click back → light restored. Run at desktop AND mobile width (split headers ship two buttons).
node <skill>/scripts/toggle-test.mjs <url>            # vega defaults (.t4-theme-toggle / t4-theme)
node <skill>/scripts/toggle-test.mjs <url> 390        # mobile width
# T3 / custom control: pass selector + storage key, e.g.
node <skill>/scripts/toggle-test.mjs <url> 1366 ".theme-toggle" "ja-morgan-theme"
```
Re-run after every fix round until clean. `toggle-test.mjs` is the final "does the switch actually
work" gate — confirm load order too: `curl -s <url> | grep -nE 'optimize|template|darkmode'` must
show darkmode.css AFTER the template bundle (gotcha §49).

## 7. Per-home itemid→accent map (input to the accent var, if per-home colors exist)
```js
() => ({ itemid: (document.documentElement.className.match(/itemid-(\d+)/) || [])[1]
                 || (document.body.className.match(/item-(\d+)/) || [])[1],
         primary: getComputedStyle(document.querySelector('.btn-primary, a')).color })
```

## 8. Confirm a fix actually landed (after clearing cache)
```bash
bash <skill>/scripts/clear-cache.sh   # run INSIDE the container on DDEV/Mutagen
# reload (MCP browser_navigate, or curl -s <url> -o /dev/null) to force a rebuild
# then re-probe the SAME selector — computed value, not a screenshot
```
Bundles may be built **per layout** — warm the page you're probing, not just home; the first
probe right after a clear can race the rebuild/file-sync (gotcha §39). When a value looks
impossible, probe twice before chasing it.

## 9. The authoritative "which rule wins" — CDP, not CSSOM walking
Hand-walking `document.styleSheets` for matched rules can silently return nothing on big
minified bundles. The DevTools protocol returns the full cascade for a node (LAST matched rule
wins), with `forcePseudoState` for hover/focus:
```js
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
const doc  = await cdp.send('DOM.getDocument');
const node = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '<sel>' });
await cdp.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: ['hover'] }); // optional
const m = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: node.nodeId });
// m.matchedCSSRules → filter each rule's style.cssProperties for the property you're tracing
```

## Operational notes
- Force interactive state before reading: `.focus()`, `.click()`, `browser_hover`, or
  `el.classList.add('active')`. Disable AOS for static shots:
  `[data-aos]{opacity:1!important;transform:none!important}`.
- Set theme deterministically with the class/attr; `colorScheme:'dark'` only works after the
  pre-paint resolver is installed.
- Local dev TLS is usually self-signed → `ignoreHTTPSErrors: true` in every Playwright context.
  Pages with third-party embeds (Disqus, social) never reach `networkidle` → `waitUntil: 'load'`.
- Theme-flip without reload is cheap: set the attr/class, read, flip back — this is how the
  light-vs-dark gate runs per element (see `scripts/review/hover-scan.mjs`).
