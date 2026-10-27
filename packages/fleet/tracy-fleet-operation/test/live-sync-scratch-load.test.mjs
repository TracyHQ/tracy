/**
 * "Sync from live" and "Sync to live" load the scratch schemas they compare (`webroot-sync.sh`
 * `load_schema`/`scratch_loaded`) inside a command substitution (`sync_op`'s `$(merge | tail -1)`,
 * `webroot-live-push.sh`'s `$(… changeset | tail -1)`), where bash turns `set -e` off. A CREATE DATABASE
 * or a load the database server refused — its disk full, the Docker VM's disk turned read-only — went
 * by unseen, and the merge met a schema that was never made: `MERGE_FAILED … Unknown database` from
 * deep in the engine (24/10/2026), or a base loaded half. Each step is now checked by hand.
 *
 * No database: the two functions are taken out of the script and run against a stand-in for
 * `tracy_db_exec` that refuses what the test says, in a command substitution as the sync runs them.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-scratch-load.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const SYNC = readFileSync(join(here, '..', 'scripts', 'webroot', 'webroot-sync.sh'), 'utf8')
const BACKUP = readFileSync(join(here, '..', 'scripts', 'lib', 'site-backup.sh'), 'utf8')
const LIB = join(here, '..', 'scripts', 'lib')
const PUSH = readFileSync(join(here, '..', 'scripts', 'webroot', 'webroot-live-push.sh'), 'utf8')
const root = mkdtempSync(join(tmpdir(), 'live-sync-scratch-'))
after(() => rmSync(root, { recursive: true, force: true }))

/** A shell function's definition, as the script has it. */
const fn = (source, name) => {
  const at = source.indexOf(`\n${name}() {`)
  assert.ok(at >= 0, `${name} is in the script`)
  return source.slice(at + 1, source.indexOf('\n}\n', at) + 3)
}

/**
 * `load_schema` + `scratch_loaded` against a database that refuses `refuse` (a regular expression
 * over the statement), run as `sync_op` runs `merge`: inside `$(…)`.
 */
function run(refuse, sql = 'CREATE TABLE jos_content (id INT);\n') {
  const dump = join(root, 'dump.sql.gz')
  writeFileSync(dump, gzipSync(sql))
  const script = `set -euo pipefail
CHARSET=utf8mb4 COLLATION=utf8mb4_unicode_ci
made=" "
tracy_db_exec() {
  local said; said="$*"; [[ "$said" == *" -e "* ]] || said="$said $(cat)"
  if [[ -n "$REFUSE" && "$said" =~ $REFUSE ]]; then echo "ERROR 1006 (HY000): Can't create database" >&2; return 1; fi
  if [[ "$said" =~ CREATE\\ DATABASE\\ \\\`([a-z_]+)\\\` ]]; then made="$made\${BASH_REMATCH[1]} "; echo "$made" > "$MADE"; fi
  if [[ "$said" == *information_schema.tables* ]]; then
    local s; s="$(sed -n "s/.*table_schema='\\([a-z_]*\\)'.*/\\1/p" <<< "$said")"
    grep -q " $s " "$MADE" 2>/dev/null && echo 12 || echo 0
  fi
  return 0
}
tracy_db_drop_triggers() { return 0; }
LIB_DIR=${JSON.stringify(LIB)}
DIR=${JSON.stringify(root)}
${fn(BACKUP, 'tracy_db_load_dump')}
${fn(SYNC, 'load_schema')}
${fn(SYNC, 'scratch_loaded')}
merge() {
  local failed=0
  load_schema shop_tracy_sync_base "$DUMP" || failed=1
  if [[ "$failed" != 0 ]] || ! scratch_loaded shop_tracy_sync_base; then echo '{"ok":false,"code":"MERGE_FAILED"}'; return; fi
  echo '{"ok":true}'
}
answer="$(merge | tail -1)"
echo "$answer"
`
  const file = join(root, 'run.sh')
  writeFileSync(file, script)
  const r = spawnSync('bash', [file], {
    encoding: 'utf8',
    env: { ...process.env, REFUSE: refuse, DUMP: dump, MADE: join(root, `made-${Math.random()}`) }
  })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

test('a scratch schema the server refuses to make is seen, though `set -e` is off where the merge runs', () => {
  assert.deepEqual(run(''), { ok: true })
  assert.deepEqual(run('CREATE DATABASE'), { ok: false, code: 'MERGE_FAILED' })
})

test('a load the server refuses half-way is seen too', () => {
  // The dump's statements reach the client on stdin: refused there, after the schema was made.
  assert.deepEqual(run('--init-command'), { ok: false, code: 'MERGE_FAILED' })
  // A live read's tables, each on a load of its own: one load refused is the load refused.
  const tables = ['a', 'b', 'c']
    .map((t) => `-- table \`jos_${t}\`\nCREATE TABLE jos_${t} (id INT);\n`)
    .join('')
  assert.deepEqual(run('', tables), { ok: true })
  assert.deepEqual(run('--init-command', tables), { ok: false, code: 'MERGE_FAILED' })
  assert.deepEqual(run('jos_b', tables), { ok: false, code: 'MERGE_FAILED' })
})

test('both scripts check their scratch loads by hand and say why they stopped', () => {
  // The merge's third load (the copy's) and the held merge's load back stop on a refusal as well.
  // The copy's scratch schema is made inside load_ours's try (streamed straight in since #1684); a
  // refused CREATE or load stops it there (2), and merge refuses on it — saying what the server said
  // (LOAD_OURS_WHY) — instead of merging a half schema.
  assert.match(
    fn(SYNC, 'ours_try'),
    /CREATE DATABASE \\`\$SCHEMA_OURS\\`[^\n]*\\\n[^\n]*\|\| \{ OURS_STOP="[^"]+"; return 2; \}/
  )
  assert.match(fn(SYNC, 'merge'), /load_ours \|\| loaded=\$\?/)
  assert.match(
    fn(SYNC, 'merge'),
    /answer_refusal MERGE_FAILED "the copy's database could not be read[^"]*\$\{LOAD_OURS_WHY/
  )
  assert.match(fn(SYNC, 'merge'), /scratch_loaded "\$SCHEMA_BASE" "\$SCHEMA_LIVE" "\$SCHEMA_OURS"/)
  assert.match(fn(SYNC, 'resume_held'), /\|\| ! scratch_loaded "\$SCHEMA_OURS"/)
  assert.match(fn(PUSH, 'changeset'), /answer_refusal SCRATCH_DB_FAILED/)
  assert.match(fn(PUSH, 'copy_checksums'), /\|\| return 1/)
})
