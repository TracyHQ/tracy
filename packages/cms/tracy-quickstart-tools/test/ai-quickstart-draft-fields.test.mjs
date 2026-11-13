// The field half of the AI quickstart draft (#583): one kit slot becomes one typed field of the block store, with a
// length limit only when the kit says it was measured at the narrowest width (390 px). Invented slots only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { NARROWEST_WIDTH, fieldTypeOf, limitOf, mapKeyOf } from '../ai-quickstart/lib/draft-fields.mjs'

test('the narrowest width is the phone width the kit and the coverage audit measure at', () => {
  assert.equal(NARROWEST_WIDTH, 390)
})

test('a kit frame reading at 390 px is a measured limit, and the limit is the smallest width reading', () => {
  const limit = limitOf({ maxCharacters: 32, maxCharactersFrom: 'kit frame (390px 32, 1440px 60)' })
  assert.deepEqual(limit, { limit: 32, limitFrom: 'kit frame (390px 32, 1440px 60)', measured: true })
})

test('a content map fit is no measurement: its box is a whole section, so its number is the demo length', () => {
  for (const from of [
    'content map fit (desktop 108, phone 15)',
    'content map fit (desktop 259, phone 259)',
    'content map fit of block-9.7 (desktop 27, phone 27)'
  ]) {
    const limit = limitOf({ maxCharacters: 15, maxCharactersFrom: from })
    assert.equal(limit.measured, false, from)
    assert.equal(limit.limit, null)
  }
})

test('a kit frame reading at 390 px still counts when the kit also names a content map fit', () => {
  const from = 'kit frame (390px 31, 1440px 40); content map fit (desktop 90, phone 90)'
  assert.equal(limitOf({ maxCharacters: 31, maxCharactersFrom: from }).measured, true)
})

test('a declared store cap is no measurement, so it gives no limit', () => {
  assert.deepEqual(limitOf({ maxCharacters: 40, maxCharactersFrom: 'content map declared' }), {
    limit: null,
    limitFrom: 'content map declared',
    measured: false
  })
})

test('a fit that is only the box of the demo words is no limit, even with a phone reading', () => {
  const from =
    'content map declared; the content map fit (desktop 8, phone 8) is the box of the demo words, not a limit'
  assert.equal(limitOf({ maxCharacters: 40, maxCharactersFrom: from }).measured, false)
})

test('a reading at the widest width only is not a reading at the narrowest width', () => {
  assert.equal(limitOf({ maxCharacters: 37, maxCharactersFrom: 'kit frame (1440px 37)' }).measured, false)
})

test('a measured limit recorded beside the declarations wins over the kit', () => {
  const measured = { limit: 21, limitFrom: 'measured at 390px on the running demo' }
  const limit = limitOf({ maxCharacters: 40, maxCharactersFrom: 'content map declared' }, measured)
  assert.deepEqual(limit, { limit: 21, limitFrom: 'measured at 390px on the running demo', measured: true })
})

test('field types follow the role first, the stored type second', () => {
  assert.equal(fieldTypeOf({ role: 'editorial.heading', type: 'text' }), 'text')
  assert.equal(fieldTypeOf({ role: 'editorial.navigation_url', type: 'url' }), 'link')
  assert.equal(
    fieldTypeOf({ role: 'package.cta_url', type: 'text' }),
    'link',
    'a link stored as text is a link'
  )
  assert.equal(fieldTypeOf({ role: 'business.video', type: 'text' }), 'link', 'a video address is a link')
  assert.equal(fieldTypeOf({ role: 'editorial.item_icon', type: 'text' }), 'icon', 'an icon class is an icon')
  assert.equal(
    fieldTypeOf({ role: 'editorial.item_icon', type: 'image' }),
    'icon',
    'an icon picture is an icon'
  )
  assert.equal(fieldTypeOf({ role: 'offering.image', type: 'image' }), 'image')
  assert.equal(fieldTypeOf({ role: 'editorial.design_element', type: 'text' }), 'design')
  assert.equal(fieldTypeOf({ role: 'step.index', type: 'text' }), 'number')
})

test('a kit id is joined back to its content map key', () => {
  assert.equal(mapKeyOf('block-12.3'), 'module-12.3')
  assert.equal(mapKeyOf('article-4.1'), 'article-4.1')
})
