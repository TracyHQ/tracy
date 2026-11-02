# @tracy/quickstart-tools

Measurement tools shared by every Tracy quickstart, whatever the CMS. Nothing to build: stdlib-only
Python 3 files and Node scripts; the content coverage audit borrows the root `@playwright/test`.

## `brand-leaks.py` — what a visitor of a built site can still read of the demo brand

Crawls one origin and reports every place a word of the demo brand still appears, in two
corpora: **identity** (company name, monogram, address, phone, email, hours — the leak the
identity spec forbids; exit 1 when any is found) and **prose** (demo content such as project
names or towns — reported, warned about, never failing).

```
brand-leaks.py http://<label>.tracy.test:8080/ \
  --identity Northgate NG "northgate-ind.ru" "550-67-89" Vorsino \
  --demo Kaluga Lipetsk \
  --max-pages 2000 --json tasks/evidence/<run>/brand-leaks.json
```

Positional words after the URL keep the old meaning: identity.

It scans `<title>`, `<meta content>`, `alt`/`title`/`aria-label`/`placeholder`, every `href`
(including `mailto:` and `tel:` targets) and text nodes. It says how many pages it fetched
and how many failed; a failed fetch (timeout, connection error, non-200) is never counted as
crawled, and when nothing could be fetched it exits 2 instead of a false green. The page cap
(`--max-pages`, default 2000) is printed when reached rather than applied silently.

Exit codes: `0` no identity spot · `1` identity spots found · `2` nothing fetched.

The former path `packages/cms/tracy-joomla-quickstart/scripts/brand-leaks.py` still works: it
is a stub that runs this file, so documents naming it keep working.

## `batch-contracts.mjs` — content contracts for every card template, on disposable Docker stands

A site built from a Design inspiration card template that has no contract profile for the release's
version falls back to `tracy-apple/j6/1.1.0` and `content.read` answers 503 (#722). The
`quickstart-contract` skill makes one profile per run on a DDEV stand; this tool makes all the missing
ones with the same capture scripts and the same bind proof, needing only Docker, `gh`, `git`, `python3`,
`php` and `pnpm`.

```
node packages/cms/tracy-quickstart-tools/batch-contracts.mjs <command> [options]

discover        card releases in scope, and which have no profile at --baseline
capture         restore → capture twice → bind test → place + gate, for every missing profile
verify          the same from scratch, compared byte for byte with the tree (writes nothing)
verify-report   check a `verify` report against the tree, notes, journal, git index and Docker
render-notes    write the notes table (Vietnamese) from a report
```

`capture`/`verify` options: `--platform joomla|wordpress|all` · `--only a,b` · `--pilot a,b` (these run
first and alone) · `--jobs N` (≤ 4) · `--project-prefix P --project-capacity N` (the Compose project names
`P-01…P-NN` it may use) · `--template-timeout-seconds S` · `--cowork-source <claude-cowork checkout>`
(read only: `git archive HEAD` of it is copied to the scratch folder and fingerprinted) · `--artifacts <dir>`
(logs, report) · `--scratch <dir>` (default `<artifacts>/scratch`; may sit under `--artifacts` but never be or contain it or the report; only the run's own `<prefix>-scratch-*` child is removed at the end) · `--report <file>` · `--cache <dir>` (downloaded release archives, kept across runs; every use re-checks sha256; outside the repository, never `--artifacts` or `--scratch`) ·
`--design slug=null|<catalogue id>` (the one decision the tool never makes: a design the catalogue names
needs a person to pick its `.design.json`).

What decides which templates are in scope is read from the releases of `JoomlArt-Products/joomlart-products` on
every run: published (not a draft), a valid `tracy_design_inspiration.json`, no
`tracy_design_inspiration_hidden.json`, a valid `tracy_setting.json` whose pinned checksums match what
GitHub reports. Nothing keeps a list of templates.

`--without-card <tag,tag>` (also on `discover`) admits the named releases that have no card yet — the content
contract comes before the card — under every other rule above; their rows carry `cardless: true` and the report
lists them as `withoutCard`. Without it nothing changes.

Per template:

1. Download the files `tracy_setting.json` pins (sha256 and size checked, retried, never trusted from
   disk), unpack with Python's `data` tar filter (or a checked zip): no traversal, links out, devices or
   oversize archives.
2. **Joomla**: a `joomla:5-php8.3-apache` + MariaDB stand. A snapshot (`webroot` + `database`) is restored
   (`render_configuration.py`, SQL import); an installer-only release (`install.installer`) is installed with
   Joomla's own CLI (`installation/joomla.php install`, prefix `tr_`, as the provision does) and warmed. The
   inventory comes from `dump-inventory.php`; `--template/--styles/--menutypes/--module-prefix/--list-items/
   --file-roots/--identity-note` are derived from it (the skill's section 7, with the evidence kept in the
   report); the module prefix is the candidate that gives the most slots. `capture-contract.py` (with
   `--exclude-generated --link-fields-by-role --evidence-by-field`, as the skill runs it) runs twice and
   the bytes must match. Its own refusals (duplicate rows, an ACM block whose schema the template lacks) make
   the release `blocked` with its sentence.
   **WordPress**: `scripts/capture-contract.mjs` derives the first content map from the release's database (site
   name, tagline, every named plain-text heading/paragraph/list item/button of a published page; the rest is
   reported as coverage), then `capture-inventory.mjs` and `capture-image-slots.mjs` (with `--contracts-root`)
   finish it; two passes must match.
3. **Bind test**: the profile is put in a copy of the component source, built with its own `build.sh`,
   installed on the stand, bound, inspected (`ok`, same contract id, no problems, no
   `Missing or ambiguous entity`) and `content.read` must answer 200 with content for that contract id.
4. `check-all.ts --only contracts` runs on the placed profile; a red gate takes away exactly what this run
   added. A profile that fails any step is not placed.

Statuses: `delivered`, `blocked` (the release cannot become a profile, with the exact reason), `failed` (a
step answered wrong), `unknown` (network, Docker or time did not let a step finish — never a pass),
`deliverable-not-delivered` (verify only: it would pass but the tree lacks it).

Every stand is its own Compose project taken from the declared pool; a name with anything running under it
is skipped, a lock folder keeps two runs apart, and only projects this run started are taken down (`down -v`)
— on success, failure, timeout and `SIGINT`/`SIGTERM`. Stands publish no ports; everything goes through
`docker compose exec`.

`packages/cms/tracy-quickstart-tools/test/batch-contracts.test.mjs` covers the pure parts (options,
discovery, derivation, extraction, pool, publication, report checks) without Docker or network.

A module in the Joomla trash (`published = -2`) renders nowhere and is not customer content. When `capture-contract.py`
refuses a release only because such a module uses an ACM block the template does not ship, the tool repeats the capture
with `--skip-trashed-modules` (default off, so published profiles re-capture byte for byte) and records the skipped
module ids in the row. Any other refusal still blocks the release.

A PUBLISHED `mod_ja_acm` module whose block the template has no folder for (`templates/<template>/acm/<block>/`) renders
nothing either — JA Vega j6 keeps #121 "Our FAQ" (block `accordion`) assigned to Home, and the page shows none of it. When
the capture is still refused for a missing schema after the trashed pass, the tool repeats it with
`--skip-unshipped-block-modules` and records the ids as `skippedUnshippedBlockModules`. A block folder that exists but lacks
the layout's schema still blocks the release: that module does render.

Traps met on JA Boxing (24/10/2026), fixed in the tool, worth knowing when reading an older report:

- A version folder holding only `design-system-measurement.json` (written before any contract) was
  taken for a finished profile. Only a folder with a `manifest.json` counts now (`profilesAt`).
- The component copy for the bind test must carry every repo-root helper its `build.sh` calls:
  `release-manifest.mjs` and, since 0.24.55, `contract-assets.mjs`, and since 0.24.58 `joomla-own-media.mjs` (`COMPONENT_BUILD_HELPERS`).
- From 0.24.55 the Joomla package carries no profile (a site downloads its contract), so the bind test
  places the profile into the component copy itself; a stand that relies on the package finds nothing.

## `content-coverage/` — does the content contract declare everything a visitor sees?

A permanent gate of the template pipeline since 24/10/2026 (owner's decision, after a Playwright audit
found the JA Boxing contract declared about 73% of demo text and 28% of demo images). Built the way the
Design system step works: measured on a machine, the result file committed beside the contract, and
`/ops` (Road to live, step **Content coverage**) only reads it.

```
node packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs \
  --site <url of a site built from the quickstart> \
  --contract packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version> \
  --db-dump <database file of the pack> --webroot <unpacked webroot of the pack> \
  --out <empty folder outside the repo> --write
```

- **WordPress.** The same command audits a WordPress contract (`.../tracy-wordpress-quickstart/contracts/<slug>/wp7/<version>`).
  A WordPress map declares no routes, so each page entity opens as `?pagename=<slug>` and the front page is crawled; the
  database dump is read by the `<prefix>posts` / `<prefix>options` tables (a hit on a page is matched to its contract
  entity by slug); `--webroot` reads only `wp-content/themes/<theme>`, never WordPress itself. Capture the contract with
  `capture-contract.mjs --all-text` (every visible text, not only named blocks; `--role-vocabulary 3` for version 3 roles)
  so there are slots to match. Not measured on WordPress yet: Slot fit (`--fit`).
- **What it reads.** Every page the content map declares (`index.php?Itemid=N`), plus a same-host
  crawl (list pagination `?start=N` and author pages included), at 1440 px and 390 px, read-only
  (every request that is not GET/HEAD/OPTIONS is aborted). Per page: visible text by block, `alt` /
  `title` / `placeholder` / `aria-label`, head meta, `<img>` (srcset and lazy attributes), CSS
  backgrounds, posters, iframes and media a script opens later (`data-src`, `data-video`: the
  YouTube ids of a video modal). Numeric-only text such as a price counts.
- **What it decides.** Each distinct value is matched against the slot samples of
  `content-map.json`. One that matches none is a **hole**, classed by where it comes from:
  `capture` (in the site database; `lock: locked` when `presentation-lock.json` pins its field,
  `undeclared` otherwise; locked demo content is still a hole, only true presentation may be
  locked), `template` (template files or language strings), `core` (Joomla or framework strings,
  never a hole), `unknown` (in no source it could read). A file under the template or media
  folders that the lock pins (outside `images/`) is presentation, not a hole.
- **What it writes.** `--out`: `findings.json` and `report.html` (annotated screenshots per page;
  never commit them). With `--write`: `content-coverage.json` in the contract folder, the compact
  file `/ops` reads: tool version, the contract id and sha256 of the map and lock it measured,
  counts per class, coverage per kind, and one line per distinct hole (`kind`, `value`, `class`,
  `lock`, `cause`, `evidence`, `pages`, `firstPage`).
- **Site map and header (audit 1.6.0).** The same file carries `sitePages`: one row per page the content map declares,
  in map order, none dropped, with `opens` (`live` with its HTTP status and path, `broken` with the status it answered,
  `no-page` for a menu group or a `#` link, `link` for a menu entry to another address, `unpublished`, `offsite`, or
  `not-checked` when the run never reached it), `aliasOf` for an alias, its `menu`, `level` and `parent`, `inMainMenu`
  (its menu is the menu of the home item; null without menus, as on WordPress), `shownInMenu: false` for a hidden item,
  and `inHeader` (the header menu measured on the home page lists it; null when no header was measured). `header` is
  what the home page shows at the top on desktop: the `logo` (image, alt, text, link, slots), every `menu` entry (text,
  href, depth, whether visible without hover, where it leads, the page it opens), the `buttons` and the other `texts`,
  each with the slots that declare it (`editable: false` when none does). The extraction is
  `content-coverage/lib/browser-header.js`; the decisions are `content-coverage/lib/site-map.mjs`.
- **Repeated lists (`--fit`).** Each `fitGroups` entry of the content map carries `min` and `max` beside `items` and
  `shown`: `max` is the demo count (`maxFrom: "demo-count"`), `min` is `null` with `minFrom: "unknown"`, because one demo
  shows one count and nothing proves the fewest items a layout holds.
- **Item lists (`--fit`).** A block whose own settings name a category (any settings key such as `catid` or
  `category`, read from `presentation-lock.json`, never the block's type or title) gets `itemLists["<block>.items"]`:
  `rowKind: "items"`, `source` (`kind: "category"`, `id`, `title`, the category's `page` and `route`), `min`/`max`
  (`max` from the block's count setting, `maxFrom: "block-setting"`, else the demo count), `shown` (item ids in
  display order), `rowSlots` (each card field, such as `title`, `summary`, `image:<name>`, `custom:<path>` and the
  `link` to the item's page with its template `labels`, mapped per item to its own slot with the slot-fit
  `maxCharacters`; `inferred: true` where the findings merged a copy of words two cards share) and `demoOwned` (the
  card slots with a fact role). `itemPages` ties each shown item's detail page to its category page, so a kit puts it
  in that page group. The cards are read from the findings: each item carries `scopes` (the ids of its ancestors,
  such as a block's `Mod160`); findings without them fall back to the pages the block is assigned to
  (`observedBy: "page"`). Source: `content-coverage/lib/item-lists.mjs`.
- **Listing pages (`--fit`).** A map page whose view lists items (category, featured, author) gets
  `itemLists["<page>.items"]` in the same shape (`block: null`, `page`; `source.kind` `category`, `featured` or
  `authors`; `max` from the view's page size, `maxFrom: "view-setting"`, else the demo count). Only the page body
  counts: each findings item records per copy the block it sits in (`homes`, `''` for the body), so a footer menu or a
  block on the same page is never read as the listing; a listing that shows no item declares no list
  (`content-coverage/lib/listing-lists.mjs`).
- **Author pages (`--fit`).** An author list links each author to a page of that author's articles, which has no
  menu item of its own; the crawl ties it to the user by its heading. It gets `itemLists["<user>.items"]` (`block`
  and `page` null, `pagePath`, `source.kind: "author"` with the author list's page; `max` from that view's
  `num_leading_articles` + `num_intro_articles`). Only articles the dump says the user wrote are candidates (the
  crawl records `contentAuthors` from `--db-dump`). A shipped user the map holds no entity for (the site's own Super
  User) is found by its page's last path part against the dump's accounts (`contentUsers`: login and display name
  only; `--report-only` with `--db-dump` records both too); a page tied to no shipped user and `?start=` pages declare
  nothing (`content-coverage/lib/author-lists.mjs`).
- **The stand's own accounts.** With `--db-dump`, the audit never follows a link to the author page of a user the
  release database lacks (a local admin added to the stand) and drops that user's entry from author lists
  (`content-coverage/lib/stand-users.mjs`).
- **Menu blocks (`--fit`).** A block whose own settings name a menu (`menutype`, any menu, not only the main one)
  gets `menuBlocks["<block>"]`: `menu`, `titleSlot`, `startLevel`/`endLevel`, `orderFrom` (`menu-tree` from the
  lock's `lft`, else `item-id`: depth first, siblings by id) and `items[]`: `item`, `level`, `parent`, `type`,
  `label` (`slot`, `text`, `maxCharacters` with `limitFrom` `slot-fit` or `store`) and `target` (`kind` `page`,
  `alias`, `link`, `url`, `heading`, `separator` or `none`; `page`, `path`, `link` or `url`; `alive` and `status`
  from the crawl, `alive: null` when the crawl did not reach it). Source: `content-coverage/lib/menu-blocks.mjs`.
- **Page hygiene, same crawl.** Things a customer must never see, one line per distinct problem in
  the `hygiene` list of `content-coverage.json` (`kind`, `value`, `where`, `visible`, `pages`,
  `firstPage`), and a Page hygiene card in `report.html`: `language-constant` (a raw Joomla key such
  as `TPL_FOLLOW_US` in text or in `aria-label` / `placeholder` / `title` / `alt`; keys a page script
  carries are not read), `php-error` (`Deprecated:` / `Warning:` / `Notice:` / `Fatal error` ... `in
  file.php on line N` anywhere in the HTML as served, hidden or not) and `placeholder` (`{contact.tel}`,
  JA `((span))` leftovers, `%token%`, a field word such as `TITLE` left in upper case inside sentence
  case copy; real all-caps headings and lorem ipsum are left alone). The patterns are data:
  `content-coverage/hygiene-rules.json`. Each problem holds Publish like a hole.
- **Label rules (audit 1.2.0, ADR 0040).** The file also carries `labelRules`: the mechanical rules R2 to R9 over
  the content map, the page snapshots and the holes (`content-coverage/lib/label-rules.mjs`), each with a count and its
  first failing keys, and R1 (the fact-role share) as a number only. R2 a phone, email, address, price or hours sample
  needs a contact or price role · R3 every URL slot has a role · R4 indexed repeats are grouped and a CTA URL shares a
  group with its label · R5 no keep on a fact role, and faces, signatures and cut-outs need a person, quote or business
  role (faces that prove a number may carry `stat.proof_image`) · R6 no link or list item inside a fact slot · R7 siblings share a role · R8 adjacent short slots on one line
  are a cut heading · R9 a fact-like hole (an accepted reason does not lift it). Road to live holds a new release on any
  failing rule in a `place-content-roles/3` map and warns for a live one; a version 2 map is listed and never holds.
- **Demo-only entities (a style-guide page).** A template may ship a page that only shows its own styles (JA Boxing's
  "Typography" article: sample headings cut in pieces, progress bars, buttons). The content map marks that entity
  `"demoOnly": true` (on the entity in `entities`, beside `key`, `kind` and `sourceId`; never a role). Its slots are
  left out of R1 to R8 and the verify viewer never marks them suspicious (`content-coverage/lib/demo-only.mjs`). The
  mark changes nothing else: the page is still captured, audited for holes, counted by R9 and shipped as the template
  ships it. Mark only a page whose every word is a style sample; a page with any business fact is not demo-only.
- **Shop catalogue (audit 1.5.0).** A value printed inside VirtueMart's own markup, found only in a `virtuemart_` table, or a
  picture under VirtueMart's media folders is classed `catalogue`: the shop owner's inventory (products, categories,
  manufacturers, prices), managed in the shop component and never a contract slot, so no build rewrites a product or a
  price. It is listed in `content-coverage.json`, never holds Publish, and R9 does not read it (JA Cagox, the first shop template).
  The vendor view (the shop's own name and address, stated in VirtueMart's Shop settings) is catalogue too.
- **Remote news feeds.** The items of a feed Joomla's News Feeds fetches from another site when the page is viewed are
  another site's words, not the template's: they are classed core (`c`), so R9 does not read them either.
- **Label judge (audit 1.4.0, spec #37).** The agent that runs the release is the judge; the audit calls no model and
  needs no key. For every component with a slot whose verdict is not cached, it writes `<out>/label-judge/request.json`:
  the question, the allowed verdicts and version 3 roles, the answer format, and per component its crop with numbered
  slots (the verify viewer's crops, with a margin, in `<out>/label-judge/images/`), the page title and URL, the module
  title and position, the neighbouring components' titles, and the slots to judge (number, key, kind, sample, role,
  group, fit). The agent answers in a verdicts file (`{"judgedBy": "agent", "slots": [{"key", "verdict": "right" |
  "wrong", "suggestedRole", "why"}]}`) and records it with `content-coverage/record-judge.mjs --request <file>
  --verdicts <file>`, which refuses the whole file on a missing, unknown or doubled key, a verdict other than right or
  wrong, or a suggested role outside `place-content-roles/3` (`content-coverage/lib/label-judge-record.mjs`), and
  otherwise writes `labelJudge` (with `judgedBy`) into the coverage files the request names. It targets what the rules
  cannot see: a fact labelled editorial, and a claim (a number, an award) inside editorial text. The verdicts are also
  the cache: a slot whose content hash is unchanged is never asked again. Until answered, or with `--no-judge`, slots
  stay `not judged`, never right. Road to live holds a new release when a slot sits on the wrong side of
  fact/editorial (`coverage-judge`) and warns on finer mismatches, unjudged slots and live releases
  (`coverage-judge-warn`); a version 2 map is listed and never holds.
- **Accepting a hole or a page problem.** Only when it is truly not demo content a customer sees: add
  `"accepted": "<reason>"` to that line (English, at least 12 characters). The next `--write` keeps it.
- **Exit.** `0` the policy passes · `1` holes, page problems (or an incomplete run) hold Publish ·
  `2` usage or run error.
- **When it is red.** The fix loop (capture class: fix the capture RULE for every template, never one
  contract; template class and page problems: fix the template source and build the next version) is
  `.agents/skills/quickstart-contract/SKILL.md` section 7b; /ops pastes the same loop into Claude Code.

`/ops` judges the file with `apps/tracy-web/src/lib/content-coverage/policy.json` (the threshold is
data: blocking classes, whether locked content counts, how many unexplained holes and page problems
are allowed, the audit version a file needs: 1.1.0 measures page hygiene, so a 1.0.0 file is measured again). A
file measured on another map or lock is stale and counts as not measured. A release already
published only warns.

### `content-coverage/verify-viewer.mjs` — look at the content map on the real pages

A page for a person to check a content map with their eyes, run after `--fit` has written the map. One block
per component (a Joomla module, an article, a contact): on the left a screenshot of the template site with every
slot of that component outlined and numbered (desktop 1440 and phone 390), on the right a table with the same
numbers and each slot's key, sample, role (Fact or Editorial), group, `fit` and measured box.

```
node packages/cms/tracy-quickstart-tools/content-coverage/verify-viewer.mjs \
  --site <url of a site built from the quickstart> --template ja-boxing/j6 --version <x.y.z> \
  --out <empty folder outside the repo> [--max-pages 80] [--reuse]
```

`--template` + `--version` read the contract from `packages/cms/tracy-joomla-quickstart/contracts/`; `--contract <dir>`
takes any contract folder instead (`--version` is then only the label on the page). `--reuse` keeps the audit findings
and module boxes already in `<out>/.audit`. Open `<out>/index.html`; nothing it writes is committed.

- **Not located.** A slot with no visible element matched to it is listed apart with the reason (matched only a
  hidden element, nothing on the audited pages, the same sample as another component's slot, a match outside the
  component's area). A position is never guessed.
- **Not shown.** A slot with no visible match whose `fit` says `measured: false` (no audited page shows it) is
  listed in its own section.
- **Suspicious.** Four mechanical rules mark a slot red or amber: a face or signature picture whose role is not
  `person.*`/`quote.*`; text that looks like a real figure but has an `editorial.*` role; a Fact role whose `fit`
  says keep; `fit` not measured although the slot is shown as text or a picture (a slot shown only through a link or
  an attribute, such as an email inside its mailto, has no box to measure). A demo-only entity is shown with a
  "demo only, not judged" badge and never marked. Everything else is for the person to judge.

It reuses the audit (`runAudit`, so the same lazy-content wake and the same smooth-scroll handling as `--fit`),
is read-only on the site, and covers the Joomla module wrappers (`Mod<N>`) of the T4 template.
`packages/cms/tracy-quickstart-tools/test/content-map-verify-viewer.test.mjs` covers the locating and the page.

## `template-kit/` — the pack a site build reuses: page and block images, what each block allows, a version stamp

Made once per template version, from a site restored from that version's quickstart (never the public demo:
the kit must match the contract it describes). Read-only on the site, but for one measurement that puts the site
back as it was (fixed CMS text, below). One file, `template-kit.json`, beside
`images/`, in CMS-neutral words: a block is `block-<n>`, `header` or `body-<page>`; the content map key stays only
in a block's `source`.

### Make a kit for a new template

1. Restore the template's quickstart into a local site (skill `tracy-dev:restore`); never use the public demo.
2. Run the whole pipeline (a few minutes; read-only on the site but for the fixed-text measurement):
   ```
   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs build --full \
     --site <url of the restored site> [--host-header <name the site is served under>] \
     --contract packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version> \
     --out <empty folder outside the repo> [--trade "<what the demo business does>"] \
     [--db-command "<database client prefix>"] [--files-command "<prefix>" --webroot <dir>]
   ```
   The database and file reads feed the site part (`site-cli.mjs`: logo spots, favicon, brand colours, head,
   forms, main titles); without them it reads the pages only and names what it could not read in `errors`.
   With `TRACY_VISION_API_KEY` set (the vision door of `apps/tracy-web/src/lib/picture-vision.js`), icons are
   classified by the model; without it they stay unclassified and are listed in `errors`.
3. If `template-fixes.json` lists `fixes` (its `skipped` names what was left out and why): apply the fixes in the template, release a new quickstart, restore it
   and rebuild the kit (a fix changes what the lists' minimums are).
4. Open `contact-sheet/review-*.html` (icons with their class, every emptied frame with its DOM numbers, every
   template fix tried; built from the pack's images, nothing is shot for it) and the block sheets. To overrule: `icon-classes.json` (`{"<frame id>": {"class": "fixed"|"demo",
   "reason": "...", "by": "human"}}`, wins over the model) and `frame-review.json` (`{"<frame id>": {"canHide":
   true|false, "reason": "..."}}`), then `cli.mjs assemble ...`. A template gap that is right by design is
   accepted in `gap-accepts.json` (`{"<gap id>": {"reason": "...", "by": "<login>"}}`, one entry per gap id, never
  by kind, so a new dead link is never accepted unseen); the kit never accepts one.
5. `cli.mjs pack --out <kit dir>` (`build --full` runs it last) writes `pack/` and `template-kit-<template>-<quickstart
   version>.zip`. The build shoots only what the pack holds (below): every measurement (emptied frames, fixed CMS
   text, list minimums, template fix trials) is read in the DOM and kept as numbers, so the images folder and the pack
   hold the same images. The pack's own `template-kit.json`
   is the file committed beside the contract and read by /ops and the planner: it lists only the packed images (its
   `imagesSha256` is over them), and a page that is no representative points at its representative's full-page shots
   (`fullShotOf`). The full one records `pack` (`file`, `sha256`, `bytes`, `images`, `approved`,
   `blocksWithoutImage`). `approve` seals the pack and remakes the zip; packing again keeps the approval only while
   the image set is the same. A block a page lists with no shot at a width it is shown at fails the pack (exit 1). The
   zip carries a fixed date, so the same files give the same sha256.
6. `cli.mjs approve --out <kit dir> --by <login>` (a person, after the review sheet) seals the pack's image set.

Other commands: `build` without `--full` (read, shoot and assemble only), `--reuse-capture` (keep the capture,
measure the rest), `--remeasure` (measure the pipeline's own list minimums again), `assemble`, `sheet [--review]`, and `measure-min --list <id> --page <path> --max <n> [--rows <css>]` (a person's measurement of one
list, kept by every later run).

- **Every page.** The crawl starts from every route of the content map and the front page, then follows every
  same-site link of every page reached until no new address appears (pagination, author and tag pages included).
  `/index.php/` or not, a trailing slash and query noise merge into one page (`aliases`); a redirect lands on its
  page. A content map path that does not answer 200 is a template gap (`dead-path`). The page cap (`--max-pages`) is reported, never applied silently.
- **No test data.** A restored site carries accounts the quickstart does not ship (the one the restore signs in
  with). An account page (`/author/<name>`, `/user/<name>`...) whose account the content map does not declare and
  which links to no content of its own is left out, so is a page that lists only left-out pages, a page reached only
  through them, and any page matching `--exclude-path` (`*` matches any run of characters). Links to them are
  removed from every page in the browser before it is shot, with the row that holds them. The kit counts what was
  left out by reason (`excludedPages`) and never names it.
- **Read, then shoot** (`lib/capture-site.mjs`). The READ pass (`read-pass.mjs`) opens every page at every width
  and reads its DOM only: blocks and their boxes, links, rows, and the body skeleton (`read-details.js`: containers
  with their classes, every run of flowing content as `~`). The pages are grouped by layout on that reading, site-wide
  and never by menu group (`lib/layouts.mjs`): the same kind of main content and the same body skeleton. Two layouts
  of one kind whose skeletons are close but not equal (`SKELETON_CLOSE`) stay apart (one more body shot, the safe
  side) and are listed in `layoutChecks[]` for a person to look at. The read pass fetches no picture, video or font,
  reads three pages at once and scrolls a page only when it holds content that renders on scroll. Within a layout one page stands for the rest
  (a group's representative first): the others' body blocks carry `shotOf`, and their frames take the exemplar's
  `canHide` (`canHideFrom`, same role and order) so only the exemplar's frames are emptied. A further result page
  (`?start=6`) whose skeleton is page 1's or close to it uses page 1's shots (`paginationOf`). Per page group one
  representative (`pageGroups[].representative`, `representativeWhy`: the page covering the most of the group's
  blocks, a tie to a main menu page, then the shortest path). The SHOOT pass (`shoot-pass.mjs`) then opens only the
  pages it needs: each representative's full-page shot at every width, and one crop per block id per width (no
  `shotOf`), cut from a representative showing it when one does, else from the page covering the most blocks still
  to cut; the block's box and reading are taken again on that page (`shotOn`). A page wanted at both widths is loaded
  once and resized; a block the resized page does not show is shot on a page loaded at that width. Every wait is
  capped. Each phase logs `time <phase> <seconds>s`.
- **Images** (`images/<id>.jpg`, named by image id): `page-<page>-<width>` for representatives, `<block>-<width>`.
  Blocks: `#Mod<N>`, ACM blocks with only `#acm-<name>-<N>`, a block whose position renders with no wrapper
  (`.t4-<position>`, only when the map assigns one block there), the header and the component area (`#t4-main-body`,
  or `main` when it holds only the component). Sticky and fixed headers are frozen at the top before boxes are read;
  floating widgets are hidden. A block hidden at a width (the off-canvas menu) has no image there and says so in
  `notShownAt`.
- **`template-kit.json`**: `template` (version read from `templates/<template>/templateDetails.xml` on the site, or
  `--template-version`), `quickstart`, `pageGroups[]` (a listing page with its posts, further result pages, author and
  tag pages), `pages[]` (`group`, `path`, `inMainMenu`, `blocks` and `images` per width), `blocks[]` (`role`, `shared`,
  `images`, `lists[]` with `rowKind`, `min`, `max`, `rowSlots`, `rows` (every row with its slots: the map's slot
  groups `<list>.<n>`, so a map that numbers each row as its own group still gives every row; `maxFrom: "slot-rows"`
  when that raised the map's count), `iconMechanism` (how a row's link icon is drawn: `font-icon`, `inline-svg`,
  `image-file` or `css-background`, whether it can be changed, measured by setting one row's icon class to
  another's), `frames[]`, `links[]` (every shown link by `position`, repeats of one label and address included,
  with `icon` when the link draws one: `mechanism`, `classes`/`file`,
  `network`), `fixedText[]`, `demoOwned[]`), `checks` (`itemsListsWithoutCardFields`, which must be 0: a listing's
  items list takes the content map's list and its card fields, a further result page takes page 1's),
  `images[]` (`id`, `path`, `sha256`), `imagesSha256` (the digest an approval seals, `imagesDigest` of the /ops reader),
  `site` (the site part, `site.json`), `pages[].h1` (where each page's main title comes from), `lists[].holds`,
  `links[].action` (`contact` for a phone, e-mail or messenger link, also by its slot, its label or its icon when the
  demo's address is `#`; `external-profile` for a social profile by its address, its slot, or the network its icon
  or label names), `templateGaps[]` (below), `errors[]` (failed captures, and every field the kit could not
  measure, with its path and the reason) and `approval` (null until `approve`).
- **Template gaps** (`templateGaps[]`: `id, kind, where, detail, evidence, accepted`): real defects of the template
  or its demo, for /ops to judge: `page-without-h1`, `dead-link` (a block link to nothing, `#`, or a path that
  does not answer 200; one per target and block), `dead-path` (a content map page that does not answer 200) and
  `sparse-row-left-packed` (each proposed template fix). The id hashes kind and place, so it survives a rebuild.
- **Site part** (`site`, from `site-cli.mjs`). `navigationGroups[]`: every menu block of the content map
  (`menuBlocks`), each item with `label`, `maxCharacters`, `target` (`kind`, `page`/`path`), `alive` and `status`;
  `orderFrom` is passed through and `"item-id"` gets an `orderNote` (a stand-in order, not the menu's own); what a
  footer column holds (`holds`, `itemsOf`) is joined in from the pages, and a link column that is no menu block is
  kept as read (`from: "page"`). An off-canvas menu the pages never show takes its links from its menu block.
  `fixedTexts[]` (also `blocks[].fixedText`): a sentence the CMS prints from a language file (rendered text that is
  no content slot and matches a string of the site language's `.ini` files, placeholders such as `%s` and `%date%`
  taken as wildcards), with `source: {file, constant}`. A short value (a form label, `Page %s of %s`) matches only a
  whole line and names every constant with that value (`source.short`, `source.constants`); the measurement empties
  them all, and words that still show are the template's own. Shown words that are a content slot's (whole, cut short
  with an ellipsis, or split by inline markup) are content, never fixed text: another entity's goes to `demoOwned`
  (`kind: "text"`). The other entries are the template's words (`source: {kind: "template"}`), each with a `canHide`
  measured in the DOM (`measure-words-links.mjs`, `words-links.json`): the words emptied, the block read before and
  after; a link or button left with no words, or new overlaps, is `false`; words not found is `null` and an error. A string that prints
  the site name (`%sitename%`) is not fixed text: it is a `nameSlots` entry with `source: {setting, through}`.
  `canHide` is measured in the DOM: the constant is set to an empty value in the language override file, the block's
  text and layout read before and after (`evidence`: its box, height change, text pieces gone or moved, new
  overlaps), and the file put back as it was, removed when it did not exist; the write path
  (`lib/site/adapters/site-writer.mjs`) refuses any file outside `language/overrides`. `--no-hide-measure` skips it
  (each `canHide` is then an error).
- **List minimum.** A measured one (`measure-min`: on one loaded page, rows removed from the DOM one at a time and,
  at every width (the page resized), the row boxes read: the last line full or centered) wins, with `minEvidence`
  (the check per count; no image); else
  the rows on the first line at 1440 (`row-count`), or 1 in a slider or tabs (`slider-or-tab`); else null and an error
  that says why: rows in a closed tab (read, never measured), a count that leaves a hole at every size (the template's
  defect, with `sparseRow`), or no row set found.
  Every count from 1 to the maximum is measured and the minimum is the smallest that looks right (no broken card,
  no hole: a partial last line is right only when centered). `layoutOkAt` lists every count that looked right, and
  `layoutOkContiguous` says whether every count from the minimum to the maximum did (right at 4 and 8 only: false).
- **Every list, on its own.** `--full` measures the minimum of every list whose rows it finds on the page (a row
  set of the list's size, not in a slider or tabs; a listing's item rows). A short last line pressed to the left
  while the heading is centered is caught: the list says `sparseRow: "left-packed"` (else `centers` or `fills`).
  Only a centered context makes it a hole: words or buttons around the rows that are centered, or full lines that
  span the container (`context` per width, `row-context.js`). A short line in a left-aligned column that starts
  where the words beside it start (icons over a left-aligned copyright line) follows its column and is right
  and `minIfCentered`, and `template-fixes.json` proposes (`fixes`) one entry per row element, only for card rows
  of a block (`rowKind: slots`) whose minimum the fix would lower; paginated listings (a short last row is normal
  there) and pagination controls go to `skipped` with the reason. A proposal is a CSS selector derived from its
  classes, the measured gap, the rule (`justify-content: center` for flex rows, centered tracks for grid rows),
  the lists it unlocks, and its trial (the rule injected in the browser, the row boxes read again, the rule taken
  out): `verified`. The tool never edits the template.
- **Frames** (`frames[]`: `id, shape, width, height, kind, canHide, twinOf, fixed`, measured; plus evidence).
  Each frame is found on the page by the picture file the map names. `width`/`height` are its box at desktop
  width and `shape` comes from them. `kind`: `icon` (128 px or smaller, or a mostly clear drawing up to 320 px),
  `cutout` (a mostly clear picture over another picture), `photo`, or `logo` (named by the site part:
  `business.logo` slots and every logo spot's frame; who owns it is the brand step's, so `fixed` is null). An
  `<img>` kept at opacity 0 while its holder paints a mask or background over it is shown through that painter
  (`paintedBy`) and measured from it. A frame in a closed tab, slide or accordion is opened first, the way a
  visitor would (`revealed`); a picture not in its own block is looked for in the other blocks of the pages
  (`measuredIn`). `canHide`, in the DOM only: the picture and its painters (mask, pseudo-element, holder background)
  are emptied in the browser and the block read again at every width, once per layout (a frame in the same place on
  a page of the same layout takes it: `canHideFrom`); a picture repeated by every row of a list is emptied in every
  row at once (`measuredAs: "row-slot"`, one verdict for the slot). The numbers are kept (`hideEvidence.measured`:
  block box before and after, text moved, new overlaps of text or buttons, an empty box left, a card that lost its
  picture). Nothing emptied, or a picture under a solid block, is an invalid measurement: canHide null, an error, and
  "no visible change, measurement invalid" on the review sheet. It is false when an empty box stays, a card shrinks
  or loses its picture while the others keep theirs, rows wrap differently, text or buttons overlap, or the block
  (single frames) loses half its height. Icons and faces are classified from the picture files themselves (loaded
  and drawn in a blank canvas), never from a crop of the page. `twinOf`: a frame not shown whose markup carries the other theme marker (light/dark) of
  a shown frame in the same row of the same block. `fixed`: from `icon-classes.json`; icons of the demo's trade (`demo`) are listed
  in the block's `demoOwned`. Twins follow their main frame.
- **Listing maximum.** A listing page's `items` list takes the page size: from the pager when a later list position
  exists (`?start=N`: `maxSource: "page-size"`), else the item rows the demo shows (`captured-rows`; item rows are
  the biggest set whose every row opens a different content item). `maxEvidence` says which.
- **`contact-sheet/`**: every block image on HTML sheets (no screenshot), to spot
  images that are misaligned, blank, cut by a header or doubled.

Where a kit is stored is not decided yet: the tool writes `--out` only. Tests: `test/template-kit-crawl.test.mjs`,
`test/template-kit-assemble.test.mjs`, `test/template-kit-blocks.test.mjs`.
