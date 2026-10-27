# Flow D (Apply): running the TC set with run3.mjs on three Apply sites

A bridge so `bench/run3.mjs` can run the flow D cases (9 `M-D-*` cases + 18 cases reused via `selection.mjs` `addFlow`) on:
`benchwpapply01` (WordPress) · `benchjoomlaapply01` (Joomla) · `benchemdashapply01` (EmDash). Every file here is NEW.
No file in `bench/` is modified, and run3 does not write to `bench/`.

Paths below that belonged to the original measuring machine are shown as placeholders: `<bench-dir>` is the bench checkout, `<snap-dir>` the snapshot folder, `<bench account>` the bench sign-in account.

## What's here

| File | Job |
|---|---|
| `answers-{wordpress,joomla,emdash}.json` | Site questions answer sets `{answers, questionnaire}` (Q2 Golden Crust for WP/Joomla, Q1 Red River for EmDash) |
| `create-site.sh <cms>` | Creates one D site via `apply-bench/bench-init.mjs` (account <bench account>, `--keep`), saves `create-<label>.json`, `create-<label>.questions.json` (the question set the stand is serving), `create-<label>.brief.json` (the `site_brief` row). Refuses if the label already exists, or if the stand serves a question set with a different hash |
| `derive-d.mjs <label> <cms>` | `keys-<label>.json`: every key that CMS's flow D cases use (45) + `home`, `h1key`, `dAddress`, `dHiddenPage`. A key that can't be derived = `"—"` plus a line in `reasons` |
| `build-suite.mjs <cms> <label>` | `cases-d-<cms>.json` = `{sites:{<label>:{platform,…keys}}, cases:[flow D cases of cases-tc-<cms>.json, unchanged]}`; `"—"` becomes `null` so run3 marks that case **n/a** (rather than running it with a dash). Also writes the keys into `runner/sites-v6.json` so snap.sh can compare digests. Prints ids by P0/P1, `needs`, which cases are n/a, and the oracle lint |
| `runner/` | "Farm": symlinks to the bench's `run3.mjs oracle.mjs derive.mjs turn-v5.mjs trace.mjs card-answer.mjs snap.sh trace-summary.mjs analyze.mjs compare.mjs v6/ fixtures/`. Two REAL files: `cookie.txt` (fresh session) and `sites-v6.json` |
| `make-farm.sh` | Rebuilds the symlinks (does not touch the real files in `runner/`) |
| `mint-cookie.sh` | Mints a <bench account> session in `tracy-tracy-web-1` (`mintSession` + `SESSION_SECRET`, like bench-init) → `runner/cookie.txt`, then tries `/auth/me`. `bench/cookie.txt` is neither read nor written |
| `run-d.sh <label> <P0\|P1\|all\|ID,…> [name]` | Runs run3 from the farm with the right environment variables (below) → `out-<label>-<name>/` + `.log` |
| `summarize-d.mjs <out> [--vs <other out>] [--json]` | PASS/FAIL/n/a table by P0/P1, with agent seconds, step count, budget, failed checks |
| `validate-a.mjs <label> <cms>` | Compares the keys derived on site A with column A of the TC key table (values in `sites-v7.json`) |
| `validate/` | Check evidence: `keys-benchwp02.json`, `keys-benchjoomla02.json`, `keys-offline-wp-apply-home.json`, the downloaded pages |

## Running the farm correctly (read first)

run3 computes `HERE` from `import.meta.url`. Running `runner/run3.mjs` without preserving symlinks makes `HERE` = `bench/`: it reads `bench/cookie.txt` (expired).
**You must use `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`, not command-line flags.** run3 spawns a child process
`node runner/trace.mjs <case>`, and only `NODE_OPTIONS` is passed down to the child. With flags only, trace.mjs's main block does not
run (`import.meta.url` differs from `argv[1]`), so **there is no trace.json, and no error** (measured: with NODE_OPTIONS trace.json + trace.md are written, with flags only they are not).
`run-d.sh` already sets this variable. The out folder must be an absolute path: run3 creates it relative to the cwd.

## Sequence (WordPress first; Joomla and EmDash are identical, just change `wordpress`→`joomla|emdash` and the label)

```bash
cd <bench-dir>/tc-run/d
./mint-cookie.sh                      # when the old session has expired (run3 reports "RUNNER: signed out")

# 1. Create the site — one site at a time, not in parallel, not while the machine is measuring site-creation time
./create-site.sh wordpress            # → benchwpapply01 (EmDash: emdash → benchemdashapply01; Joomla: joomla → benchjoomlaapply01)

# 2. Check the brief row: state MUST be applied (create-site.sh checks this itself, exits 3 otherwise). To check by hand:
docker exec tracy-postgres-1 psql -U tracy -d tracy -Atc \
  "select state, stage, error, normalized->'languages' from site_brief where site_key='benchwpapply01.tracy.test'"
#    and in create-benchwpapply01.questions.json: set.contentHash must equal questionnaire in answers-wordpress.json

# 3. Derive keys (read-only: HTML, one headless Chromium, SELECT on that site's own DB)
node derive-d.mjs benchwpapply01 wordpress           # → keys-benchwpapply01.json; prints each "—" key with its reason

# 4. Build the suite (writes cases-d-wordpress.json + runner/sites-v6.json)
node build-suite.mjs wordpress benchwpapply01

# 5. Snapshot (AFTER step 4, so home.digest is recorded and every restore is checked for drift)
BENCH_SNAP=<snap-dir> NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" \
  <bench-dir>/tc-run/d/runner/snap.sh save benchwpapply01
#    Joomla/EmDash: … snap.sh save benchjoomlaapply01 / benchemdashapply01  (EmDash: snap.sh stops and restarts the web container)

# 6. Run P0 on one site
./run-d.sh benchwpapply01 P0 base     # → out-benchwpapply01-base/ and out-benchwpapply01-base.log
#    equivalent raw run3 command (21 P0 cases, the same on all three CMSs):
NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" BENCH_SNAP=<snap-dir> \
  node runner/run3.mjs benchwpapply01 "$PWD/out-benchwpapply01-base" \
  "M-L1-heading-chat,M-L1-heading-pick,M-L1-button-keep-link,M-L2-trim-chat,M-L2-add-sentence-pick,M-L3-new-page-menu,M-L2-card-title,M-L2-img-chat,M-L2-menu-label,M-L1-seo-title,M-L1-ask,M-L3-form-toggle,M-L4-undo-one-of-two,M-L2-style-one-button,M-L3-color-sitewide-except,M-L2-hide-mobile,M-L1-copyright,M-D-ask-before-invent,M-D-revert-apply-batch,M-D-second-language,M-D-change-typed-fact" \
  --suite ../cases-d-wordpress.json --timeout-min 12 --trace
#    P1: ./run-d.sh benchwpapply01 P1 base-p1   (5 cases; EmDash also has M-D-sector-tone = 6)

# 7. Summarise
node summarize-d.mjs out-benchwpapply01-base [--vs <out folder of the A run with the same cases>] [--json]
node <bench-dir>/trace-summary.mjs out-benchwpapply01-base [--json]   # speed by role × level × CMS from trace.json; read-only
```

Two bench tools **do not read TC ids**:
- `analyze.mjs <out-dir> [--json]` (writes `<out-dir>/analysis.json`) only picks case folders matching `^(C\d+|V[456]-…)$`, so for `M-*` it returns nothing.
- `compare.mjs <before-dir> <after-dir> [--md out.md] [--suite <file, relative to compare.mjs's folder>]` relies on that analysis.json, so it also returns nothing.

Use `summarize-d.mjs --vs` instead of these two tools.

## Which paths leave the farm

- **Writes:** `out-<label>-*/` (absolute, in `tc-run/d/`) · `$BENCH_SNAP/<label>/` (`<snap-dir>`) · `/tmp` (oracle/picture) ·
  the site being measured (DB restore + site folder, EmDash container) · that site's own `site_write_lease` row · `runner/.locks/`, only when `RESTORE_LOCK=1`.
  This lock is **not** shared with other runners' `bench/.locks`, unless you set `RESTORE_LOCK_DIR=<bench-dir>/.locks` yourself
  (in which case it writes into bench/). **Nothing is written to `bench/`.**
- **Read through symlinks (read-only):** the bench's modules, `v6/`, `fixtures/` · `tc/lib.mjs` + `tc/cases/*.mjs` (for the tier) · `tc/cases-tc-*.json`.
- **If you forget NODE_OPTIONS:** HERE = `bench/`, so it reads `bench/cookie.txt`, the lock lives in `bench/.locks`, and the bench's snap.sh reads `bench/sites-v6.json`
  (which has no D labels, so no digest check). The suite `../cases-d-*.json` is then not found (ENOENT), so the run stops immediately rather than running wrong.

## Notes on the TC (the TC is not modified)

- `M-D-add-page-not-chosen` never PASSes: the oracle requires `has "$90"` but also `gone "$9"`, and with substring matching "$90" contains "$9". `build-suite.mjs` prints this error.
- `M-D-ask-before-invent` (P0) has `needs: ['setup']` (`status: runner`). run3 still runs it, but the TC does not say what the setup step is.
- `M-L2-card-title`: on site A (benchwp02, benchjoomla02), card titles 01–04 are repeated in the footer's Services column. The `gone` rule reads the whole page, so the case
  cannot pass unless the agent also changes the footer. So derive sets `card1/card2 = —` (n/a). The WordPress Apply page dropped that column, so on D
  this case will run. A and D differ on this case.
- `M-L3-color-sitewide-except` on WordPress: the only accent-coloured button on the Contact page is `<input type=submit value="Send request">`. The oracle finds
  elements by text, so it does not see the input; hence `thExceptBtn = —` and the case is n/a on WordPress (both A and D). Joomla has a `<button>`, so it runs.
- `dPricePage` is a **guessed path** when the site has no pricing page yet (`/pricing/`, `/en/pricing`, `/pricing`). derive marks clearly which ones are guesses.
  If the agent picks a different slug (e.g. `pricing-2`), the oracle reads the wrong page.
