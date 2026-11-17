/**
 * Everything the owner reads on the plan card is in the language of the chat (#575 walk: a Vietnamese card read its
 * left out lines, the main colour line and the photo count in English). A left out line is named by its count of a
 * data kind, by a fact's label or by its code, and said by its code; the main colour line is said by its code, and an
 * English card keeps the plan's own sentence for it. Each English sentence the plan step writes is pinned to the
 * table's. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-card-owner-language.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STAGES, stageDocuments } from '../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'
import {
  BRIEF_LEFT_OUT,
  HELD_HOURS_LEFT_OUT
} from '../../../wo/website-opportunities/domain/plan-composer-brief.mjs'
import { bundleClient, translatorOf, viTablePath } from './bundle-client.mjs'

const viTable = JSON.parse(readFileSync(viTablePath, 'utf8'))
let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { PlanCard } from './PlanCard'
    export { english, en } from './strings'
    export * from './plan-codes'
    export const card = (props) => renderToStaticMarkup(createElement(PlanCard, props))`))
})
after(() => done?.())
const vi = (key, vars) => translatorOf(viTable, lib.en)(key, vars)
const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
const draw = (p, t) => lib.card({ plan: p, t, onEdit: async () => ({}), onUndo: async () => ({}) })
const MOVED = 'Your plum was made lighter, same hue, so buttons stand out.'

function coded() {
  const p = plan()
  p.items.push(
    { id: 'q1', kind: 'quote', label: 'Review by Wren Halloway', sources: [] },
    { id: 'q2', kind: 'quote', label: 'Review by Pim Ostrander', sources: [] }
  )
  p.leftOut = [
    { item: 'q1', what: 'Review by Wren Halloway', kind: 'item', reason: 'x', code: 'owner_withheld' },
    { item: 'q2', what: 'Review by Pim Ostrander', kind: 'item', reason: 'x', code: 'owner_withheld' },
    { ...BRIEF_LEFT_OUT.whatsapp, kind: 'feature' },
    { ...HELD_HOURS_LEFT_OUT.unconfirmed, kind: 'feature' }
  ]
  p.assumptions = [
    {
      id: 'accent',
      field: 'look.accent',
      said: MOVED,
      code: 'accent_logo_moved',
      params: { direction: 'lighter' }
    }
  ]
  return p
}

test('a Vietnamese card names and says every left out line and the main colour line in Vietnamese', () => {
  const html = draw(coded(), vi)
  for (const line of [
    vi('plan.count.quote.other', { count: 2 }),
    vi('plan.leftOut.reason.owner_withheld'),
    vi('plan.leftOut.what.no_place_for_whatsapp'),
    vi('plan.leftOut.reason.no_place_for_whatsapp'),
    vi('plan.leftOut.what.hours_unconfirmed'),
    vi('plan.leftOut.reason.hours_unconfirmed'),
    vi('plan.assumption.accent_logo_moved.lighter')
  ])
    assert.ok(html.includes(line.replace(/'/g, '&#x27;')), line)
  for (const english of ['Wren', 'Pim', MOVED, BRIEF_LEFT_OUT.whatsapp.reason, 'Opening hours'])
    assert.equal(html.includes(english), false, english)
})

test('an English card keeps the plan sentences, and the main colour line as the brand step wrote it', () => {
  const html = draw(coded(), lib.english)
  for (const line of [
    BRIEF_LEFT_OUT.whatsapp.reason,
    HELD_HOURS_LEFT_OUT.unconfirmed.reason,
    '2 reviews',
    MOVED
  ])
    assert.ok(html.includes(line.replace(/'/g, '&#x27;')), line)
})

test('every English sentence of the new codes is the sentence the plan step writes', () => {
  for (const entry of [...Object.values(BRIEF_LEFT_OUT), ...Object.values(HELD_HOURS_LEFT_OUT)]) {
    assert.equal(lib.leftOutReasonOf(lib.english, entry, 'x'), entry.reason, entry.code)
    assert.equal(
      lib.leftOutWhatOf(lib.english, { what: 'x', code: entry.code }, () => 'y'),
      entry.what
    )
  }
})

test('the photos line says how many of all the owner photos the plan places', () => {
  const p = plan()
  p.pictures.own.frames = 5
  const html = draw(p, lib.english)
  assert.ok(
    html.includes('5 of your 12 photos, from'),
    html.slice(html.indexOf('Your photos'), html.indexOf('Your photos') + 200)
  )
})
