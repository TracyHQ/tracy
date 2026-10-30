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
