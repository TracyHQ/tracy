#!/usr/bin/env node
// K6: on a local DDEV site with the contract bound, edit one text slot through the site's own
// content door and prove the new words reach the home page. `afterRevision` alone is not proof: the
// door can accept a change the page never shows, so the page itself is read before and after.
//
// Slot rule: type "text", requiresEvidence false, current value plain [A-Za-z0-9 ]+, maxCharacters
// >= 20, not contained in the new text, and found exactly once on the home page. The page text right after it is
// kept as an anchor, so the after-check proves the same spot changed.
//
// Usage: node k6-edit-one-slot.mjs --site <DDEV project dir> --token-file <file> --contract-id <id>
//          [--stop-on-warnings]
// --stop-on-warnings: fail right after inspect, before any write, when the freshly bound site already
// reports design-drift warnings (the run must stop there and report, not edit a slot first).
// The token is never printed. Each door call writes a request file (it holds the token) into the
// site root for the container to read, and deletes it as soon as the call returns.
// Prints one JSON line on stdout; exit 0 = pass, 1 = fail or site unreachable.

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const DOOR = 'http://127.0.0.1/index.php?option=com_claudecowork&task=api.exec&format=json'
const PLAIN = /^[A-Za-z0-9 ]+$/
// Characters of page text kept right after the old words; the after-check looks for new words + this anchor.
const ANCHOR_LENGTH = 40

function finish(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.ok ? 0 : 1)
}

function fail(message, extra = {}) {
  process.stderr.write(`k6-edit-one-slot: ${message}\n`)
  finish({ ok: false, error: message, ...extra })
}

let args
try {
  ;({ values: args } = parseArgs({
    options: {
      site: { type: 'string' },
      'token-file': { type: 'string' },
      'contract-id': { type: 'string' },
      'stop-on-warnings': { type: 'boolean' }
    }
  }))
} catch (error) {
  fail(error.message)
}
const { site } = args
const contractId = args['contract-id']
if (!site || !args['token-file'] || !contractId) fail('--site, --token-file and --contract-id are required')

let token
try {
  token = readFileSync(args['token-file'], 'utf8').trim()
} catch (error) {
  fail(`cannot read token file: ${error.message}`)
}
if (!token) fail('token file is empty')

// POST one content.contract call from inside the web container; the request file never outlives it.
function door(params) {
  const name = `k6-request-${process.pid}.json`
  const path = join(site, name)
  let out
  try {
    writeFileSync(path, JSON.stringify({ token, action: 'content.contract', params }), { mode: 0o600 })
    // --max-time 300: curl gives up on one door call after 5 minutes instead of waiting forever.
    // maxBuffer: room for the whole door answer (Node's default is 1 MiB; JA Spa's inspect answer was 657 KB).
    out = execFileSync(
      'ddev',
      [
        'exec',
        `curl -sS --max-time 300 -X POST -H 'Content-Type: application/json' --data @/var/www/html/${name} '${DOOR}'`
      ],
      { cwd: site, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }
    )
  } catch (error) {
    rmSync(path, { force: true })
    fail(`door call ${params.operation} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
  rmSync(path, { force: true })
  // The raw body is never echoed: an error page may reflect the request, token included.
  let answer
  try {
    answer = JSON.parse(out.toString())
  } catch {
    fail(`door call ${params.operation} did not answer JSON (${out.length} bytes, body not shown)`)
  }
  if (answer === null || typeof answer !== 'object')
    fail(`door call ${params.operation} answered ${typeof answer}`)
  return answer
}

// `extra` rides along in a failure, so a read that breaks after apply still reports what was changed.
async function page(url, extra = {}) {
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    fail(`cannot open ${url}: ${error.message}`, extra)
  }
  if (response.status !== 200) fail(`${url} answered HTTP ${response.status}`, extra)
  try {
    return await response.text()
  } catch (error) {
    fail(`cannot read the body of ${url}: ${error.message}`, extra)
  }
}

const count = (text, part) => text.split(part).length - 1

let url
try {
  const described = JSON.parse(
    execFileSync('ddev', ['describe', '-j'], { cwd: site, stdio: ['ignore', 'pipe', 'pipe'] })
  )
  url = described.raw?.httpurl || described.raw?.primary_url
} catch (error) {
  fail(`ddev describe failed in ${site}: ${error.stderr?.toString().trim() || error.message}`)
}
if (!url) fail(`ddev describe gave no site URL for ${site}`)
url = `${url.replace(/\/$/, '')}/`

const inspect = door({ operation: 'inspect' })
const inspectSummary = {
  contract: inspect.contract,
  revision: inspect.revision,
  slotCount: inspect.slots?.length ?? 0,
  warnings: inspect.warnings ?? null
}
if (inspect.ok !== true)
  fail(`inspect refused: ${inspect.error ?? inspect.message ?? 'no reason'}`, { inspect: inspectSummary })
if (inspect.contract !== contractId)
  fail(`site is bound to ${inspect.contract}, expected ${contractId}`, { inspect: inspectSummary })
if (args['stop-on-warnings'] && Array.isArray(inspect.warnings) && inspect.warnings.length > 0)
  fail(`inspect reports ${inspect.warnings.length} warning(s) right after binding; nothing was applied`, {
    inspect: inspectSummary
  })

const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12)
const newText = `K6 edit ${stamp.slice(6)}`

const before = await page(url)
if (count(before, newText) !== 0)
  fail(`new text ${newText} already shows on ${url}`, { inspect: inspectSummary })
// A slot whose current words sit inside the new text would still count as "old found" after a
// correct edit, so such a slot is skipped.
const slot = (inspect.slots ?? []).find(
  (s) =>
    s.type === 'text' &&
    s.requiresEvidence === false &&
    typeof s.current === 'string' &&
    PLAIN.test(s.current) &&
    s.current.trim() !== '' &&
    // maxCharacters >= 20: slot rule taken as-is from the JA Spa K6 plan (step 8.6).
    s.maxCharacters >= 20 &&
    s.maxCharacters >= newText.length &&
    !newText.includes(s.current) &&
    count(before, s.current) === 1
)
if (!slot) fail(`no slot matches the K6 rule on ${url}`, { inspect: inspectSummary, url })

const end = before.indexOf(slot.current) + slot.current.length
const anchor = before.slice(end, end + ANCHOR_LENGTH)

const selection = {
  key: slot.key,
  entity: slot.entity,
  label: slot.label,
  maxCharacters: slot.maxCharacters,
  old: slot.current,
  new: newText,
  url,
  beforeCount: 1,
  anchor
}

const applied = door({
  operation: 'apply',
  expected_revision: inspect.revision,
  apply_id: `contract-k6-${stamp}`,
  request_id: `k6-${stamp}`,
  changes: { [slot.key]: newText },
  evidence: {}
})
const applySummary = { ok: applied.ok, ids: applied.ids, afterRevision: applied.afterRevision }
if (applied.ok !== true || !applied.afterRevision)
  fail(`apply refused: ${applied.error ?? applied.message ?? 'no afterRevision'}`, {
    inspect: inspectSummary,
    selection,
    apply: applySummary
  })

const after = await page(url, { inspect: inspectSummary, selection, apply: applySummary })
const newCount = count(after, newText)
const oldCount = count(after, slot.current)
const anchorFound = after.includes(newText + anchor)
const ok = newCount >= 1 && oldCount === 0 && anchorFound
if (!ok)
  process.stderr.write(
    `k6-edit-one-slot: page after apply: new ${newCount}x, old ${oldCount}x, anchor ${anchorFound ? 'kept' : 'lost'}\n`
  )
finish({
  ok,
  inspect: inspectSummary,
  selection,
  apply: applySummary,
  page: { url, newCount, oldCount, anchorFound }
})
