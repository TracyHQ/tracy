// The closing rule (ADR 0044, decision 31) holds for painted frames too: a kept frame the picture step meant to paint and the
// write step could not draw (no brand file, as when the brand step failed) never keeps the template's demo picture. It is
// emptied with its row, or its line says the demo remains. Measured on a local step chain run: two team portraits stayed demo
// pictures, skipped for "no brand file", and the closing ladder never saw them. Everything here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backdropItem, initialsItem, runPainted } from './_write-step-painted.mjs'

const hideable = (slot) =>
  slot.key === 'module-4.face' ? { canHide: true, current: 'images/demo/face.jpg' } : {}

test('an initials frame left undrawn for want of a brand file is emptied, not left with its demo picture', async () => {
  const { line, report, site } = await runPainted({
    noBrand: true,
    items: () => [initialsItem('block-4.face')],
    site: { contract: { overSlot: hideable } }
  })
  const face = line('block-4.face')
  assert.equal(face.status, 'hidden', JSON.stringify(face))
  assert.ok(report.closing.some((c) => c.slot === 'block-4.face' && c.rung === 'hidden'))
  const sentEmpty = site.of('content.contract', 'apply').at(-1)?.params.empty_slots ?? []
  assert.ok(sentEmpty.includes('module-4.face'), `emptied: ${JSON.stringify(sentEmpty)}`)
})

test('an undrawn frame the site cannot empty fails and says the demo picture remains', async () => {
  const { line } = await runPainted({
    noBrand: true,
    items: () => [initialsItem('block-4.face')],
    site: { contract: { overSlot: () => ({ canHide: false }) } }
  })
  const face = line('block-4.face')
  assert.equal(face.status, 'failed', JSON.stringify(face))
  assert.match(face.reason, /demo content remains/)
})

test('a cut-out whose backdrop cannot be drawn keeps its bare figure: the frame has a picture, nothing is emptied', async () => {
  const { line, report } = await runPainted({
    noBrand: true,
    items: (f) => [backdropItem('block-5.figure', f)]
  })
  assert.equal(line('block-5.figure').status, 'written')
  assert.ok(!(report.closing ?? []).some((c) => c.slot === 'block-5.figure' && c.rung !== 'used'))
})
