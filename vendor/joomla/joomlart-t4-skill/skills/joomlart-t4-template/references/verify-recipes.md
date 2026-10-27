# Verify Recipes — compare the rendered Joomla page against its reference, light AND dark

> **Phase 8 packet.** Read when verifying render parity (light + dark) per view. This is the work the
> verify subagents do in parallel — dispatch prompts in `build-subagents.md` §A. Always clear the
> optimize cache first (gotcha #1).

Phase 8. The acceptance bar for the whole build is **render parity**: the live Joomla page must match
its **reference** in layout structure, token colors, typography, and spacing — in **both** light and
dark — confirmed by side-by-side screenshots **and** a deterministic computed-style diff. You verify
by *reading `getComputedStyle`*, never by eyeballing a screenshot alone and never by assuming an edit
landed.

## §0 — What you compare against depends on the input (READ THIS FIRST)

The build accepts five input formats, so "the source" is not always an HTML file. **The spec-pack's
`reference.json` tells you what to compare against, per page.** Read it before you verify anything:

```bash
cat <SPEC_PACK>/reference.json      # kind · viewports · modes · pages[]
```

`reference.kind` selects the recipe. Everything else in this document — the cache discipline, the
mode-setting, the selector set, the snapshot format, the per-view checklist — is **identical across
all four**.

| `kind` | Reference side is | Recipe |
|---|---|---|
| `html` | a real HTML file in `<SPEC_PACK>/reference/<page>` | **§0a** — probe both sides, diff numerically. The strictest, and the default for HTML-bundle input. |
| `url` | the live page at `pages[].url` | **§0a**, with the reference side being that URL. Prefer the pre-captured `reference/<page>.snapshot.json` so a live change mid-build cannot move the goalposts. |
| `image` | frame renders in `pages[].shots.*` **plus** the numeric tables in `design-spec.md` | **§0b** — screenshot-compare, and assert the probed values against the declared numbers. |
| `none` | nothing external (brief input) | **§0c** — the self-consistency gate. |

**Never invent a reference.** If a page has no entry in `reference.json`, the spec-pack is invalid
and the gate (`scripts/ingest/spec-pack.mjs --validate`) should have caught it — go back to Phase 2
rather than verifying that page against your memory of the design.

### §0a — `html` and `url`: two-sided computed-style diff

Both sides are a real DOM, so parity is a numeric diff and no visual judgement enters the loop. This
is the loop documented in "The per-page verify loop" below. For `url`, substitute the live URL for
the `file://` reference and probe the **same logical elements**.

### §0b — `image`: screenshot + declared-number assertions

There is no DOM on the reference side, so parity is proven two ways at once:

1. **Visual** — screenshot the Joomla page at each viewport/mode in `reference.json` and compare
   against `pages[].shots.<mode>` side by side. Structure, order, proportion, emphasis.
2. **Numeric** — probe the Joomla side exactly as in §0a, then assert each value against the
   **per-component tables in `design-spec.md`**. Those numbers came from the design tool's API
   (Pencil `batch_get` / Figma variables), so they are exact — this is *stricter* than scraping a
   rendered DOM, not looser.

A mismatch against a declared number is a defect even when the screenshot "looks right". A screenshot
that looks wrong is a defect even when the numbers match — investigate which one is lying before
changing anything.

### §0c — `none`: the self-consistency gate

Brief input has no external target. Parity is replaced by six checks, all of which must pass on every
page (the full list lives in `inputs/from-brief.md` §4):

1. every colour on screen resolves to a token declared in `design-spec.md` — a hex in the render that
   is not in the spec means something was hardcoded;
2. both palettes render, and the toggle flips every surface including standalone 404/offline;
3. no horizontal overflow at any declared viewport;
4. the type scale matches the declared sizes/weights (not the cloned blank's defaults — gotcha #57);
5. every page in `page-map.json` returns HTTP 200;
6. the full `editability-standards.md` audit passes.

Say plainly in the Phase 8 report that this build was verified by self-consistency, not parity. It is
a weaker claim and must not be presented as the same thing.

The probing technique here is the one documented in `references/darkmode/probe-recipes.md`, driven by
`scripts/review/probe.mjs`. This doc adds the **two-sided**
twist: every probe is run **twice** (Joomla render + the source HTML page) and **per mode** (light
+ dark), then diffed.

> **Operational reality — read `gotchas.md` #33 BEFORE you screenshot/probe.** On real T4 sites the
> Playwright MCP screenshot wrapper times out (~5s) on heavy pages and its browser profile is often
> locked — use a **standalone Playwright script with system Chrome** (`chromium.launch({channel:'chrome'})`;
> reusable drivers kept under `.*-build/`). T4 emits ~7 `ul.navbar-nav` copies (target the visible
> desktop one), hover doesn't fire headless (use real `page.hover()` for mega panels; force-open
> mis-positions them), and you must `clear-cache.sh` before every render or you screenshot stale CSS.
> A full per-page table (every menu item × light/dark × 1440/390) checking HTTP 200, no "T4 Blank"
> chrome, zero horizontal overflow, and **zero PHP warnings** is the completion gate.

`<DARK>` = the framework dark hook pinned in Phase 0 (`html.t4-dark` or `[data-bs-theme="dark"]` —
see `references/css-tokenizing.md`). `<TPL>` = `ja_<name>`.

---

## What "parity" means (state this up front)

> **Parity = layout structure + token colors + typography + spacing match**, confirmed by
> side-by-side screenshot review and a tolerant computed-style diff — **NOT a strict pixel diff.**

A pixel-exact diff is impossible and is **not** the bar, because Joomla legitimately differs from
the static HTML in ways that don't break the design:

- Joomla wraps content in **module/component chrome** (`.moduletable`, `.com-content-article`,
  position wrappers) the static HTML doesn't have — DOM depth and class names differ.
- **Fonts load differently** (webfont via `@font-face`/Google vs whatever the bundle inlined);
  sub-pixel metrics and FOUT timing differ.
- Demo content (article titles, image crops, counts) won't be byte-identical to the mock.

So parity is judged on the **design tokens**, not the pixels:

1. **Structure** — the same sections in the same order, same grid/columns, same nav + megamenu.
2. **Color** — header/nav/hero/card/footer/button/link computed colors match the source **within a
   hex tolerance** (default ±8/255 per channel; tune in `verify-render.mjs`). Antialiasing and
   webfont rendering shift a couple of levels — that's fine; a wrong *token* is not.
3. **Typography** — `font-family` (family name, ignore fallback-stack ordering noise), `font-size`,
   `font-weight`, `line-height` on headings + body match.
4. **Spacing** — section padding and card gaps match within tolerance.

The **deterministic** half of this is `scripts/verify-render.mjs` → `diffSnapshots(a, b)`, which
takes two computed-style **snapshots** (see format below) and reports per-selector, per-property
mismatches outside tolerance. The **judgement** half is the side-by-side screenshots you review.
Both must pass before a view is "done".

---

## Always clear the optimize cache first

T4 bundles CSS/JS into `media/t4/optimize/<hash>` (structural fact #2 in `SKILL.md`). A stale bundle
means you're verifying **old CSS** — the #1 false negative *and* false positive in this phase. Before
**every** verify pass:

```bash
bash scripts/clear-cache.sh --root <joomla-root>     # removes media/t4/optimize/*
```

Then force a rebuild by loading the page (`browser_navigate`, or `curl -s <url> -o /dev/null`) before
you probe. The first probe right after a clear can race the rebuild/file-sync — if a value looks
impossible, reload and probe again (see `references/gotchas.md`, optimize-cache staleness). On
DDEV/Mutagen, clear **inside** the container so the sync isn't tripped.

---

## The per-page verify loop

For **each row of the coverage matrix** (`references/page-coverage-matrix.md`), do this on the
**Joomla side** and the **reference side**, in **both modes**, and diff. This is the `html`/`url`
recipe (§0a); for `image` swap the reference side for §0b's screenshot + declared-number assertions,
and for `none` run §0c instead.

```
R = reference.json                                   # from the spec-pack — the source of truth
for view in (home, blog, article, contact, search, login, register, profile, 404, offline, …):
    clear-cache.sh                                   # stale-bundle guard
    entry = R.pages[view]                            # no entry ⇒ the pack is invalid, STOP
    kind  = entry.kind ?? R.kind
    for mode in R.modes:                             # normally (light, dark)
        ── JOOMLA SIDE ────────────────────────────
        browser_navigate  <live-joomla-url-for-view>
        set mode          (toggle the switch, or force <DARK> — recipe §1)
        browser_take_screenshot   → joomla-<view>-<mode>.png
        probe key selectors via getComputedStyle  → snapshot J
        ── REFERENCE SIDE ─────────────────────────
        kind == html  → browser_navigate file://<SPEC_PACK>/<entry.path>
        kind == url   → browser_navigate <entry.url>   (or load entry's pre-captured snapshot)
        set mode          (the reference's own dark hook, or <DARK> if it reuses one)
        browser_take_screenshot   → ref-<view>-<mode>.png
        probe the SAME logical elements           → snapshot R
        ── DIFF ───────────────────────────────────
        verify-render.mjs diffSnapshots(J, R)     → token/type/spacing deltas
        review joomla-<view>-<mode>.png  vs  ref-<view>-<mode>.png  side by side
    pass only if: diff clean (within tolerance) AND screenshots structurally match in EVERY mode
```

`verify-render.mjs` is a **pure two-snapshot differ** — `diffSnapshots(a, b)` over two computed-style
JSON files: `node scripts/verify-render.mjs <snapshotA.json> <snapshotB.json> [--tolerance N]`. It does
**not** navigate, set modes, screenshot, or render. **Claude drives the live render/screenshot via the
Playwright MCP** (the loop above) to produce each snapshot — one per mode per side — and then feeds the
two JSON files to the script for the deterministic diff. Use Playwright MCP interactively for both the
Joomla and HTML sides; use the script only as the repeatable diff gate.

### Mapping a Joomla view to its reference

`<SPEC_PACK>/page-map.json` records, per page, which Joomla view it became; `reference.json` records,
for that same `page` key, what to compare it against. Read the pair together:

```
matrix row (a Joomla view)
   → page-map.pages[] entry whose .view matches      → its .file
      → reference.json.pages[] entry whose .page == that .file
         → .path (html) | .url (url) | .shots (image) | nothing (none)
```

The `page` key is the join. It is why the validator refuses a pack where the two disagree — a page
present in one and absent from the other would silently drop out of Phase 8 while still looking
verified.

When a matrix row has no page at all (you added a view the design never covered — a legitimate
outcome of the coverage floor), verify it against the **design system** rather than a reference:
tokens, type scale and spacing from `design-spec.md`, plus the §0c self-consistency checks. Record it
as such in the report; do not claim parity for a page that had nothing to compare against.

---

## Setting the mode (run every page twice)

Don't trust a single mode — a token can be correct in light and broken in dark (or vice-versa).
Flip the hook and read the same selector; a theme-flip without reload is cheap (set attr/class, read,
flip back — see probe-recipes §1):

```js
// browser_evaluate — Joomla side
(mode) => {
  const r = document.documentElement;
  if (mode === 'dark') { r.classList.add('t4-dark'); r.setAttribute('data-bs-theme','dark'); }
  else { r.classList.remove('t4-dark'); r.setAttribute('data-bs-theme','light'); }
}
```

On the **HTML side**, set the bundle's own dark hook (whatever the source design uses — it may be a
class, a `data-theme`, or a media query). If the bundle has **no** dark design, there's nothing to
diff dark against: the dark palette was *derived* in Phase 6, so verify it against the
the dark-mode acceptance scanners in `scripts/review/` instead (contrast/leak/border/seam/hover —
`darkmode/probe-recipes.md` §6) rather than against a non-existent HTML mock.

Best practice: also test the **real toggle** (click the switch, confirm persistence across reload)
at least once per build — forcing the class proves the CSS, clicking the switch proves the wiring.

---

## Probe these selectors (the per-view snapshot set)

Read each in **both** modes on **both** sides. These are *logical* targets — map them to the actual
classes this template uses (read them off the rendered DOM; never guess — probe-recipes §2):

| Logical element        | Typical selector(s)                                  |
|------------------------|------------------------------------------------------|
| header / topbar        | `.t4-header`, `.header`, `.topbar`                   |
| logo                   | `.logo img`, `.site-logo`                            |
| nav (rest)             | `.t4-megamenu .nav > li > a`                          |
| nav (active)           | `.t4-megamenu .active > a`                            |
| **megamenu OPEN**      | `.t4-megamenu .dropdown-menu`, `.mega-dropdown-inner` (open it first — §below) |
| hero / masthead        | `.hero`, `.t4-section.hero`, the home banner block    |
| content body           | `.com-content-article__body`, `.item-content`, `article p` |
| heading scale          | `h1, h2, h3` inside content                            |
| listing card           | `.blog .item`, `.article`, `.card`                    |
| sidebar module         | `.sidebar .moduletable`, `.t4-sidebar .module-title`  |
| button (primary)       | `.btn-primary`                                        |
| link                   | `.item-content a`, `main a`                           |
| footer                 | `.t4-footer`, `footer`                                |
| form control           | `input.form-control`, `.com-users-login input`        |

### Open megamenu / off-canvas / drilldowns before probing

Closed menus are a blind spot — items inside a `display:none` dropdown read garbage. Open the state
first (probe-recipes §7 / hover-scan note):

```js
// browser_evaluate — force the megamenu panel open, then probe it
() => {
  const li = document.querySelector('.t4-megamenu .dropdown, li.menu-parent');
  li?.classList.add('show', 'open');
  li?.querySelector('.dropdown-menu, .mega-dropdown-menu')
     ?.style.setProperty('display', 'block', 'important');
}
```

For hover/active link states, force them (`.focus()`, `el.classList.add('active')`, `browser_hover`,
or CDP `forcePseudoState` — probe-recipes §1, §9) so you compare the same state both sides.

> Forcing `.show` answers "how does the open panel LOOK". It never answers "can a mouse GET there":
> T4 closes the panel on `mouseleave` of the `<li>`, and a full-width panel hung from the header
> leaves a strip the pointer must cross (gotchas #80). Run `scripts/review/mega-hover.mjs <url>` once
> per language/breakpoint for that — it is the only probe in this kit that moves a real pointer.

---

## Snapshot format (feed it to verify-render.mjs)

A snapshot is a flat JSON object keyed by **logical selector**, each value the computed styles read
for that element. `diffSnapshots(joomla, html)` walks shared keys and flags per-property deltas
outside tolerance (hex tolerance for the color/border props; exact for family; numeric tolerance for
sizes/spacing).

```json
{
  ".t4-header": {
    "color": "#1a1a2e", "backgroundColor": "#ffffff",
    "fontFamily": "Inter", "fontSize": "16px",
    "borderColor": "#e9ecef", "paddingTop": "24px"
  },
  ".t4-megamenu .active > a": {
    "color": "#ffffff", "backgroundColor": "#5e48db", "fontWeight": "600"
  },
  ".btn-primary": {
    "color": "#ffffff", "backgroundColor": "#5e48db",
    "borderColor": "#5e48db", "fontSize": "15px"
  },
  "h2": { "color": "#1a1a2e", "fontFamily": "Poppins", "fontSize": "32px",
          "fontWeight": "700", "lineHeight": "40px" },
  ".item-content a": { "color": "#5e48db" }
}
```

Produce it with one `getComputedStyle` pass — reuse the read() in `scripts/review/probe.mjs` (prefer the
first **visible** match to skip hidden carousel clones — probe-recipes §3), but emit the
selector→object JSON shape above instead of probe.mjs's pretty-printed lines. Normalize colors to
hex so the tolerance compare is channel-wise. Capture **one snapshot per mode per side** → four
snapshots per view; diff J-light↔H-light and J-dark↔H-dark.

---

## Per-view checklist (both modes, every box)

Run this for every matrix row, in light **and** dark:

- [ ] **Header / logo** — bg, height, logo swap (light vs dark logo asset) correct.
- [ ] **Nav + megamenu** — rest, active, and **open** state; columns/widths match; sub-item colors.
- [ ] **Hero / masthead** — bg (color *and* background-image — bg-color audits miss images,
      probe-recipes §4), overlay, heading color/size.
- [ ] **Listing cards** — surface vs transparent, border/shadow, title/excerpt/meta colors, gap.
- [ ] **Single article** — body type scale, link color, blockquote, inline images, meta row.
- [ ] **Sidebar modules** — module title bar, list items, widget surface.
- [ ] **Forms** — login + contact: input bg/border/text, placeholder, focus ring, submit button.
- [ ] **Footer** — bg, columns, link colors, copyright bar.
- [ ] **404 / error** — `error.php` (or `error-t4.php` — confirm which loads); standalone, no main
      chrome, so theme it on its own — and it must agree with the main site in EVERY mode (see below).
- [ ] **Offline / maintenance** — `offline.php`; also standalone, verify both modes separately.

**Dark-mode resolution consistency (GUI/cookie variant).** The standalone pages resolve theme
independently, so explicitly check all three page types agree per mode. Set the profile in
`local/etc/site/<profile>.json` (what the admin GUI writes), clear `media/t4/optimize/*`, then:

```bash
for url in "/" "/login" "/nope-xyz"; do          # home, real content (200), 404 (error.php)
  html=$(curl -s "<url>${url}?cb=$RANDOM")
  echo "$url theme=$(echo "$html" | grep -oE 'var t="(dark|light)"|prefers-color-scheme' | head -1) \
       darkmodeJS=$(echo "$html" | grep -c 'js/darkmode.js') \
       toggleBtn=$(echo "$html" | grep -coE '<button[^>]*t4-theme-toggle')"
done
```
- **off+light** → all rows `var t="light"`, `darkmodeJS=0`, `toggleBtn=0`.
- **off+dark**  → all rows `var t="dark"`,  `darkmodeJS=0`, `toggleBtn=0`.
- **on+dark**   → all rows `var t="dark"`,  `darkmodeJS=1`, `toggleBtn=1`.
- **on+auto**   → all rows OS-follow (`prefers-color-scheme`), `darkmodeJS=1`, `toggleBtn=1`.

Count `<button[^>]*t4-theme-toggle` (the BUTTON), not bare `t4-theme-toggle` (CSS class refs in
`<style>` are harmless). Full standard: `references/dark-light-mode-standard.md` §7.

Plus the global scanners from the dark-mode skill across **every** page once dark is in (white-leak,
dark-on-dark text, bright borders, box-shadow frames, coincident seams, hover-loses-bg) —
probe-recipes §6. Re-run after every fix round until clean.

---

## Phase 9 — clean-frame install-smoke-test (MANDATORY before you call the package done)

Your dev site lies: its DB already holds your demo/seed SQL, so a template that *renders on the dev
site* may still be broken as a *package*. The only honest test is to install the packaged zip into a
**pristine Joomla 6 + T4** and boot it. This caught real defects (gotchas #41, #43, #46, #49).

A pristine frame = any clean Joomla 6 + T4 install whose templates dir holds only
`cassiopeia*` + `t4_bs5_blank` (no demo content of yours). Keep one around, or stand a fresh one up
per `provision.md`.

```bash
# 1. Install the packaged zip via Joomla's REAL installer (not a file copy — this exercises manifest
#    detection, file copy, and #__template_styles style creation exactly as a user's upload would).
cp <build>/<tpl>.zip <clean-frame>/pkg.zip
cd <clean-frame> && ddev exec php cli/joomla.php extension:install --path=/var/www/html/pkg.zip
#    → expect "[OK] Extension installed successfully."

# 2. Confirm it registered + what style title it got (catches gotcha #41).
PFX=$(grep -oE "dbprefix = '[^']+'" configuration.php | sed "s/.*'\([^']*\)'.*/\1/")
ddev mysql -e "SELECT extension_id,element,enabled FROM ${PFX}extensions WHERE element='<tpl>';
               SELECT id,title,home FROM ${PFX}template_styles WHERE template='<tpl>';"
#    → title must be a real name, NOT 'JLIB_INSTALLER_DEFAULT_STYLE'.

# 3. Make it the default and boot. (A clean frame's home menu item may be PINNED to a blank style via
#    template_style_id — that overrides the site default, so set BOTH.)
STYLE=$(ddev mysql -N -e "SELECT id FROM ${PFX}template_styles WHERE template='<tpl>' LIMIT 1")
ddev mysql -e "UPDATE ${PFX}template_styles SET home='0' WHERE client_id=0;
               UPDATE ${PFX}template_styles SET home='1' WHERE id=${STYLE};
               UPDATE ${PFX}menu SET template_style_id=${STYLE} WHERE home='1' AND client_id=0;"
ddev exec sh -c 'rm -rf media/t4/optimize/* cache/* administrator/cache/*'

# 4. Boot + scan. Expect HTTP 200, assets served from templates/<tpl>/, no fatals.
curl -sk -o /tmp/b.html -w "HTTP %{http_code}\n" https://<frame>.ddev.site/
grep -ioE "Fatal error[^<]{0,120}|Uncaught[^<]{0,120}|Class .* not found" /tmp/b.html   # → empty
grep -oE "templates/<tpl>/[^\"']*" /tmp/b.html | head                                    # → present
ddev logs 2>/dev/null | grep -iE "PHP (Fatal|Warning)" | tail                            # → check #46
```

**Pass bar:** installs without error · style title is human-readable · frontend boots HTTP 200 with the
template's own chrome/assets · zero fatals · no contamination CSS (`css/extras/com_*`) loading for
components the design doesn't use (gotcha #43). **Then revert the clean frame** (restore the blank
default style + menu pin, `extension:remove` the test template, delete `pkg.zip`) so it stays pristine
for the next run. Remember: this proves the **template package** boots — the full **quickstart** (extra
styles, megamenu params, menus, demo articles) lives in your seed SQL, not the zip (gotcha #49).

---

## Operational notes (same gotchas as the dark-mode probe)

- **Self-signed TLS** on local DDEV → `ignoreHTTPSErrors: true` in every Playwright context.
- Pages with third-party embeds never reach `networkidle` → `waitUntil: 'load'`.
- **Disable AOS/scroll-in** before a static read so nothing is invisibly `opacity:0`:
  `[data-aos]{opacity:1!important;transform:none!important}`.
- Bundles may be built **per layout** — warm (load) the exact page you're probing, not just home.
- Confirm a fix actually landed: clear cache → reload → re-probe the **computed value**, not a
  screenshot (probe-recipes §8).

## Cross-references

- `references/page-coverage-matrix.md` — the list of views this loop iterates over.
- `references/conversion-contract.md` — the page-map that maps each Joomla view back to its
  `pages/<x>.html` source.
- `references/css-tokenizing.md` — where `<DARK>` is pinned and how both palettes are carried.
- `references/gotchas.md` — optimize-cache staleness, dark-hook mismatch, per-layout bundles.
- `scripts/verify-render.mjs` — `diffSnapshots(a, b)`: the deterministic color/type/spacing diff.
- `scripts/clear-cache.sh` — clears `media/t4/optimize/*`; run before every pass.
- `references/darkmode/probe-recipes.md` + `scripts/review/probe.mjs` — the underlying
  `getComputedStyle` probing technique and the global dark-mode acceptance scanners.
