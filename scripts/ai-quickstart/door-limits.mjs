#!/usr/bin/env node
/**
 * Prove on a real blank site that the door holds every text place to the kit's own limit (ticket #584, gate #585).
 *
 *   TRACY_DOOR_URL=<site base URL> TRACY_DOOR_TOKEN=<the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/door-limits.mjs <AI quickstart folder> [--report <file.json>]
 *
 * The site is a throwaway blank site bound to the blank site contract, as for `door-proof.mjs`. Through the plugin's
 * door (`content.contract`) it:
 *   1. reads the installed plugin's version (`info`) and the bound contract;
 *   2. writes, in one apply, a value of exactly the kit's limit into every text place a kit field with a limit is
 *      stored as a whole (a place shared by several fields: the smallest), and the empty title of each module it
 *      writes; every value must be written;
 *   3. sends, one apply each, the limit plus one character: each must be refused with SLOT_TOO_LONG and the site's
 *      revision must not move.
 * A text piece inside a stored HTML value (`<key>@<xpath>`) is not one of them: the door counts the whole value, so
 * a piece's own limit is the build's to keep (`blank-site-contract-fit.mjs`).
 * Exits 0 when every place holds, 1 otherwise.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { kitUsesBySlot } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract-fit.mjs'

const argv = process.argv.slice(2)
const folder = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--report')
const reportFile = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : null
const base = (process.env.TRACY_DOOR_URL ?? '').replace(/\/+$/, '')
const token = process.env.TRACY_DOOR_TOKEN ?? ''
if (!folder || !base || !token) {
  console.error(
    'usage: TRACY_DOOR_URL=... TRACY_DOOR_TOKEN=... door-limits.mjs <AI quickstart folder> [--report <file>]'
  )
  process.exit(2)
}
const DOOR = 'index.php?option=com_claudecowork&task=api.exec&format=json'

async function door(action, params) {
  const response = await fetch(`${base}/${DOOR}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action, params })
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, error: 'not_json', message: `HTTP ${response.status}: ${text.slice(0, 200)}` }
  }
}

/** Invented words of exactly `n` visible characters: letters in groups of five, no space at either end. */
export function wordsOf(n) {
  let out = ''
  for (let i = 0; out.length < n; i += 1) out += (i + 1) % 6 === 0 ? ' ' : 'abcdefghij'[i % 10]
  return out.slice(0, n - 1) + 'z'
}

const blockStore = JSON.parse(readFileSync(path.join(folder, 'block-store.json'), 'utf8'))
const uses = kitUsesBySlot(blockStore)
const report = { plugin: null, contract: null, written: [], refused: [], problems: [] }
let stamp = Date.now()
const apply = (state, changes) =>
  door('content.contract', {
    operation: 'apply',
    apply_id: `contract-door-limits-${(stamp += 1)}`,
    request_id: `door-limits-${stamp}`,
    expected_revision: state.revision,
    changes,
    evidence: Object.fromEntries(Object.keys(changes).map((k) => [k, 'invented: a door limit proof value']))
  })

async function main() {
  const info = await door('info', {})
  report.plugin = info.info?.component ?? null
  const state = await door('content.contract', { operation: 'inspect' })
  if (state.ok !== true) throw new Error(`inspect: ${state.error}: ${state.message}`)
  report.contract = state.contract
  const slots = new Map(state.slots.map((s) => [s.key, s]))
  const cases = []
  for (const [key, use] of uses) {
    const slot = slots.get(key)
    if (!slot || slot.type !== 'text' || !use.whole.length) continue
    cases.push({
      key,
      limit: Math.min(...use.whole.map((w) => w.limit)),
      fields: use.whole.map((w) => w.field)
    })
  }
  const changes = Object.fromEntries(cases.map((c) => [c.key, wordsOf(c.limit)]))
  for (const entity of new Set(cases.map((c) => slots.get(c.key).entity))) {
    const title = [...slots.values()].find(
      (s) => s.entity === entity && s.column === 'title' && !s.jsonPath && s.current.trim() === ''
    )
    if (title && !(title.key in changes)) changes[title.key] = 'Invented title'
  }
  const written = await apply(state, changes)
  if (written.ok !== true) {
    report.problems.push(
      `at the limit: ${written.error} ${JSON.stringify(written.errors ?? written.message).slice(0, 3000)}`
    )
    return
  }
  const now = await door('content.contract', { operation: 'inspect' })
  const read = new Map(now.slots.map((s) => [s.key, s.current]))
  for (const c of cases) {
    const ok = read.get(c.key) === changes[c.key]
    report.written.push({ slot: c.key, limit: c.limit, ok })
    if (!ok)
      report.problems.push(`${c.key}: wrote ${c.limit} characters, reads ${JSON.stringify(read.get(c.key))}`)
  }
  for (const c of cases) {
    const answer = await apply(now, { [c.key]: wordsOf(c.limit + 1) })
    const codes = (answer.errors ?? []).map((e) => e.code)
    const ok = answer.ok === false && codes.includes('SLOT_TOO_LONG')
    report.refused.push({ slot: c.key, limit: c.limit, ok, got: answer.ok ? 'written' : codes })
    if (!ok)
      report.problems.push(
        `${c.key}: ${c.limit + 1} characters gave ${answer.ok ? 'written' : codes.join(',')}`
      )
  }
  const after = await door('content.contract', { operation: 'inspect' })
  if (after.revision !== now.revision) report.problems.push('a refused apply moved the site revision')
}

try {
  await main()
} catch (error) {
  report.problems.push(error.message)
}
if (reportFile) writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`)
console.log(`plugin ${report.plugin}, contract ${report.contract}`)
console.log(
  `at the limit: ${report.written.filter((w) => w.ok).length} of ${report.written.length} written; limit + 1: ${report.refused.filter((r) => r.ok).length} of ${report.refused.length} refused`
)
for (const p of report.problems.slice(0, 40)) console.log(`FAIL ${p}`)
process.exit(report.problems.length ? 1 : 0)
