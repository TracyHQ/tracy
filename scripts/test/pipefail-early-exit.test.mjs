/**
 * No early-exit pipe reader under `pipefail` in Tracy's shell (04/10/2026).
 *
 * `writer | grep -q X`, `writer | head -1`, `grep -m1`, `awk '{…; exit}'` stop reading as soon as
 * they have their answer. If the writer still has output to write, it dies of SIGPIPE (status 141),
 * and under `set -o pipefail` that status becomes the pipeline's: a found match reads as "not found",
 * a `$(… | head -1)` under `set -e` ends the script, and `|| x=""` throws away the value the reader
 * got. bash writes `printf`/`echo` output line by line and Go programs (docker) write each line
 * separately, so "the writer is small" is not a defence. It cost a flaky backup test (#870:
 * `initial-backup` re-pinned v1), and the same shape could delete an in-use image
 * (`prune-old-images.sh`) or fail every look at a site with many backups (`webroot-git.sh`).
 *
 * The readers that drain instead: `grep … >/dev/null` (not `-q`), `sed -n 1p` / `sed -n 1,Np` (not
 * `head -N`), `{ head -c N; cat >/dev/null; }` (not `head -c N`), and an awk that keeps reading.
 * A line whose status is explicitly kept out with `|| true` is accepted: the reader's value stands
 * and nothing reads the 141.
 *
 * Scope: shell files that set pipefail, the files they source, and GitHub workflows (their `run:`
 * steps are `bash -eo pipefail`). `vendor/` is others' code (RULE #5) and is not scanned.
 *
 *   node --test scripts/test/pipefail-early-exit.test.mjs
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TREES = ['scripts', 'deploy', 'apps', 'packages']
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.astro', 'coverage', 'lib-node'])

function walk(dir, out) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP.has(e)) continue
    const p = join(dir, e)
    const s = statSync(p, { throwIfNoEntry: false })
    if (!s) continue
    if (s.isDirectory()) walk(p, out)
    else if (s.isFile() && s.size < 2_000_000) out.push(p)
  }
  return out
}

const isShell = (path, text) => /\.(sh|bash)$/.test(path) || /^#!.*\b(ba)?sh\b/.test(text.slice(0, 200))
const setsPipefail = (text) => /^[^#\n]*\bset\s+[^#\n]*pipefail/m.test(text)

/** A pipe (not `||`) into a reader that can stop before its input ends. */
const EARLY =
  /(?<!\|)\|(?!\|)\s*(?:grep\b[^|;&]*\s-[A-Za-z]*[qm]|grep\b[^|;&]*\s--(?:quiet|silent|max-count)|head\b|awk\b[^|]*\bexit\b)/

function offenders(path, text) {
  const found = []
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*#.*$/, '')
    if (!EARLY.test(code)) return
    if (/\|\|\s*true\b/.test(code)) return
    found.push(`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`)
  })
  return found
}

test('no shell file under pipefail reads a pipe with a reader that quits early', () => {
  const files = TREES.flatMap((t) => walk(join(ROOT, t), []))
  const shell = new Map()
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    if (isShell(f, text)) shell.set(f, text)
  }
  const strict = new Set([...shell].filter(([, t]) => setsPipefail(t)).map(([f]) => f))
  // A library has no `set` of its own; it runs under the options of whoever sources it.
  const own = new Set(strict)
  for (const [f] of shell) {
    if (strict.has(f)) continue
    const name = basename(f).replace(/[.]/g, '\\.')
    const sourced = new RegExp(`(?:^|\\s)(?:source|\\.)\\s+\\S*${name}\\b`, 'm')
    for (const g of own) if (sourced.test(shell.get(g))) strict.add(f)
  }
  assert.ok(strict.size > 50, `found only ${strict.size} pipefail shell files — is the walk broken?`)
  const bad = [...strict].flatMap((f) => offenders(f, shell.get(f)))
  assert.deepEqual(bad, [], 'drain the pipe: grep … >/dev/null, sed -n 1p, { head -c N; cat >/dev/null; }')
})

test('no workflow step reads a pipe with a reader that quits early', () => {
  const dir = join(ROOT, '.github', 'workflows')
  const bad = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => offenders(join(dir, f), readFileSync(join(dir, f), 'utf8')))
  assert.deepEqual(bad, [], 'a workflow `run:` step is bash -eo pipefail')
})

test('the guard catches each shape it names', () => {
  for (const line of [
    'printf "%s\\n" "$v" | grep -q x; then',
    'cid="$(docker ps -q | head -1)"',
    'from="$(printf "%s" "$m" | grep -m1 .)"',
    "x=$(cmd | awk '{print; exit}')",
    'tok=$(cmd | head -1) || tok=""',
    'docker ps | grep -qx tracy-dsh',
    'echo "$a" | grep -Eq "^v"'
  ])
    assert.notDeepEqual(offenders('x.sh', line), [], line)
  for (const line of [
    'printf "%s\\n" "$v" | grep x >/dev/null; then',
    'cid="$(docker ps -q | sed -n 1p)"',
    'x="$(cmd | head -1 || true)"',
    'grep -q x file',
    'grep -q x <<<"$v"',
    "elif [ x ] || awk 'BEGIN{exit 1}'; then",
    '# docker ps | grep -q old comment'
  ])
    assert.deepEqual(offenders('x.sh', line), [], line)
})
