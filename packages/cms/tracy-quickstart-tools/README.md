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
- **Tag pages (`--fit`).** A tag link on an item opens the page of every item with that tag, which has no menu item
  of its own; the crawl ties it to the tag twice: its last path part is the tag's alias and its heading is the tag's
  title. It gets `itemLists["<tag>.items"]` (`block` and `page` null, `pagePath`, `source.kind: "tag"`; `max` the
  demo count). Every article is a candidate, as on the featured page; only the page body counts. A menu page showing
  several tags and `?start=` pages declare nothing (`content-coverage/lib/tag-lists.mjs`).
- **The stand's own accounts.** With `--db-dump`, the audit never follows a link to the author page of a user the
  release database lacks (a local admin added to the stand) and drops that user's entry from author lists
  (`content-coverage/lib/stand-users.mjs`).
- **Menu blocks (`--fit`).** A block whose own settings name a menu (`menutype`, any menu, not only the main one)
  gets `menuBlocks["<block>"]`: `menu`, `titleSlot`, `startLevel`/`endLevel`, `orderFrom` (`menu-tree` from the
  lock's `lft`, else `item-id`: depth first, siblings by id) and `items[]`: `item`, `level`, `parent`, `type`,
  `label` (`slot`, `text`, `maxCharacters` with `limitFrom` `slot-fit` or `store`) and `target` (`kind` `page`,
  `alias`, `link`, `url`, `heading`, `separator` or `none`; `page`, `path`, `link` or `url`; `alive` and `status`
  from the crawl, `alive: null` when the crawl did not reach it). Only items a visitor who has not signed in sees
  (access level public or guest) are listed: "Your Profile" or "Site Settings" of a user menu are never drawn on the
  pages a site build plans. Source: `content-coverage/lib/menu-blocks.mjs`.
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

### `content-coverage/resample.mjs`: the inline markup of the samples, from the demo database

A whole-unit text slot (`capture-contract.py --whole-units`: a title merged from several text pieces) captured before
`--inline-markup` holds its words only: `More<br><span>Blogs</span>` became `More Blogs`, so the kit cannot tell that
the template draws "Blogs" on a second line in the accent colour. This reads each text slot's stored value from the
quickstart's database dump (the installer's `installation/sql/mysql/custom.sql` or a `database.sql[.gz]`, with the
UPDATE and DELETE fixes appended after its INSERTs applied), takes the markup of the slot's element
(`tracy-joomla-quickstart/scripts/unit-markup.php`, which loads HTML as the plugin's helper does) and counts
`inlineMarkupLost`: a text slot whose stored value marks words inline (`br`, `span`, `strong`, `em`, `b`, `i`) while
its sample marks none. No stand, no browser; it needs `php`.

```
node packages/cms/tracy-quickstart-tools/content-coverage/resample.mjs \
  --contract <contract dir> --db-dump <custom.sql | database.sql[.gz]> [--write]
```

With `--write` it rewrites only the `sample` of the slots whose markup reads as the same words
(`More((br/)) ((span))Blogs((/span))`; keys, roles, groups, limits and fits stay) and writes the `inlineMarkup` block
(`checked`, `lost`, `lostSlots`, `mismatched`, the dump's name and sha256) into `content-coverage.json`. A coverage
file that was current for the map is restamped to the new map (`restampedFrom` names the old digest): the audit
compares samples by their words, so a new audit can only match more. A slot whose stored value is not its words is
named (`mismatched`) and never written. A full audit given `--db-dump` measures the same block; without one it carries
the previous block while the map is unchanged. Then settle the kit: `template-kit/cli.mjs samples` and
`slot-roles --only sentences`, then `pack`. Exit: 0 nothing lost, 1 a slot still loses its markup or a stored value
is not its words, 2 usage or file error. `test/content-coverage-inline-markup.test.mjs` covers it.

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

### Page titles, sentences and stored fields

The coverage gate (run by `cli.mjs assemble`) settles three things from what the page prints; none moves a slot, a list or a role.

- `pages[].titleSlot`: the one slot that prints the page title. Part `pageTitleSlots` fails a page with none or with a tie.
- `blocks[].sentences`: pieces of one stored field in one element, printed as one sentence around a highlight. The copy check (W12) reads them joined.
- `blocks[].buttons`: every button a visitor can see, with `labelSlot`, `urlSlot`, `label`, `link`, `target`. Each block's button stands here even when a link's `labelId` names another block's field of the same words. A write step hides one no file speaks for.
- `site.contentPages[]`: how the template presents a content page: the category menu item its item pages are opened under (`menuItem`, `route`, `layout`, `pages`). A page the write step creates takes that route.
- `storedFields[]`: every text, url or image field the template stores, with `listedIn` (its block, or null). `coverage.fields` reports `notListed` and `drivingSeveralControls`, and does not block.

What a stored field really drives is measured on a **throwaway restored site**, never one in use: the command writes a marker into each field, reads the pages, and puts the value back.

```
node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs measure-fields --site <url> --out <kit dir> \
  --contract <contract dir> --db-command "<database client prefix>" --scratch-site
node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs slot-roles --out <kit dir> --contract <contract dir>
```

`samples --out <kit dir> --contract <contract dir>` gives every text slot of a written kit its whole demo text and
`demoChars` and `inline` from the content map (kits made before 3.1.0 carry samples cut at their first words); `slot-roles --only
sentences` settles only the sentence groups. A content map captured without `--inline-markup` is resampled first
(`content-coverage/resample.mjs --write`): the kit can only list the inline marks the map's samples hold. Every settle command stamps the kit's `tool` (version in
`template-kit/lib/version.mjs`) and `settledAt`; none touches an image, so an approval stays valid.

Run `pack` after. Without a measurement a tie between two slots of a page stays a failure of `pageTitleSlots`, by name.

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
   A reach or row pair failure the template keeps on purpose (a demo placeholder button such as a pricing "select
   plan", a row of technique chips the planner decides link by link) is explained in `reach-accepts.json`
   (`lib/check-accepts.mjs`): a list of `{"check": "deadControls", "where": "links[block-20.link-1]", "reason": "...",
   "by": "<login>"}`, where `check` is one of `deadControls`, `mapLocationUnmapped`, `phoneNotCallable`,
   `rowPartsUnpaired`, `where` is the `where` the counter writes in `coverage.failures` (a `*` matches any run of
   characters, `links[block-31.link-*]` for a row of chips) and `by` is optional. `assemble` and every settle command
   read it: the counter still counts every failure in `checks.<check>`, each explained one is listed in
   `checkAccepts.<check>` (`[{where, reason, by}]`) instead of `coverage.failures`, and an entry that matches no
   failure is counted in `checks.checkAcceptsUnmatched` and named in `coverage.failures` (part
   `checkAcceptsUnmatched`, with its `check`), so a stale reason holds the kit. /ops fails a check only on its
   unexplained rest and words it as the kit records it: `buttons with no address 70 (68 explained)`; the step's
   `checksExplained` lists every check with explained failures (`{check, label, count, explained}`).
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
7. Write the **looks** (skill `quickstart-contract`, [`references/image-looks.md`](../../../.agents/skills/quickstart-contract/references/image-looks.md)):
   one to three plain English sentences per packed 1440 page and block shot, `look: { image, sha256, text }` on the
   page or block, so the planner reads text instead of opening every image. Written by the packager's own Claude Code
   (subagents open the image files), never a paid API; the tool makes no model or network call.
   `cli.mjs looks --kit <kit dir>/template-kit.json --list [--to <file>]` lists the shots without a current look
   (missing, or a `sha256` other than the shot's) with their absolute file paths; `cli.mjs looks --kit ... --apply
   <looks.json>` checks every `{image, sha256, text}` entry (a 1440 shot of a page or block, its current sha256,
   40 to 400 ASCII characters) and writes all or none, keeping the file's indent and key order. Then `pack` again:
   it copies a look to the pages and blocks drawn by another one's shot (`fullShotOf`, `shotOf`) and keeps the
   approval, which covers images only. A rebuild keeps the look of every unchanged shot. On /ops the Template kit
   step reads `kit-incomplete` (`missingLooks`) until every packed 1440 shot has a current look.
8. Name the **article layout of a created legal page** (`site.createdPageLayouts.legal`): read the template's
   `html/com_content/article/` files for the plain one, the file that prints the article alone (JA Boxing:
   `default.php`; `classes.php`, the class pages' file, adds booking bars), then
   `cli.mjs legal-layout --kit <kit dir>/template-kit.json --layout ja_boxing:default --why '<what it prints>'`, or
   `--none --why '<words>'` when the component's default article is right. The write step prints a privacy or terms
   page it creates through that file, never through the content pages' own one.
9. Name the **play buttons with an empty video address** (`site.emptyVideoButtons`, Tracy ADR 0044 decision 29): read
   the template's layouts for a video play button whose address is built from a video field with no check that it is
   set (JA Boxing `html/com_content/article/classes.php`: `data-src="https://www.youtube.com/embed/<id>"`), then
   `cli.mjs video-buttons --kit <kit dir>/template-kit.json --selector '.video-btn[data-src$="/embed/"]' --why '<where>'`
   once per such button, or `--none` when the template has none. The selector must test the address, so a button
   with a video is never hidden; the write step hides the listed ones with one CSS rule in the head injection block,
   and the site check's `empty-video-buttons` group blocks on any shown control that opens an empty player.
   In the same reading, `cli.mjs self-link-buttons --kit <kit dir>/template-kit.json --container '.bottom-actions' --why '<where>'`
   names the container of a "more" button the template prints from settings no slot reaches (or `--none`); the write step
   hides, on each kept page only, a link there whose address is that page's own.
   `cli.mjs hidden-page-links --kit <kit dir>/template-kit.json --container '.teams-item' --why '<where>'` names the
   container of list row links (a card's name and photo) that may lead to a page the plan hides; the write step sends such a
   link to a living page, or makes it plain text.

Other commands: `build` without `--full` (read, shoot and assemble only), `--reuse-capture` (keep the capture's
shots, read every page's DOM again with the current reader, measure the rest), `--remeasure` (measure the pipeline's own list minimums again), `assemble`, `sheet [--review]`, `setting-slots --out <dir> --contract <dir> --db-command <prefix>` (settle the setting slots again, reading the map settings from the site's database, no browser and no image touched), `relabel --out <dir> --contract <dir>` (settle the link labels of a written kit again from the content map, no browser and no image touched, then `pack`: an approval stays while the image set is the same), and `measure-min --list <id> --page <path> --max <n> [--rows <css>]` (a person's measurement of one
list, kept by every later run).

- **Every page.** The crawl starts from every route of the content map and the front page, then follows every
  same-site link of every page reached until no new address appears (pagination, author and tag pages included).
  `/index.php/` or not, a trailing slash and query noise merge into one page (`aliases`); a redirect lands on its
  page. A content map path that does not answer 200 is a template gap (`dead-path`). The page cap (`--max-pages`) is reported, never applied silently.
- **No test data.** A restored site carries accounts the quickstart does not ship (the one the restore signs in
  with). An account page (`/author/<name>`, `/user/<name>`...) whose account the content map does not declare and
  which links to no content of its own is left out, so is a page that lists only left-out pages, a page reached only
  through them, and any page matching `--exclude-path` (comma-separated; `*` matches any run of characters; a comma inside a pattern is
  written `\,`, so VirtueMart's sort pages `/shop/<category>/by,<field>` are `'*/by\,*'`). Links to them are
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
  when that raised the map's count; on each row `printsIn`, the signature of the repeated card its picture prints in
  or `block` when it has none, and `pairedSlots`, the ids of the block's text slots printed inside that card, measured
  by the frames pass at the first width before any frame is emptied (`lib/read-row-cards.js`, `rowCard` in
  `frame-evidence.json`, written by `lib/row-pairs.mjs`), with `rowPairsFrom: "measured"` on the list, or
  `"declared"` when a person wrote the pairs), `iconMechanism` (how a row's link icon is drawn: `font-icon`, `inline-svg`,
  `image-file` or `css-background`, whether it can be changed, measured by setting one row's icon class to
  another's), `frames[]`, `links[]` (every shown link by `position`, repeats of one label and address included,
  with `icon` when the link draws one: `mechanism`, `classes`/`file`,
  `network`; `labelId`, the one place that says which text slot is the link's label (no slot carries a copy), or
  `fixedLabel: {rule, reason}` when its words are not the customer's: `template-words` (the block's fixed text),
  `icon-name` (an icon-only link's accessible name), `pagination` (a CMS page number or step), `control-value` (a
  number on a link to no page: a rating star, a slide dot) or `sort-control` (the same listing in another order)),
  `slots[]` (planner rule 5),
  `fixedText[]`, `demoOwned[]`), `checks` (counts that must all be 0, or /ops marks the kit
  `kit-incomplete` and it cannot be approved: `itemsListsWithoutCardFields` (a listing's items list takes the content
  map's list and its card fields, a further result page takes page 1's), and the planner rules below:
  `listLimitsDiffering`, `showcasePagesNotExcluded`, `mixedPageGroups`, `detailPagesOutsideListing`,
  `representativesNotListing`, `slotsInTwoBlocks`, `orphanTexts`, `paragraphsMissing`, `fixedTextIdsInvalid`, the
  coverage gate `slotCoverage`, and `linksWithoutLabel` (`lib/link-label-reasons.mjs`: a link that shows words with
  neither a `labelId` naming a slot of its own block nor a `fixedLabel` reason), and the slot shape checks counted
  against the content map (`lib/slot-shape-checks.mjs`, by `build` and every settle command, their first failing
  slots or blocks in `coverage.failures`): `samplesCut` (a text slot whose `sample` or `demoChars` is not the whole
  demo text), `sentenceGroupsUnsettled` (a block whose `sentences` differ from what the sentence-groups pass gives),
  `inlineEmphasisMissing` (a text slot whose demo marks words inline with no matching `inline`) and
  `inlineMarkupLost` (content map text slots whose stored value marks words inline while their sample does not, read
  from the `inlineMarkup` block `content-coverage/resample.mjs` writes into `content-coverage.json`; a map with a
  whole-unit text slot and no such block counts 1), and the reach checks (`lib/reach-checks.mjs`, by `build` and every settle
  command, from the kit alone): `deadControls` (a link with words that acts inside the page and has no door: nothing it opens, no
  address, no menu item; the template prints it with a dead address, so a plan cannot send it anywhere), `mapLocationUnmapped`
  (a button that opens a map with no `slotId`, or a block whose read found an embedded map, `embeddedMaps` from the read pass's
  `maps`, with no map-location setting slot on its entity) and `phoneNotCallable` (a `contact.phone` slot, or a contact block's
  printed phone or mobile field, that no link of its block shows as its words, so no address can make it `tel:`), and
  the row pair check (`lib/row-pairs.mjs`, by `build` and every settle command): `rowPartsUnpaired` (a list whose rows
  print in more than one part, a lone row beside card rows, while a card row has no `pairedSlots` and the pairs are
  not declared: a plan cannot tell which card texts go with which picture row); a phone the demo leaves empty (a
  contact field with `filled: false`, a phone slot whose sample has no words) prints nothing and is not counted; a
  failure of these four explained in `reach-accepts.json` (step 4 above) still counts, and the check holds the kit
  only on its unexplained rest (`checkAccepts`, `checkAcceptsUnmatched`)),
  `images[]` (`id`, `path`, `sha256`), `imagesSha256` (the digest an approval seals, `imagesDigest` of the /ops reader),
  `site` (the site part, `site.json`), `pages[].h1` (where each page's main title comes from), `lists[].holds`,
  `links[].action` (`contact` for a phone, e-mail or messenger link, also by its slot, its label or its icon when the
  demo's address is `#`; `external-profile` for a social profile by its address, its slot, or the network its icon
  or label names), `templateGaps[]` (below), `errors[]` (failed captures, and every field the kit could not
  measure, with its path and the reason) and `approval` (null until `approve`).
- **Planner rules.** Each is generic (measured or read from structure, never a list of names) and has a self-check
  in `checks` whose failures are also listed in `errors`:
  1. *One character limit per slot kind of a list* (`lib/text-limits.mjs`, `checks.listLimitsDiffering`). Each list
     row's text box is filled in the DOM with longer and longer text until it needs more lines than the demo used,
     makes the block taller or runs past its right edge (`read-text-fit.js`, phase `text limits`, `text-fit.json`),
     at every kit width; the smallest is the frame's limit, whatever the demo text length. The slots at one place of
     every row (same role and type, same order) then share the smallest limit across rows, and the row template
     (`rowSlots`) carries it with `maxCharactersFrom` (`frame`, `frame and content map`, `content map` when no frame
     was filled). Items lists do the same per card field.
  2. *Template showcase pages leave the kit* (`lib/showcase-pages.mjs`, `checks.showcasePagesNotExcluded`): a page
     whose content the content map marks demo-only, a page view the platform adapter says only shows a CMS feature
     off (`showcaseViewFor`, for Joomla a search results page), and an article with its own menu item and no link of
     its own in a menu section where two pages were judged so (a picture of the offline or error page). They are
     listed in `excludedPages` with their `paths`, together with the blocks only they show; their errors and
     template gaps are dropped. The template's real not-found page stays in `site.systemPages.notFound`.
  3. *Page groups follow the real structure* (`lib/page-groups.mjs`, `checks.mixedPageGroups`): a listing page is
     a group with its own items (the content items it lists, by the map's item pages, its path or the link that
     leads to them, its further result pages, and the author or tag pages it leads to). Any other page, and any page
     with its own main menu item, is a group of its own, so a listing nested under another page in a menu is its own
     group. The check names a group holding a second listing or an unrelated page.
     A detail page (a person, an item) that a repeated list on the page one path level up links to is one of that
     page's items, even with a menu item of its own (`checks.detailPagesOutsideListing` names one grouped elsewhere).
     A page that itself lists pages one level down (a shop category of products) is a listing by its structure,
     never a detail page of the page above it; a page one level down of a kind that listing lists, shown on no list
     (the demo's list is cut short), is one of its items too.
     A group's root, its listing page, is its representative: its full-page shot stands for the group
     (`checks.representativesNotListing` names a group with items represented by another page).
  4. *A slot belongs to one block* (`lib/slot-owners.mjs`, `checks.slotsInTwoBlocks`): a slot listed by several
     blocks (`demoOwned`, `frames`, list rows) goes to the block that renders it, read from the shown words and
     measured frames of the read pass, the block of the slot's own entity first; the others are named on it
     (`alsoShownIn`). An items list's card fields only point at their items' slots and are not ownership.
  5. *Every shown text has a slot* (`lib/orphan-text.mjs`, `checks.orphanTexts`). A block's `slots[]`
     (`id, role, type, maxCharacters, sample`) are the words it shows that no list row, frame, link or demo fact
     holds: a section title, an intro, a lone button label, with the address slot that goes with a shown label (same
     JSON path or same row group), and other entities' words it prints (a CMS language string, a form field label,
     a module rendered inside it, the menu item title a page prints as its heading). Another content item's, menu
     item's or category's words, or a piece of a longer sample, that no block declares are settled across the kit:
     a link label of the block names its link (`links[].labelId`); a content item's words or a piece of a longer
     sample are a coincidence (the same word in that item, `Next` in a typography article) and become fixed text;
     anything else is the block's slot. The check names every shown text whose slot no block of the kit declares.
  6. *Every paragraph of a slot is read* (`lib/orphan-text.mjs` `paragraphChecks`, `checks.paragraphsMissing`).
     The read pass records every shown text whatever its length, and every shown paragraph (`<p>`) whole, the
     page's own count. A paragraph is read when the shown texts hold its words (a paragraph split by inline markup
     is read in pieces, longest text first). A paragraph counts for every slot of the block whose sample holds two
     paragraphs or more and contains it, even when another slot holds that paragraph alone. The check names a slot
     shown in two paragraphs or more with fewer paragraphs read than shown, so the orphan check sees every
     paragraph of a long quote or body.
  7. *The coverage gate* (`lib/coverage-gate.mjs`, `checks.slotCoverage`; parts and every failure in `coverage`).
     The kit is completed from the contract and the build's own page readings, then counted part by part:
     `slotsMissing`, every content map text slot a kit block shows (`coverage.shownTextSlots` counts them) is listed
     with `maxCharacters` and `maxCharactersFrom`; `linkLabelsOutsideBlock`, every link's `labelId` is a slot of the
     block holding the link (a slot another block owns is listed by reference, `ownedBy`, and is not ownership) and
     every top-level menu item is some link's label; `slotLimitsDiffering`, a slot holds one limit in every place
     that lists it (`lib/slot-limits.mjs`: the smallest of the kit's frame reading, else the content map's measured
     fit, and the content map's declared number; the slots at one place of every list row and an items list's card
     field count as one, and a group takes the smallest number that still holds every member's demo words). The
     frame reading (`read-text-fit.js`, `text-fit.json`) fills every shown single-part text slot's real container,
     a tab, chip, menu label or button included, until it needs more lines than allowed, the block grows taller than
     those lines need, or another text of the block wraps or runs past its edge; allowed lines are the most any
     slot of its group shows at that width in the content map (a title wrapping on another card). A content map fit
     that is only the box of the demo words (within three characters of them) is no limit and is never lent to the
     group; a frame reading that never runs out of room, or reads below the demo words, is set aside;
     `limitsBelowDemo`, no place holds a limit below the characters its demo words show (they show fine on the page);
     `textsWithoutSlot` (`lib/page-coverage.mjs`), a slot is one element on the page, never one text: the read pass
     counts the shown elements printing each text (`details.textCounts`), and a text printed by k elements of a
     block whose own entities hold n slots with those words needs min(k, n) distinct slots in the block (the
     generator gives each further element the next slot with those words, in content map order);
     `linksWithoutTarget`, every clickable element without an address (`details.clickables`: a button, a tab, a
     menu heading, a submit) whose label a slot of its block prints is a link of the block with what it opens
     (`links[].opens`: `modal` or `panel` with its `element` (a tab's own `#fragment` included), `slide` with the
     carousel its `data-slide` control moves, `submenu`, `form` with its `action` (a `#` link inside a form, such
     as the stars of a rating form, included), `action` with the address of the site it runs (`?task=`, `tmpl=` or
     another action key: a question form opened in a modal, a print view), `script`; a modal drawing a map says `writable: true` with the `slotId` of its setting
     slot when exactly one map setting is assigned to the page, else `writable: false` with the reason);
     `linksWithoutLabelSlot` (`lib/link-label-slots.mjs`), every link whose shown words a slot prints names it
     (`links[].labelId`): the text slot of the link's own address group first, then a slot the block declares or
     one of its own entities (links repeating the same words take each its own twin slot), then the one content
     map slot with those words (an item's title on a listing); words two unrelated slots share pick nothing, and
     words no slot prints (a CMS string) need no label slot;
     `imagesWithoutFrame` (`lib/picture-frames.mjs`), every picture a block shows at least 40px each way
     (`details.pictures`: an `<img>`, a CSS background of an element of the block or its `::before`/`::after`, and a
     background painted behind the block by an ancestor or a layer outside every block that shows through it, with
     nothing opaque between) is a frame of the block or a declared image slot; a picture none holds becomes a frame
     (`<block>.picture-N`, `shownAs`, `painter`, `paintedBehind`, `twinOf` when the same painter shows it in an
     earlier block, `canHide: true` for a background, which takes no room) with `writable: false` and the reason,
     since no content map slot holds it, unless a setting slot does (a template background, below);
     `textFormatMissing`, every text slot gives `paragraphs`, `bullets`, `formatFrom`, a `sample` with the whole
     demo text, one paragraph or `- ` bullet per line (cut only past 1500 characters), and `demoChars` (`total`,
     `lead`, `bullets`: plain-text lengths of the whole text, the paragraphs before the list, each bullet), so a writer
     aims at the demo's real length, and `inline` when the demo marks words inside the text (`[{tag, attrs, text,
     at}]` for a `span`, `strong` and the like, `at` being `start`, `end` or `inside`; `{tag: 'br'}` for a line break;
     `lib/inline-marks.mjs`) so the writer can mark the same words (`lib/text-format.mjs`; `cli.mjs samples` settles a
     written kit again), read from the block's real page, including the row
     template of a list with no sample row and the items of a card field; `mainMenuRowLimitMissing`, the main menu
     group has `rowLimit`: every top-level label filled together in the page until one wraps, drops to another row
     or pushes past the header, at 1440 and every narrower width down to where the row folds (`read-row-fit.js`,
     `row-fit.json`, `narrowestWidth`; without that reading, the demo row's labels as the content map measured them,
     summed, and the source says the room was not read); `contactFieldsUnresolved`, every
     `site.contactBlocks[].accepts.fields[]` entry names the content map slot of its column (`id`,
     `writable: true`, with its limit), a setting slot (`settingSlot: true`, listed in `site.settingSlots`), or says
     `writable: false` with `writableReason`, never a made-up id; and
     `orphanTexts`. On /ops the Template kit step reads `kit-incomplete` while the gate is above 0 and names the
     first failing parts and slots.
     A label slot says what else changes with it (`alsoChanges`: other blocks, page titles, menus).
- **Setting slots** (`lib/setting-slots.mjs`, `site.settingSlots[]`). A value the page prints from a CMS row that no
  content map slot holds (a released content map never changes) is named by the kit itself: `id`, `kind`, `writeTo`
  (the content map entity and column), `valueFormat`, `fillFrom`. `map-location`: a free-HTML block whose whole
  content is one map shortcode (Joomla: JA Google Map's `{jamap ... locations='...'}{/jamap}`, read from the
  database by the adapter, `lib/site/adapters/joomla-map.mjs`), written as the whole column from
  `writeTo.template` (`<address>`, `<latitude>`, `<longitude>`); only a setting a map button uses is listed.
  `contact-mobile`: a contact block's printed mobile field with no content map slot, written through
  `<contact>.mobile` with the limit of the contact's telephone line. `template-background`
  (`lib/background-slot.mjs`): the picture a T4 template paints behind the top of its pages from one site setting
  (`body_bg_img` in `etc/site/<profile>.json`, read by the adapter): one slot `site.body-background` with
  `writeTo: {action: "template.siteSettings", template, key, file}`, `canHide: true` and the `frames` it covers; every
  frame painted behind with that picture says `writable: true` and `slotId`, its twins included. Tracy writes it with
  `apps/tracy-web/src/lib/joomla-t4-body-background.js` (Claude Cowork for Joomla 0.24.78+).
  `cli.mjs setting-slots --out <dir> --contract <dir> --db-command <prefix> [--webroot <dir>]` settles a written kit
  again (no browser, no image; without `--webroot` the background slot the kit has is kept), then `pack`.
- **Fixed text ids** (`checks.fixedTextIdsInvalid`): every `blocks[].fixedText[]` entry carries `id`, `text` and
  `canHide`, the shape the planner reads. The id is stable across rebuilds: `<block>.fixed-<constant>` for a CMS
  line (the words around its placeholder may change), `<block>.fixed-<words>-<hash>` for template words. The check
  names an entry without an id or two with one id.
- **Template gaps** (`templateGaps[]`: `id, kind, where, detail, evidence, accepted`): real defects of the template
  or its demo, for /ops to judge: `page-without-h1`, `dead-link` (a block link to nothing, `#`, or a path that
  does not answer 200, unless it opens something on the page or runs an action; one per target and block), `dead-path` (a content map page that does not answer 200) and
  `sparse-row-left-packed` (each proposed template fix). The id hashes kind and place, so it survives a rebuild.
- **Site part** (`site`, from `site-cli.mjs`). `navigationGroups[]`: every menu block of the content map
  (`menuBlocks`), each item with `label`, `maxCharacters`, `target` (`kind`, `page`/`path`), `alive` and `status`;
  `orderFrom` is passed through and `"item-id"` gets an `orderNote` (a stand-in order, not the menu's own); what a
  footer column holds (`holds`, `itemsOf`) is joined in from the pages, and a link column that is no menu block is
  kept as read (`from: "page"`). An off-canvas menu the pages never show takes its links from its menu block.
  `contactBlocks[]`: each block showing contact lines (`kinds`, `lines`); one that shows a CMS contact also says
  what it accepts (`accepts`, from the platform adapter's `contactChannels`): every one-value field (`kind`,
  `column`, `max: 1`, `printed` when the template's contact layout prints it and its switch is on, `filled`,
  `setting`), `repeatableRows: false`, the named links (`max`, `printed`, `filled`, `setting`) and `otherChannels`:
  where a messaging app or social profile goes, or `none: …` when the page prints no field for it.
  `fixedTexts[]` (also `blocks[].fixedText`): a sentence the CMS prints from a language file (rendered text that is
  no content slot and matches a string of the site language's `.ini` files, placeholders such as `%s` and `%date%`
  taken as wildcards), with `source: {file, constant}`. A short value (a form label, `Page %s of %s`) matches only a
  whole line and names every constant with that value (`source.short`, `source.constants`); the measurement empties
  them all, and words that still show (counted as whole words: `Prev` is not inside `Previous`) are the template's
  own. When several constants share a value, the platform adapter's file rank names the line: for Joomla the
  override and the template's files, then core files, then core extensions, then add-ons (`<tag>.<extension>.ini`),
  so the article navigation's `Next` is `JNEXT`, never a mailing add-on's constant. A short value equal to a content
  sample on another page (a typography page's `Next`) is still measured; a long
  sentence equal to a content sample stays content. Shown words that are a content slot's (whole, cut short
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
  the rows on the first line at 1440 (`row-count`), or 1 in a slider or tabs (`slider-or-tab`); rows of uneven shapes
  (`uniform: false`, a masonry gallery) that form no row set take the demo's own count (`demo count (not measured)`,
  no error); else null and an error
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
  `cutout` (a picture larger than a drawing with a tenth or more of it clear: a figure cut out of its background,
  over another picture or beside the text), `photo`, or `logo` (named by the site part:
  `business.logo` slots and every logo spot's frame; who owns it is the brand step's, so `fixed` is null). An
  `<img>` kept at opacity 0 while its holder paints a mask or background over it is shown through that painter
  (`paintedBy`) and measured from it. A frame in a closed tab, slide or accordion is opened first, the way a
  visitor would (`revealed`, read again once a moving slide has settled); a picture not in its own block is looked
  for in the other blocks of the pages, then in the page region that holds it (`measuredIn`, a logo the template's
  own footer prints). A frame shown at phone width only takes its box there (`sizeAt`). A frame whose picture the demo
  leaves empty (`emptyInDemo`) can hide: the block already shows without it. `canHide`, in the DOM only: the picture and its painters (mask, pseudo-element, holder background)
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
  the biggest set whose every row opens a different content item, through the first item link of the row; rows of a
  block nested in the listing are that block's). Without a later position the page-size control the listing prints
  (`select[name=limit]`, its selected number) is the page size (`page-size-control`). `maxEvidence` says which.
  Zebra classes (`row0`/`row1`, `odd`/`even`) are row state, not shape. A width where the listing shows no row (a
  collapsed sidebar) is not judged for the minimum. An items list whose page shows too few rows to measure takes the
  minimum measured on the page of its layout that shows the most rows (`minSource: "layout"`, `minFrom`).
- **`contact-sheet/`**: every block image on HTML sheets (no screenshot), to spot
  images that are misaligned, blank, cut by a header or doubled.

The kit's images are published as a zip asset on the quickstart's GitHub release in `JoomlArt-Products/joomlart-products`
(the repo `RELEASES_REPO` in `apps/tracy-web/src/lib/quickstart-releases.js` reads), named
`template-kit-<template>-<version>.zip` (for example tag `quickstart/ja-boxing/j6`, asset
`template-kit-ja-boxing-1.0.10.zip`). `cli.mjs pack --out <kit dir>` writes it: `template-kit.json` plus `images/`, and
`approval.imagesSha256` is checked against those images with `imagesDigest`. Tests: `test/template-kit-crawl.test.mjs`,
`test/template-kit-assemble.test.mjs`, `test/template-kit-blocks.test.mjs`.
