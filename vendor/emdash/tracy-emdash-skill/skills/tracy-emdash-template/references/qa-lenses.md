# Tiered visual QA — one capture script, five lenses, notes are todos, Fast Gate before full

> Read before running `visual-qa.mjs` with a contract that has `visual.stages`. This is the process Lee settled
> on 14/09/2026: **one capture script**, **several QA agents**, one lens each, **note = todo** for the
> coding agent, **a tier runs only when the previous tier is clean**, and `visual-review` passes on five things
> the machine checks — no human signature. **This file is the source of truth for the process**: tier order, roles,
> the rules for opening/closing notes and the pass conditions are written here; `visual-review-method.md` (how to measure),
> `qa-contract.md` (schema) and `qa-and-packaging.md` (gates P7/P8) point here and do not redefine them.

## 1. Who does what

| Role | Does | Does not |
|---|---|---|
| **Main agent** (coordinator) | `fast-gate.mjs plan`, calls the capture script (`--scope fast-gate` then `full`), splits shots between lenses by `index.json`, spins agents, merges notes, keeps tier state, calls `fast-gate.mjs verdict`, writes the receipt | does not look at shots in place of a lens, does not edit code, does not close todos |
| **Script** `visual-qa.mjs` | opens the browser, captures per `visual.shots`, measures **every page in scope** (rules, coverage, source comparison, image census, scanner, design system), writes `index.json` + `notes/machine.md` | makes no judgement; does not pick pages (the resolver does) |
| **Resolver** `fast-gate.mjs` | picks the Fast Gate case set from the contract, prints why; grades the verdict of a Fast Gate run | does not open a browser |
| **5 QA agents** (lenses) | open **each** assigned shot, write `notes/<lens>.md` with a **basis** for each note; after a fix round close/reopen their own todos | do not edit code, do not close another lens's todos |
| **Coding agent** | reads `NOTES-<stage>.md`, fixes, fills `notes/fix*.md` by id (`done`/`skipped`/`lee`), reruns the script with `--reuse` | does not close todos, does not edit notes/shots, does not edit the contract to make a test green |
| **Lee** | answers `[LEE]` flags in `DECISIONS.md` | does not sign the receipt |

Closer ≠ fixer is a condition of the receipt (§7.4): the session ids of the QA agents and the coding agents
must not overlap. Rules for opening/closing/reopening a todo: **opened** by the machine (`M-`) or a lens (`N-`);
**done** is written only by the coding agent; **closed/reopened** only by the lens that opened it, after looking at the new shot;
`M-` closes itself when the finding disappears on a later run and **reopens** itself when the finding comes back after `done`;
`[LEE]` hangs until there is a decision in `DECISIONS.md` and it has been put into the contract.

## 2. Tiers — fixed order

`light-desktop` → `light-responsive` → `dark-desktop` → `dark-responsive`. The script refuses to run
a tier while the previous tier is not `pass`; `--stage <id>` runs one tier for a fix round. When light is done well,
dark usually has only a few spots left (measurements from the Northgate run: `examples/northgate.md`).

Lenses needed per tier: light-desktop **all 5**; light-responsive **layout + typography**
(+ images); dark-desktop **color** (+ layout); dark-responsive **layout + color**. The contract's
`visual.shots[].consumers` is the source of truth — read `index.json`, don't guess.

## 3. Shots — capture only what has a consumer

- Capture per **layout** (the view's representative page, `layouts[]`), measure per **page** (every page in scope).
- A language is a translation: only the default language in every tier; other languages are added at the narrowest width for
  typography when they carry their own risk (another script, longer text, fallback font — `fast-gate.mjs` measures this from the contract).
- Source shots only in light tiers, for layout/typography/images; dark compares against tokens, not source shots.
  A language with its **own source** (its own page/frame in `source.files`) gets its own source shot,
  at the same size as the site shot — the default language's source shot does not stand in for it.
- The capture rules (`visual.shots`) are **not hand-written per project**: `build-qa-contract.mjs` calls
  `deriveShots` (`fast-gate.mjs`) to derive them from the contract — default language in every tier, its source in the
  light tiers, languages with their own risk at the narrowest variant plus their own source; lenses by the tier's theme + width.
  No line names a language.
- **Full-page shots must be cut to be readable.** A 390 × 7 000 px shot opened with the read tool is shrunk to ~2 000 px
  high: 13 px text becomes 3 px, and the agent "opened" it without seeing anything. The script cuts every shot (site, source, frame)
  into tiles ≤ 1 200 px (`--tile-height`) under `shots/<page>--<variant>[--source]/<n>.png`; `index.json`
  records `tiles[]`. Lenses **open each tile**; `## Opened` lists tiles; `qa-notes merge` only counts a shot
  as opened when **every tile** of it was opened. The full shot is kept for the record.
- `index.json`: one line per shot `{layout, page, variant, stage, side, file, tiles, consumers, hash, measured}`.
  Reused shots (`--reuse`) **point** to the older run (tiles included), they are not copied.
- QA agents do not scan the folder themselves: the main agent filters `index.json` by consumer and **puts the tile
  list in the prompt**. The `## Opened` section of a note is the proof of opening; the merge compares it with `index.json`.

## 4. Five lenses — what to look at, what not to

Each agent receives: the list of files (site, and source if any), the contract (to know `designSystem`,
`layouts`), the path to the captured Style guide page. Open **each** shot; for a pair, put the site next to the source.

| Lens | Looks at | Already handled by the machine (don't note again) |
|---|---|---|
| `layout` | topbar/nav wrapping (separator hanging at end of line), buttons dropping to a new row, misaligned grid, cramped/sparse blocks, block order, elements overflowing their frame, odd white space at narrow widths | horizontal-overflow |
| `typography` | bad line breaks, long words overflowing a cell (longer language at the narrowest width), orphans/widows, wrong case, overlong lede, overlapping text | font family/size/weight (rules), sizes off the scale (`off-system`) |
| `color` | whether dark "was designed": glaring blocks, lost borders, background images too dark, clear active/hover states, readable text on images | contrast, white-surface, dark-on-dark, bright-border, colours outside the palette |
| `images` | right image in the right place, crop, ratio, alt/caption, leftover dummy text (lorem, TODO), languages drifting in content, blocks missing/extra versus the source | image count, placeholder, h1/lede matching the source |
| `interaction` | mobile menu, clearly visible active/hover/focus states, sensible tab order, buttons big enough to tap at 390 | hover-jump, mega travel, Escape/focus, theme toggle |

Mandatory question for every note: **could the machine catch this?** If so, write in the Fix column
"→ rule/scanner: …" so that next time no eyes are needed.

**A defect the source shares is still a defect** (Lee 14/09 evening: fix it to be better than the source). A site that matches the source but breaks
`output:` or `system:` (unit dropping to its own line under the figure, source strip overflowing horizontally, separator hanging at end
of line) → write the note as usual, Flag `SOURCE`; the coding agent **fixes** it, without waiting for Lee. If after the fix the machine
reports `parity-mismatch` on a two-sided measured pair, add `design.exceptions` with a `decision` pointing at the note id
and this rule — the exception is a consequence of a decision, not a way to make a test green.

**Every note must name its basis**, written right in the What column, one of four: `source:` (source shot/frame
at the same size), `system:` (design system rule/token, `designSystem`/`tokens.css`), `content:` (approved content
requirement — seed, content-gaps) or `output:` (a requirement of the output site — responsive,
dark, 404, state). Without a basis it is not a note, it is a preference. Pages without a source shot (derived
pages, 404, desktop-only frames) still get notes — by `system:` and `output:`; write "no source to
compare" explicitly instead of staying silent. **Unverified** guesses at a cause or fix go in the Fix column with the prefix
`hypothesis:` — the coding agent checks before trusting them.

## 5. Note = todo — template

`notes/<lens>.md`:

```
# <lens> — <run>
## Opened
- /abs/path/shots/en-home--1440-light.png
- /abs/path/shots/en-home--1440-light--source.png
## Notes
| Page | Axis | What | Where | Fix | Verify | Flag |
|---|---|---|---|---|---|---|
| en-news | 1440-light | source: Subscribe is a utility box, not a kit button (same orange, padding 15/32) | sidebar, y≈900 | use .btn-primary | padding 15px 32px, same height as source | |
| en-home | 1440-light | source: figures sit 8px lower than the source | stats strip | hypothesis: align-items | baselines equal | LEE |
| en-not-found | 390-dark | output: search button drops to a new row under 390 (no source to compare) | form, y≈420 | flex-wrap | one row at 390 | |
| ru-services | 390-light | output: unit "т" drops to its own line under "18 000" (the source drops too) | stats strip, cell 1 | nowrap figure+unit | one line | SOURCE |
```

- **What**: where the site differs from source/system, one sentence. **Where**: region + approximate coordinates. **Fix**: suggested file/rule/seed.
  **Verify**: the sentence that closes it. **Flag** `LEE` = changes design intent (token, dropping a block, changing a font) — the agent
  does not decide alone; `SOURCE` = the source is wrong too, fix it better than the source, only counted separately.
- An empty table = nothing found; the `Opened` section is still required in full.
- `|` inside a cell is written `\|`.

Coding agent: `notes/fix.md` — `| Id | Status | Fix |`, Status `done` / `skipped` (+reason) / `lee`.
Closing lens: `notes/<lens>-close.md` — `| Id | Status | Reason |`, Status `closed` / `reopened`.
Merge: `node tools/qa-notes.mjs merge <run> --stage <id>` → `NOTES-<stage>.md/.json` (ids stable by
content, duplicates across lenses merged into one line with several tags), exit 1 when a shot with a consumer has not been opened by anyone.

## 6. One tier's round (main agent)

1. `tools/clean-install.sh <target> <port>` from the current tree (35 seconds) — a clean site every round, so that
   the tier's last run **is** the receipt's site.
2. `node tools/visual-qa.mjs --contract qa.contract.json --site <origin> --source-site <source> --out <run> --stage <id> [--reuse <earlier runs>]`.
3. Read `<run>/index.json`; spin the tier's QA agents **in parallel**, each with: its file list,
   `references/qa-lenses.md` §4–5, the path to write `notes/<lens>.md`. Wait for all.
4. `qa-notes.mjs merge` → open todos? → spin **coding agents by file group, in parallel** (Lee 14/09
   19:40): split the todos of `NOTES-<stage>.md` by view/file — each agent owns a **non-overlapping**
   group (e.g. Contact + Form kit · Article · Investors + Careers · Home/News/Projects · Slides kit +
   Style guide); shared files (Header, global CSS, `build-seed.mjs`, the contract) go to exactly one
   agent. Each agent writes `notes/fix-<group>.md` (same template as `fix.md`); the merge reads every `notes/fix*.md`.
   Don't split by lens: the same file/defect is reported by several lenses, and splitting by lens means two agents
   fixing one spot. Then go back to step 1 (a new clean site) with `--reuse <previous run>`.
5. After the recapture: spin again **only** the lenses that have `done` todos, with the new shots of layouts whose
   hash changed; they write `<lens>-close.md`. Merge again.
6. A tier closes when: the machine has 0 findings, every todo is `closed` (including `SOURCE`), `[LEE]` = 0 (or decided in `DECISIONS.md`
   and put into the contract), and the last run is a **clean confirmation round** — all the tier's lenses look again at
   every shot and open no new todo (`notes/<lens>.md` has only `Opened`).
7. Each tier's last run is copied into `evidence/qa-<n>/visual-<stage>/`; scratch runs are deleted.

## 7. `visual-review` — five things the machine checks (`qa.mjs`, `assessVisualReview`)

The pass condition of **every** visual review run (Fast Gate or full) is the five things below; the
`visual-review` receipt applies only to a `full`-scope run — a `fast-gate` run cited as a tier's last run
is refused.

The receipt is written with `qa-receipt.mjs visual-review … --visual-runs light-desktop=<run>,… --qa-agents <ids> --coding-agents <ids>`.
`qa.mjs` rereads the runs and refuses when any of these is false:

1. Each tier: `visual.json` has the same origin as the report, verdict `pass`, each run later than the one before; `NOTES-<stage>.json`
   has `open = reopened = lee = leeFlagged = 0`.
2. `coverage.missing = 0` and every consumer in the tier's `index.json` has reported.
3. The last run has no `notes/machine.json` finding left and no `N-` todo that is not `closed`.
4. QA agent set ≠ coding agent set, QA not empty.
5. The hashes of the files pinned in the receipt (`index.json`, `visual.json`, `NOTES-*`, `notes/*`) match the disk.

## 8. Fast Gate — standardised early QA: contract → resolver → run mode → verdict

Not the final P7 gate: **the inner loop of every phase from P3 on**, and that loop has a name and a machine keeping it. Three scopes, recorded
in `visual.json.scope.kind` and every file of the run: **`fast-gate`** (a small set the machine picks, all tiers),
**`targeted-debug`** (`--pages`, hand-picked for probing), **`full`** (every page). Only `full` can pass the
`visual` gate; `qa.mjs` reads the scope from the report, so a relabelled subset run is still refused.

**The resolver** (`tools/fast-gate.mjs plan`) picks cases **from the project's contract**, deterministic, with no
pre-written list of pages or languages: the default language's root page; every page with `status` ≠ 200
(unknown-route is an output requirement, whether or not the source has a 404 page); one page for each state in
`interactions{}`; one page for each declared `layouts[].family` (list, detail, form…); one page for each
**shared component** (a file in the import closure of ≥ 2 layouts but not of all of them — a frame
every page carries is covered by any page); non-default languages with their own risk (non-Latin/RTL
script, text ≥ 25 % longer, a different font allow-list — measured from `content[].expected` and `fonts.allowed`) added at
**the narrowest variant of each tier**. Greedy set cover, ties broken by id. **Every tier** of `visual.stages`
gets cases — viewport/theme is an output requirement, and a source without the frame is not exempt.
`visual.fastGate.add/drop` overrides must have a `reason` and are validated; a drop that loses coverage is an error, not
a lighter gate. Missing 404 page, missing layout, wrong override → exit 2 with the reason.

`FAST-GATE-PLAN.md` says: which cases were picked, which layout/component/state/locale each case stands for, what
**only the full gate checks** (layouts, pages, states, components not rendered), the fast/full axis
ratio. A small site, or many independent layouts, makes Fast Gate ≈ full, and the plan says so plainly (`nearFull`) —
coverage is not dropped to be "fast". `plan --changed a,b` lists the cases that have those files in their render inputs:
used in P5 when adding a family/component.

**The Fast Gate round** — same script, same lenses, same notes, only the case set differs:

1. `node tools/fast-gate.mjs plan --contract qa.contract.json` — read the plan, don't argue with the machine by hand
   (to differ, use `visual.fastGate` with a reason).
2. `tools/clean-install.sh` a clean site, then `node tools/visual-qa.mjs --contract … --site … --source-site …
   --out <run> --scope fast-gate [--reuse <earlier run>]` — runs every tier in order, stops at the first failing tier.
3. Each tier: spin the lenses by consumer in `index.json` → `qa-notes.mjs merge --stage <id>` →
   the coding agent fixes **shared defects before they multiply** → recapture with `--reuse` → lenses close/reopen →
   a confirmation run opening no new todo.
4. `node tools/fast-gate.mjs verdict <run> --contract qa.contract.json` → `FAST-GATE.json/.md`. Passes when:
   the scope is right, the contract has not changed, every tier is `pass`, every case is measured on all axes, each tier was merged with
   `open = reopened = lee = leeFlagged = 0`, `coverage.missing = 0`, every consumer has reported, no `N-`
   is not `closed`, `notes/machine.json` is empty, and each page's hash **recomputed on the current tree** matches the
   run (changing shared CSS, a component, the seed of a rendered page's collection, a source reference, a criterion or a tool
   makes it stale). **A clean machine alone is not enough**: an open note or a shot nobody opened is a fail.
5. Full: `visual-qa.mjs … --scope full --fast-gate <run>` — refuses (exit 2) when the verdict is not pass, the
   contract changed or a page hash drifted. Without `--fast-gate` the script only warns; the process makes it mandatory.

**When to run**: P3 — Fast Gate on the slice built so far (the plan can only pick pages that exist; record the scope);
P5 — when adding a family/component, declare `layouts[].family`, run `plan --changed`, run the related cases
with `--reuse`; **before full QA (P7)** — Fast Gate must be clean against the current contract and build; P7 —
full, the whole matrix, `--reuse` the Fast Gate run for pages whose hash did not change; P8 — receipt. A Fast Gate pass **does not
replace** visual acceptance, and does not replace the release receipt.
