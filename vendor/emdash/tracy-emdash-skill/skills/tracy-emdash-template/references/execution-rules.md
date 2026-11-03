# Execution rules — speed and token cost, every agent on a port

> Binds the main agent (coordinator) and every subagent on an EmDash port. Adapted from the WordPress skill's
> `references/build-subagents.md` §Execution rules and §Model per role. **Every figure below that carries a
> number was measured on WordPress/T4 ports, not on EmDash** — it says why a rule exists, not what an EmDash port
> will cost. Measure an EmDash port with `scripts/perf/token-report.mjs` (§Measuring) before quoting EmDash figures.

## Cost and tool calls

- **Cost ≈ tool turns × context size**: every turn re-reads the whole context. Measured on a WordPress/T4 port:
  main-agent context median 240–354k tokens per turn; long sessions $17–57 per round, short sliced sessions ≈ $10.
- **Minimal tool calls**: only the calls the next decision needs. One probe script per fix group measures all its
  values in one run (`visual-scan.mjs probe`/`snapshot` per page, not one scan per property). Long logs and reports go
  to a subagent that returns only the exit code, counts and failing lines — never pasted into the main context.
- **Results, not scripts**: read a gate's result, not its source. `qa.mjs` ends with one JSON line and writes
  `report.json`/`REPORT.md`; `node tools/gates.mjs <qa-run>` prints one line per gate (`<gate> | status | reason |
  file`); `fast-gate.mjs verdict` writes `FAST-GATE.json`; `qa-notes.mjs status <run> --stage <id>` prints the counts.
  Open the file for the part you need; do not write ad-hoc scripts over `visual.json` or `report.json`.
- **Bounded output**: pipe long output through `head`, `tail` or `grep`, or write it to a file and grep the file. Never
  `cat` a whole reference, `visual.json` or a log. `visual-qa.mjs` and `fast-gate.mjs` print one summary line and the
  path of the full result by default ([`tools.md`](tools.md) §Output convention); add `--verbose` only when the
  per-page / per-stage lines are the thing being debugged, and send them to a file.
- **Batched reads**: several files or greps in one command; read a tool's summary file instead of its per-item outputs.

## Sessions and handoff

- **One job per session**: a build, fix or measure session has ONE narrow job (one phase row, one page family, one
  tier's fix round), writes its result to `STATUS.md` (the state the skill already requires after every phase:
  task, files owned, runtime identity, gates with evidence paths, blockers, next command) and ends. The next job
  starts in a new session that reads `STATUS.md`, not the transcript. A session does not continue into the next job
  because it has context left.
- **Small slices**: hand off to a fresh session after ~90 min or ~60 tool calls even inside one job. Measured on 108
  WordPress runner tasks: median wall time 0.3 h for diffs < 50 KB, 4.7 h for > 1 MB.
- **The coordinator is sliced too**: one coordinator session per stretch of the phase table in
  [`SKILL.md`](../SKILL.md) — **P0–P3** (up to the Fast Gate on the slice, the pilot), **P4–P5** (importer,
  personalization P4.5/P4.6, page families), **P7** (acceptance), **P8** (package, clean install, release). At each
  boundary it writes `STATUS.md` and ends; the next session starts from `STATUS.md`. Measured on a WordPress port
  (ja-restaurant, 20–21/10/2026): one coordinator session carried the whole port — 844 turns, 371 M cache-read tokens —
  and a time limit that ended it cut the dispatch it was holding.
- **Checkpoint, not memory**: record each finished phase with `node tools/checkpoint.mjs complete checkpoint.json
  <phase> <evidence…>` beside `STATUS.md` (`init` once, at P0). A new session runs `checkpoint.mjs status
  checkpoint.json` first: a phase whose evidence or inputs (source inventory, lockfile, `template.config.json`, the
  `seed/` files, `qa.contract.json` — a contract edit in P5 reopens P3's Fast Gate) changed since it was recorded is `stale` and is redone, not skipped; phases whose own inputs and evidence are unchanged
  keep their record (no cascade).
  `STATUS.md` keeps the narrative; the checkpoint is what proves a phase still holds.
- **Child session window**: when the coordinator launches child sessions with the CLI, it sets
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW=120000`.
- **Long tool runs** (`npm test`, a full `visual-qa.mjs` tier, `qa.mjs --visual`) are waited on, not polled turn by
  turn; read their summary lines when they end.

## Fan-out

- **Foreground fan-out**: lens and coding subagents ([`qa-lenses.md`](qa-lenses.md) §6 steps 3–5) are dispatched in
  ONE message as parallel **foreground** calls, and the dispatcher blocks until every one has returned. A worker never
  ends its turn while subagents or checks run in the background. Measured on a WordPress port (30/09): a turn end
  with background work lost three page groups and one slice.
- **Headless runs end with the turn**: under `claude -p` (how `wf agent` runs a session) ending the turn ends the run
  and stops every background subagent and command it started. Run subagents in the foreground, or block on a
  background job until it ends, before ending a turn.
- **Lens readers get a brief, not the skill**: a lens subagent gets its file list (tiles from `index.json`), the path
  it writes (`notes/<lens>.md`) and a brief pointing at [`qa-lenses.md`](qa-lenses.md) §4–§5. It does not load
  `SKILL.md` or other references.
- **Images once**: read each tile once and record its verdict with the shot's hash (`index.json` `hash`) in the
  `## Seen` table of `notes/<lens>.md` ([`qa-lenses.md`](qa-lenses.md) §5) — not on the `## Opened` lines, which
  `qa-notes.mjs` reads as bare paths. Within a session and in close rounds, do not reopen a tile whose shot hash is
  unchanged; after the hash changes (`--reuse` recaptured it), review it again. This saves reads, not checks: the clean
  confirmation round ([`qa-lenses.md`](qa-lenses.md) §6 step 6) still opens every tile, and `qa-notes.mjs merge` fails
  on a shot with a consumer nobody opened.

## Before the build loop

- **Pilot first**: the P3 Home slice + one content page with a clean `fast-gate.mjs verdict` is the pilot. No page
  family is multiplied (P5) on a frame that has not passed it.
- **Source sanity first**: at the end of P1, read `render-source.mjs`'s `render-manifest.json` — fonts loaded,
  overflow, console errors per page and theme. A broken source (a font that does not load, a stylesheet that 404s)
  is fixed in how the source is served or recorded in `content-gaps.md` **before** P2 freezes the reference
  ([`source-inventory.md`](source-inventory.md) §P1 exit check). Measured on WordPress: fixing the source before the
  pilot took pilot findings 243 → 26.
- **Batch owner questions**: product-owner questions (`[LEE]` flags, `DECISIONS.md`) go into one list per handoff;
  the loop continues on recorded, reversible defaults. Do not ask permission per phase ([`SKILL.md`](../SKILL.md)
  §Getting started, Step 4).
- **Lessons before a phase**: run `node scripts/lessons.mjs scan <template> --phase <phase>` (from the skill folder)
  before starting a phase and read only the lines it prints — the unresolved traps in this template and the rules of
  that phase, each pointing at the reference line that states it ([`lessons.md`](lessons.md)). Only the detectors of
  earlier phases run, so exit 1 means a finished phase no longer holds; exit 2 means something could not be read.
  Before P8 ends, scan again with `--pack <packed-dir>` and no `--phase`: every detector runs.
- **Loop caps**: full-scope visual runs and the stop rule are stated in [`qa-lenses.md`](qa-lenses.md) §6.
- **P8 is one command**: `node tools/release-chain.mjs …` runs pack → clean install from the package → `qa.mjs` on
  the artifact → `content-api-gate` → `release.mjs` (after `generate-docs --check` and `artifact.mjs`) as child
  processes, one line per step, stopping at the first failure with that step's log; fix it and rerun with
  `--from <step>`. No model turn between the steps, and no step skipped by hand ([`tools.md`](tools.md)).

## Model per role

A subagent runs on the dispatcher's model unless the dispatch names another one. Tool runs (`visual-qa.mjs`,
`qa.mjs`, Chromium shots) cost no tokens; the tokens go to agents that read tiles, reports and logs, and to agents
that reason about fixes. **No role below has been measured on EmDash yet.** The "WordPress basis" column says what
the WordPress skill measured; until an EmDash measurement exists, a role whose WordPress basis is "not measured"
stays on the main model.

| Role | Model | WordPress basis (not measured on EmDash yet) |
|---|---|---|
| Layout lens (`qa-lenses.md` §4) | the port's model (Sonnet 5.5); one main-model pass at the final P7 tier run | measured on a WordPress port: Sonnet 70/82 real differences, Opus 58/82, union 80/82; Haiku missed most and swapped site and source — do not use Haiku for a lens |
| Colour, typography, images, content lenses | main model | not measured |
| First-pass classification of machine findings (real / tool false positive) | main model | not measured |
| Long-run watcher (run a command, wait, report exit code + summary lines) | Sonnet 5.5 | not measured; a cost decision on WordPress (21/10/2026) |
| Page-build and CSS-fix subagents, same checks | Sonnet 5.5 (effort medium) acceptable | measured on WordPress skill fixes: 2/3 correct for both Opus and Sonnet, Sonnet at half the cost |
| Cross-module fixes (seed/contract, `global.css`, Header/Footer, kit tools) | main model | not measured; the change is the product |

**How to pass the model.** Agent tool: `model: "sonnet"` or `model: "haiku"`; leave `model` out to inherit the
dispatcher's model. CLI fan-out: `claude -p --model sonnet`; for the main model, name the dispatcher's own model
(`claude -p --model 'opus[1m]'` — quote it, zsh reads `[1m]` as a glob). A bare `claude -p` runs the CLI default,
which may be a model nobody measured. Never pass the word `inherit` as a model name.

## Measuring

`node scripts/perf/token-report.mjs [--worktree <abs path>]… [--since <ISO>] [--json <file>]` (skill-level, from
`skills/tracy-emdash-template/`; not copied into templates) prints one row per Claude Code transcript of the
worktree — turns, input / cache-write / cache-read / output tokens, context per turn, model — and totals by kind
(`main`, `subagent`, `lens`). Run it at each coordinator boundary and record the totals in `STATUS.md`; that is
how the WordPress figures above get EmDash counterparts.
