#!/usr/bin/env node
/**
 * Run the desktop first-run v2 end-to-end cases ST-1 … ST-9 (tasks/todo-desktop-onboard-v2.md,
 * step "E. E2E on the local stand"; each case's header says what it checks).
 *
 *   node tests/acceptance/desktop-onboard-v2/run.mjs --base http://ob2.tracy.test:46080 \
 *     [--old-base http://oa.tracy.test:44080] [--only ST-1,ST-2] [--out <dir>]
 *   # dev (real mail): add --typed <an inbox you read> --code-file <file you write the code into>
 *
 * Needs: the desktop window shell built once (`node packages/desktop/tracy-desktop/build/build-shell.mjs`)
 * and chrome-watch. One line per case: `ST-n PASS|FAIL|BLOCKED — <what was observed>`; evidence in
 * `<out>/ST-n/`, and `<out>/results.json`. Exit 1 when any case FAILs.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CASES, parseArgs, targetKind } from './lib.mjs'

const opts = parseArgs()
const chosen = opts.only ?? CASES
for (const id of chosen) if (!CASES.includes(id)) throw new Error(`unknown case ${id}`)
process.stdout.write(`# ${chosen.join(',')} against ${opts.base} (${targetKind(opts.base)}) → ${opts.out}\n`)

const results = []
for (const id of chosen) {
  const mod = await import(`./${id.toLowerCase()}.mjs`)
  const started = Date.now()
  const r = await mod.run(opts)
  r.seconds = Math.round((Date.now() - started) / 1000)
  results.push(r)
  process.stdout.write(`${r.id} ${r.status} — ${r.why}\n`)
}
writeFileSync(
  join(opts.out, 'results.json'),
  `${JSON.stringify({ base: opts.base, oldBase: opts.oldBase, at: new Date().toISOString(), results }, null, 2)}\n`
)
// chrome-watch's Chrome stays up for the person; only our CDP connection keeps the process alive.
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
