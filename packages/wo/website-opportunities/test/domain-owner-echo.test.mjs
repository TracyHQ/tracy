// The echo guard of the owner's chat statement (decision D46, #609, `owner-echo.mjs`): a run of four of its words, or
// most of one of its sentences, is a copy; a name of up to three words is not. Near misses on both sides. Invented
// pottery studio texts only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-echo.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copiesOwner, ownerEchoOf, ownerLabelGrounded, tokensOf } from '../domain/owner-echo.mjs'

const STATEMENT =
  'Since 2009 our family has fired every single pot in the old bakery oven. We fire twice a week; classes run every ' +
  'evening for beginners.\n- hand thrown mugs made daily\n- Kiln space rental\nWe teach Pilates for potters on Sundays.'
const echo = ownerEchoOf([STATEMENT])
const copies = (text, pub) => Boolean(copiesOwner(text, echo, pub))

test('a run of four or more of the owner words is a copy, however it is cut or spelled', () => {
  for (const text of [
    'our family has fired every single pot',
    'family has fired every single pot in the old bakery',
    '"OUR family, has FIRED!"',
    'our  family has fired 🏺',
    'fire twice a week classes run every evening',
    'classes run every evening',
    'hand thrown mugs made daily',
    'Since 2009 our family has fired every single pot in the old bakery oven We fire twice a week classes run'.slice(
      0,
      80
    )
  ])
    assert.ok(copies(text), text)
})

test('a name of up to three words, or a rewrite sharing at most three words in a row, is not a copy', () => {
  for (const text of [
    'Pilates',
    'Kiln space rental',
    'hand thrown mugs',
    'Pilates for potters',
    'family pottery since 2009',
    'weekly firing and evening classes',
    'mugs thrown by hand every day',
    'evening classes for new potters'
  ])
    assert.equal(copies(text), false, text)
})

test('most of one sentence in order is a copy even with words changed between, a few shared words are not', () => {
  // 5 of the 7 words of "We teach Pilates for potters on Sundays", in order, never more than two in a row.
  assert.equal(copiesOwner('we teach gentle pilates for all potters every sunday', echo).rule, 'sentence')
  assert.equal(copies('pilates and wheel classes on sundays'), false)
})

test('what a public text the item stands on also says is that text, not the owner', () => {
  const bio = 'Hand thrown mugs made daily in Velmora'
  assert.ok(copies('hand thrown mugs made daily'))
  assert.equal(copies('hand thrown mugs made daily', [bio]), false)
  // A public text excuses only what it holds: a run it lacks is still the owner's.
  assert.ok(copies('our family has fired every single pot', [bio]))
})

test('scripts written without spaces compare by characters: 8 Han characters, 16 Thai characters', () => {
  const ja = ownerEchoOf(['私たちは2009年から家族で陶芸教室を営んでいます。'])
  assert.ok(copiesOwner('私たちは2009年から家族で陶芸教室を営んでいます', ja))
  assert.ok(copiesOwner('家族で陶芸教室を営む', ja))
  assert.equal(copiesOwner('陶芸教室', ja), false)
  assert.equal(copiesOwner('家族経営の陶芸教室', ja), false)
  const zh = ownerEchoOf(['我们自2009年以来一直是家庭经营的陶艺工作室。'])
  assert.ok(copiesOwner('一直是家庭经营的陶艺工作室', zh))
  assert.equal(copiesOwner('陶艺工作室', zh), false)
  const th = ownerEchoOf(['เราเปิดสอนปั้นดินเผาตั้งแต่ปี2009โดยครอบครัวของเรา'])
  assert.ok(copiesOwner('เราเปิดสอนปั้นดินเผาตั้งแต่ปี2009', th))
  assert.equal(copiesOwner('สอนปั้นดินเผา', th), false)
  assert.deepEqual(
    tokensOf('陶芸 class').map((x) => x.w),
    [0.5, 0.5, 1]
  )
})

test('accents, full width letters and zero width characters fold before comparing', () => {
  const fr = ownerEchoOf(['Nous cuisons la céramique deux fois par semaine.'])
  assert.ok(copiesOwner('cuisons la ceramique deux fois', fr))
  assert.ok(copiesOwner('ｃｕｉｓｏｎｓ la céramique deux', fr))
  assert.ok(copiesOwner('cui​sons la céramique deux', fr))
})

test('a label of an owner item rests on its quote: half its words, every number and capitalised word in it', () => {
  const quote = 'Every class is capped at six students'
  assert.equal(ownerLabelGrounded('six students per class at most', quote), true)
  assert.equal(ownerLabelGrounded('small classes of six', quote), true)
  assert.equal(ownerLabelGrounded('eight students per class', quote), false)
  assert.equal(ownerLabelGrounded('classes of 8 students', quote), false)
  assert.equal(ownerLabelGrounded('Small classes in Lisbon', quote), false)
  assert.equal(ownerLabelGrounded('relaxing pottery evenings with wine', quote), false)
  assert.equal(ownerLabelGrounded('Kiln space rental', 'We also rent kiln space to local makers.'), true)
})
