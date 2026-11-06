# Design system

Read ../AGENTS.md first. The layout, type scale and spacing are Tracy Base's (the OpenDesign "apple"
language as the source Joomla theme implements it, measured in `tasks/emdash-tracy-base/visual-contract.md`,
TCH); the colours and the faces are the coffee shop's own, after the Scrolltide "coffee" reference.

## Tokens — `src/styles/tokens.css`

Tailwind v4 `@theme` tokens, the cream side on `:root`, the espresso side under `html[data-theme="dark"]`:

- surfaces `--color-bg` (milky cream #f6eee2 / espresso #1f150e), `--color-surface` (#ece1cf / #35261b),
  `--color-surface-warm`;
- text `--color-fg` (dark brown #2b1c12 / cream #f1e6d6), `--color-fg-2`, `--color-fg-muted`,
  `--color-fg-meta`; lines `--color-line`, `--color-line-soft`;
- the single accent `--color-accent`, moss green (#4f6342 / #9bb083), with `-on`, `-hover`, `-active`,
  `-tint`; a roasted-gold `--color-kicker`; `--color-success/warn/danger`; the deep-roast "scene" pair;
- every colour is the fallback of a design-system role (`var(--ds-c-*, …)`): a worn system replaces it;
- shadcn semantic names mapped onto those (`--color-primary` = accent, `--color-muted` = surface…);
- type scale 12/14/17/21/28/40/56/80, body 1.47, display tracking −0.015em; radii 8/12/18/32 and the
  980px capsule; ring/raised/focus shadows; container 1024 + gutters 22/18/16; band rhythm 100/64/40.

Use the Tailwind names (`text-fg-muted`, `bg-surface`, `border-line-soft`, `text-accent`,
`bg-accent`, `text-accent-on`, `rounded-[12px]`). Do not add colours in components.

## Shared classes — `src/styles/global.css`

`.wrap` (container), `.band` (vertical rhythm), `.eyebrow`, `.eyebrow-badge`, headings `.h-hero
.h-page .h-article .h-section .h-card .h-card-sm`, `.lead`, `.section-head[--left]`, buttons `.btn
.btn-primary .btn-secondary .btn-ghost .btn-on-accent .btn-sm .btn-xs`, `.card`, `.chip`,
`.chip-outline`, `.meta`, `.photo-frame`, grids `.grid-3 .grid-4 .card-grid`, `.prose-article`,
`.band-accent` (+ `.on-accent-muted/-soft`), `.nav-link`, `.footer-title/-link`, `.sketch`.
`global.css` is imported by `src/layouts/Base.astro` only; the admin never receives it.

## Theme

The site opens on the espresso side (`html[data-theme="dark"]`) whatever the OS prefers. Before first
paint the visitor's own choice (`localStorage['tracy-coffee-theme']`) or `?theme=dark|light` (one framed
load, not stored) wins; a worn design system opens on its own side. The toggle
(`[data-tracy-theme-toggle]`, in `Header.astro`) switches to the cream side and remembers it. A chosen cream
side is written as `data-theme="light"` (no attribute is the espresso default), which is what the QA theme hook
(`template.config.json` `qa.theme`) stores and reads back; the CSS keys on `"dark"` only.

## Fonts

Three web fonts from Google, listed in `src/fonts.json` and printed by `<Font>` in `Base.astro`:
Playfair Display (600, 700) for every heading and the dish names (`--font-display`), Manrope (400, 500,
600) for body text, buttons and labels (`--font-sans`), Bricolage Grotesque (weight 750, narrowed to
`wdth` 78, `opsz` 48; its width and optical-size axes are asked for in `variableAxis`) for the shop name in
the header logo only (`--font-bricolage`, `Logo.astro`). The logo's mark is a tilted coffee bean with a carved
groove and three embers, drawn in `currentColor`; `public/favicon.svg` is the same mark, dark brown on a light
tab and cream on a dark one. A logo the owner uploads replaces the mark as before. Each is also cut in the Vietnamese subset
(`src/lib/font-subsets.mjs`); only the `latin` files are preloaded. A worn design system replaces Playfair Display
and Manrope through `--ds-font-display` / `--ds-font-body`; the shop name in the header logo keeps Bricolage
Grotesque under every design system. The shop name printed on the cup keeps its own fixed
face (`src/lib/cup-scene.mjs`).

## Components and interaction

Section components are Astro (`src/components/sections/`), driven by fields; React islands only
where the page needs script: `MegaMenu` (Radix popover, hover + click, Escape closes), `MobileNav`
(drawer under `lg`). The home page cup is the one three.js island (`CupStage.astro`, see
`docs/object-template.md`).
Images go through `Photo.astro` (`photo-frame`, cover) or `BodyImage.astro` inside Portable Text; the
cup stage draws its still image with a plain `<img>` because the route is chosen in the browser.

Ten coffee tools decorate empty corners. On the home page: beans and an espresso machine either side of
the shop name (section 1), a roaster under the story (2), green beans, a bowl of roasted beans, a pour-over
and a café table in the margin beside the four reasons (3, from 1360 px; a large faded number 1–4 sits behind
each reason at every width), a spoon by the featured title (5), a kettle by the visit card (6); on the menu
page a moka pot. They are pictures of the template (`src/assets/decor/`, drawn as `how-drawn.md` there),
placed by `Decor.astro`, not content: no admin field, no role, no tint from a worn design system, skipped by
screen readers. `src/lib/decor-motion.mjs` brings them alive: each flies in when its corner first scrolls
into view, floats, drifts a little against the scroll, steps aside from a mouse that comes near and reacts
to a click or a tap (beans burst out and drift back, a machine puffs steam, a kettle tips, a table rocks).
For a reader who turned motion off they stand still and take no pointer. Phones show the kettle only.
The featured cards and the menu items lift and lean their photo in under the mouse (not the card the cup
stands in: the cup is drawn where that card is). `tests/browser/cup-stage.mjs` measures, at 1440, 1024, 848
and 390 px, that no tool comes within its reach (`REACH`) of text, a button, a photo or the cup and that a
click on every button and link still lands on it; move one by its class in the page's `<style>`, then
re-run it.

## Changing the look

Change a token, not a component, for colour/spacing; add a variant prop to a section component
rather than copying it; keep every page inside `.wrap` and every band on `.band`. Re-run
`tools/shoot.mjs` at 1440/390 × light/dark and look at the screens before calling it done.
