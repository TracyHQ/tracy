// The build chat plugin's REAL registration path in a browser (#609): `apply` of `src/client/index.tsx`, fed a
// recorded build session whose `tracy_build` results have the shape `build-tool.mjs` returns (fixture
// `fixtures/build-chat-plugin.tsx`). It checks what the owner sees and can press: no tool JSON, one template card,
// one living plan card in the latest plan's turn, inline edits through the draft door, the plan review bar from the
// question id alone, nothing outside a build session, nothing with the switch off. No model key: the results are
// recorded shapes with invented data.
//
// LIMIT: like the scenario runner, the bundle drops CSS, so this proves content and actions, not the look.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  applyPlanEdit,
  checkPlanEdit
} from '../../../../wo/website-opportunities/domain/build-contract-plan-edit.mjs'
import { approvalOf, planReviewRequestOf } from '../../src/build-chat/index.mjs'
import { STAGES, stageDocuments, TEMPLATES } from '../fixtures/build-chat/stages.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const require = createRequire(import.meta.url)
const fromAskForm = { paths: [path.join(root, 'packages/ui/tracy-ask-form')] }
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

const BUILD = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const OTHER = 'session-1a2b3c4d-4b5a-4968-8778-695a4b3c2d1e'
const PLAN = stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
const NAME = 'Sunrise Tennis Club'

/**
 * The session log of a build chat: research, templates, a plan, then an edit asked in the chat. Every turn has ended
 * unless `running` names one still in progress (dsh draws the tail of an ended turn only).
 */
function recordedSession({ running = null } = {}) {
  let seq = 0
  const call = (turn, callId, args) => ({
    type: 'tool/call',
    seq: ++seq,
    data: { turn, name: 'tracy_build', callId, arguments: JSON.stringify(args) }
  })
  const result = (turn, callId, value) => ({
    type: 'tool/result',
    seq: ++seq,
    surfaceOp: 'append',
    data: {
      turn,
      message: {
        source: { callId },
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(value) }]
      }
    }
  })
  const end = (turn) => (turn === running ? [] : [{ type: 'turn/end', seq: ++seq, data: { turn } }])
  const review = planReviewRequestOf(PLAN)
  return [
    call(0, 'c-research', { action: 'research', links: ['https://sunrise-tennis.example'] }),
    result(0, 'c-research', { profile: { business: NAME, counts: { services: 4 } } }),
    ...end(0),
    call(1, 'c-templates', { action: 'templates' }),
    result(1, 'c-templates', { options: TEMPLATES, none: false }),
    ...end(1),
    call(2, 'c-plan', { action: 'plan' }),
    result(2, 'c-plan', { plan: { id: PLAN.id, revision: PLAN.revision }, review }),
    ...end(2),
    call(3, 'c-edit', { action: 'edit', changes: [{ field: 'look.accent', value: '#1f7a4d' }] }),
    result(3, 'c-edit', { plan: { id: PLAN.id, revision: PLAN.revision }, review }),
    call(3, 'c-stale', { action: 'edit', changes: [] }),
    result(3, 'c-stale', { stale: true, next: 'The plan changed meanwhile.' }),
    ...end(3)
  ]
}

/** The plan review request as dsh's question tool passes it to the browser: no detail, no intent. */
const askedReview = () =>
  planReviewRequestOf(PLAN).questions.map(({ id, question, options }) => ({
    id,
    question,
    options,
    multiSelect: false
  }))

/** tracy-web's build draft doors, answered in the runner: the draft, the template pick, the plan edits. */
function draftDoors(plan, { templateFails = false, canUndo = null } = {}) {
  const state = { plan: structuredClone(plan), lastEdit: null, template: null, requests: [] }
  const body = () => ({
    draft: {
      id: 'draft-1',
      plan: state.plan,
      lastEdit: state.lastEdit,
      canUndo: canUndo ?? state.lastEdit !== null,
      template: state.template
    }
  })
  return {
    state,
    async handle(route) {
      const request = route.request()
      const url = new URL(request.url())
      const sent = request.postDataJSON?.() ?? null
      state.requests.push({ method: request.method(), path: url.pathname, body: sent })
      const json = (value, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
      if (url.pathname === '/api/build-draft' && request.method() === 'GET') return json(body())
      if (url.pathname === '/api/build-draft/template') {
        if (templateFails) return json({ code: 'UNAVAILABLE' }, 503)
        state.template = sent.template
        return json(body())
      }
      if (url.pathname === '/api/build-draft/plan-edits') {
        const checked = checkPlanEdit(sent.edit, state.plan)
        if (!checked.ok) return json({ code: 'INVALID_EDIT' }, 422)
        state.plan = applyPlanEdit(state.plan, sent.edit)
        state.lastEdit = sent.edit
        return json(body())
      }
      return json({ code: 'NOT_FOUND' }, 404)
    }
  }
}

const bundled = await build({
  stdin: {
    contents: readFileSync(path.join(here, 'fixtures/build-chat-plugin.tsx'), 'utf8'),
    resolveDir: path.join(here, 'fixtures'),
    loader: 'tsx'
  },
  bundle: true,
  format: 'iife',
  write: false,
  outdir: path.join(here, 'out'),
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty', '.module.css': 'local-css' },
  alias: {
    react: path.dirname(require.resolve('react/package.json', fromAskForm)),
    'react-dom': path.dirname(require.resolve('react-dom/package.json', fromAskForm))
  }
})
const bundle = bundled.outputFiles.find((f) => f.path.endsWith('.js'))?.text

/** One page with the plugin applied; `hidden` is what `/api/ui` answers. */
async function open(
  browser,
  { viewport, theme = 'light', hidden = [], plan = PLAN, templateFails = false, canUndo = null }
) {
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const dark = theme === 'dark' ? ' class="dark" data-ds-dark-theme=""' : ''
  const html = `<!doctype html><html data-theme="${theme}"${dark}><body><div id="root"></div></body></html>`
  const doors = draftDoors(plan, { templateFails, canUndo })
  await page.route('http://build-chat.test/**', (route) => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/ui')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hidden }) })
    if (p.startsWith('/api/build-draft')) return doors.handle(route)
    return route.fulfill({ status: 200, contentType: 'text/html', body: html })
  })
  await page.goto('http://build-chat.test/')
  await page.addScriptTag({ content: bundle })
  return { page, errors, doors, text: () => page.locator('#root').innerText() }
}

const launch = () =>
  chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))

test('the real plugin draws the build chat from recorded tracy_build results, phone and desktop, light and dark', async (t) => {
  const browser = await launch()
  try {
    for (const viewport of [
      { name: 'phone', width: 390, height: 844 },
      { name: 'desktop', width: 1280, height: 800 }
    ])
      for (const theme of ['light', 'dark'])
        await t.test(`${viewport.name}, ${theme}`, async () => {
          const { page, errors, doors, text } = await open(browser, { viewport, theme })
          await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
          const card = page.getByRole('article', { name: `${NAME} site plan` })
          await card.waitFor()

          // The rows say what happened in plain words; the stale answer is the model's alone; no JSON anywhere.
          const all = await text()
          for (const line of [
            'Read 1 source',
            NAME,
            'Found designs for your site',
            'Prepared your site plan',
            'Updated your site plan'
          ])
            assert.ok(all.includes(line), line)
          assert.doesNotMatch(all, /[{}]|"plan"|revision|stale/i)
          assert.equal(await page.locator('[data-call="c-stale"] [data-build-tool]').count(), 0)

          // One template card in its own turn; one living plan card, in the turn of the latest plan.
          assert.equal(
            await page
              .locator('[data-turn="1"]')
              .getByRole('button', { name: 'Use JA Boxing', exact: true })
              .count(),
            1
          )
          assert.equal(await page.getByRole('article').count(), 1, 'one living plan')
          assert.equal(await page.locator('[data-turn="3"]').getByRole('article').count(), 1)
          assert.equal(
            await page.locator('[data-turn="2"]').getByRole('article').count(),
            0,
            'the older plan turn shows none'
          )
          assert.equal(
            await page.getByRole('region', { name: 'Building your site' }).count(),
            0,
            'no build run yet'
          )

          // The pick goes through the template door.
          await page.getByRole('button', { name: 'Use JA Boxing', exact: true }).click()
          await page.getByText('Chosen: JA Boxing').waitFor()
          assert.ok(
            doors.state.requests.some((r) => r.method === 'PUT' && r.path === '/api/build-draft/template')
          )
          // The saved pick moves the chat on by itself: one plain message as the owner, queued, sent once.
          await page.waitForFunction(() => window.probe.sent().length === 1)
          assert.deepEqual(await page.evaluate(() => window.probe.sent()), [
            { sessionId: BUILD, text: 'I picked JA Boxing.', mode: 'queue' }
          ])

          // An inline edit goes through the plan edit door, and the card follows the draft it answers with.
          await card.getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' }).click()
          await card.getByRole('textbox', { name: 'New value for Tagline' }).fill('Tennis for every age')
          await page.keyboard.press('Enter')
          await card.locator('[data-changed][data-field]').first().waitFor()
          const edit = doors.state.requests.find((r) => r.path === '/api/build-draft/plan-edits')
          assert.equal(
            checkPlanEdit(edit.body.edit, PLAN).ok,
            true,
            'the edit the card sent passes the contract'
          )
          assert.match(await card.innerText(), /Tennis for every age/)

          // The plan review request as dsh's question tool passes it: no detail, no intent. The bar still claims it.
          await page.evaluate((qs) => window.probe.ask(qs), askedReview())
          const bar = page.getByRole('region', { name: 'Approve this plan?' })
          await bar.waitFor()
          assert.match(await bar.innerText(), new RegExp(`${NAME} site plan`))
          assert.match(await bar.innerText(), /5 pages, 4 services/)
          await bar.getByRole('button', { name: 'Approve', exact: true }).click()
          await page.waitForFunction(() => window.probe.answered().length === 1)
          const [reply] = await page.evaluate(() => window.probe.answered())
          assert.deepEqual(reply, { answers: [{ id: 'plan-review', selected: ['Approve'] }] })
          assert.ok(approvalOf(doors.state.plan, reply), 'approvalOf reads the answer unchanged')

          // An engine question stays dsh's own card.
          await page.evaluate(() =>
            window.probe.ask([
              {
                id: 'main-button',
                question: 'What should the main button do?',
                options: [{ label: 'Book a court' }],
                multiSelect: false
              }
            ])
          )
          await page.locator('[data-dsh-question]').waitFor()
          assert.deepEqual(errors, [])
          await page.close()
        })
  } finally {
    await browser.close()
  }
})

test('the plan shows while its turn still waits on the review, and once the turn ends there is one plan card', async () => {
  const browser = await launch()
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 }
    ]) {
      const { page, errors, doors } = await open(browser, { viewport })
      // The turn that answered the latest plan asks the review and has not ended: dsh draws none of its tail.
      await page.evaluate(
        ([id, events]) => window.probe.load(id, events),
        [BUILD, recordedSession({ running: 3 })]
      )
      await page.evaluate((qs) => window.probe.ask(qs), askedReview())
      const bar = page.getByRole('region', { name: 'Approve this plan?' })
      await bar.waitFor()
      const card = page.getByRole('article', { name: `${NAME} site plan` })
      await card.waitFor()
      assert.equal(await page.getByRole('article').count(), 1, 'one plan card, with the review bar')
      assert.equal(await page.locator('[data-turn="3"]').getByRole('article').count(), 0, 'no tail yet')
      assert.ok(await card.isVisible(), 'the plan is in sight with the bar')

      // Its inline edit and undo work there.
      const undo = card.getByRole('button', { name: 'Undo last change' })
      assert.equal(await undo.isDisabled(), true, 'nothing to undo yet')
      await card.getByRole('button', { name: 'Edit Tagline: Tennis for every age and level' }).click()
      await card.getByRole('textbox', { name: 'New value for Tagline' }).fill('Tennis for every age')
      await page.keyboard.press('Enter')
      await card.locator('[data-changed][data-field]').first().waitFor()
      assert.ok(doors.state.requests.some((r) => r.path === '/api/build-draft/plan-edits'))
      assert.equal(await undo.isDisabled(), false, 'the last edit can be taken back')

      await bar.getByRole('button', { name: 'Approve', exact: true }).click()
      await page.waitForFunction(() => window.probe.answered().length === 1)

      // The answer is in and the turn ends: the bar is gone, the card stands at the turn's tail, once.
      await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
      await page.locator('[data-turn="3"]').getByRole('article').waitFor()
      assert.equal(await bar.count(), 0)
      assert.equal(await page.getByRole('article').count(), 1, 'exactly one plan card after the turn')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
  }
})

test('a pick sends its message once: not again on a new render or a reload, never when the save failed', async () => {
  const browser = await launch()
  try {
    const { page, errors } = await open(browser, { viewport: { width: 1280, height: 800 } })
    await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    await page.getByRole('button', { name: 'Use JA Boxing', exact: true }).click()
    await page.getByText('Chosen: JA Boxing').waitFor()
    await page.waitForFunction(() => window.probe.sent().length === 1)
    // The session drawn again (a reload reads the same log): the chosen card shows, nothing more is sent.
    await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    await page.getByText('Chosen: JA Boxing').waitFor()
    await page.waitForTimeout(300)
    assert.equal((await page.evaluate(() => window.probe.sent())).length, 1)
    assert.deepEqual(errors, [])
    await page.close()

    const failing = await open(browser, { viewport: { width: 390, height: 844 }, templateFails: true })
    await failing.page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    await failing.page.getByRole('button', { name: 'Use JA Boxing', exact: true }).click()
    await failing.page.getByText('Your choice was not saved. Try again.').waitFor()
    await failing.page.waitForTimeout(300)
    assert.deepEqual(await failing.page.evaluate(() => window.probe.sent()), [])
    assert.deepEqual(failing.errors, [])
  } finally {
    await browser.close()
  }
})

test('while a tracy_build call waits, a line above the chat input says work is going on, until it answers', async () => {
  const browser = await launch()
  try {
    const { page, errors } = await open(browser, { viewport: { width: 390, height: 844 } })
    const base = recordedSession()
    let seq = 1000
    const call = (callId, action) => ({
      type: 'tool/call',
      seq: ++seq,
      data: { turn: 4, name: 'tracy_build', callId, arguments: JSON.stringify({ action }) }
    })
    const result = (callId, value) => ({
      type: 'tool/result',
      seq: ++seq,
      surfaceOp: 'append',
      data: {
        turn: 4,
        message: {
          source: { callId },
          isError: false,
          content: [{ type: 'text', text: JSON.stringify(value) }]
        }
      }
    })
    const line = page.locator('[data-dock] [data-build-working]')
    const show = (events) => page.evaluate(([id, e]) => window.probe.load(id, e), [BUILD, events])

    // The plan call waits on the brand step: the line shows while it is unanswered...
    const asked = [...base, call('w-plan', 'plan')]
    await show(asked)
    await line.waitFor()
    assert.match(await line.innerText(), /Working on your site plan/)
    // ...while it answered "still running" and the agent keeps waiting with status...
    const waiting = [
      ...asked,
      result('w-plan', { running: true, say: 'Still working.' }),
      call('w-status', 'status')
    ]
    await show(waiting)
    await line.waitFor()
    await show([...asked, result('w-plan', { running: true, say: 'Still working.' })])
    await line.waitFor()
    // ...and is gone once the plan is there, and in a turn that ended.
    await show([...waiting, result('w-status', { plan: { id: PLAN.id, revision: PLAN.revision } })])
    await line.waitFor({ state: 'detached' })
    await show([...asked, { type: 'turn/end', seq: ++seq, data: { turn: 4 } }])
    await line.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('Undo with no last edit is disabled and out of the Tab order; left out lines are grouped in plain words; a zero count is not summed up', async () => {
  const browser = await launch()
  try {
    const plan = structuredClone(PLAN)
    const photo = 'The gallery block shows up to six photos.'
    plan.leftOut = [
      ...Array.from({ length: 37 }, () => ({ what: 'Photo', kind: 'item', reason: photo })),
      { what: 'match-report page', kind: 'page', reason: 'No article item is available for this page.' }
    ]
    plan.items = plan.items.filter((i) => i.kind !== 'service')
    for (const page of plan.pages)
      for (const block of page.blocks)
        block.data = (block.data ?? []).filter(
          (id) => plan.items.some((i) => i.id === id) || plan.facts.some((f) => f.id === id)
        )
    // A draft that claims an undo but holds no last edit: nothing to take back.
    const { page, errors } = await open(browser, {
      viewport: { width: 390, height: 844 },
      plan,
      canUndo: true
    })
    await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    const card = page.getByRole('article')
    await card.waitFor()
    const undo = card.getByRole('button', { name: 'Undo last change' })
    assert.equal(await undo.isDisabled(), true)
    assert.equal(await undo.evaluate((b) => b.tabIndex < 0 || b.disabled), true)

    const leftOut = card.getByRole('region', { name: 'Left out', exact: true })
    const text = await leftOut.innerText()
    assert.match(text, /37 photos\.\s*The gallery block shows up to six photos\./)
    assert.equal(text.match(/gallery block/g).length, 1, 'one line for the same reason')
    assert.match(text, /Match report page\./)
    assert.doesNotMatch(text, /match-report/)

    await page.evaluate((qs) => window.probe.ask(qs), askedReview())
    const bar = page.getByRole('region', { name: 'Approve this plan?' })
    await bar.waitFor()
    await page.waitForFunction(() => /5 pages/.test(document.body.innerText))
    assert.doesNotMatch(await bar.innerText(), /0 services|, $/m)
    assert.match(await bar.innerText(), new RegExp(`${NAME}: 5 pages$`, 'm'))
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('a dark theme accent and a temporary logo: both swatches labelled, the temporary logo line shown', async () => {
  const browser = await launch()
  try {
    const plan = structuredClone(PLAN)
    plan.look.accent = '#111111'
    plan.look.accentDark = '#f5f5f5'
    plan.look.logo = { kind: 'text' }
    const said = 'Your logo is a temporary one made from your business name. You can replace it later.'
    plan.assumptions = [...(plan.assumptions ?? []), { id: 'logo', field: 'look.logo', said }]
    const { page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, plan })
    await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    const look = page.getByRole('article').getByRole('region', { name: 'Look', exact: true })
    await look.waitFor()
    const text = await look.innerText()
    assert.match(text, /Accent colour, light theme\s*#111111/)
    assert.match(text, /Accent colour, dark theme\s*#f5f5f5/)
    assert.match(text, /Your business name as text/)
    assert.equal(
      await look.getByRole('button', { name: /Edit Accent colour, dark theme/ }).count(),
      0,
      'not editable yet'
    )
    assert.match(await page.getByRole('article').innerText(), new RegExp(said.replace('.', '\\.')))
    assert.doesNotMatch(await page.locator('#root').innerText(), /logo-made|from-logo/)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('outside a build chat session, and with the switch off, the plugin draws nothing', async () => {
  const browser = await launch()
  try {
    const other = await open(browser, { viewport: { width: 1280, height: 800 } })
    await other.page.evaluate(([id, events]) => window.probe.load(id, events), [OTHER, recordedSession()])
    await other.page.evaluate(() =>
      window.probe.ask([
        {
          id: 'plan-review',
          question: 'Approve this plan?',
          options: [{ label: 'Approve' }],
          multiSelect: false
        }
      ])
    )
    await other.page.locator('[data-dsh-question]').waitFor()
    assert.equal((await other.text()).trim(), 'Approve this plan?', 'only the stand in for dsh question card')
    assert.equal(await other.page.locator('[class*="tv-bc"]').count(), 0)
    assert.deepEqual(other.errors, [])

    const off = await open(browser, { viewport: { width: 1280, height: 800 }, hidden: ['chat-build'] })
    await off.page.waitForFunction(() => window.probe.registered().length === 0)
    await off.page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, recordedSession()])
    assert.equal(await off.page.locator('[class*="tv-bc"], [data-build-tool]').count(), 0)
    assert.equal(await off.page.getByRole('article').count(), 0)
    assert.deepEqual(off.errors, [])
  } finally {
    await browser.close()
  }
})
