# Light / dark — the design that ran, and how to measure it

> **Phase 6 packet (css-dark).** The single source for the light/dark wiring of a Tracy theme on WordPress.
> This version records **exactly what `tracy-base` runs** (commit `c372bfa56`, measured 13/09/2026 on the stand
> `127.0.0.1:8227`), not what T4 does. Q2 (settled by Lee 13/09): `color-scheme` + toggle + cookie, matching
> T4 `other_darkmode=1`, `other_default_theme=auto`.

## 0. Three states, one attribute, one cookie

| State | `<html>` | Cookie `tracy_theme` | What decides the colours |
|---|---|---|---|
| light | `data-theme="light"` | `light` | theme.json `:root` (palette hex) |
| dark | `data-theme="dark"` | `dark` | `html[data-theme="dark"]` restates 16 presets |
| **auto** | **no `data-theme`** | `auto` or no cookie | `@media (prefers-color-scheme: dark) html:not([data-theme])` |

**An absent attribute is not a broken hook — it is `auto`.** Every probe, script and agent must read it exactly that way
(§4).

## 1. CSS — `theme.overlay.json → styles.css`

WordPress prints the palette onto `:root` as **fixed hex** (`--wp--preset--color--bg: #fafafa`), so
`color-scheme: light dark` alone changes nothing. Dark **restates every colour preset** — and only that, because
`tracy.css`/`tracy-base.css`/patterns have no hex outside the presets
([`theme-json-tokens.md`](theme-json-tokens.md) §0). The values come from the Joomla source's dark hook
(`capture/templates/tracy/css/styles/base.css`, `html[data-theme=dark]`) mapped token for token; the same set
applies under `prefers-color-scheme` when the root has no `data-theme`:

```css
html { color-scheme: light dark; }
html[data-theme="light"] { color-scheme: light; }
html[data-theme="dark"]  { color-scheme: dark; }
html[data-theme="dark"] { --wp--preset--color--bg: #000000; … 16 presets … }
@media (prefers-color-scheme: dark) { html:not([data-theme]) { …the same 16 presets… } }
```

Override table (16 presets, `tracy-base`'s dark values):

| Preset | Dark | Preset | Dark |
|---|---|---|---|
| `bg` | `#000000` | `accent` | `#2997ff` |
| `surface` | `#1d1d1f` | `accent-on` | `#000000` |
| `surface-warm` | `#0e0e0e` | `accent-hover` | `#349cff` |
| `fg` | `#f8f8f8` | `accent-active` | `#278ff1` |
| `fg-2` | `#c0c0c1` | `success` | `#16a34a` |
| `muted` | `#87878b` | `warn` | `#eab308` |
| `meta` | `#6f6f73` | `danger` | `#e45858` |
| `border` | `#2f2f30` | `border-soft` | `#262629` |

This is the **only CSS** for dark: no separate `darkmode.css`, no `.t4-dark` class. Adding a
colour means adding a preset (through tokens/`rootVariation`), not adding a hex to `styles.css`. It lives in
`theme.overlay.json` because `styles.css` is an allowed overlay key; the generated `theme.json` carries it
([`theme-json-tokens.md`](theme-json-tokens.md) §3).

## 2. JS — `assets/js/tracy-base-dark.js`

Enqueued **in `<head>`, blocking, on purpose** (`inc/extra.php`, `in_footer => false`): it reads the cookie and sets the
attribute **before the first paint**, so someone who chose dark sees no light flash. A few hundred bytes.

- `read()`: a regex on `document.cookie` → `light|dark|auto`, none → `auto`.
- `apply(state)`: `auto` → `removeAttribute('data-theme')`; otherwise → `setAttribute`. It also updates
  every `[data-tracy-theme-toggle]`: `aria-pressed` (true only when dark), `aria-label`, `data-theme-state`.
- `write(state)`: `tracy_theme=<state>; Max-Age=31536000; Path=/; SameSite=Lax` (+ `Secure` on https).
- A click on `[data-tracy-theme-toggle]` **cycles** `light → dark → auto → light` (not a two-state
  switch), through delegation on `document`, so a missing button is harmless.
- No user meta, no server-side resolution: the cookie is the only channel, and because CSS handles all three
  states, the first paint is right even before JS runs (auto follows the OS).

Button: `<button class="tracy-theme-toggle" data-tracy-theme-toggle data-theme-state="auto" aria-pressed="false" …>`
in `parts/header.html` (a `core/html`); styled by `data-theme-state` in `tracy-base.css` (lines
190–235). Every standalone surface (404, search, the login page if the theme styles it) goes through the theme's same `<head>`, so
the logic need not be repeated — unlike T4, where `error.php`/`offline.php` run outside the main render.

## 3. Setting the state when measuring — cookie, not attribute

Because the script in `<head>` **overwrites** the attribute from the cookie on every load, the deterministic way to set the state
for a fresh load is the **cookie**:

- `scripts/shoot.mjs … --dark-hook cookie:tracy_theme=dark` (the hook `attr:data-theme=dark` is removed by the script when
  there is no cookie — it reads `auto` and then `removeAttribute`; the page is still dark thanks to the context's
  `colorScheme: 'dark'` + `prefers-color-scheme`, but that measures `auto`, not `dark`).
- Playwright: `context.addCookies([{ name: 'tracy_theme', value: 'dark', url: BASE }])` before `goto`.
- **Dark-by-default sources** (every JA design): the light pass needs its own hook — `scripts/shoot.mjs … --light-hook
  cookie:ja_kinetic-theme=light`, `visual/visual-qa.mjs --source-light-hook …` (or `contract.source.lightHook`).
  The `cookie:` part is set with `context.addCookies` before `goto`, so it travels with the document request itself — a theme that builds
  light/dark on the server (Kinetic writes `var t="dark"` into the HTML) can only read it that way; a cookie set by an init script arrives after
  the document has been returned. There is no light hook by default.
- The `scripts/review/*` scanners set the theme **after** loading (`runtime.setTheme` → `setAttribute` after
  `page.goto`), so for them the attribute is enough — the head script has already run.

## 4. Measuring — `scripts/review/*` with `tracy-base`'s config

Every scanner reads `scripts/review/runtime.mjs`; **without `--config` it never `pass`es**: the result
is `needs-review` (exit 3) because `verified` requires `configured && expectedSelectors.length > 0`, and `examined === 0`
is `fail` (exit 1). The config for `tracy-base` (set via `--config <file>` or the env `WP_REVIEW_CONFIG`):

```json
{ "hook": { "type": "attribute", "name": "data-theme" },
  "toggle": ".tracy-theme-toggle",
  "persistence": { "type": "cookie", "key": "tracy_theme" },
  "expectedSelectors": [".tracy-header", ".tracy-footer", "main.tracy-main"],
  "expectedStatus": 200 }
```

| Command | Catches | WordPress notes |
|---|---|---|
| `node scripts/review/leak-scan.mjs <url> white` | near-white backgrounds left on a dark page (card, panel, form control, pseudo-bar) | `wp-block-search__input`, `wp-block-button__link`, `.tracy-card`, `.wp-block-details` |
| `node scripts/review/leak-scan.mjs <url> darktext` | near-black text on a dark background (hardcoded `#111`, meta, `<strong>`) | `.wp-block-post-date`, `.wp-block-post-terms`, `.tracy-mega__title` |
| `node scripts/review/contrast-audit.mjs <url> [3.0] [--mode light]` | text/background pairs below the threshold, header/footer included; dark by default, `--mode light` reads light (a floating header painted in the background colour — L-007) | filter by-design pairs by hand (badge `is-style-outline`) |
| `node scripts/review/border-scan.mjs <url> [80]` | borders still light on a dark background; **does not see** box-shadow — scan separately | a pattern's `border-border-soft` must come out as `#262629` |
| `node scripts/review/seam-scan.mjs <url>` | two overlapping 1px lines becoming a "thick streak" | stacked `.tracy-section--band.border-y` |
| `node scripts/review/hover-scan.mjs <url> [selector…]` | hover in dark worse than light on the same element; **opens** the navigation's submenus by itself first | also pass `'.tracy-mega__links a'` — the mega block is not a navigation submenu, hover-scan does not open it by itself |
| `node scripts/review/probe.mjs <url> <light\|dark> '<sel>' …` | computed color/bg/border of visible selectors, in the right theme | the "read before fixing" tool |
| `node scripts/review/toggle-test.mjs <url> [width] --config <file>` | the real button: click → changes → cookie written → reload keeps it → click back | **see the warning below** |

Run on every page, both modes, repeat until clean. A scanner that prints "clean" with `examined: 0` has not looked at anything.

### Warning: `toggle-test.mjs` and the `auto` state

`toggle-test.mjs` reads the initial theme through the attribute (`readTheme`), and **throws** `Configured hook does not
expose a theme` when the attribute is absent — so on a fresh context (no cookie, `auto` state) it
fails **before clicking anything**, even though the toggle works. It also assumes two states (click → the other mode →
click → back), while `tracy-base`'s button cycles through three. As of 13/09 the script had not been fixed for `auto`:

- The three-state cycle was measured with an **ad hoc** Playwright script during the build run (STATUS phase C:
  "toggle 3 states measured with Playwright") — **not in the kit yet**. Whoever needs it again writes it per §2: open the page
  without a cookie → attribute absent, `data-theme-state="auto"` → click → `light` + cookie `light` → click →
  `dark` → reload keeps `dark` → click → `auto` (attribute removed, cookie `auto`).
- Until `toggle-test.mjs` understands `auto`, its `fail` result on `tracy-base` is **not evidence**
  that the toggle is broken; and a probe that treats an absent attribute as a "broken hook" is measuring the wrong contract.

## 5. Invariant checklist (every theme, every page)

- [ ] `styles.css` restates **all 16 presets** under `html[data-theme="dark"]` **and** under
      `html:not([data-theme])` + the media query — missing one means a colour that does not change on one of the two paths.
- [ ] No hex outside the presets in CSS and patterns.
- [ ] `tracy-base-dark.js` enqueued in `<head>`, blocking.
- [ ] The `[data-tracy-theme-toggle]` button is present in every header variant (desktop + mobile).
- [ ] Images/logos readable on both backgrounds (a light logo on black: use a text wordmark or two images).
- [ ] The six scanners clean in both modes on every page-map page; the config has `expectedSelectors`.
- [ ] `shoot.mjs` shots with `cookie:tracy_theme=dark` — the home 1440 mean-gray must differ clearly from the light one (source
      j6: light 242 / dark 15, D5) — not a light shot carrying a dark name.
