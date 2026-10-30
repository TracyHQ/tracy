# `@tracy/ds-slot` — design system slot for customer site templates

A library, not a plugin. When the customer picks a design system, the site **wears exactly that system, with no
model and no rebuild**; when they pick none, the template keeps its own look. Plan and reasons:
[`tasks/ke-hoach-site-mac-dung-design-system.md`](../../../tasks/ke-hoach-site-mac-dung-design-system.md).

| File | Job |
|---|---|
| `src/normalise.mjs` | Refero (`vendor/tracy/refero`) or OpenDesign (`vendor/tracy/od-design-system`) → a `tracy-ds-profile/v1` profile. Each field is `{v, s, f}`: value, status (`stated · derived · substituted · empty`), source. What cannot be proven is `empty` — the template uses its own value. `gate()` = the quality gate |
| `src/fonts.mjs`, `google-fonts.json` | Fonts come only from Google Fonts (1,950 families, fetched 08/10/2026). A proprietary font → the substitute the source names, recorded as `substituted`. The font kind (`kindOf`) decides which fonts may be body/heading (section *Body and heading fonts*) |
| `src/emit.mjs` | Profile → EmDash slot CSS (`--ds-*` + bridges to the template's token names). Text that does not read at 4.5:1 is shifted minimally toward the text colour, recorded in `adjusted` |
| `src/tokens56.mjs` | Profile → the 56 tokens of the OpenDesign contract, starting from the template's own values (its native system) |
| `src/wordpress.mjs` | Profile → a theme.json style variation that the `tracy`/`tracy-base` theme wears through `tracy_apply_inspiration()` (the `theme.style` door of Claude Cowork). The variation's `styles.css` fully replaces the theme's (dark block), so the system is one look |
| `src/joomla.mjs` | Profile → the HTML of a `mod_custom` module "Tracy design system" (earliest position the template renders, every page): Google Fonts link + one `<style>` setting the 56 tokens, T4 runtime variables, the landing's `--brand-*`/token variables, the template's own variables (`templateVars`) and `--ds-c-*` |
| `src/tokenize.mjs` | A template's released stylesheet → the same stylesheet reading its own palette through the slot: every hex that **is** a colour of the template's palette becomes `var(--ds-c-<role>, <that same hex>)`. The role follows the painted property (text / ground / border), inverted bands (dark hero on a light template) are kept, text in the same rule follows the ground. `--ds-c-*` exists only while a system is worn, so the default look — light and dark — is identical |
| `templates/*.json` | **Each template's slot contract** (`tracy-ds-template/v1`): role → selector for the probe, selector for the slot's rules, native system, where contrast is measured |
| `src/probe.mjs` | Per-role probe (h1, body, button, card, container, section) run in the page + scoring against the profile |
| `scripts/ds-slot.mjs` | `apply <id> --emdash <dataDir>` · `clear` · `wordpress <id>` · `joomla <id>` · `profile <id>` — exactly what a build door sends |
| `scripts/stand.mjs` | `up <release> --port N` — rebuild a released quickstart into a locally running site, in all three shapes: manifest + webroot/DB pair, hand-cut pair (manifest taken from the tch contract), installer zip (Joomla's CLI installer, as the fleet does). `--from-dir` = a local build. `down --name` |
| `scripts/discover.mjs` | Read the running home page: the element playing each role (selector) and **the palette the page actually paints** |
| `scripts/joomla-palette.mjs` | A Joomla template's palette + fonts read from the release: T4 `etc/theme/default.json`, T3 LESS variables |
| `scripts/tokenize.mjs` | `--template <contract> [--write] [--suggest] <css>…` — run `src/tokenize.mjs` on files; `--suggest` proposes roles for frequent colours outside the palette (a person reads them before adding to `extraPalettes`) |
| `scripts/pass-joomla.mjs`, `scripts/pass-wordpress.mjs` | One template from release to verdict: build · draft contract · default screenshot · tokenize · measure 4 systems + control · tear down |
| `scripts/release-joomla.mjs` | The next version of a Joomla quickstart, **built locally, not published**: tokenized webroot/zip, same DB, `manifest.json`, `SHA256SUMS`, the new version's tch contract (CSS file hashes change) |
| `scripts/flow.mjs` | Action flow on a running site, `--cms emdash\|wordpress\|joomla`: default → each system → remove system; per-role measurement, real contrast measurement, screenshots at 1440 + 390, scoring (`--snap` takes a baseline). `flow-emdash.mjs` = `--cms emdash` |
| `src/bands.mjs` | Bands the template paints itself (dark hero, brand-colour band, footer, light panel) **wear the system's ground**: pick a system colour on which every text colour the band has still reads; the template's accent inside the band takes the system's accent; images, logos and text stay. Contract key `bands` (section below) |
| `src/remnant.mjs` | The share of **area** (images excluded) still carrying the template's own colours under a system, read from screenshots — first screen and full page. `flow.mjs` writes it to the "Template colours left" column |
| `scripts/bands.mjs` | Read the kept bands on the running default page: ground, text colours, accent-painted parts; `--draft` writes a draft `bands` into a contract that has none |
| `scripts/sweep.mjs` | Every **released** quickstart of a CMS (releases on `joomlart-products`) through `pass-*.mjs` `--no-tokenize --bands`, measured with an OpenDesign system, **one stand at a time**; one `sweep.jsonl` line per result, a rerun resumes where it stopped |
| `scripts/lane.mjs` | **Measure one JA Joomla version with one command**, several lanes in parallel (measuring machine + Docker host): build overlay → verify → stand → flow over 15 systems → light/dark preview `--write` → score as /ops does → tear down. Section *Measuring with `lane.mjs`* below |
| `scripts/lane-shell.mjs` | Child processes of one `lane.mjs` run: each step is a process group (local or on the Docker host); when the run dies, the whole tree + its Chrome is killed |
| `scripts/template-css.mjs` | Compile a JA template's `css/*.css` from the joomlart-products source (T4 SCSS with sass 1.97.3, T3 LESS with lessc 4.2.0), compare with the shipped CSS (`same`), `--write` to write |

**Rules:** source data is read-only · applied without a model · empty slot = old look (control measures 0
difference) · no invented values. Templates that can wear a system today:

| CMS | Template | Applied through | Needs a template release? |
|---|---|---|---|
| EmDash | `base` | file `data/ds-slot.css`, read on every request | yes (the `tracy-base` EmDash release carries the slot) |
| WordPress | `tracy`, `tracy-base` | style variation through `theme.style` | **no** — the current theme already reads variations from `uploads/tracy/styles/` |
| Joomla | `tracy-base/j6` (T4) | `mod_custom` module through `content.update` kind `module` + `moduleAssignment` | **no** — touches no template file, the lock does not change |

Evidence 09/10/2026: [`tasks/evidence/ds-slot-2026-10-09/`](../../../tasks/evidence/ds-slot-2026-10-09/README.md).

## Body and heading fonts — never handwriting (12/10/2026)

Acctual once dressed **the whole site in Caveat**: the source lists Caveat as "signature for testimonials", but
`fontRoles()` found no face claiming "body" and took the next face in the list. The rule now:

- **Font kind** comes from the Google Fonts catalogue itself: `kindOf()` returns `handwriting` / `display` (field `k`
  in `google-fonts.json`, same 08/10 metadata) or `sans-serif` / `serif` / `monospace`.
- **Body** is only `sans-serif`, `serif` or `monospace`. **Headings** may be `display` (Yellowbird's Bagel Fat One,
  when the source names it for headlines), **never** `handwriting` (`REFUSED_KINDS` in `fonts.mjs`).
- A source name matching a Google handwriting font (Hims App's `sofia` is Sofia Pro, a sans-serif) → use the first
  substitute the source names that is not a refused kind (`substituted`).
- A face the source describes as **wordmark, logo, accent, handwriting, script, decorative** in the first clause of
  its role → not heading, not body, unless that same clause mentions headline/heading/display/body/UI (Fallen Grape's
  "Brand wordmark, hero display headlines…" is still a heading).
- No face claims "body" → the "headings and body" face or the main face (`primary`) becomes body, **before** the next
  face in the list; otherwise a mono face is the system's main voice (not an accompanying label/code face).
- **Gate** `gate()` refuses a profile with `font-body-handwriting:<family>`, `font-body-display:<family>` or
  `font-display-handwriting:<family>` — the final net for every source (OpenDesign too).

Measured 12/10/2026 on 1,342 Refero systems: before the fix 1,080 systems passed the gate, 6 had handwriting as body or
heading (Acctual, Hims App, Recess, Touchy Coffee, The Fascination, Rou Hun Fan); after the fix 1,081 pass (099 SUPPLY
gets in: its only mono face is now the body), 0 still have handwriting in body/heading, the new gate refuses none;
34 systems changed fonts. OpenDesign: 111 pass, unchanged.

## The chat path — exists, currently OFF (11/10/2026)

A running site wears a system through the **Design system button** on the site browser toolbar (door
`POST /api/sites/:key/design-system` of `tracy-web`, job `site-ds-slot`). There is a second path, through chat — the
agent proposes a system, the customer clicks *Use this inspiration*, pastes a `DESIGN.md`, or the agent calls
`theme.style` itself — and it was decided (11/10/2026): **for now, only through the button**. The chat path is not
removed; it sits behind a switch:

- **Switch**: `chat-design-system` in `packages/core/tracy-core/src/ui-switches/catalogue.json` (group
  `browser-toolbar`, `defaultOn: false`).
- **When off**: the *Use this inspiration* button is not drawn; `tracy_design_propose`, the `choose` door,
  `tracy_site theme.style` from chat and the conversation's apply call to the button's door all refuse with
  `CHAT_DESIGN_SYSTEM_OFF`; the site context block tells the agent to change nothing and answer with one sentence
  pointing to the button; Help says the same. Editing single elements through the slot's `--ds-*` variables still
  works as usual; choosing a design when **creating a new site** is not covered by the switch.
- **Turning it back on** (one click, nothing to release): `/ops` › User Interface › Right column › Browser toolbar ›
  *Design system through the chat*, or `PUT /api/ops/ui` with `{"switches":{"chat-design-system":true}}` (cookie of an
  owner/admin seat of `tracy_admin`, same `Origin`). Check with `GET /api/ui` (`hidden` no longer has this id). When
  on, the agent applies through the `tracy_design_system` tool (`tracy-site-tools`) — **the button's own door**: the
  same bytes from this emitter, the same Site changes row, the same Undo on the toolbar.
- **Why off**: the old chat path edited the template/CSS by hand through the redesign skill or `theme.style`, not
  through the slot, with no slot rollback record; the button goes through the measured emitter and can be undone.
  Turn it back on once the chat path has been re-measured on all three CMSs.

## `minVersion` — a `ready` contract only for measured releases (11/10/2026)

Every `ready` contract **must** have `minVersion`: `{ <key>: <first release that can wear it> | null }` — the single
source of truth the Design system door (`apps/tracy-web/src/lib/ds-slot.js` `contractFor`) uses; `release` only
records where it was measured. `null` = no release can wear it yet (the door returns `TEMPLATE_NEEDS_UPDATE`). Test
`apps/tracy-web/test/design-system-door.test.mjs` ("every ready contract names the releases it wears") goes red when
it is missing.

- **WordPress**: key = the theme's stylesheet (`wp-ja-kinetic`, `tracy`, …), compared with the `Version` header of the
  running theme (job `site-ds-slot` reads it in the same run). A released theme can reach a running site, so it is read
  from the site itself.
- **Joomla, EmDash**: key = the site's quickstart tag (`quickstart/ja-kinetic/j6`, `tracy-business/emdash-0.x`),
  compared with `site.quickstart_version`. A re-released (tokenized) quickstart **never** reaches a site built from the
  old one, and `templateDetails.xml` keeps its number on re-release (measured 11/10: `dsbtnjo01` built from ja-kinetic
  1.0.4 carries template 1.0.2).
- A template installed by several quickstarts (`t4_bs5_blank`: t4-framework, ijoomla-com-guru-pro) lists each tag; a
  tag not in the list → `TEMPLATE_VERSION_UNKNOWN` (no guessing).
- New batch of contracts: set `minVersion` = the tokenized release (the one `release-joomla.mjs` / `release-batch.mjs`
  builds, or the bumped WordPress theme version), not the originally measured one.

### `maxVersion` — and only up to the last checked release (11/10/2026)

`minVersion` alone means "every release from here up can wear it" — wrong when another line re-releases the same
quickstart/theme (11/10: ja-spa 1.0.3/1.0.4, ja-voyara 1.0.6, Tracy Business EmDash 1.7.7→1.7.14, five versions of the
JA Essence WordPress theme). A rebuild from **untokenized** source would be invited to Apply and give light text on a
light ground. So every `ready` contract also has:

- `maxVersion`: `{ <same key as minVersion>: <last release checked to still wear it> }`. The door only invites Apply
  for releases in **[min, max]**; newer than max → `TEMPLATE_VERSION_UNCHECKED` (`version: {need: null, have, upTo}`,
  the panel says "checked up to: …"), nothing is written. A key missing from `maxVersion` = blocked at `minVersion`
  itself (closed when missing). `maxVersionNote` records what was checked.
- WordPress: the in-site write run also receives `maxTheme` (alongside `minTheme`), so a theme that auto-updates past
  max between read and write writes nothing either (`apps/tracy-host/src/ds-slot.js`).
- Test `apps/tracy-web/test/design-system-door.test.mjs` goes red when: a key has `minVersion` but no `maxVersion`, or
  `maxVersion` < `minVersion`; or the WordPress theme in `packages/cms/tracy-wordpress-theme/src/<stylesheet>/style.css`
  bumped `Version` past `maxVersion` — whoever bumps the theme checks and moves `maxVersion` in the same change.

**Moving `maxVersion` when a new release exists** (only after checking, never because the number is higher):

```sh
# Joomla: list releases, download the webroot, count var(--ds-c- in the template's css, compare with the checked release
gh release view quickstart/<slug>/j6 -R JoomlArt-Products/joomlart-products --json assets -q '.assets[].name'
gh release download quickstart/<slug>/j6 -R JoomlArt-Products/joomlart-products -p '<slug>-j6-webroot-<v>.tar.gz' -D <empty dir>
tar -xzf <file> -C <dir> --include='*.css'   # then grep -o 'var(--ds-c-' per file, compare each file with the old release
# EmDash: quickstart zip — src/lib/ds-slot.ts identical, same set of var(--ds-*) in the css, diff of src/ has no new colour classes
# WordPress: gh release download wordpress-theme-<slug>-v<v> -R TracyHQ/claude-cowork — css still has var(--ds-c-, still has tracy_apply_inspiration
```

A drop in one file means reading the diff: it may be deliberate (wp-ja-vega 1.1.14 dropped one spot under the literal
pair rule), or a rebuild from old source — then **do not** move `maxVersion`. The 11/10 audit table:
[`tasks/evidence/ds-minversion-audit-2026-10-11/`](../../../tasks/evidence/ds-minversion-audit-2026-10-11/README.md).

Remaining limit: the door trusts the version **number**. A release a contract already names but not yet published (e.g.
`1.0.1` of the batches waiting on `RELEASE-DS-*.sh`) whose number another line takes first with an untokenized build
still slips through; the release script stops when the asset already exists (`already on the release`) — then fix the
contract before anything else.

## Three contract fields added in round 2 (batch r2a, 11/10/2026)

All three are **opt-in per contract** — a contract that does not set them leaves the slot CSS unchanged to the byte.

| Field | What it does | Measured example |
|---|---|---|
| `sideRules: { light \| dark: { <selector>: { <property>: <value> } } }` | Declarations for **artwork meant for one light/dark side** when the worn page is on that side (the system's `--bg`, lightness threshold 0.3). Values go through `safeValue` (no `url(`) | JA Mason: white logo and the black striped disc after section titles get `filter:invert(1)` under a light system; JA Magz II, Teline V: black logo `invert(1) hue-rotate(180deg)` under a dark system |
| `keepGround: [<kept band>]` + `keepDefaults['--body-bg-color']` | A kept band with no ground of its own (the page shows through it) gets the template's page ground back; `flow.mjs` scores that band against the ground it **shows** (its own, otherwise the nearest ancestor's) | JA Lawfirm: the FAQ band — questions run outside the white image, dark text on a purple ground under Toggl Track |
| `selectors.onAccent` | Text the template puts on an accent ground through **a different rule** (tokenize cannot pair them) takes `var(--ds-c-accent-on)`, stopping at the edge of kept bands | JA Teline V: white category titles on red (red is the accent) — under Toggl Track 2.56:1 → the accent's text colour |

Also: a template with its **own dark mode** chosen by the customer/OS (`html[data-theme=dark]`, JA Teline V
`css/darkmode.css`) sets `tokenScope: ":root:not([data-theme=\"dark\"])"` — the system defines `--ds-c-*` only outside
dark mode, so a customer in dark mode sees the template's own dark mode (with the system's type and sizes). Pointing
`--dm-*` at the system was tried and dropped: darkmode.css's literal white-text pairs land on the system's light ground.

## Contract keys added in round 2 (r2b, 11/10/2026) — all opt-in; a contract that does not set them stays as before

| Key | Job | First template |
|---|---|---|
| `varRoles` | `{ "--template-variable": "<role>" }`: `tokenize.mjs` gives a template's own colour variable that role **at every declaration** (including nested redeclarations in `.dark-active .module-title a`) — when the variable name does not say the role and its hex belongs to several roles or none | JA Titan (dark mode's `--t4-gray-*`) |
| `t4Placeholders` | `{ "__color_white": "bg", … }`: `tokenize.mjs` wraps placeholders in `css/tpl/theme.tpl.css` as `var(--ds-c-<role>, __name)`; T4 fills in values as before when generating `media/t4/css/<style>.css`. Replaces `t4SiteCss`: the generated file is **rewritten** whenever content changes — including the first request after install (JA Stark 1.0.1 measured 11/10: the tokenized `14.css` was rewritten, the page went back to white/grey). Shipping the `t4asset` hash (the r2c way) only holds on a freshly installed site: when T4 regenerates the file (template style change, cache clear), the page goes back to hard colours — JA Helple, JA Landscape measured 4/12 after forced regeneration. A value playing two roles records its role per property kind: `{ "fill": "accent", "text": "fg-2" }` (`text`/`fill`/`line`/`glyph`/`custom`; an unlisted kind keeps the T4 value). `pattern.tpl.css` is written once per palette: map only when the dark palette is inside a kept band | JA Stark, JA Justitia, JA Helple, JA Landscape |
| `keepDefaultsYield` | the `keepDefaults` values given back to kept bands sit in `:where(…)` (specificity 0): they lose to the band's own declarations (`.info-wrap:not(.bg-white){--headings-color:#fff}`), yet still beat values inherited from the page wearing the system | JA Rights |
| `buttonTextImportant` | the primary button's (`buttonPrimary`) text is written `!important`, when the template itself writes button text `!important` (`.btn.btn-secondary{color:#fff!important}`) | JA Rights |
| `keepText` accepts `rgb()`/`rgba()` | the template's page text is not a hex (`rgba(255, 255, 255, 0.8)`) | JA Fresco |

Measuring tools (shared): `flow.mjs` treats text over an image drawn by an `position:absolute` sibling layer
(`.cta-bg`) as text on an image (checked by eye, not measured against the page ground); a page that **itself** scrolls
horizontally at 390 px without a system is not counted as the system's fault. `cdp.mjs` waits for finite animations to
finish before measuring (animate.css `.delay-2s` made the same text visible in one measurement and not in the next).

## Round 3 (r3b, 11/10/2026) — no new keys

- `followRules` accepts selectors with `>` (`.t4-palette-mainnav .navbar-nav > li.active > a`: JA Artsy); `{}<;` are
  still rejected.
- `flow.mjs`: a text's ground can be an absolutely positioned `::before`/`::after` with a solid ground covering ≥ 80% of
  the box (JA Alpha's white card on a red band); before, text in the card was measured against the band behind.
- `sideRules` accepts variables (`--ds-c-*`) and `color-mix(...)` like any value through `safeValue`: JA Aiga mixes the
  system's text colour toward white for text on full-screen images under a dark system.

## Contract keys added in round 3 (r3c, 11/10/2026) — opt-in; a contract that does not set them leaves the slot CSS unchanged to the byte

| Key | Job | First template |
|---|---|---|
| `weightImportant` | the system's weights (heading, display, body) are written `!important`, when demo content forces weight with Bootstrap `!important` utilities (`.font-weight-bold` on a hero title) | JA Campaign |

Notes on using existing keys, measured in r3c: at measuring time `followRules` did not yet accept `>` in selectors (r3b,
merged the same day, now accepts it; `{}<;` still rejected) — the r3c contract writes `.t4-palette-mainnav .nav li a`;
a kept band over an image with no ground of its own (JA Beauty `#t4-section-5`) needs both `keepText` and
`keepGround`, otherwise its text follows the page wearing the system.

## Round 3 (r3d, 11/10/2026) — no new keys

JA Coach, Colab, Candidate, Cityguide were invited with existing keys (`templateVars`, `keepDefaults`,
`keepDefaultsYield`, `keepGround`, `keepText`, `keepColors`, `followRules`, `sideRules`, `selectors.onAccent`,
`t3DevmodeOff`). Lessons for later contracts:

- **T4 heading variables** (`--headings-color`, `--body-headings-color`) do **not** go into the `runtime` of the
  `joomla-t4-ja` family: each template reads a different name (Coach, Colab read `--headings-color`; many templates read
  neither), and changing the family's `runtime` changes the slot CSS of every `ready` T4 contract without re-measuring.
  A contract that needs it sets it in `templateVars`, and **the same name** in `keepDefaults` when there are kept bands
  (the test "kept bands give back every colour variable" catches a missing one).
- **T4's `.text-secondary` is text**: `media/t4/css/<style>.css` writes `.text-secondary{color:var(--color-secondary)!important}`,
  while the T4 family points `--color-secondary` at `surface` (a ground) — a template that paints eyebrows/figures with
  it sets `templateVars['--color-secondary'] = var(--ds-c-accent-text)` (JA Coach: every eyebrow at 1:1 under every system).
- **The slot does not wear the system's container width** (15/10/2026, LAYOUT-3): the system changes colour, fonts,
  radii, shadows; content width is always the template's. Forcing the system's width onto the containers a contract
  names misaligned the template's other columns at the left edge (edge-split) (the prose column, the related-posts
  band, JA Kinetic's archive page header), and a contract never lists every column on every page.
  `selectors.container` is now only for measuring, not for wearing. (Before: the system's narrower container pushed
  JA Candidate's hero image over the title.)
- **Randomly ordered modules** (JA Cityguide "Most Visited": article order changes on every load) cannot be kept with
  `keepScopes` (kept bands are compared by index) — let it follow the system (`followRules`) and measure.
- **T3 dev mode** is the cause when only ~¼ of the page follows the system: check `"devmode":"1"` in
  `template_styles` first.
- `scripts/flow.mjs`: an element whose only text is `<noscript>` content (people with JavaScript never see it) is no
  longer measured — JA Coach's newsletter box measured invisible text at 1.38:1.

Added in round 3 (r3e, 11/10/2026) — `flow.mjs` text scoring (no new contract keys):
- text drawn at **below 0.2 opacity** (ancestors included) is decoration nobody reads: not measured, on the default page
  too (JA Eventcamp: a 120 px day number at 8% on the calendar cell);
- **the same text** (same index, element, colour) **on an image in both looks** is template text on a template image:
  the slot paints neither, only the font changes so the image reading frame lands on a different area (pink on the JA
  Eventcamp hero image 3.86 → 3.38 under MotherDuck's mono font); and text on an image with the same colour, in the same
  band, that the default page also has is compared with the template's own level (JA Comics' randomly ordered images
  shift the index).
- text set at **below 1 px** (Bootstrap's `.text-hide`, `font: 0/0 a`, after a logo drawn as a background image) is
  seen by nobody: not measured, on the default page too (T3's "powered by" link in JA Mason's footer; re-measured in
  round 3, 11/10/2026).


## Round 3 (r3a, 11/10/2026) — all opt-in; a contract that does not set them stays as before

| Key / tool | Job | First template |
|---|---|---|
| `paletteBands` role `ink` | A band the template draws in a dark brand colour to contrast with a light page: ground = the system's strongest text colour (`--ds-c-fg-2`), all text on the band (except buttons) = the system's page colour (`--ds-c-bg`). Dark under a light system, light under a dark one — the band stays a band, text reads at the system's own text contrast | JA Resort |
| `measureStill` | `flow.mjs` stops every carousel at its first slide before each measurement (`cdp.mjs` `open({ still })`: Swiper, Bootstrap 4/5, owl, slick through jQuery) — an autoplaying slider puts a different image under the same text between steps | JA Company |
| `release-joomla.mjs --rolling-as <x.y.z>` (+ `release-batch.mjs --rolling-as --label`) | A "rolling" pre-release has only a zip, no switch, no manifest, no tch contract: read that zip as version `<x.y.z>` (the version the switch proposal in `/ops` defaults to, 1.0.0), SHA-256 = GitHub digest, Joomla read from the zip's `libraries/src/Version.php`; the next version is the release's first switch. `verify` builds the rolling zip from `<out>/from` | JA Civica |

Contrast probe (`flow.mjs`), shared fix: a single-colour `linear-gradient` (a LESS mixin with the same start and end
colour) is that ground colour, not an image; a `::before/::after` that draws nothing (content `none`, empty inline box)
or is only an ornament (positioned, px size, under ¼ of the element's box) is not an image ground. Before, both made the
probe read the ground from a ¼-scale screenshot with blurred edges: white on `#0071e3` (4.70:1) read as 4.35–4.48.

The probe also reads **the paint layer under the text** (`under()`): at the text's centre in the viewport,
`document.elementsFromPoint` gives the stack of elements; the first element under the text with a solid ground / image
that is **not an ancestor** of the text is the real ground (a sticky header over a hero image — JA Symphony
`#t4-header` over `#t4-hero`, `margin-top: -150px` — used to read the page ground while viewers see the image). An
ancestor painted first keeps `bgOf`'s answer as before.
And **grounds drawn by pseudo-elements** (`pfill()`): a positioned (absolute/fixed) `::before/::after` with a solid
ground that really draws (`drawn()`, ¼ of the box or more) is the ground of text in that box — it paints over the
element's own ground, under the text. JA Resort's testimonial card (`.testimonial-item-wrap:before`, `#1A4444`) used to
read as the page ground: both the original and the system-worn version were measured on the wrong ground (1.28 then 1.20).
Merged with r3b (same day): r3b's `cover()` (a pseudo-element covering ≥ 80% of a transparent box) still runs, after
the element's own ground; `pfill()` runs before the own ground as measured in r3a.

## Re-measuring (remeasure-1, 11/10/2026) — no new keys, two measuring rules

Re-measured the 15 `ready` JA Joomla j6 contracts (aiga → comics) on their own 1.0.1 release with the current probe.
Lessons:

- **Text kinds covering the whole page**: `contrast.heading` = `body :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4)` and
  `contrast.text` = `body :is(p, li, a, span, small, label, td, dd, blockquote, figcaption)`. Contracts measuring only
  h1–h4 inside `.t4-section` missed text on the CTA band (JA Athena), figures over an image (JA Alpha), step-number
  circles (JA Campaign).
- **Text drawn inside an image** (JA Alumni's signature + name + title is one `Sign.png`) is seen by no probe: only the
  screenshot sees it — `selectors.inkImages` inverts the image under a dark system.
- `scripts/flow.mjs`: (1) `::before/::after` drawn through `mask-image` is a **shape** (JA Alpha's 474 × 272 px
  decorative curve, accent colour), not a ground — `pfill()`/`cover()` skip it; before, the whole section's text was
  measured on an accent colour that was not behind it (1.96 under Moxie). (2) `under()` starts from **the text's own
  element** when it is on top of the paint stack: a button's own solid ground is the ground of its text, before the
  layer underneath (JA Candidate's hero button used to be measured on the `#000` slide layer, on both the default page
  and the system-worn page).

## Unified probe (`fix/ds-remeasure`, 12/10/2026) — every rule of the re-measuring groups

Each re-measuring group (remeasure-1…6, intranet) fixed the contrast probe of `scripts/flow.mjs` separately. The
integration branch keeps **the union of all rules** in one probe (a string run in the page: checked by rendering it and
then `new Function`, not just `node --check`). The ground of a text:

| Rule | Function | Group, measured example |
|---|---|---|
| `::before/::after` drawn through `mask-image` is a shape, not a ground | `masked` (in `cover`, `pfill`) | 1 — JA Alpha's accent curve |
| a hidden pseudo-element (`opacity: 0`, `visibility: hidden`, `display: none`) draws nothing | `drawn`, `cover` | 2 — JA Fit's calendar cell waiting for hover; 5 — JA Titan's hidden rule |
| pseudo sizes given in `%` are computed against the element's box | `drawn` | 4 — JA Resume's 1 px timeline rule |
| a ground bar that does not reach the middle of the text line is an underline, not a ground | `reaches`, `pfill(e, el)` | 2 — the 8 px accent bar under JA Fit's titles |
| the text box's own solid ground is the ground (labels, buttons) | `under` (top of the function) | intranet — JA Intranet's category chip |
| the paint stack starts at the text's own element when it is on top | `under` | 1 — JA Candidate's hero button |
| `<img>/<video>/<canvas>/<picture>/<svg>` under the text is an image | `media` (in `under`) | 4 — JA Rent's owl hero; 5 — JA Teline V labels on images |
| a `::before/::after` image is a ground only when positioned (absolute/fixed); an icon inline with the text sits beside the text | `pictured` | 5 — the flame after JA Titan's "Top News" |
| a layer containing an `<img>` under the text's centre, or a positioned text layer over an `<img>` beside it, is an image | `layered`, `photo` | 2 — JA Essence, JA Good post cards |
| text on an image is read inside the box of the glyphs themselves (range), not the element's box | `one` | 4 — purple text next to a JA Nova icon |
| a positioned ::before/::after of an ancestor draws a card under a button in a kept band | kept-band button check | 4 — JA Resort room card |
| translucent grounds along the way are blended over the ground below (veil) | `bgOf` (`veil`) | 6 — iJoomla Guru card |
| an `opacity < 1` element under the text is a veil, not a ground | `under` | 6 — WordPress cover block |
| `<img>/<video>` inside a box with a ground, under the text's centre, is an image; a positioned sibling layer that is an image element too | `imgUnder`, `layered` (`replaced`) | 6 — JA Impact event card |
| lazy images are loaded before the ground screenshot (up to 8 s) | `contrastOf` | 6 |
| `oklab()`/`oklch()` read correctly | `src/probe.mjs` `channels` | 6 — EmDash Tailwind v4 header |
| text is compared with that same element on the default page; when the index is shifted, the nearest element of the same name is taken | `ownOf` | 6 — Tracy Base star row |

Text **not measured** (on the default page too): text only for screen readers (`.sr-only`, `.visually-hidden`,
`.element-invisible`, `.screen-reader-text`, box ≤ 1 px — groups 2, 6, JA Conference/JA Good play button); size-0 text
(`.text-hide` — group 3, JA Mason; group 5, JA Space); text pushed out of a clipping box (under ¼ of the text line inside
the box — group 4, JA Social II carousel dots); text whose centre lies outside a sized ancestor that clips overflow
(a carousel's waiting slide within the page width — group 2, JA Essence post cards; group 5, JA Titan slides; group 6
`clippedAway`, same rule: JA Essence's scrolling row — merged into `hidden`).
Text drawn inside an inline `<svg>` (a figure's `<text>`) is not measured either: SVG paints it with `fill`, not with the
`color` the probe reads, and it belongs to the figure like text inside an `<img>` (JA Kinetic WP 1.0.12's terminal/chart
drawing pair: the figure's grey text was read with the block's text colour, 1.47:1, 20/10/2026).

The secondary text of the closing CTA band of EmDash Tracy Business (`.text-on-forest-muted`, 3.52:1 under MotherDuck,
4.19:1 under Apple when measured at integration) follows rm6's `followRules` like the band title: it takes the page
colour — accent-text is an accent that reads on the page colour, so the page colour reads on it.

## Re-measuring with the current probe (rm6, 11/10/2026) — new keys, WordPress keys, probe fixes

| Key | Job | First template |
|---|---|---|
| `followRules` (WordPress) | As in Joomla: theme rules painting literal colours that tokenize left behind follow the role the contract names, stopping at the edge of kept bands. The WordPress variation (`src/wordpress.mjs`) now writes it | JA Essence: pagination `#000` and Read more `#252424` black on a dark page (1.00–1.12) |
| `sideRules` (WordPress) | As in Joomla, but the light/dark side is the side of the worn system (`html{color-scheme}` written by the variation), values through `safeValue`; stops at the edge of kept bands | JA Kinetic: literal ground `#161B18` under `:root[data-theme="dark"]` stayed dark under a light system; JA Vega: light background wave, glass box on an image, review badge |
| own `selectors.button` / `selectors.card` | A JA theme that does not use `.wp-block-button__link` / `.tracy-card` names its own selector, otherwise every system misses radius and weight | JA Kinetic (`a.hx-btn`, `div.hx-card`), JA Morgan (`div.teams-item`) |
| `templateVars` for a `light-dark()` variable family | The theme declares colours once at `:root` with `light-dark(var(--ds-c-…, <light>), <literal dark>)`: a dark system sets `color-scheme: dark` and so takes the literal dark branch, while kept bands read the variable resolved at `:root` and so follow the system. Each variable in that family gets exactly its role; `keepDefaults` gives kept bands the light value | JA Impact (`--jim-*`), JA Nova (`--jn-*`) |
| kept bands on WordPress under a dark system | The variation writes `color-scheme: light` for each `keepScopes` entry under a dark system: a kept band is the template's released shape, computed on the light side | JA Impact: footer bar text `#ced4da` → `#fff` |
| `bandText: { "<band>": { "ground": "<role>", "text": ["<selector>"] } }` (EmDash) | Accent-coloured text on a template band painted in a system colour (ink band = `fg`): the accent is only proven on the page ground, not on the band. That text takes the accent shifted minimally toward black/white until it reads 4.5:1 on the band (`readable`, the same step as the page's accent text), keeping the system's hue. A contract that does not set it leaves the slot CSS unchanged to the byte | Tracy Business EmDash: the second line of the hero title (`em.text-signal`) on the ink band — Toggl Track pink on pink 1:1, Moxie light blue on cream ~2:1 (text lost in the screenshot) |
| `followRules` (EmDash) | As in Joomla/WordPress: `selector → { property: role }`, writes the worn role's literal colour with `:root :is(<selector>)` (selectors may contain commas). For template text set as literals on a system-painted ground (`#F5F3EE`, `#fff` on forest = readable accent) | Tracy Business EmDash: forest band titles, selected chip, forest button (2.04–3.79:1) take the page colour |

The probe only measures the text kinds a contract names in `contrast`: accent text on a kept or painted band needs its
own kind (`accent-on-ink`), otherwise `painter()` reads the title's first text and skips a differently coloured `<em>`.
So (12/10/2026) every contract in this batch adds two kinds covering all text on the page, as the other batches did:
`"heading": "body :is(h1, h2, h3, h4, h5, h6)"` and `"text": "body :is(p, li, a, span, small, label, td, dd, blockquote, figcaption)"`.
Re-measured with those two kinds, 13 of 18 runs exposed text the old kinds did not reach (JA Nova marquee card white on
white under Apple, JA Impact green label 1.24:1, JA Essence current page number pink on pink 1:1, Tracy Business EmDash
forest band text 2.04:1…).

`flow.mjs` probe fixes in this round (shared by all batches, recorded so whoever merges knows numbers may change):
- translucent grounds (alpha < 1) along the way are blended over the ground found below (`bgOf` → `veil`): iJoomla
  Guru's `rgba(255,255,255,.95)` card used to read as a black page (1.36);
- text with its own ground is read on that ground before the paint stack is considered (`under`): JA Essence's category
  badge;
- `<img>`/`<video>` under the text's centre is an image (read from the screenshot), even inside a box with a ground and
  below the first screen (`imgUnder`, `layered` accepts replaced elements); an element with `opacity < 1` is a veil, not
  a ground: WordPress cover block, JA Impact event card;
- lazy images are loaded before the ground screenshot (up to 8 seconds).
- text only for screen readers (WordPress's `.screen-reader-text`, box ≤ 1px) is not read: JA Essence's social icon
  names were scored on a brand-colour ground (1.17:1);
- `channels()` (`src/probe.mjs`) reads `oklab()`/`oklch()` (computed Tailwind v4 colours): before, the three numbers
  were read as 0–255, i.e. black, so the EmDash header's 80% white overlay read as a dark ground (1.34:1).
- text whose centre lies outside the box of an ancestor that hides or scrolls overflow (`overflow` other than
  `visible`) is not on screen (`clippedAway`): the next card of JA Essence's top scrolling row (`overflow-x: auto`) in
  Apple's narrower page was read as white text on the page's white ground (1:1);
- text is compared with itself on the default page: when the element at the same index on the default page is a
  different element (the system's slot adds an element of the same kind before it, e.g. the slot module adds a leaf
  `div` on Tracy Base Joomla, so every later index shifts by one), the probe takes the default sample of the same
  element nearest that index (`ownOf`): the Tracy Base hero star row (`#eab308`, 1.92:1 on the template) at 3.34:1 under
  MotherDuck used to be compared with the next `div` and judged worse.

A third kind `"block-text": "body div:not(:has(> :is(div, p, ul, ol, …, h6)))"` (12/10/2026) measures text placed
directly in a leaf `div` (eyebrows, author names, figure labels): the `heading`/`text` kinds do not reach it. It also
exposed the Tracy Business EmDash eyebrow (accent used as text colour, 1.70:1), figure labels on the ink band (3.75:1),
JA Impact's green author name (2.41:1).

## EmDash key `bandText` (Tracy SaaS 1.4.11, 12/10/2026) — opt-in; a contract that does not set it leaves the slot CSS unchanged to the byte

| Key | Job | First template |
|---|---|---|
| `bandText: { "<band>": { "ground": "<role>" \| ["<role>", …], "tint"?: 0.12, "colour"?: "<role>", "text": ["<selector>"] } }` (EmDash, `src/emit.mjs` `bandTextRules`) | System-coloured text on a template band painted in a system colour (several roles = a band graded between them; `tint` = the band is also mixed toward the text colour by that ratio): the text colour is only proven on the page ground, not on the band. That text takes the `colour` (accent by default) shifted minimally toward black/white, 2% per step, until it reads 4.5:1 on **every** ground of the band, keeping the system's hue | Tracy SaaS EmDash: the call-to-action card eyebrow (`.cta--card .cta-eyebrow`, elevated → surface mixed with 12% accent) — 4.43 under MotherDuck, 4.27 under Apple on 1.4.11 before the key existed |

The `bandText` function and contract key were copied from branch `feat/ds-remeasure-6` (91d1b525a, no PR yet) — same code, only biome formatting differs — so the two lines do not diverge in meaning when merged.
Unlike #1179's `bandButtons.<band>.textVars` (which rewrites the template's **variables** inside the band): `bandText`
writes `color` directly for the named selectors.

## Bands wear the system's ground — `bands` (12/10/2026)

Before this date, a band in `keepScopes` kept the template's **whole look** (ground, text, accent); only call-to-action
buttons followed the system (`keptButtons`). On WordPress Tracy Business, under every system, ~90% of the 1440×900
first screen (green topbar, 760px black hero, orange text) stayed exactly as before the press — seen on
`demodesignsystem.tracy.site` under BMW: "it is still the old UI". `follows` did not catch it because it counts
elements, not area.

```json
"bands": {
  "<band>": {                        "a keepScopes entry, can be narrowed like keptButtons"
    "ground": "#14171a",             "the ground the released page shows (measured by scripts/bands.mjs)"
    "texts": ["#f5f3ee", "#8a8780"], "every text colour the band shows on that ground"
    "kind": "ink|brand|panel",       "optional; read from the ground when not set"
    "repaint": false,                "true: the band's text is painted through vars/paint with roles text / text-2"
    "root": true,                    "the band element paints its own ground (default)"
    "vars":  { "--wtb-ink": "ground", "--wtb-orange": "accent" },
    "paint": { "&": { "color": "text-2" }, "h1 em": { "color": "accent" } },
    "important": false               "T4 paints the palette with literal !important"
  }
}
```

- The new ground is the first system colour, in the order that suits the band kind (`ink`: the system's ink, darkening
  toward black; a dark band on a dark page: surface; `brand`: accent then ink; `panel`: surface), **on which every
  colour in `texts` still reads** — 4.5:1, or the level the template itself reaches when lower. No colour qualifies →
  the band stays as before. Buttons in the band (`keptButtons`) are scored on the new ground.
- Roles: `ground`, `accent` (text, 4.5:1), `accent-fill` (rules, small grounds, 3:1), `text`, `text-2` (with `repaint`).
- `flow.mjs` excludes ground-wearing bands from the "kept bands unchanged" comparison, and also scores **Template
  colours left** (`remnant.mjs`).
- Measured on WordPress Tracy Business (stand `tracy-business/wp7` 1.3.6, theme 1.1.8): 12/12 with BMW, Stripe,
  Spotify, Vercel; template colours left on the first screen 0–4.6% (before: Stripe 78%), lowest text 4.51:1.

## The Design system panel card is the site itself (12/10/2026)

The old card was the system's `components.html` with a few of the site's words: a different layout, placeholder text
("Reference component", "Live module"), and a look Apply does not produce. Now the panel frames
`https://<site>/?tracy_ds_preview=<id>`; the tracy-web proxy (`apps/tracy-web/src/bar/ds-preview.js`) drops the
parameter before asking the site, reads which template answered from the page itself, then inserts **exactly the
bytes the Design system door would write** (same emitter, same contract) where the site carries them: WordPress right
after global styles (`variationCss`, recreating the CSS WordPress prints for a style variation), Joomla and EmDash at
the end of `<head>`. Nothing is written to the site, `no-store`, `noindex`, no badge.

**Changed later (design system PR):** the panel card went back to the system's own Refero image + palette (decided);
the customer's site wears the system only when the preview is opened. `SiteThumb` and `previewSrcOf` were removed; the
proxy's `?tracy_ds_preview=` door is kept.

## 15 featured systems, balanced across every template (13/10/2026, #1298)

- **Display line size**: no larger than 1.25 times the template's own line (`DISPLAY_OVER_TEMPLATE`), on desktop read
  from `discovered.display`, on phones from `discovered.displayPhone` (measured at 390 on the release, written only when
  the cap takes effect for at least one featured system). JA Aiga sets its hero sentence at 45px on desktop but 20px on
  phones: Eddie's 40px turned it into seven lines over the face in the photo; now 25px. Without `displayPhone` the phone
  size is as before (0.714 × desktop, ≤ 56px, ≤ 10vw; mono fonts 8vw).
- **Headings balance their lines** with `text-wrap-style: balance` (the longhand): `text-wrap` is a shorthand, resets
  `text-wrap-mode` too and breaks the template's `white-space: nowrap` (GK Compact's marquee line broke into a wall of text).
- **Buttons in the header** (header, nav, `.navbar`, T4 and Gavick headers) keep the template's size (padding,
  line-height), while still wearing the system's colour, radius and weight: Guru Pro's "Buy Guru" button pushed the phone
  header onto two rows.
- **Fill bands** also repaint headings drawn by class (`.h1`–`.h6`): JA Alpha's `div.title.h4` white on Linear's lime
  ground, 1.23:1.

## Contract keys added 15/10/2026 — opt-in; a contract that does not set them leaves the slot CSS unchanged to the byte

| Key | Job | First template |
|---|---|---|
| `displayImportant` | size, line-height, letter-spacing of the display line (including the phone rule and the Vietnamese line-height) are written `!important`, when the template's stylesheet itself writes that line `!important` somewhere | JA Justitia (`h1, .h1 { font-size: 1.8rem !important }` up to 575.98px: 27px slide titles under every system), JA Kinetic (44px / 1.1 `!important` article titles) |
| `containerImportant` | the container's `max-width` (including the rule from 640px) is written `!important`, when the template holds some containers at its width with `!important` | JA Kinetic (`.acm-page-masthead .hx-container { max-width: 1240px !important }`: the first container of inner pages) |

- **The page's own ground** (`body`, `html`) always takes the `bg` role in the auto palette: the palette is read across
  several demo pages and compared with the first page's page colour, so a demo page's `body` with a different ground was
  classed as `surface`, and the role read last wins — JA Kinetic (and JA Resort) wore the system's `surface` as the
  page ground under Moxie, MotherDuck, Spotify (15/10/2026).

## Measuring with `lane.mjs` — one command, several lanes (batch 2, 16/10/2026)

Run **on the measuring machine**, from the root of a tch checkout (no `pnpm install` needed; the script creates the
`@tracy/wordpress-theme` symlink the emitter needs itself). Docker runs on a separate Docker host (SSH alias `imac`),
the measuring browsers run on the measuring machine, and `~/bin/imac-tunnel` forwards the stand's port.

```
# the released version (unchanged): build from the release, measure, score
node packages/design/tracy-ds-slot/scripts/lane.mjs ja-sensei 1.0.4
# a fix in joomlart-products: overlay → release-batch build + verify → measure the new version
node packages/design/tracy-ds-slot/scripts/lane.mjs ja-sensei ~/<joomlart-products worktree>/products/joomlart/paid-templates/ja_sensei/source
# only re-score the measurement file already in the tree, build nothing
node packages/design/tracy-ds-slot/scripts/lane.mjs ja-sensei 1.0.4 --judge-only
# recompile CSS after editing scss/less (check `same` before --write: false = the shipped CSS was hand-edited)
node packages/design/tracy-ds-slot/scripts/template-css.mjs <joomlart-products>/products/joomlart/paid-templates/ja_x/source [--files template] [--write]
```

- **Lane = a slot on the Docker host.** The script claims `~/tracy-work/locks/slot-N` (`mkdir`, N = 1..5 by default,
  `--slots` raises the ceiling up to 15, `--lane N` forces a slot 1..15); with no free slot it waits 60 seconds and
  retries; when done (also on error, Ctrl-C) it tears the stand down and deletes the slot. Each slot has stand name
  `b2-lN`, folder `~/tracy-work/b2/laneN` and **its own port range for each step** (`scripts/lane-ports.mjs`, test
  `test/lane-ports.test.mjs`), so parallel runs do not collide. Before each heavy step it waits while the Docker host's
  1-minute load is ≥ 12 (`--max-load`).
- **Ports of lane N** (since 18/10/2026):

  | Step | Port | Machine |
  |---|---|---|
  | stand `b2-lN` (forwarded by the tunnel) | `52980+N` | Docker host |
  | stand build/verify | `52300+N*10` .. `+2` | Docker host |
  | preview light · dark · PREVIEW-PARITY | `10000+3(N-1)` · `+1` · `+2` (N=15: 10042..10044) | measuring machine |
  | Chrome flow · Chrome verify | `10100+2(N-1)` · `+1` | measuring machine · Docker host |

  Before, PREVIEW-PARITY listened on `9750+N`, the same as lane 5's dark preview port (`9700+5*10+1` = 9751): two lanes
  running at once died with `EADDRINUSE` (Voyara 05:15, Tour 07:56 on 18/10). The three preview ports are chosen so the
  Chrome port `preview-check.mjs`/`preview-parity.mjs` derive (`9450 + port % 50`) does not repeat across lanes
  (before: lane 1 = lane 6); `cdp.mjs` still opens Chrome on port 0, so the Chrome number is nominal. All ports avoid
  the ranges agents type by hand (`preview-check --port 9611`, `preview-parity --port 9660`, 93xx–98xx): when running a
  step by hand, keep using those ranges.
- **`--keep` keeps both stand and slot.** Once the stand is up, a `--keep` run does **not** release its slot when
  done, so another lane does not build `b2-lN` over it (18/10: ja-phio claimed slot-2 a few seconds after the `--keep`
  run of FIN-SENSEI-TOPBAR). When finished looking, run `node packages/design/tracy-ds-slot/scripts/lane.mjs --release N`:
  it tears the stand down and only then deletes the slot (if teardown fails the slot is kept). The slot's `owner` file
  says `kept stand b2-lN`.
- **Results:** the measurement file is written where /ops reads it (`contracts/<slug>/j6/<version>/design-system-measurement.json`
  of the running checkout); `<out>/judged.json` (default `$TMPDIR/ds-lane-<slug>/`) lists the failing rules, scored
  with `judgeMeasurement` + `preview-system-issues.json` as /ops does, plus a comparison with the committed file
  (`committed.sameAsNow`). `lane.log` in the same folder keeps the whole output. VARS-1 is not in the measurement file:
  `release-batch.mjs build` blocks it itself.
- **Which contract it measures through:** the contract a site built from that version wears (`contractFor` of
  `apps/tracy-web`, by `minVersion`..`maxVersion`), not the line's base file: JA Podcast 1.0.5 →
  `joomla-ja-podcast-modes`, 1.0.6 → `joomla-ja-podcast-roles` (`scripts/lane-contract.mjs`; the `slot contract …`
  line in `lane.log`). Before 17/10 the lane always measured through `joomla-<slug>`, so Podcast 1.0.6 failed CON-1 +
  MODE-2 under every system (light/dark button hidden) although the product wears it cleanly. When no contract covers
  that version it measures through the base file and the log says why.
- **Fixed versions:** the Docker host builds in the worktree `~/TCH-worktrees/ds-batch2-measure` (change with
  `--imac-tch`); the script copies over every slot contract of the line (`templates/joomla-<slug>.json` and
  `joomla-<slug>-*.json`) and `contracts/<slug>/` of the running checkout, then copies the new version's contract back.
  `VERIFICATION.json` (default look = the released version) is copied into `<out>`.
- **Dying midway leaves no litter:** a failed run, or one hit by `kill -TERM`/Ctrl-C, kills every step it ran (including
  the process group on the Docker host), all its Chrome instances (`cdp.mjs` now also kills its own Chrome when the
  process exits or receives SIGTERM/SIGINT/SIGHUP — before, `detached` Chrome survived; on 16/10, 12 orphans aged 5–11
  hours were found), tears the stand down, releases the slot. Measured 16/10: killing mid-flow → 10 Chrome processes
  down to 0; killing mid-`stand.mjs up` on the Docker host → 0 processes, 0 containers, slot released.
- **PREVIEW-PARITY (probe v10, 17/10/2026):** after the preview, the lane runs `apps/tracy-web/scripts/preview-parity.mjs`
  on the same stand: each declared page × Moxie/Figma, opened like the Design system popup (default `live` path), then
  the system is written into the site like Try on and reopened, comparing icons/fonts/blocks/carousels; it writes a
  `previewParity` block into the measurement file. It runs only when `PREVIEW_PROBE_VERSION` ≥ 10 (before:
  `PREVIEW_PROBE_NEXT=1`, measuring without writing) and when the checkout has the script (integration branch).
  `--parity-only` skips flow + preview; `--parity-popup live,static/door,static/site` also measures the Add site popup
  (`static/door`) and the site popup before 34df1669e8 (`static/site`); only `live` is written to the file. Results +
  images in `<out>/parity/`.
- **How many lanes:** the Docker host's Docker has 7.7 GB RAM / 8 cores; each lane runs 1 stand (web + MariaDB) at a
  time, plus 1–2 short-lived stands during build/verify. Default ceiling **3 lanes**. One run of a released version
  (cached stand → flow over 15 systems → light + dark preview) measured 16/10: 8.5 minutes alone, 11–17 minutes with 2
  own runs alongside another agent's run (the preview is the slowest part). A fixed version adds build + verify on the
  Docker host.

## `pictureRules` — icons drawn in the brand colour (PIC-1, 20/10/2026, Joomla) — opt-in; a contract that does not set it leaves the slot CSS unchanged to the byte

A template icon shown as a **closed image** (SVG through `<img>` or `background: url()`) carrying brand-coloured strokes
cannot be reached by the system's `--ds-c-*` variables, so it keeps the template's colour under every system. The
`/ops` static rule PIC-1 catches those spots
(`apps/tracy-web/src/lib/template-design-system-readiness/rules/pic-1-icons-follow.js`).

| Key | Job | First template |
|---|---|---|
| `pictureRules: { "<selector>": { <property>: <value> } }` | Written under every system, on both light and dark sides (unlike `sideRules`). Each declaration goes through `safeDeclaration` (`emit.mjs`): a safe value, or a mask whose shape is a **percent-encoded inline SVG** (`url("data:image/svg+xml,…")`, nothing is fetched). `mask-image` is also written with its `-webkit-` form | JA Kinetic (ten Integrations icons: the mask is the inline copy of the file itself, `object-position` pushes the image out of the box, accent-text ground), JA Nova (pricing table check marks), JA Voyara (accordion minus/plus drawn with gradients), JA Impact (`:focus` drops the image) |

- The selector must **match the template's rule exactly**, state included (`:focus`, `:not(.collapsed)`, `::after`):
  PIC-1 compares each state separately. The generated `html.t4-dark <selector>` twin does not need to be written again:
  Joomla contract rules sit under six `:root`s and so weigh more.
- An `<img>` whose `src` the layout prints in PHP (ACM): select by address (`img[src$="integrations/icon-code.svg"]`),
  one mask per file; the shared block lists exactly those files (`:is([src$=…], …)`) so an image the customer swaps
  does not become a solid colour block.
- Do not use `url()` to the site's files: a mask is a CORS fetch the static preview door (Tracy origin) cannot make; the
  inline copy draws the same on the site, in the live frame and at the static door.
- A multi-coloured raster image only partly in the brand colour (JA Kinetic J's terminal and demo chart, 20/10/2026):
  keep the image, give the parent box `position: relative; isolation: isolate`, `::before` paints the image's own ground
  over the lime areas through a mask (covering the anti-aliased edges too), `::after` redraws exactly those marks with
  `--ds-c-accent-on-ink`; both layers at `z-index: 1` because an image with a `filter` is its own layer and paints over
  a `::before` with z-index auto. The image's ground colour is recorded in `literalsNote` (the `literal` invariant of
  `matrix.mjs`).

## Measuring by the declared component capabilities

The probe takes `components` in its optional third parameter. The flow reads `readsComponents` from the EmDash contract; versions that already take component references are still checked in full. Keep the palette and sourced-token checks while a contract does not yet take component references.
