# Lessons — every past defect as one record, loaded only when it applies

> **Cross-phase packet.** Run the scan at the start of a port and before Phase 8 and Phase 9; open a
> long gotcha only through `show` when its lesson matches. `gotchas.md` stays the full account; this
> store is the index an agent reads first.

The skill carries 63 numbered gotchas and ~40 fixed issue items. Most are fixed in code, and most of
the rest apply to only some sites (a T4 source, a Bootstrap container, a pack built on macOS). Reading
all of them before each step costs context and still misses the one that applies. The store keeps each
defect as one short record with a **detector**: a check over the port's own inputs that says whether
the trap is present and whether its fix holds. Every input is a directory on disk — the spec-pack, the
built theme, a saved copy of the source site, the quickstart pack. The scan loads no page: a trap only a
running page shows names the tool that checks it (`tool`), which the verify and review phases run.

```bash
node scripts/lessons.mjs scan --spec <spec-pack> --theme <built theme> [--source <saved pages>] [--pack <dir>]
node scripts/lessons.mjs show L-058
```

`--theme` is the theme WordPress loads (`src/<slug>/` of the generator, or the unzipped package) — not
the overlay: overlay metadata in it is what L-005 looks for. `--source` is a saved copy of the source
site, one file per page — `index.html` for `/`, else `<path>.html` or `<path>/index.html`, as
`wget --mirror --adjust-extension <source url>` writes it.

## When to scan

| Moment | Inputs | Why |
|---|---|---|
| Start of a port, once the spec-pack passed its gate and the theme is built | `--spec --theme` (+ `--source`) | ingest and theme traps before any content is seeded |
| Before Phase 8 (verify) | `--spec --theme --source` | theme and content traps before parity and Visual QA read the site |
| Before Phase 9 (package) and again on the Phase 10 pack | `--spec --theme` · `--pack` | shipping traps before the zip or the quickstart leaves the machine |

A scan without `--spec` or `--theme` exits 2: nothing was checked. Do not point it at an empty
directory to get an exit 0 — run it again when the inputs exist, before the work that depends on them.

## Output and exit codes

- **stdout**: one line per lesson, `id · sym · fix`, nothing else. First the **unresolved** lessons (the
  trap is in these inputs and nothing handles it), sorted by id; then the **guidance** lessons (process
  rules every port carries, `when: "always"`), sorted by id. Each id once.
- **stderr**: the counts; the detail of each unresolved lesson; the resolved lessons (trap present, fix
  holds on this data); detectors that could not decide (unknown); detectors left out because an
  optional input was not given (`not checked (no --pack): …`) and the source pages not compared; the
  lessons left to live-page tools (`left to live-page tools, not scanned: L-007 (review/contrast-audit), L-012 (visual/visual-qa)`).
- **exit**: `0` no unresolved lesson among the detectors that ran · `1` an unresolved lesson · `2` a
  usage error (`--spec` or `--theme` missing included), an input given that cannot be read, or a
  detector that could not decide. `2` wins over `1`: a scan that could not read part of its inputs is
  never reported as a finding list, let alone as clean; the lines of the detectors that did decide
  still print. Exit `0` covers only what ran: an optional input not given (`--source`, `--pack`) or a
  spec file the spec-pack lacks leaves its detectors `not checked` on stderr, not clean.

Guidance lines are reminders, not checks: the scan does not know whether the rule was followed. The
scan also replaces no gate — parity, Visual QA, editability and the package gates still decide.

An `open` lesson is a defect not yet fixed in the tool: it keeps a detector and stays unresolved on
every site that has its trap until the tool is fixed or the port works around it (record the decision
in `DECISIONS.md`; the scan does not read it). None is open now. Font smoothing (L-092) and container
breakpoints (L-093) are compared by Visual QA on the rendered pages — `design.parity.body` and
`design.containers` (`visual-qa.md`); the scan does not measure them again. A media/route collision
(L-057) is decided by the seeder on the attachments WordPress actually holds — `report.mediaRoutes`,
exit 1 on a collision (gotcha 57); the scan does not guess it from file names.

## Record format — `references/lessons.jsonl`

One JSON object per line, keys in this order, every value a string:

| Key | Holds |
|---|---|
| `id` | `L-NNN`, ascending. `L-001`…`L-063` are gotchas 1–63; later ids are issue/PR items and the further defects of a gotcha that holds several (`show` lists a gotcha's other lessons as `also:`) |
| `area` | `process` `stand` `theme` `ingest` `seed` `parity` `visual` `review` `form` `package` `quickstart` |
| `when` | a detector id (table below) or `always`; absent on `fixed-in-code` and `tool` records |
| `status` | absent (a detector decides) · `fixed-in-code` (no detector, never scanned) · `open` (not fixed; needs a detector) |
| `tool` | the script under `scripts/` (`.mjs` implied) that checks a trap only a running page shows, e.g. `visual/visual-qa`; no `when`, no `status`, `test` required |
| `sym` | the symptom, ≤ 100 characters, no control characters |
| `fix` | `<path under scripts/, .mjs implied>#<text in that file>` — e.g. `seed#resolveMedia` is `scripts/seed.mjs`, and `resolveMedia` must occur there — or `$ <command or rule>` (read, never run) |
| `test` | `<name>~<text>`: `scripts/test/<name>.test.mjs` holds `<text>` (a test title or its assertion). Required on `fixed-in-code` |
| `ref` | space-separated `gN` (gotcha N) · `#N` (issue N) · `prN` (pull request N) |

`show <id>` prints the record, the files its pointers name, and the gotcha heading / issue / PR to read.

**Size.** A record is aimed at 200 bytes of UTF-8. The symptom is the part to cut; a pointer is not
shortened below what resolves. Records over 200 bytes (each through its fix/test pointer): L-009, L-037,
L-039, L-049, L-059, L-060, L-063, L-077, L-098, L-101, L-102, L-103, L-105, L-111, L-112, L-116, L-118.
No record exceeds 240 bytes. The catalog test holds
this list to the file.

## Kinds

| Kind | Record | In a scan |
|---|---|---|
| detect | `when: <detector>` | printed when unresolved; named on stderr when resolved |
| open | `when: <detector>`, `status: "open"` | as detect; the tool still has the defect |
| guidance | `when: "always"` | printed on every scan, after the unresolved lines |
| tool | `tool`, `test` | never run; named on stderr — its tool decides in Phase 8/8b |
| fixed-in-code | `status: "fixed-in-code"`, `test` | never; `show` still finds it |

A `fixed-in-code` record names the code that fixes it and a regression test that exists; the catalog
test resolves both. A defect whose fix is not proven by a test keeps a detector instead.

## Detectors — `scripts/lib/lessons.mjs` `DETECTORS`

| Detector | Needs | Reads | Lessons |
|---|---|---|---|
| `host-disk` | spec | free space on the file system of `--spec` (< 5 GB unresolved) | L-004 |
| `spec-cat-slug` | spec | `content.json` categories: one `wpSlug` per category | L-058 |
| `spec-list-class` | spec | each source `<ul>/<ol>` with a class, matched to the block list of the same words (first free one), keeps every class token; a source list with no such block is lost | L-048 |
| `spec-li-img` | spec | each source list with images of its own, matched the same way, keeps as many in the block list | L-055 |
| `spec-img-pct` | spec | `%XX` in image `file`/`original` of every image table the seeder imports from: `content.json` `images`, each page's and post's, each custom and ACM module's | L-095 |
| `spec-post-template` | spec, theme | a post's `_wp_page_template` declared with `postTypes` holding `post` in `theme.json` | L-088 |
| `spec-template-file` | spec, theme | every template a page/post declares (`meta._wp_page_template`) and every `customTemplates` name has `templates/<name>.html`; a page-map view is not a template file (`page-login` is served by `page.html`, gotcha 63) | L-104 |
| `spec-orphan-modules` | spec | a module the adapter recorded as `orphaned` that the seeder (`seed.mjs` buildPageContent) draws whatever the theme holds: a section-stack entry (`contentKind: "sections"`) of kind `section` with its `html`, or of kind `html` with its `blocks`. One drawn only through a pattern — an ACM instance `sections.json` assigns to the page (`instancesForPage`), an entry without that text — depends on `patterns.map.json` and the site's registered patterns, which no scan input holds: unknown, named (the seed report's `sections` says) — also beside a finding on another module, so that scan exits 2. A slot names a position, never a module, so markup is not read. A page whose `contentKind` and `content` disagree, or an `acm` the seeder cannot read, is unknown | L-010 |
| `theme-overlay-meta` | theme | `theme.config.json`, `theme.overlay.json`, `patterns.map.json` in the built theme | L-005 |
| `theme-block-path` | theme | each `register_block_type()` / `register_block_type_from_metadata()`: a first argument that is one literal `namespace/name` is a block type name (no file; never for `_from_metadata`); a path is read only as `get_theme_file_path('…')`, `get_template_directory()`/`get_stylesheet_directory()`/`__DIR__`/`dirname(__FILE__)`/`dirname(__DIR__)` `. '/…'`; any other argument (a variable, a call, an object) is unknown. The path's `block.json` is present, or the call sits inside an `if` whose condition has, as a whole `&&` term, `file_exists()`/`is_readable()` of exactly that `block.json` in one of those forms (a check on the block directory is no guard: the directory can exist without its `block.json`) | L-006 |
| `theme-docs-marker` | theme | `DOCS_REQUIRED:` left in `AGENTS.md` / `docs/` | L-017 |
| `pack-modes` | pack | `SHA256SUMS` + manifest checked as restore does, through the scan's no-link tree, each archive hashed in chunks; then the webroot archive's members through `archive.py list` and `auditArchiveMembers`. The listing must be a non-empty list of at most 500 000 rows, each with a `name`, a known `type`, an integer `mode` ≤ 0o177777, integer `uid`/`gid`, a `linkname` string and a `pax` list; anything else is unknown | L-089 |

A detector reads only the inputs it needs; when one was not given it is out of scope and named on
stderr. The same holds for each spec file it reads that the spec-pack does not have — every one must
be there (a `from-url` skeleton has no `content.json`): `not checked (no content.json in --spec)`,
never "no trap". Without `site-model.json` (a `from-html` spec-pack) the list lessons compare module
lists and name page and post bodies as not compared. Every one of these spec files that is there, and `theme.json`, is checked before any detector runs
— whichever detectors run or skip — and must have the shape the
ingest adapters write — `page-map.json` a non-empty `pages` list whose paths start with `/`;
`content.json` `pages`, `posts` and `categories` lists; `sections.json` a `custom` list;
`site-model.json` a `records` list; every entry an object — and the theme a `style.css` with a
`Theme Name` header and an object `theme.json`: anything else is exit 2. A `--source` given must hold
at least one saved `.html` page, whether a detector reads it or not; else exit 2. Lists on pages made
from Joomla articles are compared only with `--source`: `site-model.json` leaves those bodies empty, so
the scan reads the article body (`[itemprop="articleBody"]`, `.com-content-article__body`) of the page
saved for the page's `joomlaPath` — exactly one of `<path>.html` and `<path>/index.html`; a path with a
query, `.`/`..` or characters no saved file name has is unknown; without `--source` the list lessons are `not checked`
(a clean part is no clean whole), and a finding on the parts that were compared still names those pages
as `not checked` on stderr. Source HTML holding a list that cannot be compared — a module with no
`blocks`, a body with no `content.json` entry, a page not saved (or saved twice), a saved page without an article body — is
unknown; the refusal names every saved page without an article body at once, not the first alone. A page whose article
the source never prints carries it as `droppedContent` in `content.json` (what `from-joomla` writes for
`skip_component_content` or a layout with no component row) and is not compared: it has no source list to lose. A port
that works around an adapter that missed such a guard (ja-restaurant S-7, S-36) moves the body to `droppedContent` rather
than deleting it, and the scan then decides. An input that was given and cannot be read — missing, a symlink, a FIFO/socket/device, empty,
malformed, the JSON literal `null` where an object belongs, changed while read, past a limit, an archive listing that fails or times out — makes that detector
unknown and the scan exit 2.

The hero lessons (L-007, L-012) depend on the classes the rendered page leaves on `body` — nothing a
static input settles. L-012 (hero words in the page background) names `visual/visual-qa`: its parity
compares each word's colour inside `main` with the source's on every axis that reads a source, light
and dark. The floating header of L-007 sits outside `main`; L-007 names `review/contrast-audit`, which reads
the whole body: run it with `--mode light` and in its default dark mode — header words in the page
background colour are a finding in both. The WordPress install samples (L-046) are trashed by
the seeder (`installSamples`, fixed in code).

PHP guards are read from the code with comments and strings blanked: only an `if` around the call,
testing that block's own `block.json` in an exact form, guards it; `__DIR__` is the directory of the PHP file that holds it. `_wp_page_template: "default"` selects the template hierarchy and names no file.

**Limits** (`LIMITS`): 8 MiB per file, 20 000 entries and 16 levels per tree, 200 article pages
read from `--source`, 16 GiB and 10 min for the pack's two archives in all (`SHA256SUMS` must name
exactly `manifest.json` and those archives), 64 MiB and 60 s for the archive listing. A path is walked
without links, opened, and walked again; a tree is listed from inside each directory, its identity
checked on entry: a directory swapped during a read or a listing is refused. HTML is parsed with
jsdom and never run (the spec-pack's and the saved source pages); no page is loaded and no network is
used; the archive is listed, never extracted; subprocesses get argv, never a shell.

## Adding a lesson

1. Next free id; `area`, `sym`, `fix`, `ref` (and the gotcha, if one is written: gotchas stay the long
   account, numbered, appended at the end).
2. A detector when the trap can be read from the inputs — with a positive and a negative case in
   `scripts/test/fixtures/lessons/cases.json` — or `fixed-in-code` with its regression test, or
   `tool` when only a running page shows the trap and a script already checks it, or `always` for a
   process rule no input shows. A detector reads static inputs only; it never loads a page.
3. The source item in `lessons-sources.json`, with a cite for each issue/PR item → lesson pair.
4. `node --test scripts/test/lessons-catalog.test.mjs scripts/test/lessons.test.mjs`.

## Source inventory — `references/lessons-sources.json`

The snapshot the store was seeded from (28/09/2026): gotchas 1–63, and every issue and pull request of
`JoomlArt-Products/tracy-wordpress-theme` as `gh issue list` / `gh pr list --state all --json
number,title,body,state` wrote them. `evidence` names the two snapshot files and their SHA-256; when
they are on the machine, the catalog test checks the hashes, that the inventory's issue and PR numbers
are exactly the snapshot's, that each PR named as closing an issue names it, and that the issue items
are exactly the snapshot's — every numbered item with a bold title (`k. **…**`, `k. (note) **…**`) keyed,
no key the issues do not hold. Each
item — `gN`, `#N.k` (issue N, item k; `#N` for a single-defect issue), `prN` — maps to its lessons, or
for a PR that closes issues to `{closes}`, or for a feature PR with no defect to `{none: reason}`.
`complete: true` only when every item was read in those files; the catalog test refuses an incomplete inventory, one without `evidence`, and
any lesson no source reaches. Duplicates keep every pointer: L-058 carries gotcha 58, issue #10 and PR #16. An item that holds several
defects maps to one lesson per defect (gotcha 46 → L-046 samples, L-101 page order; gotcha 41 → L-041
Tracy reveals, L-108 freeze, L-109 hidden loops, L-110 carousel controls).

`cites` ties each issue/PR item to each of its lessons by content, not by number: `"<item> <lesson>":
"<words>"`, where the words occur in the item's text in the snapshot and in the lesson's `sym`, `fix`,
`test` or `tool` (case ignored) — `"#8.7 L-113": "contract"` (the contract's mega selectors), not
L-050 (the mega-hover walk). The catalog test refuses a pair without a cite, a cite the lesson does not
hold, and, against the snapshot, a cite the item's text does not hold. A cite is a check that the pair
was read, not proof the two describe one defect; the item text and the lesson stay what a reviewer
compares.
