# Visual QA — four axes, five lenses, a note is a todo (Phase 8b)

> **Packet Phase 8b.** Read before running `scripts/visual/*` and before concluding "matches the source". The standard
> is carried over from the EmDash skill (`tracy-emdash-template`: `visual-review-method.md`, `qa-contract.md`,
> `qa-lenses.md`) to WordPress: same four axes, same tier rule, same note format; the difference is the adapter — the contract
> is generated from spec-pack + theme, parity is measured **by words** against the rendered source, and WordPress's own gates stay as they are
> (editability, content parity/seed, Theme Check, packaging, clean-install, quickstart).

## Four axes, four tiers, fixed order

```
light-desktop (1440) → light-responsive (390) → dark-desktop (1440) → dark-responsive (390)
```

No tier named: a later tier runs only when the previous one is **clean**. **Named** tiers (`--stage a,b`, `--all-stages`) all run,
at most `--tier-concurrency N` tiers at once (each tier `--concurrency M` page jobs, each job one browser context) —
a fix round grades every tier at once (section Rolling fix round); the report is identical to a sequential run. Each axis
has three checks: **A** pictures (the site, and the source rendered at the same size — only when a lens consumes them, `visual.shots`), **B**
the real pointer (hover does not make the box jump — only elements the page **shows** at rest; links in a closed mega panel, a closed drawer,
faded/clipped elements are not hovered but counted apart in `scans.hover.hidden`; mega travel `review/mega-hover`, every header
panel captured open on both sides and compared — §Header menus captured open, Escape returns focus, toggle), **C**
computed px (page identity, overflow, observed theme, **the font actually drawing the glyphs** (CDP
`getPlatformFontsForNode` — the computed `font-family` string says what was asked for, not what was drawn; the
typography lens on 14/09 saw Newsreader/Archivo fall back to Times/system-ui while the machine measured "correct"), **parity by
words** against the source, coverage → `unclassified-element`, count of decoded pictures, dark scanners: white-surface · dark-on-dark · contrast ·
bright-border · seam). `examined-too-few` compares a census of the same kind on the site page and the source page: visible text places, pictures and controls, each element once; carousel clones, sr-only and closed panels are skipped. A source that was read but whose census is empty is still zero; only when the source was not read is the absolute floor of 20 used. `axis.examined` is still the coverage snapshot; the census is a separate number for the floor.

## Parity by words — no hand-written expectations

### A page built from a brief (`reference.kind: none`)

A page with no source keeps `referenceKind: "none"` in the contract. Comparisons that need a source are recorded one by one in `axis.notApplicable` with `status: "not-applicable"` and the reason `reference.kind=none`; the report and the verdict count these apart, not added to pass or measured. The runner still runs every target-side check, including overflow, broken pictures, dark mode and opening/capturing menus; the menu is captured on the target side, and the menu comparison is recorded not-applicable. A missing source on an `html` or `url` page still fails the axis.

Interaction parity keeps the full case grid for `none` pages: paired source comparisons are typed `not-applicable` against the contract-bound `referenceKind`, while target menu contrast, touch target and theme-toggle checks still run. Preflight records source-side obligations as `not-applicable`; target status, layout controls and dark-mode checks remain live. Site sweep records each source comparison as typed `not-applicable` while checking its defined target invariants. Round always runs the sweep, and first/patch release validates every scheduled target outcome and source applicability entry against the spec binding.

Each content element shown on the site (`design.coverage`) is looked up by **the same words** on the rendered source page
(`spec/reference/rendered/<slug>--1440-light.html`, written by `from-html`). Words repeated on the source (the header button and
the CTA band button both "Request a quote", a nav link and the ink band button both "Services") are matched by **position**:
the site is read in order, words with only ONE place on the source are anchors, repeated words take the first place after the anchor **and before the next
anchor** (the same stretch of page on both sides) with the same tag; only when no place is left in that stretch are all places after the anchor considered (six
"Apply →" take six rows in order; the "Learn more" card link — `a` on the site, `div.feature-link` on the source — takes the place in
its own card, not the `a.btn` button with the same words three sections below: gotcha 61). **One place on the site is also one place**: an
element inside an element with the same words (`p.jv-card__link > a`, both in coverage) pairs with the exact source place of the
outer element, it does not take one more source place; the source's breadcrumb row (an anonymous div: links + `/` separators, no
heading) is not looked up — chrome on both sides. **Words are the words a reader sees**: a span meant only for screen readers
(`.screen-reader-text` — a 1 px absolute clipped box, like `Learn more<span …>: Database Security</span>` of
`core/read-more`) is not part of the words on either side (JA Vega ld-0: 18 unclassified). **Words drawn in no ink are no
words** (#27 item 1): a text node is read in the style of the element holding it — at `font-size: 0`, or in a
transparent fill with no stroke, no shadow and no `background-clip: text` above it, it is no part of the words on
either side (an icon link keeping "Play the video" for screen readers: two `unclassified-element` a tier on JA Vega
/about-us). A child that sets a size again, and gradient words, are words; the contrast and dark-text scans skip
0 px words the same way. **The same side of the chrome line first** (#27 item 5): both sides record whether an
element sits in chrome — a navigation landmark (`nav`, `role=navigation|banner|contentinfo`) or the page's own
`header`/`footer` (not one inside `article`/`aside`/`main`/`nav`/`section`) — and a repeated label picks among the
source places on its own side, and is an anchor when it has one place there. The site's masthead h1 "Contact Us"
pairs with the source's masthead h3, not the header button that says it first (a `parity-mismatch` every tier on
JA Vega /contact). A source that writes its chrome as anonymous divs, or says the words only in its header, keeps
every place a candidate, as before. Classes never make chrome. **The element that draws the words**: within
one place, the text properties (`color`, `font-*`, `line-height`, `text-transform`, `letter-spacing`) are read on the
**deepest** element carrying the same words, the background on the deepest element **that paints a background** (none: the chosen element) — the site
the same way, along the single inline child chain with the same words. A source `h3 > span` 12 px pill compares with the theme's 12 px
`h3.pill`; an `<a>` button painting a background around a bare `<span>` keeps the `<a>`'s background (JA Vega: 16 findings h3 32 px ↔ pill 12 px every run).
Compare `color · background-color · font-family · font-size · font-weight · line-height · text-transform ·
letter-spacing` with a tolerance of ±8/255 per channel, ±1 px. Words not on the source → `unclassified-element`
(a pattern inventing words, or the source changed). This measures both `core/html` sections and patterns, and needs no
hand-written `design.rules` (rules only for chrome when needed). The Northgate run on 14/09: 34 pages × 1 axis = 777
components, 828 findings; four token/CSS fixes (text grey, paper on the ink band, figure size, post heading) → 713.

## Contract — one canonical per site (invariant 11)

```
node scripts/visual/contract.mjs init --run-root tasks/<site> --spec tasks/<site>/spec --config tasks/<site>/review.config.json \
  --theme packages/cms/tracy-wordpress-theme/overlays/<slug> --routes <seed report> --artifact dist/<slug>-<v>.zip \
  --site http://127.0.0.1:<port> --built-theme packages/cms/tracy-wordpress-theme/src/<slug>
node scripts/visual/contract.mjs --run-root tasks/<site> --spec … --routes … --artifact … [--built-theme …]   # validate + stale
```

**Two kinds of dossier, one canonical each.** The site's dossier (the main stand) holds the contract of the whole site — the only thing `round.mjs` (integration checkpoint) and
`release.mjs` read. A page group's dossier (the group's own stand) holds the contract **of the group**:
`contract.mjs init --run-root <group dossier> … --group <g> --pages /a,/b` — only the group's pages, bound (`bindings`) to the stand, seed report, build zip
and spec of the group ITSELF; `group.id` and `group.dossier` (the group dossier — the contract is canonical only there; a copy or an `attempts/` file is not) are in the contract and in `identity.group` of every report. `group-verdict.mjs --group` reads it; the site's contract or
another group's is `incomplete`; `round.mjs` and `release.mjs` refuse a group contract. Never narrow the site's contract with `--pages`.

Generated from spec-pack + theme: `variants` (4), `visual.stages` (4), `visual.shots` (who looks at which picture at which tier),
`design.theme` (from `review.config.json`), `layouts` (view × **the WordPress template that actually serves** the page, the representative
page is the layout's first page in the default locale — see below), `pages` (the **real** path after seed — Polylang translations, the redirect of a
single view), `design.parity.pairs` (from `metadata.name` + classes in the pattern), `coverage`, `images`,
`exceptions` (valid only with a quotable `decision` — G-number/D-number). `bindings` records the hash of spec-pack,
page-map, seed report, artifact; a mismatch is **stale** → the runner refuses, the release refuses. A trial run →
`--attempt <id>` into `attempts/`, never a gate.

**The site's decisions are not typed into the contract.** `init` replaces the canonical contract (the old one goes to `attempts/superseded-…`),
so an `exceptions[]` typed by hand into the contract is lost at the next `init` (lost on 15/09). They live in the dossier's
`review.config.json` and `init` copies them over every time:

```json
"search": { "en": "pre-engineered+building", "ru": "…" },          // search view measured with the query ?s=<term>, at the path where the site serves the ported view (see below)
"visual": {
  "rules":      [ { "id": "…", "selector": "…", "source": "…", "styles": { "<variant>": {…} } } ],
  "exceptions": [ { "kind": "examined-too-few", "match": "en-slide", "reason": "…", "decision": "DECISIONS.md D24.1" } ],
  "coverageExclude": [ ".tracy-aside *" ]                            // joined as :not(...) onto the coverage selector
}
```

An exception can add `scope` to limit exactly where the finding is accepted. Different dimensions
combine with **AND**; several values in one list combine with **OR**. `pages` are page ids, `routes` are
exact paths, `axes` are variant ids, `selector` and `text` match the finding's structured subject,
and `properties` must cover **every** CSS property that drifts. A scope needs `pages` or `routes`; a kind
tied to an element/style also needs `selector` or `text`. `match` may be omitted when there is a `scope`; if it is still present,
it must match too.

```json
{
  "kind": "parity-mismatch",
  "key": "Foundation title",
  "reason": "The approved heading size applies on the article page at desktop light.",
  "decision": "D-14",
  "scope": {
    "pages": ["en-about"],
    "routes": ["/about/"],
    "axes": ["1440-light"],
    "selector": "h1",
    "text": "Foundation title",
    "properties": ["font-size"]
  }
}
```

Old rows without `scope` keep the current regex behaviour. A scope takes effect only when the run has bound and
verified `DECISIONS.md`; an unbound direct caller can still use legacy rows, but no
finding is accepted through a row with `scope`.

**A page's section is a type, not a module id.** `page-map.json` records the source's module id (`111`); the contract's `pages[].sections`
are section types — the keys of `patterns.map.json` (`hero:style-1`, `sectionType` of a custom module). `init` turns id → type once
through the dossier's `sections.json`, then `pattern-registry`, `visual-qa` (page hash), `fast-gate` and `affected` read that same list. An id
that `sections.json` does not have (or has without a type) goes to `pending` with the page and the id — it blocks the contract, it is not silently dropped and not
looked up as a type. A module on no page with a null `sectionType` is harmless. A page-map that already records `type:style` keys still works.
No id alias is needed in the patterns map.

**Where the search view is measured.** The measured path of the search view is the path where the site serves the ported view: the `--pairs` pair (`to`), the seed report's route,
then the page-map path (the theme serves the view at the source's own path, `views.search.servedAtPath`), plus `?s=<term>` from `search` above.
Only when the seed report records a **redirect** (`/search` → the locale root, WordPress's native search) is it measured at the redirect target (`/?s=<term>`).
That is *one* path for the contract, the template probe, the route plan, the parity pair and the group's verdict; the query is part of the route identity
(`lib/route-index.mjs`) so the search page and the home page of the same locale/group do not collide, and asking by the page-map path or by the measured path both return the right
page. Evidence on the home page or for another term cannot close the search page. A search view with no term is still a validation error.

**Mega menu** also comes from `review.config.json`: `"mega": { "items": ".jv-mega", "trigger": ".jv-mega__trigger",
"panel": ".jv-mega__panel" }` (missing → Tracy's `.tracy-mega`; `false` → no `mega` state). `init` writes it
to `interactions.mega`; the runner walks exactly those selectors (`mega-hover --items/--trigger/--panel`). A `--mega-items`
different from the contract → the runner refuses — the contract saying one thing and the run measuring another is the JA Vega M4 bug (the contract hard-coded
`.tracy-mega__*`). An old contract with no `items` takes `--mega-items`, default `.tracy-mega`. A mega walk that does not
pass (exit ≠ 0, timeout, or a missing summary line) gives a `mega-menu` finding that **always** carries the exit and the tail of stderr, even when the child
printed a FAIL row or "0 FAIL" before exiting ≠ 0; the exit part is not cut by the 900-character limit — no more `output: ""`.
Of stderr, the finding keeps the **first line** (the error message) and the last lines, cutting the stack in the middle (`… ⏎`) — a stack longer than
six lines does not push out "Execution context was destroyed".
A walk that reports `NO ITEMS` on a page **whose contract declares an error status** (404…; a 2xx page always owes its header) where **the source has no header and neither side's header has any menu to open** (census
`headers`/`triggers` of the open-state axis; on the dark axis of a source with no dark of its own — `source.darkDerived` — the site census on
that axis and the source census in light, only when that declaration stands — see below) owes no walk: `axis.scans.mega` records `ok`, `notOwed` (the reason) and `evidence` (the two censuses),
with no finding (JA Restaurant S-31: the T3 error page draws no header). An undeclared framework (T4 assumed), a source with a header, or
a trigger on one side → the `mega-menu` finding stays.

**Interaction parity (`interaction.json`) is part of every run.** `visual/interaction-parity.mjs` measures what a person does —
drawer submenus (every parent the source opens must open on the site and show its children at 390/768 in both themes),
tablet taps, the dark toggle, carousels, forms (required controls, submit state, disabled look), and the header at 390/768/992/1024/1180/1280/1440
(geometry within 2 px, visibility and label lines per tier, the current section on single items).
**Its findings are advisory, not a verdict:** they are listed in `notes/advisory.md` (one row per cause; `visual.json` `interaction.advisory`),
are not machine rows or todos, are never counted as blocking findings, and never make a round, checkpoint, Fast Gate, group verdict or release exit
non-zero — because its pairing is verified on one port only. What would lift it back to a verdict: every finding of a second port classified.
A probe that crashed or did not run, a state it could not measure (`notMeasured`) and a probe that read nothing stay blocking and stay in
`notes/machine.md`; the finish audit refuses a record with an unmeasured state, never one with only findings. **The record attests what it measured**
(`interaction-parity/7`): `coverage` is one row per case — check × route × width × theme — with `measured`, `tiers` is what the run was
configured with, `origins` the site and the source it compared, `chromePages` the page(s) that read the shared header. A consumer holds it to
`interactionAttestationProblems` (`interaction-report.mjs`): every owed case has exactly one row and it is measured (a state past the time
budget, on a side with no source, or that errored is a row with `measured:false`, never dropped), the tiers are the tool's (a narrowed width or
theme list is refused), the origins are the consumer's own. The Fast Gate verdict, the group verdict and the release read it through the
finish audit receipt (`SKILL.md` §Done rule 4). The record also lists every source drawer parent and form as an obligation with a stable id derived
from route, tier and source selector/index; every obligation has exactly one `ok`, `finding` or `notMeasured` outcome. Every drawer/form case has a
discovery row with `complete` and `count`; the count must match its obligations, and a discovery cut short by the state cap or time budget is
incomplete. An empty obligation list passes only with a complete discovery of zero. `interactionAttestationProblems` checks these rows, and
`visual.json` reports that attestation result instead of the probe's claim. Older versions are refused with a remeasure message.

For a contract page bound to `reference.kind: none`, every paired case remains in `coverage` with
`status: "not-applicable"` and reason `reference.kind=none`. Target measurements are still required; the attestation derives the exemption
from the bound contract and refuses an N/A row for `html` or `url` pages.

**Pairing rules — by what a visitor meets, not by name** (`lib/control-pairing.mjs`; the names of a port's controls legitimately differ from the source's).
A control pairs by role, landmark, place/order and shape; the name only breaks a tie. In practice: (1) a small button beside a link that has words (or
whose `aria-controls` panel sits in the same wrapper) is that link's submenu disclosure, never the menu button — whatever it is called ("Show the Our
Services menu"); an icon-only three-bar button is the menu button; a role one side has and the other lacks pairs with the only unrecognised control of
the same shape on the same edge. (2) Menu items are list items **or** link-and-chevron wrappers; drawer parents pair by name, then by the rows beneath
them, then by elimination; touch controls pair by name, then by order. (3) The current section is read on each side on its own (`aria-current`, the menu
system's class, a look its siblings do not share) and then compared; a finding only when one side marks one and the other does not, or they mark
different ones (same words, same page or same place in the row = same). (4) Forms pair by shared controls, else by purpose (the same kinds of visible
field; landmark and order break ties), fields by label, else by kind; a required control the paired site field lacks stays `form-missing-required`.
(5) Drawer and tap findings come from the opened state (the real click or tap), so a drawer that opens on both sides is not `missing`; row lists and back
rows inside it are still compared (a back row drawn under the open level is not a second back row). (6) A form the tool cannot drive (a script that
navigates, a reload) is read as a submit when the navigation goes to the form's own address, else `notMeasured` with the reason — never a crash.
`interaction.json` keeps every raw row and adds `groups` (a view; the visual.json claim is unchanged): one entry per cause (kind + control/state/form) with its routes, widths and themes, which is
what the advisory list shows; `coverage` and the owed-cases attestation are unchanged.

**An interaction that could not be measured is measured once more** (#27 item 3). Under load the same unchanged
header gave `scan:hover-not-measured` "the pointer could not reach it" on different pages in two runs, and a mega
walk FAILed on one page, then on another. So a hover target that was not measured (rest not settled, pointer could
not reach it, hover not settled, page scrolled) is measured again from rest — pointer parked, rest box, hover and
second read again (`hoverTarget`) — and a mega walk that ran to its summary and FAILed is walked again (`walkMega`).
Only the second answer counts; every attempt is kept (`attempts` on the finding and on `scans.mega`,
`scans.hover.retried`). A jump measured on the first attempt is never re-rolled; a walk killed at its timeout, or
one that died before its summary, is not retried. No attempt sleeps. **Motion state is no part of a label**: the
runtime's `tracy-motion-on|in|bold|done` leave element labels before they are cut (`a.jv-play__button.tracy-motion-pulse`
in every run, not `…tracy-motion-on` in one and without it in the next — a closed plus a new finding). The same
holds for the bright-border chain (the element and three ancestors printed in the finding), which is its identity
across rounds.

**Selector profile of the source framework** (#66, `scripts/lib/framework-selectors.mjs`). Which elements are a
page's content regions, its chrome, its section bands, its identity, and which header controls are triggers depends
on the framework the source was built on; T4's lists read nothing of a T3 source (JA Morgan: 4 of 15 headings
paired, `.t3-topbar`/`.t3-off-canvas` read as content, no header trigger at 390, `main` on 0 of 22 pages). One
profile per framework — `T4` (the lists before #66, unchanged), `T3` (Bootstrap 3), `generic` (HTML landmarks and
ARIA roles only) — is read by layout-boxes, parity-extract/http-parity, menu-open/visual-qa, the preflight's layout
probe and the design contract's page identity. The framework is the inventory classifier's result, never read
from the page: the Joomla adapter records it at provenance.json `source.template.css.framework`, `contract.mjs
init` copies it to `source.framework`, visual-qa and layout-boxes `--contract` read it there, `--provenance`/
`--framework` name it on layout-boxes and http-parity, and the preflight passes the contract's to both. A
classification with no profile (Gavick, Helix, other, conflict, unknown) or metadata that is missing or not a
name reads `generic` and every report says so (`selectors.gap`; VISUAL.md, layout-boxes.md, http-parity's
stderr); a tool given no framework at all keeps the T4 lists, `assumed`, and says that too. Every profile keeps
the WordPress landmarks, so the site side is read the same way under each. The profile's key is in the page hash
and the http-parity cache key: another framework is another measurement. A layout-boxes route where a side
shows no heading the profile reads is listed `unmeasured` and exits 1. Limits: T3 regions are T3's class names
(`.t3-mainbody`, `.t3-section`, …) — a template that renames them reads through `main` and h1/h2 only; a
Bootstrap 3 collapse target that is a compound selector is not resolved.

**Header menus captured open** (#50, `scripts/visual/menu-open.mjs`). A page is measured and shot at rest, and
at rest every header panel is closed: the hover scan skips what the page does not show, and the mega walk asks
whether the pointer can travel into a panel, not what the panel looks like. A mega panel drawn as an 880 px card
with 12 px headings and no icons, against the source's full-width band with 24 px headings and 40 px icons, passed
every checkpoint on JA Vega. So on every axis of every page a run measures, the header's panels are opened on
the site and on the source and compared like a page. Every page, not a layout's representative: a template does
not prove two pages draw the same header, and a run of pages that are not representatives would open none.
Evidence reused with `--reuse` counts only when it carries the menu record. Per axis:

- **Header only.** The page's own `header` or `[role=banner]`, not one inside `main`/`article`/`aside`/`footer`/
  `section`. A trigger is a control the page shows at rest whose panel it does not: `[aria-expanded]` or
  `[aria-haspopup]` with the panel its `aria-controls` names (or the submenu beside it), a toggle of the source
  framework's selector profile with the panel its own attribute names (js-offcanvas `data-offcanvas-trigger` — the
  T4 `span.t4-offcanvas-toggle`, a bare span with no aria until the script runs — or Bootstrap
  `data-bs-toggle="offcanvas"` + `data-bs-target="#id"`; on T3 also `button.off-canvas-toggle[data-nav="#id"]`, a
  drawer, and Bootstrap 3 `[data-toggle="collapse"]` whose `data-target` is `#id` or a single `.class` naming
  exactly one element — #66), or a list item that owns a nested list or panel (a hover submenu). A reference that
  names two elements, none, or something other than an id or a single class is the trigger's `problem`
  (`menu-open-not-measured`), never a guess — so is an `aria-controls` listing several ids, an id two elements
  carry, and an `aria-controls` naming another element than the toggle's own attribute; a collapse link to another page is never clicked. At 390 the burger is the trigger and its drawer the panel; the desktop
  items hidden there are not counted. A panel already shown at rest is counted apart (`openAtRest`), not opened.
  Submenus inside an opened panel, and combinations of open states, are not walked.
- **Paired by words.** A trigger's label is the words a sighted reader sees on its item — the element holding the
  control and its panel side by side (`div > a + button + div` of a mega-menu block, `li > a + ul`) — else the
  control's own visible words, else its `aria-label`, screen-reader text or `title`. On JA Vega the port's caret
  button says only "Show the Our Services menu" to a screen reader; the link beside it says "Our Services", as the
  source's T4 item does. The label is folded (typesetting, punctuation, arrows, case) and the two sides pair on it,
  never by DOM order or position: the source and the port write their headers differently. A source trigger with no
  accessible name can pair by its panel instead: the census reads the element named by `aria-controls`,
  `data-target` or `href="#id"`, or observes the panel revealed by a click when there is no direct reference. It
  compares that panel's own text and controls with site candidates in the same region (chrome for this header
  census). A panel with no text or controls has no pairing identity. Exactly one match is required; no candidate or
  several candidates leaves
  the source trigger `menu-open-unmatched`, with the reason naming the missing or ambiguous candidates. Labelled
  triggers keep word pairing, and declared pairs and the drawer keep their own paths. A label on one side only, and
  a trigger that says no words and has no usable panel match, are `menu-open-unmatched` (a cited decision may accept
  one). A label said by two triggers on one side and an `aria-controls` that names nothing are
  `menu-open-not-measured`.
- **The drawer by its markup; a declared pair by its selectors** (#56). The T4 burger says no words and
  core/navigation's says "Open the menu": by words the mobile drawer was two unmatched toggles and never compared. A
  trigger is a *drawer toggle* when it names its panel, sits in no list item, and its markup says the panel is
  off-canvas — `aria-haspopup="dialog"` (core/navigation), a `<dialog>`/`role=dialog`/`aria-modal` panel, an
  offcanvas toggle (above), or a panel `position: fixed` at rest (class names are never read). When each header has
  exactly ONE drawer toggle and their words do not already pair them, the two are one pair, `header menu
  "(off-canvas)"` (`by: "structure"`, both labels kept in `labels`). Two drawer toggles on a side are never told
  apart by position: they fall back to their words. A pair words and markup cannot make is declared in
  review.config.json `visual.menuPairs` — `[{ "site": "<selector>", "source": "<selector>", "label"?, "reason",
  "decision" }]`, copied to the contract's `design.menus.pairs` (hashed into each page) — and pairs the trigger each
  selector names (`by: "declared"`); a selector the page refuses, or one naming two triggers, is
  `menu-open-not-measured`, one naming a trigger on one side only `menu-open-unmatched`, one naming nothing on either
  side at a width nothing. Declared pairs take their triggers first, then the drawer, then words. A drawer toggle is
  clicked whatever its tag (a click is its only way open), never when it is a link that leaves the page.
- **One panel, one owner.** Two controls of one item (a link and its caret) are one trigger. Two controls elsewhere
  that open the same panel cannot say which of them the other header's trigger answers to: the panel's trigger
  carries the conflict, still counts as a drawer toggle (so it is never the side's *sole* drawer beside another),
  and its pair is `menu-open-not-measured`. A trigger two declared selectors name belongs to neither declaration:
  both are `menu-open-not-measured`, and so is a trigger whose panel cannot be named. These are judged before
  anything else — also when the other header has no counterpart or the trigger says no words — since an unmatched
  trigger can be accepted as an intentional omission and a conflict never can. A page that answers another status than it owes (2xx, or the page-map's
  declared status; a rendered export 200) is `menu-open-not-measured` for that side — a 404 page without the header
  is never read as a page with no menus. Under a declared framework (contract `source.framework`: T4, T3 or the
  generic landmarks) a side that answers 2xx with no `header`/`[role=banner]` is `menu-open-not-measured` too, and
  the axis is not measured: a header the census does not read is not a header without menus. Only a side owing an
  error status, or a run whose framework is undeclared (T4 assumed, reported as the run's selector gap), may read
  an empty census as no menus.
- **Opened for real.** A real hover; when nothing shows, a real click of the item's control — never of a link that
  leaves the page, whatever role it claims (the T4 item is `<a href="/services/" role="button">`). Nothing forces
  CSS or `aria-expanded`: a panel that opens for neither is `menu-open-not-measured`. A capture that leaves the page
  changed — another URL, a panel that will not close, a click that opened nothing — has the page loaded again
  before the next trigger.
  A **source** page whose control was reached and pressed and showed nothing — a static error/offline page with no script, or a scripted page that does not react twice — is a measured fact (`axis.menus.sourceStatic`: script count, the toggle tried, the outcome), not a finding, provided another page of the run opens the same menu on the source at the same variant. For `reference.kind: none`, the target menu is still captured; only source comparison is not-applicable. On a source-backed page, timeout, unreachable control or a site menu that does not open remains `menu-open-not-measured`.
  The open panel is read once every box in it has held still for 300 ms of 16 ms samples and nothing in it
  animates (3 s bound); one that keeps moving is not measured, never pictured mid-motion. The run's Chromium keeps
  background pages at full speed (`RUN_LAUNCH_ARGS`): the site page waits while the source is captured in another
  page, and with Chromium's default timer throttling a panel moved by script read as still. After the capture the
  panel is closed (Escape, pointer away, the control again); one that will not close has its page loaded again
  and the next triggers are found again by the key they were paired by — words, the sole drawer toggle, or the
  declared selector (one rule for both censuses, `menuGroups`); a reload that shows two drawer toggles names the
  drawer not measured, never picks one.
- **Captured and compared.** Per trigger and side: the panel's box (its own, or the union of what it shows), its
  largest painted surface, every word in it with the box of the WORDS (their text, not their element) relative to
  the panel and the parity properties composed as the page's parity composes a place — text properties on the
  element that draws the words, box properties on the deepest painted element of the place else its outermost,
  the fill from the nearest painted background under the words; screen-reader and 0 px words are no words. Element
  boxes are not compared: a title in an inline `span` on one side and a block on the other sits in the same place
  (on JA Vega 8 of 10 deltas of an open panel were such boxes before). Then every icon's box, and a picture clipped
  to the panel (`shots/menus/<page>--<variant>--<ascii>-<hash>--<side>.png`; the label never becomes a path, and the
  file is written whole or not at all, never through a symlink at any level from the run's directory down). A panel the
  viewport cuts (its box more than 1 px past an edge, or a word or icon in it cut) is `menu-open-not-measured` and
  not compared: its picture holds part of it (the picture is kept, `clipped`). At most 300 words and icons are read
  from one panel; past that the rest is `menu-open-not-measured` and what was read is still compared. Panel and
  surface boxes beyond the container tolerance are `menu-open-layout`; a word missing on either side, moved, or
  styled differently, and icons by count and by box (each source icon against the nearest site icon not yet
  taken: one that moved is a change as much as one that grew), are `menu-open-parity` — `deltas` in the parity
  shape, the trigger in `element` (`header menu "Our Services" › h3 "Consulting"`), at most 40 a trigger.
  The two pictures are compared too, in 8 px cells: a cell whose mean channel difference is above 24 (0–255) at
  every offset within the container tolerance differs, and any such cell is one `menu-open-parity` finding
  `header menu "…" › picture` (the counts and the region beside its deltas, so its identity does not move with a
  pixel count). Boxes and styles cannot see what the picture shows: a header that clips the panel
  (`overflow: hidden`), a surface drawn over it, an icon in another colour or shape in the same box. The same panel
  drawn by the same browser differs in no cell even at level 1; pictures whose sizes differ by more than the
  tolerance are the panel's `menu-open-layout` finding, not this one.
- **Bounded.** At most 16 triggers a side and one capture per trigger, side and axis; a side's captures share
  30 s, a deadline every page operation of the capture is bounded by — each evaluate, pointer move, click,
  picture, close and reload is raced against it, and once it has come nothing more is started — so both sides
  stay inside the axis's 180 s bound (a JA Vega header of two mega panels took 5–10 s for both sides at one
  width). A picture is written only before the deadline, and a capture counts only once its picture is written;
  one that arrives after it is dropped. What the cap or the budget left out is `menu-open-not-measured`. An axis
  that runs past its own bound is given up: its captures still in flight write nothing, so an attempt measured
  again writes its pictures alone. The run's directory (`--out`) and its `shots/` must be real directories, not
  symlinks: the run refuses them before it writes. A page with no source, a dark axis whose
  source has no dark, or a source that did not stay dark measures no menu (`menus.measured: false` with the
  reason and `pairs: 0`), as for parity. A nonzero pair count is only valid after menu measurement. A side that does not load is `menu-open-not-measured`, never a clean pair.

`menu-open-not-measured` is an unmeasured kind (`UNMEASURED_KINDS`): no exception accepts it. The record is
`axis.menus` in `visual.json` (census of both sides, per trigger the two captures, unmatched, not measured);
`summary.menus` counts pairs, captures, unmatched and not measured; `VISUAL.md` has a section *Header menus
captured open*; `index.json` lists the pictures in `menuShots` (and what could not be pictured in `menuMissing`),
apart from `shots`, so a lens that takes the page's picture never takes a panel. Evidence measured before this
(`visual-qa/8`, or an axis without `menus`) is not reused.

**Container widths at the source's breakpoints** (#37, M6-14). The four axes stop at 1440 and 390, and a
container that steps with the source at both ends can differ at every width between: the JA Vega source's
`.container` is 540 / 720 / 960 / 1140 / 1320 px from 576 / 768 / 992 / 1200 / 1400 (its `template.css`), the site's
container only capped at 1320, so at 600 / 800 / 1024 / 1200 it was 600 / 800 / 1024 / 1200 wide and no finding
said so (D-48). The breakpoints are the SOURCE's, read from its CSS and declared with the evidence in
`review.config.json` — the tool knows no framework's list:

```json
"containers": {
  "breakpoints": [576, 768, 992, 1200, 1400],
  "evidence": "templates/ja_vega/css/template.css: .container max-width 540/720/960/1140/1320 from min-width 576/768/992/1200/1400",
  "themes": ["light"],                                   // optional (default light); dark needs the source's dark hook
  "tolerance": 1,                                        // optional px (default the parity pxTolerance)
  "items": [ { "id": "main", "source": ".container", "site": ".jv-container", "layouts": ["page", "single"] } ]
}
```

`"containers": { "none": "<why>" }` says the source has no container grid (a canvas export). **Undeclared is
`pending`**: the contract is not measured until it says one or the other; a wrong declaration (a duplicate or
fractional breakpoint, one outside 240–3840, no evidence, an empty selector, a layout the contract does not have,
an unknown key) is `pending` with the reason, never guessed. `init` writes `design.containers` with, per item, the
layouts (all when it names none) and their representatives. The runner measures each item on each layout's
**representative only**, on its narrowest axis of each declared theme (390-light, the `light-responsive` stage):
a fresh load a side at each breakpoint (a new page, its viewport that width before the first request) and the first
drawn element of each selector read (`inPageContainerWidth`). A load that answers another status than the page owes
(the site: the page's status; a rendered export: 200; a live source route: the page's status) measures nothing at
that width — a 404 page carrying the selector is not a width. A width that differs by more than the tolerance is `container-width` (expected = the
source's, observed = the site's, the breakpoint and the item on the finding); a probe a side could not read — no
match, nothing drawn, another status, no source for the page, a dark theme with no dark source — is
`container-not-measured`, never a pass, and no exception accepts it (`validateContract` refuses an exception of
that kind or of `parity-body-not-measured`; the runner never applies one). Every row, measured or not, is on the axis (`axis.containers`: `key`, `probes`, `navigations`, `ms`,
`rows`). A round's report of that stage counts only with every probe the contract owes, measured (`ok` or `mismatch`)
under the current declaration (`containersKey`): an axis without them — an older visual-qa, a cut run, a
`not-measured` row, breakpoints changed since the report — makes the checkpoint incomplete (`reportProblems`), as
does any `*-not-measured` finding of the body or a container, found or accepted, and a recheck of a representative re-measures its
probes with the page. The declaration is part of the page hash (visual-qa/8).

Measured cost (28/09, the JA Vega stands, read-only): five breakpoints on
`/about-us` and `/blog-detail`, each side, loading each width fresh took 4.5–7.7 s (one navigation plus four
resizes took 1.2–1.9 s and read the same width at every breakpoint there, 20 of 20 — but a resize answers only for
a container CSS lays out; one a script sizes at load keeps its first width, so the probe loads fresh). The extra
work is representatives × themes × breakpoints × 2 page loads, not pages × widths: JA Vega's contract has 31 pages
in 16 layouts, so one item on every layout in light at five breakpoints is 160 loads (≈ 16 × 12 s ≈ 3 min of
browser time, spread over the tier's concurrency) where probing every page at every width would be 310 loads a
side. The fixture run (3 pages, 2 layouts, 4 breakpoints) writes its own numbers to
`$TRACY_TEST_SCRATCH/issue37-container-cost.json`.

**The body's text rendering** (#37, M6-13). `-webkit-font-smoothing` and `text-rendering` change the weight every
line is drawn at on every page, and no element pair compares them: the JA Vega source's `body` is `antialiased` /
`geometricPrecision`, the site's was `auto` / `auto`, and the site's titles read heavier with no finding until two
tiles were put side by side. `design.parity.body` (`{ selector: "body", properties: [...] }`) names them; every axis
that reads a source compares the two bodies' computed values — `parity-body` (property, expected = the source's,
observed = the site's), or `parity-body-not-measured` when a side reports no value (no body, a property the engine
does not compute), never an equal pair. The values are on the axis (`axis.body`).

**Page identity** = body class `tracy-page-<kind>` + h1 + `lang`. The kind comes from the page-map view
(`front-page` → `home`; `home`/`category`/`archive`/`search` → `listing`; `single` → `article`; anything else `page`)
— **except** a route the seed report marks `served: "page"`: the seeder built that category route as a page holding
queries (`demo-content.md` §6b), WordPress serves a page and the theme prints `tracy-page-page`, so the contract
expects `tracy-page-page`. The page's `layout` stays the view (`category`): template, coverage and representative
do not change. Before this, JA Vega M4 reported `identity-mismatch` on 9 pages every run (`/category-blog`,
`/portfolio/*`, `/services`) that no theme could fix. An older seed report (no `served`) → as before; `init` the
contract again after a new seed.

**A layout's template is the template WordPress serves, never guessed from the view** (gotcha 63). `init --site <origin>
--built-theme <src/<slug>>` loads each page (following redirects), reads `<body class>` and walks the **template hierarchy** over
`templates/` of the **built** theme (`contract.mjs templateFromBody`): assigned template (`page-template-<slug>`) →
`page-<slug>` → `page-<id>` → `page` → `singular`; `single-<type>-<slug>` → `single-<type>` → `single`;
`category/tag/author-<slug|id>` → kind → `archive`; `front-page` first on the home page; `404`; `search`; `home` for the
posts page; `index` last. Or declare it in `review.config.json` `"templates": { "/services/cloud": "page-service" }`
(the key is the page-map route or the real route). Declared and measured **differ** → `pending`, never pick one. A page whose template is unknown
(no `--site`, the page does not answer, an odd body class, an assigned template the built theme lacks) → `pending` naming the page
and the reason — the contract is not measured; **never** `templates/<view>.html`. A view whose pages are served by two templates
becomes **two layouts** (`page` and `page--page-service`), each layout with one representative page; `view` keeps family,
identity and coverage as before. Each page records `view`, `template`, `templateFrom` (`site`/`config`); a layout records `view`,
`template`, `templateFrom`, `templateChecked`. `init` **requires** `--built-theme` — both a template read from `--site` and a
template declared in `review.config.json` must be files of the built theme; a hand-typed name with no file → `pending`.
Validate with `--built-theme` (and `visual-qa --theme`) reports a layout whose template is not in the built theme; without
`--built-theme`, a layout never checked (`templateChecked` not `true`) is a "never checked" error; a layout
with no `templateFrom` (a contract written before 26/09) is "not verified" → init again. A page whose `template`/`view` differs from
its layout is an error: Fast Gate picks by the layout's template, the page hash hashes the page's template
(`themeFilesFor` also refuses two different names).
`--theme` of `init` is still the **overlay** (reads `patterns.map.json`); `--built-theme` is the `src/<slug>` tree WordPress runs.
A template edited in the Site Editor (stored in the DB) is not visible from HTML: the hierarchy names the file. JA Vega M4b: six
layouts pointed at files that do not exist (`page-login`, `page-register`, `page-account`, `category`, `author`, `tag` — all served by
`page.html`) and `page` lumped together `page.html`, `page-article.html`, `page-service.html`.

`source.darkHook` is also written by `init` (from `page-map.theme.hook`): the source is rendered **in dark** for the dark tiers; a source with no
dark of its own → the dark tiers record `parity.measured = false` with the reason, never compared with the light page.
A page-map that declares `theme.darkDerived: true` (the source has no dark, the port derives dark in Phase 6) and a source with no dark switch
at all → `init` records `source.darkDerived: true`. The declaration stands only on a contract **still fresh against the spec-pack being read** and while the page-map
still declares `theme.darkDerived` (`lib/canonical.mjs` `darkDerivedProblems`, the same freshness check as `release.mjs`); no
spec-pack, a stale contract or a changed page-map → it closes nothing. It is the **only** way to close the part of dark with nothing on the source to compare: `group-verdict.mjs`
does not demand `menus` of the dark axis carrying exactly the reason "no dark of its own" (listed in the verdict's `notOwed`; the axis must still be measured, the stage
must still pass), `site-sweep.mjs` records the dark cells in `notOwed` instead of `owed`, and `release.mjs` accepts that `notOwed` only when the release's visual
contract declares `source.darkDerived` (the cell count goes on the receipt). The port's dark belongs to the four Visual QA tiers. Not declared → still owed
(JA Restaurant S-32, S-40).

**Dark source pictures (#19 item 6).** When the source has a dark of its own (`source.darkHook`, or
`source.darkRequestHook` for a live source), `visual.shots` carries a `side: source` rule for each dark stage with that
stage's lenses (dark-desktop color + layout, dark-responsive layout + color), on the layout representative in the
default locale — before, `dd-0`/`dr-0` of JA Vega M4c listed site pictures only and the dark lenses compared the
dark site with the light source picture. A contract written before this has no such rule: re-run `contract.mjs init`.
The source is read back before it becomes evidence (`inPageDarkHolds`), mark AND paint: the `attr:`/`class:` parts
of the hook must still be on the root after `settle()` (a source script can undo them), and the page must be drawn
dark — a dark page background, or, when the root marks are taken off for a moment (transitions held), backgrounds
that turn dark, or an element's own words that change colour over a dark surface, over at least 10% of the page
(`DARK_PAINT_SHARE`, boxes marked on a coarse grid of the document). Words whitened over a light page, or a surface
turned lighter, paint no dark. A colour is read as it shows, each background laid over the one beneath it down to
the white canvas: a half-transparent grey over a light page shows light, whatever its RGB. Opacity is part of the
colour: an element is a group laid at its opacity over what its parent shows, so a black card at opacity .01 shows
white. The page fill follows Chromium: `html` opacity fades the whole page; with a transparent `html` the `body`
background is the canvas and `body` opacity leaves it; otherwise `body` is a box under its own opacity. Only what
is drawn counts: a box under `visibility: hidden`, or under `opacity: 0` on itself or an ancestor, marks no area. A border, an outline or a badge that changes alone is counted in `observed`, never
taken for the dark. A mark the source's CSS never reads is no dark source. A hook that leaves no mark (a request cookie) must
leave a dark page background. A source that did not stay dark gets `source-theme-not-applied`,
`parity.measured = false`, no picture and no border counterparts. A source picture the shot rules ask for and the
run could not write (the declared source is not there, no dark, the hook undone, the screenshot failed) is listed in
`index.json` `missing` with its reason and is a finding, `source-shot-missing` (the undone hook is named once, by
`source-theme-not-applied`); `fast-gate.mjs` refuses a run whose `index.json` lists one. It is never replaced by the
light picture. A page that declares no source owes no source picture.

**Bright borders the source draws (#19 item 7).** On a dark axis with a dark source, the runner reads the source's
bright borders with the scanner's own collector (`review/border-scan.mjs` `inPageBorderRecords`) and hands them to
`scanBorders`. A site border is set apart only when its counterpart is certain (`sourceCounterpart`): the source says
the same words — all of them, never a prefix — and EVERY place that says them draws that side in colour within the shared scan tolerance (±8/255 per RGB channel and alpha), the same width and style. It is kept in
`scans["bright-border"].sourceShared` with the source element named and both measured colours; another width, style or side, words the source
says twice with different borders, a colour the source uses on another element, or no dark source at all leave the
finding in place. Classes are never what pairs (JA Vega's Bootstrap 5.3 alerts and outline buttons, 20 findings a
run on /typography, carry other classes on the site). Every element is paired before findings are folded to one line
per tag, class, side and colour: a sibling of a matched element with other words or another width is still a
finding. `sourceShared` keeps every element set apart (one row per element and side, even when two elements' words share the printed 40 characters), with no cap. The standalone
`border-scan.mjs <url>` is unchanged.

**Words said at several places pair by order; typesetting folds** (#27 item 8). After #24 twenty findings a dark
tier stayed on JA Vega /typography whose borders the source draws in dark too: an outline button says "Success" at
three places on both sides (solid button, outline button, badge) and two draw the border, so "every place" never
held; and the site's spinners say "Loading…" (wptexturize) where the source says "Loading...". The words are now
folded as parity folds them, and when both sides say them at the SAME number of places, the source place in the same
order is the counterpart (`review/source-pair.mjs` `pairWithSource`). Other counts stay ambiguous and stay findings.

**The other dark scans are compared with the source in dark too** (#27 item 2, #95). White-surface, dark-on-dark and
contrast read their records with one collector (`review/source-pair.mjs` `inPageDarkRecords`); the runner reads the
source with it once the source is read back dark, stamps it `mode: "dark"`, and hands it to the scans. A record whose
counterpart draws the same colour within the shared scan tolerance (±8/255 per RGB channel and alpha) — the same background; the same text colour on the same surface — moves to
`scans.<scan>.sourceShared` with its component pairing and both measured values (contrast also records both ratios): by words as above, and an element with no words (a
carousel dot) only by its tag and rendered size, in order, when both sides have exactly as many. The source must say
`mode: 'dark'` and the width it was read at, equal to the page's: one read in another mode or width, or one that
does not say its mode or width, is refused whole (`sourceRefused`). A value outside the tolerance, or no source
measurement/counterpart, stays a finding; missing evidence never suppresses it. Nothing is exempt by class or by a colour the
source uses elsewhere. What was set apart is listed in VISUAL.md under **Set apart as the source's own [SOURCE]**
(`summary.sourceMatched`): a defect of the source, if one, decided with Lee — not a finding of the port. Measured on
the live stands (27/09): /typography contrast 9 of 9 rows are the source's (the cards' #c7ccd4 on #3b8bff), the home
carousel dots 5 of 5, /typography borders 32 set apart and 4 left — the pagination's rgb(230,230,230), which the
source does not draw.

#19 item 8 (`round.mjs` giving two next steps after a high-churn round) is fixed on the parallel branch
`feat/perf-parallel-rounds`, which owns `visual/round.mjs` and `rounds.mjs`.

## Before round 0 — tool preflight, then the pre-pass

Order, once per port (and again after a tool upgrade or a stand change): **tool preflight → pre-pass →
build/deploy as usual → refresh the contract (`contract.mjs init`) → round 0**. Neither step replaces a gate: a
green preflight says only that the tools read this site correctly on the capabilities it certifies; the pre-pass
writes values, round 0 measures them.

**1. Tool preflight — `visual/preflight.mjs`.** Minutes on at most six pages, in four parts.

*Capabilities and the sample.* The source is scanned first — every page of the page-map it serves, contract page
or not, up to `--discovery-limit` (default 40), layout representatives first — for what the site does that a tool
can misread: animation libraries (AOS, WOW,
animate.css and Tracy are read by motion; GSAP, ScrollReveal, sal, an unmarked IntersectionObserver fade are named
and unrecognised), elements transparent at load, toggles over hidden regions, and — through the browser's CSS
object model, cross-origin sheets re-parsed from their captured bytes — the media rules that set the width of each
container `design.containers.items[].source` names. The capabilities to certify: the declared error page's status,
one page per contract layout (every layout: none is dropped to fit), the site's dark state through the contract's
hook, each library, scroll- and toggle-revealed content, and each declared container at every observed breakpoint.
The sample (`--max-pages`, at most 6) is chosen greedily — the page covering the most capabilities still open, ties
to the earlier page-map entry; `--pages` chooses by hand under the same bound and accounting. Each capability is
`covered`, `uncovered` (no sampled page shows it — JA Vega's seventeen layouts do not fit in six pages), `unknown`
(no dark hook, no error page, a page of the page-map the scan did not read — failed, past the bound, or outside the
contract —, a stylesheet it could not parse, an `@import` that never loaded, a rule scan stopped at its bound) or
`not-applicable` (the scan of every page shows it absent, with the evidence). A library seen only on a page outside
the contract is `uncovered`: no contract page can show it. Anything but `covered` or `not-applicable` leaves its gate
**not certified**. Page-map paths must stay on the origin they are joined to: `//host/…`, dot segments (`%2e` forms
too), a query, a fragment or a backslash are refused before anything runs. `--source-prefix` is accepted only in
its plain form — segments of letters, digits and `. _ ~ -`, no dot segment, no percent-encoding, no trailing slash
— and joined to `--source` as the page paths are, before anything runs.

Pages whose contract binds `referenceKind: "none"` are excluded from the source scan and source comparison tools. Their source-side census, layout, motion, hidden-content and container obligations appear as typed `not-applicable` capabilities. The target status and layout probe, dark mode, Visual QA and functional checks still run. A preflight over only `none` pages may omit `--source`; a mixed sample still needs a source for its paired pages.

*Probes, controls, defects.* In the preflight's own browser each covered capability is measured with the routine
the loop's tools use (layout-boxes `measureInPage`/`compareBlocks`, lib/motion `measureMotion`/`compareMotion`,
layout-boxes `hookState`): source against site (findings, kept), the side against itself (the control — must read
nothing), and the side with one defect injected into an isolated browser context: a 200 served for the declared
404; a heading 12 px larger; the dark mark taken off on the first scroll; one element's library markers stripped;
reveals held transparent; one toggle's region kept hidden; one container narrowed at exactly one breakpoint width.
The defect must be reported by its intended detector at its intended measurement and nothing unrelated may appear;
a detector that always reads clean misses it, one that differs on identical pages fails its control. A control that
is not clean names the page, the side and each difference with its two readings (#57) — layout-boxes the property
with both values (`font-size 32px → 44px`), hidden content the count and each element read otherwise by its selector
path, first words and the opacity each read ended at (`4 → 3: main > div > section:nth-of-type(5) > div "…" opacity
1 → 0`); at most three findings a reason, each field cut at 600 characters, control characters folded, and
`PREFLIGHT.md` escapes what Markdown or a table cell acts on. The hidden-content count waits, after the scroll, for
the reveals it set off to settle — every candidate's opacity the same on consecutive 100 ms samples and nothing in
it animating, 4 s bound — so a delayed entrance is not read half-way on one read and whole on the next. A read that
did not settle is no reading: its control is `control-not-measured` (and a defect compared with it
`defect-not-measured`) even when the counts agree, and a difference names it too. Container
widths are probed just below, at and just above each boundary the source CSS declares (px only; `em`/`rem`
thresholds, negated width queries and `@container` rules are reported unsupported, never guessed — an `@container`
rule that sets a declared container's width is a gap of that container, so it is not certified). The boundaries
probed on a sampled page are those of that page's own CSS; the readings of every scanned page where the selector is
found are joined, and whatever the probe cannot stand for is a gap of the container: a boundary another page's CSS
sets that the sampled page's does not, a condition not read on any of them, rules past the 200 media / 50
`@container` rules kept per container (counted, never dropped quietly), a sampled page the scan did not read, and
source pages the scan did not read at all (`containers:unscanned`). At every probed
width both sides must show the container: one missing there is `container-missing` (in a control too), never equal
because both are missing.

*The five tools and the census.* On the sample it runs the five measuring tools as the loop runs them — visual-qa
in the targeted-debug scope, stage `light-desktop`; layout-boxes once per route with the contract's hooks; motion on
the content pages (before any freeze; it has no declared status, so not on the 404); http-parity and functional on
the sample page-map with its declared statuses — each with its own timeout, and takes an independent census of the
same pages (status, visible h1–h3 outside chrome, text elements, internal links, elements that become visible while
the page scrolls). A tool whose reading contradicts the census stops the preflight by name:
`layout-boxes-headings-missed` (JA Vega M4b: 1 heading of 10 paired), `motion-reveals-missed` (M4: 0 reveals on a
site full of them), `*-status-misread` (the declared 404 failed on its status in four tools),
`layout-boxes-self-differs` (every block differs AND the page compared with itself differs — the M4 "129 of 129"
reading), `*-timeout` / `-crashed` / `-no-report`, `*-not-measured` (a sample page the tool could not load — never
a pass), `census-failed` (the census could not read a sample page on either side, the 404 included — the tools'
reading of it is unconfirmed, never a pass). With `--source-prefix`, http-parity gets the source paths plus a
`--pairs` file to the site's paths, so it reads the same URLs as the census, layout-boxes and motion (a
`--pass http-parity:--pairs` is then refused; a `--pass` may never replace a flag the preflight sets). When every
block of a content route differs and the self-comparison of that route is clean on both sides, the differences are
the theme's: kept as findings, not called a tool bug; when the control cannot run, the preflight stops
(`layout-boxes-all-differ-unverified`). Findings are counted, never removed.

*The lock.* `measurement-lock.json` names what took the measurement — the tool tree (commit, dirty state, sha256 of
every measuring file, `package.json`, `package-lock.json`), the browser and Playwright that ran, the host, the fonts
the pages loaded (families, faces, sha256 of each font file), the runtime images (`--runtime-manifest` with
`sha256:` digests and their provenance, or read-only `docker inspect` of `--runtime-containers`; a digest is never
inferred from a tag) and the source and input bytes (routes, contract, spec files, source documents and
stylesheets). Inputs and the measuring files and commit are hashed before the first measurement and again after
the last; a change between is named and the run is not certified. A source document, stylesheet or font that served
different bodies to one run has no single identity: every hash is kept and the run is not certified on it (JA Vega's
Joomla pages carry a per-request `csrf.token` and random AcyMailing form ids, so a sample with them stays
`partial` on this field — except the Joomla CSRF token itself (#70): policy `joomla-csrf-v1`
(`visual/source-identity.mjs`) masks it in exactly two forms, the 32-hex hidden `<input>` name with `value="1"` and the
`csrf.token` of the `joomla-script-options` JSON, only when every occurrence carries one token; the lock keeps the raw
digests, the policy and the count, capture and `--verify` apply the same policy, and any other change (text, CSS,
script, a token elsewhere) is another identity; a lock written before the policy is compared raw. The CSS of a font
service that answers per load (Google Fonts, Bunny, Typekit) is recorded under `thirdPartyStylesheets` and not
compared — its font files stay sealed (#75 S-44). A route the page-map declares 3xx is a redirect, not a sample page (`redirect:<path>`
in the inventory; `--pages` refuses it). An exception may match `"axis":"<variant id>"`). A body is read only within the size bound: a recorded page asks for `Accept-Encoding:
identity`, a Content-Length over the bound, then the bytes the network delivered, stop the read before the body is
loaded, and a body served compressed anyway is never read (its decoded size is bounded by nothing before `body()`
holds it) — it stays unresolved; input files are opened without following links and
checked on the descriptor. The tool fingerprint is the lock **epoch**: the same fingerprint keeps the epoch of
`--prior-lock`, a changed one starts the next, and a lock of one epoch certifies nothing in another. The lock is
written last and atomically, sealed by its own sha256 and the sha256 of `PREFLIGHT.json`/`.md`, `census.json` and
`sample.page-map.json`. `preflight.mjs --verify <out>` accepts a run only when the seal holds over all four, the
identity is whole (browser, tool commit and files, runtime digests, source documents, nothing unresolved), the
certification is `complete`, the epoch is the current tools', the input files still hash as recorded and the source
still serves the recorded bytes with the recorded HTTP status (read again, bounded, redirects not followed — a
declared 404 now answered 200 with the same body is not accepted; a resource locked with more than one status is
not either); run the preflight again after any
tool upgrade. An interrupted run (SIGINT/SIGTERM) kills its tool children's process groups and closes its browser
before it exits 130, and writes no lock.

Exit 0 = the tools read the sample correctly AND every gate (status, layout, dark, animation, hidden, containers)
is certified or evidenced not applicable AND nothing in the lock is unresolved; 1 = not trusted or not certified
(fix the tool or its inputs first — not the theme — or read the uncovered list as the part of the site the
preflight does not vouch for); 2 = usage (checked before anything is read or launched: malformed or repeated
arguments, links, FIFOs and oversized inputs, a runtime manifest without digests, a broken prior lock, an `--out`
that is not empty or that another preflight holds). Certification is limited to the capabilities measured; the
preflight never claims parity of the whole site. This is a different check from round.mjs's **determinism
preflight** (`determinism.mjs`: does the site serve the same HTML twice).

```
node scripts/visual/preflight.mjs --routes <spec>/page-map.json --site <wp origin> --source <source origin> \
  --contract <dossier>/visual.contract.json --spec <spec> --out <evidence>/preflight-<n> \
  [--runtime-containers <web>,<db>,… | --runtime-manifest <runtime.json>] [--prior-lock <evidence>/preflight-<n-1>/measurement-lock.json] \
  [--source-prefix /index.php] [--source-site <origin>] [--pass visual-qa:--theme=<built theme>] [--pass http-parity:--pairs=<pairs.json> (no --source-prefix)]
node scripts/visual/preflight.mjs --verify <evidence>/preflight-<n>
```

**2. Pre-pass — `visual/prepass.mjs`.** What the measured design contract already says, applied without a model
and without a visual run: the 56 tokens (`theme-tokens.mjs`), `rootTokens` in `theme.config.json`, and a managed
region of `theme.overlay.json → styles.css` with the type scale, body text, section rhythm and container per rule
of the contract, phone/tablet values under the map's media query, every value equal to a measured token written
as its WordPress variable. The map (`{ "rules": { "<rule id>": "<WordPress selector>" | null }, "media": { "phone":
"(max-width: 781px)" } }`) is written by the agent: which element carries `.item-page h1` is a decision, never
derived from the Joomla selector; a rule the map does not name is reported. A colour is written only as a preset
whose dark measurement is also the rule's dark value (white hero text is `--bg` by value in light and would turn
dark with the page); anything else is listed `unsupported`, never a hex. The write set is those three files,
hashed before and after in the report; a tokens.css the tools did not write, a `rootVariation` (switch with
`--adopt-root-tokens`), a symlinked target or two rules asking one selector for different values refuse with
nothing written. A second run changes no byte.

```
node scripts/visual/prepass.mjs --contract <spec>/design-contract.json --overlay overlays/<slug> \
  --fallback vendor/tracy/od-design-system/systems/apple/tokens.css --map <dossier>/prepass.map.json \
  --report <evidence>/prepass.json [--dry-run] [--adopt-root-tokens]
```

## Run

```
node scripts/visual/visual-qa.mjs --run-root tasks/<site> --site http://127.0.0.1:<port> --out <evidence>/visual-<n> \
  --spec tasks/<site>/spec --theme packages/cms/tracy-wordpress-theme/src/<slug> --artifact dist/<slug>-<v>.zip \
  --seed-report <seed report> [--stage light-desktop] [--reuse <evidence>/visual-<n-1>] [--concurrency 3]
node scripts/visual/notes.mjs merge <evidence>/visual-<n> --stage light-desktop
```

`--out` is a **new** directory every run. `--reuse`: a page whose page hash has not changed (rendered source + target HTML +
the page's theme files — the template **serving** the page, parts, patterns, CSS/JS, PHP — + the contract slice including `template` +
tool version `visual-qa/6`) takes the old result back, its pictures **pointing** to the old run — **only when
the old axis was clean**. An axis with findings or unclassified is measured again: the hash covers the page, not the tool or the exceptions, and both
change between two runs (fast-13 of wp-tracy-business once reused exactly the bug the classifier had just fixed). `--reuse`
does not help a CSS fix round: the page hash includes every `assets/css/*` (gotcha 30) — a fix round picks pages with `round.mjs`.
A page template not in `--theme` → the run stops (validate), it never hashes short (gotcha 63).

Measured time: Northgate 14/09, 34 pages × 1 axis ≈ 220 s with 3 contexts. Tracy Base wp7 25/09 (38 pages,
light-desktop, 3 contexts, every page with `mega`): 776 s while mega-hover was still `spawnSync`, **≈ 405 s** once it was
`await`ed (gotcha 28); targeted ≈ 11–15 s/page. One machine, two runs per version — an estimate, not a constant.

An axis ending in `axis-error` (browser died, past `AXIS_TIMEOUT_MS`) is measured again **in the same run** on a fresh
browser, at most `--axis-retries` times (default 1); the axis carries `retry {attempts, recovered, errors}`, `summary.retried`/
`retryRecovered` count them, `VISUAL.md` names them (gotcha 29). Still axis-error after the retry → that page has no result.

**Lazy pictures.** `settle()` scrolls the whole page, sets lazy `<img>` **not yet loaded** to `loading = eager`, waits for `load`/`error` then `decode()` — both share **one** 15 s deadline (`boundMs`) — before measuring or shooting; finally every `<img>` carries `decoding = sync`.
The fixture (a `loading="lazy"` picture below the first screen, answered 700 ms late, with WordPress's `srcset` + `sizes="auto"`) gives a picture
that is decoded and has pixels in the full-page picture the tile is cut from. The blank avatar in tile 2 of the JA Vega ld-0 home page **could not be
reproduced** this way: same tool, ld-1 and a re-read on the stand both had the avatar (issue #15 item 4).

*A picture the scroll already loaded stays lazy (#19 item 3).* `sizes="auto"` is valid only while a picture is lazy.
Switching a picture the scroll had loaded to `eager` made `auto` invalid, and the full-page screenshot's viewport change
then chose again by the fallback sizes: a second request, `currentSrc` empty while it ran, another file once it
landed. Measured on the JA Vega listing (read-only, 8262): card pictures `complete` and decoded yet blank in the shot,
a different set each run, light and dark alike; the fixture (lazy, `srcset` 300/400/900w, `sizes="auto, …"`, 700 ms)
drew the 400w file in the first shot and the 900w file in the next. A picture that still has to be switched gets its
`sizes` written back at once, so its re-selection happens inside the wait, not during a shot.

*One deadline for load and decode; a shot paints decoded pictures (#19 item 3, review round).* `decode()` of a
picture whose answer never comes waits as long as its load; bounding only the load let one hung picture time the whole
`page.evaluate` out (`axis-error`). Load and decode now share the deadline, and a picture still loading reads
undecoded for the census (fixture: a picture that never answers, `boundMs` 1.5 s). The live listing still went blank
after that: Playwright's full-page screenshot fires a `resize` to 1×1 and back, the lazy `sizes="auto"` cards chose
their 780w file during the shot, and a `decoding="async"` picture can be painted before its bitmap is decoded.
Read-only on 8262 `/category-blog` 1440, two consecutive shots per run: with `async`, 2 and then 4 of 6 dark runs had a
blank card; after `settle()` sets `decoding = sync`, 0 of 12 runs (8 dark, 4 light). No fixture page reproduces the
blank frame (a re-selection forced during the shot, slow files, a card that grows at 1×1: all drew); the fixture
test only holds `decoding = sync` in place. `currentSrc` may still change during a shot; the file is another size of
the same picture.

**Motion stands still while measuring, and is compared separately.** `settle()` (after scrolling the whole page, waiting for pictures and fonts) calls
`freezeMotion` (`lib/motion.mjs`) on **both sides**: scroll-in reveals (AOS, WOW, animate.css) go to their final
state, finite animations/transitions 0 s, infinite loops held at 1 s of the run (as the live page was at that moment), carousels
back to the first slide through the library API (Owl, Slick, Swiper; Splide when the page keeps the instance). Without the freeze, two runs
of the same page are two pages: JA Vega drifted 2.5–6.3 % of pixels between two consecutive pictures, 0 when frozen (gotcha 35).
Each axis records `motion`/`sourceMotion` (`{loops, owl, swiper, splide, slick, tracy, unhandled}` or `{error}`); a carousel
that no API could stop is `unhandled`, a failed freeze (CSP blocking the stylesheet) is `error`, and `VISUAL.md` names the
page — its picture may differ between two runs.
`shoot.mjs` and `layout-boxes.mjs` freeze the same way (`shoot.mjs --live-motion` to shoot the page running). Because
the freeze removes motion from every picture, **motion is compared with `visual/motion.mjs`**, measured **before** the freeze:

```
node scripts/visual/motion.mjs --source <source> --site <site> --routes /a,/b|<page-map.json> [--source-prefix /index.php] --out <evidence>/motion.json
```

reveals (effect, delay, duration), carousels (slide count, autoplay, nav, dots — a different library with the same behaviour
is no drift), infinite loops, matched by the nearest heading; one row per difference, a page that failed to load is an
`error` row, not an empty store; exit 1 when there are rows.
Tracy's motion library is measured and frozen like AOS/Owl (`TRACY_MOTION`, called through
`measureMotion(page)`). Effects carry AOS names (a reveal without a modifier is `fade-up`;
`--fade-left/--fade-right/--flip-up`), the delay is the computed `--tracy-motion-delay`, and the duration follows
the `window.TracyMotion` intensity (700 ms, or 1500 ms for `bold`). v1 entrances (`hero-stagger`, `fade-up`) count
each unit with the library stagger. Reveals count only while `html.tracy-motion` is present and the config
enables the effect. Tracy carousels: slides are the children of the track, there is no autoplay, and nav/dots are
the controls the library renders or binds. Controls of other carousels are searched only inside the carousel and
its nearby wrapper (`:scope`-anchored selectors, never through `main`/`body`/`html`), so a body class such as
`tracy-nav-top-left` does not produce `nav`. A loop counts only when rendered: a `visibility: hidden` spinner
waiting for a submit is not motion. The freeze shows `.tracy-motion-reveal` elements and waiting `section`s under
`html.tracy-motion`, and puts each Tracy carousel on its first slide through its own ArrowLeft handling (`tracy`
in `motion`/`sourceMotion`) (gotcha 41).

Words the seeder **typesets** are not content: nbsp folds into `\s`, a non-breaking hyphen (U+2011,
"lost‑time") reads as the source's plain hyphen — the pair still classifies. An nbsp entry in `copy.json`
does **not** reach the page (the seeder normalises whitespace afterwards); to join a pair, add a rule in
`scripts/lib/typeset.mjs`.

**A full-page picture must be cut to be seen.** A 390 × 7 000 px picture opened with the read tool is shrunk to ~2 000 px high:
13 px words become 3 px, the lens "opened" it but is blind. The script cuts each picture (site and source) into tiles ≤ 1 200 px
(`--tile-height`) under `shots/<page>--<variant>[--source]/<n>.png`; `index.json` records `tiles[]`. A lens **opens
each tile**, `## Opened` lists the tiles; `notes.mjs merge` counts a picture as opened only when **every tile** was opened.
The full picture is kept for the dossier. The main agent puts the **tile list** into the prompt, not the full picture. A tile the lens
opened at **another path with the same bytes** (the previous run reshot the whole page after a CSS fix, that page unchanged)
counts as opened — the rule demands eyes on the picture, not on the path; different bytes must be opened again. `## Opened`
is read from `notes/<lens>.md`, so after each closing round, merge the `## Opened` list of `<lens>-close.md` into it.

**Scope** (`visual.json.scope.kind`, `index.json.scope`): `full` (every page, default) · `fast-gate`
(`--scope fast-gate`, the machine-chosen case set — section below) · `targeted-debug` (`--pages`). Only `full` can pass the
gate; `release.mjs`/the receipt read the scope from the report, so a subset run relabelled is still refused.
`--pages` takes page ids or paths (`path` or `pagemapPath`, a trailing slash no difference): one the contract does
not have, one that names two pages, or an empty list stops the run (`contract.mjs` `resolvePageSelection`) — `--pages
/error-page` against a contract keyed `en-error-page` measured nothing and exited 0 (#27 item 10). Named pages that
have no axis in the stages run stop it too, and a named page is **measured now**: `--reuse` is not consulted.

## Fast Gate — standardised early QA: contract → resolver → run mode → verdict

Not the final gate of Phase 8b but the **inner loop** from the moment the chrome + first pattern are built: a bug in a part,
pattern, shared section or the dark theme is fixed **once** before it multiplies across every page.

```
node scripts/visual/fast-gate.mjs plan --run-root tasks/<site> --theme <src/<slug>> --spec tasks/<site>/spec   # pick cases, print why
node scripts/visual/visual-qa.mjs --run-root … --site … --out <evidence>/fast-<n> --scope fast-gate --theme <src/<slug>> …
node scripts/visual/notes.mjs merge <evidence>/fast-<n> --stage <id>                        # each tier, after lens/fix/close
node scripts/visual/fast-gate.mjs verdict <evidence>/fast-<n> --run-root … --site … --theme … --spec …
node scripts/visual/visual-qa.mjs … --scope full --fast-gate <evidence>/fast-<n>             # full stands on a clean Fast Gate
```

The resolver picks **from the contract**, deterministic, with no pre-written list of pages or languages: the root page;
every page with `status` ≠ 200 (unknown-route is an output requirement, whether or not the source has a 404 page); one page
per state (`mega`); one page per **family** (`layouts[].family`, default the view's kind: home ·
listing · article · page; family taken from `layouts[].view`); one page per **shared component** — template
part, pattern (read from the template **serving** the layout, `layouts[].template` in `--theme`, recursively through parts; a layout
with no template, or a template not in the theme, is an **error** of the plan, not "draws nothing") or **section type** (`pages[].sections` are section types: `contract.mjs init` turns the page-map's module ids through `sections.json` in `--spec` — `type:style` of an `acm` row, `sectionType` of a `custom` row; hero, stats, form…; fast-gate reads these types directly) present in ≥ 2 layouts
but not in all (chrome every page carries is covered by any page); non-default languages with their own risk
(non-Latin/RTL script, titles ≥ 25 % longer, a different font allow-list) are added at the **narrowest variant of the narrow
tiers**. Greedy set cover, ties by id. **Every tier** has cases. `visual.fastGate.add/drop` overrides need a
`reason`; a drop that loses coverage is an error. `plan --changed parts/header.html` lists the cases that file touches — by the
serving template, so changing `page-service.html` picks exactly the service page; a missing template → exit 2, never returns `[]`.

`FAST-GATE-PLAN.md` says which cases were picked, what each case stands for, which part **only full checks**, the
fast/full axis ratio; on a small site the plan says so plainly (`nearFull`), it never drops coverage to be "fast".

`verdict` passes when: the scope is right, the contract unchanged, every tier `pass`, every case measured on all axes, each tier merged with
`open = reopened = lee = leeFlagged = 0`, `coverage.missing = 0`, every consumer has reported, no `N-` not
`closed`, `notes/machine.json` empty, and the page hash recomputed (source + target HTML + theme + contract + tool) matches the
run — `--site` is needed because the target HTML is in the hash. **A clean machine alone is not enough.** Full with `--fast-gate`
refuses a verdict that did not pass, a changed contract or a drifted page hash; without `--fast-gate` it only warns.
`verdict` also demands the dossier's **finish audit** (`--dossier`, default `--run-root`; `lib/audit-receipt.mjs`): `port-audit.json` clean, newer than the run and every dossier file it binds,
of exactly `--site` and every page-map route, covering exactly this run's `interaction.json` — missing or drifted → verdict `fail` with the reason `finish audit [audit-…]`.
A Fast Gate pass **does not replace** visual acceptance, nor the release receipt.

**Shot rules (`visual.shots`) name no language**: `contract.mjs init` calls `deriveShots`
(`fast-gate.mjs`) — the default language at every tier, its source at the light tiers, every language at light-responsive
(the kit's existing rule), a language with its own risk adds 390-dark for the words lens **and its own source** at
390-light when that source exists (never comparing against the default language's source instead).

## Evidence

| File | What it is |
|---|---|
| `visual.json` | machine-written: `scope` (`kind`, the Fast Gate's `plan`), `fastGate` (the Fast Gate run the full run stands on), `identity` (contractPath, contractHash, sourceHash, artifactHash, capturedAt, stale), stages, `summary` (including `distinct` — the number of different findings by (kind, element, rule), beside the raw total per axis), per page × axis: components, findings, accepted, scans, coverage |
| `FAST-GATE-PLAN.md` · `FAST-GATE.{json,md}` | plan of the `--scope fast-gate` run; verdict of `fast-gate.mjs verdict` |
| `VISUAL.md` | per-component per-axis table, Accepted exceptions (with decision), Findings — what a person signs |
| `index.json` | `scope` + each picture: layout, page, variant, stage, side, file, **tiles[]**, **consumers**, hash, measured; header panels captured open in `menuShots` (state `menu-open`, trigger, side, file, via) and `menuMissing` — never in `shots` |
| `notes/machine.{json,md}` | machine findings as todos (id, lens `machine:<kind>`, what, WordPress fix hint, verify) |
| `NOTES-<stage>.{md,json}` | merged machine + 5 lenses (`notes.mjs merge`); exit 1 when a picture with a consumer was not opened |
| `clusters.{json,md}` | findings grouped by probable root cause (`cluster.mjs`); `clusters.json` has closed schemas for totals, clusters and members; `VISUAL.md`, `notes/machine.md` and `NOTES-<stage>.md` open with its digest — §Clusters below |
| `notes/lens-work/<stage>--<lens>/` | lens work of the layout/colour lens (`notes.mjs plan`): `manifest.json` (closed selection, groups with tile hashes, chunks, bindings), `chunk-<n>.prompt.md` (one subagent's brief), `chunk-<n>.md` (that subagent's output) — §Lens work |

## Clusters — one row per probable fix, members on demand

A finding list is one row per **sighting**. On JA Vega M4c `dd-1` (27/09/2026) 140 of 313 findings were one
dark card-title colour, listed card by card on 10 pages. `scripts/visual/cluster.mjs` groups a run's
findings by probable root cause; `writeRun` writes `clusters.json` (every member) and `clusters.md` (largest
first) next to `visual.json`, and `VISUAL.md`, `notes/machine.md` and `NOTES-<stage>.md` (`notes.mjs merge`)
open with the same digest before their rows. Read the clusters, fix one cluster, rerun; open the members
only to check a page.

```
node scripts/visual/cluster.mjs <run-dir|visual.json> [--out <dir>] [--history a/visual.json,b/visual.json]
```

To look at individual findings, query the report instead of writing a script over `visual.json`:

```
node scripts/visual/visual-qa.mjs findings <run-dir|visual.json> [--page <id>] [--axis <variant>] [--open | --accepted] [--limit N]
```

One tab-separated line per finding: `id` (`page|axis|findings#index` or `accepted#index` — the member key above, the position in
`visual.json`), page, axis, `width/scheme`, `open` or `accepted`, a one-line reason, and the crop. The filters combine and are applied
before `--limit` (default 50); the last line (`# N of M …`) says how many matched. Duplicate findings are separate rows. A crop path is
printed only when the report records one for the finding (its `tile`) or its axis has exactly one tile; otherwise the column says
`unavailable` and the tiles of the axis are listed in `index.json` — open the tile of the region, not a full page. The query is read-only
and exits 0 whatever it finds; the verdict stays with the run's own exit status and `group-verdict.mjs`.

**Key.** Each property delta of a finding is one unit (a finding with three deltas can sit in three
clusters — `clusters.md` states how many do). A unit's key is open/accepted (plus the cited decision),
kind, site selector, property, expected and observed, with the JSON type kept (`400` ≠ `"400"`). The
selector is the parity label `tag.class.class "words"` **without its words**: the words say which element,
not why it is wrong. A finding with no value — `unclassified-element`, `parity-not-measured`,
`image-missing`, scan rows, a malformed record — keys on its whole record (a scan's page position `h@1375:` at the start of `what` aside),
so it is never merged with every other element of the same tag. Accepted findings form their own
clusters. IDs are `C-` + a hash of the key: the same cause keeps its ID across runs and input order.

**Shared-text chain — an inference, marked as one.** `parityByText` measures a heading and the bare link
inside it that holds the same words, so one wrong link colour arrives as `h3.card__title "X"` + `a "X"`
with the same delta. The label keeps no ancestry and no CSS rule, so the link is joined to the heading's
cluster only when, in one page/axis list, the link is a bare tag right after a classed element of the same
kind, words and deltas, and neither those words on a classed element nor that bare link occur anywhere
else in the list — two titles cut to the same 40 characters stay apart. The cluster says
`inference: shared-text-chain` and each joined member keeps `via` (its own selector). A cluster is a
**probable** cause: check the representative page before writing one rule for all of it.

A parity text counterpart is taken from the same region (page chrome or page content). If the source
says the words only in the other region, the site text stays `unclassified-element`; a footer link is
not borrowed for a content badge. Copies a looping carousel makes of its slides are not counted as
source text.

**Members.** A member key is `page|axis|findings#index` (or `accepted#index`) into `visual.json`, plus the
full `findingKey`; duplicates stay separate members. Nothing is dropped: open + accepted findings all
appear as members.

**Unchanged is still open.** `round.mjs` regroups each run with every earlier measurement in the ledger
(all tiers, oldest first) and writes `clusters` `{findings, clusters, unchanged, compared}` into its JSONL
line — in the rolling loop every checkpoint and every recheck too, one `clusters.json` per tier directory, with
`tiers.<stage>.clusters` beside the sum. A member is `unchanged` when the latest earlier measurement of the same page on the same axis, without
axis-error, had the same finding — the whole record, a scan's page position aside (an `@123` in a label's words or
a value is content), so a changed `observed` or any other field is new (`findingKey` keeps only one value of a finding without deltas, so it is not used
here); a finding seen before only on another axis is new on this one. It is a multiset: a second copy is
unchanged only if the earlier run had two; `streak` counts consecutive earlier measurements with it. A page not measured by a targeted
run keeps its older measurement; an axis with no earlier measurement, or with axis-error now, marks
nothing, and an axis-error on one axis drops only that axis from the history, not the page's others. A finding that was gone and came back has streak 0. Clusters whose members are all unchanged
are listed apart — in the digest as a short table with their streak, in `clusters.md` as their own
section — so they are not re-read member by member every round. They stay in every total, in
`machine.json`, and in the gate: marking never closes, accepts or discounts a finding.

**Measured on JA Vega M4c** (read-only replay of the saved `visual.json` files, history in ledger order):

| Run | Findings | Clusters | Property memberships | Largest cluster | Unchanged |
|---|---:|---:|---:|---|---:|
| `ld-0` (tier start, no history) | 280 | 125 | 460 | 36 — card-title `font-size`, inferred chain | — |
| `dd-1` | 313 | 122 | 328 | 140 — card-title `color` `rgb(241, 243, 246)` → `rgb(59, 139, 255)`, inferred chain | 130 of 313 (78 clusters) |
| `dr-3` | 152 | 94 | 184 | 18 — card-title `font-size`, inferred chain | 152 of 152 |

**The 75 unclassified of M4c.** `parityByText` reports `unclassified-element` when a site element's words
have no hit in the source text index. The same 75 were in every measurement of their pages from `ld-0` to
`dr-3` (per axis: unchanged from the second run of each tier, streak 3 at `dr-3`) and, from `ld-3` on, were the only unclassified findings; 49 are on `en-author-listing` (12 post cards × category link, title, title link, excerpt, plus
"Next Page") and 10 on `en-tagged-items`. The source `/author-listing` renders an author profile (About
Me, skill bars) and no post cards; the source `/tagged-items` is a table list with no "Tagged Items" h1
(one read-only GET each, 27/09). They are a view/content divergence the site really has, not a
classification miss, so no new kind: they are marked unchanged and stay open under the seeder-spec label.

## Five lenses — who looks at what (WordPress)

The main agent reads `index.json`, filters by `consumers`, **puts the file list into the prompt** of each lens (layout and
colour: `notes.mjs plan` writes those prompts, one per parallel subagent — §Lens work); the lens
opens **each** picture (site beside source), writes `notes/<lens>.md` with `## Opened` (absolute paths) and
`## Notes` (`| Page | Axis | What | Where | Fix | Verify | Flag |`, Flag `LEE` when it is a design decision).

| Lens | Looks at | The machine already handles |
|---|---|---|
| `layout` | nav breaking onto a new line, buttons dropping a row, misaligned grid, cramped/sparse blocks, section order differing from the source, overflow at 390 | overflow, seam |
| `typography` | bad line breaks, words overflowing their box (RU at 390), upper/lower case, long lede, overlapping words | family/size/weight/line-height (parity) |
| `color` | a "designed" dark: glaring blocks, lost borders, background pictures too dark, clear active/hover, words on pictures | contrast, white-surface, dark-on-dark, bright-border, off-palette colours |
| `images` | the right picture in the right place, crop, ratio, alt, leftover dummy text, EN/RU content mismatch, missing/extra blocks | picture count, placeholder, image-broken, identity h1 |
| `interaction` | mobile menu, clear active/hover/focus, tab order, buttons large enough at 390 | hover-jump, mega travel, Escape/focus, toggle |

Tiers: light-desktop **all 5**; light-responsive layout + typography (+ images); dark-desktop color (+ layout);
dark-responsive layout + color — `visual.shots[].consumers` is the source of truth.

**Lens schedule within a tier** (not rerun every round):

- **Start of the tier**, on the first full run: **only `layout`**, on each layout's representative page. Lab 25/09 (Tracy Base,
  5 pages, 32 tiles): 34 notes, **26 were things no machine kind measures** (hero crowded into the left half, section titles misaligned,
  contact lost its 2-column layout) — after two fix rounds by the machine, the home page's most visible layout bug was still not among the 847
  findings. Measured cost: ~6.7 s and ~3.9 k tokens per tile; 14 layouts × light-desktop ≈ 80 tiles ≈ 9 minutes (estimate).
- **Before the layout lens, measure boxes**: `visual/layout-boxes.mjs --source … --site … --routes … [--theme dark] [--contract <visual.contract.json> | --config <review.config.json>] [--framework T3 | --provenance <spec>/provenance.json]` pairs the headings of the two sides by
  words and compares the boxes around them (heading, nearest painted panel, section): drift in position/width/line count/font size/alignment/background.
  Headings are read at h1–h3 within the content regions of the **selector profile** of the source framework (T4: `main`,
  `#t4-main-body`, `.t4-section`, `.t4-masthead`; T3: `main`, `.t3-mainbody`, `.t3-section`, `.t3-sl`, `.t3-masthead`,
  `.t3-hero`, `.t3-slideshow`) and h1/h2 anywhere, except the profile's chrome (header, nav, footer, the framework's header/footer/mega/
  topbar/off-canvas; a sidebar is content whether `<aside>` or `<div>`) and hidden headings (gotcha 59). On
  T3, the section box is `div.t3-section` and the panel search stops there. The **font size** compared is that of the element **drawing the words** — down the single visible child chain with the same words
  (an accordion `h2` 48 px wrapping a `button` 20 px → 20 px); the box is still the heading's (gotcha 60).
  The dark tiers measure **dark**: `--theme dark` sets `prefers-color-scheme` and the dark hook on both sides. **Taken from a file** (gotcha 62):
  `--contract` (site: `design.theme` — a `storage` cookie is the **switch** `cookie:<key>=dark`, `attribute` is the **mark** checked
  `attr:<attr>=dark`, `default: "dark"` for the light switch; source: `source.darkRequestHook` + `source.darkHook`, the mark is the
  `attr:`/`class:` part of `source.darkHook`, light is `source.lightHook`; a source with no dark switch → exit 2) or
  `--config` (review.config.json `hook`/`persistence`/`defaultTheme` of the site; the source uses the same). Precedence: flag → file →
  default; the report records `hookFrom` (`flag`/`contract`/`config`/`default`) and `hookFile`. A file that does not exist, is not JSON,
  or names no theme → exit 2, no fallback to the default. `hook.type` accepts only `attribute`/`class`; `persistence`
  (and `design.theme.storage`) accepts only `{ "type": "cookie"|"localStorage", "key": "<name>" }` — an unknown type, a missing key, an extra
  key or a `defaultTheme` outside `light|dark|auto` → exit 2, no fallback to the `attr:` switch. Flags (`--dark-hook`, default
  `attr:data-theme=dark`; `--source-dark-hook`, default as the site; `--light-hook`/`--source-light-hook` for a side dark
  by default). The `cookie:` part of a hook is a **request** cookie, set before the first navigation, so a server choosing the theme
  (cookie `tracy_theme`) can read it. Once the page settles, the tool **checks** each side's dark mark: the `attr:`/`class:` part
  of `--dark-check`/`--source-dark-check` (default: that side's dark hook). A side whose script removes the hook, or whose server
  ignores the cookie, exits 2 — never compares a light page with a dark one. A hook that leaves no readable mark (`cookie:`/`ls:` with
  no check) also exits 2 before measuring: declare `--dark-check attr:data-theme=dark`. The report records `theme`, `hooks`,
  `checks`, `hookFrom`. Exit 1 when there are drifting blocks (JA Vega M4: 129/129 drifting yet exit 0); exit 2 on a missing argument, a flag declared
  with no value (`--light-hook` at the end of the line is not "not declared"), a `--routes <file>` that does not exist, a side not in the requested mode or not checkable, or a route that fails to load on one side (status
  other than 2xx, or other than the page-map's declared `status` / 404 for `view: "404"`) — an error page has no heading to drift, and
  "0 drifting blocks" there is not a pass. With a page-map, `synthetic` pages are skipped (no source route of their own), **except**
  a `view: "404"` page: it is synthetic because the source answers an error page for every unknown path, and it is still measured at status 404.
  Tracy Base 25/09 (9 pages): before the fix 7/9 home page blocks drifted, 12/12 on the Product page; after four CSS fix rounds driven by it,
  home, Product, Team, Careers and the service page had **0 drifting blocks** — these drifts closed ~12/844 machine findings, i.e. the
  finding count does **not** measure layout likeness. The layout lens reads pictures starting from the list it prints.
- **End of the tier**, once the full run is machine-clean: **every** lens `consumers` names. A clean checkpoint with notes still missing returns
  `next: lenses` (not `close-tier`), with `lensGap` — the notes earlier runs of the tier demanded (layout of the first run)
  and `notes/<lens>.md` of every lens in this run's tier directory. Write the notes (deploy nothing), then run one more
  checkpoint (`recheck.mjs --checkpoint`, or `round.mjs --skip-deploy --scope full`): notes on an earlier complete checkpoint
  of **the same deploy** (matching contract, theme files, served HTML) count, and only when
  no note is missing in that run does it return `close-tier`. A clean first checkpoint does not close the tier either without a `layout.md`.
- **Gated**: whichever run records `lensesDue`/`lenses`, before the next deploy round **in the same tier**, that run's
  directory must have `notes/<lens>.md` (non-empty). Missing → `round.mjs` refuses **before the build**, the ledger row
  `failedStep: lenses` with the missing note paths. Notes of another tier do not count. "Every lens" comes from the contract's
  `consumers` for the stage; a contract that cannot be read or no shot naming the stage → also refused (fail closed), never read
  as "no notes needed". JA Vega M4: ld-0 demanded layout, ld-1…ld-3
  deployed without it, the layout lens ran at ld-3 after three fix rounds (M4.7).
- Mid-tier: no lenses; each fix round changes the picture bytes so old notes must be opened again, so opening early pays twice.

### Lens work — sampled pages, parallel subagents (layout, color)

The layout and colour lenses do not read every page. They read **one representative per layout**
(`layouts[].representative`, every locale on its route — the pictures visual-qa has always shot) **plus every
other page of a layout whose machine findings the representative does not also have**. "Also have" compares
the whole finding as `visual.json` holds it — stage, variant, kind and the full detail (element, expected,
observed), never the 300-character cut of `notes/machine.json` — with only the page's own id and path blanked, so a page whose heading is off by another value, or on
another element, is its own page. After each stage visual-qa shoots those pages (site and, when there is one
to compare, source; tiled like any shot) with consumers limited to `layout`/`color` — in any locale: a shot's `locales` says which representatives
are pictured, not which failing pages the lens reads, so the plan asks for those pictures too; the other lenses keep
the representative, and no finding or verdict changes. A shot that fails is recorded on the axis
(`lensShot.error`; a failed source picture of a measured axis, `sourceShotError`) and makes the plan refuse the stage.
The sampled source picture follows the measured one: dark through `source.darkHook` or `source.darkRequestHook`, and read
back dark in its own load (`sampledSourceTheme`) before it is written. A source that did not stay dark — in the measured
pass or in this load — is listed in `index.json` `missing` (`sourceShotMissing`), never pictured light as the dark one,
and the plan refuses the stage for the missing source picture.

```
node scripts/visual/notes.mjs plan <run> --stage <id> --lens layout --chunks 4     # manifest + chunk-<n>.prompt.md
# dispatch one subagent per chunk-<n>.prompt.md, all in ONE message, on the model its line 2 names
# (references/build-subagents.md §Model per role: the layout lens runs on Sonnet, plus one Opus pass at the final checkpoint)
node scripts/visual/notes.mjs merge-chunks <run> --stage <id> --lens layout         # → notes/<lens>.md
node scripts/visual/notes.mjs merge <run> --stage <id>
```

- **Plan** groups the lens's pictures by page × variant (site and source together, never split), and deals
  whole groups heaviest first onto the lightest chunk: `min(N, groups)` chunks, every group once, deterministic,
  and the spread between chunks is never more than the heaviest group. Each prompt is self-contained: the
  identity line, the recommended model (`Model: haiku|sonnet|inherit`, from the manifest's `recommendedModel`), what to look for and what the machine already measures, why each page is there (the
  findings only it has, each **whole** — they may differ from the representative's only past the 300-character
  cut), every tile path, and its own output file. The plan refuses (exit 1) a contract other
  than the one the run measured (`visual.json` `identity.contractHash`), an `index.json` page the contract
  does not have or files under another layout, a machine finding on an unknown page, a selected page without
  its site picture, or without its source picture when the contract gives the lens one and the run opened the
  source for that axis (`sourceMotion`; a dark axis with no dark source has none to picture), a shot with no tiles (a full-page picture never stands in), a missing tile; exit 2 for a lens other than `layout`/`color` or an N that is not a
  positive integer. It never overwrites a directory that already holds chunk output.
- **Merge-chunks** writes `notes/<lens>.md` (a `Lens-work: <id>` line, every `## Opened`, every row) only
  when every chunk output is there, non-empty, starts with its own `Lens-work: <id> chunk <n>/<N>` line,
  has the `## Notes` table (header, `|---|` separator, every row seven cells with Page and What), and opened **every tile** of its chunk (by path, or the same bytes) — and the
  manifest, contract, `index.json`, `visual.json` and tile bytes are what the plan saw. A chunk with no
  defect is valid: header and no rows. It will not overwrite a lens note another hand wrote.
- **Merge/status** check every manifest of the stage. A planned lens whose chunks are missing, stale or not
  merged is **not heard**: its pictures count as not opened (`coverage.missing`, exit 1) and
  `NOTES-<stage>.md` lists why under "Lens work not whole" — an older `notes/<lens>.md` cannot stand in.
  The merged note must also equal what `merge-chunks` would write from the chunks **as they are now**: a
  chunk edited after the merge (a row added) or a hand-edited merged note makes it stale until merged again.
- **What sampling does not promise.** A page is read because it fails differently from its representative
  by the machine's measure; a layout defect the machine cannot see on a non-representative page that fails
  exactly like its representative is not read — the same trade the representative rule already makes. On a
  site whose non-representative pages each fail in their own way, sampling reads **more** pages than the
  representatives alone: M4c (JA Vega, 31 pages, 16 layouts) would have added 10–15 pages per tier (parity
  rows name page-specific text), which that run never shot, so their tile cost there is unmeasured. The
  gain that is certain is the fan-out: tier-start layout reads of 55–153 tiles cut into four chunks of
  13–40 tiles each.

## Fix round — the closer ≠ the fixer

The coding agent reads `NOTES-<stage>.md`, fixes the **theme/seeder/spec** (never the notes, never the pictures), writes
`notes/fix.md` (`| Id | Status | Fix |`, `done|skipped|lee`), then sends the fix to the controller
(`recheck.mjs --changed`, section below) or runs one `round.mjs` round; the lens writes `notes/<lens>-close.md` (`closed|reopened`); machine rows close themselves when the rerun is clean.
`notes.mjs merge` merges them back — one list, stable ids.

> **File ownership and splitting work across agents have only one model:** page groups, per [`build-subagents.md`](build-subagents.md)
> §Parallel page groups (the coordinator holds the shared files; each group holds its pages' templates, patterns, CSS, content, seeds
> and measures on its own stand). When only one agent fixes (pilot, final audit), that agent fixes in `NOTES` order. There is no longer a split into three
> agents by file type across the whole theme; the labels below only classify todos, they grant no ownership.

**Labelled by rule, not by model** (`rounds.mjs` `ownerOf`; `round.mjs` writes `<run>.round/owners.json`; the labels `tokens-css` · `templates-patterns` · `seeder-spec` are todo kinds): by kind — `examined-too-few` → LEE,
`image-missing`/`identity-mismatch`/`menu-open-unmatched`/`menu-open-not-measured` → templates-patterns,
`scan:*`/`mega-menu`/`font-not-loaded` → noise,
`unclassified-element` → seeder-spec, the rest → tokens-css; then by layout — on a **listing** page
(category/tag/author/date/search/archive) tokens-css and seeder-spec go to **seeder-spec** (the whole page has the wrong view),
outside listings seeder-spec goes to tokens-css. A non-deterministic page goes to seeder-spec **as a whole page**. Lab 25/09, 176 held-out
finding groups labelled with one agent's rule table: this rule **0.920**, by kind alone 0.653, Jev (LLM
filter) **0.625** and its probability is uncalibrated (p ≥ 0.8 was right only 0.641). So Jev does **not** route and does not filter
noise; pointer noise is handled by kind. One site, the labels are a rule table — not causal correctness.

## Rolling fix round — default (`round.mjs --watch` + `recheck.mjs`)

> **By page group.** From Phase 4–8b, each page group measures on its own stand (`visual-qa.mjs --pages … --stage` all 4 tiers),
> no whole-site checkpoint in between (`SKILL.md` §Build loop: full twice, a sweep after each deploy; each integration fix after the last checkpoint needs one more full checkpoint at the current generation, requested with `--reason`) ([`build-subagents.md`](build-subagents.md) §Parallel page groups). `--watch` does not accept `--pages`.
> What follows describes the controller running on one stand and the whole contract (the main stand at the integration step); `--checkpoint-every`
> is a mechanism of that controller (off by default), **not** a measuring schedule for the whole port.

No "measure everything → fix everything → measure everything". A bug found on a page is fixed on that page right away, and once fixed, **only
the part the fix touches** is measured again right away, on **every** tier; a full run is only a **checkpoint**. JA Vega M4c (27/09): step 8b took
~2 h 05 for 13 rounds over 4 tiers — tool ~40 minutes, fixing ~50 minutes waiting on each other in batches; tiers ran one after another so a fix for
a later tier broke an earlier one and nobody saw it (dd-1: 181 new; lr-1: 54 new).

```
# one controller per ledger (holds <evidence>/rolling.lock), runs in the background through the tier
node scripts/visual/round.mjs --config <dossier>/round.json --name s1 --watch [--skip-deploy] [--new-tier] \
  [--stages light-desktop,light-responsive,dark-desktop,dark-responsive] [--tier-concurrency 2] [--concurrency 2] [--checkpoint-every 4]
# agent: read the findings of pages already measured, without waiting for the whole run
node scripts/visual/recheck.mjs --config <dossier>/round.json --name s1 --status
# agent: done fixing a page/cluster → deploy + re-measure a sample of the touched part, returns a verdict per page × tier
# (--clusters: ids of the clusters being fixed, taken from `work` of --status)
node scripts/visual/recheck.mjs --config <dossier>/round.json --name s1 --changed overlays/tracy-base/assets/css/x.css[,…] [--clusters C-…,…]
# full checkpoint (when the controller reports `checkpointDue`, and mandatory at the end); exit 0 only on close-tier
node scripts/visual/recheck.mjs --config <dossier>/round.json --name s1 --checkpoint
node scripts/visual/recheck.mjs --config <dossier>/round.json --name s1 --stop
```

Each `recheck.mjs` command prints one line (`verdict=… closesGate=… -> <file>`); the file is the full result — `<id>.result.json` for an answered request, a summary file for `--status`; `--json` (or `--verbose`) prints everything to stdout, `--out FILE` picks the file of `--status`. Exit codes are unchanged.

`--stop` is the recorded way to stop (a running checkpoint is cut and recorded `interrupted`). SIGTERM/SIGINT sent straight to the
controller makes it cancel its child processes, release the lock and then **end the process** (143 / 130) — even when the controller runs
inside another process (a test file whose runner timed out), so no session keeps running after it was killed.

**The loop.** The controller deploys (generation 1) then runs the first checkpoint: every page × every tier of the config, each tier
one visual-qa process (its own Chromium), at most `tierConcurrency` tiers at once, within each tier `concurrency`
page jobs, each job one browser context — at most `tierConcurrency × concurrency` jobs (default 2 × 2 = 4 contexts
in 2 Chromiums, plus one mega-hover per page when the contract has a mega; fits a laptop). A page that finishes a tier
immediately has a `pages.jsonl` row in the run's tier directory; `--status` merges the newest row of each page × tier.
The agent fixes from there while other pages are still being measured. `--status` also returns `work` — the fixes in order: open clusters
(`clusters.json` of the tier's latest run that has that file; the controller writes it after each run) largest first, each cluster listing only
the pages whose latest measurement still has findings (a cluster with no pages left is dropped), then pages with findings no cluster
covers; with no `clusters.json` yet, by page, most findings first. Ties by tier then id — a deterministic order.

**Each fix** (`--changed`): the controller **cuts** the running checkpoint (SIGTERM to visual-qa first, which exits before the whole process group — one SIGTERM to the whole group at once reaches
Chromium, and Node can see the browser die before its own signal; the ledger row
`complete: false, interrupted: true` — finished pages are still evidence, never counted; visual-qa on SIGTERM
exits at once, code 143, writing no more report or `pages.jsonl` row — Playwright's own SIGTERM handler
only closes Chromium and lets Node continue, so before this a cut run turned the page being measured into an axis-error and sometimes
even wrote `visual.json`), runs `steps` (build →
deploy → seed → contract init), generation + 1, a deterministic preflight, then picks pages **by the real change on disk**
(the `--changed` list is only a hint; a mismatch returns `changed.hintNotChanged` / `unhinted`, never narrows):

| Change | Re-measured (on **every** tier of the config) |
|---|---|
| `assets/css/*.css` | changed rule → selector stripped of pseudo → pages with a matching element on the live DOM in **every state** of the measured tier (width × light/dark, the dark state loaded with the contract's dark hook): dark-only rules (`html[data-theme=dark] …`) and mobile-only rules (a class a script adds below a breakpoint) no longer slip through |
| `templates/*.html` | pages the contract says that template **serves** (page/layout `template`) ∪ pages whose HTML hash changed; a template changed while some page's template is unknown → **full** |
| `patterns/*.php` | pages with a section mapped to the pattern (`patterns.map.json`) ∪ pages whose HTML hash changed; no map, or no section mapped to it → **full** |
| `parts/`, seed content | pages whose served HTML hash changed |
| `theme.json`, `functions.php`, `inc/*`, JS, `tokens.css`, global at-rules, unparsable selectors, unknown files, a changed contract, a failed previous deploy | **full** — measured as a checkpoint |

**The touched set ≠ the measured set.** The table above gives the **touched** set (`scope.affected`). When every page of that set
can be placed (a **known** change — including a shared template/rule touching **every** page, `scope.allAffected`), recheck
measures only a **sample** on every tier: (1) the **representative** page of each touched layout (`layouts[].representative`); (2)
touched pages the representative cannot stand in for — the representative must be touched by every channel that touches that page (a narrow
selector that matches the page but not the representative measures the page itself; a changed HTML hash is stood in for by the representative only when a theme markup
file changed, otherwise that page's own HTML changed); (3) touched pages belonging to the **clusters being fixed**: `--clusters`
when every id is an `open` cluster in a tier's latest `clusters.json` and touches at least one touched page; with none,
or an unusable hint (`scope.clusters.why`), **every** touched page still with findings on any tier, or
not yet measured on a tier (conservative). The rest is `scope.deferred` (also in the answer's `deferred`): **not** measured,
its findings stay as at the latest measurement — recheck closes nothing it did not measure, counts nothing for the checkpoint, the lenses
or the gate — and the next checkpoint measures every page × every tier again, so a regression on a deferred page shows up there.
`scope.selection.<page>` records why each page was picked; order by contract, deterministic. A representative that is not a page of
that layout → **full** (fail closed). JA Vega M4d (27/09): three rechecks (a prose `h3` rule, two templates) measured nearly
every page, 8–11 minutes each.

The answer (`requests/<id>.result.json`, also printed): `verdict` `findings`/`clean`/`no-change`/`error`/`refused`,
`gen`, `scope`, `pages.<tier>.<page> {findings, kinds, closed, new}`, `regressions` (page × tier with new findings),
`churn`, `next`, `checkpointDue`, `deferred`, and always `closesGate: false` — **recheck never closes a gate or
a tier**; `clean` speaks only of the pages measured. The recheck's ledger row records `scope {pages (measured), affected, deferred,
selection, clusters}`. A fix whose scope is **full** (uncertain, last row of the table) is measured as a checkpoint; the fix's answer is still `closesGate: false`, that
checkpoint's decision is in `checkpoint {run, complete, next}` and the ledger row — the gate closes only through `recheck.mjs --checkpoint`.
A recheck whose determinism preflight failed, or a tier report that is not what was asked for, is `verdict: error`.
Several requests queued at once are **one** deploy + one recheck, each request getting the same answer. A recheck takes
priority over the background checkpoint; deploys happen only at boundaries (a checkpoint is cut, a running recheck finishes), so
no run measures two generations.

**Checkpoint**: at the start of a session, on `--checkpoint`, and mandatory before closing a tier; only when explicitly requested with a reason also after every `checkpointEvery` fixes (the answer reports `checkpointDue`) — the count and the rule: `SKILL.md` §Build loop. Pages not measured in the previous session first, then the pages that took longest to measure (`--priority`; the report
still in contract order). Only a **complete** checkpoint — every page × every tier at **one** generation, every tier with a report,
0 axis-error, not cut — counts. Having a `visual.json` file is not enough: each tier's report must be scope `full`
(`visualQaArgsByStage` with `--pages`/`--scope fast-gate` makes it a sub-run), not `stale`, with a stage row
`pass|fail`, covering **every page × axis** the contract assigns to the tier, and an exit matching the report (0 clean, 1 findings; a signal or
another code is broken); a determinism preflight that could not read a page also makes the checkpoint incomplete (the HTML hash — and
the scope of the next run — unknown). Each such failure is recorded in `incomplete` and `tiers.<tier>.problems`; that run records
`complete: false` and **does not count** for the stop rule, the limit (`maxRounds` checkpoints after the baseline; rechecks
do not count and do not reset it) or closing the tier; a one-round `round.mjs` exits 1 for that run. Only a ledger row recording
`complete: true` is a milestone: old rows written before this field existed were never checked for scope and coverage, so
they are no baseline for comparison and no source of notes. A checkpoint missing a tier or with an axis-error: `next: full`, the checkpoint request
gets `error`, the controller does not rerun on its own until the next request. A regression outside the touched set (files outside the theme,
plugins, pictures) is seen only by a checkpoint — that is why checkpoints exist.

**Ledger**: at any moment only **one writer** holds `rolling.lock` — the controller for the whole session, or a one-round `round.mjs`
(`role: round`) for its run; a second writer (controller or round) is refused while the lock is alive, never writes
interleaved. A dead process's lock is taken over, recorded `recovered` (one-round: `recoveredLock` on that run's own ledger row) — the takeover runs
under `rolling.lock.takeover` created with `wx`, so when two controllers both see the dead pid only one wins; that file left over
from a process that died midway is refused with the file name, no contest). Each row has
`watch: <session>`, `gen`, `kind: checkpoint|recheck`, `complete`, `stages`, `tiers.<tier> {out, findings,
churn, regressions, lenses}` beside the totals. A cut checkpoint starts no tier still queued (the row records
`tiers.<tier>.started: false`): it is written as soon as the running tiers finish. No controller, a dead controller, or `--timeout` expired → `recheck.mjs`
exits 2 with the reason — never a pass.

**The lenses are still gated**: the tier's first checkpoint demands `layout`; the first fix is refused (`refused`,
`failedStep: lenses`) until every tier directory of that checkpoint has `notes/layout.md` — even while the checkpoint
is still running (the lens reads the finished pages). Closing a tier: every lens `consumers` names, as below.

## Coordinated fix round — `round.mjs`

One command per round; the script keeps the order, times each leg, writes a separate log per leg
(`<evidence>/<run>.round/<leg>.log`) and **one JSON line** to `<evidence>/rounds.jsonl`. Nobody hand-types times
or finding counts into a run log.

```
node scripts/visual/round.mjs --config <dossier>/round.json --name <run> [--scope auto|full] [--pages a,b] [--skip-deploy] [--new-tier]
```

`round.json` (paths relative to the file; `${NAME}` `${EVIDENCE}` `${ROUND_DIR}` `${SKILL}` `${CONFIG_DIR}`
are expanded in every string): `runRoot`, `evidence`, `site`, `sourceSite`, `spec`, `theme` (the built theme
directory), `artifact`, `pack` (the quickstart pack directory; needs `artifact` — see **Artifact binding** below), `seedReport` (usually `${ROUND_DIR}/seed-report.json` — an absolute path; a relative path for
`--seed-report` makes the contract report stale), `stage` **or** `stages` (several tiers), `concurrency` (page jobs per tier: 3
with one tier, 2 with several), `tierConcurrency` (2), `checkpointEvery` (empty = no schedule; a number makes `checkpointReason` mandatory), `fetches`, `maxRounds` (3),
`churnLimit` (0.3), `visualQaArgsByStage` (flags for one tier), `unsetEnv` (`["DOCKER_HOST"]`), `timeouts`, and `steps.{build,deploy,seed,contractInit}` =
`{cmd:[…], cwd}` — exactly the site's stand commands (`steps.sweep` replaces the default `site-sweep.mjs` command run after each deploy). `contractInit` must pass `--site <origin> --built-theme <src/<slug>>`
(or the site declares `templates` in `review.config.json`): missing → the contract is `pending`, the contract init leg exits 1
(gotcha 63).

Legs: build → deploy → seed → contract init → **deterministic preflight** (`determinism.mjs`, each page `fetches`
times; a page with differing HTML → the seeder group, not in the stop rule — gotcha 27) → **scope** → `visual-qa`
(axis-error retry within the run) → **per-page multiset diff** against each page's latest measurement in the tier (pointer
and non-deterministic pages counted apart) → the JSONL line: `durations_s` per leg, `scope {kind, reason, pages,
changedFiles}`, `determinism`, `findings {total, distinct, unclassified, onDeterministicPages, closed, new,
same, pointer}`, `retries`, `churn`, `stop`, `owners`, `lensesDue`, `lenses`, `next`, `why`. **Pointer kinds**
(`POINTER_KINDS`): `mega-menu` and **every** `scan:hover-*` — still verdict findings, only counted apart when comparing two
runs (JA Vega ld-3: `scan:hover-jump` went into churn 1.11 and 16/31 "new" findings). The `menu-open-*` kinds are not
pointer kinds: a panel captured open and held still is as deterministic as parity, so it counts in the churn
guard, the stop rule and the owner labels (`menu-open-layout`/`-parity` → tokens-css) like any other finding (#50).

**Several tiers in one round** (`stages`, or `--stages a,b`): one visual-qa per tier, in parallel with a limit, a separate report
`<evidence>/<run>/<tier>/`, and **one** ledger row for the whole round (`tiers.<tier>` beside the totals, `regressions` per
page × tier) — a fix is graded on every tier at once, a cross-tier regression shows within that same round. The row's tier key
is the tiers joined with `+`, so round counting and the lens gate belong to that set of tiers alone; a tier that produces no report
(`failedTiers`) does not hide the other tiers and makes the round `complete: false`. A single-`stage` config records exactly as before.

**Artifact binding** (config `pack` + `artifact`). Every tier that writes a report also writes
`<tier dir>/artifact-binding.json` (`tracy-visual-artifact-binding/v1`, the schema release.mjs reads —
`references/quickstart.md` §Release acceptance): the report's SHA-256 and `at`, the stage, and the theme zip,
webroot archive and database archive by name and SHA-256. The artifacts are hashed before the tiers start and
again as each tier ends; an artifact changed meanwhile, a report whose identity names another theme zip or whose
times disagree, or a report older than an artifact leaves no binding and the tier incomplete (`incomplete`
names why). A pack that does not check out, or whose files are links, FIFOs or directories, fails the measurement
before visual-qa runs; an existing binding is never replaced. The same holds for
one-shot rounds, `--watch` checkpoints and rechecks; a cut run writes no report and so no binding. Without
`pack` nothing is bound.

**Scope (`auto`)**: the tier's first round is full. After that the change decides, fail closed (`affected.mjs`):

| Change | Re-measured |
|---|---|
| `assets/css/*.css` | changed rule (key = at-rule context + selector) → selector stripped of pseudo → pages with a matching element on the live DOM, in every state (width × light/dark) of the measured tiers (38 pages ≈ 3.3 s per state) |
| `templates/`, `patterns/` | pages the contract assigns (serving template; section → pattern through `patterns.map.json`) ∪ pages whose HTML hash changed; a pattern that cannot be mapped → full |
| `parts/`, seed content | pages whose served HTML hash (nonce stripped) differs from the previous round; non-deterministic pages are not picked by hash |
| `theme.json`, `functions.php`, `inc/*`, `style.css`, JS, `tokens.css`, `@font-face`/`@keyframes`, unparsable selectors, unknown files, a changed contract | **full** |

Lab: one scoped CSS fix → 4 pages; the full run after it closed exactly 15 findings on those 4 pages, no other deterministic page
changed. **One** fix — not yet a recall figure; that is why every other class fails closed. A targeted run is
`targeted-debug`: never passes a gate, never closes a tier.

`--pages` is resolved against the contract before anything is measured (ids or paths, as visual-qa does); a page it
does not have ends the round with `failedStep: "scope"`. A tier report is checked against what was asked
(`reportProblems`): an unknown page, an empty list, pages that owe the stage no axis, an axis not measured, or an axis this run did not measure itself
(`measured` other than `"now"`: `"reused"`, `false`, or absent) make the
measurement `complete: false` — `next: full`, exit 1 — never "targeted pages converged" over zero pages (#27 item 10).

**Decision** (`rounds.mjs`, a pure function with tests): `next` is one of `fix` · `fix-again` · `full` ·
`stop-decision-list` · `replan` · `close-tier`; `round.mjs` adds `unblock` (below).

- **An exit 1 the report explains is a result, not a broken run.** visual-qa also exits 1 when the interaction record
  still has unmeasurable states (`summary.interaction.blocking`, the probe ran and read something) or intrinsic has defects only
  the site has (`siteOnly`). That run measured fully: no `incomplete`, no `next: full`. If no findings are left, `next: unblock`
  replaces `close-tier`/`lenses`, the ledger row has `blocked` (tier, state count) — fix the page, or record an S-number and fix the
  probe, then measure exactly the pages it names (`round.mjs --pages`); re-measuring the whole site only gives the old result again. A probe that did not run, read 0, or an intrinsic
  that could not read a page is still a broken run (`next: full`). Release still demands exit 0 on every tier. Before 21/10/2026
  ja-restaurant reran the 31 pages × 4 tiers checkpoint on the restored stand three times (rc-4, rc-5, rc-7; 33–40 minutes each
  run), each time 0 findings and the same unmeasurable form state.

- **Churn guard**: on deterministic pages, new ÷ closed > **0.3** → `fix-again` before paying for a full run. Earlier runs
  ran at 0.65 and 0.68 and paid 382 new findings in round 1. The same on a checkpoint, and the churn guard comes **before** the stop
  rule: `next` has only one value — `fix-again` (fix the regression, then checkpoint); that row's `stop` records
  `stop: false, deferred: "churn"` with the reason, the stop rule is weighed at the next checkpoint. Before this JA Vega M4c lr-1 (churn
  0.57) and dd-1 (0.85) recorded at once `churn.verdict: fix-again-before-full` and `next: stop-decision-list` — the total
  did not fall precisely because of the regression, so the tier stopped just when it needed a regression fix round. At the last checkpoint of the round limit
  the stop rule and the limit decide, no further fix round is opened.
- **Round limit**: at most **3** deploying rounds per tier (round 0 = baseline; a deploy that changes nothing in the served pages — scope `none` — does not count). Once used up, `replan`: a decision
  list + evidence; a 4th deploying round is **refused** and records the row `failedStep: bound`. `--new-tier` starts the count again
  — a named choice, not a workaround.
- **Stop rule** (`stopRule`), between two consecutive **complete** checkpoints/full runs, only on deterministic pages, not
  counting pointer kinds: **no net progress** → `stop-decision-list` — the total does not fall (equal or higher), or closed ≤ opened
  (compared per page between the two checkpoints). Falling **and** closed > opened goes on, however small the fall: the old "< 20 %" rule stopped JA Vega
  lr-1 at 19 % while it closed far more than it opened (100 → 81, 20 closed, 1 opened → go on). A slow tail is cut by the round
  limit. A checkpoint missing a tier, cut, or with an axis-error does not count (`next: full`).
- **Closing a tier** only on a **complete full** run: 0 findings, 0 unclassified, 0 non-deterministic pages, 0 axis-error, and
  notes from every lens of the tier → `close-tier`; missing notes → `lenses` (write the notes, checkpoint again; then
  `notes.mjs merge`, the next tier).
- A runner handing a round to an agent must give it a timeout > 2 full runs (≥ 15 minutes with the async tool): an earlier run died at 30 minutes
  in the middle of a 13-minute full run.

## Whole-site sweep — `site-sweep.mjs`

The other checks (interaction, intrinsic mobile, the border/seam/contrast scans) and the four-tier checkpoint have no cheap measurement for the *ordinary*
properties a fix often breaks: horizontal overflow at one width, a page only half dark for a customer whose system is dark and who chose nothing, a page background differing from the source in a few
variants, category chips the wrong colour across a whole family of pages, a header taller/with different margins at a tablet width. Each is "the same measurement on EVERY route × width × scheme, port against source".
`node scripts/visual/site-sweep.mjs --site <port> --source <source> --run-root <dossier> --out <dir>` does exactly that, read-only (no submits, no sign-in).
A dark cell of a source the contract declares has no dark of its own (`source.darkDerived`) is not owed: it is in `notOwed` of `site-sweep.json`
(the *Not owed* section of `summary.md`) with the reason, not counted as measured; a side with no dark switch and without that declaration is still `owed`.
A dark cell owes only the check read in dark (`fixed-widgets`); `icons`/`forms`/`text` read in the first scheme (in light when the source is declared to have no
dark). A dark cell is closed only when that same run has a light pass; a dark-only run still owes it. A run that could read no cell
(`measuredCells: 0`) never exits 0, and `release.mjs` refuses a sweep with no behaviour cell measured.
**Run it before opening a checkpoint** (and it is the default targeted measurement of a fix version, `quickstart.md` §Release a fix version): 24–34 routes × 6 widths × 2 schemes
take 1m30–3m (concurrency 4), no pictures; `heights` adds 8 widths × 1 scheme × 2 sides, each cell a fresh load: about 3.5–4 minutes for 30–34 routes at concurrency 6.

**Read `<out>/summary.md` (the same content is in `summary.json`)**: one section per check, the groups with the most cells first; each group has a key, a kind, the route × width count, at most 3 example cells (route, width, the value measured on both sides), the `sweep.accept` rows matched, the status against `--baseline` (new/unchanged; a group that is gone is recorded `fixed`) and the evidence path; unmeasured causes are listed once with a count. Stdout is only one line per check (verdict, group count, case count, unmeasured cell count) and the summary path; `--verbose` keeps the detailed output as before.

### Source cache — the frozen source is measured once

The source does not change while a port is fixed, so its readings are kept in `<run-root>/source-cache/` (`site-sweep-source-cache.mjs`) and reused; the port is
always measured live. Cached: the plain pass of a route × scheme (the whole resize sequence and the fresh chip loads), the scheme states, the static behaviour
readings, the first-interaction cases, `heights`, and the source side of every confirmation. A reading is reused only when **all** of this equals the run that took it:
source origin, resolved page URL, declared status, browser context (width, scheme, switch cookies), the probe configuration of the pass (parts, selectors, marks,
hooks, behaviour hints, widths of the sequence, reload mode, settle time), the browser version, `PROBE_VERSION`, a hash of the files that hold the probes, and the
**fingerprint of the source content**: the manifest of every document and resource the browser was served while taking the reading (status and SHA-256 of the raw bytes;
for a redirect its target), fetched again with exactly the request the browser sent — every header, cookies and `accept-encoding` with its q-values (a request with a credential is not cached; an answer in a coding the checker cannot decode is a miss) — bounded in time and size, before every reuse; an answer is never kept for a later reading, only requests running at the same moment are shared. **Every response header is compared** (`Set-Cookie`, `ETag`, `Last-Modified`, CSP, `Link`, `Refresh`, anything a script or the browser can read or act on). The transport headers (`Connection`, `Keep-Alive`, `Transfer-Encoding`, `Upgrade`) are left out only for a reading *evidenced* not to have observed them: an init script wraps the `Headers` and `XMLHttpRequest` accessors of every frame, and a read of one of those names, a walk over all headers, or any worker (which the script does not reach) makes them compared like the rest. `Date` and `Age` are stricter, because the browser itself uses them with no accessor call (to place a `Set-Cookie ...; Expires=` deadline, and for HTTP cache freshness): for a response they are left out only when no script or worker observed them, the response sets no cookie with an `Expires` attribute, and it carries none of `Cache-Control`, `Expires`, `Last-Modified`, `ETag`, `Age`; otherwise the reading is never stored or reused, even when the values happen to match (it is taken live and the report names the cause), and `Date`/`Age` are compared like any other header. When a reading is stored every resource is fetched once more with the same request; if anything compared differs between the two answers (a per-request cookie, a counter, an observed `Date`), the reading is **not stored** and is taken live every time: a header that changes under the page can change what it shows. A source that sets a fresh session cookie on every answer is therefore never cached. This is a fetched-HTML/asset hash taken
from what the reading really saw, so stylesheets, scripts, fonts and pictures are covered (preflight's document/stylesheet/font hash does not cover them) and no preflight lock is needed.

Misses, never a guess: no entry, an unreadable/incomplete/foreign entry, a resource that answers differently or cannot be fetched, a non-GET request, a failed request,
a page whose document changed while it was read (not stored under either version), an error or a deadline (never stored). A miss measures live; the cache never turns a
not-measured into a measured cell. **Bump `PROBE_VERSION`** (`site-sweep-source-cache.mjs`) whenever a probe, `load` or a settle rule changes what it reads; the hash of the probe files
invalidates every entry on any edit as a safety net. `--no-source-cache` measures the source live in every pass; `--reload` does too (its fresh-load-per-width meaning is
unchanged); `--explain` is a live diagnosis and never writes the cache. `site-sweep.json` carries `sourceCache`: per cell (`kind`, route, width, scheme/state) whether the source
came from the `cache` or was measured `live` and why; it says nothing about the port (always live) or about cells carried from an earlier run (`carried`). Stderr ends with
`source cache: N source reading(s) reused, M measured live`. The saving is the source renders that are not repeated; it is inferred from that count, not measured on a stand.

### Re-runs — scoped by default, full by reason

**After a change, run the sweep again with no scope flag: it narrows itself.** A run with no `--only`, `--pages` and `--widths` keeps a history in `<run-root>/site-sweep-state.json`, one entry per site + source + dossier inputs (pages, switches, selectors, behaviour switches, the spec dir), whatever `--out` each run used. The `sweep.accept` rows are **not** part of the key: a row added, changed or removed keeps the history, and the next run judges what the history carries against the rows of now without a browser (a row moves the cells it covers out of the open groups, a row removed owes them again, a row that matches nothing is an accept error). A history written under the older key, which hashed the rows, is never taken for the previous run. Each run keeps its reports in a snapshot `<run-root>/site-sweep-evidence/<entry>/<run>/`, which the history cites and no later run overwrites or removes; `--out` holds the reports of the latest run, and a `fix-measure.json` of an earlier run left in `--out` is removed.

- **First run** (no entry): full, no reason needed.
- **Later run, no scope flag**: measures only what was unresolved in the history — the checks, routes, widths and schemes of the open (not accepted) groups, of the cases owed unmeasured and of the `sweep.accept` rows in error; `heights` keeps its own widths (576 and 992 included), chips and scheme states are read at the widths the full run read them at. Stdout starts with `scoped re-run: checks …; routes …; widths …; schemes …`. Nothing unresolved: nothing is measured, no browser starts.
- **Full run with a history**: `--full --reason "<text>"`; the reason is written to `summary.md`, `site-sweep.json` (`run.reason`) and the history. `--full` with no reason, or a blank one, narrows like any re-run (no error). **The full sweep of a release is the one `patch-chain.mjs` runs** (`--full --reason "release gate"`; it refuses a `--sweep-arg` of `--only`, `--pages`, `--widths`, `--schemes`, `--full` or `--reason`). The output of a scoped re-run is not a `--baseline`, a `--behaviour-sweep` or a fix-measure baseline; any sign of carried results (a run record that is not `full`, `carried` groups or checks, `scoped`/`carriedGroups` on a check) is refused at all three, whatever the other fields say.
- **Precedence**: `--only`, `--pages` or `--widths` is the caller's scope — no narrowing, the history neither read nor written. `--schemes` only constrains: a cell in a scheme the run leaves out is not measured and stays carried.
- **A group is fixed only after it stays absent.** A group confirmed in an earlier run and absent from a run that measured every cell of it is **intermittent**, not fixed: it is kept in the history (`effective.checks.<id>.intermittent`, with the run that last saw it), counted on its check (`intermittent`), listed in `summary.md` and `site-sweep.json` (`intermittent`), fails the check and the exit (1), and is measured again by the next scoped re-run. It becomes `fixed` when it is absent from 2 consecutive runs that measured every cell of it (`INTERMITTENT_ABSENT`); if it comes back it is open again and the count restarts. A run that measures only some of its cells, or whose cells are owed or timed out, does not count as an absence. The fresh-load confirmation (`confirmGroups`) lists every group it demotes, with its cells, the cells measured again and the reason (`confirmationDemotions`); a demotion never erases an earlier confirmation of the same group.
- **The history belongs to one source, not only to one URL.** `site-sweep.mjs` fingerprints the source's served home page (`lib/source-fingerprint.mjs`) before it chooses a history and stores it in the entry. A history whose fingerprint differs, or that records none, is not reused (a full run starts a history of its own: no run record or log entry of the old source is kept): a scoped re-run exits 2, and `--full --reason "<text>"` measures everything and starts the history again on the current source (`run.source` says `changed`). The fingerprint is read again before publishing; a source that changed during the run publishes nothing (exit 4).
- **A full sweep is reused by the patch chain only for the source it measured.** `quickstart/patch-chain.mjs` does not run the full sweep again when the sweep and its fix-measure record the same source fingerprint and the source read now (home page and declared template identity, as above) has it too; a missing fingerprint, an unreadable source or a different one runs the sweep. This establishes that the home page and the template identity are unchanged, not that every resource of the source is: a change that leaves the fingerprint unchanged is not seen.
- **States in `summary.md`**: a group confirmed in an earlier run and absent from two consecutive runs that measured every cell of it is `fixed`; one absent once is listed as `INTERMITTENT` with its last sighting; a check or group the run did not measure is `carried` with the run and evidence that measured it — never a pass; a measured check with nothing open is `pass in scope`.
- **Verdict and exit code** = what the run measured plus what it carries: a carried open group or `sweep.accept` error exits 1, a carried owed case 3. A scoped re-run writes no `fix-measure.json`; in it a `sweep.accept` row whose group lies outside the measured cells is left unvalidated (an error it had is carried until the row is gone or matches).
- **Refusals**: a history that is not a regular file, is empty, malformed, of another schema (`tracy-site-sweep-state/v2` is the one read) or that contradicts itself (a cell outside what the full run measured for its check, a check the sweep does not have, a run it does not record, an exit the checks do not give) exits 2 before any browser starts: move it away to start again with a full run. It is never read as a first run.
- **Publication is one transaction.** The reports of `--out`, the snapshot and the history entry are new together or as they were. Under `<out>/.sweep-out.lock` and `<run-root>/site-sweep-state.json.lock` (a lock of a process that is gone is taken over, a live one is waited for, then refused) the run checks that the history is still at the revision it started from — a run that finds it changed does not publish and leaves `--out` as it was — settles any open transaction of another `--out` on the same history first (`<run-root>/.sweep-pending.json` names it, so one transaction at a time is open per history), writes `<out>/.sweep-txn.json` and puts the old reports aside in `<out>/.sweep-aside-*`, creates the snapshot (a directory that exists is refused, never removed), installs the new reports, and commits by renaming the history file (a run with no history commits through the journal). An error before the commit puts the old reports back and removes the snapshot it created (exit 4). A run that stopped leaves the journal: the next sweep into the same `--out`, and every reader of a `site-sweep.json` (baseline, release gates, rounds), finishes it forward when the history has the new revision and back when it has the old one, and refuses — keeping the journal and the aside directory — when it cannot tell or cannot restore. Recovery removes only a snapshot, aside or stage directory that carries the journal's token (an empty one, or one holding only reports of the sweep, for the stage and a finished transaction's aside); an `--out` inside `<run-root>/site-sweep-evidence/` is refused whether or not the run keeps a history. An error after the commit is a warning: the run is published.
- **A hand-written measure script is only for a defect the sweep does not measure.**

Routes and hooks are paired from the dossier like every other tool, with no second rule: pages = `visual.contract.json` (the port's `path`, `sourceRoute`, the declared `status`; a source that cannot rewrite
is resolved through `lib/source-routes.mjs`), with no contract `spec/page-map.json`; dark/light hooks = `hooksOf` (`design.theme`, `source.darkHook/lightHook/darkRequestHook`, or
`review.config.json`). A port with unusual landmarks can declare in `review.config.json` `"sweep": {"header": "<sel>" | {"site","source"}, "main": …, "chips": …}`.

| check | measures | defect when |
|---|---|---|
| `overflow` | the document's `scrollWidth − clientWidth` | port > 1 px while the source is not; with the widest element sticking out (not counting elements clipped by an ancestor or `fixed`) |
| `scheme` | 6 states: system light/dark × no choice / saved light / saved dark; the page canvas + landmark surfaces (header, main, first card, narrow-column sidebar, footer) and the text colour of words that **occur once** in a landmark, paired port↔source by landmark and word (same element kind) | only what **the customer sees**: a surface on the other side of the scheme (light when the source is dark) or a colour drift of more than 3 channel steps; the port ignoring its own saved choice. A root that says nothing while nothing visible differs → `listed` ("attribute differs, nothing visible differs"). A surface almost fully covered by a child element (a wrapper) is counted by the child; elements parked outside the viewport (an off-canvas menu) and words repeated within a landmark are not paired. A source that does not accept the dossier's saved switch → that state **cannot be compared**, and is listed by name with a route count |
| `background` | the first flat background colour from the main content up to the canvas, and at the viewport's left edge | differs by > 1 channel step. A background picture or a translucent layer behind it → listed in `listed`, not counted |
| `header` | the header's bottom measured from the top of the page (a top bar inside the port's `<header>` but outside the source's `<header>` still counts), the *visible* edge of the first and last control (its words/icon/bar; the box if it paints itself) | drift > 2 px. **A different header box while the content below starts at the same y (2 px) → listed, not counted** (the rule of the hand script); a broken source header picture whose file answers 404 (actually fetched) → `notDefects`, both the height and the margin of the control holding that picture. Also the **type style** (size, weight, letter-spacing, text-transform; size drift > 0.5 px, weight ≥ 100, spacing > 0.3 px) of the site name/text logo, a call to action with the same words, and the main menu links whose words occur once on each side (`header-logo-font-size`, `header-nav-text-transform`…). An unnamed icon button (three bars, no `aria-label`) is recognised as the menu button; a control with a role on one side only, while the other side has only one plain icon button on the same edge, pairs by edge + shape, never reporting `header-control-extra` |
| `chips` | small labels with a background/border (≤ 3 words, ≤ 200×44 px, outside header/nav, not a CTA button): background, text colour, font, padding, radius, box size | paired by region (footer/body) + the section heading (compared ignoring `'`/`’`, `…`/`...`, case) + words, only when certain; the same label repeated in a section with **the same count** on both sides pairs by order. A chip that cannot be paired → the page is `not-measured` (exit 3) with the **cause** (section below), never "clean". A chip on one side only → its own group `chip-port-only` / `chip-source-only`. Size: a drift in the same height and a width that follows exactly the width of its words (both sides measure `textW`) → `listed` "text metrics only"; **a different height is a `chip-size` defect** (126.1×30 against 126.1×33.4 is a defect, not metrics). A source that did not load its web font → `listed` |

**Counted by cause.** Each check reports *defect groups* (same property, same selector/landmark, same drift) with route, width, scheme and occurrence count — "56 cases" of one header margin is ONE defect on N routes; the raw rows are in the JSON. A source that falls back to a system face demotes `text-visible-ending` only for the text block whose own source reading shows it (the block's first font family, else the page's body face, is not a font the source loaded while the port's is): the same route at another width or scheme, and every route where the source loaded its font, keep the defect. The cell must prove what was painted, not what the CSS asked for: the fonts the renderer drew the block's words with (CDP platform fonts, read for clamped blocks) are all system fonts; the FIRST family of the block's `font-family` is a web font the source declares (an `@font-face` in `document.fonts`) of which one ended in `error`, and every character of the block's text falls in the `unicode-range` of a face in status `error` that is also the face the block's computed style, stretch and weight select for that character by CSS font matching — stretch, then style (italic and oblique each preferred for their own, then the other, then normal), then weight, each in its directional order; a descriptor of the block or of a candidate face that cannot be read selects nothing, so the finding keeps its severity (a face of the same family that loaded for other characters, such as another script, does not veto this; a face limited to other scripts, of another weight or style, or one that is merely `unloaded` or still loading proves no font load failure for this text, and its range is not used as evidence) — a system font earlier in the stack, or a broken font further down it or elsewhere on the page, is not accepted; and the port's block asked first for a web font that loaded. A system font the source chose, a font still pending, a stack whose second web font loaded and painted, and a reading without platform fonts or without the `@font-face` list all keep the defect. When the source could not load its web font (the body falls back to Times…), the header height, the position of controls after the menu and chip sizes that depend on word width are `listed`; only the logo's left margin and the CTA's right margin (relative to the viewport edge) are still counted. Before fixing the port from this list, open the first group by hand (a separate measurement + pictures cut on both sides).

Source faults are not port defects and are separated with evidence, into `notDefects`: both sides overflowing the same way, a source header picture answering 404, a source route that is the web server's bare error page (no stylesheet).
### Recording source defects and decisions — `sweep.accept`

A defect group where the source itself is wrong (a badge still light on the source's dark page, the source's header breaking by itself at 320 px, the source's menu dropping a line at 1024 px), or a difference the port keeps on purpose, is **not** silenced with a global switch. The dossier lists each group in `review.config.json`, each row with evidence and exactly one decision:

```json
{
  "sweep": {
    "accept": [
      {
        "check": "chips",
        "cause": "chip-background|span.list-hits",
        "routes": ["/joomlart-content/list-of-all-tags"],
        "schemes": ["dark"],
        "decision": "D-57",
        "evidence": "evidence/badge-dark-source.png",
        "kind": "source-fault"
      },
      {
        "check": "header",
        "cause": "header-theme-toggle-inset-right|Δ10",
        "routes": ["/home/home-style-4"],
        "widths": [320],
        "decision": "D-58",
        "evidence": "evidence/hhomestyle4-320-source.png",
        "kind": "source-fault"
      }
    ]
  }
}
```

- `cause` is copied **verbatim** from `site-sweep.md` (each group prints `cause \`…\``) or `groups[check][].cause` in `site-sweep.json`. Matched character by character; a group matches at most one row.
- `routes` lists **every route** the row covers exactly as the sweep names it (the search page is `/?s=zqxwv`, with the query; no `*`, glob or regex; missing or empty is an error). `widths`/`schemes` are optional to narrow it (the scheme of the `scheme` check is the state name, e.g. `os-dark/no-choice`). A row covers exactly the defect rows within its route × width × scheme; rows of the same cause elsewhere are still defects.
- `decision` is **one** id (`D-57`), present in the dossier's `DECISIONS.md` exactly once (same parser as `parity-accepted.json`: `lib/parity-acceptance.mjs`); `key` (optional) is words the decision text must contain. `evidence` is a path that exists (absolute, `~/…`, or relative to the dossier) or an http(s) URL. `kind`: `source-fault` (the source is wrong), `decided` (the port keeps a difference by decision) or `not-measurable` (a case the tool cannot measure, measured by hand — see below).
- A wrong row (a route wildcard, a missing/duplicated/two-id decision, evidence that does not exist, an unknown `kind`) → **exit 2 before the browser opens**. During the sweep, a row **matching no group** is an ERROR (an old exception, a defect that is gone or a changed `cause`), a row **naming a route/width/scheme where the group does not occur** is refused, and a defect row covered by two rows at once is an ERROR: that check is `pass:false`, exit 1, the faulty row moves nothing.
- A matched group moves to `notDefects` (keeping the decision, evidence, kind), is not counted in `defects`, and the check no longer fails because of it. `fix-measure.json` carries one `notDefects` row per group (`what`, `why: "source-fault under D-57…"`, `evidence`) and the check's `note` records the number of accepted groups. A sweep with `--only` dropping a check skips that check's rows (or routes/widths outside the sweep), never treating them as stale.
- A chip only the port has (a share button the source lacks) is the group `chip-port-only|body|facebook`: a decision records it through exactly this mechanism.

### Unmeasurable cases recorded by a hand measurement — `kind: "not-measurable"`

A *not-measured* cause (`icons-unpairable`, `icon-covered`, `theme-control-not-found`, `touch-control-not-found`, `form-purpose-unknown`, `drawer-close-not-found`, the causes of `chips`…) used to be unrecordable: the check stayed `pass:false` with 0 defects and a fix version could never all-pass. Now the dossier measures by hand and records:

```json
{ "check": "icons", "cause": "icons-unpairable", "kind": "not-measurable", "cases": 50,
  "reason": "the source's topbar social links sit outside <header>; the port's sit inside, with other names",
  "measurement": "both sides draw the same 2 social icons at 1440 and 390, same boxes and places (evidence/icons-1440.png)",
  "evidence": "evidence/icons-1440.png" }
```

- `cause` is copied verbatim from the *not measured* line of `site-sweep.md` (or `checks[].behaviourCauses` / `notMeasuredCauses`). `cases` is the number of cases the hand measurement covers (a positive integer); `reason` why the tool could not read it; `measurement` what the hand measurement saw; `evidence` a path **that exists** or a URL. **No** `routes`, `widths`, `schemes`, `decision`, `key`: the row covers that cause across the whole sweep, at most `cases` cases.
- Cases measured ≤ `cases` → the cases leave `notMeasured`, the check no longer fails because of them (if nothing else is left); the cause **is still listed** in `site-sweep.md` (section *Accepted*, with the case count, `reason`, `measurement`, `evidence`) and in `fix-measure.json` (`checks[].notMeasurable: [{cause, cases, recordedCases, reason, measurement, evidence}]`, one `notDefects` row, the check's `note`). A chip with several causes is closed only when **every** one of its causes has a row.
- Cases **more than** `cases` → ERROR (`grew beyond`) and the cases stay not-measured, the check fails again; a **new** cause with no row → still not-measured, the check fails; a cause that no longer occurs → a stale row (ERROR). Routes/sweeps **not measured** (`owed`: unreachable, past the deadline) can never be recorded this way.
- Before recording, narrow down what needs recording: a source that **has no** control of that kind (no theme button, no parent item opening a panel) while the port has one → "nothing to compare", goes to *listed* (`theme-no-source-control`, `touch-no-source-control`), not not-measured; header icons are paired by host/name, then by **purpose** (theme, search, menu, social…) and the internal page they point to, so differing counts on the two sides are no longer `icons-unpairable` if purpose decides; an icon left over on **one** side is `icon-only-source|port` (a real difference), only leftovers on both sides that cannot be told apart are `icons-unpairable`; a chevron button opening a sub-menu is not an icon.

### Unmeasured chips: causes and how to close them

The `chips` check passes only when every case is measured or recorded through `sweep.accept`. A chip that cannot be paired with certainty is no longer a generic "not measured" — `site-sweep.md`, `checks[chips].notMeasuredCauses` and `notMeasured.chips[].causes` give the cause, the chip count and examples:

| cause | meaning | closed by |
|---|---|---|
| (closed by itself) repeated label, **same count** on both sides | "New" ×7 in one section | the tool pairs by order — if the order differs in colour, that is a real defect |
| `repeated-label` | the same label but a different count in the section (with both numbers: "2 on the source, 3 on the port") | a real content difference: fix the port or record a decision; the tool does not guess which chip is which |
| `nested-painted-boxes` | a painted box inside a painted box with the same words but a different size | `sweep.chips` names exactly the element that is the chip on both sides |
| `no-counterpart-section` | the label exists on the other side but under a different section heading | the same heading on both sides, or `sweep.chips` |
| (no longer unmeasured) on one side only | a share button only the port has; a source tag the port lacks | the group `chip-port-only` / `chip-source-only` — fix or record through `sweep.accept` |
| (not a chip) a hidden 0×0 anchor | draws nothing | dropped from both sides |

Live counters in a label ("Hits: 442", "12 comments") are not the label's words: labels are compared with the numbers dropped (`Hits: 383` and `Hits: 442` are one chip, the word difference is *listed* `chip-words`). An icon link with no words is named by its accessible name (`aria-label`/`title`), so it can pair with a chip with words of the same name on the other side. Chips read at the second width (390) are always a **fresh load** at that width, not a resized page (a resized page can pair differently from a freshly loaded one: carousels clone again, lists reorder); `--reload` loads everything fresh.

A painted `li` holding a painted `a`, with the same words and the same box (± 2 px), is **one** chip (the innermost element, the one on top, is taken). `h1`–`h6` are among the default candidates: a title drawn as a pill (with a background or border, a small box, ≤ 3 words) is a chip, no need to list it again.

`sweep.chips` (a CSS selector, one string or `{"site": …, "source": …}`) **replaces outright** the default candidate list on that side (`a, span, li, small, em, strong, div, p, h1–h6`); use it only when the chip box sits on an unusual element or to pick the right element in nested boxes. The remaining filter (background/border, ≤ 3 words, 12–200 × 12–44 px, outside header/nav) still applies:

```json
{ "sweep": { "chips": { "site": "a.tag-cloud-link, .wp-block-post-terms a, h3.je-pill", "source": ".tagspopular li a, .category-name a, h3.je-pill" } } }
```

### Running a baseline

`--baseline <directory or site-sweep.json of the previous version's sweep>` takes the check count from that sweep's own `checks` (it may run **without** `--zip`, `fix-measure.json` is not required). Its version comes from `--baseline-version <v>` or from the zip that sweep was given: **a baseline run needs `--zip <the previous version's theme zip>`** (the zip names the measured version) **or `--baseline-version <v>`**; missing both, the error says exactly this sentence. The baseline must run the same checks as the current sweep: **the default is all eleven checks** (no `--only`), so a five- or ten-check baseline run against an eleven-check sweep is refused before the browser opens, with a sentence on how to fix it (`--baseline ran 5 check(s) (…), this run 11 (…): not the same checks. The default run is all eleven checks: run the baseline again with the same checks …, or give this run --only <the baseline's five checks>`).

Exit 0 only when there are no defects **and** nothing left unmeasured; a partial sweep is never 0. With `--zip` it writes `fix-measure.json` (`tracy-fix-measure/v1`, `artifact.themeZipSha256`;
`--baseline <output of the previous version's sweep> --baseline-version <v>` for `baseline` (the previous version's sweep ran with that version's own `--zip`, or give `--baseline-version <v>` when it had no `--zip`; `site-sweep.json` carries `fixMeasure` only with `--zip`). `baseline` carries each check (`baseline.checks: [{id, pass}]`), so `release.mjs --patch --measure` takes it directly and keeps it by `id`; a port with its own checks builds the measure with `lib/fix-measure.mjs merge --baseline-measure`, see [`quickstart.md`](quickstart.md) §Release a fix version.
Real measured time: JA Essence 31 routes × 6 widths × 2 schemes = 2m36s (the hand script: 48 minutes). A page is loaded once and then resized through the widths (`--reload` reloads at each width; tried on two Essence routes, both ways gave the same header measurement).

### Five behaviour checks (`fixed-widgets,icons,forms,text,first-interaction`)

The five property checks above do not see what the customer **does** or **sees** that is not a property of a box: a back-to-top button with the right box but a white chevron on white, a different set of social icons, a form's `required`/focus, an excerpt cut at another place, a theme button that does not change on the first press. These checks live in `site-sweep-behaviour*.mjs`, **run by default with the other five (no `--only` means all ten)**; `--only` narrows, same output, same `sweep.accept` (`check: "forms"`…), same standard of "count only what can be seen or pressed": a difference nobody sees → *listed*; an uncertain pairing → `not-measured` with the cause; a source fault → `notDefects` with evidence. Each page is reloaded at the case's exact width (not resized), so there are no "only shows after a resize" defects.

| check | measures | rule |
|---|---|---|
| `fixed-widgets` | `fixed`/`sticky` elements after scrolling (back-to-top, floating buttons, cookie bar); by default at 390 and 1440, every scheme | paired by viewport corner (a single one in the corner, on each side) then by name; box > 2 px, position > 3 px; **a sign of whether it is visible**: a small picture of the widget **with and without itself** (the widget hidden), the differing points are **the widget's own paint layer** (a background picture behind it does not count); a widget covering ≥ 50% of its box is a tile (tile colour = "background"), the rest (bare glyphs) is `transparent` and its background colour is not compared; a point differing from the background by > 48 is "ink"; ink < 0.4% = an empty box (a white chevron on a white tab) — ink on the source but none on the port is a defect; a widget background colour differing by > 48 is a defect; a corner with several widgets whose names do not match → `widgets-unpairable` |
| `icons` | icon controls (links/buttons with no words, with svg/img/i/glyph) in the header and footer — the region recognised by `header`/`footer`/role, or an id/class carrying that word in the right place; logos and `fixed` elements not counted | paired by the link's host then name, then **purpose** (`role`: theme, search, menu, cart, account, rss, social) and the internal page it points to (each time only when exactly one is left on each side), then order (only when the remaining counts are equal); an `inline` link takes the box of the element drawn inside it (not a line of text); a chevron button opening a sub-menu (`sub-menu`/`caret`/`chevron`, or an `aria-expanded` button beside a link in a nav `li`) is not an icon; control box 2 px, position in the row relative to the first icon 3 px, the icon's **ink box** (not the element box) 20%; a mark of a different shape at **the same size** counts only when the pixels differ strongly (ink ratio off by > 2.5×), otherwise *listed*; a source drawing icons with a font that failed to load (no ink) → *listed*; both sides covered → `icon-covered`; left over on **one** side after pairing → `icon-only-source|header` (or `port`), left over on **both** sides where name, purpose and link do not decide → `icons-unpairable` (recorded with `not-measurable` after a hand measurement) |
| `forms` | every visible form, paired by purpose (login, registration, search, contact, newsletter) + region; at 390 and 1440 | field count, type, `required`, the field focused on load, the **visible** placeholder and label (a label only for screen readers, `display:none`, `font-size:0` or a sizeless wrapper does not count; words drawn beside a field with no `<label for>` — `Remember Me` in a `span` — are its label), the form box 2 px, links in the form region on one side only (a group needing a decision; **the region is the visible region**: links in the same landmark as the form, no more than 100 px from the box of a field/label/button, whatever element wraps them — `<form>`, a wrapper or nothing; a link drawn as a button on one side and a `<button>` with the same words on the other are the same button), the focus style of the first text field (border/outline/ring before and after `focus()`); field names belong to the CMS → *listed*; text/search/email/tel/url drawn alike → *listed*; a form that also wraps a title, lead paragraph, list or links the other side leaves outside, while the field, label and button boxes are alike (2 px) → *listed* `form-box-wraps-content` (a different control box is still a `form-box` defect); an unknown form with no pair → `form-purpose-unknown` |
| `text` | text blocks (cards, excerpts) and `nav`/`breadcrumb`/`pagination`/button labels; 390 and 1440 | blocks paired by their first 20 characters (several blocks with the same start — a carousel cloning slides — pair by **content**: equal words and equal visible words first, not by order); **the visible words after every ancestor clips** (overflow hidden, line-clamp) compare the ending: a server-side cut (a `...` tail) against a CSS clamp, same tag → a `text-cut` defect; a short block that is a whole sentence, or a different tag = the same words grouped in different elements → *listed*; a clamp differing only because the source font did not load → *listed*; labels paired by (kind, region, case-insensitive words): `innerText` differing in case (text-transform), size 0.6 px, weight, letter-spacing 0.3 px |
| `first-interaction` | the home page: (a) the theme button on the **first** press in each state — system light/dark × no choice/saved light/saved dark/old `auto` value — at 390/768/1440; (b) taps at 1024 and 1180: the first tap on a parent item with a panel; (c) the drawer at 390/768: opening, the row list, the back row (words, size, weight, box, whether pressing goes back), the close button, and **the strip beside the panel** | (a) one side flips the page and the other does not, or flips to another scheme → defect; a state the dossier cannot put a side into (no `auto` hook, that side does not accept the hook) → "States not compared", not counted as measured; (b) the results of tap 1 and tap 2 (go to the page / open the panel / nothing) differ → defect; (c) the strip beside the panel is shot as a grid of 8 px cells, **each side compared with that same strip with the drawer CLOSED**: each cell is "unchanged", "darkened by ratio k" or "changed otherwise"; ≥ 4 cells where the two sides have a different effect (or k off by > 0.15) → `drawer-open-strip` (different page content under the strip, such as a hero, is not a drawer defect); a page shifted differently while the strip is alike → *listed*; drawer rows are **visible** links (words drawn, not a label only for screen readers; not covered at their centre) that newly appear and are **not** links of the page pushed sideways (same words, same href, same line, x shifted); the cause `drawer-rows|rows` **carries no count** (the number of missing/extra rows is in `source`/`port`); the back row is the innermost element matching the rule (`button` in `li.…-back`); a second tap that reloads exactly the page it is on counts as navigation; a source that **has no** theme button / parent item while the port has → *listed*, not not-measured; a source page that is the web server's bare page → *listed* `bare-source-page`, not compared. A control not found by role/name/shape → `not-measured` with the reason, **never clean**; `review.config.json` `sweep.behaviour` (`themeToggle`, `drawerToggle`, `drawerClose`, `subToggle`) names selectors for an unusual port |

Each check prints: the number of cases measured, defect groups by cause (route, width, scheme), *listed*, `notDefects`, `not-measured` by cause, and goes into `fix-measure.json` like the other checks. Real runs on Vega/Impact/Kinetic: 1m40s – 2m30s per port (34/26/30 routes). Notes from use: the names `fixed-widget-only-port`/`only-source` on a 404 route are usually the source's bare error page (a dossier decision), `text-differs` in the footer is the copyright line carrying the source's site name.

### Icons and short labels — top band, drawn glyph, changed words

This section supersedes the coverage-only icon comparison and the equal-words-only label comparison described in the table above.

- **Top band.** The `icons` check pairs the controls of the visible top band: what the declared `<header>` holds, plus controls that sit above it
  (a topbar drawn as a sibling before the header, within the first 200 px of the page). A topbar outside `<header>` on one side and inside it on
  the other is the same row; landmark nesting alone is never `icon-only-*` or `icons-unpairable`. Content, sidebars, the footer and anything below
  the header are not part of the band, and a page that declares no header has no band (its named box stands in, as before). Pairing order: link
  host or accessible name, then **network** (`twitter.com`, `x.com`, `x-twitter`, a lone `x` class token are one network; a word that merely holds
  the letter, or a close cross, is not), then purpose, then internal page, then **place** (same row position and size; the two controls are each the only candidate of the other — a port control that stands at the
  place of two source controls pairs with neither), then elimination (one control left on each side); several left with no such evidence
  are `icons-unpairable` (not-measured), never paired because the counts happen to be equal. The top band's lower bound is the header box the
  region is read from — the declared `<header>` or, on a page with none, the one visible box named so.
- **Drawn glyph.** For two paired controls that both draw ink, the probe photographs the control and reads its *shape*: the coverage (0–9) of each
  pixel against the colour most of the box holds. When the control or a box inside it paints a tile (a round or square badge) the page around the
  tile and the tile's rim are left out, so the glyph on the tile is what is compared; the control's own border (a divider between controls) and a small patch of page showing in a rounded corner of the box are left out too. The two shapes are cut to their painted box (size stays the
  size checks' business), resampled by area, blurred by one cell and compared as a fuzzy intersection over union at the best shift of one cell.
  Below `GLYPH_LIKENESS` (0.68) the finding `icon-glyph` is a defect, cause `icon-glyph|<land>|<network or name>`, with `sourceShape` and `portShape`
  pictures (`#` painted, `+` partly) and `likeness`. Calibration on rendered fixtures: the same glyph at the same or ±1 px size reads 0.79–1.00
  on tiles from 12 to 48 px; a different glyph reads 0.43–0.60; Morgan's bird against X reads 0.41, its same-glyph pairs 0.77–0.79. A control that
  could not be photographed (on either side, or that the page removed while it was scrolled to) is `icon-not-rasterised`; a shape that could not be
  read, absent or with nothing painted, is `icon-glyph-not-read` (both not-measured); a control with no ink on either side is listed
  (`icon-no-mark-either`). Every paired icon therefore has a measured glyph comparison or a named gap.
  `icon-glyph` goes through the same fresh-load confirmation as `icon-mark-size` and `icon-pixels`.
- **Short labels.** `text` also reads logo (the link home of the header, or a box named logo/brand/site-title), nav, breadcrumb, pagination, button
  and footer lines under 30 characters, with the page they link to. Labels with equal words pair as before (case, size, weight, letter-spacing).
  The rest pair by *evidence*: in each kind and landmark, between the same two labels that paired by words, by the same link target, or by the
  one label that stands within 120 × 60 px of it (page coordinates) and for which it is the one that stands there; the logo, one link home
  by its role, pairs by elimination. An equal count of other labels is no evidence. A line of the footer is read whole across its inline
  children (`Powered by <a>us</a>` is one line). Changed words are `text-label-differs` with both strings, cause `text-label-differs|<kind>|<land>|<source>><port>`; a number in a
  button or a footer line (a counter) is not other words, but in a pagination, breadcrumb, nav or logo label the number is the label. A paired
  label has its size, weight, letter-spacing and transform compared whatever its words are (`label-size`, `label-weight`, …). A label with nothing in its place on the other side (left alone between the same two paired labels) is a defect of its own, `text-label-only-source`/`text-label-only-port`; several on both
  sides with nothing to tell them by are not-measured (`labels-unpairable`), never guessed.
- **Logo type.** `header` compares size, weight, letter-spacing and case of a control paired by role even when its words differ; the wording is the
  `text` check's finding and no longer disables the type comparison.
- **Live verification.** `scripts/test/site-sweep-glyph-pilot.mjs --profile morgan` runs the production command on the live Morgan stands,
  keeps argv, stdout, stderr, exit code and the fresh reports under `--artifacts-root`, and inspects the findings itself (see `tools.md`): the X
  glyph and the logo wording on every route × width asked, no topbar icon left over on one side, nothing not-measured. `morgan` is the only
  profile; a stand that does not answer is exit 2 (nothing measured), never a pass.

### The eleventh check — `heights`

Two fix versions right after the ten-check sweep still had the largest class of defects that no check measured: the port's page taller/shorter than the source at some widths because the layout steps at another width (breakpoint 992 instead of 1200, a `container` step, the column count, a padding step, a picture ratio, a band printed twice or missing, a core rule forcing a column count) — each session wrote its own height-measuring script and spent one to three extra fix rounds. `heights` is that measurement, with the same rules as the other checks (count only what the customer sees; an uncertain pairing → *not-measured*; a source fault → `notDefects`; grouped by cause; `sweep.accept` including `not-measurable`; into `fix-measure.json`).

**What is read.** Each route × width, both sides, **one fresh load at exactly that width** (a page is not resized through the widths: a layout a script built at the first width would not re-flow). The widths are the sweep's widths **plus 576 and 992** (where a Bootstrap-style layout steps) unless `--widths` is given by hand, then exactly those widths. The light scheme (if any), since height does not depend on the scheme. Read after `document.fonts.ready`, after one scroll through the whole page so pictures in view finish loading, and once the layout is quiet: three reads 250 ms apart are equal (±1 px), no earlier than 1.2 s, capped at 7 s from the end of the scroll — a page that never settles (a self-scrolling carousel, masonry running forever) on a side where it differs is *not-measured* `layout-not-quiet`, never a defect. Read: the page height, and the **bands** in order — header, each band of `main` (going through wrappers that hold only one box and no padding, and the `entry-content`/`t4-section`… boxes), footer — each band with its y, height and a tree of child boxes (columns, padding, margin/gap, font size/line-height, picture boxes). Header/footer are still bands when out of flow (an overlay header). The dossier can set `sweep.header|main|footer` for a port with unusual landmarks.

**Pairing bands.** Header↔header, footer↔footer; the remaining bands by order and by the words of their first heading (matched ignoring punctuation and case): between two anchors with the same heading, an equal band count pairs by order (the words may differ — that is content, not height); a band with a heading on one side that the other side has nowhere → `band-missing` (only the source has it) / `band-extra` (only the port has it) / `band-doubled` (the port prints the same band twice). Differing band counts that no heading can rescue → *not-measured* `bands-unpairable`. A region one side cuts into two bands and the other keeps as one, adding up to the same height (±tolerance), is not a defect (recorded in the cell's `notes`).

**Accepted and `net`.** An accepted height only offsets a difference present in the cell: a cell with |delta| within tolerance has `net` equal to `delta` (the accepted figure is still recorded on the cell for tracing), so an acceptance never creates a defect by itself; a cell with an open finding is still a defect.

**A defect is a CAUSE, not a cell.** A band drifting past the tolerance is broken down: words one side has that the other has nowhere, sized as the band's difference, come first; then the padding of the band and of the wrappers that only wrap it (measured as the distance from the box edge to the first/last content, so the same gap from padding or from a child's margin counts as one); words taking a different number of lines are called `text-wrap` before the padding of the box around them; then the **first** child box (in page order) that drifts, going down until it can be said in computed style: `column-count`, `padding-step`, `spacing-step` (margin/gap), `font-size-step`, `line-height-step`, `image-ratio` (picture box ratio at the same width), `width-step`, `text-wrap` (same width, different line count), `text-cut` (a fixed-height box, overflow hidden/clip, cutting words on one side: the source cuts at 3 lines, the port shows 4), `element-missing`/`element-extra` (a "Share:" row, a second copyright line), `element-count` (the two sides split into a different number of boxes and the words do not point to which box — honestly, it cannot say yet), `gap` (the space between two bands), `accumulated` (every band within tolerance but too much in total). Two adjacent bands drifting in opposite directions with equal total extent are a shared edge standing elsewhere — not a defect when the content of the whole region matches (see below), a finding when it does not. A picture placed inline in a block box is still counted as a picture. The cause key names the band and the kind of difference, **with no pixel figure** — `heights|<footer|header|band:<the port band's class>>|<kind>[|<element>]` — so a `sweep.accept` row covers the cells it explains and does not go stale when the number changes. A group lists the routes and widths it explains (a step by width shows at once: "at 992–1180") with the px range; the table prints `port − source` for each cell. **A constant difference shared by every route** (a second footer line dropped by decision: −21 px on every page; −42 at 390 from wrapping) is **one group** `heights|footer|element-missing|…`, not one group per route; when it is recorded with `sweep.accept`, the height it explains is **subtracted from the cell** (`net`) before the other cells are weighed, so a route that drifts further from another cause still shows. Two bands drifting in opposite directions (+64 and −64) do not cancel: each band is a group.

**Read only what is visible (ink), never use a size as evidence of "absent".** Headings, `key`, leaf words (`words`/`tx`), `ot`/`tfs` (font size), the values of `input`/`select`/`textarea` and a block's identity all go through **one** visible-words walk in `heightsInPage`. Words have ink when the parent element is displayed (no `display:none`, `visibility:hidden`, `opacity:0` on it or an ancestor), the text colour is not transparent (including `-webkit-text-fill-color`) and **some part of the words lies in the unclipped area** (overflow, `clip`, `clip-path: inset`, a negative `text-indent` pushing it off the page): words cut midway keep only the words — at the edge, the letters — still showing. A clip window no larger than 1 px² (screen-reader-only style) cannot show a glyph. Form values: a single-line field is measured letter by letter in its own font within the content box; a placeholder uses its `::placeholder` colour (a transparent value does not hide a placeholder that shows); a `textarea` is rebuilt in an off-screen copy box (with its `white-space`/wrapping and scroll position, including `wrap="off"`) and then read word/letter by word/letter; a password field with a value shows no words and no placeholder (a placeholder shows only when the field is empty). A subtree that `depth 12` or `budget 600` folds **does not become one leaf**: it keeps all its leaves (boxes with words or pictures, laid out flat, through the same filter) together with the words the boxes in between hold themselves, so the number of boxes one side wraps around the content does not change what the customer sees; a band with more than 3000 leaves (or boxes) is marked `capped`, its content is not compared and the cell is `not-measured` `content-not-read`. The content of a closed `<details>` (except the first `<summary>`) and of a `content-visibility: hidden` box does not show even though their boxes still have a size. Each leaf remembers where it **is drawn** (`ink`: the box of the visible words, or of the clipped picture; `part` when the words are cut midway at the edge of the window): the padding of the surrounding box is no evidence of position. An out-of-flow box (`absolute`/`fixed`) with ink, an empty out-of-flow background-picture box and an `<hr>`/separator with a border or background are leaves of their own (taking no part in the height measurement); words a box holds itself beside its child boxes are also a leaf. A picture has ink when it is displayed, partly visible in the clip area **and draws something**: the picture is drawn at its size on the page and only the part visible in the clip area is scanned, any pixel that is not fully transparent is ink (a 1 px line in a large picture is still ink); a fully transparent picture, an svg with nothing to draw, or an empty `<picture>` is no picture. An svg draws only when one of its shapes is displayed, not faded to 0 (itself or an ancestor within the svg), has a fill/stroke and its drawn part lies within that shape's own clip area; a `clip-path` other than `inset` (url(#clip), circle, polygon) and masks are asked of the browser directly with `elementsFromPoint` **at the centre of each CSS pixel** of the part that should show, then on a finer grid (a quarter px in one direction, two px in the other, and the reverse; for a shape with a clip-path/mask also a 1/16 px grid), scrolling to it if outside the window and back again, at most 300000 queries per page: a line thinner than 1 px is seen. A grid exhausted with no hit does **not** prove nothing is drawn (a streak narrower than every grid, a dot smaller than a pixel): the result is `unk` — ink not established — unless the clip itself is empty (a clipPath with no shape that has an area, or every shape lying entirely beside the clipped shape in the same coordinate space — not provable when the clipPath, a part of it (including every descendant, or `use`), the shape or any element between the shape and the element carrying the clip has a transform — the attribute, CSS `transform`/`translate`/`rotate`/`scale`/`offset-path` — or there is a nested svg in between) or the visible area is empty. An `unk` on **one** shape makes the whole svg `unk` even if another shape clearly draws, and it reaches the metadata, the asset identity and clone filtering (the cell becomes `ink-not-established`, never silent). A shape that takes no pointer, a page that cannot be scrolled to, or a query budget run out is **ink not established** (`unk`): still a picture, but with an identity of its own (never equal to another picture, never a clone), paired with no picture on the other side, and the cell is `not-measured` `ink-not-established` — never silent. Words in an svg are drawn with the SVG's paint (fill or stroke with their opacity) on the element holding the words — a `tspan fill="none"` has no words — and are clipped by the clip-path/mask around them (the browser is asked word by word); `title`, `desc` and `style` in an svg are not words; metadata and clone identity use those same words. What cannot be placed pixel by pixel (`object-fit`, a box too large, cross-origin, not loaded) and video/iframe are treated as drawn — there is no evidence otherwise. A pixel with a real colour, or a clipped rule still 1 px high, is still ink. A box under 1 px high is still a box if it holds ink; an empty box is a spacer and quiet.

**Things only one side has are looked for in every band, including bands of equal height — and a pair of leaves pairs only with evidence of position.** For each paired band pair (including within tolerance), each region one side cuts into several bands, each pair of bands drifting in opposite directions and each small band with no counterpart: word leaves and picture leaves pair **one-to-one, maximum matching** (augmenting paths for each group with the same words — not greedy, so no leaves are left over when a full matching exists). A pairing is evidence that both sides draw the same thing in the same place: (1) the same **entire visible words** (a digest of the whole string), or pictures of the same size (twice over) — the same words, the same picture size or an accepted height cause is **not** enough; (2) at a supported position, measured from the top of the two boxes being compared and by **where it is drawn** (`ink`): horizontally the drawn left edge, the drawn **centre** (centred words) or the box's left edge (words in a padded link) within tolerance (plus the difference in left edge and width of the two boxes themselves); vertically the top edge within tolerance plus the height difference of the two boxes (a box 40 px taller can push a leaf below by 40 px, not 400); when the two boxes are equally tall the leaf's bottom edge and height must also be within tolerance (the right edge of wrapped words is ragged so it is not weighed); (3) or **drift** (the drift of a long band: content above it grew or shrank): the leaf stands for its counterpart between two leaves already paired on either side (keeping reading order) and is moved up/down no more than those leaves are moved — the tops of the two boxes count as paired at a shift of 0; the bottom of the band is **not** a measured line (even when the following band is paired by a heading or a footer: a landmark says nothing about the distance to it) — a leaf keeping the same distance to the bottom is not paired for that, only drift between two paired leaves (at most two rounds) gives it; a leaf that jumped past its neighbours, or moved further than they did, is not supported; (3b) or an **anchor box**: a shift pairs leaves only when it is the shift of a box whose correspondence was proven independently, not from leaves shifting alike. A box is the same element on both sides when it measures the same size (width, height within tolerance, a box of zero width or height does not count) and (a) holds **the same complete set of visible leaves** — from 3 leaves up whatever the element, with 2 leaves it must be the same landmark kind (`header`, `nav`, `main`, `footer`, `aside`, `form`, `section`, `article`, a list, a table, or with a `role`) — and is the only box with that set of leaves on each side (nested boxes with the same set of leaves are one box, the innermost taken), or (b) stands at exactly one place on the page (left, top, width, height within tolerance), is the only box at that place on each side, and holds leaves each side has exactly once (2 leaves of the same landmark kind, 3 leaves if not). Within that pair of boxes, a leaf keeping its place **within the box** (plus the box's shift: horizontally no more than a fifth of the width, at least 64 px, and vertically at exactly its place in the page or in the band) is the same leaf and quiet; a leaf whose words occur only **once** on each side within the box is the same leaf even when it stands elsewhere, and that other place is its own finding `element-moved` (not quiet, not missing/extra) — this pairing is done only after rows and reflow have had their say. Leaves of a carousel slide (`comp`) never pair through a box. Carousel containers and slides also pair only **one-to-one**: a container (or slide) whose leaves, paired at their own places, point to more than one container (slide) on the other side, or that is pointed to by more than one, is not paired; a slide pair also needs its two containers to be a paired pair; and a paired leaf testifies for its container and slide only when the **box** also matches — the leaf must be paired **at the same place** (ink within tolerance, not a leaf brought by drift, a box shift or a moved place — two carousels with the same title do not swap identity through a shifted leaf), the slide box (`sr`) of the same width and at the same place in the root (the height follows the content so it is not weighed; the container box is not weighed because the track is as wide as all slides or as one slide depending on how it is built); a container pair also needs **the slide box of every slide** read: no other container on the other side (or this side) has a slide standing exactly where a slide of the pair stands — stacked carousels, equal boxes, not told apart by repeated words — and the slide pair is the only box matching within the paired container, both ways: the same words at the same place through a slide of another size or another container is only a content match, it does not say which container or slide is which; cut words and the phase exemption apply only within that pair. Likewise a leaf (words, or a picture of the same size) whose counterpart on the other side is **clearly the nearest** — words occurring only once on each side, or the other leaf is its nearest and it is the other's nearest, the next nearest leaf one and a half times further away (distance measured in the band's frame and in the page frame, the smaller taken) — shifted horizontally no more than a fifth of the width (at least 64 px) and no more than 300 px vertically, is the same leaf moved: `element-moved`. Two equidistant leaves, words in several leaves with no clear nearest, or a larger shift, do not tell which leaf is which: they become `shift-position-unproven` (not-measured), establishing nothing else; a paired leaf pair, or a candidate pair, never testifies for another leaf (only an anchor box establishes a shift); (4) when the two boxes lay their content out in a different column count (measured), the remaining run of leaves in reading order is only a **candidate** (`reflow-position-unproven`, not-measured) — not paired, and no evidence for any other pairing. Every leaf-comparing loop is bounded by work (4 million pairs per box) — past it the remaining leaves are findings, never silent. The other cases do not stand in for each other: **carousel slides** are never concluded to match: slides in the same cell (same box place, same size) with different wording, the same distinctive words at another place or in another container, or a slide shifted by a whole box width are only **candidates** — their leaves do not pair, and become not findings but `slide-pair-unproven` (not-measured, one row per cell, grouped by cause); leaves of a slide with no counterpart yet in a container a candidate shows to be shifted, or a slide cut by the window, also become `slide-pair-unproven` leaf by leaf, not the whole container; a slide with no counterpart where there is no candidate, a changed caption or a featured picture placed off within the slide are still findings; cut words match a leaf that says it in full only in **the very slide paired by a measured position**, not merely by the same shift vector; words one side holds in **one** leaf that the other side splits into several leaves lying wholly within where that leaf is drawn, reading in order to exactly those words, are the same place (a number and its label in one block or in two paragraphs); different wording is `text-changed` (a finding of its own); the rest is `element-missing`/`element-extra`. A picture one side places as **the background of a box with content** (`#bg`, cover image) and the other side places as an `<img>` inside that box is one picture placed two ways (the background size differs from the box size, so it pairs by place, not by size). Picture pairing diagnoses resizing (`leafDiff`, same words different height → `text-wrap`, `width-step`…) apart from evidence of equivalence. An icon drawn as a picture on one side and as an icon-font glyph on the other is one icon only when the glyph is at the picture's place (compared under the same position rule).

**Structural evidence around a leaf (the probe reads it from the page, attached to EVERY leaf it emits — ordinary leaves, direct words, background pictures, leaves in a folded tree).** Each leaf carries `ab` (the surrounding boxes up to 5 levels, with `row`/`cols`, and the box's element: `tag`, `role`) and `sl`/`sr`/`sc` (whether the outermost slide box within 5 levels is one of several boxes of the same size in the same row, its box, and the containing box). Only the three forms below, plus the anchor box of (3b) above, nothing more: (1) **row**: ≥ 2 leaves of the same height, same words, same order, in a shared row-laid box starting at the same left edge; each leaf sits in a cell (the child box of the shared box that holds it) and the cell shifts by exactly how much the cells before it widened/narrowed (the gap between two cells changes by at most one tolerance): two leaves in the same box where the second shifted far with no measurement to explain it is a finding; (2) **column-changing reflow**: a run of ≥ 2 consecutive leaves between two paired leaves, same words same order, in a row-laid box on one side and a box with the same left edge/height laying out a different column count on the other, each leaf in its own cell, the cells within the box and in reading order — there is still no measurement of each leaf's own position, so it is only a candidate (`reflow-position-unproven`); (3) **carousel**: pairing slides by cell, by a slide's distinctive words or by container width gives only candidates (`slide-pair-unproven`); a slide counts as the same slide only when one of its leaves is paired by a measured position (words repeated on every slide do not count) **and** the slide boxes on both sides have the same width and the same place within their roots, in which case a changed caption is a finding and cut words match a leaf that says it in full within exactly that slide. A candidate is never evidence for another pairing; a cell with both a candidate and an independent finding (logo, content, height) is still a defect.

**A shared multi-band region is exempt only when the content of the whole region matches.** Extent only **selects** the region: one side cuts the region into several bands whose bands after the pair, **before the pair** (a thin band outside the source's `<header>`, inside the port's header), or both, add up to the height of the box on the other side (`groupSplitBands`); two adjacent bands drifting in opposite directions with equal total extent (`alignBands`). The whole region is compared for content as one box (together with the logos of the pairs in the region): a block lost in the region, or a block moved, is a finding — never silent just because the extents are equal; `--explain` goes with that group (the "nearest" group is only for diagnosis and is clearly labelled as not merged by the judge). A small band with no counterpart (≤ 8 px) belongs to the other side only when a band with no counterpart **standing at the same place in the page** (between the same two paired bands) holds exactly those leaves at exactly their places in the band; the same words in a distant band are not enough.

**What could not be read is said out loud, never silent.** A `capped` band (over 3000 leaves) and pictures/svgs with `unk` make the cell `not-measured` (`content-not-read`, `ink-not-established`) on top of the findings it already has; the order of judgement for the cell, for `--explain` and for the exit is **defect → not-measured → quiet** (a defect is a defect even if another part of the cell is unmeasured). A band's height is split by what **was measured**: the probe takes each leaf out of the flow one at a time (`display:none`, at most 400 leaves per page) and reads the band's height before/after (`fx`) — a leaf in a fixed-height box, or overlapping another leaf, gives 0; an unmeasured leaf gives 0. A content finding receives its leaf's `fx`; a non-content cause keeps the rest; a band as tall as the other side's whose leaf measured a height means the offset elsewhere in the band is a `compensated` finding; when the first cause is content and the rest exceeds the tolerance, the box is weighed again without the content and the cause found is a finding of its own for the rest; the part of the whole page's difference the findings do not explain is stated as `accumulated` (or `height-residual` not-measured when the bands cannot pair one-to-one). Missing/extra leaves are looked for **independently of the first height cause** (padding, spacing, font, columns, wrapping): accepting a height cause offsets only the height it measures, each part once; an independently missing line, rule or chip is still an open finding, even in a cell whose |delta| is within tolerance.

**The header's logo is one.** The probe names the header's logo boxes (site-logo / brand / site-title / a link to the home page outside the menu), in flow or not (a `position:absolute` box is still read), with where each box is drawn. Two logos at the same place (sharing ≥ half the height of the shorter logo, left edge off by ≤ 64 px) are paired; every paired pair is further compared by where it is drawn (left edge and vertical middle within 24 px) and is one logo even when one side draws it as a picture/SVG and the other as words: their leaves are not `element-extra` + `element-missing`. The pairing hides nothing: two logos both with visible words that read differently are `logo-text`; two logos of the same kind whose drawn size (off by more than max(8 px, 10%)) or place (more than 24 px) differs, or a picture against words whose two drawn boxes do not overlap by more than half the smaller box, with heights off by more than 2.5× or widths by more than 6×, are `logo-box`, even when the headers are equally tall; a logo box with no counterpart is `element-missing`/`element-extra` named `logo`. A picture's alt is not visible words. A side with no logo does not pair (finding as usual).

**Carousel clones.** A box that calls itself a clone (class `cloned`/`clone`/`duplicate`, or `aria-hidden`) **inside a carousel-like component** is dropped only when its **component** — the nearest root carousel (`.swiper`, `.slick-slider`, `.carousel`…; track/list/wrapper are only parts of that carousel, a carousel nested in a carousel is two components) — has an identical visible original; the original may sit deeper. The identity is taken from the tree filtered to what is visible, with all the visible words (a SHA-256 digest cut to 128 bits of the whole string, not cut at 40 characters): the tag, the words the box holds itself, what it draws behind (background picture/colour), which child boxes show anything, and for leaves: the words and pictures being displayed — `currentSrc`, a picture with `object-fit`/`object-position`/transform/filter and drawn size, canvas by pixels, svg by the computed form of **the shapes being drawn** (displayed, not faded to 0, within that shape's own clip area; hidden shapes, a `g` faded to 0 and hidden words — including hidden words inside a `<text>` being drawn — do not change the identity; including fill/stroke and every effect of ancestors within the svg as computed: transform, opacity, filter, clip-path, mask, blend, and paint servers; not markup); a picture kind that cannot be read (a cross-origin canvas, an iframe, a picture with no source) has an identity of its own, never equal to another, and for a video it is the poster while not playing, so two videos sharing a `src` with different posters are two pictures. Hidden descendants do not change the identity. A single sign, or an original in another component, is not enough.

**An 8 px tolerance.** Reading the same page twice from a fresh load shifts bands by at most 1–2 px (half-pixel lines of text); a padding step, one extra wrapped line or a font size off by a step is uniformly 12 px or more; 8 px is also the tolerance of the hand tables of earlier fix versions. Do not loosen the tolerance to hide a source that did not load its web font: the sweep prints the warning `source-fonts-missing`, and each drifting cell on a pair where the source draws in a system font is marked (`systemFace`) — words wrapping differently are a real consequence, not hidden.

**A source page that is not the counterpart** (the source answers the home page or a bare error page for that address; a title equal to the source's home page while the port has a different title; a redirect to `/`) → `bare-source-page` / `source-not-counterpart` in `notDefects`, the route is excluded from the check, as with the behaviour checks. Added time: eight widths × two sides, one fresh load per cell, about 4 minutes for 34 routes when run alone with `--only heights --concurrency 6`.

**Where one page differs.** `site-sweep.mjs --site … --source … --run-root … --only heights --explain /route@1180` measures that one page at that width and prints the walk of blocks from the top of both pages: selector, y, height and text lines on each side and the raw running offset of the port against the source (bands the judge skips included). A band the judge skips or groups carries a label with its reason; the marker on the first block and the closing line are the verdict of the sweep for the cell, and a quiet cell with a raw offset beyond the tolerance says both.
The verdict is the one the sweep reaches, through the same function: the judge, then the `sweep.accept` rows of the dossier (validated before the browser starts, an invalid row is exit 2; a row whose whole scope is this cell, one route and one width, is checked as in a full run, so a stale one exits 1; a row that also covers other routes or widths is applied to this cell by its own part only — whether it stands or is stale over its whole scope is a question for a run that measures that scope, so it never turns this cell into 3 and its other routes and widths are not printed; a `not-measurable` row closes the cases of its cause in this cell, and a count the cell alone already exceeds is an error (1) as in the sweep; when the measurement holds readings for every route × width pair a row names (a reading the judge sets aside is not measured), the row is checked as in a full run; rows of other routes or widths are skipped), then the settled cell. A cell that is quiet only because an accept row covers its findings says so in the header and the closing line and names the accept cause key and its decision; only findings still open are marked.
Exit follows the settled cell, not the page totals: 1 for `defect` (also when the totals agree, when another band of the cell is not measured, and when a row of the dossier does not stand for the cell), 3 for `not-measured` (no defect, something not measured, or the cell set aside), 0 for `ok` or `accepted`; 2 for a route that is not the dossier's, a width outside 200–3000 or an invalid accept row; 3 also when the page could not be measured or the one deadline (90 s) of the command passed.
It needs no `--baseline`, `--zip` or `--out`, takes no other scope option, and writes no summary, state or history.
Where one side holds a region as one band and the other cuts it into several of the same height together, the walk shows them as one row with the parts under it.

## Intrinsic mobile defects — `intrinsic-mobile.mjs` (#65)

Parity calls a defect both sides share "equal". `node scripts/visual/intrinsic-mobile.mjs --page-map f --site <origin> --source-site <origin> [--widths 320,360,375,390,414]`
is a DOM-only probe (no screenshots) of every route of the page-map that renders a page (a declared 3xx is not one; an error page is), both sides, at 320/360/375/390/414:
a control whose label is ≤ 3 words and still wraps (`control-wrap`), a box that clips its text (`text-clipped`),
a page wider than the viewport (`page-overflow`). Rows are `shared-source-defect` (the source has it, the site is
no worse — record the decision if the port fixes it), `site-only` (absent on the source, or worse: more lines,
wider) or `source-fixed` (listed, not a finding). Exit 1 on any `site-only` row or an unreachable side (exit 2:
usage). `visual-qa.mjs` and `fast-gate.mjs` validate the whole argument list first: an unknown or repeated option
or one without a value is exit 2 before anything is measured.

`visual-qa.mjs` runs the probe itself when `--spec` and `--source-site` are given (`visual.json` `intrinsic`, rows in
`intrinsic.json`) — on every page-map route in a full or Fast Gate run and the release checkpoint, on the run's own pages in a
`targeted-debug` run (`--pages`, the pilot's check; `intrinsicPages`): a cadence, the full runs still read every route; the Fast Gate verdict fails a run without it, with an unreadable route, or with a `site-only` row —
`shared-source-defect` rows are listed; it needs `intrinsic.json` with a reading for every route × width. A site-only
row or an unreadable route also makes `visual-qa.mjs` exit 1 and is a machine note (`summary.intrinsic`). Rows are keyed
by kind, words, landmark and order — numbered over ALL controls (or texts in a clipping box), before the defect test —
so two controls with one label are two rows. Text clipped at the bottom edge counts as well as at the right. A page with sections needs `--patterns-map` (recorded with the run): its patterns are in the page hash.

**The evidence model (`intrinsic-report.mjs`).** One closed schema and one validator for every reader (the verdict, `visual-qa.mjs`, the
standalone probe). A reading is `{ route, width (the viewport), defects, fixed, rows[, error] }`; a row carries its kind, label, key,
selector, class, its measurements (`lines` + `boxWidth` for a control, `over` otherwise) and, when the source was read, the source's
measurement; `source-fixed` rows are kept. Every total — per reading, `measured`, `summary`, `visual.json` `intrinsic` and
`summary.intrinsic` (with `blocking`) — is recomputed from the rows and must equal every stored copy; `findings` and `errors` must be exactly
the projection of the rows (multisets); route × width is unique and must be exactly the page-map's routes × the required widths;
`sourceRead: false` allows no shared/source-fixed class and no source measurement; an unknown key, a wrong type or any mismatch is a
named refusal. The verdict reads only the literal `intrinsic.json` (a regular file, bounded, no link/FIFO); `visual.intrinsic.file` must equal
it. A report from an older version lacks the rows or the claims and is refused — regenerate it by rerunning `visual-qa.mjs`.

## The `SOURCE` flag — fix it even when the source is wrong too

A site that matches the source but breaks an output requirement or the design system (a unit dropping onto its own line under the figure, a source
band overflowing horizontally, a separator hanging at the end of a line) → still a note, Flag `SOURCE`; the coding agent **fixes it to look better than the
source** (Lee 14/09), without waiting for Lee. `notes.mjs` counts it apart (`sourceFlagged`), it does not block like `LEE`. If after
the fix parity by words reports drift on exactly that element, add `design.exceptions` with a `decision` pointing to the note id
and this rule — the exception is the consequence of a decision, not a way to turn a test green.

## The `LEE` flag — what goes to Lee, how, and who closes it

A lens tags `LEE` **only when** one of four holds: (1) the site **differs from the source on purpose** and the drift is reasoned — the source is a drawing,
not a law (a two-column hero with a picture, a four-column "What we do", a beige CTA panel instead of a blue band); (2) **words/content
belonging to the customer's brand** (a wordmark, the word "Joomla" left in sample copy, a category name); (3) **a cost out of
proportion** to the drift (building a custom widget for a small detail); (4) two sources of truth contradict each other (the style
guide says one thing, the page another). A measured drift against the source that falls outside those four **must not**
be tagged `LEE` — fix it, or `design.exceptions[]` citing an existing decision.

Bring it to Lee **once per tier**, no piecemeal questions, no 700-row table: the main agent gathers every `LEE` row of the tier
into a block `## [LEE] <stage> <date>` in `tasks/<site>/DECISIONS.md`, each item: the note id, site + source pictures
(paths), a one-line question, **a default proposal**, and the assumption if there is no answer. Lee answers right below
(A/B/words). The main agent turns the answer into `design.exceptions[]` (`decision: "DECISIONS.md D-nn"`)
or into a fix for the next round, and closes the row with `closeNote: "Lee: …"`. The coding agent records `lee` (does not
fix); a lens does not close a `LEE` row.

**Lee being busy does not block — the default has a name.** Each `LEE` row must carry a `default` (the lens proposes, the main
agent approves) by four rules: (a) an intentional drift from the source → keep the site as it is if no lens
considers it a defect, otherwise follow the source; (b) words/brand → keep the source as is, never rename/change a wordmark on your own; (c) a cost
out of proportion → skip, record a G-number gap; (d) two sources contradicting → the style guide beats a single page. At the end of the tier
with no answer yet → the main agent **applies the default**, records `D-nn (default, Lee has not decided)` under the `[LEE]` block
in `DECISIONS.md`, creates `design.exceptions[]` with `decision: "DECISIONS.md D-nn (default)"`, closes the row
with `closeNote: "default"`, and the tier counts as clean. Transparency is mandatory: `VISUAL.md`/`visual.json` record
"Accepted by default — pending Lee: N", `release-notes.md` lists every item, the receipt carries `pendingLee: N`
— never folded into "pass" without saying so. Lee can overturn it at any time by editing the line in `DECISIONS.md`:
the exception becomes a fix, rerun `--reuse` only on the pages concerned, without reopening the whole tier. The only thing that still blocks
is the right to use the source at **release** (SKILL.md §Stop conditions).

## Stop conditions — machine-checked, not a feeling

A tier is **clean** when the latest `visual-qa` run has: `findings 0` (every drift fixed or an exception with a
`decision`), `unclassified 0`, no `examined-too-few`/`identity-mismatch`/`font-not-loaded` page, and
`notes.mjs merge` for that tier: 0 `open`/`reopened`, 0 pictures with a consumer not opened. Phase 8b is **done** when the four tiers
are clean in turn and the WordPress gates are still green (editability 0 BAKED, content parity N/N, seed `+0 ~0`); then the
`visual-review` receipt is signed with `contractHash` + `artifactHash`. Beside that, **motion**: `visual/motion.mjs`
on every source route has 0 rows (or each row is an exception with a `decision` — a port dropping a carousel on purpose must still
be settled by Lee), and no page has `motion.unhandled` without a recorded reason. **Do not open a new loop** when a rerun does not
reduce the findings and what is left is all `LEE`: the machine's work is done, only decisions remain — stop, bring the `[LEE]` block.

A fix round has three brakes, all three machine-checked (`round.mjs`, section above): **determinism** — a page answering different HTML on each
request does not count toward the stop rule and blocks closing the tier until the seeder is fixed; **churn** — new ÷ closed > 0.3 on
targeted pages means fix again before running full; **limit** — at most 3 deploying rounds per tier (rolling: 3
checkpoints after the baseline), and two consecutive complete checkpoints with no net progress (the total does not fall, or closed ≤ opened)
on deterministic pages stop and bring the decision list. Only a complete **full** run (checkpoint) can close a tier;
a recheck never can.

## WordPress's own gates are unchanged

`review/editability.mjs` 0 BAKED (words in the DB, not in templates) · `http-parity` leaf mode + `parity-accepted.json`
(content) · `seed.mjs` second run `+0 ~0` · `package.mjs` 4/4 (Theme Check, install-smoke) · `quickstart/cycle.mjs`
(prune → pack → restore → verify-parity, release only on a green gate and a canonical contract that is not stale).
`scripts/verify.mjs` runs fast-gate then full for parity/scan/shoot; visual-qa is the last tier of 8b.
`review/functional.mjs` (Phase 8): internal links, console errors, alt, form label/submit, `lang`, one `h1`, search
returns results — 0 findings, `examined.links > 0`. `visual/motion.mjs` (8b): 0 rows.

## Red flags

- Concluding "matches the source" from the light desktop picture. → Four axes, tier by tier.
- "Clean" when the site census is below half the source census (or below 20 when the source could not be read). → FAIL.
- Clearing a finding with an exception that has no `decision`. → not accepted.
- Rerunning everything after a small CSS fix. → `round.mjs` (scope `auto`): only pages the change touches are measured again.
- Waiting to measure everything before fixing, fixing everything before measuring again; tiers run one after another. → One stand: `round.mjs --watch` + `recheck.mjs
  --changed` after each fix, every tier at once; full is only a checkpoint. A port with several page groups: each group measures `--pages` on all 4
  tiers on its own stand (`--watch` does not accept `--pages`), full-site only for the baseline + integration (+ one more time for each integration fix)
  ([`build-subagents.md`](build-subagents.md) §Parallel page groups).
- Closing a tier because a recheck is clean. → recheck `closesGate: false`; only a complete checkpoint at the current generation closes a tier.
- Re-measuring "the pages that currently have defects" after a fix. → misses new findings on other pages (gotcha 30); pick by change.
- The finding total going up and down between two runs with no code change. → `determinism.mjs` first; a non-deterministic page is a seeder bug.
- Pictures differing between two runs on a page with animation, or "matches the source" concluded from frozen pictures. → the freeze is for measuring
  (gotcha 35); motion is compared with `motion.mjs`, not with pictures.
- Two contracts in one dossier, or a contract in the scratchpad. → invariant 11, a named failure.
