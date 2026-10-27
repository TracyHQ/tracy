# Measurement protocol — measured ports and their run record

> **Cross-phase packet.** Read before Phase 0 of a port whose cost is measured (the next two:
> JA Nova `quickstart/ja-nova/j6`, T4; JA Morgan `quickstart/ja-morgan/j6`, T3). A port that is not
> measured does not need it. This packet defines what is frozen, what is recorded and how; it carries
> no measured number of its own. Tool: `scripts/run-record.mjs`.

A measurement compares two runs only when both ran against the same frozen inputs, the same bar and
the same tool version, and when every minute was assigned to one phase by a record written while the
work happened. A number recalled after the run, a bar lowered to finish, or a tool changed mid-run
makes the number incomparable; the rules below exist to keep those three out.

## 1. Frozen before the first measured minute

Write `freeze.json` in the run dossier, hash it (`shasum -a 256 freeze.json`), and make the hash the
first event of the record (`note 'epoch 1 frozen' --data '{"freezeSha256":"…"}'`). Nothing in it
changes during the epoch (§4).

| Field | Content |
|---|---|
| `source` | SHA-256 of every source artifact: quickstart archive, SQL dump, saved pages, inventory. |
| `scope` | route matrix: every route with its layout, view and viewports × themes; `pilot` (§3: the two pages) and `full` listed apart, each with its count. The Fast Gate case set is derived from the contract during the run and recorded (§2), not frozen. |
| `acceptance` | thresholds of every gate (parity, Visual QA, scanners, package) and the accepted-difference list with one reason each, as the static inputs the gates read: `parity-accepted.json`, `review.config.json` and the design-contract `pilotPages`, with their hashes. Contracts generated from the built site (`visual.contract.json` needs the site and the built theme) are not freeze inputs: their hashes are recorded at the checkpoint that writes them (§2). |
| `tools` | skill commit, `package-lock.json` SHA-256, generator commit (`packages/cms/tracy-wordpress-theme`). |
| `runtime` | Node, Playwright + Chromium, Docker, image digests (`wordpress:apache`, `mariadb:11`, `wordpress:cli`), WordPress version. |
| `machine` | model, CPU, RAM, free disk at start, OS version. |
| `reuse` | what may come from earlier runs (spec-pack, overlay, seed, evidence) and what must be produced fresh; reused artifacts listed with their hashes. |

## 2. Recorded during the run

`run-record.mjs` records time; everything else is a `note` with `--data` at the moment it is known.
Each figure carries its origin: **measured** (tool output, record arithmetic), **declared** (a person
entered it) or **unknown** — an unknown stays `null`, never an estimate. A time record proves where
time went, never that a gate passed: pass/fail comes from the gate's own report.

| Figure | Origin | How |
|---|---|---|
| wall time; work per phase; waiting; idle; peak concurrency | measured | `summary` (§5) |
| phases | measured | `acquisition` · `restore` · `ingest` · `build` · `qa` · `review` · `tool-repair` — time spent fixing a skill tool is `tool-repair`, not the phase that hit the defect |
| waits | measured | `wait <reason>` / `wait <reason> --end`: stand boot, restore, render queue, a decision pending |
| concurrency | measured | one `--lane` per parallel stream (agent, stand, render job) |
| coverage | measured | per gate: examined / declared with the denominator (`43/43 routes`, not `43`); pilot and full apart |
| manual mappings | declared | count and list of hand-written mappings (selectors, route maps, accepted differences added) |
| findings | measured | per gate, by severity, opened / fixed / accepted |
| escaped defects | declared | defects found after a gate passed, with the gate that should have caught them |
| invalid evidence | declared | runs discarded (wrong stand, stale capture, broken measurement) with the reason; their time stays in the record |
| artifact and checkpoint hashes | measured | SHA-256 of spec-pack, theme zip, quickstart pair, every generated contract (`visual.contract.json` after each `contract.mjs init`), every checkpoint the run resumes from |

## 3. Pilot gate — before layouts are multiplied

The pilot scope is the front page, one content page, and one admin round-trip: open the content page
in the editor, change a text, save, reload the editor, and render the page with the change visible,
then revert. The pilot build is chrome, the first patterns and the templates of those two pages on
top of the scaffold's templates, with the whole page-map seeded (the seeder re-runs as an update).
The pilot gate passes when all five checks below pass, in this order (the fifth is cheap and independent: run it as soon as the pilot build is seeded, in parallel with the first):

1. `design-contract.mjs pilot` with `pilotPages` = the two pages (`design-contract.md` §Capture and
   pilot): every variant, 0 findings, 0 missing cases; its report says `scope: pilot`.
2. `visual-qa.mjs --pages <home>,<content> --all-stages` (no `--scope`: `--pages` is the
   `targeted-debug` scope) with the pilot rows of parity. Pass: both pages measured at every stage,
   every stage `status: pass` in `visual.json`, and each stage merged with `notes.mjs merge` with
   `open = reopened = lee = leeFlagged = 0`. A `targeted-debug` run never passes the visual gate; it
   passes only this pilot check.
   **Cadence.** Between fixes, re-measure what the fix reaches, not the whole check: `--pages` the pilot
   page(s) it touches and `--stage` each stage that still has an open finding or lens note (a fix to a
   shared part, shared CSS or the dark theme reaches every stage it styles). The evidence for the check
   is ONE `--all-stages` run on the final pilot build — one process, so the intrinsic and interaction
   probes run once, not once per stage; in this `targeted-debug` run the intrinsic probe reads the two
   pilot pages only, every other route is read by the group, integration and release runs — or a `round.mjs` round over the four stages, whose
   tiers share those probes (`visual-qa.mjs --probes-from`). Measured on ja-restaurant (20–21/10/2026):
   16 pilot Visual QA waits, 96 min; each pass ran the four stages as four processes of ~2.5 min for two
   pages, ~2 min of each spent on the same two probes; five of the eight passes (p7–p13) had 0 findings at every
   stage.
3. The admin round-trip above, with the saved and reverted `post_content` hashes as its evidence.
4. **The Fast Gate on its own case set.** The contract always covers the whole page-map (the
   spec-pack must carry every required view, 404 included), so the Fast Gate resolver picks its cases
   from every family, every non-200 page, every state and every shared component — pages the two
   pilot templates do not draw. Those case pages are therefore built before the gate runs, and only
   those: `contract.mjs init --site … --built-theme <build>`, `fast-gate.mjs plan`, then build the
   template of each planned case page whose served template is not the one its layout has in
   `scope.full`; rebuild, re-init, re-plan, until one plan's case pages are all served their own
   layout's template (each round only adds templates, and the case set is bounded by families,
   non-200 pages, states and shared components, so this ends). Then `visual-qa.mjs --scope
   fast-gate`, `notes.mjs merge` per stage and `fast-gate.mjs verdict` exactly as `visual-qa.md`
   §Fast Gate; pass = verdict `pass`, or a verdict whose every remaining reason is on a case page the
   pilot does not build (any page but the two pilot pages): each such finding goes, with its page id
   and evidence path, into the brief of the group that builds that page, and stays gated there — the
   group verdict, the integration checkpoint and the full rounds measure it again. A reason on a pilot
   page, in a shared part, pattern or CSS, or in the dark theme still fails the pilot. (ja-restaurant
   fast-1…fast-4 failed only on group pages and the pilot was released by an order, 21/10/2026.) Record each plan's case list and the final contract hash (§2).
   A defect in a part, a pattern, a shared section or the dark theme is caught here once, on one
   page per family, before it is copied into the remaining layouts.

5. **Road to live, early.** TCQR (Customize your site) and TDSR (Design system) of the TracyHQ repo judge a release
   folder, but most of their rules read only the theme zip, the demo database and the slot contract, all of which the
   pilot build already has. Run `node scripts/quickstart/road-precheck.mjs --theme-zip <pilot zip> --slug <slug>
   --version <x.y.z> --pack <scratch pack> --stage pilot` (`pack.mjs … --out <scratch> --skip-secret-scan` on the pilot stand gives the
   `--pack`; it is provisional, never released). Pass = exit 0: no must-fix rule of either checker that the pilot can
   already see (`ABOUT-*`, `NAME-*`, `LOGO-*`, `FAV-1`, `CSS-1`, `DEF-1`, `VARS-1`, `PIC-1`, `PLAT-1`…), and a slot
   contract file for the theme (`SLOT-1` "No slot contract names …" blocks; a draft marked `ready:false` is listed as
   pending and must be `ready` before the release). The lines it lists as *pending* (preview and built-site rules
   `unmeasured`, `tracy_site_pages.json` not built yet) cannot be judged from a pilot; the release step judges them
   (`SKILL.md` Phase 10). Each blocker is fixed in the pilot's shared parts (a block written with inline `<br/>` or
   `<span>`, duplicate block names, a demo name left in a heading) **before** layouts are multiplied, where it costs one
   edit instead of one per template. The preflight image check (`road-precheck.mjs --prereq --build`) belongs to the
   start of the run, not here. Record the report in the run record. (JA Diner, 8.0 h: ABOUT-1/2/3 and SLOT-1 were first
   seen after all the visual work; JA Restaurant: released with slot `ready:false`, 22/10/2026.)

Only after the pilot gate passes are the remaining layouts of `scope.full` built. Each new template
changes what WordPress serves, so the contract is written again (`contract.mjs init`, new hash
recorded) and the pilot Fast Gate verdict no longer matches it. The **full Fast Gate** runs on that
contract once every layout of `scope.full` has its template, and the full visual run cites it
(`--scope full --fast-gate <run>`). Coverage figures name their scope: a pilot `2/2` or a pilot Fast
Gate case count is not a full-run number, and the full run reports its own denominator from
`scope.full`. Time spent building the Fast Gate case layouts is `build`, not a separate phase.

## 4. Stop and decision rules

- **Broken measurement blocks only its gate.** A tool that measures wrong (a preflight misread, a
  parity reader bug) stops the gate that depends on it; independent work continues. The repair is
  `tool-repair` time, and results from the broken tool are invalid evidence.
- **A tool upgrade opens a new epoch.** Any change to a `freeze.json` field — tool commit, lockfile,
  runtime, threshold, accepted difference, scope — ends the epoch. The old record is kept unchanged; a
  new record starts with its own freeze hash and a note linking the previous record's SHA-256.
- **Blocked is not a lowered bar.** A gate that cannot pass stays failed and the run reports it as
  blocked with the reason. Thresholds, accepted differences and coverage do not move inside an epoch.
- **A damaged record is evidence, not input.** When `run-record.mjs` refuses a record (truncated
  tail, bad sequence), keep the file, start a new record, and link it with a note carrying the damaged
  file's SHA-256.

## 5. The run record — `scripts/run-record.mjs`

Append-only JSONL, one event per line (`v`, `seq`, `at`, `cmd`, `lane` and the payload). Each
mutation takes `<file>.lock`, validates the whole record, appends one line and fsyncs; a held lock
exits 3 and is never taken over. A lane holds one open phase or wait; nothing closes implicitly.
`--at` takes a UTC timestamp `YYYY-MM-DDTHH:MM:SS[.sss]Z` for entries written after the fact;
without it the time is read at append. Times never go back.

A path in a note's text or `--data` is recorded as `scripts/lib/record-paths.mjs` writes one: relative to
the root of the repository that holds the record when the path lies inside it, `~/…` when it lies outside
under the home directory, unchanged otherwise. A run's artifact or scratch directory, or a runner's state
directory, is never recorded by its path, not even under `~`: name it in `TRACY_RECORD_ROOTS`
(`artifacts=/abs/dir`, entries joined by the path delimiter) and the record holds `<artifacts>/…`. The record is shared, so it never says how one machine is
laid out; pass absolute paths on the command line as usual. A record written by an older tool, with
absolute paths in it, is read as it is.

`summary` prints JSON in ms: `perPhaseMs` (union of the phase's spans across lanes), `workMs` (union
of all phase spans — never the sum of phases), `laneSumMs` (the sum over lanes, the double-counted
figure, kept apart), `parallelMs`, `peakConcurrency`, `waitingMs` split into `waitingOverlapWorkMs`
and `waitingOnlyMs`, `idleMs`, `wallMs` (first to last event). Open spans are listed, add nothing,
and exit 1; `--as-of T` counts them up to T and reports `provisional` (with nothing open it changes no
number: the wall ends at the last event). Exit 2 for a refused input.

<!-- run-record example -->
```bash
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T08:00:00Z note 'epoch 1 frozen' --data '{"freezeSha256":"<sha256 of freeze.json>"}'
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T08:00:00Z start acquisition
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T08:40:00Z end acquisition
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T08:40:00Z start ingest
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T08:45:00Z --lane stand wait 'stand boot'
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T09:05:00Z --lane stand wait 'stand boot' --end
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T09:05:00Z --lane stand start restore
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T09:20:00Z end ingest
node scripts/run-record.mjs --file run.jsonl --at 2026-10-01T09:30:00Z --lane stand end restore
node scripts/run-record.mjs --file run.jsonl summary
```

Result: acquisition 40 min, ingest 40, restore 25; work 90 min = wall 90 (not the 105 of the lane
sum); the 20-minute stand boot overlaps ingest entirely, so waiting adds nothing to the wall; peak
concurrency 2. `scripts/test/run-record.test.mjs` runs this block and checks these totals.

<!-- run-record totals: {"status":"complete","perPhaseMs":{"acquisition":2400000,"ingest":2400000,"restore":1500000},"workMs":5400000,"wallMs":5400000,"laneSumMs":6300000,"waitingMs":1200000,"waitingOverlapWorkMs":1200000,"waitingOnlyMs":0,"idleMs":0,"peakConcurrency":2} -->
