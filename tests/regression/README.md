# Regression suite — `tests/regression/`

Every fixed bug and every shipped feature leaves **one case a machine can run again**. Why: the QA night of
02–03/10/2026 found 14 real bugs by hand (6 in Backup #747, 3 in #772, #774, #775, and on the morning of 03/10 two
more in #786 plus #787); nothing kept those steps, so the next change in the same area could bring any of those bugs
back without anyone noticing. This folder keeps the steps; the `Regression` gate makes adding a case part of the change.

| Path | What it is |
|---|---|
| `cases/REG-PR-<PR number>-<slug>.json` | one case, one file; the file name is **exactly** `<id>.json`. Older cases keep their `REG-NNN-<slug>.json` name |
| `results/<YYYY-MM-DD>-<commit>.jsonl` | result lines of one run |
| `catalogue.mjs` | defines the format (id grammar, file name, reading/validating cases, reading/writing results) — shared by the gate, the runner and `create.mjs`; nothing else reimplements it |
| `create.mjs` | creates a new case under the id `REG-PR-<PR number>-<slug>`; never overwrites, never renumbers |
| `run.mjs` | runner: filters cases, hands each case to the Codex CLI to run against a stand, writes results |
| `.runs/` | Codex log of each case (gitignored; result lines point here) |

## Format — why JSON, why one file per case

- **JSON, not YAML**: the `Regression` gate runs with bare `node` on a GitHub-hosted runner and installs nothing
  (like `changelog`, `description`); YAML needs a library. For readers: each file is short, and
  `node tests/regression/run.mjs --dry-run` prints a table with one line per case.
- **One file per case**: the lesson of the journal folder — with one shared file, two parallel PRs always edit the same lines.
- **New ids carry the PR number, not a "next number"** (since 04/10/2026). Before that, a new case took the number
  after the largest existing one: two branches cut at the same hour read the same largest number and both took the
  next one with two different slugs — git sees two different file names, so it does **not** report a conflict, and the
  duplicate id only surfaces after both have merged, turning the catalogue red on every PR cut afterwards (10 of the
  28 red CI runs in the CI review of 04/10/2026). Nobody can see the other branch from their own checkout, so being
  more careful cannot pick a free number. A PR number is a value GitHub hands out exactly once: a new id is
  `REG-PR-<PR number>-<slug>`, two different PRs cannot create the same id (the same slug still gives different ids),
  and a PR that reuses a slug collides on the **file name** itself — `create.mjs` refuses, git reports add/add.
- **Older `REG-NNN` cases stay as they are**: their ids, file names, result lines and every reference to them remain
  valid; nobody has to rename or re-run them. Only no new numbers of that kind are handed out: the `Regression` gate
  turns red when a diff **adds** a case with an id `REG-NNN`; **editing** an existing `REG-NNN` case keeps its id.

Fields of a case (checked by `validateCase` in `catalogue.mjs`):

| Field | Meaning |
|---|---|
| `id` | New case: `REG-PR-<PR number>-<slug>` — a positive PR number with no leading zero; slug in lowercase letters and digits joined by single hyphens (`backup-button-enabled`). The file name is exactly `<id>.json`. Older case: `REG-NNN` (file `REG-NNN-<slug>.json`). **Never pick a number yourself** — see "Adding a case" |
| `kind` | `fix` or `feat` — must match the PR type for the gate to count it |
| `title` | one line |
| `pr` | the PR that fixed / built this. With an id `REG-PR-<PR number>-…` it must **equal** the number in the id |
| `area` | area, as a path (`site-changes/backup`); `--area site-changes` matches every sub-area |
| `cms` | a subset of `wp` `jo` `em`, or `["any"]` |
| `needs` | run conditions: `stand`, `model`, `site:em`, `seat:editor`, `viewport:360`… |
| `flaky_model` | `true` when the verdict depends on what the model chooses to do — kept apart from mechanism cases (`--no-model` skips them) |
| `steps` | enough for a machine runner to execute **without judgement** |
| `expect` | concrete strings/values; PASS when every line holds |
| `selectors` | stable selectors: `data-*`, API door paths — **never translated text** |
| `evidence`, `fence` | (optional) the original evidence of the bug; the fence (mechanism) this case checks |

🔒 **Check the FENCE, not "the model did not get it wrong".** A good case calls a door/tool directly with bad input
and reads the error code, or measures a DOM property the mechanism sets. A case that needs a model turn sets
`flaky_model: true` and still checks the mechanism's output, not the answer.

Result line: `{"id","verdict","commit","ran_at","evidence"}`, `verdict` ∈ `PASS` `FAIL` `BLOCKED` `NOT_RUN`;
`id` follows the grammar above (a line with a malformed id is reported as an error and does not count as evidence).
`BLOCKED` = the conditions in `needs` could not be set up — not a fault of the code.
`evidence` = the log's repository-relative path; when `--evidence-dir` points outside the checkout, only the
log's file name (for example `REG-PR-1048-own-domain-routing.log`), so a result line is the same on every machine.

## Common setup (every case)

The first step of every case that says "Common setup" is this section; the runner tells Codex to read it first. The
sample values are for the stand `scv2` (`~/TCH-local/scv2`); for another stand, substitute from its `compose.sh ps`.
**The real develop environment**: use [`common-dev.md`](common-dev.md) instead of this section (runner:
`--common tests/regression/common-dev.md --cdp <url>`). Building a stand:
[`docs/references/running-tracy-locally.md`](../../docs/references/running-tracy-locally.md).

| Name | Meaning | Sample (`scv2`) |
|---|---|---|
| `O` (= `ORIGIN`) | the stand's origin, no trailing slash | `http://scv2.tracy.test:34080` |
| `COOKIE_DOMAIN` | domain of the `tracy_sess` cookie | `.scv2.tracy.test` |
| `PG` `WEB` `HOST` `DSH` | postgres, tracy-web, tracy-host, dsh containers | `tracy-scv2-postgres-1` `tracy-scv2-tracy-web-1` `tracy-scv2-tracy-host-1` `tracy-scv2-dsh` |
| `PRIV` | the site's private folder on the machine (backups in `$PRIV/<label>/backups/`) | `TRACY_PRIVATE_ROOT` in the env of `$HOST` |
| `A` `B` | owner seat and editor seat on the test site | `scv2-a@example.test`, `scv2-b@example.test` |
| `Q` | temporary folder of the run (chmod 700) | `tests/regression/.runs/<run>/` |
| the case's site | site key `<label>.<stand domain>`; containers `<label>-web-1`, `<label>-db-1` | `scv2wp` WordPress, `scv2jo` Joomla, `scv2em` EmDash |

```
# seat cookies — no OTP; minted with the stand's SESSION_SECRET, NEVER print the cookie/secret to a log
for who in a b; do
  SECRET=$(grep '^SESSION_SECRET=' ~/TCH-local/scv2/.env | cut -d= -f2-) \
  node --input-type=module -e "import {mintSession} from './apps/tracy-web/src/lib/session.js'; process.stdout.write(await mintSession(process.argv[1], process.env.SECRET))" \
  "scv2-$who@example.test" > $Q/cookie-$who.txt
done; chmod 600 $Q/cookie-*.txt
COOKIE_A=$(cat $Q/cookie-a.txt); COOKIE_B=$(cat $Q/cookie-b.txt)
api() { curl -s -m 300 -w '\nHTTP %{http_code}\n' -X "$2" -H "Cookie: tracy_sess=$(cat $Q/cookie-$1.txt)" \
  -H "Origin: $O" -H 'Content-Type: application/json' ${4:+--data "$4"} "$O$3"; }   # api <a|b> <METHOD> <path> [json]
pq() { docker exec -i $PG psql -U tracy -d tracy -At -F '|' -c "$1"; }                # SELECT/WITH ONLY
em() { docker exec -w /app <label>-web-1 node -e 'const D=require("better-sqlite3");console.log(JSON.stringify(new D("/app/data/data.db",{readonly:true}).prepare(process.argv[1]).all()))' "$1"; }  # EmDash, read-only
```

- Check the cookie: `curl -s -o /dev/null -w '%{http_code}' -H "Cookie: tracy_sess=$COOKIE_A" $O/auth/me` = `200`.
- **Browser**: `chrome-watch --status`, and `chrome-watch` if it is not running; the repo's Playwright
  (`node_modules/.pnpm/playwright@*/node_modules/playwright`) → `chromium.connectOverCDP('http://127.0.0.1:9222')`,
  **not** `chromium.launch()`. One fresh `browser.newContext({locale, colorScheme, viewport})` per seat (the shared
  Chrome keeps other sessions' cookies), then `addCookies([{name:'tracy_sess', value, domain: COOKIE_DOMAIN, path:'/', httpOnly:true}])`.
  **Do not** close the page/context/browser — just let the script exit.
- **Open Site changes** for site `S`: `goto($O/<S>)`, wait (≤ 90 s) for the URL to contain `/s/session-` and for
  `[contenteditable='true']`; `goto` that URL again with `tab=tracy:changes&site=<S>`; wait for `.tv-activity-v2`
  (or `[data-site-changes-v2]`) and until no `[data-reading]` is left inside it.
- **Find a row in Site changes** (older rows are on later pages, behind the "Show more" button):
  ```js
  const R = `li.tv-activity-event[data-event='${id}']`
  for (let i = 0; i < 30 && !(await page.locator(R).count()); i++) {
    const more = page.locator('.tv-activity-more button')
    if (!(await more.count())) break                    // end of the list
    if (await more.isEnabled()) await more.click()      // do not click while it says "Loading…" (disabled)
    await page.waitForTimeout(2_000)
    await page.waitForFunction((r) => { const b = document.querySelector('.tv-activity-more button'); return !!document.querySelector(r) || !b || !b.disabled }, R, { timeout: 90_000 })
  }
  ```
  If the loop ends without `R`, the row is not in the list (`FAIL` with `row-not-in-list`). ⚠ Do not `click()` the
  button while it says "Loading…": once the last page has loaded, the whole `.tv-activity-more` is removed, and
  `click()` waits until timeout for a button that never comes back, while the wanted row is already there (REG-011 on
  scv2jo 03/10, two runs: 52 rows, the fixture row on page 2, `TimeoutError … element was detached from the DOM`).
- **Send a chat message** — the composer is `[data-composer-input='true']` (dsh's Lexical editor):
  ```js
  const box = page.locator("[data-composer-input='true']").first()
  await box.fill(text)   // focus + select all + Input.insertText — not a clipboard paste
  await page.waitForFunction((t) => document.querySelector("[data-composer-input='true']")?.textContent === t, text, { timeout: 10_000 })
  await box.press('Enter')
  await page.waitForFunction(() => document.querySelector("[data-composer-input='true']")?.textContent === '', null, { timeout: 15_000 })
  ```
  If the box does not hold exactly `text` after 10 s → `fill` once more; still off → `BLOCKED` with
  `composer-rejected-text`; box not empty 15 s after Enter → `BLOCKED` with `composer-did-not-send`. Then poll the
  seat's `site_turn` on the site every 5 s until `state` ≠ `open` (cap 10 minutes, then `BLOCKED`).
  ⚠ Do not type `click`, `Meta+A`, `Backspace`, `page.keyboard.insertText(text)` in one go: the composer swallows the
  text — the editor blocks `beforeinput insertText` without inserting anything (probably because the selection has
  not resynced after the delete), so the box stays empty, Enter sends nothing and no `site_turn` appears (measured
  03/10 on `scv2`, develop `d6f150c3b`: empty 7/7 times on both WordPress and EmDash; `fill`: 4/4 manual tries kept
  the full text, then 5/5 runner sends — REG-007 ×2, 008, 010, 014 — all produced a turn).
- **Write scope**: only on the stand's test sites; never INSERT/UPDATE Tracy's Postgres, no `compose up/down`.

## Common setup — dev

Used when the runner runs with `--profile dev` (the develop surface `https://cowork.tracy.site`, the dev machine).
The cases are unchanged; this section replaces the one above. The runner has already set up everything a case needs
and written it to `$Q/env.sh` (no secrets in it); **every shell command starts with `. <env.sh> &&`** (the path is in
the prompt) because the shell keeps no variables between two commands.

| Name | Meaning | Value |
|---|---|---|
| `O` (= `ORIGIN`) | the develop surface | `https://cowork.tracy.site` |
| `COOKIE_DOMAIN` | domain of the `tracy_sess` cookie | `.tracy.site` |
| `UA` | browser user agent — Cloudflare blocks bare clients, every `curl`/context must carry it | in `env.sh` |
| `E2E_RUN_ID` | id of the run; every site label and email of the run contains it | `k1004…` |
| `A` `B` `C` | seats: `A` owns every site of the case; `B` is editor when the case needs `seat:editor`; `C` is editor when the case needs `seat:viewer` (Tracy has no viewer role) — otherwise `C` is an account of the run with NO seat yet | `e2e-<run>-owner@example.test`, `…-editor@…`, `…-third@…` |
| `S` (= `KEY`), `LABEL` | the case's site (the first one if the case needs several) — a site the runner CREATED for this case and deletes after it | `e2e<run><n>w.tracy.site`, `e2e<run><n>w` |
| `S_WP` `S_JO` `S_EM`, `LABEL_WP`… | one site per CMS when the case needs several CMSes | |
| `Q` | temporary folder of the case (chmod 700), outside the repo | `~/TCH-local/e2e-dev/reg/<run>/<REG-id>/` |

Functions provided in `env.sh` — **only** these touch the dev machine; each calls one predefined operation of
`tests/e2e-dev/lib/dev.mjs` (no shell, no `sudo`, no writes):

```
mint a            # node tests/e2e-dev/bin/mint.mjs "$A" "$Q/cookie-a.txt" — chmod 600, NEVER prints the token; same for b, c
api a GET /auth/me                         # as above, plus -A "$UA"; api <a|b|c> <METHOD> <path> [json]
pq "SELECT … WHERE site_key='$S'"          # dev Postgres, read-only; the statement MUST contain the run id (the run's label/email)
dshgrep '<string>' /desk-home/profiles/native/node_modules/@tracy/<package>/lib/client.js   # = docker exec $DSH grep -c (fixed string)
dshfile /desk-home/profiles/native/node_modules/@tracy/<package>/lib/client.js              # = docker exec $DSH test -f
em "SELECT …"     # SQLite of the case's EmDash site, read-only
devps "$LABEL"    # docker ps -a for the site's containers
```

- **Mapping from the local section**: `docker exec $DSH grep -c X F` → `dshgrep X F`; `… test -f F` → `dshfile F`;
  `docker exec $PG psql` → `pq`; `em()` → `em`. Cookie: `mint a`, then `COOKIE_A=$(cat $Q/cookie-a.txt)` — never print it.
- **Not available on dev** (a step that needs them → `BLOCKED`, with `dev-no-<thing>`): `docker exec` into
  `$WEB`/`$HOST`/site containers other than `em`, `$PRIV`, reading the stand's `.env`, minting emails other than the
  three seats above. A case that makes up a new address (`reg057-<seconds>@example.test`, `R`/`L` of REG-065…) uses
  `C` instead (if the case needs two new addresses, `BLOCKED`).
- **Sites and seats**: use only the case's `S`/`S_*`; do not pick another site from `/api/team` (other people's seats
  show up there too). `scv2…` examples in a case belong to the local stand — ignore them. Do not create/delete sites;
  the runner cleans up the case's site after the case.
- **Browser**: the suite's own headless Chromium, not chrome-watch:
  ```js
  import { readFileSync } from 'node:fs'
  import { launch } from '<TCH>/tests/e2e-dev/lib/browser.mjs'   // Playwright from apps/tracy-host
  const browser = await launch()
  const ctx = await browser.newContext({ userAgent: process.env.UA, locale: 'en-US', colorScheme: 'light', viewport: { width: 1440, height: 1000 } })
  await ctx.addCookies([{ name: 'tracy_sess', value: readFileSync(`${process.env.Q}/cookie-a.txt`, 'utf8').trim(),
    domain: process.env.COOKIE_DOMAIN, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }])
  ```
  One context per seat. Record browser errors (the "chrome-watch --errors" step) yourself with
  `page.on('console'|'pageerror'|'response')`. When done, `browser.close()` — nobody watches this Chrome, and leaving
  it open hangs the process.
- **Commit**: a case run on dev measures the deployed build; the result line records `commit` = the web image tag
  (`app-<12 hex>`) together with the deploy manifest, in `~/TCH-local/e2e-dev/reg/<run>/results.jsonl` — **not** in
  `tests/regression/results/`.

## Running

```
node tests/regression/run.mjs --dry-run                                  # list, no stand needed
node tests/regression/run.mjs --dry-run --area site-changes --no-model   # filters: --id --area --kind --cms --no-model
node tests/regression/run.mjs --stand http://tracy.test:8080 --id REG-001
node tests/regression/run.mjs --stand http://tracy.test:8080 --id REG-PR-912-backup-button-enabled,REG-004
```

- `--id` takes **full ids**, matched literally (`REG-PR-99-backup` does not select `REG-PR-99-backup-button`). A
  malformed id, an id no case carries, or an id excluded by another filter (`--area`/`--kind`/`--cms`/`--no-model`)
  stops the run with exit code 2 and names the id — no more mistyping an id and getting a green "0 case(s)". With
  `--profile dev`, an id named explicitly that dev cannot run also stops the run before it touches the dev machine.

- The runner **does not build a stand**: pass the URL of a running stand at the commit you want to measure
  (`--commit`, default this checkout's `HEAD`). Building a stand:
  [`docs/references/running-tracy-locally.md`](../../docs/references/running-tracy-locally.md).
- Each case is one `codex exec -m gpt-6.1-sol -c model_reasoning_effort=low --sandbox danger-full-access` run with
  stdin closed (with it open, `codex exec` hangs waiting). The case prints `VERDICT: PASS|FAIL|BLOCKED` on its last
  line; if it prints nothing or Codex exits non-zero, the result is `BLOCKED`.
- Results are appended to `results/<UTC date>-<9-character commit>.jsonl`; commit that file to the branch.
- `--profile dev` (default `local`): run against develop. `--dry-run --profile dev` prints the cases dev can run
  (the sites and seats the runner will set up) and why each other case cannot run (`devFit` in `run.mjs`: cases that
  only run in a checkout, `stand:*`, chrome-watch, `tracy_admin` seats, cases that create their own site, fixture sites
  built from a private quickstart, private themes). For each case the runner creates the site + seats through the
  doors under the run manifest (`--run-id`, default `r<mmdd><4>`), runs Codex, deletes the tokens in `$Q`, deletes the
  site; results, logs and `report.md` go to `~/TCH-local/e2e-dev/reg/<run>/`.
  `node tests/regression/run.mjs --profile dev --stand https://cowork.tracy.site --id REG-001,REG-004`

## Adding a case (every fix/feat PR)

1. **Get the PR number first.** Open the PR as a draft (`gh pr create --draft`) and read its number
   (`gh pr view --json number -q .number`). No PR number, no id — do not guess a number, do not take "the next one".
2. **Write the case's grading command — `run` — when you add the case** (decision of 05/10/2026). The case is graded
   by that command, **no model reads any text**: later runs take a few seconds and no tokens. Three ways; pick the
   shortest one that still checks **every `expect` line**:
   - an existing test command: `"run": {"cmd": ["node", "--test", "--test-reporter=tap", "<file>"], "tests": ["<test name>", …]}`
     — `tests` are name prefixes of the tests that must report `ok`; a deleted or renamed test turns the case **red**,
     it does not pass on exit 0;
   - running from a subfolder: add `"cwd": "packages/…"`;
   - several steps or values to compare: a script `tests/regression/scripts/<id>.mjs` that prints one `ok -`/`not ok -`
     line per condition and exits 0 only when all hold; `"run": {"cmd": ["node", "tests/regression/scripts/<id>.mjs"]}`;
   - a case that needs a browser or API doors on a stand: a Playwright spec `tests/regression/specs/<id>.spec.mjs`,
     one `expect`/`expect.soft` per `expect` line plus a `console.log` line with the measured value; import `test`,
     `seatContext`, `api`, `siteKey` from `specs/stand.mjs` (the `chrome-watch` Chrome over CDP, cookies minted with
     the stand's `SESSION_SECRET` — no `chromium.launch()`, never close the context); any write must be cleaned up in `finally`.
     `"run": {"cmd": ["node_modules/.bin/playwright", "test", "-c", "tests/regression/playwright.config.mjs", "specs/<id>.spec.mjs"], "needs": ["stand", "chrome"]}`
     (examples: REG-044, REG-057, REG-PR-924). Do not turn on Playwright's own `trace`/`screenshot`: over CDP they
     also record other sessions' pages — use `seatTrace`/`seatScreenshot` in `playwright.config.mjs`.

   `run.needs` declares what the machine must have: `postgres` (reads `TEST_DATABASE_URL`), `stand` (`--stand`,
   passed to the command as `TRACY_STAND`), `chrome` (a Chrome answering on CDP). If something is missing the case is
   `BLOCKED`, not `FAIL`. Only a case with `flaky_model: true` — a case that grades **Tracy's model** — may omit `run`;
   it still goes through the Codex runner.

   Write the case's fields (table above; `id` and `pr` are **not** needed) to a temporary JSON file outside `cases/`,
   with `kind` matching the PR type, then create the case:
   ```
   node tests/regression/create.mjs --pr <PR number> --slug <slug> --input <file.json>
   pnpm exec biome format --write tests/regression/cases/REG-PR-<PR number>-<slug>.json
   ```
   The command prints the id (`REG-PR-<PR number>-<slug>`) and creates exactly the file `cases/<id>.json`. It
   **refuses and writes nothing** when: the PR number or slug is malformed; the input is not a regular file, is not a
   valid case, or already holds an `id`/`pr` different from the arguments; or the target file **already exists** (the
   file is opened "create new, fail if present", so if a PR reuses a slug, or two runs race, only one wins and an
   existing case is never overwritten). A PR that adds several cases uses one slug per case.
3. **Editing an existing case counts too** (e.g. a PR that re-fixes the bug of REG-008 updates REG-008): edit its
   file directly and **keep the id** — including an old `REG-NNN` id; do not rename the file or convert it to the new form.
4. Run the case from **this branch's code**: `node tests/regression/run.mjs --no-codex --id <id>` (add
   `--stand <url>` when `run.needs` includes `stand`), and commit the result file. A case with `run` never starts Codex.
5. The `### Regression` section of the PR description: `<id> — PASS on <commit>`.

The `Regression` gate (`scripts/check-regression.mjs`, workflow `regression-check.yml`) is green when the diff adds or
edits at least one case of the same kind **and** there is a `PASS` line for that case whose `commit` belongs to the PR
branch's history (reachable from head, not reachable from the merge-base with the target branch). A commit from the
target branch, a foreign commit, or a commit that does not exist are all red — so after a rebase you must run again.
Only a `feat` may write `Regression: none — <reason of ≥ 10 characters>` instead of a case (the feature is pure
infrastructure with no user path). **A `fix` is never `none`**: a bug that was fixed is a bug that could be
reproduced. PRs that are not fix/feat (docs, chore, ci, refactor…) are skipped by the gate. Merged PRs are not judged retroactively.

Every `.json` file the diff adds or edits in `cases/` is examined — a malformed name is a reported error, not silently
skipped: an added **or edited** case must have `run` (except `flaky_model: true`) — touching an old case is the moment
to move it to a script; a **newly added** case must carry the id `REG-PR-<PR number>-<slug>` in the file `<id>.json`
with `pr` equal to that number; the file must be a regular file (not a symlink); an id that another file at head also
carries is red. The number in the id is compared with the case's `pr` field, **not** with the PR under review (a release
PR carries cases from many other PRs). Existing `REG-NNN` cases — including ones someone else merged while this PR was
open — are never asked to be renamed or re-run. An unreadable payload, or a git error when the gate asks where a commit
lies, makes the gate exit with code 2, never green.

Check the gate locally: `node scripts/check-regression.mjs <payload.json>` (payload shaped like a `pull_request` event).

## Pruning rules

- Never delete or weaken a case to make a PR green. If a case's expectation is wrong, fix the case in that same PR and
  say so in the description.
- Delete a case only when what it guards **has been removed from the product**; name the removing PR in the commit.
  Never reuse the number of a deleted case.
- A `flaky_model` case FAILs while the mechanism case of the same area PASSes → review the model case before suspecting
  the code; three FAILs in a row because of the model → rewrite it as a mechanism case, or delete it with a reason.
- Result files older than 90 days are merged/deleted in a separate `chore` PR; the gate only reads results of the cases
  the PR changes.

## Nightly run

A case runs only once on its own PR; the nightly run re-runs **every case with `run`** to catch fixed bugs coming
back. [`nightly.sh`](nightly.sh) runs on the checkout that contains it: a throwaway PostgreSQL for
`run.needs: postgres`, chrome-watch for `chrome`, and it never starts Codex. `stand` cases run only when
`REG_NIGHTLY_STAND` points to a stand built from the **same** `develop` — a shared stand runs the image of its last
build, and an old image turns a fixed bug into a FAIL every night (REG-PR-924 on scv2, 05/10/2026); without it those
cases are `BLOCKED`. Results: `$REG_NIGHTLY_DIR/<date>/` (`summary.txt`, `results.jsonl`, `logs/`) and `latest.txt`;
default `~/TCH-local/regression-nightly/`.

On the nightly machine a LaunchAgent calls `~/TCH-local/regression-nightly/trigger.sh` every 5 minutes
(`StartCalendarInterval` does not fire on that machine); the trigger runs only within the 04:xx window, once a day,
keeps its own worktree `~/TCH-worktrees/reg-nightly` at the latest `origin/develop`, and reinstalls dependencies when
the lockfile or submodules change. Read the result: `cat ~/TCH-local/regression-nightly/latest.txt`.

## Next (not done in the PR that opened this suite)

- **`main` gate**: a release PR into `main` requires a full-suite PASS run on the release commit.
- Build the stand automatically in the runner (it only takes a URL today).
- **Re-measure id collisions** (follow-up to the id scheme change of 04/10/2026): over the next **122 completed CI
  runs** after this change reached `develop`, read the log of each red run and classify it as "red because of a
  duplicate case id" (the `duplicate id` message of `loadCatalogue`, or the gate's `is also carried by`) / "red for
  another reason" / "unclassifiable" — state the number of unclassifiable runs, do not fold them into the other two
  groups. Compare with the measured baseline: 10 of 28 red runs. Only the number of collision runs is measured; minutes
  saved are **not** measured and must not be reported as a result.
