/**
 * The design-system slot through the SHIPPED bundle (`lib/index.js`): a step's site context reads the
 * slot from the site's own container and names it, and `tracy_design_check` never answers "This site
 * wears no design system" for a site wearing one — the wiring `ds-slot-worn.test.mjs` cannot see.
 * Measured 09–10/10/2026 on the stand: neither happened, on any CMS.
 *
 *   node --test packages/tools/tracy-site-tools/test/ds-slot-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'

const EMDASH = JSON.parse(
  readFileSync(new URL('fixtures/ds-slot/emdash-dskeepem.json', import.meta.url), 'utf8')
)
const printed = (/** @type {unknown} */ payload) =>
  `TRACY_DS_SLOT ${Buffer.from(JSON.stringify(payload)).toString('base64')}\n`

/** An installed EmDash site folder under a fresh sites root. */
function site(/** @type {string} */ label) {
  const root = mkdtempSync(path.join(tmpdir(), 'ds-slot-wiring-'))
  const cwd = path.join(root, label)
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(cwd, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'emdash' })
  )
  mkdirSync(path.join(cwd, '.webroot'))
  process.env.TRACY_SITES_ROOT = root
  return cwd
}

/** The plugin, booted the way dsh boots it, with a docker transport that answers only the slot read. */
function boot(/** @type {(argv: string[]) => unknown} */ slotAnswer) {
  const listeners = new Map()
  /** @type {Map<string, any>} */
  const tools = new Map()
  /** @type {string[][]} */
  const calls = []
  const exec = async (/** @type {{ argv: string[] }} */ { argv }) => {
    calls.push(argv)
    if (argv.includes('/app/data/ds-slot.css'))
      return { code: 0, stdout: String(slotAnswer(argv)), stderr: '', timedOut: false }
    return { code: 1, stdout: '', stderr: 'not answered in this test', timedOut: false }
  }
  const ctx = {
    webServer: { register: () => () => {} },
    tools: {
      register: (/** @type {any} */ t) => {
        tools.set(t.name, t)
        return () => {}
      },
      schemas: () => []
    },
    effect: (/** @type {() => void} */ setup) => {
      setup()
    },
    on: (/** @type {string} */ name, /** @type {Function} */ fn) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: () => undefined
  }
  apply(
    /** @type {any} */ (ctx),
    /** @type {any} */ ({ exec, viewContext: false, emdash: { cms: async () => '' }, hostChrome: null })
  )
  return { listeners, tools, calls }
}

const customer = (/** @type {string} */ text) => ({
  id: `m-${Math.random().toString(16).slice(2)}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' }
})

/** One `agent/pre-step` for a customer message; the texts the step enters with. */
async function stepTexts(/** @type {ReturnType<typeof boot>} */ host, /** @type {string} */ cwd) {
  const messages = [customer('Make the hero button bigger and rounder')]
  const input = { messages, agent: { session: { id: 'session-slot', header: { cwd } } } }
  let out
  for (const fn of host.listeners.get('agent/pre-step') ?? [])
    out = await fn(input, async () => ({ kind: 'enter', messages }))
  return (out?.messages ?? []).flatMap((/** @type {any} */ m) =>
    (m.content ?? [])
      .filter((/** @type {any} */ c) => c.type === 'text')
      .map((/** @type {any} */ c) => c.text)
  )
}

test('🔒 a step on a site wearing a slot: the context reads it from the site container and names the system', async () => {
  const cwd = site('slotem1')
  // the same read sends the role reads of the template's own stylesheets beside the slot
  const host = boot(() =>
    printed({
      ...EMDASH,
      roles: 'var(--ds-c-accent, #da5a2a);\nvar(--ds-btn-radius, 999px);\nvar(--ds-btn-pad-y, 15px)'
    })
  )
  const texts = await stepTexts(host, cwd)
  const context = texts.find((t) => t.includes('This workspace is the site')) ?? ''
  assert.match(
    context,
    /^- Design system: Moxie \(`refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0`\), worn through Tracy's design-system slot/m
  )
  // review of #1513 (21/10/2026): each example carries the TEMPLATE's own value as its fallback
  assert.match(context, /`bg-\[var\(--ds-c-accent,#da5a2a\)\]`, `!rounded-\[var\(--ds-btn-radius,999px\)\]`/)
  assert.match(context, /`!py-\[calc\(var\(--ds-btn-pad-y,15px\)\+4px\)\]`/)
  assert.match(context, /replace every literal the element already carries for one/)
  const reads = host.calls.filter((argv) => argv.includes('/app/data/ds-slot.css'))
  assert.equal(reads.length, 1)
  assert.deepEqual(
    reads[0].slice(0, 4),
    ['exec', '-u', 'www-data', 'slotem1-web-1'],
    "this site's own container, as www-data"
  )
  delete process.env.TRACY_SITES_ROOT
})

// Akemi, 20/10/2026: a site wearing nothing is told the roles its template reads, so a new element
// follows the template now and a design system applied later. Before: "says nothing about a system".
test('🔒 a step on a site wearing nothing: the context names the template’s role variables and the new-element rule', async () => {
  const cwd = site('slotem2')
  const host = boot(() => printed({ ok: true, css: null }))
  const context = (await stepTexts(host, cwd)).find((t) => t.includes('This workspace is the site')) ?? ''
  assert.ok(context !== '')
  // this container's read carries no role reads: no role is claimed (a template from before the readiness round)
  assert.match(
    context,
    /^- Design system: none worn — the site shows its template's own look; keep to the template's own classes/m
  )
  assert.doesNotMatch(context, /role variables/)
  assert.match(
    context,
    /A NEW element \(button, card, section\) copies the classes of the template's own element of that kind/
  )
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 a step on a site wearing nothing whose template reads the roles: the context names them', async () => {
  const cwd = site('slotem5')
  const host = boot(() =>
    printed({ ok: true, css: null, roles: 'var(--ds-c-accent, #da5a2a);\nvar(--ds-btn-radius, 999px)' })
  )
  const context = (await stepTexts(host, cwd)).find((t) => t.includes('This workspace is the site')) ?? ''
  assert.match(
    context,
    /^- Design system: none worn — the site shows its template's own look\. The template's stylesheets read Tracy's design-system role variables/m
  )
  assert.match(context, /`bg-\[var\(--ds-c-accent,<the template's value>\)\]`/)
  delete process.env.TRACY_SITES_ROOT
})

// Review of #1513 (21/10/2026): a read that did not answer left the step with no design line and no
// new-element rule. It now gets what holds either way, and no claim about a system.
test('a step whose slot read did not answer: no claim about a system, but the rule for colours, radii and fonts and the new-element rule', async () => {
  const cwd = site('slotem4')
  const host = boot(() => 'no answer line')
  const context = (await stepTexts(host, cwd)).find((t) => t.includes('This workspace is the site')) ?? ''
  assert.ok(context !== '')
  assert.match(context, /^- Design system: whether this site wears one could not be read yet\. /m)
  assert.doesNotMatch(context, /none worn|worn through/)
  assert.match(
    context,
    /with the template's own value as the fallback \(`bg-\[var\(--ds-c-accent,<the template's value>\)\]`/
  )
  assert.match(
    context,
    /A NEW element \(button, card, section\) copies the classes of the template's own element/
  )
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 tracy_design_check on a site wearing a slot never answers "wears no design system": it reads the slot and names it', async () => {
  const cwd = site('slotem3')
  const host = boot(() => printed(EMDASH))
  const check = host.tools.get('tracy_design_check')
  assert.ok(check, 'the tool is registered')
  const answer = await check.execute(
    { path: '/' },
    { agent: { session: { id: 'session-slot', header: { cwd } } } }
  )
  assert.equal(answer.ok, true)
  assert.notDeepEqual(answer.warnings, [{ code: 'NO_DESIGN_BOUND' }])
  assert.doesNotMatch(String(answer.next), /wears no design system/)
  assert.deepEqual(answer.design, { id: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', source: 'slot' })
  // this test's container answers nothing but the slot, so the page is not measured: the skip names the slot
  assert.equal(answer.checked, false)
  assert.equal(answer.warnings[0].code, 'DESIGN_CHECK_SKIPPED')
  assert.match(
    answer.next,
    /the design-system slot this site wears \(`refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0`, `\/app\/data\/ds-slot\.css`/
  )
  assert.doesNotMatch(answer.next, /design\.json/)
  delete process.env.TRACY_SITES_ROOT
})
