/**
 * Gate: `vendor/tracy/dsh-passwords` keeps its upstream core byte-for-byte, except at the hooks.
 *
 * WHY. ADR 0027: the gateway fork is "upstream core pinned to one commit + a Tracy policy layer in
 * `src/tracy/` behind a closed list of hooks". That shape only holds if a machine refuses every
 * other diff — a one-line "convenient" edit to `gateway.ts` is exactly how the previous fork grew
 * 2,500 lines that cost 87 conflict hunks on the next upstream bump. No review reads 4,400 lines
 * of `gateway.ts` for stray edits; this gate does.
 *
 * WHY NOT `git diff <upstream commit>`. The tree came in by subtree squash: the upstream commit is
 * not in this repository's history, so git cannot diff against it. The fork therefore carries
 * `upstream-snapshot.sha256` (one hash per upstream file under `src/` and `test/`, regenerable
 * from a clean clone) and `.upstream-pristine/` (a verbatim copy of each file that has a hook).
 *
 * WHAT IT CHECKS, reading `vendor/tracy/dsh-passwords/tracy-core.json`:
 *   1. Every upstream file in the snapshot still exists and hashes the same — unless it is a hook
 *      file or a named exception. Upstream tests are part of the snapshot: the layer must never
 *      edit them (the pass-through runner is how they stay green).
 *   2. A hook file differs from its pristine copy only by small added hunks that name the layer
 *      (`tracy`/`policy`/…), within the per-file budgets. Removed lines are budgeted too.
 *   3. No upstream-looking file was added outside the Tracy directories (`src/tracy/`, …).
 *   4. The pass-through preload used by `npm run test:upstream` is imported nowhere under `src/`.
 *
 * The gate proves the shape, not the safety of the hooks — that is the job of the ordering and
 * refusal tests in `test/tracy/`.
 *
 *   pnpm exec tsx scripts/check-passwords-core-diff.ts            # the fork in this checkout
 *   TRACY_PASSWORDS_DIR=/path/to/tree pnpm exec tsx scripts/…      # another tree (scratch)
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface HookBudget {
  maxAdded: number
  maxRemoved: number
  maxHunkAdded: number
  allow: string[]
}

export interface CoreConfig {
  upstream: { repo: string; commit: string; tag?: string }
  snapshot: string
  pristine: string
  tracyDirs: string[]
  hooks: Record<string, HookBudget>
  exceptions: Record<string, string>
  forbiddenImports?: { module: string; notUnder: string[] }[]
}

export interface Problem {
  file: string
  message: string
}

/** Read `path` → sha256 hex, or null when the file is missing. */
function sha256(path: string): string | null {
  if (!existsSync(path)) return null
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Parse the snapshot file: `<sha>  <path>` per line, `#` comments allowed. */
export function parseSnapshot(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line)
    if (!m) throw new Error(`snapshot: unreadable line: ${raw}`)
    out.set(m[2].replace(/^\.\//, ''), m[1])
  }
  return out
}

/** A minimal line diff (LCS) — enough to count hunks in files of a few thousand lines. */
export function lineDiff(a: string[], b: string[]): { added: string[][]; removed: string[] } {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i..] and b[j..]; stored as Uint32Array rows to keep memory flat.
  const rows: Uint32Array[] = []
  for (let i = 0; i <= n; i += 1) rows.push(new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    const cur = rows[i]
    const next = rows[i + 1]
    for (let j = m - 1; j >= 0; j -= 1) {
      cur[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], cur[j + 1])
    }
  }
  const added: string[][] = []
  const removed: string[] = []
  let i = 0
  let j = 0
  let hunk: string[] | null = null
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (hunk) {
        added.push(hunk)
        hunk = null
      }
      i += 1
      j += 1
    } else if (j < m && (i >= n || rows[i][j + 1] >= rows[i + 1][j])) {
      ;(hunk ??= []).push(b[j])
      j += 1
    } else {
      removed.push(a[i])
      i += 1
    }
  }
  if (hunk) added.push(hunk)
  return { added, removed }
}

/** Every file under `dir`, as paths relative to `root`, skipping node_modules/dist/.git. */
function walk(root: string, dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(root, full, out)
    else out.push(relative(root, full).split('\\').join('/'))
  }
  return out
}

/** Check one tree against its config; pure apart from reading the tree. */
export function checkTree(tree: string, config: CoreConfig): Problem[] {
  const problems: Problem[] = []
  const snapshotPath = join(tree, config.snapshot)
  if (!existsSync(snapshotPath)) return [{ file: config.snapshot, message: 'snapshot file is missing' }]
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'))
  const hooks = new Set(Object.keys(config.hooks))
  const exceptions = new Set(Object.keys(config.exceptions))

  // 1. Upstream files: present and unchanged, unless hook or exception.
  for (const [file, expected] of snapshot) {
    const actual = sha256(join(tree, file))
    if (actual === null) {
      problems.push({ file, message: 'upstream file deleted or renamed (the core is pinned byte-for-byte)' })
      continue
    }
    if (actual === expected || hooks.has(file) || exceptions.has(file)) continue
    problems.push({
      file,
      message: `differs from upstream ${config.upstream.commit} and is neither a hook nor a named exception`
    })
  }

  // 2. Hook files: only small, named hunks.
  for (const [file, budget] of Object.entries(config.hooks)) {
    const pristine = join(tree, config.pristine, file)
    const current = join(tree, file)
    if (!existsSync(pristine)) {
      problems.push({ file, message: `pristine copy missing at ${config.pristine}/${file}` })
      continue
    }
    if (!existsSync(current)) continue // already reported above
    const pristineSha = sha256(pristine)
    if (pristineSha !== snapshot.get(file)) {
      problems.push({
        file,
        message: 'pristine copy does not match the snapshot hash — regenerate both from the pinned commit'
      })
    }
    const { added, removed } = lineDiff(
      readFileSync(pristine, 'utf8').split('\n'),
      readFileSync(current, 'utf8').split('\n')
    )
    const addedCount = added.reduce((n, h) => n + h.length, 0)
    if (addedCount > budget.maxAdded) {
      problems.push({
        file,
        message: `${addedCount} added lines, budget ${budget.maxAdded} — move logic into src/tracy/`
      })
    }
    if (removed.length > budget.maxRemoved) {
      problems.push({ file, message: `${removed.length} removed lines, budget ${budget.maxRemoved}` })
    }
    added.forEach((hunk, idx) => {
      if (hunk.length > budget.maxHunkAdded) {
        problems.push({
          file,
          message: `hunk ${idx + 1} adds ${hunk.length} lines, budget ${budget.maxHunkAdded} per hook`
        })
      }
      const names = hunk.some((line) =>
        budget.allow.some((token) => line.toLowerCase().includes(token.toLowerCase()))
      )
      if (!names) {
        problems.push({
          file,
          message: `hunk ${idx + 1} names none of [${budget.allow.join(', ')}]: "${hunk[0].trim().slice(0, 80)}"`
        })
      }
    })
  }

  // 3. No new files outside the Tracy directories.
  for (const file of walk(tree, join(tree, 'src')).concat(walk(tree, join(tree, 'test')))) {
    if (snapshot.has(file)) continue
    if (config.tracyDirs.some((d) => file.startsWith(d))) continue
    problems.push({ file, message: 'new file outside the Tracy directories (src/tracy/, …)' })
  }

  // 4. The pass-through preload must not reach the product.
  for (const rule of config.forbiddenImports ?? []) {
    const needle = rule.module.split('/').pop() as string
    for (const file of walk(tree, join(tree, 'src'))) {
      if (!rule.notUnder.some((d) => file.startsWith(d))) continue
      const importsIt = readFileSync(join(tree, file), 'utf8')
        .split('\n')
        .some((line) => /^\s*(import\b|export\b.*\bfrom\b|.*\brequire\()/.test(line) && line.includes(needle))
      if (importsIt) {
        problems.push({ file, message: `imports the test-only preload ${rule.module}` })
      }
    }
  }
  return problems
}

function main(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const tree = process.env.TRACY_PASSWORDS_DIR
    ? resolve(process.env.TRACY_PASSWORDS_DIR)
    : join(root, 'vendor/tracy/dsh-passwords')
  const configPath = join(tree, 'tracy-core.json')
  if (!existsSync(configPath)) {
    // The old-shape fork (2.6.6-tracy.N) has no config: nothing to check until the 2.7.7 line lands.
    process.stdout.write(
      `passwords-core-diff: no tracy-core.json in ${tree} — skipped (pre-ADR-0027 tree).\n`
    )
    return 0
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as CoreConfig
  const problems = checkTree(tree, config)
  if (problems.length === 0) {
    process.stdout.write(
      `passwords-core-diff: core matches upstream ${config.upstream.commit} outside ${Object.keys(config.hooks).length} hook files.\n`
    )
    return 0
  }
  process.stderr.write(`passwords-core-diff: ${problems.length} problem(s):\n`)
  for (const p of problems) process.stderr.write(`  - ${p.file}: ${p.message}\n`)
  return 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
