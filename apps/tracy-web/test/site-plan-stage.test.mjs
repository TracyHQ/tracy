/**
 * The site plan stage of a brief build (spec TracyHQ/tracy#231 seam 1, ticket #234): before the copy writers, one author
 * call on the editorial door reads the template inventory, the brief and the rulebook and answers a site plan; the plan
 * check refuses it with reasons, the same author revises it, and the accepted plan, its rounds and its spend are kept in the
 * build record. Three refusals never fail the build: it goes on with its current writers. The real Joomla engine's prepare
 * runs on a released template's content map with a scripted model double. Fictional business: a tailoring studio.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)

const sha = (/** @type {string} */ c) => c.repeat(64)
/** A brief with offerings, two photos and NO people. */
const BRIEF = {
  reading: {
    about: 'Needle & Thread alters suits and dresses in a small studio by the market.',
    services: [
      { id: 's1', label: 'Suit alteration', quote: 'Suits taken in or let out, ready in a week' },
      { id: 's2', label: 'Hemming', quote: 'Trousers and skirts hemmed while you wait' }
    ]
  },
  assets: [
    {
      id: 'a1',
      kind: 'image',
      category: 'space',
      sha256: sha('a'),
      width: 2000,
      height: 1300,
      orientation: 'landscape',
      quality: 'high',
      content: 'people-in-action',
      caption: 'A tailor pinning a jacket sleeve',
      depicts: { id: 's1' },
      isGraphic: false
    },
    {
      id: 'a2',
      kind: 'image',
      category: 'other',
      sha256: sha('b'),
      width: 600,
      height: 600,
      orientation: 'square',
      quality: 'medium',
      content: 'logo',
      caption: 'The studio logo',
      isGraphic: true
    }
  ]
}

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const TEAM = 'section:module-163'
const ITEMS = ['Suit alteration', 'Hemming']

/** A complete plan of the inventory; `team` keeps the home page's team row with a person the brief never names. */
function planOf({ team }) {
  const kept = new Set([HOME, CLASSES, CONTACT])
  const els = inventory.elements
  const pages = els
    .filter((e) => e.kind === 'page')
    .map((e) =>
      kept.has(e.id)
        ? {
            id: e.id,
            decision: 'keep',
            purpose: 'Show the studio',
            lead: 'Clothes that fit, altered by hand',
            facts: [],
            items: e.id === CONTACT ? [] : ITEMS,
            dependsOn: e.id === HOME ? [CLASSES] : []
          }
        : { id: e.id, decision: 'drop', reason: 'not part of this business' }
    )
  const shown = new Set(
    els.filter((e) => e.kind === 'section' && e.pages.some((p) => kept.has(p))).map((e) => e.id)
  )
  if (!team) shown.delete(TEAM)
  const decisions = []
  for (const e of els) {
    if (!e.decide || e.kind === 'page') continue
    if (e.kind === 'section') {
      decisions.push(
        shown.has(e.id)
          ? { element: e.id, decision: 'keep' }
          : {
              element: e.id,
              decision: 'hide',
              reason: e.id === TEAM ? 'the brief names no team members' : 'not on a kept page'
            }
      )
      continue
    }
    if (e.section && !shown.has(e.section)) continue
    if (e.card && e.card.index >= 2) continue
    if (e.kind === 'cards')
      decisions.push({ element: e.id, decision: 'keep', count: Math.min(2, e.limits.capacity) })
    else if (e.kind === 'picture')
      decisions.push({ element: e.id, decision: 'keep', picture: { draw: 'A tailor at a cutting table' } })
    else if (e.kind === 'icon') decisions.push({ element: e.id, decision: 'keep', icon: 'neutral' })
    else if (e.kind === 'button' || e.kind === 'link')
      decisions.push({ element: e.id, decision: 'keep', action: { kind: 'page', target: CONTACT } })
    else if (e.kind === 'menu' || e.kind === 'footer-column')
      decisions.push({ element: e.id, decision: 'keep', items: [HOME, CLASSES, CONTACT] })
    else decisions.push({ element: e.id, decision: 'keep' })
  }
  return {
    version: 'site-plan/1',
    pages,
    decisions,
    photos: [
      { photo: 'photo:a1', decision: 'use', slots: ['picture:module-156.0'] },
      { photo: 'photo:a2', decision: 'skip', reason: 'a logo, not a photograph' }
    ],
    glossary: [
      { name: 'Suit alteration', kind: 'offering', description: 'Suits taken in or let out' },
      { name: 'Hemming', kind: 'offering', description: 'Trousers and skirts hemmed' },
      ...(team ? [{ name: 'Marta Reyes', kind: 'person', description: 'Head tailor since 2015' }] : [])
    ],
    writingOrder: [CLASSES, HOME, CONTACT],
    outOfScope: {
      template: team ? [] : [{ element: TEAM, reason: 'the brief names no team members' }],
      brief: []
    }
  }
}

/** The editorial door double: answers the scripted plans in turn, and meters its calls like a seed model. */
function scriptedAuthor(answers) {
  const calls = []
  const used = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }
  return {
    calls,
    chat: async ({ messages, stage, maxTokens, effort }) => {
      calls.push({ messages: messages.map((m) => ({ ...m })), stage, maxTokens, effort })
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
      used.calls += 1
      if (answer instanceof Error) throw answer
      used.promptTokens += 30_000
      used.completionTokens += 9_000
      used.reasoningTokens += 4_000
      return typeof answer === 'string' ? answer : JSON.stringify(answer)
    },
    usage: () => ({ model: 'deepseek/deepseek-v4-pro', ...used, stages: { 'site-plan': { ...used } } })
  }
}

/** The text door double: every copy writer gets an empty answer and writes nothing. */
const quietText = () => ({ chat: async () => '{}', usage: () => ({}) })

async function prepareWith(models) {
  const records = {}
  const notes = []
  const times = {}
  const engine = createJoomlaEngine({
    models: async () => models,
    woContent: { sitePlanFor: async () => null, briefFor: async () => BRIEF }
  })
  const prepared = await engine.prepare({
    siteKey: 'site-plan-test',
    label: 'site-plan',
    platform: 'joomla',
    quickstart: 'quickstart/ja-boxing/j6',
    contract,
    email: 'owner@example.com',
    brief: { about: BRIEF.reading.about, goal: 'contact', style: 'plain' },
    normalized: {
      name: 'Needle & Thread',
      about: BRIEF.reading.about,
      nameFrom: 'answer',
      tone: 'plain',
      contact: '',
      languages: ['en']
    },
    signal: new AbortController().signal,
    time: (k, v) => {
      times[k] = v
    },
    record: (k, v) => {
      records[k] = v
    },
    note: (n) => notes.push(n),
    deadlineAt: Date.now() + 20_000
  })
  return { prepared, records, notes, times }
}

test('a refused first plan goes back to the same author with its reasons, and the revision is accepted', async () => {
  const author = scriptedAuthor([planOf({ team: true }), planOf({ team: false })])
  const { prepared, records } = await prepareWith({ text: quietText(), editorial: author })
  assert.ok(prepared.changes, 'prepare goes on to the copy writers')
  const run = records.sitePlan
  assert.equal(run.status, 'accepted')
  assert.equal(run.door, 'woEditorial')
  assert.equal(run.model, 'deepseek/deepseek-v4-pro')
  assert.equal(author.calls.length, 2)
  assert.equal(author.calls[0].stage, 'site-plan')
  // The author read the rulebook, the template and the brief photos.
  assert.match(author.calls[0].messages[0].content, /the brief decides what the site has/i)
  const input = JSON.parse(author.calls[0].messages[1].content)
  assert.ok(input.template.pages.some((e) => e.id === HOME))
  // Only the photos the labels accept are a choice; a refused one is skipped by code, with its reason.
  assert.deepEqual(
    input.photos.map((p) => p.id),
    ['photo:a1']
  )
  assert.equal(input.brief.factSheet.people, undefined, 'the brief names no people')
  // Round one was refused for the person the brief never names; round two carries the reasons in the same conversation.
  assert.equal(run.rounds[0].ok, false)
  assert.ok(run.rounds[0].reasons.some((r) => r.rule === 'unsourced-fact'))
  const revision = author.calls[1].messages
  assert.equal(revision.length, 4)
  assert.equal(revision[2].role, 'assistant')
  assert.match(revision[3].content, /2015/)
  assert.equal(run.rounds[1].ok, true)
})

test('a brief with no people gets the team section hidden with a reason, in the plan kept on the build record', async () => {
  const author = scriptedAuthor([planOf({ team: true }), planOf({ team: false })])
  const { records } = await prepareWith({ text: quietText(), editorial: author })
  const team = records.sitePlan.plan.decisions.find((d) => d.element === TEAM)
  assert.equal(team.decision, 'hide')
  assert.match(team.reason, /no team/)
  assert.deepEqual(
    records.sitePlan.plan.outOfScope.template.filter((o) => o.element === TEAM),
    [{ element: TEAM, reason: 'the brief names no team members' }]
  )
})

test('the rounds, tokens, time and cost of every plan call are in the build record and in the text spend', async () => {
  const author = scriptedAuthor([planOf({ team: true }), planOf({ team: false })])
  const { records, times } = await prepareWith({ text: quietText(), editorial: author })
  const run = records.sitePlan
  assert.equal(run.rounds.length, 2)
  for (const round of run.rounds) {
    assert.equal(round.promptTokens, 30_000)
    assert.equal(round.completionTokens, 9_000)
    assert.equal(round.reasoningTokens, 4_000)
    assert.ok(Number.isFinite(round.ms))
    assert.ok(round.costUsd > 0)
  }
  assert.equal(run.totals.calls, 2)
  assert.equal(run.totals.promptTokens, 60_000)
  assert.ok(Math.abs(run.totals.costUsd - run.rounds[0].costUsd * 2) < 1e-6)
  assert.ok(Number.isFinite(times.sitePlanMs))
  // The editorial model's spend is part of the build's text spend (`text-spend.js`).
  assert.equal(times['text.site-plan.calls'], 2)
  assert.ok(records.textCostUsd >= run.totals.costUsd - 1e-6)
})

test('three refusals fall back to the current writers without failing the build, on the text door when editorial is unassigned', async () => {
  const author = scriptedAuthor([planOf({ team: true })])
  const { prepared, records, notes } = await prepareWith({ text: { ...quietText(), ...author } })
  assert.ok(
    !notes.some((n) => /site plan/.test(n)),
    'the build report is not told: the plan changes nothing yet'
  )
  assert.ok(prepared.changes, 'the build goes on')
  const run = records.sitePlan
  assert.equal(run.status, 'refused')
  assert.equal(run.door, 'seedText')
  assert.equal(run.rounds.length, 3)
  assert.equal(run.plan, null)
  assert.ok(run.refusal.some((r) => r.rule === 'unsourced-fact'))
  assert.ok(run.notes.some((n) => /editorial model is not assigned/.test(n)))
  assert.ok(run.notes.some((n) => /site plan was refused 3 time/.test(n)))
})

// The author decides only the real choices (ticket TracyHQ/tracy#234 plan size): pages, the sections it hides, card counts,
// facts and leads per page, the glossary, the writing order, the brief photos and the picture slots they fill. Code fills
// every other decision before the check (children follow their section, icons follow their item, a button takes its
// mapped action), and the check stays exhaustive over the merged plan.
const KINDS_FILLED = ['icon', 'button', 'link', 'menu', 'footer-column', 'contact-block', 'cta-band', 'slot']

const RECORD_ROWS = new Set(['person', 'quote', 'service', 'package'])

/** An answer with only the real choices, its writing order out of dependency order. */
function choicesOnly() {
  const full = planOf({ team: false })
  const kept = new Set([HOME, CLASSES, CONTACT])
  const els = new Map(inventory.elements.map((e) => [e.id, e]))
  const onKept = (/** @type {any} */ e) => {
    const section = els.get(e.section)
    return section && section.id !== TEAM && section.pages.some((p) => kept.has(p))
  }
  const cards = inventory.elements
    .filter((e) => e.kind === 'cards' && onKept(e) && RECORD_ROWS.has(e.groupKind))
    .map((e) => {
      const count = Math.min(2, e.limits.capacity)
      return { element: e.id, decision: 'keep', count, items: ITEMS.slice(0, count) }
    })
  // Only the kept pages are listed (every other page is dropped by code); the home page also names the record page
  // family it summarises, which is decided twice the same way; no writing order and no template out-of-scope list.
  const pages = full.pages.filter((p) => p.decision === 'keep')
  pages.find((p) => p.id === HOME).dependsOn = [CLASSES, 'record-page:classes']
  return {
    ...full,
    pages: [...pages, { id: 'record-page:classes', decision: 'keep' }],
    photos: full.photos.filter((p) => p.photo !== 'photo:a2'),
    decisions: [
      { element: TEAM, decision: 'hide', reason: 'the brief names no team members' },
      { element: 'record-page:classes', decision: 'keep' },
      ...cards
    ],
    writingOrder: undefined,
    outOfScope: { brief: [] }
  }
}

test('the author is sent only the real choices: pages, sections on a page with their card rows and picture slots, and record pages', async () => {
  const author = scriptedAuthor([choicesOnly()])
  await prepareWith({ text: quietText(), editorial: author })
  const input = JSON.parse(author.calls[0].messages[1].content)
  assert.deepEqual(Object.keys(input.template).sort(), ['pages', 'recordPages', 'sections'])
  const sent = JSON.stringify(input.template)
  for (const kind of KINDS_FILLED) assert.ok(!sent.includes(`"${kind}:`), `no ${kind} is sent`)
  assert.ok(
    sent.includes('"picture:module-156.0 business.hero_image aspect 1.5"'),
    'a picture slot is sent in one line'
  )
  assert.ok(
    input.template.sections.every((e) => e.pages?.length > 0),
    'a section on no page is not sent'
  )
  // A card row of brief records (people, offerings, packages, quotes) is a choice; a row of the template's own parts
  // (statistic tiles, call-to-action cards, social links) follows its section.
  assert.ok(sent.includes('"cards:module-163.person capacity 4"'))
  assert.ok(!sent.includes('cards:module-160.stat'))
  assert.match(author.calls[0].messages[0].content, /filled by code/i)
})

test('an answer with only the real choices is completed by code and accepted in one round', async () => {
  const author = scriptedAuthor([choicesOnly()])
  const { records } = await prepareWith({ text: quietText(), editorial: author })
  const run = records.sitePlan
  assert.deepEqual(
    run.rounds.map((r) => [r.ok, r.reasonCount]),
    [[true, 0]]
  )
  const plan = run.plan
  const decision = (/** @type {string} */ id) => plan.decisions.find((d) => d.element === id)
  // The author's own decisions stand; code fills the rest, and says so.
  assert.equal(decision(TEAM).decision, 'hide')
  assert.equal(decision(TEAM).by, undefined)
  assert.deepEqual(decision('section:module-156'), {
    element: 'section:module-156',
    decision: 'keep',
    by: 'default'
  })
  // The hero picture takes the brief photo the author placed in it; the hero button its mapped action, to a kept page.
  assert.deepEqual(decision('picture:module-156.0').picture, { photo: 'photo:a1' })
  assert.deepEqual(decision('button:module-156.5').action, { kind: 'page', target: CONTACT })
  assert.equal(decision('icon:module-157.12').decision, 'keep')
  // Nothing inside the hidden team section, and no section on no page, is in the plan.
  assert.ok(!plan.decisions.some((d) => inventory.elements.find((e) => e.id === d.element)?.section === TEAM))
  // A card row of the template's own parts keeps the cards the template shows; a refused photo is skipped with its reason.
  assert.deepEqual(decision('cards:module-160.stat'), {
    element: 'cards:module-160.stat',
    decision: 'keep',
    count: 1,
    by: 'default'
  })
  assert.deepEqual(
    plan.photos.find((p) => p.photo === 'photo:a2'),
    { photo: 'photo:a2', decision: 'skip', reason: 'its labels refuse it: graphic', by: 'default' }
  )
  // A page left out is dropped; what the plan takes off is in the template out-of-scope list, with its reason.
  assert.equal(plan.pages.find((p) => p.id === 'page:menuItem-152').decision, 'drop')
  assert.ok(plan.outOfScope.template.some((o) => o.element === 'page:menuItem-152' && o.reason))
  assert.ok(plan.outOfScope.template.some((o) => o.element === TEAM && /no team/.test(o.reason)))
  // The writing order is put in dependency order by code: the summarised page before its summary.
  assert.ok(plan.writingOrder.indexOf(CLASSES) < plan.writingOrder.indexOf(HOME))
})

/** A plan answer with its ids changed: `edit` gets the plan and returns it. */
const planWith = (edit) => edit(structuredClone(planOf({ team: false })))
const cut = () =>
  Object.assign(new Error('TRUNCATED: the answer stopped at the reply limit'), { code: 'TRUNCATED' })

test('the plan call asks low reasoning effort and a budget from its work, never the model maximum, both on the build record', async () => {
  const author = scriptedAuthor([planOf({ team: false })])
  const { records } = await prepareWith({ text: quietText(), editorial: author })
  const run = records.sitePlan
  assert.equal(run.status, 'accepted')
  assert.equal(author.calls[0].effort, 'low')
  const budget = author.calls[0].maxTokens?.budget
  assert.ok(
    Number.isInteger(budget) && budget > 16_384,
    `a budget with room for the answer and its reasoning: ${budget}`
  )
  assert.ok(budget < 100_000, `never the model maximum (384000 was refused with HTTP 402): ${budget}`)
  assert.deepEqual(run.request, { effort: 'low', maxTokens: budget })
  // The author is given the only ids a photo decision may name.
  const input = JSON.parse(author.calls[0].messages[1].content)
  assert.deepEqual(input.ids.photos, ['photo:a1'])
  assert.ok(input.ids.pictureSlots.includes('picture:module-156.0'))
  assert.ok(input.ids.pictureSlots.every((id) => id.startsWith('picture:')))
})

test('a plan cut at its budget is asked again once with twice the room, in the same round', async () => {
  const author = scriptedAuthor([cut(), planOf({ team: false })])
  const { records } = await prepareWith({ text: quietText(), editorial: author })
  const run = records.sitePlan
  assert.equal(run.status, 'accepted')
  assert.equal(run.rounds.length, 1)
  assert.equal(run.rounds[0].truncated, 1)
  assert.equal(author.calls[1].maxTokens.budget, author.calls[0].maxTokens.budget * 2)
  assert.equal(run.totals.calls, 2)
})

test('a near-miss photo or slot id is put right by code and listed; an invented one is refused with the valid ids named', async () => {
  const near = planWith((p) => {
    p.photos[0] = { photo: 'PHOTO:a1', decision: 'use', slots: ['module-156.0'] }
    return p
  })
  const author = scriptedAuthor([near])
  const { records } = await prepareWith({ text: quietText(), editorial: author })
  const run = records.sitePlan
  assert.equal(run.status, 'accepted', JSON.stringify(run.rounds[0]?.reasons))
  assert.equal(run.rounds.length, 1)
  assert.deepEqual(run.rounds[0].idRepairs, [
    { field: 'photos.photo', from: 'PHOTO:a1', to: 'photo:a1' },
    { field: 'photos.slots', from: 'module-156.0', to: 'picture:module-156.0' }
  ])
  // A different number is never guessed: the reason names the closest valid slots, and round two fixes it.
  const invented = planWith((p) => {
    p.photos[0] = { photo: 'photo:a1', decision: 'use', slots: ['picture:module-156.97'] }
    return p
  })
  const again = scriptedAuthor([invented, planOf({ team: false })])
  const second = (await prepareWith({ text: quietText(), editorial: again })).records.sitePlan
  assert.equal(second.status, 'accepted')
  const reason = second.rounds[0].reasons.find((r) => r.element === 'picture:module-156.97')
  assert.match(reason.message, /ids\.pictureSlots/)
  assert.match(reason.message, /picture:module-156\.0/)
})
