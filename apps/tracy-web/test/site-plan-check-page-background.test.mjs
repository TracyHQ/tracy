// Site plan checker (ADR 0041) and the template page background: the JA Boxing kit names the picture the template
// paints behind the top of its inner pages as one setting slot, and every frame painted behind with it points there.
// A plan fills it with a picture wish on its root frame, or hides it; its twins follow. Inputs: the committed kit and
// the invented brief of _site-plan-check.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decisionOf, failing, keepHidingAll, kit, plan } from './_site-plan-check.mjs'

const ROOT = 'block-162.picture-1'

test('the kit ties every frame painted behind with the template background to one writable setting slot', () => {
  const k = kit()
  const slot = k.site.settingSlots.find((s) => s.id === 'site.body-background')
  assert.equal(slot.kind, 'template-background')
  assert.deepEqual(slot.writeTo, {
    action: 'template.siteSettings',
    template: 'ja_boxing',
    key: 'body_bg_img',
    file: 'templates/ja_boxing/etc/site/default.json'
  })
  const frames = k.blocks.flatMap((b) => b.frames ?? []).filter((f) => f.paintedBehind)
  assert.equal(frames.length, 17)
  assert.deepEqual(
    slot.frames,
    frames.map((f) => f.id)
  )
  for (const f of frames) assert.deepEqual([f.writable, f.slotId], [true, slot.id], f.id)
  assert.deepEqual(
    frames.filter((f) => !f.twinOf).map((f) => f.id),
    [ROOT]
  )
})

/** The passing plan with the shared block that shows the background kept, and its frame given `pictures` or hidden. */
function withBackground(fill) {
  const p = plan()
  const d = keepHidingAll(kit(), 'block-162')
  if (fill) {
    d.hiddenSlots = d.hiddenSlots.filter((h) => h.slot !== ROOT)
    d.pictures.push({ frame: ROOT, kind: 'photo', match: 'any-real', size: 'wide' })
  }
  p.sharedBlocks[p.sharedBlocks.findIndex((x) => x.block === 'block-162')] = d
  assert.equal(decisionOf(p, 'block-162'), d)
  // The kept pages that show the block tell it first in their story (rule R10a).
  for (const id of ['page-about-us_contact', 'page-classes'])
    p.pages.find((pg) => pg.id === id).story.unshift({ block: 'block-162', step: 'the page heading' })
  return p
}

test('a plan that gives the background frame a picture wish passes every rule', () => {
  assert.deepEqual(failing(withBackground(true)), [])
})

test('a plan that hides the background frame passes every rule', () => {
  assert.deepEqual(failing(withBackground(false)), [])
})
