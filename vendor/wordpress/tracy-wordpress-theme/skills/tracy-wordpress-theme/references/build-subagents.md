# Subagents — when to stay on the spine, when to fan out

> **Cross-phase packet.** Read at the start of the run to choose the shape; read again before Phases 8 and 8b when dispatching.
> Budget of the Tracy Base run: at most 6 subagents, no subagent writes to the WordPress DB (plan) — that is the path
> up to the end of the pilot. After the pilot, page groups are a deliberate exception: each subagent writes to the DB of the
> group's OWN stand, never the main stand.

## The split

> From Phases 4–8b, after Phase 3 and a green pilot, the spine splits by **page group** (each group one stand and one
> file-writing subagent, run in the foreground) — see §Parallel page groups at the end of "Execution rules", the ONLY
> dispatch rule for Phases 4–8b after the pilot; the diagram below and §A–§B apply only to **the path up to the end of
> the pilot** and **the final audit on the main stand**.

```
Phase 0  provision   ─┐
Phase 1  scaffold     │
Phase 2  ingest       │   SPINE — sequential, shares live state
Phase 3  chrome       │   (Docker stand, DB, overlay on disk, spec-pack).
Phase 4  theme-json   │   RUNS INLINE in the main conversation, ONE packet per phase.
Phase 5  templates    │   Do not cut it into subagents per phase: each one starts from
Phase 6  css-dark     │   an empty context, must rediscover, only its last message comes back —
Phase 6b imagery      │   detail falls through every handoff.
Phase 7  content     ─┘

Phase 8  verify      ─┐   (pilot and final audit) PARALLEL, INDEPENDENT, READ-HEAVY.
Phase 8b review      ─┘   DISPATCH SUBAGENTS — one per page group / per audit axis, read-only,
                          each with its own browser. After the pilot, each group measures + fixes on its own stand.

Phase 3  chrome      ┄┐   CONDITIONAL FAN-OUT (file-writing subagents, §C) — ONLY when
Phase 5  pattern     ┄┘   design-spec.md has every slot filled. Work that is independent per file
                          (one pattern / one template per agent) should parallelise —
                          IF the agent reads the spec instead of needing conversation context.
```

**Why the spine is inline.** The spine phases edit one site together and feed the later phases. Keep them in the main
loop, read each phase's packet **at the right moment**, to keep one phase's detail at full resolution instead of
skimming 24 reference files in one pass.

**Why subagents for verify/review.** Each page renders and is measured independently; nothing later depends on another
page's result. An agent that renders + captures + reads `getComputedStyle` produces 30–50k intermediate tokens and
returns a 500-token list — that is the benefit of context isolation. One browser per agent (its own Playwright context,
or its own CDP slot) so they do not fight.

**Why execute subagents are only conditional (§C).** The reason the spine is inline is **conversation** context (design
decisions, page IDs just created), not disk/DB access. An execute subagent is safe as soon as its input is a **written
artifact** (`design-spec.md` + source markup + `patterns.map.json`) instead of conversation history. Patterns (Phase 5)
are high-volume work, independent per file — where it pays back the most. The Tracy Base run of 13/09 ran exactly
so: 21 patterns and chrome were two subagents in parallel with B ingest.

**Use the prompts below verbatim**, filling in `<…>`. §A and §B agents are **read-only** (they report, the spine fixes; used only up to the end of the pilot and at the final audit
after integration); §C agents **write files** to their own paths; page-group agents follow §Parallel page groups.

## A. Phase 8 — parallel verify by page group (pilot · final audit)

> After the pilot, measuring a group is the group subagent's job (§Parallel page groups); this section is only for the pilot and the final audit.

Split ~40 pages into N groups of 8–10 (one group per agent, ≤ 4 agents). Each agent:

> **READ the skill first**: `SKILL.md`, `references/verify-recipes.md`, `references/dark-light-mode.md` §3–§4.
> Do not rely on this prompt in place of them.
>
> **Browser**: its own Playwright context (not shared with another agent). WordPress stand:
> `http://127.0.0.1:8227`. Joomla source: `http://127.0.0.1:8217`. Spec-pack: `<spec>` (read
> `reference.json` — it declares the reference side of each page).
>
> **Pages of this group**: `<file → WP path → Joomla URL>` × 8–10.
>
> For EACH page, BOTH light and dark:
> 1. Open the WordPress URL; set the mode with the cookie `tracy_theme=<mode>` before loading.
> 2. Capture. Open the mega menu with a REAL pointer and capture; on the front page run
>    `node scripts/review/mega-hover.mjs <url> --items '.tracy-mega'` and report the verdict.
> 3. Measure the selectors in `verify-recipes.md` §2 → JSON snapshot (§3).
> 4. Open the Joomla URL, matching mode (hook `class:t4-dark` + `attr:data-bs-theme=dark`), same measurement →
>    second snapshot.
> 5. `node scripts/verify-render.mjs <W.json> <R.json>`; report per page: verdict + every mismatch
>    (selector, light value, dark value, expected, severity). Flag horizontal overflow, tofu, broken hover, 404 images.
>
> **Against false positives**: measure the SAME element on the source side before flagging — a finding with no source-side
> value is dropped. Demo images stay as they are. Parity = structure + tokens + text + spacing, NOT pixels.
> Return the list of findings; fix nothing.

The spine gathers, fixes real mismatches, builds/seeds again, and dispatches the affected groups again until clean.

## B. Phase 8b — four audit axes, one message (pilot · final audit)

**Agent 1 — Editability** (read-only):
> READ all of `references/editability-standards.md`, then audit the live site + the installed theme tree
> (`wp-content/themes/tracy-base/`) against EVERY rule. Each violation: rule §, element/file, how to fix. Hunt
> specifically: `core/html` holding text; a block with text but no `role: content`; a hand-typed `<a>` in a part instead of
> `core/navigation`; `core/navigation` without `ref` when the site has > 1 menu; content text in
> `templates/*.html`; dead forms; a synced pattern without a `[Tracy Base] …` name.

**Agent 2 — Coverage** (read-only):
> READ `<spec>/page-map.json` and `tasks/<run>/content-gaps.md`. For each `pages[]`: `curl -o /dev/null -w
> '%{http_code}'` the WP path; the 5 gaps must 301 to the right `redirectTo`; the six required views have a page; each
> `customTemplates` has a page using it. Report only what is missing.

**Agent 3 — Complete dark** (its own browser):
> READ `references/dark-light-mode.md`. Run the six scanners with `--config <review-config.json>` on every
> page, both modes; read `examined` before trusting "clean". Check the three-state toggle per §4 (do NOT
> use `toggle-test.mjs` as evidence of a fail). Hunt: leftover white backgrounds, black text on dark backgrounds, light borders, logos
> lost on black backgrounds. Measure light-vs-dark on each finding.

**Agent 4 — Package / install** (read-only):
> READ `references/packaging.md`; run `node scripts/lessons.mjs scan --spec <spec> --theme <src/<slug>>` and
> open only the gotchas of the lessons it prints (`lessons.mjs show`). `node scripts/build.mjs --target tracy-base
> --check`; `unzip -l dist/tracy-base.zip` has no `*.map.json`/`*.overlay.json`/`*.config.json`;
> grep `'tracy'` as a text domain in the PHP of the generated tree (it must be `'tracy-base'`); `Version:` matches
> `package.json`; `readme.txt` has every field. List what would break a clean install.

Gather them, apply **verify-before-fix** (measure the value before changing it), fix on the spine, check again.

**Report vs fix round.** In this parallel pass (one stand, pilot or final audit) agents REPORT, the spine FIXES
(two agents editing `theme.overlay.json` or running `build.mjs` at once is a race). A "fixing" agent loops measure → fix → build → measure
only when its files, worktree, stand and evidence are fully disjoint — that is exactly a page group.

## C. Execute subagent — parallel build (Phase 3 chrome · Phase 5 pattern)

> Up to the end of the pilot (Phase 3 chrome; shared patterns and the registered baseline). After the pilot, a group's own templates/patterns are written by the group subagent in its own files (§Parallel page groups); shared files still belong to the coordinator.

Precondition: `design-spec.md` has **no slots left** (`spec-pack.mjs --validate` green), and for patterns:
`patterns.map.json` already has a row for that type and `tasks/<run>/acm-blocks.md` describes the source fields.

Avoid write races: each agent owns its own path — one `overlays/tracy-base/patterns/section-<type>.php`,
or the chrome cluster (`parts/*.html` + `blocks/mega-menu/` + `assets/js/tracy-base-mega.js` + the chrome part of
`tracy-base.css`). Shared files (`theme.overlay.json`, `sections-extra.css`, `patterns.map.json`) agents
**do not edit**; they **return** the lines to add and the spine merges them once. Then the spine runs `build.mjs --target
tracy-base`, installs onto the stand, and verifies (§A).

- **Phase 3 chrome → ONE agent** (header/mega/toggle/footer is a coupled cluster). Give it `design-spec.md` +
  the source header/footer markup (`capture/templates/tracy/html/layouts/…` of j6) + `menus.json`. It returns
  parts, blocks, JS, and the menu structure for the spine to seed in Phase 7.
- **Phase 5 → N pattern agents in parallel** (one ACM type per agent, or a group of 3–5 types of the same shape).
  Give it `design-spec.md` + `tmpl/style-N.php` + `tmpl/style-N.xml` + `css/style.css` of that type + its
  `patterns.map.json` row. The agent reads its references (it is told to); the prompt gives only the overlay folder, the spec
  path, the ONE artifact to build, and the source markup.

Each agent reads [`templates-and-patterns.md`](templates-and-patterns.md) §3 (pattern header, the
`metadata.name` convention) and [`theme-json-tokens.md`](theme-json-tokens.md) §0 (no hex) itself.

## D. No predefined agents

The T4 version ships 10 agent files at the plugin root; this skill is a TCH repo skill (`.agents/skills/`), not a
plugin, so it has **no** `agents/*.md` — the §A–§C prompts are all there is. The references remain the single source of
truth; the prompts only point at them.

## Execution rules — speed and token cost, every agent on a port

Binds the main agent and every subagent. Figures are past measurements, not guarantees.

- **Cost ≈ tool turns × context size**: every turn re-reads the whole context. Measured on a T4 port:
  main-agent context median 240–354k tokens per turn, output ~17–21k per session; long sessions $17–57
  per round, short sliced sessions ≈ $10.
- **Minimal tool calls**: only calls the next decision needs; one probe script per fix group measures all
  its values in one run; long logs and reports go to a subagent that returns only exit code, counts and
  failing lines — never pasted into the main context.
- **Small slices**: one page group or one feature per slice, one commit per slice; hand off to a fresh
  session (state on disk, not the transcript) after ~90 min or ~60 tool calls. Measured on 108 runner
  tasks: median wall time 0.3 h for diffs < 50 KB, 4.7 h for > 1 MB.
- **Rolling test-fix**: fix as found, re-measure the touched part, full four-tier runs only at
  checkpoints (a page-group port: the group loop and two planned full-site runs, §Parallel page groups) — [`visual-qa.md` §Rolling fix round](visual-qa.md#rolling-fix-round--default-roundmjs---watch--recheckmjs).
- **Sweep re-runs**: after a change run `site-sweep.mjs` again with no `--only`, `--pages` or `--widths` — it
  measures only what was still open in `<run-root>/site-sweep-state.json` and carries the rest (`round.mjs` does this after every
  deploy; editing a `sweep.accept` row does not start a new history). The full sweep is
  the release gate `patch-chain.mjs` runs (`--full --reason "release gate"`, skipped when the output already holds that exact sweep for this zip
  after the verified restore); by hand it needs
  `--full --reason "<text>"`. A hand-written measure script is only for a defect the sweep does not measure
  ([`visual-qa.md`](visual-qa.md) §Re-runs).
- **Parallel page groups**: after Phase 3 and a green pilot, Phases 4–8b run per page group, groups in
  parallel, each end to end (build → seed → measure → fix → close) on its own stand — not parallel building
  followed by a serial whole-site QA. See [§Parallel page groups](#parallel-page-groups--phases-48b-per-group).
- **Model per role**: page-build and CSS-fix subagents may run Sonnet 5.5 under the same checks;
  cross-module changes stay on the main model (§Measurement — coding worker); the layout lens follows
  §Model per role.
- **Finish rule**: findings are triaged by severity and a port is done when no blocker or major cluster is
  open; decisions and tool defects leave the loop, and a pass that closes nothing stops it — see
  [`SKILL.md`](../SKILL.md) §Done rule.
- **Foreground fan-out**: page-group and lens subagents are dispatched in ONE message as parallel
  foreground calls; a worker never ends its turn while subagents or checks run in the background (a turn
  end kills them — measured on a port 30/09: three page groups lost, one slice wasted).
- **Headless runs end with the turn**: under `claude -p` (how `wf agent` runs a session) ending the turn ends
  the run and stops every background subagent and command it started. The coordinator and every build session
  run subagents in the foreground, or block on a background job until it ends, before ending a turn.
- **Batch decisions**: product-owner questions go into one list per handoff; the loop continues on
  recorded defaults.
- **One job per session**: a build, fix or measure session has ONE narrow job, writes its result to the
  run's notes/state file and ends; the next job starts in a new session that reads that file. A session does
  not continue into the next job because it has context left.
- **The coordinator is sliced too**: one coordinator session per stretch of the Phase table — up to the pilot
  gate, the page-group dispatch until every group hands off, integration, Phases 9–10. At each boundary it
  writes `STATUS.md` and the run record and ends; the next session starts from them and the group handoffs,
  not from the transcript. A tool run of more than a few minutes is waited on in the background and read by
  its summary lines, never polled turn by turn. Measured on ja-restaurant (20–21/10/2026): one Opus
  coordinator session carried the whole port — 844 turns, 371 M cache-read tokens, 557 k output: twice the cache reads
  and twenty times the output of every subagent and lens together — and a time limit that ended it cut the group dispatch it was holding.
- **Child session window**: the coordinator launches child sessions with
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW=120000`.
- **Batched reads**: several files or greps in one command; read a tool's summary file instead of its
  per-item outputs.
- **Bounded output**: pipe long command output through `head`, `tail` or `grep`, or write it to a file and
  grep that file; never `cat` a whole reference, ledger or log. Read the current state with
  `head -40 STATUS.md`; open `STATUS-log.md` only when a question needs history.
- **Results, not scripts**: read a gate's result, not its script — `scripts/port-checks.mjs` prints one line
  per recorded gate; `visual-qa.mjs findings` prints one line per finding. Do not write ad-hoc scripts over
  `visual.json`. The gate CLIs print one summary line and the path of the full JSON; open the file for the
  part you need, or pass `--json`.
- **Images once**: read each screenshot crop once and record the verdict, with the crop path and its hash,
  in the notes; do not reopen an unchanged crop. After the image bytes change, review it again. Pass crops
  of the region under review, not full pages; every tile a gate requires is still opened.
- **Pack and release by command**: packing and release go through `scripts/quickstart/patch-chain.mjs`
  (fix release) or `cycle.mjs` (first release); a model is called only when a phase fails.
- **One fix release per port**: all defects known for a port go into one fix release, never one release per
  defect.
- **Lens readers**: a lens reader gets a brief file path and only the crops of its cell; it does not load
  `SKILL.md` or other references.
- **Source sanity first**: before Phase 2 read the source's agent docs (JoomlArt:
  `products/<family>/<tier>/<id>/source/docs/design-system.md` in ja-products) and check live that its
  typography, line-height and fonts render as intended. Fix a broken source (e.g. empty T4 Site
  typography → browser serif, 16 px headings) before freezing the reference. Measured: pilot findings
  243 → 26.

## Parallel page groups — Phases 4–8b per group

Why: on JA Nova (29–30/09) all pages were built, then QA ran on one stand — every fix rebuilt, redeployed,
reseeded and re-measured serially; ~15 four-tier checkpoints (12–21 min each) ≈ 3–4 h, 14.4 h QA in total.
Morgan built the remaining pages in parallel groups in ~50 min, then lost hours in the serial loop.

**Which procedure applies.** Up to the green pilot the spine and §A–§B below apply unchanged (inline, one
stand, read-only reports). After the pilot this section is the ONLY dispatch rule for Phases 4–8b: group
subagents are foreground, **write files and write to their own stand's WordPress** (never the main stand).
§A–§B return only for the coordinator's final audit on the main stand after integration; there the agents stay
read-only reporters. Phase 3 and Phases 9–10 stay on the spine.

**Split and ownership.** Assign every remaining page to one of 3–4 groups by layout family (for example services,
blog, account). Each page and each file has exactly one owner.

- **Coordinator (frozen for groups):** `theme.json`/overlay tokens, header/footer parts, shared CSS,
  `patterns.map.json`, and any template or `section-*` pattern used by more than one group.
- **Group:** its layout templates, the `section-*` patterns only its pages use, its page CSS, and the content
  records of its pages in the spec. Substantive Phase 4–8b work is the group's, in parallel.
- A group that needs a frozen file sends the coordinator a request; the coordinator applies ONE batched change,
  builds the revised baseline, hands it to every group, and each group rebases and **re-measures** (evidence taken
  before the change is stale — drop it).

**Registration baseline (before the split, before baseline measurement).** Not finished layouts: only what the
validators need on every stand. The coordinator registers every template and every `section-*` pattern the spec
uses as a **seedable shell** — a pattern file with real mapped blocks, each mapped `metadata.name` field, the
`className` and the measurable pair `contract.mjs` requires (an empty placeholder fails contract validation) —
listed in `patterns.map.json`. Source content is seeded as is; an empty source field stays empty (`content-gaps.md`).
Verify on the main stand: `seed.mjs` does not refuse ("named by the patterns map but not registered") and
`contract.mjs init` prints no "pattern coverage is incomplete". Baseline visual failures stay visible; never accept
them to get a green baseline. A group then replaces its shells with real implementations in its own files.

**Baseline contract.** The contract is derived from what the stand SERVES, bound to the seed report
(`visual-qa.md` §Contract), so it is never copied between stands. Generation order, always:
**build/deploy → seed → `contract.mjs init` → validate → measure.** Baseline (full measurement 1): on the main
stand, seed the whole spec-pack on the registration baseline, `init` (all pages; a page served by the fallback
template is a valid page), resolve every `pending` (declare `templates` in `review.config.json` or fix the page) — a
contract with `pending` or unresolved inputs is not measured; it may report visual failures but must list all
pages. Never copy a pilot contract between stands and never narrow the canonical release contract. Its generation
is the "before" record only; it is stale after the first merge.

**Setup per group `<g>`.** A compose project alone does not isolate host paths; everything below is group-owned
and nothing is shared writable:

| Item | Per-group value |
|---|---|
| Code | own git worktree `$WT-<g>` from the post-pilot commit; `PKG` = generator package inside it (`packages/cms/tracy-wordpress-theme`; build output `$PKG/src/<slug>`, zip `$PKG/dist`) |
| Spec inputs | tracked paths in that worktree: `$S/spec/`, `$S/review.config.json`, `$S/parity-accepted.json` (`S=$WT-<g>/tasks/<name>`) — never an untracked dossier copy, so they merge |
| Stand | project `<proj>-<g>`, own site port, volumes `webroot` and `db`, install dir `$D/install` (distinct from `$PKG/dist`) |
| Evidence | `$D/` (`compose.yml`, `seed/`, `restore.json`, `visual.contract.json` = the group's own contract, `runs/`, `STATUS.md` current state + `STATUS-log.md` history) |

The recipe is a set of copyable blocks; `scripts/test/page-groups.integration.mjs` extracts each by its marker and runs
it as written, so what is here is what was run. One block per step, the same blocks for the main stand (coordinator,
no `G`) and for a group stand (`G`, `GP` set). Export first: `SKILL` the absolute skill dir, `PKG` the generator package, `S` the
tracked dossier (`$WT-<g>/tasks/<name>`), `SEED` the immutable seed pack, `IMAGES` an absolute image dir, `D` the
stand's evidence dir, `P` its compose project, `PORT`, `PW` the DB password, `SLUG` the theme slug; `SOURCE_SITE`
whenever the pack has a live or served source (`url`/`html` pages; `$S/pairs.json` only maps source routes that differ from the page's own, a same-path `url` page needs none; plus `SOURCE_DARK_HOOK` when that live source needs a request hook to go dark); groups add `G` (group id) and `GP` (the group's WordPress paths, `/a,/b`).

**1 · Stand** — a group stand comes from the SAME seed pack and the LOCAL images: nothing is pulled and WordPress is never downloaded
(`pull_policy: never`; a missing image stops the block naming it; `restore.mjs --offline-checksums` skips only the wordpress.org
checksum request, the pack's `SHA256SUMS` and the core version still hold — `release.mjs` refuses such a restore, a release restore
runs without the flag).

<!-- recipe:stand -->
```bash
set -euo pipefail
: "${SKILL:?} ${S:?} ${SEED:?} ${IMAGES:?} ${D:?} ${P:?} ${PORT:?} ${PW:?}"
export PW PORT IMAGES P D
export COMPOSE_PROJECT_NAME="$P" COMPOSE_FILE="$D/compose.yml"   # no -f/-p words to split: a path with spaces stays one value
cd "$SKILL"
for img in mariadb:11 wordpress:apache wordpress:cli; do docker image inspect "$img" >/dev/null || { echo "image $img is not in the local cache: nothing is pulled" >&2; exit 1; }; done
URL=http://127.0.0.1:$PORT; mkdir -p "$D/install" "$D/seed" "$D/runs"
# quoted heredoc: the shell writes nothing in; Compose interpolates ${PW} etc. from the exported env (any quote or $ in PW is data)
cat > "$D/compose.yml" <<'YML'
x-db: &db { WORDPRESS_DB_HOST: db, WORDPRESS_DB_USER: root, WORDPRESS_DB_PASSWORD: "${PW}", WORDPRESS_DB_NAME: wp }
services:
  db:  { image: "mariadb:11", pull_policy: never, environment: { MARIADB_ROOT_PASSWORD: "${PW}", MARIADB_DATABASE: wp }, volumes: ["db:/var/lib/mysql"] }
  web: { image: "wordpress:apache", pull_policy: never, depends_on: [db], ports: ["127.0.0.1:${PORT}:80"], volumes: ["webroot:/var/www/html"], environment: *db }
  cli: { image: "wordpress:cli", pull_policy: never, depends_on: [db], entrypoint: ["wp"], user: "33:33", environment: *db,
         volumes: ["webroot:/var/www/html", "${D}/install:/dist", "${IMAGES}:/src-images:ro"] }
volumes: { webroot: { name: "${P}_webroot" }, db: { name: "${P}_db" } }
YML
DC="docker compose"                                                                   # project and file come from COMPOSE_PROJECT_NAME / COMPOSE_FILE
ROOT="docker run --rm -i --pull never --user 0:0 -v ${P}_webroot:/var/www/html wordpress:cli"   # restore --root-runner (not the apache image: it copies wp-content into an emptied volume)
WP="$DC -p \"$P\" -f \"$D/compose.yml\" run --rm -T cli"                               # --wp, www-data, same webroot; -p/-f spelled out: the runner names its kept container from them, else from the cwd (one shared name = another stand's webroot)
$DC up -d --pull never db web
# TCP only: the image's init server listens on its socket, then restarts as the real one
for i in $(seq 60); do $DC exec -T db mariadb-admin ping --protocol=tcp -h127.0.0.1 -uroot -p"$PW" --silent && break; sleep 2; done
$DC exec -T db mariadb-admin ping --protocol=tcp -h127.0.0.1 -uroot -p"$PW" --silent
# restore the SAME immutable seed (db user root, name wp, password $PW); the pack must carry pretty permalinks (/%postname%/ + .htaccess) — plain ones answer every /<slug>/ route with the front page
node scripts/quickstart/restore.mjs --pack "$SEED" --root-runner "$ROOT" --wp "$WP" --site-url "$URL" \
  --db-host db --db-password-env PW --wipe --offline-checksums --report "$D/restore.json"
# restore leaves a fleet-like root-owned webroot; this stand is a build stand, so hand it to www-data for theme installs
$ROOT chown -R 33:33 /var/www/html
rm -f "$D/seed/theme.sha256" "$D/seed.json"   # the restored webroot has no theme: seed's "zip unchanged" shortcut must not fire
```
<!-- recipe:stand-end -->

Tear a stand down with `P=… D=… PORT=… PW=… IMAGES=… docker compose -p "$P" -f "$D/compose.yml" down -v` — the same variables: the volume names interpolate `${P}`, and without it `down -v` leaves them behind.

**2 · Build, seed, contract** — re-run from here (not step 1) after every change to the group's files or a rebased shared baseline. Build in
`$PKG`, install through `/dist` (`$D/install`, never `$PKG/dist`), seed — one command; the contract is regenerated after EVERY seed that
follows a build (the served template and the seed report move). With `G` the contract is the GROUP's own: written under the group's
dossier `$D`, bound to THIS stand (its site URL, its seed report, its built zip, its spec copy), holding exactly `GP`, with `group.id`
in its identity; without `G` it is the site's. A group contract never closes a checkpoint or a release (`round.mjs`, `release.mjs` refuse it).

<!-- recipe:build-seed -->
```bash
set -euo pipefail
: "${SKILL:?} ${PKG:?} ${S:?} ${D:?} ${P:?} ${PORT:?} ${PW:?} ${SLUG:?}"
export PW PORT PKG D P COMPOSE_PROJECT_NAME="$P" COMPOSE_FILE="$D/compose.yml"
cd "$SKILL"
URL=http://127.0.0.1:$PORT
WP="docker compose -p \"$P\" -f \"$D/compose.yml\" run --rm -T cli"
node scripts/seed.mjs --spec "$S/spec" --wp "$WP" --theme "$SLUG" --patterns-map "$PKG/overlays/$SLUG/patterns.map.json" \
  --images /src-images --base-url "$URL" --theme-src "$PKG" --dist "$D/install" --out "$D/seed" --report "$D/seed.json"
[ -z "${POST_SEED:-}" ] || node "$POST_SEED"   # optional site-specific step between the seed and its contract (the contract reads $D/seed.json); unset on a plain site
PAIRS=(); [ -n "${SOURCE_SITE:-}" ] && PAIRS=(--source-site "$SOURCE_SITE")   # the source origin is independent of pairs.json
[ -f "$S/pairs.json" ] && PAIRS+=(--pairs "$S/pairs.json")                          # …which only maps routes that differ
[ -n "${SOURCE_DARK_HOOK:-}" ] && PAIRS+=(--source-dark-request-hook "$SOURCE_DARK_HOOK")   # how a live source is put into dark, e.g. cookie:<name>=dark
GROUP=(); [ -n "${G:-}" ] && GROUP=(--group "$G" --pages "${GP:?}")
node scripts/visual/contract.mjs init --run-root "$D" --spec "$S/spec" --config "$S/review.config.json" \
  --theme "$PKG/overlays/$SLUG" --site "$URL" --built-theme "$PKG/src/$SLUG" --routes "$D/seed.json" --artifact "$D/install/$SLUG.zip" \
  ${GROUP[@]+"${GROUP[@]}"} ${PAIRS[@]+"${PAIRS[@]}"}
node scripts/visual/contract.mjs --run-root "$D" --spec "$S/spec" --routes "$D/seed.json" \
  --artifact "$D/install/$SLUG.zip" --built-theme "$PKG/src/$SLUG"                      # validate; non-zero = do not measure
```
<!-- recipe:build-seed-end -->

**3 · Measure** — all four stages named and the three binding paths on EVERY run (without them a changed artifact or seed report, or a
served template outside the built theme, is not detected). A group contract holds only the group's pages, so the full scope IS the group's
complete measurement; exit 1 = findings, which the verdict (step 4) judges. `N` numbers the run. HTTP parity is the next block (3b): only
`url`/`html` pages have one.

<!-- recipe:measure -->
```bash
set -euo pipefail
: "${SKILL:?} ${PKG:?} ${S:?} ${D:?} ${PORT:?} ${SLUG:?} ${N:?}"
cd "$SKILL"
SRC=(); [ -n "${SOURCE_SITE:-}" ] && SRC=(--source-site "$SOURCE_SITE")   # a request hook (cookie) needs the source over http, not file://
node scripts/visual/visual-qa.mjs --contract "$D/visual.contract.json" --site "http://127.0.0.1:$PORT" --out "$D/runs/$N" ${SRC[@]+"${SRC[@]}"} \
  --spec "$S/spec" --artifact "$D/install/$SLUG.zip" --seed-report "$D/seed.json" --theme "$PKG/src/$SLUG" \
  --patterns-map "$PKG/overlays/$SLUG/patterns.map.json" --stage light-desktop,light-responsive,dark-desktop,dark-responsive || [ $? -eq 1 ]
```
<!-- recipe:measure-end -->

**3b · HTTP parity** — per page, by its EFFECTIVE `reference.kind` (page entry over the pack default, [`inputs/spec-pack.md`](inputs/spec-pack.md) §3): `url` and `html`
pages have an HTTP source, `image`/`none` pages have none. `group-pages.mjs` derives ONE route plan from the group contract — per page the seeded path (where this
stand serves it, e.g. `/our-team/` for a page-map `/team`), the kind and the source route (`html`: the exported file; `url`: the pair's route, else the same path) — and
writes `routes-<kind>.json` + `pairs-<kind>.json` in the formats `http-parity.mjs` takes, `route-plan.json` (the whole group's plan) and `group-pages-<kind>.json` (the complete result of this kind); its default output is one summary line naming that last file, and `--json` prints the same result — `{kind, pages, routes, pairs, plan, files}`, where `pages` are the seeded paths `--pages` takes. The block runs ONE `http-parity.mjs` per kind present →
`parity-$N-html.json` / `parity-$N-url.json`; `SOURCE_SITE` = the source origin (for `html`, whatever serves the exported files). The verdict requires the SEEDED path measured: a
report of the obsolete page-map path is no evidence, and so is a row read from another source route than the plan's, or (`url`) from another origin than the contract's `source.site`.
A route that two pages answer to (page-map path of one = seeded path of another), or a page-map path listed twice, fails the plan (exit 2). Exit 1 = a failing route, which the verdict judges. A group of `image`/`none` pages only writes no file and the verdict needs none.

<!-- recipe:parity -->
```bash
set -euo pipefail
: "${SKILL:?} ${S:?} ${D:?} ${PORT:?} ${N:?}"
cd "$SKILL"
ACC=(); [ -f "$S/parity-accepted.json" ] && ACC=(--accept "$S/parity-accepted.json")
mkdir -p "$D/runs"; rm -f "$D/runs/parity-$N"-*.json
for KIND in html url; do
  HP=$(node scripts/visual/group-pages.mjs --contract "$D/visual.contract.json" --spec "$S/spec" --kind "$KIND" --out-dir "$D/runs/plan-$N" --json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).pages.join(",")')
  [ -n "$HP" ] || continue
  SNAP=(); [ "$KIND" = html ] && SNAP=(--source-snapshot "$S/spec")
  node scripts/http-parity.mjs --source "${SOURCE_SITE:?}" ${SNAP[@]+"${SNAP[@]}"} --routes "$D/runs/plan-$N/routes-$KIND.json" --pairs "$D/runs/plan-$N/pairs-$KIND.json" \
    --target "http://127.0.0.1:$PORT" --pages "$HP" ${ACC[@]+"${ACC[@]}"} --out "$D/runs/parity-$N-$KIND.json" || [ $? -eq 1 ]
done
```
<!-- recipe:parity-end -->

**4 · Verdict** — the script closes the group, never a reading of the reports. Exit 0 = `done`; 1 = `open`; 3 = `incomplete` (missing, stale or
another group's/stand's evidence: measure again); 2 = bad input. The block passes one `--parity` per file step 3b wrote (`parity-$N-<kind>.json`) and `--accept` when
`parity-accepted.json` exists; a `url`/`html` page without its parity file is `incomplete`, never `done`. `--site` and `--contract` are mandatory: the group's own stand and the very
canonical contract file the run measured against. A report or a parity run measured at another origin, a copy of the contract, or an `attempts/` contract is `incomplete`.

<!-- recipe:verdict -->
```bash
set -euo pipefail
: "${SKILL:?} ${S:?} ${D:?} ${SLUG:?} ${N:?} ${G:?} ${GP:?}"
cd "$SKILL"
PAR=(); for F in "$D/runs/parity-$N"-*.json; do [ -f "$F" ] && PAR+=(--parity "$F"); done; [ -f "$S/parity-accepted.json" ] && PAR+=(--accept "$S/parity-accepted.json")
node scripts/visual/group-verdict.mjs --group "$G" --pages "$GP" --spec "$S/spec" --visual "$D/runs/$N" --contract "$D/visual.contract.json" \
  --site "http://127.0.0.1:${PORT:?}" --artifact "$D/install/$SLUG.zip" --seed-report "$D/seed.json" --config "$S/review.config.json" \
  ${PAR[@]+"${PAR[@]}"} ${SEVERITY:+--severity "$SEVERITY"} --out "$D/runs/verdict-$N.json"
```
<!-- recipe:verdict-end -->

**5 · Merge** (coordinator, once every group is `done`) — `group-merge.mjs` brings each group's spec records and owned files back into the
main worktree. `BASE` is the immutable baseline worktree every group was cut from, `MAIN` the main worktree, `MANIFEST` the ownership split
(`group-merge.mjs` header: `roots`, `records`, `frozen`, per-group `owns`), `GROUP_TREES` one `<id>=<worktree>` per line. Spec/content records merge by record id (two groups on one
record = a named refusal, even to the same value), theme files by declared ownership (a file the group does not own, or a frozen shared file = refusal),
baseline drift and unsafe paths refuse; nothing is written until every rule passed, and `merge-report.json` is the one report (groups, records, files, no-op
groups, conflicts). The atomically published report IS the commit: a failure before it restores every file and the earlier report; one after it keeps the merge and only
leaves the lock, which `--recover --main "$MAIN"` releases without reverting. `--recover` refuses every live owner and never takes over an abandoned recovery claim (compare main with
the backups in `$MAIN/.group-merge`, repair by hand, remove the directory). Records and frozen paths outside every root are refused, since an edit there would never be compared.
`spec-pack.mjs --validate` runs on the merged spec afterwards.

<!-- recipe:merge -->
```bash
set -euo pipefail
: "${SKILL:?} ${BASE:?} ${MAIN:?} ${MANIFEST:?} ${MERGE_REPORT:?} ${GROUP_TREES:?}"
cd "$SKILL"
GA=(); while IFS= read -r kv; do [ -z "$kv" ] || GA+=(--group "$kv"); done <<<"$GROUP_TREES"
node scripts/visual/group-merge.mjs --manifest "$MANIFEST" --base "$BASE" --main "$MAIN" "${GA[@]}" --report "$MERGE_REPORT"
```
<!-- recipe:merge-end -->

**6 · Integration** (coordinator, main stand) — ONE build, deploy and seed (step 2 without `G`, on the merged spec and theme), then the full
four-stage checkpoint on the site's own contract through `round.mjs`'s one-round full scope. `$D/round.json` names the main dossier's paths; group
evidence never stands for this checkpoint.

<!-- recipe:integration -->
```bash
set -euo pipefail
: "${SKILL:?} ${PKG:?} ${S:?} ${D:?} ${PORT:?} ${SLUG:?}"
cd "$SKILL"
SRCSITE=""; [ -n "${SOURCE_SITE:-}" ] && SRCSITE="\"sourceSite\": \"$SOURCE_SITE\", "   # the source over http, as in step 3
cat > "$D/round.json" <<JSON
{ "runRoot": "$D", "evidence": "$D/evidence", "site": "http://127.0.0.1:$PORT", ${SRCSITE}"spec": "$S/spec", "theme": "$PKG/src/$SLUG",
  "artifact": "$D/install/$SLUG.zip", "seedReport": "$D/seed.json", "patternsMap": "$PKG/overlays/$SLUG/patterns.map.json",
  "stages": ["light-desktop", "light-responsive", "dark-desktop", "dark-responsive"] }
JSON
node scripts/visual/round.mjs --config "$D/round.json" --name integration --scope full --skip-deploy
```
<!-- recipe:integration-end -->

**Group loop** (foreground subagent; the recipe's variables plus `GP`). Repeat until closed:

1. Re-run step 2 after every change to the group's files or a rebased shared baseline. A stale contract (`bindings`) is refused by the runner — never edit around it.
2. Parity (step 3b): run the recipe block as written — it asks `group-pages.mjs` for the route plan (kind per page — a page entry over the pack
   default —, the seeded path, the source route), runs one `http-parity.mjs` per kind with the generated routes/pairs and `--accept "$S/parity-accepted.json"`, and writes
   `$D/runs/parity-<n>-<kind>.json`. No hand-built route lists: an ambiguous plan or a listed page no route reaches exits 2. `image`/`none` pages have no HTTP source — Visual QA is
   the measure, and the handoff says so.
3. Step 3 (Measure). Interim measurements may target the touched pages with `--pages <ids>` (targeted evidence, never a closure).
4. Fix by cluster under [`SKILL.md`](../SKILL.md) §Done rule, then back to 1. **After the group's LAST change, one complete group
   measurement** (step 3 over the whole group contract, parity over the whole page set, same generation): a build or seed can move a page the fix did
   not name. `round.mjs --watch --pages` is not a path (`--watch` dispatches before parsing `--pages`); a
   `--pages` report is targeted evidence for the group and never closes the release gate (`visual-qa.mjs` §Scopes).
5. Close the group with step 4.
   - Run status is the Visual QA run's own: four stages ran, no axis `measured:false`, no `summary.intrinsic.blocking`.
   - Staleness is judged against the GROUP's own bindings: the report's contract hash and the group contract's `bindings` (the group's spec copy,
     page-map, ITS seed report, ITS built zip, `review.config.json`) must match the files now, and `parity-accepted.json` must be the one the parity run
     used. The contract must be this group's (`group.id`), hold exactly `GP`, and the report's `identity.group` must say the same — the main stand's
     contract, another group's, or a report of another stand is `incomplete`. Any change to one of the bound files = stale = step 2 again, then measure again.
   - Parity scope is per page by its EFFECTIVE `reference.kind` (page entry over the pack default,
     [`inputs/spec-pack.md`](inputs/spec-pack.md) §3): only `url`/`html` pages need `--parity` and a route; an
     `image`/`none` page needs neither, and a mixed group sends only its `url`/`html` pages to `http-parity.mjs`.
   - Exceptions: a failing cluster or route is accepted only when `severity.json` names it `minor` AND cites an S-/D-number
     (`{"<cluster id | parity:/path>": {"severity": "minor", "reason": "…", "exception": "S-12"}}`, SKILL.md §Done rule);
     a severity label alone leaves it open. The named exception goes in the store its tool reads, with a decision:
     HTTP parity → `$S/parity-accepted.json`; Visual QA →
     `$S/review.config.json` `visual.exceptions[]` with `decision` (copied into the contract by `init`; one typed
     into the contract itself is lost at the next `init`). When either store changed, re-run step 2 and the complete
     measurement: an exception counts only once a current report lists it under accepted. Anything but `done`
     is reported as it is, never as completion.

**Handoff** (required, else the group is not done): the `group-verdict.mjs` status and its `verdict.json` path; pages completed; clusters closed and accepted (ids) with the
entries added to each exception store; files changed **and spec paths + record ids changed**; evidence paths (each report's artifact, seed-report and theme identity, the parity inputs used);
start and end UTC; elapsed minutes. Missing evidence, incomplete axes, a stale generation, unresolved contract
inputs or a no-progress pass (Done rule §3) is needs-decision, never completion.

**Integration** (coordinator): when every group's handoff is `done`:

1. Step 5 (merge): `group-merge.mjs` merges the groups' records and owned files into the main worktree and writes the report; a refusal
   (same record, unowned or frozen file, drift) goes back to the groups or the coordinator — never last-writer-wins, never a manual
   merge. A group file the coordinator itself must change (frozen shared files) is applied by the coordinator in the main worktree
   BEFORE the groups are cut, or as one batched change after which every group rebases and re-measures.
2. Step 6: build, deploy and seed ONCE on the main stand, spot-check that each group's content fix and owned file are served, then the full
   four-stage checkpoint on the main contract (all pages) and the final Opus lens pass.
3. A fix after that checkpoint — only a regression the merge caused — changes the generation: re-seed, `init`, and
   measure **what the fix reaches** (`recheck.mjs --changed`, or `round.mjs --pages` for the pages its cluster names; a
   change that reaches every page fails closed to a full run by itself, [`SKILL.md`](../SKILL.md) §Build loop). Do not
   repeat the full-site checkpoint on the main stand: the release gate is the complete four-stage checkpoint Phase 10
   measures on the stand restored from the pack, at the current generation ([`quickstart.md`](quickstart.md) §Five phases,
   bound to the pack and zip by `release.mjs`), never a group report and never a build-stand run. Then Phases 9–10.
   Measured on ja-restaurant (21/10/2026): full-site 1 and full-site 3 on the main stand took 28 min each, and the
   restored-stand checkpoint measured the same generation again (33–40 min).
4. A fix after the restored-stand checkpoint packs, restores and measures that stand in full again: the release
   pack's last pass is always full.

**Full measurements.** On the main stand's ledger the clean path is two, as `round.mjs` counts them: the baseline and
one integration checkpoint (merge regressions and the Opus lens). The release checkpoint on the restored stand is
measured with its own round config (`site` = the restored stand, `artifact` + `pack`) and its own evidence dir and
ledger, so it is not a third full run of the build loop and needs no reason. Integration fixes are measured where
they reach and add none; a fix after the release checkpoint repacks, restores and measures that ledger again. Everything between is
per-group measurement. Record each group's start/end UTC in `STATUS-log.md` (the `Now` block of `STATUS.md` keeps only
the current state, at most 40 lines).

## Model per role

A subagent runs on the dispatcher's model unless the dispatch names another one. The tool runs
(visual-qa, recheck, Chromium shots) cost no tokens. The tokens go to agents that read tiles, reports and
logs, and to agents that reason about fixes. Pick the model by role. **Two roles were measured**: the
layout lens and the coding worker (§Measurement — coding worker). Every other line below says whether it
rests on a measurement.

| Role | Model | Basis |
|---|---|---|
| Layout lens chunks (`notes.mjs plan … --lens layout`) | **the port's model (Sonnet 5.5)**; one **Opus 5.5** pass at the final checkpoint before release | measured on Nova (§Measurement — Nova layout lens, Sonnet vs Opus): Sonnet 70/82 real, Opus 58/82, union 80/82. Earlier measurement (JA Vega, below): Haiku misses most differences and swaps site and source; Sonnet finds 24/29 known, gpt-6-luna 15/29 known |
| Colour lens chunks (`--lens color`) | **main model** | not measured; the layout result gives no reason to expect better |
| First-pass finding classification (real / tool false positive / accepted) | **main model** | not measured; it needs the same judgement Haiku got wrong in the lens (which side has what) |
| Long-run watcher: run a command, wait, report the exit code and the tool's own summary lines | **Sonnet 5.5** | not measured; decided 21/10/2026 for cost (no judgement in the role). Not Haiku: the only measured Haiku role fell short |
| Page-build and CSS-fix subagents (same checks) | **Sonnet 5.5** (effort medium) acceptable | measured (§Measurement — coding worker) |
| Cross-module or integration fix decisions (seeder/spec, shared files, tools) | **main model** | not measured; the change is the product |

**How to pass the model.** Agent tool: `model: "haiku"` for Haiku; leave `model` out to inherit the main
model. CLI fan-out: `claude -p --model haiku` for Haiku; for the main model, pass the dispatcher's own model
by name (`claude -p --model 'opus[1m]'` when the dispatcher runs `opus[1m]`, as the coding-workflow worker
does). A bare `claude -p` runs the CLI default, which may be a model nobody measured. The word `inherit`
means "the dispatcher's model": leave `model` out of the Agent tool, name that model to the CLI. Never
hand the word itself to a CLI or to the Agent tool as a model name. `notes.mjs plan` writes
the recommendation into the manifest (`recommendedModel`: `haiku`, `sonnet` or `inherit`, part of the manifest id)
and onto line 2 of every chunk prompt (`Model: …`), so the dispatcher does not need this page to choose.
A manifest planned before the field existed, or one with any other value, reads as `inherit`.
The recommendation lives in `scripts/visual/lens-work.mjs` `RECOMMENDED_MODEL`; change it only with a new
measurement of that lens.

### Measurement — Nova layout lens, Sonnet vs Opus (30/09/2026)

Nova checkpoint, 4 chunks, 82 known differences. Sonnet 5.5 found 70/82 real (1 finding not real), $2.12,
466 s. Opus 5.5 found 58/82, $4.00, 1000 s. The union covers 80/82. So the layout lens runs on the port's
model (Sonnet 5.5) at every checkpoint, and one Opus pass is added at the final checkpoint before release.
This supersedes the layout-lens recommendation of the Vega measurement below, which tested Haiku and
gpt-6-luna against a 29-difference reference and did not include this Sonnet-versus-Opus comparison.
`RECOMMENDED_MODEL.layout` in `scripts/visual/lens-work.mjs` is `sonnet` since 21/10/2026: until then it stayed
`inherit`, and line 2 of every layout chunk prompt sent an Opus dispatcher's chunks to Opus.

### Measurement — Haiku, Opus, Sonnet and gpt-6-luna on the same layout chunks (28/09/2026)

JA Vega M6, checkpoint `m6c/cp1`, tiers light-desktop (117 tiles) and dark-responsive (152 tiles). Each tier
was planned with `--lens layout --chunks 2` and gave the same groups, chunks and tile bytes as the recorded
run. The same four prompts went to `claude -p --model haiku` (claude-haiku-4-5-20251001) and
`claude -p --model opus` (claude-opus-5-5): one call per chunk and model, run one after the other. Each
call could read only the tier's tiles and write only its own chunk file. There were no user
settings, hooks or MCP, and a 600 s limit.

The reference is the recorded layout lens of that checkpoint (Opus subagents in the M6 run), split into
78 differences (42 + 36). 29 of them are tied to a decision or gap in TCH `tasks/ja-vega-wp7` (D-31 G6,
G46, G67 and G69, D-16, D-19, D-29 G60, D-30 G68 and M6-6). `release/VISUAL-QA.json` (TCH `73632080`)
describes M5b and counts machine findings. Its layout-visible rows (registration form, profile) are in
the 29. A row that is not in the reference is "Real" only after a tile check; otherwise it stays
"Unverified". "Sides swapped" means the right spot with site and source reversed: the Fix would remove
what the source has.

| Tier | Model | Valid chunks | Found / reference | Missed | Invented | Sides swapped | Real, not in reference | Unverified | Wall | Tokens (CLI) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| light-desktop | haiku | 0/2 | 5/42 | 37 | 0 | 4 | 0 | 0 | 4 min 0 s | 1124k in / 20k out · $0.60 |
| light-desktop | opus | 2/2 | 38/42 | 4 | 0 | 0 | 0 | 3 | 13 min 25 s | 2011k in / 32k out · $3.14 |
| dark-responsive | haiku | 2/2 | 7/36 | 29 | 0 | 1 | 2 | 1 | 6 min 16 s | 1036k in / 28k out · $0.51 |
| dark-responsive | opus | 2/2 | 34/36 | 2 | 0 | 0 | 0 | 9 | 10 min 47 s | 1338k in / 38k out · $2.12 |
| light-desktop | sonnet | 1/2 | 16/42 | 26 | 0 | 0 | 0 | 0 | 7 min 34 s | 2017k in / 41k out · $1.88 |
| light-desktop | gpt-6-luna | 0/2 | 7/42 | 35 | 0 | 0 | 0 | 1 | 15 min 47 s | 1277k in (1034k cached) / 6k out (2k reasoning) · no cost reported |
| dark-responsive | sonnet | 2/2 | 18/36 | 18 | 0 | 0 | 0 | 0 | 7 min 57 s | 1743k in / 43k out · $1.35 |
| dark-responsive | gpt-6-luna | 0/2 | 16/36 | 20 | 0 | 0 | 0 | 2 | 13 min 8 s | 205k in (143k cached) / 3k out (2k reasoning) · no cost reported · 1 chunk(s) not reported |

- **Haiku, layout lens: not fit.** It found 12 of the 78 differences, and only 10 of the 29 known
  ones. It missed every spacing, alignment and wrapping difference. Only whole missing blocks came back:
  share row, registration form, filter bar, pager controls. On 5 rows it described the source's elements
  as the site's additions (author share buttons, category pager, "Advanced Search"), so the Fix column
  asked to remove what the source has. 2 of its 4 chunks would not merge. One listed 30 of its 59 tiles
  under `## Opened` although it read all 59. The other never read 2 tiles. It found 2 real differences
  the reference lacks (login-form asterisks and the password eye icon).
- **Opus: 72 of 78, all 29 known, 4 of 4 chunks whole.** It missed the header toggle offset, the
  spinner pitch, a team-section padding, the post-page nav state, one contact-card gap and one footer
  padding.
- **Cost of the difference.** Haiku took 10 min 16 s and $1.11 for the four chunks; Opus took 24 min 12 s and
  $5.26 (CLI `modelUsage`, list prices; tile images are most of the input either way). To save tokens,
  read fewer tiles (the sampling in `visual-qa.md` §Lens work). Do not move the lens itself to
  Haiku.
- **Sonnet (claude-sonnet-5, `claude -p --model sonnet`, same Read/Write confinement as Haiku and Opus):
  34 of 78, 24/29 known, 3 of 4 chunks whole, no sides swapped, nothing invented.** It missed the known
  source 404 without chrome (D-19), the empty stat-card icons in both tiers (D-31 G69), the profile help
  links (D-29 G60) and the missing registration form at 390 px (D-30 G68). One light-desktop chunk never
  read 2 of its 59 tiles. It took 15 min 31 s and $3.23 for the four chunks (CLI `modelUsage`). That is
  $2.03 less than Opus for fewer than half of Opus's finds (34 against 72), so it does not take the lens.
- **gpt-6-luna (`codex exec -m gpt-6-luna`): 23 of 78, 15/29 known, 0 of 4 chunks whole, no sides
  swapped, nothing invented.** The tiles went in as `--image` attachments, every tile of a chunk in one
  call and in prompt order (76 images in one call worked), with the attachment order appended to the same
  prompt. The stream names no model, so only the requested `-m gpt-6-luna` is known. Each chunk is
  invalid: every call read outside the tiles and its work dir (its own `~/.codex/skills` or
  `~/.agents/skills/coding-workflow/SKILL.md`; not the reference), one output's `## Notes` table has no
  separator line, and the last dark-responsive chunk was cut off after 7 min when the measuring process
  stopped. That chunk was graded from the file it had written (75 of 76 tiles under `## Opened`) and not
  run again. Codex reports tokens, not cost; the table gives no price for it, and the cut-off chunk
  reported no usage. Codex cannot be named to the Agent tool or to `claude -p` either.
- A model takes the layout lens only when it finds all 29 known differences, with 4 of 4 chunks whole and
  no sides swapped. No candidate met that bar, so `RECOMMENDED_MODEL` stays `inherit`.
- The finding is for the layout lens on one site and one checkpoint. It does not transfer to the colour
  lens or to other roles. Every role stays on the main model until a measurement like this one, run for
  that role, shows a candidate model meets the same bar there: every known real difference found, every
  chunk whole, no sides swapped (the coding worker is measured separately below; the long-run watcher moved
  to Sonnet by decision on 21/10/2026, §Model per role). Quote a model name
  with brackets in a shell (`'opus[1m]'`): zsh reads `[1m]` as a glob.

### Measurement — coding worker (30/09)

Three merged skill fixes re-run from their pre-fix tree; target tests given up front, no test edits;
graded by target tests plus full suite against baseline.

| Worker | Correct | Wall | Cost |
|---|---:|---:|---:|
| Opus 5.5 | 2/3 | 37 min | $10.65 |
| Sonnet 5.5 (effort medium) | 2/3 | 53 min | $5.24 |

## Visual QA fix round — one ownership model

After the pilot, fixing is split by **page group** (§Parallel page groups): each group writes its own `notes/fix-<group>.md`
(`notes.mjs merge` reads `fix(-<group>)?.md`) and seeds + measures on its own stand. There is no second split by file
type across the whole theme. One agent for all 700 todos (run of 14/09) was three times slower and no safer.

