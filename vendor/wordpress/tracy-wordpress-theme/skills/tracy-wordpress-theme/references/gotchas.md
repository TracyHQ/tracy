# Gotchas — traps that already sprang, numbered, appended at the end

> **Cross-phase packet — read through the lessons store, not whole.** Gotcha N is lesson `L-0NN` of
> [`lessons.jsonl`](lessons.jsonl): `node scripts/lessons.mjs scan --spec … --theme …` prints only the
> lessons whose trap is in the port's inputs, and `lessons.mjs show L-0NN` points back to the entry here
> ([`lessons.md`](lessons.md)). An entry that holds more than one defect has one more lesson per defect
> (31, 46, 48, 51, 55, 63 → `L-101`…`L-107`; `show` lists them by `ref`). Most entries are fixed in code
> and never print. New entries go at the **end**, keeping
> fixed numbers so commits and notes can point at them, with one record in `lessons.jsonl`. Each entry: the trap, how it
> breaks, how to fix it, how to check beforehand.

Index by phase: Phase 0/stand — 2, 3, 4 · Phase 4/5 theme — 1, 5, 6, 7 · Phase 6 dark — 8 · Phase 8b — 9 ·
Phase 2 ingest — 10, 11, 55, 58 · Phase 7 seed — 27, 54, 56, 57 · Phase 8b fix round — 28, 29, 30.

## 1. The repo's formatter reformats GENERATED files → the `--check` gate goes red

**Trap.** `prek` runs `biome-format` at pre-commit on every staged file. `src/tracy-base/theme.json` is a
generated file (`rootVariation` → `JSON.stringify(…, null, 2)`); biome folds short arrays onto one line, and
`node scripts/build.mjs --target tracy-base --check` goes red at once because the bytes drift. Same class: the two `tracy-motion.js`
(a minified bundle copied byte-identical from `tracy-cms-motion`).

**Fix.** Exclude generated paths from `biome.jsonc` (`"!packages/cms/tracy-wordpress-theme/src/tracy-base/theme.json"`,
already there, line ~98 with a comment). A new generated file is a new exclusion line — before committing its first build.

**Check.** `pnpm test:lint` and `build.mjs --check` both green on a freshly committed tree; one of them red means the
formatter just edited a file nobody typed.

## 2. `wordpress:cli` does not add `wp` by itself — compose needs `entrypoint: ["wp"]`

**Trap.** The `wordpress:cli` image's entrypoint is `docker-entrypoint.sh` with default command `wp shell`; calling
`docker compose run cli core version` does not run `wp core version`. Fixed 13/09 21:38 (STATUS).

**Fix.** The `cli` service declares `entrypoint: ["wp"]`, `user: "33:33"` (www-data, so files it creates in the webroot
are not owned by root), mounts the same webroot and `./dist:/dist:ro` for `wp theme install /dist/tracy-base.zip`.

**Check.** `docker compose -p <project> run --rm cli core version` prints the version number.

## 3. The compose project name owns the network and volumes — always `-p`

**Trap.** A bare `docker compose up` takes the folder name as the project; the stand sets `name: tracy-base-wp7` in
`compose.yml`, but a call from another folder or with a different `-f` creates a **second project** on the same
subnet (`10.89.2.0/24`) — two `db` volumes, two networks, and `wp` talks to an empty DB.

**Fix.** Every command is `docker compose -p tracy-base-wp7 …`. Check that `docker compose ls` has no project on the same
subnet before `up`.

## 4. Host disk full → Docker dies **silently**, every `docker` call hangs

**Trap.** 13/09 20:58 the iMac disk hit ENOSPC → dockerd in the VM died (backend log `event streamer: error: EOF`), `docker
ps` hung forever, no error. Root cause: the internal disk had 6.7 GB left; `Docker.raw` on Corsair does not save the internal disk.

**Fix.** Memory `docker-restart-kill-backend-first`: kill the backend, `open -a Docker`, `docker start` the containers
of other sessions, `up -d` the stands. Before a run shooting 172 screenshots or importing media: `df -h /` ≥ a few GB.

**Check.** `docker info` returns in < 5 s.

## 5. `patterns.map.json` (overlay metadata) leaks into the generated tree and the zip

**Trap.** The overlay lays over the source as "same path wins, new path is added" — the overlay's metadata file
is also a "new path", so `patterns.map.json` went into `src/tracy-base/` and `dist/tracy-base.zip` until
it was excluded. The theme does not read it; it is a map for the seeder.

**Fix.** `OVERLAY_META_FILES` in `build.mjs` (`theme.config.json`, `theme.overlay.json`,
`patterns.map.json`). A new overlay metadata file = add it to the set **before** the build.

**Check.** `unzip -l dist/tracy-base.zip | grep -E 'map.json|overlay.json|config.json'` is empty.

## 6. `register_block_type()` with a path that does not exist → a notice on every request

**Trap.** A theme copied without `blocks/` (a half-built zip, measured 13/09) makes `register_block_type('<path>')` treat
the string as a **block name** and log a notice on every request — noise instead of just a missing block.

**Fix.** `inc/extra.php` guards with `is_readable( get_theme_file_path( 'blocks/mega-menu/block.json' ) )`
before registering. Apply to every block the theme adds later.

**Check.** `wp-content/debug.log` has no `register_block_type` notice after loading a page.

## 7. Archetype `apple` declares nav `overlay` → the header **floats** on the home page

**Trap.** `inspirations.json` records `apple` as nav `overlay` + hero `cover`; `functions.php` adds the body class
`tracy-nav-overlay`, and `layout.css` floats the header over the home page and paints brand/links in the background colour — for a cover image
the Tracy Base home does not have (its hero is a split/centered section). The header "disappears" on a light background.

**Fix.** `inc/extra.php` filters `body_class` at priority 11: removes every `tracy-nav-*`, pins
`tracy-nav-top-left`. Hero classes are left alone (the section pattern carries its own geometry).

**Check.** `curl -s :8227/ | grep -o 'tracy-nav-[a-z-]*'` shows only `tracy-nav-top-left`.

## 8. The probe treats a missing `data-theme` attribute as a broken hook — it is `auto`

**Trap.** `toggle-test.mjs` throws `Configured hook does not expose a theme` on a fresh context (no cookie);
`captureDesign` returns `mode: 'unknown'`; `shoot.mjs --dark-hook attr:data-theme=dark` is removed by the head script.
Three "fails" — none of them a theme bug.

**Fix.** Set the state with the **cookie** `tracy_theme=light|dark` before loading; the scanner setting the attribute
**after** loading works. The three-state cycle is measured with its own script
([`dark-light-mode.md`](dark-light-mode.md) §4).

**Check.** `shoot.mjs`'s dark screenshot with the cookie hook has a clearly lower mean-gray than light.

## 9. Theme Check is a **soft** gate (Q12)

**Trap.** Treat every WARNING as blocking and the custom block `tracy-base/mega-menu` (plugin territory) never
passes; treat everything as soft and real ERRORs slip through.

**Fix.** 0 ERROR required; plugin-territory WARNINGs are allowed **and named** in `VERIFICATION.json`.
The theme does not target wordpress.org (Q11); `readme.txt` says so.

**Check.** The Theme Check log is saved in `tasks/<run>/evidence/`; the WARNING list matches `VERIFICATION.json`.

## 10. The Joomla home runs the `od-landing` layout — the 5 ACMs assigned to it are **orphans**

**Trap.** j6's `/` uses template style 117 (`od-landing`) with 12 `mod_custom`; the 5 ACMs "Landing - *" assigned to
menu 247 **are not drawn by that layout**. Seeding them seeds things that never showed on the source.

**Fix.** The adapter writes `pages[].orphaned` + a note; D6: the wp7 Home = `tracy/section-*` patterns with text from the 12
`mod_custom`; the 5 orphan ACMs are not seeded, recorded in `content-gaps.md` G10.

**Check.** The source screenshot `evidence/source/home__1440__light.png` shows exactly which sections there are — compare with
`pages[].sections[]`.

## 11. Slugs: generated from the title, but only for sample-data aliases (D2 then D7)

**Trap.** D2 at first changed the slug of **every** route to follow the title; Lee narrowed it (D7): only the 11 sample-data
category aliases (`politics`, `world-news`, `food-and-drink`…) and 3 `mag-*` routes; every other page route keeps its
Joomla path (`/resources/faq`, `/services/service-detail`). Nested pages (`/company/about`) become parent/child
pages to keep the URL. The adapter was being fixed to D7 when this packet was written (3 tests `from-joomla` /
`joomla-inventory` red on 13/09) — read the generated `redirects.json`, do not read this packet as the source of the
table.

**Fix.** The old → new table in `content-gaps.md` §Slug; every changed path is one 301 line.

**Check.** `redirects.json → rules[]` count = number of gaps + number of routes whose path changed; `http-parity` compares against the table.

## 12. The inspiration's nav/hero archetype paints the hero text in the background colour
`inspirations.json` records `apple` as `nav: overlay`, `hero: cover`; following that, the `tracy` theme's `layout.css` floats the header and paints the hero text with `var(--bg)` — right for a hero with a full-bleed image, wrong for every hero without one: white on white in light, black on black in dark, `contrast-audit` reports cr=1.00. Measured 14/09 on the Tracy Base wp7 home. Fix: a `body_class` filter at priority 11 in `inc/extra.php` removes the `tracy-nav-*`/`tracy-hero-*` seeded by the inspiration and pins the classes to the source site (`tracy-nav-top-left`, `tracy-hero-split`). Lesson: a design system's archetype describes *that brand*, not the site being ported; a theme generated from it must redeclare these two classes. Caught with `review/contrast-audit.mjs` + `review/probe.mjs <url> dark 'h1'`.

## 13. WordPress's `/x` → `/x/` makes every gate that reads `redirect: manual` report wrongly
WordPress canonicalises a path without a trailing `/` with a 301. Three different tools (the seeder's route table,
`http-parity.mjs`, `quickstart/verify-parity.mjs`) each once counted 38 routes as "301"
and concluded wrongly in both directions: the seeder reported 4/49 routes right when really 49/49; verify-parity reported
"40/40 match" when the two stands only both returned 301 and no page was compared. Rule: follow a **same-path**
redirect exactly once (compare the pathname without the trailing `/`), report every other redirect with its real code. Measured 14/09.

## 14. Source text in one element, target in several blocks → parity reports a false gap
Joomla prints a team card as one `<li>` "Adam Hale Design Director Shapes the visual…"; the WordPress pattern
splits it into three blocks. Compared run-to-run, text is missing; compared as whether the source run lies inside the target's joined text, it
matches. `http-parity.mjs` does both. Before it did, 5 pages were counted as seeder bugs.

## 15. T4's chrome sits outside `<header>`/`<footer>`
The mega-menu (`.mega-*`), footer columns (`footnav-N`), off-canvas are **module positions**, not inside
the header/footer tags, so a chrome filter by tag let "Product / Resources / Company /
Find us online" into 40 routes as missing text. Name T4's classes in the filter.

## 16. An accepted delta is a file, not memory
Joomla has "Written by", "Hits", "N articles", com_finder's help text, "Read more: <title>",
a Latest module in the sidebar printing another category's posts into the content column; WordPress has none of these. Each is
one entry `{match, routes, reason}` in `parity-accepted.json` carrying the G number from
`content-gaps.md`. The gate is green on 43/43 with 94 accepted runs **by name**, not on silence.

## 17. Docs shipped for someone who only has the site
`AGENTS.md` + `docs/` must live **inside the theme** (the overlay copies them into the zip), filled with that site's facts,
and `generate-docs.mjs --check` blocks any leftover `DOCS_REQUIRED:` marker. The skill's docs cannot
replace them: they do not know what this site's menus are called. Zip +27 KB, mostly `inventory.json`.

## 18. A wp-cli runner with one container per call loses `/tmp` between two commands
`docker run … wordpress:cli wp` for a clean stand: `make-pot` writes `/tmp/x.pot`, then the counting command in
another container does not see it. Write into the mounted webroot, then delete; `home_url()` from inside that container
cannot reach the web service either — fetch the home page from the host with `fetch`.

Since 14/09 `lib/wp-cli.mjs` and `quickstart/lib.mjs` keep **one** container for the whole run (`docker exec`
per command), so within one process `/tmp` survives between commands — but do not rely on it: `--wp-keep off`
or a bash script calling the runner directly (`export-db.sh`) is still one container per command.

## 19. The Theme Check CLI exits ≠ 0 when there is a REQUIRED, even an accepted one
`wp theme-check run` returns an error code by the number of REQUIRED lines. With a soft gate (Q12), judge by **lines**
checked against the accept list, not by exit code. Tracy Base's two REQUIREDs are decisions
(`register_block_type` for mega, `Update URI` for self-update), one WARNING is a real bug (missing
copyright) — fix it.

## 20. `git add` with the untracked list sweeps up files another agent is writing
Chrome commit 0660e5a3d picked up four docs files another agent had just Written; the next commit had to say so. When
several agents write the same package, stage by the list of files **of your own task**, not `?? | cut`.

## 21. The "dark" screenshot is identical to light — the hook did not take because the site's boot script resets it
The Northgate canvas reads `localStorage["ngi-theme"]` at boot and then sets `html[data-theme]` itself; the attribute
seeded earlier with `addInitScript` is overwritten. 68 dark screenshots were pixel-identical to light, and nobody looked at
68 screenshots. Fix: `shoot.mjs --dark-hook ls:ngi-theme=dark` (a hook matching how the site persists), and **measure the
mean-gray** of the light/dark screenshots of the same route right after shooting — light ~190–240, dark ~15–45; close
together means the hook is dead. Tracy Base j6 (T4) is class + attribute, tracy-base wp7 is a cookie, Northgate
is localStorage: three sites, three hooks, measure before trusting.

## 22. `core/html` keeps the canvas export's light colours → dark mode contrast 1.0
The canvas adapter records **computed style**: the source writes `background: var(--surface-warm)`, the export comes out as
`style="background: rgb(237,234,226); color: rgb(20,23,26)"`. A typed section goes through a pattern so it is
fine; a section falling back to `core/html` lands on the page **verbatim** — dark mode flips the inherited text while the literal
background stays put, `review/contrast` reports 1.0 on About/Projects/Careers (G-W3, wp-tracy-business).
Fixed in the seeder, only on the `core/html` path: `presetInlineColors` (`scripts/lib/inline-colors.mjs`)
turns literals in `style` into `var(--wp--preset--color--<slug>)` when within ≤ 16 RGB of a preset
(`#EDEAE2` → `surface-warm #ECEAE4`); `rgba` with alpha < 0.99 is kept (the token is opaque, the literal is not),
except `0.996`, which is 254/255 from the export rounding — treated as opaque. Palette: `design-contract.json` (4 colours
measured) **plus** `overlays/<theme>/tokens.css` + `src/<theme>/theme.json` when there is `--theme-src` —
the contract alone does not know `surface-warm`, and the preset must point at the colour the theme really paints. Read
`report.inlineColors[]` (`{page, replaced, kept}`): a high `kept` means source colours outside the palette
(dry-run 14/09: 272 replaced / 308 kept, of which `rgb(107,106,100)` ×472 is a gray with no token). Running it
again changes nothing: `var(--…)` does not match the literal regex.

Two first-run bugs of this replacement itself, measured with the scanner right after seeding: (1) the source's "ink" band
paints `background: #14171a` — exactly the text colour — and was turned into `fg`, which dark mode flips to
`#eceae4` → the whole band lights up, white text on a light background. Colour replacement must go **by role**: `background*`
takes only surface presets (or the custom `tracy.brand.ink`, which the theme flips to a darker ink), `color`
takes only text presets. (2) The source's text gray `#5a5952` and background beige `#e4dfd6` are 19–40 away from the nearest token
(tolerance 16), so they were **kept** — and keeping them was exactly the bug to fix. Neutral colours
(channel spread ≤ 24) match a neutral token of the same role within tolerance 48; chromatic colours stay at 16.


## 23. A typed pattern drops the source's text — no error, no note, http-parity red 17/17
Measured `http-parity --runs leaf` on wp-tracy-business: `services` lost the label "Covered by the contract" +
3–5 bullet points + "Timeline: 6–10 weeks…" of each card (the pattern has only title/desc), `projects` lost the
meta "48,000 m² · Shushary", the testimonial lost "Dmitry Lapin · Site Manager", `form` lost the select's options,
the file caption, the consent sentence and the whole address column. `renderTypedSection` only writes a note for a **field
in the spec that the pattern has no block for** — text the extractor put into no field is counted by nobody.
Fix: a text-coverage gate in `renderTypedEntry` (`typedCoverage`, seed.mjs): every run of `section.html`
(leaf, ≥ 3 words) must be "contained" in the markup's text (compared after removing whitespace — the canvas joins spans without
a space, "fornext-generation"); dropping ≥ 1 run sends the **section to core/html** and the report says which runs
were dropped; `--typed-loss allow` keeps the pattern. `fields.filters` chips and "Read more →" do not count, even when the
extractor reads the whole chip row as one run with the button. Dry-run 14/09: **31/108 sections fell back to html**
(text 10, slide 5, projects 4, services 3, form 3, team 2, cta 2, hero 1, gallery 1) — that is the list of
patterns to fix, not a gate to loosen. The gate also exposed a seeder bug: the `cta` band lost both buttons because the
extractor listed the buttons in `items` and the "cta is a card's link" removal pass ate them too — the pass is now skipped
when the map declares `dropped.items` (8 sections back to typed).

## 24. One source `<section>` wraps two or three blocks, each with its own h2 — reading it as one loses the pricing table
The Northgate canvas merges "How the work runs" + "Indicative pricing" into **one** `<section>` (the same in
Investor relations: Dividends + Investor calendar + Corporate governance; Slides: Ready-made decks +
House rules + aside Brand assets). A section's `fields`/`items` only describe the first block, so the adapter produced
a `projects` section carrying block 1's heading, block 2's intro, block 1's items — the four pricing rows were not
anywhere, and no gate went red because the text was still inside `html`. Fixed in `splitBlocks` (`html-content.mjs`):
every `h1`/`h2` outside an item opens a block, an `<aside>` is its own block, the card-row floor is 3 (a pair is two
columns). Measured on the real spec: 116 → 138 sections, each page's text and images **identical** before/after (the
sections' text joined and compared), the page's 40 sections unchanged byte-for-byte. Trap that comes with it: ids are renumbered
consecutively within the page, so a `patterns.map`/`parity-accepted.json` pinning `services-en-6` (the old CTA) now
points at "Indicative pricing".

## 25. Slugs from Cyrillic titles: WordPress counts 200 **encoded** characters, including the ones it is about to drop
Polylang free does not let two languages share a slug, so RU pages take their slug from the title (`i18n-polylang.md`
§2). `sanitize_title` (context `save`) works in this order: folds accents only on Latin letters (Cyrillic stays
as is, `ё` is `ё`), lowercases, percent-encodes every non-ASCII byte, then **cuts at 200 characters of the encoded
string** — only after that does it drop `«»` (`%c2%ab`), curly quotes, ASCII punctuation, and turn `.`→`-`. So `Завод … «Электра»,
ОЭЗ «Липецк»` loses `«Липецк»` not because it was dropped but because the six characters of each quote mark had already eaten the
budget. The seeder looks old pages up by `post_name`, so `wpPostName()` must produce **exactly the bytes** WordPress
stores — one step wrong and run 2 recreates every RU page with a `-2` suffix. Four real titles are the test's fixtures
(`seed.test.mjs`, "wpPostName of a TITLE"); to change the rule, measure first with `wp eval 'echo sanitize_title(…)'`,
do not infer it from the documentation.

## 26. Line breaks are content, not CSS — the seeder types nbsp before the text reaches the site
The canvas export writes text with ordinary spaces, and at a width the canvas never drew the browser breaks wherever
it likes: "October" at the end of a line, "2026." alone on the next; a service card ending with a line "45 m.";
the footer leaving "OGRN 10440xxxxxxxx ·" hanging at line end; «SRO admission» / «No. 214» on two lines; "2024–" / "2026"
split at the dash. `text-wrap: pretty` only handles a paragraph's last line, not which pairs must stay together, so this
is the **seeder's** job (`lib/typeset.mjs`, applied to post/page content and part overrides, every language):
day–month–year, number–unit, preposition–number, label–"No."–number, thousands groups, place name–"Region"/"область", currency–number,
the middle dot ` · ` (both sides), and year ranges wrapped in `<span style="white-space:nowrap">` (U+2011
changes the glyph). Only text between tags; block comments, attributes, `<pre>/<code>/<script>/<style>/<svg>` are left
alone; a second run changes nothing. Text parity does not move because JS `\s` matches U+00A0. Trap: a rule
typing nbsp on both sides of the middle dot can leave a long run with no break point at 390 — the source's same-row chips
are separate `<span>`s so they are not affected; an "A · B · C · D" run in **one** text node is.


## 27. Many posts sharing one `post_date` → listing pages return different HTML on each request
**Trap.** The Joomla source records the same date for a whole batch of posts (Tracy Base: 51/51 posts `2021-09-14 00:00:00`),
and the listing query is `orderBy date`. MySQL returns tied posts in an order that varies per call. **How it
breaks:** measured 25/09, 5 fetches of each page on an unchanged DB gave different HTML on 9/38 pages (blog, archive, category,
tag, team, service-detail, three resources categories). Their visual findings flipped between
two runs with no code change, the raw total swung ±30–45, and the previous run's "noise floor only in the cursor" under-measured
because those pages happened to be axis-error in that run. **Fix:** the seeder (`lib/post-content.mjs`
`distinctDates`) gives each post in a tied group one second, the first post in source order is the newest,
keeping the calendar date; the first seed after the change updates the whole group once, later runs `+0 ~0`.
**Check beforehand:** `node scripts/visual/determinism.mjs --run-root … --site …` — a page with more than one
variant is a seeder-group bug, not a visual finding; `round.mjs` runs it every round and drops those
pages from the stop rule.

## 28. `spawnSync` inside a parallel runner stalls everything else it is doing
**Trap.** `visual-qa` called `review/mega-hover.mjs` with `spawnSync`. A synchronous call blocks the event loop the whole
time the child runs, so the 3 axes `mapLimit` keeps in parallel stood still 16.9 s on every page with a `mega` — and
every page has one. **How it breaks:** no error, just slow: full 38 pages 774.7 s / 776.2 s; the
`await` version (`lib/child.mjs`) 402 s / 407.5 s, identical verdicts on 33/33 deterministic pages (one machine, each
version two runs, 25/09). Same trap elsewhere: the first version of `round.mjs` ran steps with `spawnSync` and stalled
the mock site running in the same test process too — every page became axis-error. **Fix/check:** a long child
tool in a process that still has other work is `await`ed (timeout + SIGKILL), not `spawnSync`.

## 29. One Chromium death turns every remaining axis of the run into `axis-error`
**Trap.** `lazyBrowser` kept one browser for the whole run and never restarted it. **How it breaks:**
Tracy Base's visual-01 lost 13/38 pages; killing `chrome-headless-shell` 20 s into a 6-page run
made 3/6 axis-error, and that run had to be rerun by hand (62.8 s, recovered 3/3, results equal to
full). **Fix:** `lazyBrowser.restart(dead)` (once per death, however many jobs see it) and
`visual-qa` re-measures every axis-error axis **within the same run** (`--axis-retries`, default 1); the axis carries
`retry`, the summary counts `retried`/`retryRecovered`, `VISUAL.md` names them. **Check:** an axis still axis-error
after the retry means the run cannot compare that page — `round.mjs` leaves it out of the comparison, never counts it as clean.

## 30. `--reuse` cannot help a CSS fix round, and picking the "pages with findings" to re-measure misses some
**Trap.** `page-hash.mjs` hashes **every** `assets/css/*` into every page, so any CSS fix changes the hash
of all 38 pages; and `--reuse` only takes back **clean** axes, and mid-tier 0/38 pages are clean. The shortcut "re-measure
the 10 pages with the most closed findings" is wrong too: round 1 of Tracy Base (global CSS) put new findings
on 32/38 pages, measuring 10 pages missed 170/425 new findings (40 %). **Fix:** select by **the change's
impact**, fail closed — `round.mjs` (through `affected.mjs`): CSS by selector on the live DOM, template/
part/pattern/content by the hash of the served HTML, everything else runs full. A targeted run never closes a
tier. **Check:** the `rounds.jsonl` line records `scope.reason` and `changedFiles` — read it before trusting a
green targeted run.

## 31. A category page lists archived posts, menu pages, and pages without images too

**Symptom.** Tracy Base `/services` (category blog 15 on the source, 6 cards with images) came out as 10 cards on WordPress: 3 Joomla
posts with `state=2` (archived), the page `/services/service-detail` (a post of category 14, only placed under the same parent), and 5 pages
without images. **Why.** The category post query did not exclude the `archived` tag; the child-page query took every page with the same parent; the seeder
only set `_thumbnail_id` for posts. **Fix.** The category query uses a `taxQuery` of the `include`/`exclude` form (WordPress 6.8+)
to exclude `archived`; the child-page query `exclude`s pages not in the category (by the spec's `joomla.catid`, including
child categories); a page with a `featuredImage` gets its image set like a post. After the fix: exactly 6 cards, source order, 6 images; seed run 2
`+0 ~0`. **Remaining.** Pages and posts are two queries, hence two grids: the last row does not continue the page row (cards 5–6 start
a new row) — record an exception, or a dedicated listing block. Tag pages (`com_tags` view=tag) and author pages have no
data yet: `joomla-dump` does not read the tag table, so a tag page lists every post.

## 32. Layout boxes drift and no machine finding says so

**Symptom.** The hero squeezed into one of two empty grid columns, a band painted gray where the source is white, section titles shifted left,
a CTA box the wrong width — the page looks nothing like the source while the finding count drops only by a few dozen. **Why.** Parity compares the type styles
of paired elements; nobody compares the boxes that hold them. **Fix.** `visual/layout-boxes.mjs` before the layout lens; fix
by the measurements it prints, measure again. **Check.** Tracy Base 25/09: one mistaken hand measurement (taking the 896 px child div instead of the 1024 px box)
narrowed the CTA wrongly — `layout-boxes` itself caught it. Measure with the tool, not by hand.

## 33. Tools run on the machine that built the port and die on another

**Symptom.** Rerunning Visual QA for JA Kinetic (the second template) on a different machine (25/09): 30/30 axes
`axis-error` "execution context was destroyed"; `determinism` reported 30/30 pages non-deterministic; `layout-boxes` reported one
drifted block on the Contact page. **Why, one by one.** (1) `sourceUrlOf` preferred `contract.source.site` —
`127.0.0.1:52002`, the building machine's stand — over the run's `--source-site`, and the `goto` error was swallowed. (2) AcyMailing generates
form ids per request (`formAcym33991`, `email_field_607`, `nocache=<unix time>` in a script): the hand-written token list
(nonce, CF7) did not know the new plugin. (3) The "Privacy note" heading is in the source DOM but hidden. **Fix.** The run's
address wins over the address in the contract, and a source that does not answer is reported by name; normalise ids with ≥ 4 digits, numbers in identifying
attributes and in inline scripts (a change in content order still shows through the text); `layout-boxes` skips headings that are not displayed.
After the fix: 0/30 non-deterministic pages (two runs), 0 axis-error, 3 findings (cursor), Contact 0 drifted blocks.
**Lesson.** One template only proves the tools run on itself; a second template on a second machine exposed three bugs
in one hour.

## 34. The label above a heading drifts while the heading box still matches

**Symptom.** Tracy Base 1.1.0 was released with the chip "Thoughtful websites. Practical results." at the left edge of the
hero column (centre x 341) under a centred h1 (centre 720); `layout-boxes` reported 0 drifted blocks on the home page, and a tester on
`cowork.tracy.site` saw it at once (26/09). **Why.** The tool only paired headings; the chip is a `p` right above the h1, styled
`inline-flex`, so the column's `text-align`/`margin: auto` could not move it. **Fix.** `layout-boxes` also measures the short line
(≤ 80 characters) right above each heading and compares the **centres** of both sides (`label centre`). On version 1.1.0: 720 → 341 (1440) and
195 → 127 (390); on 1.1.1 (chip `flex` + `width: fit-content` + `margin-inline: auto`): 0 drift.

## 35. Two measurements of the same animated page give two different pages

**Symptom.** JA Vega (Joomla, T4, 26/09): the home page has 53 AOS elements (`data-aos`, a delay per element), 3 Owl
carousels, `/about-us` 2 infinite keyframe loops. Two consecutive full-page screenshots with no code change: 2.5 % of pixels differ (`/`) and
6.3 % (`/about-us`); AOS elements are `opacity: 0` until scrolled to. **Why.** Screenshots and computed styles are captured while
reveals/transitions/slides are still running. **Fix.** `lib/motion.mjs` `freezeMotion`: a stylesheet puts reveals in their end
state, finite animations/transitions at 0 s; **infinite** animations are held at the run's `LOOP_HOLD_MS` (1 s),
not ended — ending them returns to the original style, and text shown only by a loop (three rotating words, each `opacity: 0`)
all disappears (measured on Chromium). Carousels stop at the first slide through the library API (Owl/Slick through the jQuery instance,
Swiper through `el.swiper`, Splide only when the page keeps the instance on `el.splide`) and are counted only once they **have reached** the first
slide: Swiper 8 loop with `slideTo(0)` sits on the clone of the last slide, Slick mid-transition ignores `slickGoTo`,
Owl markup with jQuery but no instance keeps running. Runs in visual-qa's `settle()`, `shoot.mjs`
(`--live-motion` to turn it off; `index.json` carries `motion`), `layout-boxes`. A carousel no API can reach is counted as
`unhandled`, a stylesheet blocked by CSP is `{error}` (the axis carries `motion`, `VISUAL.md` names it) — never assumed
still. Motion is part of the design, so it is **compared separately**: `visual/motion.mjs` measures
**before** freezing (reveal, carousel, loop, paired by the nearest heading). **Check.** After freezing: 0 px drift on both
pages; a test of two visual-qa runs on a fixture with AOS + a timed carousel gives identical screenshots and measurements (with freezing off
even the screenshot sizes differ). `autoplay` is read from the library or the option value — `"autoplay": false` in
`data-owl-options` was once read as on; nav/dots count only when drawn (Owl keeps `.owl-nav.disabled` in the DOM).

## 36. Biome line-wrapped selectors make a CSS fix round run FULL

**Symptom.** Tracy Base dd-2: fixing one rule, `round.mjs` chose FULL — 435 s instead of ~40 s. **Why.**
`affected.mjs` split the selector list at **every** comma: `:is(\n  a,\n  b\n)` into `:is( a` and `b )`, the browser
rejects them, and a selector that does not parse fails closed. **Fix.** Split at top-level commas (outside
`()`, `[]`, strings), collapse whitespace; `:is/:where/:has` are kept with cleaned arguments, other pseudos dropped (only
widens). A really wrong selector still goes FULL.

## 37. The quickstart carries media and default content that prune never asks about

**Symptom.** The Tracy Base 1.1.0 pack was reported to carry 36 attachments (+10 MB) and both "Hello world!" and "Sample
Page" while prune said 0. **Why.** `prune-audit` only listed build traces (revisions, transients, users, files…);
media and default content were not on the list it asks about. **Fix.** `classifyMedia` (quickstart.md §prune):
an attachment nobody references and the two default items are PRUNE, each KEEP records the reference that keeps it, a failed reference collection is
UNKNOWN. **Check.** On the stand `tb-wp7-check` (a restore of Tracy Base, 26/09) 36/36 attachments are featured images
of 50 published posts → KEEP exactly by the rule, no default items — the "36 orphans" figure did not repeat there; if
featured images show on no page, that is the template's job, not prune's.

## 38. The cycle dies at the last step over something knowable from the start

**Symptom.** Three failures releasing Tracy Base: `cycle.mjs` green for ~100 s, then release died "--run-root is
required"; `release.mjs` printed `gh release create` for a release that already existed (a command that can only fail); `package.mjs` reported
"theme could not be found" when the runner was a container that could not see the zip's host path. **Fix.** Check what is knowable
first: cycle `preflight` before the first phase and before creating/deleting anything; release asks `gh release view`, then prints
`upload --clobber` or `create --draft`; package asks the runner `is_readable` before installing and says "pass
--zip-in-container <path>".

## 39. Rounded bordered cards missing on the site while `layout-boxes` says it matches

**Symptom.** Tracy Base "The essentials": the source has 1 px bordered cards with an 18 px radius on the page background, the site has bare
columns; `layout-boxes` 0 drifted blocks. **Why.** A panel was only recognised with a background or an image; a transparent card with only a
border is "no panel" on both sides. **Fix.** A border on all four sides or a shadow is a panel too; panels additionally compare border width +
colour and the four corner radii (`panel border width/colour`, `panel radius`). A wrapper that is only rounded and draws nothing
is still not a panel.

## 40. A good-looking site nobody asked whether it works

**Symptom.** The skill measured looks (visual-qa, parity, layout), but no gate asked whether links answer, forms
can be filled, search returns results. **Fix.** `review/functional.mjs <site> --routes …`: internal links < 400 (each URL
once), no console errors, `img` has `alt` (`alt=""` is valid), visible fields have a label (a placeholder is not a
label), forms have a submit, `<html lang>`, exactly one `h1`, the search page with a word taken from a site heading returns
results **containing that word** (a heading echoing the query is not a result); `examined` counts each kind. **Check.** JA
Kinetic WP (26/09): 41 links, 9 results for "observability", 1 finding — `/about/` has two `h1`s.

## 41. `motion.mjs` reports no motion on a site that runs Tracy's motion library

**Symptom.** JA Vega (j6 → wp7, 26/09, issue #5): `visual/motion.mjs` reported reveals 53/0 on the home page and
31/0 on `/about-us`, while WordPress ran 52 reveals (the acceptance script watched all of them play). On
`/contact` the WordPress side had one loop: the Contact Form 7 spinner, which stays `visibility: hidden` until the
form is submitted. The hero and stories carousels were recorded with `nav`: the unanchored selector
`[class*="-nav"] button` matched through an ancestor, the **body** class `tracy-nav-top-left`. Freezing did not know
`.tracy-motion-reveal` either, so screenshots and `layout-boxes` measured reveals that were still hidden. **Why.**
The measurer only knew AOS/WOW/animate.css. The Tracy library (`packages/cms/tracy-cms-motion` in TracyHQ/tch)
marks elements with classes, removes `tracy-motion-in`/`-bold` once they have played (v1 also removes the unit
classes), and themes set delays through the `--tracy-motion-delay` variable, not necessarily through a
`tracy-motion-delay-N` class. **Fix.** In `lib/motion.mjs`, `TRACY_MOTION` is the single vocabulary: config slots,
effects named as AOS names them (no modifier is `fade-up`; `--fade-left/--fade-right/--flip-up`; an unknown
modifier plays `fade-up`, as in the library), duration from the config intensity (700/1500 ms), and the v1 units
with the `hero-stagger`/`fade-up` stagger step. Call it through `measureMotion(page)`. A reveal counts only while
`html.tracy-motion` is present and the config enables it (`minWidth` met); the delay is the computed
`--tracy-motion-delay`. AOS defaults are read from `<body>` (the `data-aos-duration` set by `AOS.init`). Tracy
carousels: slides are the children of the track, there is no autoplay (the runtime has no timer), nav is
`.tracy-motion-prev/-next` inside the carousel's `<section>`, and dots are a `.tracy-motion-dots` that holds
buttons. Controls of other carousels are searched with `:scope`-anchored selectors inside the carousel and at most
three ancestors that contain no other carousel, never `main`/`body`/`html`. A loop counts only when rendered (it
has a box and is not `display: none`/`visibility: hidden`, directly or through an ancestor; opacity 0 still
counts). Freezing shows reveals and waiting `section`s under `html.tracy-motion`, ends v1 units, holds pulse
loops, and puts Tracy carousels on their first slide through their own ArrowLeft handling (`{tracy}` in the
result). **Check.** `motion.test.mjs` run against `lib/motion.mjs` from `713a0ed`: 7 tests fail, all on
assertions (the 6 new tests for Tracy reveals/carousels/loops, hidden loops and bounded controls, plus the `tracy`
key in the freeze result). Isolated probes on the old code: 0 Tracy reveals counted, `nav` recorded for stories
through the body class, reveals not shown when frozen, Tracy carousels left at −600 px, hidden spinners counted.
JA Vega after the fix: `/` 53/52 (one real difference remains: testimonials 6 → 5), carousels 3/3 with no
difference, `/about-us` 31/31, `/contact` loops 0/0. Real gaps remain: `/typography` spinners 16 → 0,
`/blog-detail` 2 → 0, `/portfolio` 6 → 0, service pages 3 → 1.

## 42. The 404 page fails parity when it is right, and functional never opens it

**Symptom.** JA Vega (j6 → wp7, 26/09, issue #7 items 1 and 4): `http-parity.mjs --routes page-map.json` reported
`FAIL 404/404 /404 runs 2/2`: both sides answered 404 and every run matched. `review/functional.mjs` on the same
page-map measured 29 of 31 pages, and the 404 page was never checked for `lang`, `h1` or links. **Why.**
http-parity read the expected status only from `--pairs` (`status`); `loadRoutes` kept the path of each page-map
entry and dropped `view: "404"`. functional filtered out `synthetic` pages. The 404 page and the post standing
in for the single view are both synthetic, and the 404 page is the one visitors reach from every broken link.
**Fix.** `lib/routes.mjs` `readRoutes` keeps each entry's declared status: an explicit `status`, else 404 for
`view: "404"`. http-parity expects a pair's `status` first, then the page-map's, else 200. A declared status
other than 200 passes only when both sides give exactly it (a live source that serves a page there fails), and
the text is still compared. A `--source-snapshot` file keeps no status, so such a live route is rendered. A
static export's error page answers 200 whatever it holds, so a declared 4xx is checked on the target alone
and noted, but only when a from-html `reference.json` (kind `html`) lists the page with its `static` file: a
path ending in `.html` proves nothing, and a declared redirect is never met by a file (`TOOL_VERSION` 5). functional measures every page. A route
with a declared status must answer exactly that status and is read for every other check. A same-page
`#fragment` href is not counted as a link: resolved, it is the page's own URL, which on the 404 page answers
404. **Check.** `http-parity-status.test.mjs` (page-map and snapshot tests) and `functional.test.mjs` (two
tests) fail on `bfda9dc`. JA Vega live: parity 30/31 → 31/31 (`ok 404/404 /404`), functional 29 → 31 pages, `/404` 0
findings. The one real finding (`/typography` two `h1`, D-17) is unchanged.

## 43. Renamed uploads read as missing images, and hide the images that really are missing

**Symptom.** JA Vega (26/09, issue #7 item 2): http-parity reported 4–9 `images-missing` on 20 routes, 120 in
total, for images the port did show. **Why.** Images were compared by basename. WordPress renames an upload
whose file name is already taken (`joomlart/features/item-5.jpg` → `uploads/2026/09/item-5-7.jpg`), and the
source has many `item-N.jpg` in different folders. The same basename comparison also passed a source image
whenever some other image of that name was on the target. **Fix.** `--media-map <seed-out>/media.json` (the
seeder's index: source path under the images dir → imported URL). A source image whose path ends with a key is
present when the target shows that URL or a generated `-WxH` size of it; otherwise it is reported by its
source path. An image the map does not name is still compared by basename. `lib/parity-extract.mjs` returns
`imagePaths` next to `images`. The map's hash is in the cache key; `TOOL_VERSION` 3. **Check.**
`http-parity-images.test.mjs` fails on `bfda9dc`. JA Vega live, 31 routes: 120 → 72 missing images. 55 renamed
uploads cleared; 6 newly reported that a shared basename had hidden (`others/item-1.jpg`, six service pages).
The other 66 are unchanged, e.g. the service icons and `/featured-articles` (G16).

## 44. A review tool that judged what it did not read

**Symptom.** Issue #7 items 3 and 14. `http-parity.mjs --accept <typo>` ran without any exception and reported
17 failing routes instead of 1 on JA Vega, with nothing saying the list was not read. `--routes /` crashed with
`EISDIR` (it read `/` as a file). `editability.mjs --theme <typo>` loaded an empty theme and passed every run.
On the page side, editability blamed a page body's "Nothing here yet." (post content, G45) on
`templates/archive.html` because the same words were there. **Why.** Named inputs went through
`fs.existsSync(...) &&` and were skipped when absent. Editability compared a set of strings with the theme
files and did not record where on the page each string was drawn. **Fix.** `lib/routes.mjs`: a file named by a
flag must exist and parse, and a flag must have a value, otherwise exit 2 naming the flag before anything is
fetched (http-parity `--routes` file, `--accept`, `--pairs`, `--map`, `--media-map`, `--source-snapshot`;
functional `--routes`; scan `--routes`, `--theme`; editability `--theme`). A route list must be `/paths`.
Editability reads each occurrence. A run drawn only inside `.wp-block-post-content` is not matched against
`templates/`, but is still matched against parts and patterns; one occurrence outside is enough. The verdict
counts these runs as `inContent`; `TOOL_VERSION` 2. The 404 page gets no exemption: its copy lives in a synced
pattern the 404 template references (`editability-standards.md` §1), and copy in `templates/404.html` is still
baked. **Check.** `http-parity-inputs.test.mjs` (all 9, `--routes /` included), `editability.test.mjs` (3) and
`review-scan.test.mjs` (1) fail on `bfda9dc`. JA Vega live: `--accept` typo → exit 2. Editability over 31
routes: 974 runs, 462 only in post content, 0 BAKED before and after. The port had already fixed G45 and the
404 copy, so the live stand cannot show the item-14 difference.

## 45. A category route seeded as a page prints "Nothing here yet." and fails its identity check

**Symptom.** JA Vega (j6 → wp7, M4, 26/09, issue #9 items 10 and 18): `/services` showed its six service pages
and, under them, the theme's "Nothing here yet."; `review/editability` counted that text as baked. The visual
contract reported `identity-mismatch` on 9 pages every run (`/category-blog`, `/portfolio`, the six
`/portfolio/*`, `/services`): it expected `tracy-page-listing` and the site printed `tracy-page-page`. **Why.**
The seeder answers a Joomla category route with a page holding query blocks. `buildArchiveContent` always
appended the post query of the category, even when every article of the category had become a child page and
no post was left in it; and the contract took the body class from the page-map view (`category` → listing)
while WordPress serves a page there. **Fix.** The seeder records the categories that hold a published post
(`ctx.postCategories`) and leaves the post query out when the page has child pages and neither the category
nor any category below it holds one — in the spec or in WordPress (`publishedPostCount`, so a post the site
owner published there since brings the query back; an unreadable count keeps it; the count leaves out the
`archived` tag as the query does, else a category holding only archived articles still printed the empty
query); a listing without child
pages keeps its query. The query names every category below it that the site holds, not only the spec's: the
block leaves children out, so a post in a category the owner added below would count yet never show. Every listing route the
seeder answers with a published page is reported `served: "page"` in `routes[]`, and the contract expects
`tracy-page-page` there while `layout` stays the view. **Check.** On the port's spec, `services` has 6 child
pages and 0 posts in it or below it → no post query (before: always one). Contract identity against the live
WordPress stand (:8262, `curl` of each page's body class, 29 pages, seed report `m4/seed-final-2.json`): 9
mismatches at `bfda9dc`, 0 after. The adapter's own spec for JA Vega has duplicate category slugs (six
`services/*` and `portfolio/*` children share slugs), which merges their terms — a separate defect, not fixed here.

## 46. Child pages come out in insertion order, next to WordPress's "Hello world!"

**Symptom.** JA Vega M4 (issue #9 items 11 and 12): "Other Services" on a service page listed its siblings in
the reverse of the source's order, and blog, author and search listings showed "Hello world!", a post the
source never had; "Sample Page" was published too, and both would have gone into the quickstart. **Why.** The
seeder wrote no `menu_order`, so siblings tied at 0 and a `menu_order` query fell back to insertion order; and
nothing removed WordPress's install samples. **Fix.** `pageMenuOrder`: every child page gets its place among its
siblings, from 1, in spec order, with pages from Joomla articles in the source's category order
(`joomla.ordering`, then article id); an integer `menuOrder` on the spec page wins; top-level pages keep 0.
`installSamples`: "Hello world!" and "Sample Page" matched by type, slug and title (`WP_DEFAULTS`), never edited
(`post_modified = post_date`), not seeded by this run and not still in use (`sampleReferences`: front page or
posts page option, a classic menu item, a block id, an `href` or a block `"url"` (a custom navigation link) in
other content — kept with a note; references
that cannot be read keep them all) go to the trash with `wp post delete` (no `--force`), `samples ~N` in the
report. **Check.** JA Vega `/services` children: database-security 1, it-consultancy 2,
app-development 3, cloud-services-2 4, software-development 5, managed-services 6 (article ids 13, 75–79, all
`ordering` 0); the source's "Other Services" on `/services/database-security` prints it-consultancy,
app-development, cloud-services-2 — positions 2–4. The samples are exercised on a fake site
(`seed-i18n.test.mjs`): the untouched post is trashed, an edited sample page stays, the second run trashes
nothing. Not measured on the live stand: the port had already deleted them by hand.

## 47. The 404 template draws baked words when the source's 404 is `error.php`

**Symptom.** JA Vega M4 (issue #9 item 21): `wp option get wp_ja_vega_404_page` → "Could not get"; the 404
template printed its fallback words and editability reported 2 BAKED. **Why.** `notFoundPage` skipped a
synthetic view `404`, and the Joomla page-map's `/404` is always synthetic (Joomla serves `error.php` for an
unknown path; no route names it). The adapter also took an article titled "Error page" that the site serves
at its own route (`/error-page`, a demo of the 404 style) as the 404 body: a path-less draft with the same slug
as that page — on the first seed WordPress gave the routed page `error-page-2` (port log, M3.5 seed 1), later seeds match
both to one post. **Fix.** `notFoundPage` takes a synthetic view
`404`. `notFoundDraft`: with no spec page at that path, the option names a draft — the spec's path-less view
`404` page, else a draft `page-not-found` whose h1 is the page-map title (a note asks for the source's other
words), a slug shared with a routed top-level page gets `-404`; `/404` keeps answering 404. The adapter uses an
"Error page" article only when no route serves it. **Check.** On the port's page-map `notFoundPage` returns
`null` at `bfda9dc` and `/404` after. Re-ingesting `j6` with the fix: no draft of the `/error-page` article, the
page-map 404 title is "Not found", and the seeder's draft is `page-not-found` with that h1. On the adapter spec
of `bfda9dc` (which still has the colliding draft) the seeder files it as `error-page-404`.

## 48. Ingest drops the class of a list and the fields a layout override prints

**Symptom.** JA Vega M4 (issue #9 item 13): the check-mark lists (`<ul class="my-4 list-special">`) of the service
pages rendered as plain bullets, and the "benefits" block of the six service pages was missing — the port
added both with its own script. **Why.** `html-to-blocks` kept the class of headings, paragraphs and groups but
not of `<ul>/<ol>`; and `articles()` never read `attribs`, where JA Vega's layout override `services.php` keeps
`services_benefits` (a subform) and `services_question`. **Fix.** A list keeps its class in `className` and on
the tag. `articles()` returns `layout` and `fields` (every non-core `attribs` key with a value); pages and posts
carry `joomla.layout`, `joomla.fields` and `joomla.ordering`. `--article-fields <file>` names what to place —
`{ "<field>": { "className": "…" } | "skip" }` — and a placed field becomes editable blocks after the body
(group per subform row, h4 for a title key, paragraph, image — an image keeps its class as the block's
`className`); a field not named is listed in `provenance.notes`. A named config file that does not exist, or
holds `null` or a list, is exit 2. **Check.** `from-joomla.mjs` on JA Vega
`j6`: `list-special` list blocks 0 → 15 (15 of the 18 source lists; the other 3 are in trashed articles), 53
pages and posts carry `joomla.fields`, and with `{"services_benefits":{"className":"jv-benefits"}}` 6 service
pages get the benefits block; without it the note names `services_benefits`, `services_question` and
`question-title` with their six routes.

## 49. `layout-boxes` measured light only and exited 0 with every block differing

**Symptom.** JA Vega M4 (26/09): `visual/layout-boxes.mjs` had no theme flag, and exited 0 with 129 of 129
blocks differing (`lb-cli-1440-light-0.md`). The dark stage of visual-qa.md asks for a dark layout-boxes
reading; M4 took it with a hand-written wrapper. **Fix.** `--theme light|dark` with a hook per side
(`--dark-hook`, default `attr:data-theme=dark`; `--source-dark-hook`, default the site's; `--light-hook` /
`--source-light-hook`). A `cookie:` part is a request cookie set before the first navigation, so a theme the
server picks from `tracy_theme` is dark on the document itself; an init-script cookie arrived after the page was
answered. The mode is checked, never assumed: after the page settled each side's dark mark (`--dark-check` /
`--source-dark-check`, default the side's hook) is read, and a side whose script undid it or whose server ignored
the cookie exits 2, not measured. A hook with no readable mark (`cookie:`/`ls:` alone) is refused before anything
is measured. A route either side does not answer with 2xx (or the page-map's declared status) exits 2: an error
page has no heading, and "0/0 blocks differ" read as a pass. Of a page-map's `synthetic` pages the 404 page is
kept and measured at 404 (it is synthetic only because the source answers its error page for any unknown path). The report records `theme`, `hooks` and `checks`.
Exit 1 when any block differs; exit 2 for a named `--routes` file that is not there, and for any flag named
with no value (`--light-hook` at the end of the line is not "no hook").

## 50. `mega-hover` clicked the label link of a "link + button" item and died

**Symptom.** JA Vega M4: `visual-qa --mega-items .jv-mega`, markup `<a class="jv-mega__link">Our
Services</a><button class="jv-mega__trigger">`. The trigger was the first of `:scope > a, …, :scope > button`
— the label link. After Escape (the theme closes after a 300 ms transition and does not reopen for a pointer
that never left), the walk clicked the "trigger", the page navigated, and `page.evaluate` threw "Execution
context was destroyed", uncaught; visual-qa recorded `mega-menu` with `output: ""` on 31 of 31 pages. The
contract meanwhile named `.tracy-mega__trigger/__panel` whatever the theme. **Fix.** The trigger is the control
that opens the panel. A declared `--trigger` is the only one: an item it does not match is a FAIL row, not a
fall back to a guessed button (a wrong contract would pass). Without one: `button[aria-expanded]`, `button`, and
only then the link — which is hovered, never clicked. Open and close are polled with a bound; reopening leaves
the item and comes back (`reopens`). A walk that throws is a `FAIL (walk error)` row. The contract takes
`interactions.mega {items, trigger, panel}` from review.config.json `mega`; the runner walks exactly those and
refuses a different `--mega-items`. A child that did not pass keeps its exit status and stderr in the finding,
also after it printed FAIL rows or "0 FAIL", and the length bound never cuts them; of stderr it keeps the first
line (the error) and the last lines, cutting a long stack in the middle. A `--trigger` or `--panel` named with no
value exits 2 rather than walking the fallback triggers.

## 51. Parity read screen-reader words and paired a pill with the heading around it

**Symptom.** JA Vega ld-0: `core/read-more` prints `Learn more<span class="screen-reader-text">: Database
Security</span>`; the runner read "Learn more: Database Security" and reported it unclassified (18 rows).
The source's "What we do" is a 12 px pill `span` inside a 32 px `h3`; the theme draws the pill as the `h3`
itself; pairing by tag compared 32 px with 12 px (16 findings a run). **Fix.** Both sides read the words a
reader sees (an inline child not displayed, hidden, or clipped to a 1 px absolute box is not part of them).
Within one place, text properties come from the deepest element carrying the words and the fill from the
deepest one that paints — on the site along the single inline child chain, on the source from the index
place. A real size difference still fails; a button's painted `<a>` around a bare `<span>` keeps its fill.

## 52. The hover scan hovered links the page does not show, and their jumps counted as churn

**Symptom.** JA Vega: the scan forced a hover on `header a` inside a closed mega panel (`visibility:hidden`,
`translateY(8px)`); the panel opened around it and the link "jumped" 8 px — a `scan:hover-jump` on a
different link each page, 15–16 a run. `rounds.mjs` did not treat the kind as a pointer kind, so it went into
churn and the stop rule (ld-3 churn 1.11, 16 of 31 findings "new"). At 390 the links of the closed drawer were
217 `scan:hover-not-measured` a stage. **Fix.** Only elements shown at rest are hovered (visible, not faded on
themselves or an ancestor, inside the viewport sideways, not clipped away); the rest are counted
(`scans.hover.hidden`). Every `scan:hover-*` kind is a pointer kind: still a finding, counted apart in
`compareRuns`/`stableCount`.

## 53. The layout lens the tier asked for was skipped for three rounds

**Symptom.** JA Vega M4: `round.mjs` wrote `lensesDue: "layout (…)"` on ld-0 and nothing stopped ld-1…ld-3
from deploying without `notes/layout.md`; the layout lens ran at ld-3 and redirected the work (M4.7). Also
visual-qa.md and review.md stated the four axes in two different orders. **Fix.** A deploying round is
refused before build (`failedStep: lenses`, the missing note named) while a lens an earlier run of the same
tier asked for (`lenses`, or read from `lensesDue`) has no non-empty `notes/<lens>.md` in that run's
directory; another tier's note does not count. "All lenses" comes from the contract's `visual.shots` consumers
for the stage; when they cannot be determined (contract unreadable, no shot names the stage) the round is refused
too — an empty list once asked for no note at all. review.md now states the contract's order: light desktop →
light responsive → dark desktop → dark responsive.

## 54. An uploads-form image was resolved by its file name across the whole site

**Symptom.** JA Vega M4b: six `/services/*` pages list `{ file: "item-1.jpg", original: "images/joomlart/others/item-1.jpg" }`
in their own `images[]`; the site has 16 files named `item-1.jpg`. `rewriteAssets()` took the first imported
attachment of that name (`Object.values(mediaIndex.files).find(m => m.file === basename)`) — the blog's
`blogs/intro/item-1.jpg` — and http-parity listed the source image as missing on each page. A post's own
`images[]` was never imported at all. **Fix.** `resolveMedia` looks the name up in the image table of what refers
to it, nearest first (page → its sections → every-page modules → `content.images`; post → its own; typed section →
its own, then the page's); the first table that lists the name decides. Only when no table lists it is the media
index searched, and only a single match counts; a table entry that lists the name without a source path
(`original`) decides too — as a problem, never a fall-through to the site-wide search. Two sources for one name, or a source not imported, leave the
`src` as written with a report note naming the candidates. `posts[].images` are imported. **Check before.**
`grep -c 'ambiguous\|not imported' seed-report.json` is 0, or each hit is in `content-gaps.md`.

## 55. A list-item icon was dropped, and a subform image stood where the layout prints a number

**Symptom.** JA Vega: `ul.list-special > li > img` (24×25 icons) became text-only list items — the converter
parked each `<img>` for the next paragraph and no paragraph came. With `--article-fields services_benefits`, each
benefit row drew `core/image 01.png` while `services.php` prints `sprintf("%02d", $i)` and never `benefits_img`.
**Fix.** An `<img>` inside a list item (also inside a link or a wrapper) stays inline in that item, in order,
with class, alt and `width`/`height`, and is listed in `images[]`. The field config states what the layout
prints: `"skip": ["benefits_img"]` leaves a subfield out on purpose, `"number": { "pad": 2 }` opens each row with
`<class>__number` "01", "02"… — never inferred from a file name. Any other config shape is an error; a `skip`
naming no existing subfield, or a config entry naming no existing field, is a provenance note. **Check before.** Read the article layout PHP for each field
you place: what it prints per row is the config.

## 56. An archive route took the footer's address as its excerpt

**Symptom.** JA Vega M4b: `/category-blog`, `/author-listing`, `/tagged-items` printed "ADD: 4517 Washington
Ave…" in the masthead. The seeder builds those routes as pages without a `file`; `sectionsOfPage` compared
`'ALL'.file === page.file` — `undefined === undefined` — so the footer's company module (on every page) was the
page's first section, and `pageExcerpt` took its first sentence. `archives[]` carried no description of its own.
**Fix.** `sectionsOfPage` compares only identities both sides carry and never counts an every-page module; a
synthetic archive page keeps its `file`. from-joomla reads `mod_jamasthead` for the route's menu item (the
`menuitem_config` row naming it, else the default; an empty row description stays empty) into
`archives[].excerpt` and `masthead`. A listing the seeder builds takes only that excerpt, or none. **Check before.**
`wp post list --post_type=page --fields=post_name,post_excerpt`: no listing shares an excerpt with a footer module.

## 57. An attachment's slug took a route, and nothing said why

**Symptom.** JA Vega M4b: the image `404.png` was imported as attachment `404`; WordPress serves an unattached
attachment at `/<post_name>/` and gives a page the same name `-2`, so `/404` 301'd to the image file. The route
table caught `ok: false` but not the cause. **Fix.** After the media step the seeder reads the `post_name` of
every attachment in `media.json` (new and reused; every id must come back) and of every attachment on the site
whose slug is a one-segment path of the page-map, pages or archives (imported by the seeder or not), and compares:
`report.mediaRoutes { ok, checked, routeSlugs, collisions: [{ attachment, source, slug, route }] }`, a
`MEDIA/ROUTE COLLISION` line, a `cause` on the route, exit 1. A failed read, or one that leaves out an id of
`media.json`, is `ok: false` with the error, never clean. The seeder does not rename or delete the attachment. **Check before.** `report.mediaRoutes.ok` is `true`.

## 58. Two categories with one alias under different parents became one term

**Symptom.** JA Vega (#10): Joomla keeps `database-security` (and five more aliases) under both `services` and
`portfolio`; from-joomla wrote each pair with one `wpSlug`, the seeder kept the first term, and every portfolio
post was filed under the services child — `/services` (6 child pages, 0 posts) printed a post list. **Fix.** An
alias no other category shares is kept; every member of a group that would share a slug takes its full Joomla
path (`services-database-security`, `portfolio-database-security`), independent of inventory order, carried to
parents, posts, archives and `redirects.categorySlugs`. A slug that still collides stops the adapter, naming both
ids; the seeder refuses a spec with one slug twice before writing anything. Route files that flatten to one name
(`/a/b`, `/a-b`) keep their paths; only the file is numbered. **Check before.** `jq '[.categories[].wpSlug] |
group_by(.) | map(select(length > 1))' content.json` is `[]`.

## 59. layout-boxes read no heading of a T4 section or masthead

**Symptom.** JA Vega M4b: `layout-boxes.mjs` read h3 only inside `main`/`#t4-main-body`; a T4 page draws its
section titles as h3 in `.t4-section` and the page title in `.t4-masthead`, outside both. The home page paired
one heading (nine "only on the site"), every utility page none. **Fix.** h1–h3 are read in `main`,
`#t4-main-body`, `.t4-section` and `.t4-masthead` (h1/h2 anywhere), each once; a heading inside chrome — the
`CHROME` list of `lib/parity-extract.mjs`, which names T4's footer (itself a `.t4-section`), header, mega and
off-canvas — or hidden is still left out.

## 60. layout-boxes compared the font size of the heading, not of the words

**Symptom.** JA Vega M4b: the source's accordion is an unstyled 48 px `h2.accordion-header` around the 20 px
button that holds the question; "heading font-size 48px → 20px" on six service pages × four questions. The
rule visual-qa's parity already had (gotcha 51) was not applied here. **Fix.** The font size is read on the
element that draws the words: down the chain of single visible children holding the same words (a button,
a span pill). The heading, panel and section boxes are still the heading's; a real size difference of the
words still differs.

## 61. A repeated call to action paired with a button of another section

**Symptom.** JA Vega M4b: the source's feature cards end in `div.feature-link "Learn more"`; three sections
down, `a.btn "Learn more"` is a white-on-blue button. The site's card link is `p.jv-card__link > a`, both in
coverage. The paragraph paired with the card's `div`; the link inside it took a second source occurrence —
the first one holding an `a`, the button: six `parity-mismatch` (colour and fill) on the home page every run.
**Fix.** A site element inside a site element of the same words is the same place and pairs with that
element's source place. A repeat is looked for between the anchor before it and the next anchor (the source
position of the next site element whose words are unique) before the tag decides; only when nothing is left
there does the search go further. A card link drawn in the button's colours is still a finding; the six
"Apply →" rows still pair in order.

## 62. layout-boxes did not read the dark switch the contract names

**Symptom.** JA Vega M4b: `review.config.json` said `persistence: cookie tracy_theme`, but layout-boxes
defaulted to `attr:data-theme=dark`, which the theme's own script took off: exit 2 (right, it failed closed),
and every dark run needed `--dark-hook cookie:tracy_theme=dark --dark-check attr:data-theme=dark` typed by
hand. **Fix.** `--contract <visual.contract.json>` or `--config <review.config.json>` gives the switch and the
mark separately: the cookie persistence is the switch (a request cookie, set before the first navigation), the
hook attribute is the mark read after the page settled; the source's come from the contract's
`source.darkRequestHook`/`darkHook`/`lightHook` (from a review config, the source shares the site's). A flag
wins over the file, the file over the defaults; the report says which (`hookFrom`). A file that is not there,
not JSON, names no theme, or a source with no dark switch is exit 2, never the defaults — and so is a
`hook.type` other than `attribute`/`class` or a `persistence` other than `{ type: cookie|localStorage, key }`
(a typo like `"cookies"` used to fall back to the `attr:` switch).

## 63. Contract layouts named templates WordPress does not serve, and their consumers skipped the missing file

**Symptom.** JA Vega M4b: `contract.mjs init` wrote `layouts[].template = templates/<view>.html` from the
page-map view and never checked it. Six layouts named files the theme does not have (`page-login`,
`page-register`, `page-account`, `category`, `author`, `tag` — all served by `page.html`), and one `page`
layout held pages served by `page.html`, `page-article.html` and `page-service.html`. `fast-gate.mjs
layoutComponents()` returned `[]` for a missing file, so the fast gate and `--changed` did not know those pages
drew `parts/header.html`/`parts/footer.html`, and a change to `page-service.html` selected no service page;
`page-hash.mjs themeFilesFor()` skipped it too, so `--reuse` could reuse a page whose real template changed
while its served HTML had not (not yet deployed). **Fix.** The template of each page is the one WordPress
serves: `init --site <origin> --built-theme <src/<slug>>` reads the served `<body class>` (redirects followed)
and resolves it through the template hierarchy against the built theme's `templates/`, or review.config.json
`templates` declares it; the two disagreeing, or neither known, is `pending` — never `templates/<view>.html`.
One view on two templates is two layouts (`<view>--<slug>`), each with its representative; the view keeps the
family and identity. `init` requires `--built-theme` whether templates are read or declared: a declared name
with no file is `pending`. Validation against the built theme names a missing file; without it, a layout whose
template was never checked (`templateChecked`) is an error; a layout with no `templateFrom` (a contract written
before this) is "not verified"; a page whose `template` or `view` is not its layout's is an error (Fast Gate
selects by the layout's template, page-hash hashes the page's). `layoutComponents` and `themeFilesFor` throw on a layout
with no template or a template not in the theme; the plan reports it, `--changed` and `verdict` exit 2. The
page slice of the hash carries `template`, and `TOOL_VERSION` is `visual-qa/5`. Templates edited in the Site
Editor (stored in the database) are not visible from the HTML: the hierarchy names the file.
