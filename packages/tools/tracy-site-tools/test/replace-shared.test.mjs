/**
 * The failure behaviours the three replace engines (WordPress, Joomla, EmDash) share, run over one
 * table: a first write the door refuses, a store that changed twice, an answer that never came. Each
 * platform's own faults and facts stay in its own file; here only what every engine must promise.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EMDASH_INDEX_SCRIPT,
  EMDASH_WRITE_SCRIPT,
  parseEmdashIndex,
  parseEmdashWrite
} from '../src/host/exec.mjs'
import { planReplace } from '../src/host/replace.mjs'
import { replaceOnEmdash } from '../src/host/replace-emdash.mjs'
import { replaceOnJoomla } from '../src/host/replace-joomla.mjs'
import { replaceOnWordPress } from '../src/host/replace-wordpress.mjs'
import { createFakeEmdash, runScript } from './fixtures/replace/emdash/fake-emdash.mjs'
import { component, PAGES } from './fixtures/replace/fake-wordpress.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const fixture = (/** @type {string} */ name) =>
  readFileSync(new URL(`./fixtures/replace/${name}`, import.meta.url), 'utf8')
const HOTLINE = { find: '8 800 550-67-89', replace: '0909 123 456' }
const FOOTER_HOURS = { find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' }
const JOOMLA_ASK = { find: 'Selected projects', replace: 'Featured projects' }
const EMDASH_CARD = { find: 'Need a budget estimate for an upcoming build?', replace: 'Ready?', path: '/' }

// ── one driver per platform: run the engine against a fake door with a fault, count what it sent ─────

/**
 * WordPress: the fake component answers like the real one; `script(action, params, n, site)` injects a fault.
 * @param {Record<string, unknown>} call @param {(action: string, params: Record<string, any>, n: number, site: ReturnType<typeof component>) => unknown} script
 */
async function onWordPress(call, script) {
  const site = component({ script: (action, params, n) => script(action, params, n, site) })
  let n = 0
  const out = /** @type {any} */ (
    await replaceOnWordPress({
      plan: planReplace(call),
      read: site.door,
      write: site.door,
      pageHtml: async (/** @type {string} */ path) =>
        path in PAGES
          ? { ok: true, status: 200, html: PAGES[path] }
          : { ok: false, code: 'READ_FAILED', error: 'no page' },
      mintApplyId: () => `replace-test-${(n += 1)}`,
      verify: false
    })
  )
  return {
    out,
    writes: site.writes().length,
    undos: site.calls.filter(([action]) => action === 'apply.revert').length
  }
}

/**
 * Joomla: fake doors that answer each apply from `applies` (the last one repeats).
 * @param {Record<string, unknown>[]} applies @param {Record<string, unknown>} [call]
 */
async function onJoomla(applies, call = JOOMLA_ASK) {
  const snapshot = JSON.parse(fixture('joomla/inspect-1.2.0.json'))
  const html = fixture('pages/joomla-home.html')
  let sent = 0
  const answers = [...applies]
  const out = /** @type {any} */ (
    await replaceOnJoomla({
      plan: planReplace(call),
      snapshot: async () => snapshot,
      apply: async () => {
        sent += 1
        return answers.length > 1 ? answers.shift() : answers[0]
      },
      pageHtml: async () => ({ ok: true, status: 200, html }),
      mint: (/** @type {string} */ prefix) => `${prefix}-mfz3k${sent}-9a1c0d`,
      env: {}
    })
  )
  return { out, writes: sent, undos: 0 }
}

/**
 * EmDash: the real index and write scripts against an in-memory EmDash; `fault` injects a failure per tool call.
 * @param {Record<string, unknown>} call @param {(name: string, args: Record<string, any>, n: number) => unknown} fault
 */
async function onEmdash(call, fault) {
  const site = JSON.parse(fixture('emdash/site.json'))
  const emdash = createFakeEmdash(site, { fault })
  const out = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace(call),
      index: async (/** @type {any} */ req) =>
        parseEmdashIndex(await runScript(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin: req })),
      write: async (/** @type {any} */ req) =>
        parseEmdashWrite(await runScript(EMDASH_WRITE_SCRIPT, { fetch: emdash.fetch, stdin: req })),
      pageHtml: async () => ({ ok: true, status: 200, html: fixture('pages/emdash-home.html') }),
      artifact: site.artifact,
      label: 'benchemdash01',
      verify: false
    })
  )
  const writes = emdash.calls.filter((c) =>
    ['content_update', 'menu_set_items', 'settings_update'].includes(c.name)
  ).length
  return { out, writes, undos: 0 }
}

// ── the table: per scenario and platform, how to provoke it, the code answered, the writes sent ──────

const refuse = { ok: false, code: 'TOOLSET_NOT_GRANTED', error: 'this role may not change the site toolset' }
const conflict = { isError: '[CONFLICT] Content changed while the operation was in progress' }
const changedFooter = (/** @type {number} */ n, /** @type {ReturnType<typeof component>} */ site) => ({
  ok: true,
  kind: 'templatePart',
  id: 0,
  key: 'footer',
  item: {
    id: 81,
    title: 'Footer',
    content: `${site.partOf('footer').post_content}<!-- ${n} -->`,
    area: 'footer'
  }
})
const isFooterRead = (/** @type {string} */ action, /** @type {Record<string, any>} */ params) =>
  action === 'content.get' && params.kind === 'templatePart' && params.key === 'footer'

const REFUSED_FIRST = [
  [
    'wordpress',
    () =>
      onWordPress({ ...HOTLINE, all: true }, (action, params) =>
        action === 'content.update' && params.kind === 'templatePart' ? refuse : undefined
      ),
    'TOOLSET_NOT_GRANTED',
    1
  ],
  ['joomla', () => onJoomla([refuse]), 'TOOLSET_NOT_GRANTED', 1],
  [
    'emdash',
    () =>
      onEmdash(EMDASH_CARD, (name) =>
        name === 'content_update' ? { isError: '[VALIDATION_ERROR] data.band_title: too long' } : undefined
      ),
    'TOOL_FAILED',
    1
  ]
]
const CHANGED_TWICE = [
  [
    'wordpress',
    () =>
      onWordPress(FOOTER_HOURS, (action, params, n, site) =>
        isFooterRead(action, params) ? changedFooter(n, site) : undefined
      ),
    'STORE_CHANGED',
    0
  ],
  [
    'joomla',
    () => onJoomla([{ ok: false, error: 'contract_failed', message: 'conflict at operation 1' }]),
    'STORE_CHANGED',
    2
  ],
  [
    'emdash',
    () =>
      onEmdash({ ...HOTLINE, path: '/', all: true }, (name, args) =>
        name === 'content_update' && args.locale === 'ru' ? conflict : undefined
      ),
    'STORE_CHANGED',
    3
  ]
]
const NEVER_CAME = [
  [
    'wordpress',
    () =>
      onWordPress({ ...HOTLINE, all: true }, (action) => {
        if (action === 'content.update') throw new Error('socket hang up')
        return undefined
      }),
    'OUTCOME_UNKNOWN',
    1
  ],
  [
    'joomla',
    () =>
      onJoomla([
        { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'The site did not answer.', next: 'Retry once.' }
      ]),
    'COMPONENT_UNREACHABLE',
    1
  ],
  [
    'emdash',
    () =>
      onEmdash({ ...HOTLINE, path: '/', all: true }, (name, args) =>
        name === 'content_update' && args.locale === 'ru' ? 'drop' : undefined
      ),
    'OUTCOME_UNKNOWN',
    2
  ]
]

{
  for (const [platform, go, code, writes] of REFUSED_FIRST)
    test(`replace failure: when the door refuses the first write the engine answers the door’s code, sends no second write and reverts nothing: ${rowName(platform)}`, async () => {
      const result = await go()

      assert.equal(result.out.ok, false, platform)
      assert.equal(result.out.code, code, `${platform} ${JSON.stringify(result.out).slice(0, 300)}`)
      assert.equal(result.writes, writes, `${platform}: writes sent`)
      assert.equal(result.undos, 0, `${platform}: nothing to revert`)
      assert.notEqual(result.out.reverted, true, platform)
    })
}

{
  for (const [platform, go, code, writes] of CHANGED_TWICE)
    test(`replace failure: a store that changed twice is STORE_CHANGED after one fresh plan — never a third try: ${rowName(platform)}`, async () => {
      const result = await go()

      assert.equal(result.out.code, code, `${platform} ${JSON.stringify(result.out).slice(0, 300)}`)
      assert.equal(result.writes, writes, `${platform}: writes sent`)
    })
}

{
  for (const [platform, go, code, writes] of NEVER_CAME)
    test(`replace failure: an answer that never came is never undone or repeated — the next is a dryRun of the new words and says not to repeat the call: ${rowName(platform)}`, async () => {
      const result = await go()

      assert.equal(result.out.code, code, `${platform} ${JSON.stringify(result.out).slice(0, 300)}`)
      assert.equal(result.writes, writes, `${platform}: no write after the lost one`)
      assert.equal(result.undos, 0, `${platform}: a revert could land before the lost write`)
      assert.match(result.out.next, /do not repeat/, platform)
      assert.match(result.out.next, /dryRun/, platform)
    })
}

// ── several pairs in one call, each with its own count (the residue sweep's page call, 28/10/2026) ─────────────────

const ok = { ok: true, apply_id: 'replace-test-1' }
const none = () => undefined
const PAIRS = [
  [
    'wordpress',
    (/** @type {number} */ second) =>
      onWordPress(
        {
          path: '/',
          all: 'page',
          changes: [
            { find: 'Established 2004', replace: 'Since 2010', expect: 1 },
            { find: 'Talk to our sales team', replace: 'Write to us', expect: second }
          ]
        },
        none
      )
  ],
  [
    'joomla',
    (/** @type {number} */ second) =>
      onJoomla([ok], {
        path: '/',
        all: 'page',
        changes: [
          { ...JOOMLA_ASK, expect: 1 },
          { find: 'Four core service lines', replace: 'Our services', expect: second }
        ]
      })
  ],
  [
    'emdash',
    (/** @type {number} */ second) =>
      onEmdash(
        {
          path: '/',
          all: 'page',
          changes: [
            { find: EMDASH_CARD.find, replace: EMDASH_CARD.replace, expect: 1 },
            {
              find: 'Drawing revision cycles cut to under 48 hours.',
              replace: 'Within two days.',
              expect: second
            }
          ]
        },
        none
      )
  ]
]

for (const [platform, go] of PAIRS)
  test(`several pairs in one call: each counted on its own, the record written once, a miscount names its pair and writes nothing: ${rowName(platform)}`, async () => {
    const both = await go(1)
    assert.equal(both.out.ok, true, `${platform} ${JSON.stringify(both.out).slice(0, 300)}`)
    assert.equal(both.writes, 1, `${platform}: one write for both pairs of one record`)
    assert.equal(both.out.changed.length, 2, platform)

    const miscounted = await go(2)
    assert.equal(
      miscounted.out.code,
      'COUNT_MISMATCH',
      `${platform} ${JSON.stringify(miscounted.out).slice(0, 300)}`
    )
    assert.equal(miscounted.out.change, 1, `${platform}: the refusal names the pair`)
    assert.equal(miscounted.out.count, 1, platform)
    assert.equal(miscounted.writes, 0, `${platform}: a call is written whole or not at all`)
  })
