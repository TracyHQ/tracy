/**
 * The overlap safety net of a Joomla brief build (spec TracyHQ/tracy#189): the host's browser says which build pictures
 * cover words; those are added to the head block's hidden pictures and named in the notes. It never fails the build: no
 * host, a failed check or a failed rewrite leave the build as it is, with a note. Fictional bakery pages.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { overlapPagesOf, overlapSafetyNet } from '../src/sites/brief-engines/picture-overlap-net.js'

const PLAN = {
  pages: [
    { path: '/', decision: 'keep' },
    { path: 'about-us', decision: 'keep' },
    { path: '/old-blog', decision: 'drop' },
    { path: '/menu', decision: 'keep' }
  ]
}
const FIGURE = '/images/tracy-content/1f2e3d.png?v=2'

function harness(findings) {
  const asked = []
  const rewrites = []
  const notes = []
  const times = []
  return {
    asked,
    rewrites,
    notes,
    times,
    input: {
      check: async (siteKey, pages) => {
        asked.push({ siteKey, pages })
        return findings instanceof Error ? Promise.reject(findings) : findings
      },
      siteKey: 'bakery-site',
      plan: PLAN,
      pictures: ['images/tracy-content/clear-1.png'],
      rewrite: async (pictures) => rewrites.push(pictures),
      note: (n) => notes.push(n),
      time: (phase, n) => times.push([phase, n])
    }
  }
}

test('#189 the net reads home and the kept pages, at most five', () => {
  assert.deepEqual(overlapPagesOf(PLAN), ['/', '/about-us', '/menu'])
  const many = { pages: Array.from({ length: 9 }, (_, i) => ({ path: `/p${i}`, decision: 'keep' })) }
  assert.equal(overlapPagesOf(many).length, 5)
  assert.deepEqual(overlapPagesOf(null), ['/'])
})

test('#189 a build picture over the headline is added to the hidden pictures and named in the notes', async () => {
  const h = harness({
    findings: [
      {
        src: FIGURE,
        widths: [1440, 1024, 768],
        covers: [
          { kind: 'heading', text: 'Fresh bread every morning' },
          { kind: 'button', text: 'Order now' }
        ]
      },
      // A template picture is the template's design: never taken off by the net.
      { src: 'images/joomlart/hero/shape.png', widths: [390], covers: [{ kind: 'text', text: 'Hi' }] },
      // Already hidden by the ladder: nothing to do.
      { src: 'images/tracy-content/clear-1.png', widths: [1440], covers: [{ kind: 'heading', text: 'Hi' }] }
    ]
  })
  const out = await overlapSafetyNet(h.input)
  assert.deepEqual(h.asked, [{ siteKey: 'bakery-site', pages: ['/', '/about-us', '/menu'] }])
  assert.deepEqual(h.rewrites, [['images/tracy-content/clear-1.png', 'images/tracy-content/1f2e3d.png']])
  assert.equal(out.takenOff.length, 1)
  assert.match(
    h.notes[0],
    /heading "Fresh bread every morning", button "Order now" at 1440, 1024, 768px wide/
  )
  assert.deepEqual(h.times, [['picturesOverlapTakenOff', 1]])
})

test('#189 no overlap: the head block is not written again', async () => {
  const h = harness({ findings: [] })
  const out = await overlapSafetyNet(h.input)
  assert.equal(out.checked, true)
  assert.deepEqual(h.rewrites, [])
  assert.deepEqual(h.notes, [])
})

test('#189 never a gate: no host, a failed check or a failed rewrite leave the build as it is', async () => {
  const none = harness({ findings: [] })
  assert.deepEqual(await overlapSafetyNet({ ...none.input, check: null }), { checked: false, takenOff: [] })
  const failed = harness(new Error('host timed out'))
  assert.deepEqual(await overlapSafetyNet(failed.input), { checked: false, takenOff: [] })
  assert.match(failed.notes[0], /could not be checked/)
  const refused = harness({
    findings: [{ src: FIGURE, widths: [390], covers: [{ kind: 'logo', text: '' }] }]
  })
  const out = await overlapSafetyNet({
    ...refused.input,
    rewrite: async () => {
      throw new Error('the style could not be saved')
    }
  })
  assert.deepEqual(out.takenOff, [])
  assert.match(refused.notes[0], /could not be taken off/)
})
