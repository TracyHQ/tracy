#!/usr/bin/env node
/**
 * Gate: each EmDash template in `packages/cms/` carries `docs/generated/inventory.{json,md}`, a
 * source inventory written by the package's own `tools/generate-docs.mjs` — collections, menus,
 * route files and a sha256 of every input. Agents and admins read it as the description of the
 * template, and nothing errors when it goes stale.
 *
 * WHY A MACHINE (measured 26/09/2026, issue #404): both inventories were stale on `develop`, and
 * had been since the commits that last regenerated them (Base at ffa1ef05a, Business at
 * ad0fb45dd) — each already disagreed with its own sources in the commit that wrote it. After
 * that, 26 commits touched Business (version bumps, locales, three new `src/lib/` files, Content
 * API, middleware) and 12 touched Base, none updating the inventory. The generator has a
 * `--check` mode; no gate ran it, so no review saw the drift.
 *
 * The generator (and its comparison rule) belongs to the skill kit and is copied into each
 * template (`kit-manifest.json`, guarded by `emdash-kit-sync`); this file only wires it up and
 * collects both results. Compare, never regenerate. A missing package, a missing generator, a
 * failed spawn or a signal is RED, never a skip: a gate that stands itself down reports the same
 * green as one that ran.
 *
 *   node scripts/check-emdash-inventory.mjs [--root DIR]   # --root: a fixture tree, for tests
 */
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATES = ['tracy-emdash-theme-base', 'tracy-emdash-theme-business', 'tracy-emdash-theme-saas']
export const GENERATOR = 'tools/generate-docs.mjs'

/**
 * The verdict for every template, from what is on disk and what its generator said. No I/O of its
 * own: `exists` and `run` are the two doors to the outside.
 * @param {object} io
 * @param {string} io.root - the tree that holds `packages/cms/<template>`.
 * @param {(file: string) => boolean} io.exists
 * @param {(script: string, cwd: string) => {status: number|null, signal?: string|null, error?: Error, stdout?: string, stderr?: string}} io.run
 *   runs `node <script> --check` with `cwd` as the package (the generator resolves inputs relative to it).
 * @returns {{bad: number, lines: Array<['out'|'err', string]>}} every line with its stream, in print order.
 */
export function checkTemplates({ root, exists, run }) {
  const lines = []
  const out = (line) => lines.push(['out', line])
  const err = (line) => lines.push(['err', line])
  let bad = 0
  for (const t of TEMPLATES) {
    const pkg = path.join(root, 'packages/cms', t)
    const script = path.join(pkg, GENERATOR)
    if (!exists(pkg)) {
      err(`  ${t}: package directory missing`)
      bad++
      continue
    }
    if (!exists(script)) {
      err(`  ${t}: ${GENERATOR} missing`)
      bad++
      continue
    }
    const r = run(script, pkg)
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
    if (r.status === 0) {
      out(`  ${t}: inventory current`)
      continue
    }
    bad++
    const why = r.error
      ? `spawn failed: ${r.error.message}`
      : r.signal
        ? `killed by ${r.signal}`
        : `exit ${r.status}`
    err(`  ${t}: STALE OR UNCHECKED (${why})`)
    for (const line of text.split('\n')) if (line) err(`      ${line}`)
    err(`      → cd packages/cms/${t} && node ${GENERATOR}, then commit docs/generated/`)
  }
  if (bad) {
    err(`\ncheck-emdash-inventory: ${bad}/${TEMPLATES.length} template inventories not current.`)
  } else {
    out(`check-emdash-inventory: ${TEMPLATES.length} template inventories current.`)
  }
  return { bad, lines }
}

function main(args) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  if (args.length === 2 && args[0] === '--root') root = path.resolve(args[1])
  else if (args.length) {
    console.error('usage: node scripts/check-emdash-inventory.mjs [--root DIR]')
    return 2
  }
  const { bad, lines } = checkTemplates({
    root,
    exists: existsSync,
    run: (script, cwd) => spawnSync(process.execPath, [script, '--check'], { cwd, encoding: 'utf8' })
  })
  for (const [stream, line] of lines) (stream === 'out' ? console.log : console.error)(line)
  return bad ? 1 : 0
}

// realpath on both sides: a temp path on macOS is reached through a symlink (/var -> /private/var).
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)))
}
