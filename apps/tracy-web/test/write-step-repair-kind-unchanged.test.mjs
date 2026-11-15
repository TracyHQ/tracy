// Step 9b stops sending a kind of fault once its turns changed nothing on NO_CHANGE_PAGES pages (repair-schedule.js):
// on the local stand every 9b turn on template pictures ended with no change, page after page (run12: 9 turns, 10.9
// minutes, nothing changed). A page with a kind not yet tried still gets its turns. Fake pages and turns: no site, no
// agent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repairClock } from '../src/write-step/repair-pass/repair-limits.js'
import { schedulePages } from '../src/write-step/repair-pass/repair-schedule.js'
import { repairSummary } from '../src/write-step/repair-pass/repair-summary.js'

const picture = (page, file) => ({
  group: 'demo-pictures',
  page,
  slot: null,
  width: null,
  measured: `images/joomlart/${file}`,
  level: 'block',
  causingStep: 8,
  reason: 'no-demo-pictures: no picture the template showed before the agent, except those Tracy placed'
})
const words = (page, text) => ({
  group: 'demo-words',
  page,
  slot: null,
  width: null,
  measured: text,
  level: 'block',
  causingStep: 6,
  reason: 'no-demo-words: no text of the template and no vendor credit; no template dish, price or date'
})
const check = (failures) => ({
  groups: [
    { name: 'demo-pictures', status: 'red', failures: failures.filter((f) => f.group === 'demo-pictures') },
    { name: 'demo-words', status: 'red', failures: failures.filter((f) => f.group === 'demo-words') }
  ]
})
const pass = () => ({
  clock: { limits: { turnsAtOnce: 1 }, stopped: () => false },
  undoUnverified: false,
  altSlots: null,
  contentMap: null
})

/** Runs the scheduler; each page gets two turns with the verdict `verdictOf(page)` gives. */
async function schedule(failures, verdictOf = () => 'no-change') {
  const result = { turns: [], skipped: [], notSent: [], errors: [] }
  const ran = []
  const out = await schedulePages(pass(), {
    firstCheck: check(failures),
    result,
    run: async ({ page, faults }) => {
      ran.push([page, faults.map((f) => f.group)])
      for (const round of [1, 2]) result.turns.push({ page, round, verdict: verdictOf(page) })
    }
  })
  return { ...out, result, ran }
}

test('after two pages whose picture turns changed nothing, later pages get no turn for template pictures', async () => {
  const { ran, result, started } = await schedule([
    picture('/', 'others/bg-cta.jpg'),
    picture('/programmes', 'classes/intro-3.jpg'),
    picture('/programmes/junior', 'classes/detail-video-3.jpg'),
    picture('/programmes/adult', 'classes/detail-video-1.jpg')
  ])
  assert.deepEqual(
    ran.map(([page]) => page),
    ['/', '/programmes']
  )
  assert.equal(started, 2)
  const skipped = result.skipped.filter((s) => s.code === 'kind-unchanged')
  assert.deepEqual(
    skipped.map((s) => s.fault.page),
    ['/programmes/junior', '/programmes/adult']
  )
  assert.match(skipped[0].reason, /turns on 2 pages changed nothing for this kind of fault \(demo-picture\)/)
})

test('a page keeps its turns for a kind not yet tried, and a turn that changed something does not count', async () => {
  const mixed = await schedule([
    picture('/', 'others/bg-cta.jpg'),
    picture('/programmes', 'classes/intro-3.jpg'),
    picture('/about', 'features/item-2.jpg'),
    words('/about', 'join over 100k of inspiring creatives')
  ])
  // /about loses its picture fault but keeps the template words, which no page tried yet.
  assert.deepEqual(mixed.ran.at(-1), ['/about', ['demo-words']])
  assert.deepEqual(
    mixed.result.skipped.filter((s) => s.code === 'kind-unchanged').map((s) => [s.fault.page, s.fault.group]),
    [['/about', 'demo-pictures']]
  )
  // When the picture turns change something, every page still gets its turns.
  const changing = await schedule(
    [
      picture('/', 'others/bg-cta.jpg'),
      picture('/programmes', 'classes/intro-3.jpg'),
      picture('/programmes/junior', 'classes/detail-video-3.jpg')
    ],
    () => 'fixed'
  )
  assert.deepEqual(
    changing.ran.map(([page]) => page),
    ['/', '/programmes', '/programmes/junior']
  )
  assert.equal(changing.result.skipped.length, 0)
})

test('the skipped faults keep the shape the pass summary reads, so step 9 hands over its summary', async () => {
  const { result } = await schedule([
    picture('/', 'others/bg-cta.jpg'),
    picture('/programmes', 'classes/intro-3.jpg'),
    picture('/programmes/junior', 'classes/detail-video-3.jpg')
  ])
  const clock = repairClock({ now: () => 0, sleep: async () => {} })
  const summary = repairSummary({
    outcome: { status: 'incomplete', skipped: result.skipped },
    clock,
    site: 's'
  })
  const line = summary.skipped.find((s) => s.code === 'kind-unchanged')
  assert.equal(line.page, '/programmes/junior')
  assert.equal(line.group, 'demo-pictures')
})
