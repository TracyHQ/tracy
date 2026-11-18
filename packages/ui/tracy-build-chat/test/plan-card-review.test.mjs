// The plan card the owner reviewed (#575): the review parts drawn from the plan, a trash button only where the kit's
// locks let a part go, what the owner removed with Bring back, the edits bar, the logo pictures through the owner's
// picture door, no "show all" behind the not on the site list, a Vietnamese card that names a section by its code even
// where the word equals the English one (C2), the video and people spot lines said by their counts, and a refused
// plan operation said by its code. Rendered with `react-dom/server`; every business here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-card-review.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STAGES, stageDocuments } from '../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'
import { bundleClient, viTablePath } from './bundle-client.mjs'

const viTable = JSON.parse(readFileSync(viTablePath, 'utf8'))
let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { PlanCard } from './PlanCard'
    export { english, en, inLanguage } from './strings'
    export { refusalOf } from './save-plan-edit'
    export { sectionLabelOf, leftOutWhatOf, pageSectionLabelsOf } from './plan-codes'
    export { planOperationOf } from '@tracy/core/build-chat'
    export const card = (props) => renderToStaticMarkup(createElement(PlanCard, props))`))
})
after(() => done?.())

const vi = (key, vars = {}) =>
  (viTable[key] ?? lib.en[key]).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
const draw = (props) =>
  lib.card({ t: lib.english, onEdit: async () => ({}), onUndo: async () => ({}), ...props })

function plan() {
  const p = stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
  p.keyMessages = [
    { id: 'km-coaching', label: 'Coaching for every level' },
    { id: 'km-courts', label: 'Courts to hire by the hour' }
  ]
  p.pages[0].blocks[1].carries = ['km-coaching']
  p.pages[0].blocks.unshift({
    id: 'h0',
    type: 'header',
    block: 'header-main',
    source: 'template',
    label: 'Contact Us',
    labelCode: 'header',
    data: ['name'],
    reason: 'Every page starts here.',
    lists: [{ head: 'Menu', rows: p.pages.map((pg) => ({ label: pg.name, page: pg.id })) }]
  })
  p.pages[0].seo = { searchTerms: ['tennis lessons', 'court hire'] }
  p.later = [
    {
      code: 'later_prices',
      what: 'Your prices',
      reason: 'Send your prices and they can be shown with what you offer.'
    }
  ]
  p.leftOut.push(
    {
      what: '3 videos',
      kind: 'feature',
      reason: 'Your design has no place for it.',
      code: 'no_place_in_design',
      params: { count: 3, known: 4 }
    },
    {
      what: '2 picture spots of people',
      kind: 'feature',
      reason: 'No people pictures are created.',
      code: 'no_generated_people',
      params: { count: 2 }
    },
    {
      what: 'Coaches',
      kind: 'page',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { removal: 'removal-5' }
    }
  )
  return p
}
const LOCKS = { pages: {}, blocks: { h1: 'main_block' }, facts: {}, minItems: { h2: 4, v1: 4 } }
const REVIEW = {
  count: 2,
  canRevert: true,
  removals: [{ id: 'removal-5', op: 'remove-page', target: { page: 'coaches' } }],
  locks: LOCKS
}

test('trash buttons follow the locks: none on the first page, the main section or an item at its minimum', () => {
  const html = draw({ plan: plan(), review: REVIEW })
  const remove = (what) => html.includes(`aria-label="${lib.english('plan.remove', { what })}"`)
  assert.equal(remove('About'), true)
  assert.equal(remove('Home'), false)
  assert.equal(remove('Adult coaching'), false, 'four services at a minimum of four')
  assert.equal(remove('Courts to hire by the hour'), true)
  assert.equal(remove('Your prices'), true)
  // Without locks no page or section is offered.
  const bare = draw({ plan: plan() })
  assert.equal(bare.includes(`aria-label="${lib.english('plan.remove', { what: 'About' })}"`), false)
})

test('what the owner removed is listed with Bring back, and is no line of the other groups', () => {
  const html = draw({ plan: plan(), review: REVIEW })
  assert.ok(html.includes(`>${lib.english('plan.notOnSite.group.removed')}<`))
  assert.ok(html.includes(lib.english('plan.notOnSite.restoreLabel', { what: 'Coaches' })))
  assert.equal(html.split(lib.en['plan.leftOut.reason.owner_removed']).length, 1)
  // Every group is its own fold; nothing waits behind a show all button (#575 C4).
  assert.equal(html.includes(lib.en['plan.leftOut.showAll'].replace(' ({count})', '')), false)
  assert.ok(html.includes('data-group="no_place"'))
})

test('the edits bar counts the changes and offers back to the original, no browser dialog', () => {
  const html = draw({ plan: plan(), review: REVIEW })
  assert.ok(html.includes(lib.english('plan.edits.count.other', { count: 2 })))
  assert.ok(html.includes(`>${lib.english('plan.edits.revert')}<`))
  assert.equal(draw({ plan: plan() }).includes(lib.english('plan.edits.revert')), false)
})

test('the menu and the header are said once for every page, not as sections of a page (#575 C10)', () => {
  const html = draw({ plan: plan(), review: REVIEW })
  assert.ok(html.includes(`>${lib.english('plan.pages.every')}<`))
  assert.equal(html.includes('data-block="h0"'), false)
  for (const name of ['Home', 'About', 'Contact']) assert.ok(html.includes(`>${name}</li>`), name)
})

test('a Vietnamese card names a section by its code even where its word is the English one (#575 C2)', () => {
  const t = lib.inLanguage(vi, 'vi')
  assert.equal(lib.sectionLabelOf(t, 'header', 'Contact Us'), viTable['plan.section.header'])
  assert.equal(lib.sectionLabelOf(lib.english, 'header', 'Contact Us'), 'Contact Us')
})

test('the video and people spot lines are said by their counts in the card language', () => {
  const t = lib.inLanguage(vi, 'vi')
  const words = (line) => lib.leftOutWhatOf(t, line, (_k, label) => label)
  assert.equal(
    words({ what: '3 videos', code: 'no_place_in_design', params: { count: 3, known: 4 } }),
    vi('plan.leftOut.what.videos.other', { count: 3 })
  )
  assert.equal(
    words({ what: '1 videos', code: 'no_place_in_design', params: { count: 1, known: 1 } }),
    vi('plan.leftOut.what.videos.one', { count: 1 })
  )
  assert.equal(
    words({ what: '2 picture spots', code: 'no_generated_people', params: { count: 2 } }),
    vi('plan.notOnSite.peopleSpots.other', { count: 2 })
  )
  // A no place line without a count of videos keeps the plan's words.
  assert.equal(words({ what: 'Map', code: 'no_place_in_design' }), 'Map')
  const html = draw({ plan: plan(), review: REVIEW })
  assert.ok(html.includes(lib.english('plan.leftOut.what.videos.other', { count: 3 })))
  assert.ok(html.includes(lib.english('plan.notOnSite.peopleSpots.other', { count: 2 })))
})

test('the logo is shown on a light and a dark ground through the owner picture door (#575 C9)', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
  const lookSources = { pictures: { logoLight: { picture: id }, logoDark: { picture: id } } }
  const html = draw({ plan: plan(), lookSources })
  assert.equal(html.split(`src="/api/build-draft/pictures/${id}"`).length, 3)
  assert.ok(html.includes('data-ground="light"') && html.includes('data-ground="dark"'))
})

test('the intent notes and the key messages have a pencil button, not only a trash button (#575)', () => {
  const p = plan()
  const home = p.pages[0]
  home.visitorQuestion = 'Can my children learn to play here?'
  home.keyMessage = 'A club for the whole family.'
  home.seo = {
    ...home.seo,
    titleIntent: 'The club and its courts',
    descriptionIntent: 'Lessons for every age.'
  }
  const section = home.blocks[1]
  section.message = 'What a member can book.'
  const html = draw({ plan: p, review: REVIEW })
  const fields = [
    'keyMessages[km-coaching].label',
    `pages[${home.id}].keyMessage`,
    `pages[${home.id}].visitorQuestion`,
    `pages[${home.id}].seo.titleIntent`,
    `pages[${home.id}].seo.descriptionIntent`,
    `pages[${home.id}].blocks[${section.id}].message`
  ]
  for (const field of fields) {
    const at = html.indexOf(`data-field="${field}"`)
    assert.ok(at >= 0, `${field} is on the card`)
    const button = html.slice(at, html.indexOf('</button>', at))
    assert.ok(button.includes('class="tv-bc-pen"'), `${field} has a pencil`)
    assert.ok(button.includes('aria-label="Edit '), `${field} is a button that opens the editor`)
  }
  // A section's note is one row of the notes grid: its label cell follows the row before it (a closing tag), never
  // the opening tag of a wrapper that would squeeze label and value into the grid's label column.
  const note = `data-field="pages[${home.id}].blocks[${section.id}].message"`
  assert.ok(
    new RegExp(
      `</div><div class="tv-bc-k">[^<]+</div><div class="tv-bc-cell"><div class="tv-bc-val" ${RegExp.escape(note)}`
    ).test(html),
    'the section note sits in the notes grid'
  )
  for (const text of [
    'Can my children learn to play here?',
    'Lessons for every age.',
    'What a member can book.'
  ])
    assert.ok(html.includes(`>${text}<`), text)
})

test('a plan operation is one plan edit; a refused one is said by its code with its numbers', () => {
  const p = plan()
  assert.deepEqual(lib.planOperationOf(p, { op: 'remove-page', page: 'about' }, 'edit-9'), {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-9',
    plan: { id: p.id, revision: p.revision },
    operation: { op: 'remove-page', page: 'about' }
  })
  const refused = Object.assign(new Error('INVALID_EDIT'), {
    code: 'INVALID_EDIT',
    problems: [{ code: 'too_few_items', at: 'operation.item', message: 'x', params: { min: 3 } }]
  })
  assert.deepEqual(lib.refusalOf(refused), {
    key: 'plan.refused.too_few_items',
    reload: false,
    vars: { min: 3 }
  })
  const unknown = Object.assign(new Error('INVALID_EDIT'), {
    code: 'INVALID_EDIT',
    problems: [{ code: 'other' }]
  })
  assert.deepEqual(lib.refusalOf(unknown), { key: 'plan.saveFailed', reload: false })
})

test('every refusal code of the operation gate has the gate sentence word for word', async () => {
  const { OPERATION_REFUSALS } = await import('../../../wo/website-opportunities/domain/plan-operations.mjs')
  for (const [code, sentence] of Object.entries(OPERATION_REFUSALS))
    assert.equal(lib.en[`plan.refused.${code}`], sentence, code)
  const { LATER } = await import('../../../wo/website-opportunities/domain/plan-later.mjs')
  for (const [code, entry] of Object.entries(LATER)) {
    assert.equal(lib.en[`plan.later.what.${code}`], entry.what, code)
    assert.equal(lib.en[`plan.later.reason.${code}`], entry.reason, code)
  }
})

test('every code the plan edit door refuses with has words on the card, in English and every shipped language', async () => {
  const { EDIT_DOOR_CODES, PLAN_FAULT, PLAN_FAULT_MESSAGE } = await import(
    '../../../wo/website-opportunities/domain/plan-edit-gate.mjs'
  )
  const tables = ['de', 'es', 'fr', 'it', 'nl', 'zh'].map((lang) => [
    lang,
    JSON.parse(
      readFileSync(
        new URL(`../../../locale/tracy-locales/${lang}/tracy-build-chat.json`, import.meta.url),
        'utf8'
      )
    )
  ])
  tables.push(['vi', viTable])
  for (const code of EDIT_DOOR_CODES) {
    const key = `plan.refused.${code}`
    assert.ok(Object.hasOwn(lib.en, key), `English words for ${code}`)
    for (const [lang, table] of tables) assert.ok(Object.hasOwn(table, key), `${lang} words for ${code}`)
    const refused = Object.assign(new Error('INVALID_EDIT'), {
      code: 'INVALID_EDIT',
      problems: [{ code, at: 'x', message: 'x', params: { min: 2, max: 4 } }]
    })
    assert.equal(lib.refusalOf(refused).key, key, code)
  }
  // A plan that already fails a rule is said as it is, never as a plain "try again".
  assert.equal(lib.en[`plan.refused.${PLAN_FAULT}`], PLAN_FAULT_MESSAGE)
})

test('every removal has a row with Bring back, said in the card language by its code (#575 stand)', () => {
  const p = plan()
  p.leftOut.push(
    {
      what: 'Your prices',
      kind: 'feature',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { later: 'later_prices', removal: 'removal-6' }
    },
    {
      what: 'Services',
      kind: 'block',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { section: 'services', removal: 'removal-7' }
    }
  )
  const review = {
    ...REVIEW,
    count: 4,
    removals: [
      ...REVIEW.removals,
      { id: 'removal-6', op: 'remove-later', target: { later: 'later_prices' } },
      { id: 'removal-7', op: 'remove-block', target: { block: 'v9', page: 'home' } },
      // A service another section still shows: the plan's left out list has no entry for it.
      { id: 'removal-8', op: 'remove-item', target: { item: 's1', page: 'home', block: 'h2' } }
    ]
  }
  const t = lib.inLanguage(vi, 'vi')
  const html = lib.card({ t, plan: p, review, onEdit: async () => ({}), onUndo: async () => ({}) })
  for (const id of ['removal-5', 'removal-6', 'removal-7', 'removal-8'])
    assert.ok(html.includes(`data-removal="${id}"`), id)
  assert.equal(html.split(`>${vi('plan.notOnSite.restore')}<`).length - 1, 4, 'four Bring back buttons')
  assert.ok(html.includes(vi('plan.later.what.later_prices')))
  assert.ok(html.includes(viTable['plan.section.services']))
  assert.equal(html.includes('>Your prices.<'), false)
})

test('a "send later" removal stored before it carried its code is named in the card language (#575 stand)', () => {
  const p = plan()
  // Stored before the code, its removal no longer kept by the draft: only the plan's own name is left.
  p.leftOut.push({
    what: 'Your prices',
    kind: 'feature',
    reason: 'You took this off the plan.',
    code: 'owner_removed',
    params: { removal: 'removal-6' }
  })
  const t = lib.inLanguage(vi, 'vi')
  const html = lib.card({ t, plan: p, review: REVIEW, onEdit: async () => ({}), onUndo: async () => ({}) })
  assert.ok(html.includes('data-removal="removal-6"'))
  assert.ok(html.includes(vi('plan.later.what.later_prices')))
  assert.equal(html.includes('Your prices'), false)
})

test('two sections of one page that would read the same are told apart by their own label or message', () => {
  const sections = [
    { id: 'a', label: 'Services', labelCode: 'services' },
    { id: 'b', label: 'Your first lesson', labelCode: 'services' },
    { id: 'c', label: 'Services', labelCode: 'services', message: 'How a visit runs' },
    { id: 'd', label: 'Gallery', labelCode: 'gallery' }
  ]
  const labels = lib.pageSectionLabelsOf(lib.english, sections)
  assert.deepEqual(
    [...labels.values()],
    ['Services', 'Your first lesson', 'Services: How a visit runs', 'Gallery']
  )
  const vt = lib.inLanguage(vi, 'vi')
  const said = lib.pageSectionLabelsOf(vt, sections)
  const services = viTable['plan.section.services']
  assert.deepEqual(
    [...said.values()],
    [
      `${services}: Services`,
      `${services}: Your first lesson`,
      `${services}: How a visit runs`,
      viTable['plan.section.gallery']
    ]
  )
})
