#!/usr/bin/env node
/**
 * Run the Onboard-Agent acceptance cases (README-less on purpose: every case's header says what it
 * checks; tasks/todo-desktop-onboard-agent.md "Independent acceptance on dev" says why).
 *
 *   node tests/acceptance/desktop-onboard/run.mjs --base https://cowork.tracy.site \
 *     [--only ACC-1,ACC-2] [--out <dir>] [--cookie-file <f>] [--admin-cookie-file <f>] \
 *     [--site <siteKey>] [--chat] [--manual-wait <min>] [--email <addr>]
 *
 * One line per case: `ACC-n PASS|FAIL|BLOCKED|MANUAL — <what was observed>`; evidence in
 * `<out>/ACC-n/`, and `<out>/results.json`. Exit 1 when any case FAILs. Cases run one after another
 * (the desktop ones each launch their own app from source).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, targetKind } from './lib.mjs'

const CASES = ['ACC-1', 'ACC-2', 'ACC-3', 'ACC-4', 'ACC-5', 'ACC-6', 'ACC-7', 'ACC-8', 'ACC-9']

const opts = parseArgs()
const chosen = opts.only ?? CASES
for (const id of chosen) if (!CASES.includes(id)) throw new Error(`unknown case ${id}`)
mkdirSync(opts.out, { recursive: true })
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
  `${JSON.stringify({ base: opts.base, at: new Date().toISOString(), results }, null, 2)}\n`
)
// chrome-watch's Chrome stays up for the person; only our CDP connection keeps the process alive.
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
