// Copy first, then pictures (#189, site build rule 2): a drawing is told its page's topic, the copy written next to its
// frame and its place, and a record page's drawing shows no recognisable face; the planned words reach the icons.
// Fictional businesses: a dog grooming salon and a bakery.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawKey, drawPrompt } from '../src/lib/picture-draw.js'
import { withWritten } from '../src/sites/brief-engines/real-pictures.js'

const scene = (subject) => ({ mode: 'scene', aspect: 4 / 3, subject })

test('a record frame is drawn from its record, the copy next to it and its place, with no recognisable face', () => {
  const prompt = drawPrompt(
    scene({
      kind: 'offering',
      id: 'svc-nails',
      label: 'Nail Trim',
      category: 'pet grooming',
      record: true,
      topic: 'Nail Trim',
      near: 'Calm the paw with a treat before the first clip',
      placement: { role: 'business.gallery_image', frame: 'card' }
    })
  )
  assert.match(prompt, /for the page of one of its offerings, Nail Trim/)
  assert.match(
    prompt,
    /The page says next to this picture: "Calm the paw with a treat before the first clip"\. Show exactly that part of Nail Trim\./
  )
  assert.match(prompt, /a card picture \(business\.gallery_image\)/)
  assert.match(prompt, /no recognisable face/)
})

test('a frame of any other page is drawn from its page topic and its copy; one drawn without planned copy is unchanged', () => {
  const venue = { kind: 'venue', category: 'bakery', about: 'Larkspur Bakehouse' }
  const told = drawPrompt(
    scene({
      ...venue,
      topic: 'Our sourdough',
      near: 'Shaped by hand before dawn.',
      placement: { role: 'editorial.illustration', frame: 'card' }
    })
  )
  assert.match(told, /The page this picture is on is about "Our sourdough"\./)
  assert.match(told, /Show exactly that part of the business\./)
  assert.doesNotMatch(told, /recognisable face/)
  const bare = drawPrompt(scene(venue))
  assert.doesNotMatch(bare, /The page/)
  // Two frames of one record with different copy are two drawings.
  const a = drawKey(scene({ ...venue, near: 'Rye', placement: { role: 'x', frame: 'card' } }), {
    model: 'm',
    shas: []
  })
  const b = drawKey(scene({ ...venue, near: 'Cake', placement: { role: 'x', frame: 'card' } }), {
    model: 'm',
    shas: []
  })
  assert.notEqual(a, b)
})

test('the planned words lie over the copy pins, and a planned line is no placeholder', () => {
  const copy = { pins: { a: 'Pinned name' }, sources: { a: 'brief', b: 'placeholder' } }
  const got = withWritten(copy, { b: 'Dog shampoo', c: '  ' })
  assert.deepEqual(got.pins, { a: 'Pinned name', b: 'Dog shampoo' })
  assert.deepEqual(got.sources, { a: 'brief' })
  assert.equal(withWritten(copy, null), copy)
})
