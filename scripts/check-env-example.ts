/**
 * `deploy/.env.example` must list EXACTLY the keys the code actually reads — none missing, none extra.
 *
 * WHY — TWO REAL CASES, SAME DAY 2026-09-10, SAME SHAPE.
 *
 * 1. `MODEL_API_KEY` was declared in `.env.example` with the note "passed to dsh", and **no service in
 *    compose read it**. The person filling it in believed they were configured; every agent run died with
 *    `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"` three layers away.
 *
 * 2. Worse: EIGHT keys carried the old Worker's names. `.env.example` declared `OAUTH_GOOGLE_ID`,
 *    `GITHUB_HOST_APP_ID`, `FLEET_WEBHOOK_SECRET`… while `apps/tracy-web/src/config.js` reads
 *    `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_APP_ID`, `GITHUB_WEBHOOK_SECRET`. Fill in the old names and
 *    `readOAuth`/`readGithub` return `null` and **the sign-in button simply does not appear** — looking
 *    exactly like a configuration left empty on purpose. At the same time SIXTEEN keys the code reads
 *    were never mentioned in this file, among them `MAIL_FROM` — a `need()`, i.e. the app does NOT BOOT
 *    without it, and whoever sets up a new machine has no way to know in advance.
 *
 * 🔒 NO OTHER GATE SEES THIS KIND. `check-origins` reads string literals; lint and typecheck know nothing
 * about `.env`; and tests build their own env by hand, so they are green on a completely wrong
 * `.env.example`. The only thing that ever caught it was a person digging — and a person only digs once
 * something has been broken long enough to be worth digging into.
 *
 * THE CHECK, BOTH DIRECTIONS:
 *   - every `opt(env,'X')` / `need(env,'X')` in the two apps' `config.js` must have `X=` in the file;
 *   - every `X=` in the file must be READ somewhere in the tree (app, fleet script, compose).
 *
 * The second direction catches dead keys; the first catches keys nobody knows to set.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ENV_FILE = 'deploy/.env.example'

/** Where a key counts as "read". Compose interpolates `${X}`, fleet scripts read `$X`. */
const READERS = [
  'apps/tracy-web/src',
  'apps/tracy-host/src',
  'deploy/compose.yml',
  'deploy/compose.macos.yml',
  'deploy/compose.server.yml',
  'deploy/scripts',
  'packages/fleet/tracy-fleet-operation/scripts',
  'scripts'
]

/**
 * Keys `config.js` reads but `.env.example` does NOT list, because they are not the user's to set:
 * compose builds them inside the container from keys that are listed. Write the reason, not a bare name.
 */
const SET_BY_COMPOSE: Record<string, string> = {
  HOST_SECRET: 'compose sets it for tracy-host from the listed HOST_<name>_SECRET (compose.yml:99)',
  TRACY_FLEET_DIR:
    "a path INSIDE the tracy-host image, decided by the Dockerfile — not the installer's choice"
}

/** Keys NOT read by code but used by people/CI, with the reason. Adding one here is a decision. */
const NOT_READ_BY_CODE: Record<string, string> = {
  TEST_DATABASE_URL:
    'read only by the test suite (apps/tracy-web/test/_db.mjs), not by running code — but whoever sets up a machine still needs to know to set it'
}

function keysDeclared(text: string): string[] {
  return [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!)
}

function keysReadByConfig(): string[] {
  const out = new Set<string>()
  for (const app of ['tracy-web', 'tracy-host']) {
    let src: string
    try {
      src = readFileSync(join(ROOT, `apps/${app}/src/config.js`), 'utf8')
    } catch {
      continue
    }
    for (const m of src.matchAll(/\b(?:opt|need)\(env,\s*'([A-Z][A-Z0-9_]*)'/g)) out.add(m[1]!)
  }
  return [...out]
}

/**
 * The READERS paths git ACTUALLY tracks. Filtering first is required, not extra caution:
 * `git grep -- <pathspec matching nothing>` fails the WHOLE command, so a path that does not exist yet
 * (`compose.server.yml` before someone wrote it) would make every key read as "read by nobody" — 48
 * false errors on this gate's own first run.
 */
const TRACKED = READERS.filter((p) => {
  try {
    return execFileSync('git', ['ls-files', '--', p], { cwd: ROOT, encoding: 'utf8' }).trim() !== ''
  } catch {
    return false
  }
})

/** Does anything besides `.env.example` mention this key? `git grep` avoids wading through node_modules. */
function isReadSomewhere(key: string): boolean {
  if (TRACKED.length === 0) return false
  try {
    // `-w`, NOT `-E "\\bX\\b"`. git's ERE does not understand `\\b`: it raises no error, it just
    // matches nothing — so every key reads as "read by nobody", exactly the 48 false errors measured while
    // writing this gate. `-w` is what git actually has for this.
    execFileSync('git', ['grep', '-qw', key, '--', ...TRACKED], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const text = readFileSync(join(ROOT, ENV_FILE), 'utf8')
const declared = new Set(keysDeclared(text))
const problems: string[] = []

for (const key of keysReadByConfig()) {
  if (key in SET_BY_COMPOSE) continue
  if (!declared.has(key)) {
    problems.push(`${ENV_FILE}: missing \`${key}=\` — config.js reads it, this file never mentions it`)
  }
}

for (const key of declared) {
  if (key in NOT_READ_BY_CODE) continue
  if (!isReadSomewhere(key)) {
    problems.push(
      `${ENV_FILE}: \`${key}=\` is read by nobody — a wrong name, or a leftover of the old system?`
    )
  }
}

if (problems.length > 0) {
  console.error(`Env example: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error(
    '\n  Read-but-not-declared key: add a line to deploy/.env.example, with a sentence on what breaks without it.' +
      '\n  Declared-but-unread key: rename it to what the code reads, or delete it — a key nobody' +
      '\n  reads is not "unused yet", it is a false promise to whoever fills it in.'
  )
  process.exit(1)
}

console.log(`Env example: ${declared.size} keys, matching the code in both directions.`)
