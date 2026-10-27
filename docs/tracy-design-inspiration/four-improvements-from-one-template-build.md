# Four directions for improvement, drawn from one real template build

**Context.** Built `tracy_apple` — a T4 template for Joomla 6 — with the `joomlart-t4-template` skill,
running all of Phase 0→9 (Phase 10 quickstart was abandoned midway). The design source was the `apple`
system in `vendor/tracy/od-design-system/systems/apple/`. Result: 10 ACM blocks, 89 override files,
5 layouts, 5 styles, 33 menu items, 29 modules, a 782 KB / 333-file package, and a test install on a
clean Joomla skeleton that passed.

Every number below was **measured on the running site**, not inferred from code. This document lists
the places where a fix at the system level would benefit every template generated afterwards.

---

## 1. Design system (152 systems) — seven gaps

The sources I actually read, in the order the skill prescribes:

```
systems/apple/components.html          full fixture — 4 regions: nav · hero · features · form
systems/apple/preview/colors.html      3 illustration pages
                /typography.html
                /spacing.html
systems/apple/tokens.css               56 variables
systems/apple/DESIGN.md                prose — 7 sections
```

### 1a. `tokens.css` has no dark — the most expensive gap

`tokens.css` is light only: no `@media (prefers-color-scheme: dark)` block, no `[data-theme]`.
To build dark I had to read `DESIGN.md` §2 by eye and translate it by hand into 15 values:

| token | light | dark | where in DESIGN.md |
|---|---|---|---|
| `--bg` | `#ffffff` | `#000000` | §2 "Absolute Black — immersive hero canvases" |
| `--surface` | `#f5f5f7` | `#1d1d1f` | §2 "Near-Black Ink" |
| `--surface-warm` | `#fbfbfd` | `#272729` | §2 "Graphite Surface A" |
| `--border` | `#d2d2d7` | `#424245` | §2 "Utility Dark Gray" |
| `--accent` | `#0071e3` | `#2997ff` | §2 "High-Luminance Link Blue" |
| `--muted` | `#6e6e73` | `#a1a1a6` | **not in DESIGN.md** — see 1b |

Multiplied by 152 systems this cannot be automated, and every translator will produce a different set.

**Note:** `dark.json` already exists in the repo, but it is a **verdict** ("does this fixture survive
under a dark overlay"), not **values**. Two different things.

**Proposal:** each system also generates `tokens.dark.css`, or adds a dark block inside `tokens.css`.
For most systems this can be machine-generated from `DESIGN.md`, with the rest reviewed by hand.

### 1b. A dark palette flipped one-to-one falls short on contrast

Any automatic dark generator will trip on this, so it is recorded here:

Flipping the light ramp straight to dark (`muted #86868b`, `meta #6e6e73`) gives **5 labels below the
3.0 contrast threshold** on a graphite background — measured 2.75 to 2.94. Reason: `#272729` is
**further** from black than `#f5f5f7` is from white, so the contrast range is not symmetric. Each
neutral must step up one notch. I had to add the value `#a1a1a6` myself (the midpoint between
`#86868b` and `#d2d2d7`, which DESIGN.md lists) — it does not exist in the document.

### 1c. No type scale for small screens

`components.html` only changes padding below 640px and declares no type scale. Measured on **the
fixture itself** at viewport 390:

```
h1 56px  →  5 lines · ~9 characters/line · 294px tall   (a third of the screen for one heading)
```

All 152 systems lack it, so each generated template decides its own, and Phase 8 reports a mismatch
every time.

### 1d. A whole radius step is missing

`DESIGN.md` §5 clearly lists five steps:

```
5px            tiny utility links/tags
8px-12px       standard controls and compact fields
16px-18px      cards, module frames, commerce panels
28px-36px      larger module and spotlight containers      ← NOT IN TOKENS.CSS
56/100/980px   capsules, large pills, signature CTA
```

`tokens.css` only has `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 18px`,
`--radius-pill: 980px`. The "module shell" step is gone.

**Measured consequence:** with no shell step I used `--radius-pill` for the CTA shell. At 196px tall,
980px clamps into two half-circles of radius 98px, and text inset by 80px sits **inside** the curve;
in a narrow column it becomes an egg shape. This defect comes from a gap in the tokens, not from
carelessness.

**Proposal:** add `--radius-xl: 32px`.

### 1e. Font substitutes live only in prose

`DESIGN.md` §3 has a "Note on Font Substitutes": *Inter for text, Inter Tight for headings*. But that is
prose — no machine can read it, and `design-tokens.json` has no matching field.

**Proposal:** add `fallback` to `design-tokens.json`, for example
`{"font-body": {"value": "...", "fallback": ["Inter", "system-ui"]}}`.

### 1f. Three preview pages do not style `body`

```
components.html   body { font-size: var(--text-base); line-height: var(--leading-body);
                         letter-spacing: -0.022em; ... }
colors.html       body { margin: 0; background; color; font-family }   ← missing size/leading/tracking
typography.html   ↑ identical
spacing.html      ↑ identical
```

They inherit the browser's 16px while the full fixture sets 17px. Used as a parity target they
produce false mismatches — it took a whole round to trace.

### 1g. No images, and no rules about images

This is what made the visual review conclude the template "reads like a wireframe". The design
system provides tokens and components but no assets, and does not say what kind of image a hero
should use.

Measured against a JoomlArt template on sale (JA Voyara):

| | Voyara | tracy_apple (before fixes) |
|---|---|---|
| home page height | 4456px | 5696px |
| large images | 5 real photos + full-bleed hero | 2 flat gradients |
| lightness range across bands | 236/255 | **10/255** |
| number of distinct section *shapes* | 4 | 1 (repeated 3-card grid) |

The template is 28% longer yet has less to look at. That is not "restraint", that is missing assets.

**Proposal:** each system ships 2–3 art-directed images, or at least a one-page `imagery.md` saying
"what the hero uses, what chapters use".

### 1h. `components.html` has only 4 regions

The fixture has `nav`, `hero`, `features`, `form`. I had to build **10** ACM blocks; 7 had no model to
follow — pricing, testimonials, clients, team, accordion, statistics, cta. That is exactly where
mismatches arise and where generated templates end up looking alike.

**Proposal:** add pricing, testimonials, footer, blog card, team to the fixture.

---

## 2. The `joomlart-t4-template` skill

### 2a. Three missing gates — each catches a defect all 6 current scanners let through

| Proposed gate | How it measures | Real defect that slipped through |
|---|---|---|
| **`font-scan.mjs`** | measure the width of a test string in the font in use, compare with `serif` and `sans-serif` | **All body text is Times on every page.** Measured: 702.7px = exactly `serif`, 76px short of `sans-serif`. All 6 scanners green |
| **`rhythm-scan.mjs`** | luminance of each `.t4-section`, warn if the range < ~60/255 | 9 colour bands, range **10/255** — under 4%, reads as one white block |
| **`layout-scan.mjs`** | compare the real container width with `--container-max`, warn if < 70% | Pricing card **105px** on a 1440 desktop; CTA becomes an egg |

The first gate matters most: the font defect was the worst defect of the whole build, and **no gate
touched it**. It only showed up when a person looked.

Measuring code, ready to use:

```js
const measure = (family) => {
  const c = document.createElement('canvas').getContext('2d');
  c.font = '100px ' + family;
  return c.measureText('Handgloves 0123').width;
};
const body = getComputedStyle(document.body).fontFamily;
// matches serif while the design system declares sans → the font does not exist and fell back to the default
const suspect = Math.abs(measure(body) - measure('serif')) < 0.5;
```

### 2b. Three defects in the skill itself

1. **`secret-scan.sh` is always BLOCKED for a template package.** It exits with
   `✗ installation/ (web installer) is MISSING — not an installable quickstart`, because it is a
   scanner for *quickstarts*. But `SKILL.md` Phase 9 calls it for a *template package*. The two modes
   need separating (`--mode=template|quickstart`).

2. **No snapshot tool is shipped.** `verify-recipes.md` describes the snapshot format in detail and
   `verify-render.mjs` takes two JSON files, but nothing produces them — I had to write my own
   `snapshot.mjs` (one `getComputedStyle` pass, colours normalised to hex, picking the first
   **visible** element). It should go into `scripts/`.

3. **Keys in `verify-render.mjs` output are inconsistent** — reading them takes
   `m.get('a', m.get('joomla',''))`. Small, but a stumbling block.

### 2c. Akeeba automation — three measured facts that belong in `akeeba-method.md`

1. **The Joomla 6 admin login has no `#username`.** The field only has `name`, no `id`:
   `input[name=username]` / `input[name=passwd]`. A script using `#username` silently skips the
   login step and then hangs on the next one.

2. **The Akeeba control panel navigates itself back to `/administrator/index.php` after ~2 seconds.**
   The CP page does render (200, loads `ControlPanel.min.js`), then its JS moves away. Every script
   that does a `waitForTimeout` before acting ends up on the dashboard and reports "no button found".
   Exactly one document navigation must be blocked:

   ```js
   await page.route('**/administrator/index.php', r =>
     (r.request().isNavigationRequest() && r.request().resourceType() === 'document')
       ? r.abort() : r.continue());
   ```

3. **After blocking, `unroute` before clicking.** Otherwise Playwright hangs 30s at
   `waiting for navigation to finish` — an aborted navigation never resolves. This is why my first
   backup run died even though the engine log showed it had finished loading the filters.

4. **Kickstart 9.1 refuses to run (HTTP 403)** if the file name is guessable and there is no password.
   You must create `kickstart.json.php`:
   ```
   <?php die(); ?>
   { "password": "<bcrypt hash>" }
   ```

### 2d. One line to add to `t4-acm-block-builder`

> When the fixture DOM and the design-spec prose disagree, **the fixture wins**.

My agent read design-spec §4 ("containment is a ring, not a shadow") and switched `.card-feature`
from `--elev-raised` to a ring. The reasoning was right, but the fixture uses a shadow, and Phase 8
caught the mismatch. Rule #1 of the skill already says "the design is the spec", but the agent
definition does not repeat it.

### 2e. Two gotchas to add

- **`{loadposition}` in a narrow column gets squeezed.** A marketing page built from an ACM stack sits
  in the article column; if the template has a "reading measure" (here 720px), the section stack
  inherits it. Measured: `moduletable` 442px → container inside it 406px → pricing card 105px. The fix
  needs **both**:
  ```css
  width: var(--container-max);
  max-width: none;
  margin-inline: calc((100% - var(--container-max)) / 2);
  ```
  A negative margin alone is not enough — the box keeps the column's width and only overflows on
  both sides.

- **The fixture's preview pages do not style body** (see 1f).

---

## 3. T4 Framework

### 3a. Two real bugs

1. **`plugins/system/t4/src/t4/MVC/Model/AuthorModel.php:380`** — opening
   `index.php?option=com_content&view=author` without `gid` is fatal:
   `implode(): Argument #2 ($array) must be of type ?array, string given`.
   A menu item without `gid[]` is a 500 page.

2. **`themes/base/html/com_content/featured/default.php`** uses `$row` and `$rowcount` uninitialised
   → PHP Warning right in the markup, and empty `row-` / `column-` classes that match nothing.

### 3b. The legacy sheet bakes in literals via shorthand — blocks every template from doing dark

The following rules use `border: 1px solid #d2d2d7` or `background: #fff` (shorthand that includes
the colour), so **no token remap reaches them**:

```
.category-desc      .item-inner        .page-header       .cat-list-row
.items-more .nav-tabs                  p.readmore .btn    .moduletable
.contentpane        .form-control:focus
```

I had to name each one in `darkmode.scss`, each found by a separate scan. If T4 moved them to
`var(--t4-*)`, every dark template would lose a whole layer of work.

`.form-control:focus` deserves a mention of its own: it bakes in `color:#1d1d1f; background-color:#ffffff`,
and Joomla auto-focuses the username field on the login page — so **the first thing** a dark-mode
user sees is a white box.

### 3c. `.form-control { max-width: 240px }`

In the base sheet, it squeezes **every** input of **every** template. `width: 100%` does not beat
`max-width`; you need `max-width: none`. Affected: contact, search, registration and profile forms.

### 3d. `.btn.btn-primary` is painted from runtime-generated variables

T4 generates `media/t4/css/<style-id>.css` from `etc/theme/*.json` **at request time**, loads it
**after** `template.css`, and `.btn.btn-primary { background-color: var(--color-primary) }` reads from
it. A template cannot override this the usual way — it has to remap those 22 runtime variables
(`--color-*`, `--body-*`, `--mainnav-*`, `--footer-*`) in the dark block.

None of this is documented anywhere; I traced it by asking the browser which rule wins.

### 3e. `system_optimizecss` is not read from style params

`TemplateStyle::loadGlobalParams()` **deletes every key matching `/^system(_|$)/`** from the style row,
then reloads from `etc/global.json`. Set `system_optimizecss = 1` in the DB and it silently
disappears — the combiner does not run, with no message. It must be set in the file.

It took many rounds to trace, and could only be traced by temporarily inserting `error_log()` into
`Optimizer/Base.php` to see what value it read (`css=0` while the DB said `1`).

### 3f. The blank's `etc/presets/default.json` is a trap

This file stays in every template cloned from `t4_bs5_blank`, and the `toolbackup` field lists every
`*.json` in `etc/presets/` of the **active** template as a "Backup/Preset" dropdown on the Template
Style toolbar.

An admin clicking "Default" → **overwrites the whole style** with T4 Blank's values:
`"site_name":"T4 Blank"`, Roboto font, Bootstrap blue/orange,
`"site_logo":"images/demo/misc/t4-blank-logo.png"`. No warning, no undo.

**Proposal:** the blank ships an empty presets folder.

### 3g. Blank leftovers in a cloned template

Besides the preset, a clone from the blank also drags along:

```
templateInfo.php          $telem = 't4_blank'   → admin Overview + update-check path
templateDetails.xml       <updateservers> points at tpl_t4_bs5_blank.xml, name "T4 Blank"
etc/site/default.json     site_logo = images/demo/misc/t4-blank-logo.png
etc/fontcustoms.json      url = http://<internal-ip>/joom/t4_dev/... (JoomlArt internal IP)
en-GB.tpl_*.ini           T4_TPL_DESC_3 describes itself as "T4 Blank"
css/, scss/, php          @package T4_Blank in 14 files
js/template.js            VirtueMart cart listener running on every page
scss/frontend-edit.scss   ~230 lines of VirtueMart CSS, compiled into template.css
```

`scaffold-template.sh` handles the folder name, the two language files and `templateDetails.xml`, but
does not touch the eight items above. Proposal: extend the script, or clean up the blank itself.

---

## 4. QA / audit agents

### 4a. Three missing roles

| Proposed role | Catches | Why it is needed |
|---|---|---|
| **`t4-interaction-auditor`** | hover, megamenu paths, off-canvas layers, focus rings, accordion/modal in dark | `t4-design-review-unit` **itself states** it does not cover this — a complete blind spot |
| **`t4-content-auditor`** | lorem ipsum, off-topic images, dev instructions shown as customer content, Bootstrap-coloured `<code>` | No scanner catches these; design-review only brushes them |
| **`t4-responsive-auditor`** | 768/390: double framing, orphan words, horizontal overflow | The 21px header overflow only shows at 390 |

### 4b. An architectural problem — parallel agents do not see each other

This is the proposal I consider most valuable. Evidence from this build, all three real defects:

1. **Three ACM agents all set `padding-block: var(--tracyapple-band-y)`** on their own block, while
   the layout row already had that padding → sections render with padding **twice** (~200px instead
   of 100px).
2. **Two agents both defined `.tracyapple-field`** — the later one broke the earlier one's login form.
3. **One agent switched `.card-feature` to a ring**, another kept the shadow, and neither knew.

`build-subagents.md` §C does say "one path per agent" and "return shared lines for the spine to
merge" — correct, but not enough, because the conflict happens at the **CSS layer**, not the file
layer. Three agents writing three different files still collide on the same element.

Two fixes:

- **Contract file**: a `build-contract.json` every builder must read and write — who owns a band's
  padding, which classes are taken, which block declared which local tokens.
- **A `t4-integrator` role**: runs after every builder finishes and hunts for overlaps. Exactly what I
  had to do by hand at the end of Phase 5.

### 4c. Audits do not know what has been fixed

`t4-package-auditor` reported "the home page shows the T4 Blank logo" when I had replaced the logo ten
minutes earlier — it ran in parallel with the fix. If audit agents recorded the timestamp or commit
they measured, the reader would not waste a round re-checking.

---

## Appendix — defects and the gate that should have caught them

The ten most serious defects in this build, and what did (or did not) catch them:

| Defect | Measured | Caught by |
|---|---|---|
| Body text is Times on every page | 702.7px = `serif` | **nobody** — only when a person looked |
| Marketing page renders in a 406px column | pricing card 105px | **nobody** |
| 9 colour bands with a 4% range | 10/255 | **nobody** |
| Images are empty gradients + human silhouettes | — | **nobody** |
| Logo is `T4 Blank · Joomla 3 & 4 Ready` | — | `t4-package-auditor` |
| `etc/presets/default.json` is a reset trap | diff = identical to blank | `t4-package-auditor` |
| Internal IP `<internal-ip>` in `fontcustoms.json` | — | `t4-package-auditor` |
| Primary button keeps its light colour in dark | `--btn-bg` `#2997ff` but paints `rgb(0,113,227)` | `contrast-audit` |
| Megamenu panel white in dark | — | **nobody** (panel hidden at rest) |
| Every submenu 404s | `parent_id = 0` | manual smoke test |

The first three rows are the three worst defects, and all three are in the **"nobody caught it"**
group. That is why the three gates proposed in section 2a are worth doing before anything else in
this document.
