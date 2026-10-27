---
description: The token contract for HTML the server returns straight to the browser (the page shell of apps/tracy-web) — variable names, values, and why it cannot use tokens.css.
sources:
  - packages/ui/tracy-ui/src/tokens.css
  - apps/tracy-web/src/lib/page-shell.js
---

# Tokens of the server-rendered page shell — the contract

⚠ **NEW HOME ON 16/09/2026, SAME RULES.** This document was written for `workers/`, a tree deleted that same day.
The contract lives on intact in its new place: `apps/tracy-web/src/lib/page-shell.js` builds exactly that kind of page
— server-rendered, **no build step, no Tailwind** — so it too must redeclare the tokens by hand.
Read every "Worker page" below as "a page `tracy-web` returns directly".

Pages of this kind **cannot load `tokens.css`**: no build step, no Tailwind, and they cannot load
CSS from another host. So they redeclare the tokens by hand. This document is the contract for that
redeclaration, and it exists because before 01/09 there **was none** — agents working in `workers/` named their own variables
(`--bg`, `--fg`, `--muted`, `--danger-bg`), and the result was two naming systems for one colour system.

## Rules

1. **Variable names must MATCH `packages/ui/tracy-ui/src/tokens.css`.** No abbreviations, no new
   names. `--background`, not `--bg`.
2. **Values are `tokens.css`'s FALLBACK values**, not `var(--dsw-alias-*)`. Those aliases are set by dsh
   on `<body>`; a Worker has no dsh, so `var(--dsw-alias-…)` resolves to nothing.
3. **Only add a variable once `tokens.css` has it.** Need a colour without a name? Add it to `tokens.css`
   first, then copy it over.
4. **No raw colours in CSS rules.** The only exception: the brand mark (see §Brand).

## The token table

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.175 0 0)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.195 0 0)` |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--popover` / `--popover-foreground` | as `--card` | as `--card` |
| `--primary` | `oklch(0.588 0.136 37.4)` | *unchanged* |
| `--primary-foreground` | `oklch(0.985 0 0)` | *unchanged* |
| `--ring` | `oklch(0.588 0.136 37.4)` | *unchanged* |
| `--secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--secondary-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `--success` | `oklch(0.696 0.17 162.48)` | *unchanged* |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 14%)` |
| `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` |
| `--radius` | `0.625rem` | *unchanged* |

### Three dark-mode rows DELIBERATELY differ from `tokens.css`

`--background`, `--card` and `--border` in the table above **no** longer equal `tokens.css`'s
fallbacks. The table is right, `tokens.css` is right too, and they differ on purpose:

| | Worker (this table) | `tokens.css` |
|---|---|---|
| `--background` dark | `oklch(0.175 0 0)` | `oklch(0.145 0 0)` |
| `--card` dark | `oklch(0.195 0 0)` | `oklch(0.205 0 0)` |
| `--border` dark | `oklch(1 0 0 / 14%)` | `oklch(1 0 0 / 10%)` |

A Worker page is an empty page with a single card in the middle of the screen: the background must lift off pure black for the card
to stand out, and the card sinks below the background to give that depth. In the app it is the opposite: a lighter background
makes the sidebar (`oklch(0.205)`) dissolve into the canvas, the gap between the two areas dropping from 0.060 to 0.030.

⚠ **`tokens.css`'s fallbacks do NOT serve only Workers.** The palette generator of `dsh-brand` reads
those very values to produce `--dsw-alias-*` for dsh, so editing a fallback edits the app's background too.
Measured 04/09/2026: changing `0.145 → 0.175` and reloading the profile, the local webapp's `body` changed at once.
`packages/brand/tracy-brand/test/palette.test.mjs` pins those values and is the only gate that catches
this.

Making the three rows above stop differing means changing the app's background, and that is a decision about the app's interface,
not a cleanup to make the table match.

## Four easy mistakes, all four already made

### `--primary` is Tracy's terracotta (since 14/09/2026), and it does NOT colour the submit button

`tokens.css` and `apps/tracy-web/src/lib/page-shell.js` both pin `--primary`/`--ring` =
`oklch(0.588 0.136 37.4)` (`#bf5b3d`): Akemi decided terracotta is the primary of the whole system (#81),
Tracy blue `#5b8def` is retired. It does not follow `--dsw-alias-brand-primary` because following the alias would mean **Tracy's
buttons change brand with the dsh skin**.

⚠ On pages tracy-web draws itself, the main submit button (`Continue with email`, `Verify`) **keeps the
`--foreground` background**, not terracotta — Akemi 14/09: the brand colour is only for what truly matters; here
terracotta only shows in the focus ring, `accent-color` and places that read `--primary`.

⚠ The identity changed on 02/09/2026: the orange arc mark `#F5821F` was retired, replaced by a terracotta
starburst. Seeing `#F5821F` anywhere in code means seeing a leftover — the standard set is in
[`docs/design/brand/`](../design/brand/README.txt).

### `--input` is a BORDER colour, not a background

In this system `--input` maps to `--dsw-alias-border-l2`. Using it as an input's `background` gives
a light grey box that looks "about right" in the light theme and plainly wrong in the dark theme. The input background is
`--background`.

### `--muted` is a BACKGROUND, `--muted-foreground` is TEXT

Two different things. Setting `color:var(--muted)` for secondary text gives nearly invisible text — the same colour as the background.

### State variables have no `-bg` / `-border` versions

`tokens.css` only has `--destructive` and `--success`. The light background and border of an error/success block are
mixed on the spot:

```css
background: color-mix(in oklab, var(--destructive) 10%, var(--background));
border-color: color-mix(in oklab, var(--destructive) 30%, var(--background));
```

Mixed like that, it is right in both themes by itself, because both inputs change with the theme.

## Body font: General Sans, Be Vietnam Pro for Vietnamese only

The page shell's body text is **General Sans** (fontshare), hero titles are **Newsreader** (Google
Fonts). General Sans **stacks Vietnamese diacritics wrongly**: "cần" comes out as "cân", "Mỗi" as "Môĩ", "số"
as "sô ́" — the tone mark falls off letters that already carry a circumflex. Akemi decided 03/10/2026: **only Vietnamese** switches the body
text to **Be Vietnam Pro** (Google Fonts, 300–600); the other seven languages keep General Sans,
Newsreader stays the same in every language.

- `pageShell()` knows `htmlLang`, so `vi` pages **load only** Be Vietnam Pro (no fontshare),
  other pages load only General Sans — the function `bodyFontLinks()`.
- The CSS rule is `:lang(vi) body, button, input, select`, placed right after `body`. `input.otp-slot`
  (mono) comes after with the same specificity, so it still wins.
- ⚠ When changing the body font later, **check a Vietnamese sentence with stacked diacritics** ("cần", "Mỗi", "số") before
  deciding — no gate catches this bug, only a human eye.

## Dark theme

`@media (prefers-color-scheme:dark)` is **the only usable signal**. Worker pages have no
script and no theme cookie, so there is nowhere to remember the user's choice.

Unlike `tokens.css`, which switches to dark through `[data-ds-dark-theme]` — that signal is set by dsh, and
a Worker has no dsh.

## Two dsh names the page shell DECLARES but does not USE (the desktop app on Windows, 10/10/2026)

The desktop app on Windows hides the title bar, and the three system buttons float in the page's top-right corner
(`titleBarOverlay`). dsh's preload colours those three buttons with colours it measures from exactly two names,
`--dsw-specific-sidebar-fill` and `--dsw-alias-label-primary`. The page shell declares those two names as
`var(--background)` / `var(--foreground)` so the system buttons carry the page's colours. This is **an output**
for the app, not an exception to Rule 2: no CSS rule of the page shell reads them. Without them,
dsh measures a transparent background, and on a theme change the three buttons keep the old glyph colour — nearly invisible (measured on a VM).

For the same reason, `body::before` is the window drag strip and `body` gets extra top padding — both take their size only
from `env(titlebar-area-*)` with a `0px` fallback, so in the browser and the Mac app the page is exactly as before (measured:
a 0-byte screenshot difference). The detailed reasons are in the docblock at the top of `page-shell.js`.

## Why it cannot be automated

There is no build step between `tokens.css` and a Worker's HTML to copy values across. Generating CSS at
build time would need a build step for `workers/`, while `workers/README.md` deliberately keeps them as plain
JavaScript deployed directly.

So **this contract is kept by hand**, and that is why it must be written down. When `tokens.css` changes a value,
the table above must change with it — no gate catches that.

## Where the contract is implemented

`apps/tracy-web/src/lib/page-shell.js`, the function `pageShell()` — the shared shell of every HTML page
`tracy-web` returns itself: `/login` and the device confirmation page (`identity/pages.js`), the team, join-request
and invitation pages (`seats/pages.js`), the notice pages of customer sites (`bar/pages.js`). Changing it there
changes them all. (Before 16/09/2026 this was `page()` in the fleet-bar Worker's `pages.js`, a tree since
deleted.)
