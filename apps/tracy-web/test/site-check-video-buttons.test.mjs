// empty-video-buttons (ADR 0044, decision 29): a shown control opening a video player with no video blocks. Every page, selector
// and address is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIDEO_BUTTONS_SLOT } from '../src/lib/empty-video-buttons.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { emptyVideoButtonsGroup, judgeEmptyVideoButtons } from '../src/site-check/video-buttons.js'

const EMPTY = { selector: 'a.play-chip', attribute: 'data-src', address: 'https://www.youtube.com/embed/' }
const FULL = {
  selector: 'a.play-chip',
  attribute: 'data-src',
  address: 'https://www.youtube.com/embed/abc123'
}
const page = (videoButtons, path = '/sessions', width = 1440) => ({ path, width, videoButtons })

const context = (measures, { kit = null, slots = [] } = {}) => ({
  report: { slots, site: 'x' },
  baseline: null,
  kit,
  read: async () => ({ ok: true, pages: [{ route: '/sessions', entity: 'menuItem-1' }] }),
  host: async () => ({ checks: [], pageMeasures: measures, visited: [] })
})

test('every shown play button with an empty video address is counted, and must be 0', () => {
  const { checked, failures } = judgeEmptyVideoButtons(
    [page([EMPTY, FULL, { ...EMPTY, selector: 'a.play-chip-2' }]), page([EMPTY], '/sessions', 390)],
    { kitNamesRule: false }
  )
  assert.equal(checked, 4)
  assert.equal(failures.length, 3)
  assert.deepEqual(
    [failures[0].page, failures[0].measured, failures[0].causingStep],
    ['/sessions', 'https://www.youtube.com/embed/', 0]
  )
  assert.deepEqual(judgeEmptyVideoButtons([page([FULL])], { kitNamesRule: false }).failures, [])
})

test('the fault is the write step’s when the kit names a hide rule, and the template’s when it names none', async () => {
  const kit = { site: { emptyVideoButtons: [{ selector: '.play-chip[data-src$="/embed/"]' }] } }
  const withRule = await emptyVideoButtonsGroup.run(context([page([EMPTY])], { kit }))
  assert.equal(withRule.failures[0].causingStep, 9)
  const fromReport = await emptyVideoButtonsGroup.run(
    context([page([EMPTY])], { slots: [{ slot: VIDEO_BUTTONS_SLOT, status: 'written' }] })
  )
  assert.equal(fromReport.failures[0].causingStep, 9)
  const without = await emptyVideoButtonsGroup.run(context([page([EMPTY])]))
  assert.equal(without.failures[0].causingStep, 0)
  // The rule hid every button: none is shown, so the host lists none, and the group is green.
  const hidden = await emptyVideoButtonsGroup.run(context([page([])], { kit }))
  assert.deepEqual(hidden.failures, [])
})

test('a host that does not measure video controls leaves the group unmeasured, and the group runs with the page groups', async () => {
  await assert.rejects(
    emptyVideoButtonsGroup.run(context([{ path: '/sessions', width: 1440 }])),
    /videoButtons/
  )
  assert.ok(PAGE_CHECK_GROUPS.includes(emptyVideoButtonsGroup))
})
