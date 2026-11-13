// The build chat's scenario runner (#604): every stage of `../fixtures/build-chat/stages.mjs` is fed to dsh's real
// chat components (fixture `fixtures/build-chat-conversation.tsx`, a stub runtime kit, no dsh host), and its checks
// read the visible text and the actions on offer, at a phone width and a desktop width, with the light and the dark
// theme set.
//
// LIMIT: like the other plugin e2e tests, the bundle drops CSS, so this proves content and actions, not the look.
// The look is checked on a real local stack by a separate pass.
//
// Adding a stage (#605 to #608): add it to `STAGES` in `stages.mjs`, then one entry `'<name>': async (chat) => {...}`
// in `CHECKS` below. A stage without checks fails, so no stage is drawn unchecked.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { buildPlanProblems } from '../../../../wo/website-opportunities/domain/build-contract-plan.mjs'
import {
  applyPlanEdit,
  checkPlanEdit
} from '../../../../wo/website-opportunities/domain/build-contract-plan-edit.mjs'
import { RESEARCH, SCENARIOS, STAGES, stageDocuments, TEMPLATES } from '../fixtures/build-chat/stages.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const require = createRequire(import.meta.url)
const fromAskForm = { paths: [path.join(root, 'packages/ui/tracy-ask-form')] }
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 }
]
const THEMES = ['light', 'dark']

/** What the chat has received at one stage, as the fixture reads it. */
function stageView(stage) {
  const scenario = SCENARIOS[stage.from]
  const asked = stage.take.questions === true || stage.take.plan === true
  const { scenario: cut } = stageDocuments(stage)
  const runs = cut?.runs ?? []
  return {
    name: stage.name,
    research: RESEARCH,
    questions: asked ? scenario.questions : [],
    answers: stage.take.plan === true ? scenario.answers : [],
    // The template card from the template stage on; chosen once the plan has been edited or built.
    templates: stage.take.plan === true ? TEMPLATES : null,
    chosen:
      stage.take.plan === true && stage.name !== 'template-choice' ? scenario.plan.look.template.slug : null,
    run: runs.at(-1) ?? null,
    // The plan card while the plan is read and edited, with the edits received so far applied; the review bar only
    // while it waits for approval.
    plan: PLAN_STAGES.has(stage.name) ? (cut.edits ?? []).reduce(applyPlanEdit, cut.plan) : null,
    review: stage.name === 'plan'
  }
}

/** The stages that show the plan card before approval. */
const PLAN_STAGES = new Set(['plan', 'plan-edit-undo'])

/** Helpers each check gets: the page, and readers of what the owner sees and can press. */
function chatOf(page) {
  return {
    page,
    text: () => page.locator('#root').innerText(),
    button: (name) => page.getByRole('button', { name, exact: true }),
    sent: () => page.evaluate(() => window.probe.get().sent)
  }
}

/** The research line collapsed: one row, its title and summary, nothing it read yet. */
async function researchCollapsed(chat) {
  const text = await chat.text()
  assert.match(text, /Read 3 sources/)
  assert.match(text, /4 services, 38 photos, 6 reviews/)
  assert.doesNotMatch(text, /Google Maps/, 'the sources stay folded until asked for')
}

/** The answers given stay in the conversation as one reply. */
async function answersKept(chat) {
  const text = await chat.text()
  assert.match(text, /Book a court, 04 000 0000/)
  assert.equal(await chat.button('Submit').count(), 0, 'no question is asked again')
}

/** The task list: its rows in plain words, never a site check, never code. */
async function taskList(chat) {
  const list = chat.page.getByRole('region', { name: 'Building your site' })
  const rows = await list.locator('li').allInnerTexts()
  assert.equal(rows.length, 9)
  assert.match(rows.at(-1), /^Put your pages on the site/, 'the write step is the last task')
  assert.ok(
    rows.every((r) => !/check|verify/i.test(r)),
    'no site check step'
  )
  assert.equal(await chat.page.locator('#root code, #root pre').count(), 0, 'no code is shown')
  return { list, rows, clock: () => list.getByRole('timer', { name: 'Elapsed time' }).innerText() }
}

/** The template card once chosen: JA Boxing only, locked. */
async function templateChosen(chat) {
  const text = await chat.text()
  assert.match(text, /Chosen: JA Boxing/)
  assert.doesNotMatch(text, /JA Kinetic|JA Impact|Coming soon/)
  assert.equal(await chat.button('Use JA Boxing').count(), 0)
}

/** The plan card: the region named after the plan, and its section by title. */
function planCard(chat) {
  const card = chat.page.getByRole('article', { name: 'Sunrise Tennis Club site plan' })
  return { card, section: (name) => card.getByRole('region', { name, exact: true }) }
}

/** The plan as read before approval: every section of the card, in labelled values, no written copy. */
async function planRead(chat) {
  const { card, section } = planCard(chat)
  const text = await card.innerText()
  assert.match(text, /Design: JA Boxing/)
  const facts = await section('Business facts').innerText()
  for (const [label, value, source] of [
    ['Business name', 'Sunrise Tennis Club', 'Website'],
    ['Tagline', 'Tennis for every age and level', 'Instagram bio'],
    ['Phone', '04 000 0000', 'Your answer'],
    ['Address', '12 Court Lane, Harbour District', 'Google Maps'],
    ['Site language', 'English', 'All sources']
  ])
    assert.match(facts, new RegExp(`${label}\\s*${value}\\s*${source}`))
  const look = await section('Look').innerText()
  assert.match(look, /Template\s*JA Boxing/)
  assert.match(look, /Accent colour\s*#1f7a4d/)
  assert.match(look, /Logo on light\s*Your logo, from Instagram profile picture/)
  assert.match(look, /Logo on dark\s*Your logo, from Instagram profile picture/)
  assert.match(await section('Services (4)').innerText(), /Service 4\s*Cardio tennis\s*Instagram post/)
  const pages = await section('Pages (5)').innerText()
  for (const name of ['Home', 'About', 'Services', 'Coaches', 'Contact'])
    assert.match(pages, new RegExp(name))
  assert.match(pages, /Home\s*4 sections/)
  assert.match(
    pages,
    /Top banner\s*Business name, tagline, main button\s*Your name and booking button come first\./
  )
  assert.match(pages, /Reviews\s*6 quotes\s*The template has no reviews block/)
  assert.match(pages, /Services\s*Adult coaching, Junior squad, Court hire, Cardio tennis\s*From Services/)
  // The Services block's child list: its heading and rows under the block line; the list planned empty shows nothing.
  assert.match(
    pages,
    /Adult coaching, sessions\s*Tuesday and Thursday, 18:00 to 19:00\s*Saturday, 9:00 to 10:00/
  )
  assert.doesNotMatch(pages, /Junior squad, sessions/)
  assert.match(pages, /Coach cards\s*3 people\s*Your three coaches/)
  assert.match(pages, /Photo gallery\s*12 photos/)
  const pictures = await section('Pictures').innerText()
  assert.match(pictures, /Your photos\s*31 photos from Instagram and Website/)
  assert.match(pictures, /Drawn pictures\s*2 pictures\s*Two spots have no fitting photo/)
  assert.match(
    await section('Assumptions').innerText(),
    /Every source is in English, so the site is in English\./
  )
  const left = await section('Left out').innerText()
  assert.match(left, /Prices page\.\s*No public prices found\./)
  assert.match(left, /Video in the top banner\.\s*Your videos are upright/)
  return { card, section }
}

const CHECKS = {
  research: async (chat) => {
    await researchCollapsed(chat)
    const row = chat.page.getByRole('button', { name: /Read 3 sources/ })
    await row.click()
    const open = await chat.text()
    for (const source of ['Website', 'Instagram', 'Google Maps']) assert.match(open, new RegExp(source))
    assert.match(open, /Address: 12 Court Lane, Harbour District/)
    await row.click()
    await researchCollapsed(chat)
  },
  questions: async (chat) => {
    await researchCollapsed(chat)
    const text = await chat.text()
    assert.match(text, /What should visitors do first on your site\?/)
    assert.doesNotMatch(text, /Which is correct\?/, 'one question at a time')
    for (const label of ['Book a court', 'Call', 'WhatsApp', 'Send a form'])
      assert.match(text, new RegExp(label))
    assert.equal(await chat.page.locator('textarea').count(), 1, 'a free text answer is offered')
    assert.match(text, /1 \/ 2/)
    await chat.page.getByText('Book a court', { exact: true }).click()
    // dsh's card moves to the next question once a single choice is picked.
    await chat.page.waitForFunction(() => /2 \/ 2/.test(document.body.innerText))
    const second = await chat.text()
    assert.match(second, /Two sources show different phone numbers\. Which is correct\?/)
    assert.doesNotMatch(second, /What should visitors do first/)
    await chat.page.locator('textarea').fill('04 000 0001')
    await chat.button('Submit').click()
    await chat.page.waitForFunction(() => window.probe.get().sent.length === 2)
    assert.deepEqual(await chat.sent(), [
      { schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'book' },
      { schema: 'tracy-build-answer/v1', question: 'phone', text: '04 000 0001' }
    ])
    await chat.page.waitForFunction(() => /Book a court, 04 000 0001/.test(document.body.innerText))
    assert.equal(await chat.button('Submit').count(), 0, 'the card is gone, the answer stays')
  },
  'template-choice': async (chat) => {
    await answersKept(chat)
    const group = chat.page.getByRole('group', { name: 'Designs for your site' })
    const cards = group.getByRole('button')
    assert.equal(await cards.count(), 1, 'only the released, fitting template')
    const card = await cards.first().innerText()
    assert.match(card, /JA Boxing/)
    assert.match(card, /Recommended/)
    assert.match(card, /Built for sports clubs: classes, coaches and a booking button up front\./)
    assert.equal(await group.locator('img').count(), 1, 'the card has its picture')
    await group.locator('img').evaluate((img) => img.decode())
    assert.ok((await group.locator('img').evaluate((img) => img.naturalWidth)) > 0, 'the picture loads')
    assert.doesNotMatch(await chat.text(), /JA Kinetic|JA Impact|Coming soon/)
    assert.match(await chat.text(), /You can change the design later\./)
    // Keyboard: the choose action is reached with Tab and pressed with Enter.
    const use = chat.button('Use JA Boxing')
    await use.focus()
    await chat.page.keyboard.press('Enter')
    await chat.page.waitForFunction(() => /Chosen: JA Boxing/.test(document.body.innerText))
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().requests), [
      {
        method: 'PUT',
        url: '/api/build-draft/template',
        body: { template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.0' } }
      }
    ])
    // Nothing fits: the owner is told, and pointed to Add site.
    await chat.page.evaluate((view) => window.probe.mount(view), {
      ...(await chat.page.evaluate(() => window.probe.view)),
      templates: []
    })
    await chat.page.waitForFunction(() =>
      /No ready design fits your business yet\./.test(document.body.innerText)
    )
    const addSite = chat.page.getByRole('link', { name: 'Open Add site' })
    assert.equal(await addSite.getAttribute('href'), '?tab=tracy%3Aadd-site')
    assert.equal(await chat.page.getByRole('group', { name: 'Designs for your site' }).count(), 0)
  },
  plan: async (chat) => {
    await answersKept(chat)
    await templateChosen(chat)
    const { card } = await planRead(chat)
    // A conflicting fact: both values with their source, the website's selected.
    const hours = card.getByRole('radiogroup', { name: 'Opening hours' })
    const website = hours.getByRole('radio', {
      name: /Weekdays 6:00 to 22:00, weekends 8:00 to 18:00\s*Website/
    })
    const google = hours.getByRole('radio', { name: /Every day, 6:00 to 22:00\s*Google Maps/ })
    assert.equal(await hours.getByRole('radio').count(), 2)
    assert.equal(await website.isChecked(), true)
    assert.equal(await google.isChecked(), false)
    assert.match(await card.innerText(), /the hours on your website are used/)
    // Nothing is written anywhere before the owner acts.
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().requests), [])
    // Keyboard: the checked radio takes focus, the arrow key picks the other value; one structured plan edit is sent.
    await website.focus()
    await chat.page.keyboard.press('ArrowDown')
    await chat.page.waitForFunction(() => window.probe.get().requests.length === 1)
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().requests), [
      {
        method: 'POST',
        url: '/api/build-draft/plan-edits',
        body: {
          edit: {
            schema: 'tracy-build-plan-edit/v1',
            id: 'edit-1',
            plan: { id: 'plan-sunrise-tennis', revision: 1 },
            changes: [{ field: 'facts[hours].value', value: 'Every day, 6:00 to 22:00' }]
          }
        }
      }
    ])
    const [{ body }] = await chat.page.evaluate(() => window.probe.get().requests)
    const view = await chat.page.evaluate(() => window.probe.view)
    assert.deepEqual(checkPlanEdit(body.edit, view.plan).problems, [], 'the edit passes the Contract B check')
    // The card follows the plan the draft answered with.
    await chat.page.waitForFunction(
      () => document.querySelector('[data-field="facts[hours].value"] input[value^="Every day"]')?.checked
    )
    assert.equal(await website.isChecked(), false)
    assert.doesNotMatch(await card.innerText(), /not saved/)
    assert.doesNotMatch(
      await card.innerText(),
      /the hours on your website are used/,
      'the stale assumption goes'
    )
    // The plan review bar: Approve and Request changes. Approve only emits the approval; no site write.
    assert.match(await chat.text(), /Sunrise Tennis Club: 5 pages, 4 services/)
    assert.equal(await chat.button('Request changes').count(), 1)
    await chat.button('Approve').click()
    await chat.page.waitForFunction(() => window.probe.get().decisions.length === 1)
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().decisions), [
      { plan: { id: 'plan-sunrise-tennis', revision: 2 } }
    ])
    assert.deepEqual(
      (await chat.page.evaluate(() => window.probe.get().requests)).map((r) => r.url),
      ['/api/build-draft/plan-edits'],
      'approval writes nothing; site creation is the next ticket'
    )
    // Request changes hands the turn back to the chat, with no approval.
    await chat.page.evaluate(
      (view) => window.probe.mount(view),
      await chat.page.evaluate(() => window.probe.view)
    )
    await chat.button('Request changes').click()
    await chat.page.waitForFunction(() => window.probe.get().decisions.length === 1)
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().decisions), [{ requestChanges: true }])
    assert.deepEqual(await chat.page.evaluate(() => window.probe.get().requests), [])
  },
  'plan-edit-undo': async (chat) => {
    await answersKept(chat)
    await templateChosen(chat)
    // The card reads the plan with the edits received so far: the tagline changed and changed back.
    const { card, section } = await planRead(chat)
    assert.match(await section('Business facts').innerText(), /Tagline\s*Tennis for every age and level/)
    assert.equal(await chat.button('Approve').count(), 0, 'the review bar waits for the plan stage')
    const view = await chat.page.evaluate(() => window.probe.view)
    const requests = () => chat.page.evaluate(() => window.probe.get().requests)
    const at = (field) => card.locator(`[data-field="${field}"]`)
    const focusedName = () =>
      chat.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    const undo = card.getByRole('button', { name: 'Undo last change' })

    // What a Contract B plan edit can change is a button named after its field; nothing else looks editable.
    const editable = await card
      .getByRole('button', { name: /^Edit / })
      .evaluateAll((buttons) => buttons.map((b) => b.closest('[data-field]').dataset.field))
    assert.deepEqual(editable, [
      'facts[name].value',
      'facts[tagline].value',
      'facts[button].value',
      'facts[phone].value',
      'facts[email].value',
      'facts[address].value',
      'look.accent',
      'items[s1].label',
      'items[s2].label',
      'items[s3].label',
      'items[s4].label',
      'pictures.generated.frames'
    ])
    for (const field of ['language', 'look.template', 'look.logo', 'pages[home].blocks[h2].data'])
      assert.equal(await at(field).locator('button').count(), 0, `${field} is shown, not offered`)
    assert.equal(await undo.isDisabled(), true, 'nothing to undo yet')

    // Keyboard: Tab reaches the value, Enter opens its editor, Escape puts it back and focus returns.
    const tagline = card.getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' })
    await card.getByRole('button', { name: /^Edit Business name/ }).focus()
    await chat.page.keyboard.press('Tab')
    assert.equal(await focusedName(), 'Edit Tagline: Tennis for every age and level')
    await chat.page.keyboard.press('Enter')
    const input = card.getByRole('textbox', { name: 'New value for Tagline' })
    assert.equal(await input.inputValue(), 'Tennis for every age and level')
    assert.equal(await focusedName(), 'New value for Tagline', 'the editor takes focus')
    await input.fill('Something else')
    await chat.page.keyboard.press('Escape')
    assert.equal(await input.count(), 0)
    assert.equal(await focusedName(), 'Edit Tagline: Tennis for every age and level', 'focus is back')
    assert.deepEqual(await requests(), [], 'a cancelled edit sends nothing')

    // Enter saves: one structured plan edit of the current revision, without a chat message.
    await chat.page.keyboard.press('Enter')
    await input.fill('Tennis for every age')
    await chat.page.keyboard.press('Enter')
    await chat.page.waitForFunction(() => window.probe.get().requests.length === 1)
    const [saved] = await requests()
    assert.deepEqual(saved, {
      method: 'POST',
      url: '/api/build-draft/plan-edits',
      body: {
        edit: {
          schema: 'tracy-build-plan-edit/v1',
          id: 'edit-1',
          plan: { id: 'plan-sunrise-tennis', revision: 3 },
          changes: [{ field: 'facts[tagline].value', value: 'Tennis for every age' }]
        }
      }
    })
    assert.deepEqual(checkPlanEdit(saved.body.edit, view.plan).problems, [])
    assert.deepEqual(await chat.sent(), [], 'no chat message')
    // The card follows the returned draft: the new value, highlighted, and one undo on offer.
    await at('facts[tagline].value').and(chat.page.locator('[data-changed]')).waitFor()
    assert.match(await at('facts[tagline].value').innerText(), /^Tennis for every age\s*Changed/)
    assert.equal(
      (await at('facts[tagline].value').getByRole('button').getAttribute('aria-describedby')) !== null,
      true
    )
    assert.equal(await focusedName(), 'Edit Tagline: Tennis for every age', 'focus is back on the value')
    assert.equal(await card.locator('[data-changed]').count(), 1, 'only the changed value is highlighted')
    assert.equal(await undo.isEnabled(), true)
    // The highlight comes from the draft, so a card drawn again from it shows the same.
    await chat.page.evaluate(() => window.probe.reload())
    assert.equal(await card.locator('[data-changed][data-field="facts[tagline].value"]').count(), 1)
    assert.equal(await undo.isEnabled(), true)

    // One step of undo: the previous value is back, nothing is highlighted, and undo is no longer offered.
    await undo.click()
    await chat.page.waitForFunction(() => window.probe.get().requests.length === 2)
    assert.deepEqual((await requests())[1], { method: 'POST', url: '/api/build-draft/plan-undo', body: {} })
    await chat.page.waitForFunction(() => !document.querySelector('[data-changed]'))
    assert.match(
      await section('Business facts').innerText(),
      /Tagline\s*Tennis for every age and level\s*Instagram bio/
    )
    assert.equal(await undo.isDisabled(), true)
    assert.equal(await tagline.count(), 1)

    // A renamed service is one change to its item; the Services page and the Services block on Home follow.
    const beforeRename = await chat.page.evaluate(() => window.probe.get().plan)
    assert.equal(beforeRename.revision, 5, 'the edit and its undo each raised the revision')
    await card.getByRole('button', { name: 'Edit Service 2: Junior squad' }).click()
    await card.getByRole('textbox', { name: 'New value for Service 2' }).fill('Junior academy')
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await chat.page.waitForFunction(() => window.probe.get().requests.length === 3)
    const rename = (await requests())[2].body.edit
    assert.deepEqual(rename.changes, [{ field: 'items[s2].label', value: 'Junior academy' }])
    assert.deepEqual(
      checkPlanEdit(rename, beforeRename).problems,
      [],
      'the rename passes the Contract B check'
    )
    await at('items[s2].label').and(chat.page.locator('[data-changed]')).waitFor()
    assert.match(await section('Services (4)').innerText(), /Service 2\s*Junior academy\s*Changed/)
    const pages = await section('Pages (5)').innerText()
    assert.match(
      pages,
      /Home[\s\S]*Services\s*Adult coaching, Junior academy, Court hire, Cardio tennis\s*From Services/
    )
    assert.match(
      pages,
      /Services\s*1 section[\s\S]*Adult coaching, Junior academy, Court hire, Cardio tennis/
    )
    assert.doesNotMatch(await card.innerText(), /Junior squad/)

    // A stale or refused save says so and changes nothing.
    await chat.page.evaluate(() => window.probe.refuseEdits())
    await card.getByRole('button', { name: 'Edit Phone: 04 000 0000' }).click()
    await card.getByRole('textbox', { name: 'New value for Phone' }).fill('04 000 0002')
    await chat.page.keyboard.press('Enter')
    await card.getByRole('alert').waitFor()
    assert.match(await card.getByRole('alert').innerText(), /Your change was not saved\. Try again\./)
    assert.match(await section('Business facts').innerText(), /Phone\s*04 000 0000/)
    assert.equal(
      await card.locator('[data-changed][data-field="items[s2].label"]').count(),
      1,
      'the last change stands'
    )

    // A page added through the chat arrives as a newer plan: the card draws it in place, one plan, no versions.
    const added = structuredClone(await chat.page.evaluate(() => window.probe.get().plan))
    added.revision += 1
    added.pages.push({
      id: 'lessons',
      name: 'Lessons',
      pageType: 'contact',
      blocks: [
        {
          id: 'l1',
          type: 'contact',
          block: 'contact-form',
          source: 'template',
          label: 'Lesson request',
          data: ['email'],
          reason: 'You asked for a page to request a lesson.'
        }
      ]
    })
    const problems = []
    buildPlanProblems(added, (where, message) => problems.push(`${where}: ${message}`))
    assert.deepEqual(problems, [], 'the newer plan passes the plan check')
    await chat.page.evaluate((plan) => window.probe.putPlan(plan), added)
    await section('Pages (6)').waitFor()
    assert.match(await section('Pages (6)').innerText(), /Lessons\s*1 section\s*Lesson request/)
    assert.equal(await chat.page.getByRole('article').count(), 1, 'one living plan')
    assert.doesNotMatch(await chat.text(), /[Vv]ersion|[Rr]evision/, 'no version list')
    assert.equal(await card.locator('[data-changed]').count(), 0)
    assert.equal(await undo.isDisabled(), true)
  },
  building: async (chat) => {
    await answersKept(chat)
    const { rows, clock } = await taskList(chat)
    const text = await chat.text()
    assert.match(text, /1 completed\u2002·\u20025 in progress\u2002·\u20023 pending/)
    assert.doesNotMatch(text, /Your site is not finished yet|Failed/)
    assert.ok(rows.length === 9)
    const first = await clock()
    assert.match(first, /^0:3[89]$/)
    await chat.page.waitForFunction(
      (before) => document.querySelector('[role="timer"]')?.textContent !== before,
      first,
      { timeout: 2500 }
    )
  },
  done: async (chat) => {
    await answersKept(chat)
    const { clock } = await taskList(chat)
    assert.match(await chat.text(), /9 completed/)
    assert.equal(await clock(), '7:28')
    await chat.page.waitForTimeout(1100)
    assert.equal(await clock(), '7:28', 'the clock stops on the outcome')
    assert.doesNotMatch(await chat.text(), /not finished|Failed/)
    assert.doesNotMatch(await chat.page.locator('.tv-bc-todo-progress').innerText(), /in progress|pending/)
  },
  'could-not-finish': async (chat) => {
    await researchCollapsed(chat)
    assert.equal(await chat.button('Submit').count(), 0)
    const text = await chat.text()
    assert.match(text, /Your site is not finished yet/)
    assert.match(
      text,
      /The step "Draw 2 pictures for empty spots" failed twice, so I stopped instead of showing you a half built site\./
    )
    assert.match(text, /Kept: your plan, your answers and the 5 written pages\./)
    assert.match(text, /Your current site is unchanged\./)
    assert.match(text, /The Tracy team has been notified and will reply in this chat\./)
    assert.doesNotMatch(
      text,
      /Picture generation failed on both attempts|generated-pictures|Your site is ready/
    )
    const { rows, clock } = await taskList(chat)
    assert.match(text, /7 completed\u2002·\u20021 failed/)
    assert.match(rows[7], /Draw 2 pictures for empty spots\s*Failed twice/)
    assert.match(rows[8], /Put your pages on the site\s*Not started/)
    assert.equal(await clock(), '6:12')
    // Answers and plan are kept: the answers stay in the conversation, the chosen template stays chosen.
    assert.match(text, /Book a court, 04 000 0000/)
    await templateChosen(chat)
  },
  rebuild: answersKept
}

test('every stage has its checks', () => {
  assert.deepEqual(
    STAGES.map((s) => s.name).filter((name) => CHECKS[name] === undefined),
    []
  )
})

test('build chat stages: visible result and actions at phone and desktop width, light and dark', async (t) => {
  const result = await build({
    stdin: {
      contents: readFileSync(path.join(here, 'fixtures/build-chat-conversation.tsx'), 'utf8'),
      resolveDir: path.join(here, 'fixtures'),
      loader: 'tsx'
    },
    bundle: true,
    format: 'iife',
    write: false,
    // CSS modules need an output path to name their classes; nothing is written (`write: false`) and the CSS is
    // not loaded into the page.
    outdir: path.join(here, 'out'),
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty', '.module.css': 'local-css' },
    alias: {
      react: path.dirname(require.resolve('react/package.json', fromAskForm)),
      'react-dom': path.dirname(require.resolve('react-dom/package.json', fromAskForm))
    }
  })
  const bundle = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text
  const browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage({ viewport })
        page.setDefaultTimeout(5000)
        const errors = []
        page.on('pageerror', (e) => errors.push(e.message))
        const dark = theme === 'dark' ? ' class="dark" data-ds-dark-theme=""' : ''
        // A served origin, not about:blank: dsh's question drafts read localStorage.
        const html = `<!doctype html><html data-theme="${theme}"${dark}><body><div id="root"></div></body></html>`
        await page.route('http://build-chat.test/**', (route) =>
          route.fulfill({ status: 200, contentType: 'text/html', body: html })
        )
        await page.goto('http://build-chat.test/')
        await page.addScriptTag({ content: bundle })
        for (const stage of STAGES) {
          await t.test(`${stage.name} at ${viewport.name} width, ${theme}`, async () => {
            errors.length = 0
            await page.evaluate((view) => window.probe.mount(view), stageView(stage))
            await page.waitForSelector(`[data-stage="${stage.name}"]`).catch((error) => {
              throw new Error(`${stage.name} did not draw: ${errors.join(' | ') || error.message}`)
            })
            await CHECKS[stage.name](chatOf(page))
            assert.deepEqual(errors, [])
          })
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
})
