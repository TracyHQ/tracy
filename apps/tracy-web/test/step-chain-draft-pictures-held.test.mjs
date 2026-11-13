// The pictures and alt texts of a step chain run built from a build draft (#597 review): a photo that shows or is named
// after a held person never lands on the site as the owner's own; only stored bytes are pictures; an alt is capped
// and passes the copy guard; a site not in English never gets an English label as alt. The invented florist, fakes
// only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-pictures-held.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ICON_KEYWORDS_PROMPT } from 'website-opportunities/domain/icon-keywords.mjs'
import { ALT_LIMIT, cutAlt } from '../src/step-chain-draft-alt.js'
import { setUp } from './step-chain-draft-harness.mjs'
import { HELD_PERSON, SITE_NAME, fakeBuildModel, floristKit, heldIn } from './step-chain-draft-fixtures.mjs'

const fourth = (d) => d.engine.needsProfile.items.gallery[3]
const run = async (setup) => {
  try {
    return { ok: true, run: await setup.engine.prepare(setup.ctx) }
  } catch (error) {
    return { ok: false, error }
  }
}
const ownOf = (r, item) =>
  r.run.inputs.order.order.pictures.find((p) => p.item === item && p.source === 'own') ?? null

for (const where of ['label', 'alt', 'caption']) {
  test(`a photo whose ${where} says it shows a held person is never placed, nor sent to any model`, async () => {
    let item = null
    const s = await setUp({
      mutate: (d) => {
        item = fourth(d).id
        fourth(d)[where] = `${HELD_PERSON} tying a posy at the counter`
      }
    })
    const r = await run(s)
    assert.ok(r.ok, r.error?.message)
    assert.equal(ownOf(r, item), null)
    assert.ok(!r.run.inputs.pictures.frames.some((f) => f.item === item && f.source === 'own'))
    assert.deepEqual(heldIn(s.model.requests), [])
    assert.deepEqual(heldIn(r.run.inputs.order.order), [])
  })
}

test('a photo whose file and id are named after a held person: the slug reaches no model request, no frame, no ref', async () => {
  const slug = 'pellam-orrick'
  const s = await setUp({
    mutate: (d) => {
      const g = fourth(d)
      const old = g.id
      const url = `https://larkspur-florist.example/img/${slug}-portrait.jpg`
      g.fields['business.gallery_image'] = { ...g.fields['business.gallery_image'], value: url }
      g.id = `gallery-https-larkspur-florist-example-img-${slug}-portrait-jpg`
      for (const m of d.engine.research.manifest) if (m.id === 'draft-picture-4') m.sourceUrl = url
      for (const p of d.approved.plan.pages)
        for (const b of p.blocks) b.data = b.data.map((x) => (x === old ? g.id : x))
    }
  })
  const r = await run(s)
  assert.ok(r.ok, r.error?.message)
  const has = (v) => JSON.stringify(v).toLowerCase().includes(slug)
  assert.equal(has(s.model.requests), false)
  assert.equal(has(r.run.inputs.order.order), false)
  assert.equal(has(r.run.inputs.pictures.frames), false)
  // It is withheld whole: never opened from the store either.
  assert.ok(!s.opened.some((o) => o.id === 'draft-picture-4'))
})

test('the vision label naming a held person refuses the picture: its frame has no own photo', async () => {
  const s = await setUp({
    model: fakeBuildModel({
      label: (id) => (id.includes('buckets') ? `${HELD_PERSON} with buckets` : undefined)
    })
  })
  const r = await run(s)
  assert.ok(r.ok, r.error?.message)
  assert.equal(r.run.inputs.pictures.draft.refused, 1)
  assert.ok(!r.run.inputs.order.order.pictures.some((p) => p.source === 'own' && p.frame.includes('buckets')))
  assert.deepEqual(heldIn(r.run.inputs.order.order), [])
})

test('research gone: the build stops typed before any model call or picture read', async () => {
  const s = await setUp({ mutate: (d) => (d.engine.research = null) })
  const r = await run(s)
  assert.equal(r.ok, false)
  assert.equal(r.error.stop?.code, 'draft_research_missing')
  assert.equal(s.opened.length, 0)
  assert.equal(s.model.requests.length, 0)
})

test('only stored bytes are pictures: no web address is sent to the vision call; any Uint8Array is bytes', async () => {
  const s = await setUp({
    mutate: (d) => (d.engine.research.manifest = d.engine.research.manifest.slice(0, 1)),
    pictureBytes: () => new Uint8Array([1, 2, 3])
  })
  const r = await run(s)
  assert.ok(r.ok, r.error?.message)
  const images = s.model.requests.flatMap((q) => q.images ?? [])
  assert.ok(images.length > 0 && images.every((i) => i.startsWith('data:image/png;base64,')))
  const { draft } = r.run.inputs.pictures
  assert.deepEqual(draft.used, ['draft-picture-1'])
  assert.equal(draft.unstored, 3)
  const own = r.run.inputs.pictures.frames.filter((f) => f.source === 'own')
  assert.ok(own.every((f) => f.ref === 'https://larkspur-florist.example/img/counter.jpg'))
})

test('an alt is cut to its limit at a word boundary and passes the copy guard, else the next choice', async () => {
  assert.equal(cutAlt('Wild meadow flowers tied by hand', 20), 'Wild meadow flowers')
  assert.ok([...cutAlt('word '.repeat(60))].length <= ALT_LIMIT)
  const long = 'Award winning best florist in Ambermoor voted number one '.repeat(8)
  const template = floristKit().template.name
  const s = await setUp({
    model: fakeBuildModel({
      label: (id) =>
        id.includes('counter') ? long : id.includes('buckets') ? `${template} demo photo` : undefined
    })
  })
  const r = await run(s)
  assert.ok(r.ok, r.error?.message)
  const own = r.run.inputs.order.order.pictures.filter((p) => p.source === 'own')
  assert.equal(own.length, 3)
  for (const p of own) {
    assert.ok([...p.alt].length <= ALT_LIMIT, p.alt)
    assert.ok(!/award|number one|best|voted/i.test(p.alt), p.alt)
    assert.ok(!p.alt.includes(template), p.alt)
  }
  assert.equal(own.find((p) => p.frame.includes('counter')).alt, SITE_NAME)
  // A label that passes is kept (the workbench photo keeps the label research gave it).
  assert.notEqual(own.find((p) => p.frame.includes('workbench')).alt, SITE_NAME)
})

test('on a site not in English no English label is an alt, and the record counts the fallbacks', async () => {
  // The fake icon ranking answers German item texts with keywords of its own.
  const base = fakeBuildModel()
  const model = Object.assign(
    async (req) =>
      req.system === ICON_KEYWORDS_PROMPT
        ? JSON.stringify({
            keywords: Object.fromEntries(JSON.parse(req.user).items.map((i) => [i.id, ['flower', 'bouquet']]))
          })
        : base(req),
    { requests: base.requests }
  )
  const s = await setUp({ model, mutate: (d) => (d.approved.plan.language = 'de') })
  const r = await run(s)
  assert.ok(r.ok, r.error?.message)
  const placed = r.run.inputs.order.order.pictures.filter((p) => ['own', 'generated'].includes(p.source))
  assert.equal(placed.length, 8)
  for (const p of placed) assert.ok(!/Invented label|Shop photo/.test(p.alt), p.alt)
  // No item text of the invented florist reads as German: every alt is the site name, and the record says so.
  assert.ok(placed.every((p) => p.alt === SITE_NAME))
  assert.deepEqual(r.run.inputs.order.recorded.alts, { label: 0, item: 0, site: 8, none: 0, fallbacks: 8 })
  const en = await run(await setUp({}))
  const alts = en.run.inputs.order.recorded.alts
  assert.equal(alts.none, 0)
  assert.equal(alts.fallbacks, alts.item + alts.site)
})
