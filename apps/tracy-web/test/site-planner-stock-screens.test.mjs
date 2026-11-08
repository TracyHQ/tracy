// Stock screens every plan drops (`site.stockScreens`): the kit reader, the normaliser the planner step runs on every answer
// after the model, and the checker's R10a, which refuses a plan that keeps one. The kit is the JA Boxing 1.0.10 fixture of the
// plan checker with an invented stock screen declaration; every reason is made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  STOCK_SCREEN_ID,
  stockScreenOf,
  stockScreenPagesOf,
  stockScreensOf,
  withStockScreensDropped
} from '../src/lib/stock-screens.js'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { brief, kit, plan, ruleOf } from './_site-plan-check.mjs'

const WHY = 'an invented demo screen no customer content fills'

const stockKit = (stockScreens) => {
  const k = kit()
  k.site.stockScreens = stockScreens
  return k
}

test('the reader keeps exact and beneath paths with a reason, and names what it leaves out', () => {
  const { screens, problems } = stockScreensOf({
    site: {
      stockScreens: [
        { path: '/team', why: WHY },
        { path: '/team/people/*', why: WHY },
        { path: '/team', why: WHY },
        { path: '/', why: WHY },
        { path: 'team', why: WHY },
        { path: '/x/*/y', why: WHY },
        { path: '/no-reason' }
      ]
    }
  })
  assert.deepEqual(screens, [
    { path: '/team', why: WHY },
    { path: '/team/people/*', why: WHY }
  ])
  assert.equal(problems.length, 4)
  assert.equal(stockScreenOf('/team?start=6', screens)?.path, '/team')
  assert.equal(stockScreenOf('/team/people/ana', screens)?.path, '/team/people/*')
  assert.equal(stockScreenOf('/team/people', screens), null)
  assert.equal(stockScreenOf('/teams', screens), null)
  assert.deepEqual(stockScreensOf({ site: {} }), { screens: [], problems: [] })
})

test('stock screen pages: the kit pages a screen names, then each exact path no kit page holds', () => {
  const k = stockKit([
    { path: '/classes/advanced-boxing', why: WHY },
    { path: '/pages/j-content/author-listting/author/*', why: WHY },
    { path: '/pages/sample-type', why: WHY }
  ])
  const pages = stockScreenPagesOf(k)
  assert.deepEqual(
    pages.filter((p) => !p.inKit),
    [{ id: `${STOCK_SCREEN_ID}/pages/sample-type`, path: '/pages/sample-type', why: WHY, inKit: false }]
  )
  const ids = pages.filter((p) => p.inKit).map((p) => p.id)
  assert.ok(ids.includes('page-classes_advanced-boxing'))
  assert.ok(ids.includes('page-pages_j-content_author-listting_author_admin'))
  assert.ok(!ids.includes('page-pages_j-content_author-listting'), 'the list itself is not beneath itself')
  assert.deepEqual(stockScreenPagesOf(kit()), [])
})

test('the normaliser drops a kept stock screen of a kept group, adds a missing one, and leaves a dropped group out', () => {
  const k = stockKit([
    { path: '/classes/advanced-boxing', why: WHY },
    { path: '/classes/beginner-boxing', why: WHY },
    { path: '/plans', why: WHY }
  ])
  const p = plan()
  p.pages = p.pages.filter((x) => x.id !== 'page-classes_beginner-boxing')
  const out = withStockScreensDropped(p, k)
  assert.notEqual(out, p)
  const entry = (id) => out.pages.find((x) => x.id === id)
  assert.deepEqual(Object.keys(entry('page-classes_advanced-boxing')), ['id', 'decision', 'why'])
  assert.equal(entry('page-classes_advanced-boxing').decision, 'drop')
  assert.match(entry('page-classes_advanced-boxing').why, /stock screen.*invented demo screen/)
  assert.equal(entry('page-classes_beginner-boxing').decision, 'drop')
  assert.equal(entry('page-plans'), undefined, 'group-plans is dropped: its pages stay out of plan.pages')
  assert.equal(
    p.pages.find((x) => x.id === 'page-classes_advanced-boxing').decision,
    'keep',
    'input untouched'
  )
  // A kit without the field, or a plan already dropping them, comes back as the same object.
  assert.equal(withStockScreensDropped(p, kit()), p)
  assert.equal(withStockScreensDropped(out, k), out)
})

test('R10a refuses a plan that keeps a stock screen, and says nothing new on a kit without the field', () => {
  const k = stockKit([{ path: '/classes/advanced-boxing', why: WHY }])
  const kept = checkPlan({ plan: plan(), kit: k, brief: brief() }).rules.find((x) => x.id === 'R10a')
  assert.ok(
    kept.failures.some(
      (f) => f.where === 'pages page-classes_advanced-boxing' && /stock screen/.test(f.detail)
    ),
    kept.failures.map((f) => f.detail).join('\n')
  )
  assert.equal(
    ruleOf(plan(), 'R10a').status,
    'pass',
    'the base plan on the kit without the field still passes'
  )
  const dropped = withStockScreensDropped(plan(), k)
  const after = checkPlan({ plan: dropped, kit: k, brief: brief() }).rules.find((x) => x.id === 'R10a')
  assert.ok(
    !after.failures.some((f) => /stock screen/.test(f.detail)),
    'the normalised plan is not refused for it'
  )
})

test('the planner step normalises a whole answer and an applied change list, and a change list stays one', () => {
  const k = stockKit([{ path: '/classes/advanced-boxing', why: WHY }])
  const ready = { kit: { doc: k } }
  const read = SITE_PLANNER_STEP.readAnswer(plan(), { round: 0, row: {}, ready })
  assert.equal(read.pages.find((x) => x.id === 'page-classes_advanced-boxing').decision, 'drop')
  const list = { changes: [] }
  assert.equal(SITE_PLANNER_STEP.readAnswer(list, { round: 1, row: {}, ready }), list)
  const applied = SITE_PLANNER_STEP.changes.applyValidChanges(
    read,
    {
      changes: [
        {
          page: 'page-classes_advanced-boxing',
          with: plan().pages.find((x) => x.id === 'page-classes_advanced-boxing')
        }
      ]
    },
    { row: {}, ready }
  )
  assert.equal(applied.ok, true, applied.reason)
  assert.equal(
    applied.doc.pages.find((x) => x.id === 'page-classes_advanced-boxing').decision,
    'drop',
    'a fix round that keeps it again is dropped once more'
  )
  // A kit without the field: the answer is the model's own.
  const own = plan()
  assert.equal(SITE_PLANNER_STEP.readAnswer(own, { round: 0, row: {}, ready: { kit: { doc: kit() } } }), own)
})
