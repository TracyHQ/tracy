// Unowned picture slots that still hold a template picture (ADR 0044): they block even when the read did not see them in the theme
// the page opens on, warn only when the kit says their block prints at no width, and a twin of a frame the write step hid is the
// write step's. Pages, kit and pictures are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { whereShown } from '../src/site-check/page-measures.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { fakeHost, pageRead, pagedSite, writtenReport } from './_site-check-pages.mjs'

const picture = (key, current) => ({
  key,
  entity: key.slice(0, key.lastIndexOf('.')),
  type: 'image',
  current
})
const KIT = {
  tool: 'template-kit 3.1.0',
  blocks: [
    {
      id: 'block-8',
      visibleAt: ['1440', '390'],
      frames: [{ id: 'block-8.3' }, { id: 'block-8.4', twinOf: 'block-8.3' }]
    },
    { id: 'block-9', visibleAt: [], notShownAt: ['1440', '390'], frames: [{ id: 'block-9.1' }] },
    { id: 'block-10', visibleAt: ['1440', '390'], frames: [{ id: 'block-10.1' }] }
  ]
}

async function check({ unowned, hidden = [], kit = KIT, shown = [] }) {
  const site = pagedSite(1, {}, [
    picture('module-8.3', ''),
    picture('module-8.4', 'images/demo/badge-light.png'),
    picture('module-9.1', 'images/demo/badge-print.png'),
    picture('module-10.1', 'images/tracy-content/own-badge.png')
  ])
  site.door.apply = ((apply) => async (call) => {
    const answer = await apply(call)
    if (call.action === 'content.contract')
      answer.pages[0].assignedModules.push(
        { entity: 'module-8' },
        { entity: 'module-9' },
        { entity: 'module-10' }
      )
    return answer
  })(site.door.apply)
  const base = writtenReport({ unowned })
  const report = {
    ...base,
    slots: [
      ...base.slots,
      ...hidden.map((slot) => ({
        slot,
        key: slot.replace(/^block-/, 'module-'),
        owner: 'plan',
        status: 'hidden',
        reason: 'hid'
      }))
    ]
  }
  const measured = { shownText: 'Some words', shownLinks: [], shownPictures: shown }
  const result = await runSiteCheck({
    door: site.door,
    report,
    kit,
    host: fakeHost(
      { '/': pageRead('/') },
      {
        measures: () => [
          { path: '/', width: 1440, ...measured },
          { path: '/', width: 390, ...measured }
        ]
      }
    ).host,
    baseline: null
  })
  return result.groups.find((g) => g.name === 'unowned-slots')
}

test('a template picture on a kept block blocks though the read did not see it; the kit saying it never prints makes it a warning', async () => {
  const g = await check({
    unowned: [
      { slot: 'block-8.4', type: 'image', block: 'block-8' },
      { slot: 'block-9.1', type: 'image', block: 'block-9' },
      { slot: 'block-10.1', type: 'image', block: 'block-10' }
    ]
  })
  assert.deepEqual(
    g.failures.map((f) => [f.slot, f.level, f.causingStep]),
    [
      ['block-8.4', 'block', 3],
      ['block-9.1', 'warn', 3],
      ['block-10.1', 'warn', 3]
    ]
  )
  assert.equal(g.status, 'red')
})

test('the twin of a frame the write step hid is blamed on the write step (9)', async () => {
  const g = await check({
    unowned: [{ slot: 'block-8.4', type: 'image', block: 'block-8' }],
    hidden: ['block-8.3']
  })
  assert.deepEqual(
    g.failures.map((f) => [f.slot, f.level, f.causingStep]),
    [['block-8.4', 'block', 9]]
  )
})

test('a picture shown only on the other side of the light and dark switch is shown', () => {
  const measures = [
    {
      path: '/',
      width: 1440,
      shownPictures: [],
      look: {
        sides: {
          dark: { shownPictures: [] },
          light: { shownPictures: ['http://site.test/images/demo/badge-light.png'] }
        }
      }
    }
  ]
  assert.equal(whereShown(measures, { type: 'image', value: 'images/demo/badge-light.png' }).page, '/')
  assert.equal(whereShown(measures, { type: 'image', value: 'images/demo/badge-dark.png' }), null)
})
