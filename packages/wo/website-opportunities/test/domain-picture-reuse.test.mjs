// When a picture is shown again (ticket #595, review 13/11): a drawing or an own photo of an item is reused only in a
// frame of the same shape class (portrait, landscape or square, by the frame's declared size), never on the same page,
// and an unused own photo of the item comes before a reused one. A frame without a size reuses nothing. Invented club
// and pictures; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-reuse.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import { reuseProblemsOf } from '../domain/picture-reuse.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { pictureBlocks, pictureProfile, SERVICES } from './fixtures/picture-policy/invented-pictures.mjs'

const [JUNIOR, , HIRE] = SERVICES
const sized = (id, width, height) => ({
  id,
  type: 'services',
  items: { min: 1, max: 4 },
  fields: [],
  itemFields: [
    { name: 'name', kind: 'offering.name', type: 'text', limit: 40 },
    { name: 'photo', kind: 'offering.image', type: 'image', frame: { width, height } }
  ]
})
function blocks() {
  const all = pictureBlocks()
  for (const b of [sized('wide', 1600, 600), sized('wide-2', 1200, 500), sized('tall', 600, 900)])
    all.set(b.id, b)
  return all
}
const block = (id, kind, data) => ({
  id,
  type: 'services',
  block: kind,
  source: 'template',
  label: 'x',
  data,
  reason: 'x'
})
const page = (id, ...placed) => ({ id, name: id, pageType: 'services', blocks: placed })

/** The club's profile; `second` gives the court hire a second own photo. */
function run(pages, { second = false } = {}) {
  const profile = pictureProfile()
  if (second)
    profile.items.service.find((s) => s.id === HIRE).fields['offering.detail_image'] = {
      value: 'https://brindlewick-tennis.example/img/hire-2.jpg',
      sources: ['site']
    }
  const data = planDataOf(profile)
  const pictures = ownPicturesOf(data).map((p) => ({
    ...p,
    label: p.label ?? `Invented label of ${p.id}`,
    content: 'venue-exterior',
    orientation: 'landscape',
    width: 2400,
    height: 1200
  }))
  return assignPictures({ pages, blocks: blocks(), data, pictures })
}
const at = (result, id) => result.frames.find((f) => f.id === id)

test('a drawing is reused only in a frame of the same shape class, on another page', () => {
  const result = run([
    page('home', block('h1', 'wide', [JUNIOR])),
    page('svc', block('s1', 'wide-2', [JUNIOR])),
    page('about', block('a1', 'tall', [JUNIOR]))
  ])
  const first = at(result, `home.h1.${JUNIOR}.photo`)
  assert.equal(first.source, 'generated')
  assert.equal(at(result, `svc.s1.${JUNIOR}.photo`).reuses, first.id, 'landscape again, another page: reused')
  const tall = at(result, `about.a1.${JUNIOR}.photo`)
  assert.deepEqual([tall.source, tall.reuses], ['generated', undefined], 'portrait: its own drawing')
  assert.deepEqual(reuseProblemsOf(result.frames), [])
})

test('a frame without a declared size reuses nothing: it gets its own drawing', () => {
  const result = run([
    page('home', block('h1', 'service-cards', [JUNIOR])),
    page('svc', block('s1', 'service-cards', [JUNIOR]))
  ])
  for (const id of [`home.h1.${JUNIOR}.photo`, `svc.s1.${JUNIOR}.photo`])
    assert.deepEqual([at(result, id).source, at(result, id).reuses], ['generated', undefined], id)
})

test('the same picture is never shown twice on one page: another own photo, else its own drawing', () => {
  const drawn = run([page('home', block('h1', 'wide', [JUNIOR]), block('h2', 'wide-2', [JUNIOR]))])
  assert.equal(at(drawn, `home.h2.${JUNIOR}.photo`).reuses, undefined)
  assert.equal(drawn.counts.generated, 2)
  const one = run([page('home', block('h1', 'wide', [HIRE]), block('h2', 'wide-2', [HIRE]))])
  assert.equal(at(one, `home.h1.${HIRE}.photo`).source, 'own')
  assert.equal(at(one, `home.h2.${HIRE}.photo`).source, 'generated', 'its only photo is shown above')
  const two = run([page('home', block('h1', 'wide', [HIRE]), block('h2', 'wide-2', [HIRE]))], {
    second: true
  })
  const pictures = [at(two, `home.h1.${HIRE}.photo`).picture, at(two, `home.h2.${HIRE}.photo`).picture]
  assert.deepEqual(pictures.sort(), [`${HIRE}:offering.detail_image`, `${HIRE}:offering.image`])
  assert.deepEqual(reuseProblemsOf(two.frames), [])
})

test('an unused own photo of the item comes before a reused one; a different shape never reuses an own photo', () => {
  const result = run(
    [
      page('home', block('h1', 'wide', [HIRE])),
      page('svc', block('s1', 'wide-2', [HIRE])),
      page('more', block('m1', 'wide', [HIRE]))
    ],
    { second: true }
  )
  const [a, b, c] = ['home.h1', 'svc.s1', 'more.m1'].map((p) => at(result, `${p}.${HIRE}.photo`).picture)
  assert.notEqual(a, b, 'the second photo is used before the first is shown again')
  assert.ok([a, b].includes(c), 'with every photo used, one is reused in the same shape on another page')
  const square = run([page('home', block('h1', 'wide', [HIRE])), page('svc', block('s1', 'tall', [HIRE]))])
  assert.notEqual(at(square, `svc.s1.${HIRE}.photo`).picture, `${HIRE}:offering.image`)
})

test('the rule check names a reuse across shapes or on one page', () => {
  const frames = [
    {
      id: 'a',
      page: 'home',
      source: 'own',
      picture: 'p1',
      shape: 'landscape',
      size: { width: 2, height: 1 }
    },
    {
      id: 'b',
      page: 'home',
      source: 'own',
      picture: 'p1',
      shape: 'landscape',
      size: { width: 2, height: 1 }
    },
    { id: 'd', page: 'home', source: 'generated', shape: 'landscape', size: { width: 2, height: 1 } },
    {
      id: 'c',
      page: 'svc',
      source: 'generated',
      reuses: 'd',
      shape: 'portrait',
      size: { width: 1, height: 2 }
    }
  ]
  assert.deepEqual(
    reuseProblemsOf(frames).map((p) => [p.code, p.at]),
    [
      ['reuse_same_page', 'b'],
      ['reuse_shape_unfit', 'c']
    ]
  )
})
