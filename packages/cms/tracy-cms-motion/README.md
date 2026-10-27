# @tracy/cms-motion — the motion library both CMS themes ship

One source, three destinations. `src/runtime.mjs` is the whole runtime; `src/base.css` plus one
`src/effects/<id>.css` per catalogue entry are the whole stylesheet. `scripts/build.mjs` bundles and
minifies them into `tracy-motion.js` and `tracy-motion.css` and writes each file byte-identically
into both theme packages, writes the head-marker partial into each theme, and writes
`src/text.generated.ts` back into this package; `--check` is a gate (`cms-motion`), so a stale copy
anywhere is red.

| Target | Where it lands |
|---|---|
| WordPress | `tracy-wordpress-theme/src/tracy/assets/js/tracy-motion.js`, `…/assets/css/tracy-motion.css`, `…/inc/motion-head.php` |
| Joomla | `tracy-joomla-template/src/tpl_tracy/media/js/tracy-motion.js`, `…/media/css/tracy-motion.css`, `…/motion-head.php` |
| Library | `src/text.generated.ts` |

The seven generated files are committed, so a stale one is invisible in review: the diff shows
nothing and the site quietly runs last week's library. The gate compares all seven against the
source, and compares line 1 of the emitted JS — `// tracy-motion <version>` — which is the only
place a live site says which library it holds. The version rides in an esbuild banner because a
banner is not minified.

## The catalogue

`catalog.mjs` is the single source of the version integer, the seven frozen slots and the effect
records. A slot is a trigger plus a target; `hero-entrance` and `section-reveal` are the two with a
runtime in v1, `element-reveal`, `carousel` and `loop` were added in v2.
An effect declaring a `since` ahead of the version, filed under a slot that does not exist, or
missing the `css props written` field the gate reads, stops the build and is named.

The build also reads every stylesheet it is about to emit — the base sheet and every effect's — and
refuses three things in all of them: a property outside `transform`, `opacity`, `filter`,
`translate`, `scale`, `rotate` (the properties that drive an effect rather than paint it —
`animation`, `transition` and their longhands, and `will-change` — stand outside the list); a
variable the library does not own, read or declared, since only `--tracy-motion-*` is its own; and
an `@import`, which would either pull a sheet the gate never read into the emitted file or leave the
visitor's browser fetching a third party's CSS. One thing more is asked of an effect alone: a record
whose `css props written` disagrees with the properties its CSS actually writes is the library lying
about itself to the gallery, and the base sheet has no record to disagree with. `test/fixtures/`
holds two effects that exist only to be refused — `hero-type-reveal` on the property list,
`gradient-flow` on the variable ban. A gate that has never refused anything has not been tested.

| Effect | Slot | What it does |
|---|---|---|
| `hero-stagger` | `hero-entrance` | on load the hero's units arrive one after another in document order |
| `fade-up` | `section-reveal` | as a section below the hero scrolls into view, its units rise slightly and fade in, once |
| `reveal` (v2) | `element-reveal` | each element carrying `tracy-motion-reveal` fades in from its own direction (`--fade-left`, `--fade-right`, `--flip-up`; up by default) after its own delay (`tracy-motion-delay-1…8`, 100 ms a step) the first time it meets the viewport; option `minWidth` shows them at once on narrower screens |
| `carousel-step` (v2) | `carousel` | a `tracy-motion-carousel` steps its track one slide at a time from `.tracy-motion-prev/.tracy-motion-next` in its section (or buttons it draws for `--nav`), dots (`--dots`), arrow keys or a swipe, and wraps round; nothing moves on its own; it runs under reduced motion too, without the slide |
| `pulse` (v2) | `loop` | the `::before`/`::after` rings of a `tracy-motion-pulse` element swell and fade forever, the second 600 ms behind |

The three version-2 slots are **opt-in by markup**: they touch only elements carrying their class,
which a block's author sets, so a page without those classes runs exactly as under version 1
(`test/runtime.test.mjs`). The carousel writes no layout — the theme lays slides out in a row inside
`.tracy-motion-track` and clips it under `.tracy-motion-carousel-step` — and the runtime moves the
track through the Web Animations API, never an inline style. It adds its own controls only when the
markup asks (`--dots`, `--nav` without markup buttons), labelled from `TracyMotion.labels`.

Every effect ships two intensities, `subtle` (the default) and `bold`. Both live in the effect's
stylesheet, as `--tracy-motion-*` variables under the one frozen prefix; nothing about an intensity
is hard-coded in JS.

## The generated module and the head-marker partial

`src/text.generated.ts` exports `css`, `js` (the emitted bytes byte-for-byte, banner included),
`version`, `headSnippet` and `catalog` — keyed by effect id, with each slot's gallery label and
order. It is how the desk plugin reads the library's text: an ordinary import, never a theme package
at run time. What reaches the browser is `id` and `slot` only; `since`, `css props written`,
`sample html`, `description`, the gallery label and the order stay in the module.

The head-marker partial is one `<script>` element and nothing else — the same bytes in both themes
and in `headSnippet`. It sets `html.tracy-motion` synchronously, only under
`prefers-reduced-motion: no-preference`, and takes it off again after ~3 s unless the runtime has
started. Wiring it into each theme is the themes' own code.

## What the runtime does on a customer's page

The generated head-marker partial sets `tracy-motion` on `<html>` synchronously in `<head>` for a
visitor who has not asked for less motion, and takes it off again after ~3 s unless the runtime has
started; the base sheet hides outermost sections on that marker alone, so nothing is seen sitting
still before it moves. The runtime then:

1. reads `window.TracyMotion = { effects: [ { id, v, intensity } ] }`, its one global — an unknown id
   is ignored without a word, and `v` is never read;
2. takes the root marker off and stops when there is no config or on `prefers-reduced-motion: reduce`,
   so the page is never left blank — and only once it has taken the page over does it tell the
   head-marker valve to stand down;
3. gives the first outermost `<section>` in `<main>` to the `hero-entrance` effect and every other
   one to the `section-reveal` effect, which plays a section the first time any part of it meets the
   viewport and then stops watching it; either way it walks a section down to its units — a heading,
   paragraph, image or button-like element, or a group of three or more identical siblings — and
   stops there;
4. adds the effect class, then gives each unit its delay by index through the Web Animations API,
   eight rungs with everything past the eighth sharing the last;
5. cleans up when the animations finish: the effect classes come off and one `tracy-motion-done`
   marker stays, which is what lets the base sheet show the section again.

The delay is set on the animation, never on the markup: no attribute, no inline style. `:nth-child()`
cannot do this job — a real hero puts its copy in one column and its image in another, and
`:nth-child()` counts among siblings only.

A section whose slot carries no effect is marked done straight away, so nothing stays hidden waiting
for a trigger that cannot fire. A `section-reveal` section is marked done when its own animations
finish, which is why it stays hidden until it is scrolled to.

## Adding an effect

Write `src/effects/<id>.css` and add the record to `EFFECTS` in `catalog.mjs`. The id is bare
kebab-case, unique library-wide, and never reused: every name the library writes into a page derives
from it under the one prefix `tracy-motion-` (keyframes `tracy-motion-<id>`, class
`.tracy-motion-<id>`). Give it the `since` of the release it arrives in. `VERSION` moves when that
release goes out, not when you build: an effect added inside a version that has not gone out yet is
`since` that same version, and the integer stays put.

```
pnpm --filter @tracy/cms-motion build     # write into both themes and this package
pnpm --filter @tracy/cms-motion check     # exit 1 when any generated file is stale
pnpm --filter @tracy/cms-motion test
```

Run the two theme builds afterwards to refresh their zips.
