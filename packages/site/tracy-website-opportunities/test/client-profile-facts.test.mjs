/**
 * Fact decisions and Key messages on the Details Profile card (#1791): confidence per fact, an on/off control per fact
 * with the rule's reason in plain words, and the key messages with edit, reorder and delete. Bundles the real
 * components with React 18 and renders them to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-facts.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-facts-'))
  const outfile = path.join(outDir, 'profile-facts.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfileFactsRows } from './profile-facts-rows.tsx'
        export { factRowsView, reasonKeys } from './profile-facts-model.ts'
        export { ProfileKeyMessages } from './profile-key-messages.tsx'
        export {
          keyMessagePicksOf,
          keyMessagesView,
          removedKeyMessageIds,
          MAX_LABEL_LENGTH,
          moveMessage,
          removeMessage,
          withLabel
        } from './profile-key-messages-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const fact = (id, value) => ({ id, value, evidenceRefs: ['ev_1'] })
const doc = {
  business: {
    phone: fact('fact_phone', '+971 50 000 0000'),
    hours: fact('fact_hours', { raw: 'Open 24 hours' })
  },
  people: [fact('fact_ana', { name: 'Ana Silva', role: 'Coach' })],
  links: [fact('fact_wa', { kind: 'whatsapp', url: 'https://wa.me/971500000000' })]
}
const decisions = [
  { factId: 'fact_phone', confidence: 'corroborated', onSite: true, decidedBy: 'rule', reasons: [] },
  {
    factId: 'fact_hours',
    confidence: 'single-source',
    onSite: false,
    decidedBy: 'rule',
    reasons: ['implausible-all-week-hours']
  },
  {
    factId: 'fact_ana',
    confidence: 'single-source',
    onSite: true,
    decidedBy: 'owner',
    reasons: ['owner-override']
  },
  {
    factId: 'fact_wa',
    confidence: 'inferred',
    onSite: true,
    decidedBy: 'rule',
    reasons: ['allowed-inferred-kind']
  }
]
const drawFacts = (rows) =>
  lib.renderToStaticMarkup(lib.createElement(lib.ProfileFactsRows, { t, rows, onToggle: async () => true }))

test('every fact shows its confidence, its state and one control; a rule-held fact says why', () => {
  const rows = lib.factRowsView(doc, decisions)
  assert.deepEqual(
    rows.map((r) => [r.label, r.confidence, r.onSite, r.decidedBy]),
    [
      ['+971 50 000 0000', 'corroborated', true, 'rule'],
      ['Open 24 hours', 'single-source', false, 'rule'],
      ['Ana Silva', 'single-source', true, 'owner'],
      ['https://wa.me/971500000000', 'inferred', true, 'rule']
    ]
  )
  const html = drawFacts(rows)
  assert.match(html, /\[facts\.confidence\.corroborated\]/)
  assert.match(html, /\[facts\.confidence\.single-source\]/)
  assert.match(html, /\[facts\.confidence\.inferred\]/)
  assert.match(html, /\[facts\.reason\.implausible-all-week-hours\]/)
  assert.match(html, /\[facts\.reason\.allowed-inferred-kind\]/)
  // Off fact offers Show; on facts offer Leave off.
  assert.equal((html.match(/\[facts\.show\]/g) ?? []).length, 1)
  assert.equal((html.match(/\[facts\.leave\]/g) ?? []).length, 3)
  // Only the owner's fact offers to hand the choice back to the rule.
  assert.equal((html.match(/\[facts\.reset\]/g) ?? []).length, 1)
  assert.match(html, /\[facts\.yourChoice\]/)
})

test('only the facts the server decided are listed, in the server order', () => {
  const withExtra = {
    ...doc,
    business: { ...doc.business, nationalPhoneNumber: fact('fact_national', '050 000 0000') }
  }
  const reversed = [...decisions].reverse()
  assert.deepEqual(
    lib.factRowsView(withExtra, reversed).map((r) => r.id),
    ['fact_wa', 'fact_ana', 'fact_hours', 'fact_phone']
  )
})

test('no decisions or no readable fact draws nothing', () => {
  assert.equal(lib.factRowsView(doc, null), null)
  assert.equal(lib.factRowsView({}, decisions), null)
})

// Facts that live outside business/offerings/people/claims/links: hours and service areas as lists, quotes,
// the extensions, and the same Instagram link found on the website and again on the social profiles.
const wide = {
  business: {
    phone: fact('f_phone', '+971 50 000 0000'),
    hours: fact('f_hours', ['Mon-Sun: Open 24 hours']),
    serviceAreas: fact('f_areas', ['Harbour District', 'Old Town'])
  },
  quotes: [
    fact('f_story', { kind: 'story', text: 'Founded by two friends who love the sea.' }),
    fact('f_aud', { kind: 'audience', text: 'Families and beginners' })
  ],
  links: [
    fact('f_web', { kind: 'instagram', url: 'https://instagram.com/harbour_sport_club' }),
    fact('f_soc', { kind: 'instagram', url: 'https://instagram.com/harbour_sport_club' })
  ],
  extensions: {
    'research:otherPhones': fact('f_other', [{ phone: '+971 50 111 1111', sources: ['website'] }])
  }
}
const d = (factId, field, extra = {}) => ({
  factId,
  field,
  confidence: 'single-source',
  onSite: true,
  decidedBy: 'rule',
  reasons: ['research-evidence'],
  ...extra
})
const wideDecisions = [
  d('f_phone', 'phone'),
  d('f_hours', 'hours', { onSite: false, reasons: ['implausible-all-week-hours'] }),
  d('f_areas', 'serviceAreas'),
  d('f_story', 'story'),
  d('f_aud', 'audience'),
  d('f_web', 'website'),
  d('f_soc', 'socials'),
  d('f_other', 'otherPhones')
]

test('every decision is a row in server order, wherever the profile keeps its value', () => {
  const rows = lib.factRowsView(wide, wideDecisions)
  assert.deepEqual(
    rows.map((r) => r.id),
    wideDecisions.map((x) => x.factId)
  )
  const by = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(by.f_hours.label, 'Mon-Sun: Open 24 hours')
  assert.equal(by.f_areas.label, 'Harbour District; Old Town')
  assert.equal(by.f_story.label, 'Founded by two friends who love the sea.')
  assert.equal(by.f_aud.label, 'Families and beginners')
  assert.equal(by.f_other.label, '+971 50 111 1111')
})

test('hours held back by rule show their reason and a Show control', () => {
  const rows = lib.factRowsView(wide, wideDecisions)
  const html = drawFacts(rows.filter((r) => r.id === 'f_hours'))
  assert.match(html, /\[field\.hours\]/)
  assert.match(html, /Mon-Sun: Open 24 hours/)
  assert.match(html, /\[facts\.reason\.implausible-all-week-hours\]/)
  assert.match(html, /\[facts\.show\]/)
})

test('the same link on the website and the socials stays two rows, told apart by their field', () => {
  const rows = lib.factRowsView(wide, wideDecisions).filter((r) => r.label.includes('instagram.com'))
  assert.deepEqual(
    rows.map((r) => [r.id, r.field]),
    [
      ['f_web', 'website'],
      ['f_soc', 'socials']
    ]
  )
  const html = drawFacts(rows)
  assert.match(html, /\[field\.website\]/)
  assert.match(html, /\[field\.socials\]/)
})

test('a decision without a readable value still shows under its field; an unknown field is spelled out', () => {
  const rows = lib.factRowsView({}, [d('f_gone', 'serviceAreas'), d('f_new', 'deliveryZones')])
  assert.deepEqual(
    rows.map((r) => [r.field, r.label]),
    [
      ['serviceAreas', ''],
      ['deliveryZones', '']
    ]
  )
  const html = drawFacts(rows)
  assert.match(html, /\[field\.serviceAreas\]/)
  assert.match(html, /Delivery zones/)
})

const reading = (keyMessages) => ({ readingCard: { method: 'model', keyMessages } })
const km = (id, label, quotes, removed = false) => ({
  id,
  label,
  quotes: quotes.map((quote) => ({ quote, source: { kind: 'bio' } })),
  removed
})
const messages = lib0()
function lib0() {
  return [
    km('ke_a', 'European coaching', ['European Coaching in Dubai']),
    km('ke_b', 'All ages and levels', ['for all ages and levels', 'kids welcome']),
    km('ke_c', 'Locations across Dubai', ['Locations across Dubai']),
    km('ke_d', 'Fourth point', ['x']),
    km('ke_gone', 'Taken off earlier', ['y'], true)
  ]
}

test('key messages: up to three, the removed one left out, each with its quotes', () => {
  const view = lib.keyMessagesView(reading(messages))
  assert.deepEqual(
    view.map((m) => m.id),
    ['ke_a', 'ke_b', 'ke_c']
  )
  assert.deepEqual(view[1].quotes, ['for all ages and levels', 'kids welcome'])
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ProfileKeyMessages, { t, messages: view, onSave: async () => true })
  )
  assert.match(html, /European coaching/)
  assert.match(html, /“kids welcome”/)
  assert.match(
    html,
    /\[keyMessages\.edit\][\s\S]*\[keyMessages\.up\][\s\S]*\[keyMessages\.down\][\s\S]*\[keyMessages\.delete\]/
  )
  // Nothing changed yet: no Save.
  assert.doesNotMatch(html, /\[keyMessages\.save\]/)
  assert.deepEqual(lib.keyMessagesView(reading([])), [])
  assert.deepEqual(lib.keyMessagesView({}), [])
})

test('saving sends only the owner picks: removed ids, the order, the retyped labels', () => {
  const before = lib.keyMessagesView(reading(messages))
  let draft = lib.moveMessage(before, 2, 0)
  draft = lib.withLabel(draft, 1, '  Coaches from   Europe ')
  draft = lib.removeMessage(draft, 2)
  assert.deepEqual(lib.keyMessagePicksOf(before, draft), {
    removed: ['ke_b'],
    order: ['ke_c', 'ke_a'],
    labels: { ke_a: 'Coaches from Europe' }
  })
  // An edit that leaves nothing changes nothing.
  assert.equal(lib.withLabel(before, 0, '   '), before)
  assert.equal(lib.moveMessage(before, 0, 9), before)
})

test("two saves in a row: the second carries the first one's removal and label", () => {
  // Save 1: delete ke_a, rename ke_b. The server then reports ke_a removed and ke_b edited.
  let card = reading(messages)
  let before = lib.keyMessagesView(card)
  let draft = lib.withLabel(lib.removeMessage(before, 0), 0, 'Beta renamed')
  const first = lib.keyMessagePicksOf(before, draft, lib.removedKeyMessageIds(card))
  assert.deepEqual(first, {
    removed: ['ke_gone', 'ke_a'],
    order: ['ke_b', 'ke_c'],
    labels: { ke_b: 'Beta renamed' }
  })
  card = reading([
    km('ke_a', 'European coaching', ['q'], true),
    { ...km('ke_b', 'Beta renamed', ['q']), edited: true },
    km('ke_c', 'Locations across Dubai', ['q']),
    km('ke_gone', 'Taken off earlier', ['y'], true)
  ])
  // Save 2: only reorder.
  before = lib.keyMessagesView(card)
  const second = lib.keyMessagePicksOf(before, lib.moveMessage(before, 0, 1), lib.removedKeyMessageIds(card))
  assert.deepEqual(second.removed.sort(), ['ke_a', 'ke_gone'])
  assert.deepEqual(second.order, ['ke_c', 'ke_b'])
  assert.deepEqual(second.labels, { ke_b: 'Beta renamed' })
})

test('the label limit is 60 and a longer edit is cut to it', () => {
  assert.equal(lib.MAX_LABEL_LENGTH, 60)
  const before = lib.keyMessagesView(reading(messages))
  assert.equal(lib.withLabel(before, 0, 'x'.repeat(100))[0].label.length, 60)
})
