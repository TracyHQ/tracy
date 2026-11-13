#!/usr/bin/env node
/**
 * Prove on a real blank site that the build writes into the places the blank site emptied (ticket #584, gate #585).
 * It writes the store records themselves through the blank site contract: the part of the build that writes in place
 * (single-instance chrome and site language strings). In-page blocks are copies of the store records, proved by
 * `copy-proof.mjs`.
 *
 *   TRACY_DOOR_URL=<site base URL> TRACY_DOOR_TOKEN=<the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/door-proof.mjs <AI quickstart folder> [--report <file.json>]
 *
 * The site is a blank site of that AI quickstart with the Claude Cowork plugin it pins, its `contract` param naming
 * the blank site contract (`<folder>/blank-site-contract/`) and that profile on disk (`docs/references/
 * ai-quickstart-contract.md`, "The blank site contract"). Through the plugin's door (`content.contract`) it:
 *   1. binds the site (a bound site answers bound again) and inspects it: the contract must be the blank site one;
 *   2. picks one place of every address kind from the mapping file, and every text node place
 *      (`door-proof-cases.mjs`), and checks each is empty on the site;
 *   3. writes an invented value into all of them in one apply (a piece is set inside its slot's stored value with the
 *      plugin's own functions, `html-piece.php`, and the whole value is written under the slot's key);
 *   4. inspects again and reads each value back from the rows the plugin reads;
 *   5. sends three applies the plugin must refuse: a slot of a record the blank site removed, a slot no contract
 *      names, and emptying a slot the blank site keeps occupied (an HTML value whose pieces it emptied); the site's
 *      revision must not move;
 *   6. empties again a place it filled (a whole slot, which opens empty), and reads it back empty: the state the blank
 *      site shipped is one an edit may return to;
 *   7. asks the site's home address before and after: the answer must not turn into a server error.
 * The site is written: run it on a throwaway site only. Needs php on PATH (the plugin's functions run here).
 * Exits 0 when every step holds, 1 otherwise; the report says which.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLANK_CONTRACT_DIR } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract.mjs'
import { EMPTY_HTML } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs'
import { coworkLib } from '../../packages/cms/tracy-joomla-quickstart/scripts/cowork-lib.mjs'
import {
  doorProofCases,
  mappingLocations,
  proofValue
} from '../../packages/cms/tracy-joomla-quickstart/scripts/door-proof-cases.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOOR = 'index.php?option=com_claudecowork&task=api.exec&format=json'

function usage(message) {
  if (message) console.error(message)
  console.error(
    'usage: TRACY_DOOR_URL=... TRACY_DOOR_TOKEN=... door-proof.mjs <AI quickstart folder> [--report <file>]'
  )
  process.exit(2)
}

const argv = process.argv.slice(2)
const folder = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--report')
const reportFile = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : null
const base = (process.env.TRACY_DOOR_URL ?? '').replace(/\/+$/, '')
const token = process.env.TRACY_DOOR_TOKEN ?? ''
if (!folder) usage()
if (!base || !token) usage('TRACY_DOOR_URL and TRACY_DOOR_TOKEN are required')

const readJson = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const mapping = readJson('mapping.json')
const contractId = readJson(`${BLANK_CONTRACT_DIR}/manifest.json`).id
const report = { contract: contractId, steps: [], cases: [], refusals: [], ok: true }
const fail = (step, message) => {
  report.ok = false
  report.steps.push({ step, ok: false, message })
}
const pass = (step, detail) => report.steps.push({ step, ok: true, ...(detail ? { detail } : {}) })

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

const homeStatus = async () => (await fetch(`${base}/`, { redirect: 'manual' })).status
const codesOf = (answer) => (answer.errors ?? []).map((e) => e.code)

const lib = await coworkLib()
if (lib.skip) usage(lib.skip)
function pieces(list) {
  const out = JSON.parse(
    execFileSync('php', [path.join(HERE, 'html-piece.php')], {
      input: JSON.stringify({ lib: lib.lib, markers: EMPTY_HTML, pieces: list }),
      maxBuffer: 1 << 26
    })
  )
  for (const r of out) if (r.error) throw new Error(r.error)
  return out
}

async function inspect() {
  const answer = await door('content.contract', { operation: 'inspect' })
  if (answer.ok !== true) throw new Error(`inspect: ${answer.error}: ${answer.message}`)
  return answer
}

/** What each case reads on the site now: the slot's value, or the text of the piece inside it. */
function readCases(cases, slots) {
  const asked = cases.filter((c) => c.loc.piece)
  const read = asked.length
    ? pieces(asked.map((c) => ({ value: slots.get(c.loc.slot).current, xpath: c.loc.xpath })))
    : []
  return cases.map((c) => (c.loc.piece ? read[asked.indexOf(c)].text : slots.get(c.loc.slot).current))
}

async function main() {
  const before = await homeStatus()
  const bound = await door('content.contract', { operation: 'bind' })
  if (bound.ok !== true || bound.contract !== contractId)
    return fail('bind', `${bound.error ?? ''} ${bound.message ?? bound.contract ?? ''}`.trim())
  pass('bind', { contract: bound.contract, warnings: (bound.warnings ?? []).map((w) => w.message) })

  let state = await inspect()
  if (state.contract !== contractId) return fail('inspect', `the site is bound to ${state.contract}`)
  let slots = new Map(state.slots.map((s) => [s.key, s]))
  pass('inspect', { slots: slots.size, warnings: (state.warnings ?? []).map((w) => w.message) })

  const { cases, missing } = doorProofCases({ mapping, slots })
  if (missing.length) fail('cases', `no place on a named record for: ${missing.join(', ')}`)
  const emptyNow = readCases(cases, slots)
  const changes = {}
  const evidence = {}
  const setPieces = []
  cases.forEach((c, i) => {
    const value = proofValue(c.loc, slots.get(c.loc.slot), i)
    report.cases.push({
      name: c.name,
      at: c.at,
      slot: c.loc.slot,
      ...(c.loc.piece ? { piece: c.loc.xpath } : {}),
      value,
      before: emptyNow[i]
    })
    if (emptyNow[i].trim() !== '')
      fail('emptied', `${c.name} ${c.at} holds "${emptyNow[i].slice(0, 40)}" on the blank site`)
    if (c.loc.piece)
      setPieces.push({ i, value: slots.get(c.loc.slot).current, xpath: c.loc.xpath, set: value })
    else changes[c.loc.slot] = value
    evidence[c.loc.slot] = 'invented: a door proof value'
  })
  // Joomla refuses to save a module with no title ("Module must have a title"), and the blank site empties a title the
  // mapping declares: a write to any other column of such a module writes its title in the same apply.
  const titles = []
  for (const entity of new Set(cases.map((c) => c.loc.entity))) {
    const title = [...slots.values()].find(
      (s) => s.entity === entity && s.column === 'title' && !s.jsonPath && s.current.trim() === ''
    )
    if (title && !(title.key in changes)) {
      changes[title.key] = `Title ${titles.length}`
      evidence[title.key] = 'invented: a door proof value'
      titles.push(title.key)
    }
  }
  if (titles.length) report.titlesWritten = titles
  const patched = setPieces.length
    ? pieces(setPieces.map(({ value, xpath, set }) => ({ value, xpath, set })))
    : []
  setPieces.forEach((p, k) => {
    changes[cases[p.i].loc.slot] = patched[k].value
  })

  const stamp = Date.now()
  const applied = await door('content.contract', {
    operation: 'apply',
    apply_id: `contract-door-proof-${stamp}`,
    request_id: `door-proof-${stamp}`,
    expected_revision: state.revision,
    changes,
    evidence
  })
  if (applied.ok !== true)
    return fail(
      'apply',
      `${applied.error}: ${applied.message} ${JSON.stringify(applied.errors ?? []).slice(0, 2000)}`
    )
  pass('apply', { slots: Object.keys(changes).length })

  state = await inspect()
  slots = new Map(state.slots.map((s) => [s.key, s]))
  const now = readCases(cases, slots)
  cases.forEach((c, i) => {
    report.cases[i].read = now[i]
    report.cases[i].ok = now[i] === report.cases[i].value
    if (!report.cases[i].ok) fail('read back', `${c.name} ${c.at} reads "${now[i]}"`)
  })
  if (report.ok) pass('read back', { cases: cases.length })

  // A slot of a record the blank site removed: a mapping place on a record the build creates.
  const removedSlot = mappingLocations(mapping).find(
    ({ loc }) => loc.slot && mapping.entities[loc.entity]?.created && !slots.has(loc.slot)
  )?.loc.slot
  const occupied = cases.find((c) => c.loc.piece && slots.get(c.loc.slot).sample.trim() !== '')?.loc.slot
  const refusals = [
    ['a slot of a removed record', removedSlot, 'Word', 'SLOT_UNKNOWN'],
    ['a slot no contract names', 'no-such-record.0', 'Word', 'SLOT_UNKNOWN'],
    ['emptying a slot the blank site keeps occupied', occupied, '', 'SLOT_EMPTY_STATE']
  ]
  for (const [name, key, value, code] of refusals) {
    if (!key) {
      fail('refusal', `${name}: no such place to try`)
      continue
    }
    const t = Date.now()
    const answer = await door('content.contract', {
      operation: 'apply',
      apply_id: `contract-door-proof-no-${t}`,
      request_id: `door-proof-no-${t}`,
      expected_revision: state.revision,
      changes: { [key]: value },
      evidence: { [key]: 'invented: a door proof value' }
    })
    const ok = answer.ok === false && codesOf(answer).includes(code)
    report.refusals.push({
      name,
      slot: key,
      expected: code,
      got: answer.ok ? 'written' : codesOf(answer),
      ok
    })
    if (!ok)
      fail(
        'refusal',
        `${name} (${key}): ${answer.ok ? 'written' : JSON.stringify(answer.errors ?? answer.message)}`
      )
  }
  const after = await inspect()
  if (after.revision !== state.revision) fail('refusal', 'a refused apply moved the site revision')
  else pass('refusals', { refused: report.refusals.filter((r) => r.ok).length })

  // A whole slot the build filled may be emptied again: the blank site shipped it empty (`opensEmpty`). A text node
  // keeps one space, as the blank site step leaves it: an empty string would take the node away.
  const plain = cases.find((c) => !c.loc.piece && slots.get(c.loc.slot).opensEmpty)?.loc.slot
  if (!plain) fail('empty again', 'no place that opens empty to try')
  else {
    const blank = /text\(\)/.test(slots.get(plain).xpath ?? '') ? ' ' : ''
    const t = Date.now()
    const answer = await door('content.contract', {
      operation: 'apply',
      apply_id: `contract-door-proof-clear-${t}`,
      request_id: `door-proof-clear-${t}`,
      expected_revision: after.revision,
      changes: { [plain]: blank }
    })
    const read = answer.ok ? (await inspect()).slots.find((s) => s.key === plain)?.current : null
    report.emptiedAgain = {
      slot: plain,
      ok: answer.ok === true && read?.trim() === '',
      got: answer.ok ? read : codesOf(answer)
    }
    if (!report.emptiedAgain.ok) fail('empty again', `${plain}: ${JSON.stringify(report.emptiedAgain.got)}`)
    else pass('empty again', { slot: plain })
  }

  const home = await homeStatus()
  report.home = { before, after: home }
  if (home >= 500 || home !== before) fail('serves', `home answered ${before} before and ${home} after`)
  else pass('serves', report.home)
}

try {
  await main()
} catch (error) {
  fail('door', error.message)
}
const text = `${JSON.stringify(report, null, 2)}\n`
if (reportFile) writeFileSync(reportFile, text)
for (const s of report.steps)
  console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.step}${s.message ? `: ${s.message}` : ''}`)
for (const c of report.cases)
  console.log(
    `${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.slot}${c.piece ? `@${c.piece}` : ''} = ${JSON.stringify(c.read)}`
  )
for (const r of report.refusals)
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} refused ${r.name}: ${r.slot} ${JSON.stringify(r.got)}`)
console.log(report.ok ? 'door proof: every step holds' : 'door proof: FAILED')
process.exit(report.ok ? 0 : 1)
