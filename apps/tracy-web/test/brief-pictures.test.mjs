/**
 * The pictures of "Apply": which demo pictures are replaced, drawn all at once, cut to the demo's own shape, and
 * uploaded — and that no picture, however it fails, costs anything but its own slot.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  cutToShape,
  drawPictures,
  FOLDER,
  headerReader,
  MAX_PICTURES,
  pictureBriefs,
  pictureGroups,
  placePictures,
  shapePictures,
  sizeOf,
  uploadPictures
} from '../src/sites/brief-engines/pictures.js'

const picture = (width, height, format = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: '#cc8844' } })
    [format]()
    .toBuffer()

/** What OpenRouter answers a picture request with: the image as a data URI on the message. */
const imageAnswer = (bytes, mime = 'image/jpeg') =>
  new Response(
    JSON.stringify({
      model: 'picture-model',
      usage: {},
      choices: [
        {
          message: {
            content: '',
            images: [{ image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }]
          }
        }
      ]
    }),
    { status: 200 }
  )

const door = { url: 'https://pictures.test/v1/chat/completions', key: 'k', imageModel: 'picture-model' }

test('the pictures are of the customer’s own business: a wide hero first, then close-ups, never words or marks', () => {
  const briefs = pictureBriefs({
    name: 'Golden Crust Bakery',
    about: 'A family bakery in Hanoi',
    sector: 'family bakery',
    pictures: ['a bakery storefront', 'a sliced sourdough loaf', 'croissants in a basket']
  })
  assert.equal(briefs.length, MAX_PICTURES)
  assert.deepEqual(
    briefs.map((b) => b.role),
    ['hero', 'section', 'section', 'section', 'section', 'section']
  )
  assert.equal(
    new Set(briefs.map((b) => b.prompt)).size,
    briefs.length,
    'six different pictures, not one asked six times'
  )
  assert.match(briefs[0].prompt, /16:9 hero photograph/)
  assert.match(briefs[0].prompt, /Golden Crust Bakery — A family bakery in Hanoi — family bakery/)
  assert.match(briefs[0].prompt, /Subject: a bakery storefront/)
  assert.match(briefs[2].prompt, /Subject: croissants in a basket/)
  for (const { prompt } of briefs) {
    assert.match(prompt, /No text, no letters, no lettering, no logos/)
    assert.doesNotMatch(prompt, /no faces|no recognisable people|nobody recognisable/)
  }
  // Without the model's descriptions the prompt still stands on the business's own words.
  assert.doesNotMatch(pictureBriefs({ name: 'N', about: 'A' })[0].prompt, /Subject:/)
})

test('the hero comes first, then the first sections of the home page; never a logo, a map, a face or an unknown', () => {
  const img = (key, sample, label, extra = {}) => ({
    key,
    type: 'image',
    sample,
    label,
    entity: 'page-home',
    ...extra
  })
  const slots = [
    img('a', 'images/clients/logo-1.png', 'Home - Clients / logo'),
    img('b', 'images/team.png', 'Home - Why us / image'),
    img('c', 'images/hero.png', 'Home - Hero / image'),
    img('d', 'images/hero.png', 'Home - Hero / image (again)'),
    img('e', 'images/map.png', 'Home - Find us / map'),
    img('f', 'images/people.png', 'Home - Testimonials / quote-avatar'),
    img('g', '', 'Home - Gallery / image'),
    img('h', 'images/proof.png', 'Home - Proof / image', { requiresEvidence: true }),
    img('i', 'images/work-1.png', 'Home - Work / image'),
    img('j', 'images/work-2.png', 'Home - More work / image'),
    img('k', 'images/work-3.png', 'Home - Even more / image'),
    { key: 'text', type: 'text', sample: 'x', label: 'Home - Hero / title' }
  ]
  const groups = pictureGroups(slots)
  assert.deepEqual(
    groups.map((g) => g.sample),
    ['images/hero.png', 'images/team.png', 'images/work-1.png', 'images/work-2.png', 'images/work-3.png'],
    'the hero, then the home page’s other pictures in the order it shows them'
  )
  assert.deepEqual(
    groups[0].slots.map((s) => s.key),
    ['c', 'd'],
    'one file shown twice is one picture with two slots'
  )
  assert.equal(groups[0].role, 'hero')
  // An edition the words are not written in is left alone.
  assert.equal(pictureGroups(slots, (s) => s.key !== 'c' && s.key !== 'd')[0].role, 'section')
})

test('a demo file is replaced everywhere it appears; the home page’s pictures come first and at most MAX_PICTURES go', () => {
  const img = (key, sample, entity, label = 'image') => ({ key, type: 'image', sample, label, entity })
  const slots = [
    img('about.1', 'p/factory.png', 'page-about', 'About / image'),
    img('about.team', 'p/team.png', 'page-about', 'About / team'),
    img('home.hero', 'p/hero.png', 'page-home', 'Home - Hero / image'),
    img('home.1', 'p/factory.png', 'page-home', 'Home - Work / image'),
    img('home.2', 'p/team.png', 'page-home', 'Home - Team / image'),
    img('only.about', 'p/office.png', 'page-about', 'About / office'),
    ...Array.from({ length: 6 }, (_, i) =>
      img(`far.${i}`, `p/far-${i}.png`, 'page-contact', 'Contact / image')
    )
  ]
  const groups = pictureGroups(
    slots,
    () => true,
    (s) => s.entity === 'page-home'
  )
  assert.equal(groups.length, MAX_PICTURES)
  assert.deepEqual(
    groups.slice(0, 3).map((g) => g.sample),
    ['p/hero.png', 'p/factory.png', 'p/team.png'],
    'the hero, then what the home page shows (in the order the slots come), before any other page’s'
  )
  assert.deepEqual(
    groups[1].slots.map((s) => s.key),
    ['about.1', 'home.1'],
    'the About page’s copy of the factory is replaced with the home page’s'
  )
  assert.equal(groups[3].sample, 'p/office.png', 'then the other pages, in the order they come')
})

test('every picture is drawn at once; one that fails is counted and costs nothing else', async () => {
  const bytes = await picture(1376, 768)
  let inFlight = 0
  let peak = 0
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    const mine = calls
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 15))
    inFlight -= 1
    return mine === 2
      ? new Response(JSON.stringify({ error: { message: 'content policy' } }), { status: 400 })
      : imageAnswer(bytes)
  }
  const briefs = pictureBriefs({ name: 'N', about: 'A' })
  const { drawn, failed, why } = await drawPictures({ door, briefs, fetchImpl })
  assert.equal(peak, MAX_PICTURES, 'every call was in flight together')
  assert.equal(drawn.length, MAX_PICTURES - 1)
  assert.equal(failed, 1)
  assert.match(why[0], /content policy/)
  assert.deepEqual(
    { w: drawn[0].width, h: drawn[0].height, ext: drawn[0].ext },
    { w: 1376, h: 768, ext: 'jpg' }
  )
  assert.equal(drawn[0].role, 'hero')
})

test('no picture model, or an answer with no picture, draws nothing and says nothing worse', async () => {
  assert.deepEqual(await drawPictures({ door: null, briefs: pictureBriefs({ name: 'N', about: 'A' }) }), {
    drawn: [],
    failed: 0,
    why: []
  })
  const empty = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'sorry' } }] }), { status: 200 })
  const { drawn, failed } = await drawPictures({
    door,
    briefs: pictureBriefs({ name: 'N', about: 'A' }).slice(0, 1),
    fetchImpl: empty
  })
  assert.deepEqual([drawn.length, failed], [0, 1])
})

test('a picture that outlasts the run is given up on, not waited for', async () => {
  const never = () => new Promise(() => {})
  const controller = new AbortController()
  const asking = drawPictures({
    door,
    briefs: pictureBriefs({ name: 'N', about: 'A' }).slice(0, 1),
    fetchImpl: never,
    signal: controller.signal
  })
  controller.abort()
  const { drawn, failed } = await asking
  assert.deepEqual([drawn.length, failed], [0, 1])
})

test('a drawn picture is cut from its centre to the shape of the demo it replaces, whatever it was drawn as', async () => {
  const wide = await picture(1376, 768, 'png')
  const cut = await cutToShape(wide, 1600 / 1000)
  const [w, h] = await sizeOf(cut)
  assert.ok(Math.abs(w / h - 1.6) < 0.01, `${w}×${h}`)
  assert.equal((await sharp(cut).metadata()).format, 'jpeg')
  const tall = await cutToShape(await picture(800, 1200), 1)
  const [tw, th] = await sizeOf(tall)
  assert.equal(tw, th)
  // A prefix of a file is enough to read its shape: that is all the site is asked for.
  assert.deepEqual(await sizeOf((await picture(1600, 1000, 'png')).subarray(0, 64)), [1600, 1000])
  assert.equal(await sizeOf(Buffer.from('not a picture')), null)
})

test('placing: each picture is cut to its demo, uploaded under its own hash, and the slots that show the demo get the path', async () => {
  const hero = await picture(1376, 768)
  const section = await picture(1024, 1024)
  const drawn = [
    { role: 'hero', bytes: hero, ext: 'jpg', width: 1376, height: 768 },
    { role: 'section', bytes: section, ext: 'jpg', width: 1024, height: 1024 }
  ]
  const groups = [
    { sample: 'images/hero.png', role: 'hero', slots: [{ key: 'm.1' }, { key: 'm.2' }] },
    { sample: 'images/why.png', role: 'section', slots: [{ key: 'm.3' }] }
  ]
  const demos = {
    'images/hero.png': await picture(1600, 1000, 'png'),
    'images/why.png': await picture(1200, 800, 'png')
  }
  const uploads = []
  const apply = async (call) => {
    uploads.push(call)
    return { ok: true }
  }
  const notes = []
  const { values, placed } = await placePictures({
    drawn,
    groups,
    platform: 'joomla',
    apply,
    siteKey: 'bakery.tracy.test',
    siteFile: async (path) => demos[path] ?? null,
    note: (n) => notes.push(n)
  })
  assert.equal(placed, 3)
  assert.equal(uploads.length, 2, 'one upload per picture, however many slots show it')
  for (const u of uploads) {
    assert.equal(u.action, 'media.upload')
    assert.match(u.params.path, new RegExp(`^${FOLDER.joomla}/[0-9a-f]{64}\\.jpg$`))
    assert.match(u.params.apply_id, /^media-brief-[0-9a-f]{16}$/)
  }
  assert.equal(values['m.1'], values['m.2'])
  assert.notEqual(values['m.1'], values['m.3'])
  const sizes = await Promise.all(uploads.map((u) => sizeOf(Buffer.from(u.params.content_b64, 'base64'))))
  const aspects = sizes.map(([w, h]) => w / h).sort()
  assert.ok(Math.abs(aspects[0] - 1.5) < 0.01 && Math.abs(aspects[1] - 1.6) < 0.01, aspects.join(', '))
  assert.deepEqual(notes, [])
})

test('placing: a demo whose shape cannot be read, or an upload the site refuses, keeps the template’s picture and says so', async () => {
  const drawn = [{ role: 'hero', bytes: await picture(1376, 768), ext: 'jpg', width: 1376, height: 768 }]
  const groups = [{ sample: 'images/hero.png', role: 'hero', slots: [{ key: 'm.1' }] }]
  const notes = []
  const unreadable = await placePictures({
    drawn,
    groups,
    platform: 'wordpress',
    apply: async () => ({ ok: true }),
    siteKey: 's',
    siteFile: async () => null,
    note: (n) => notes.push(n)
  })
  assert.deepEqual(unreadable, { values: {}, placed: 0 })
  assert.match(notes[0], /shape of images\/hero\.png could not be read/)

  const refused = await placePictures({
    drawn: [{ ...drawn[0] }],
    groups,
    platform: 'wordpress',
    apply: async () => ({ ok: false, code: 'MEDIA_REFUSED' }),
    siteKey: 's',
    siteFile: async () => picture(1600, 1000, 'png'),
    note: (n) => notes.push(n)
  })
  assert.deepEqual(refused, { values: {}, placed: 0 })
  assert.match(notes[1], /MEDIA_REFUSED/)
  // Nothing drawn, or nothing to replace: nothing happens.
  assert.deepEqual(
    await placePictures({
      drawn: [],
      groups,
      platform: 'joomla',
      apply: async () => ({}),
      siteKey: 's',
      siteFile: async () => null,
      note() {}
    }),
    { values: {}, placed: 0 }
  )
})

test('the first bytes of a site file are asked for with a range, and any failure is "unreadable"', async () => {
  let asked
  const read = headerReader(async (path, init) => {
    asked = { path, range: init.headers.range }
    return new Response(Buffer.alloc(100_000, 1), { status: 206 })
  })
  const bytes = await read('/images/hero.png')
  assert.equal(asked.path, 'images/hero.png')
  assert.equal(asked.range, 'bytes=0-65535')
  assert.equal(bytes.length, 65_536, 'a server that ignores the range is cut here')
  assert.equal(await headerReader(async () => new Response('no', { status: 404 }))('x'), null)
  assert.equal(
    await headerReader(async () => {
      throw new Error('connection refused')
    })('x'),
    null
  )
})

test('uploads go one at a time: a site takes one write at a time, and a shaped picture is bytes, not a request', async () => {
  const drawn = [
    { role: 'hero', bytes: await picture(1376, 768), ext: 'jpg', width: 1376, height: 768 },
    { role: 'section', bytes: await picture(1024, 1024), ext: 'jpg', width: 1024, height: 1024 },
    { role: 'section', bytes: await picture(900, 1200), ext: 'jpg', width: 900, height: 1200 }
  ]
  const groups = ['a', 'b', 'c'].map((n, i) => ({
    sample: `images/${n}.png`,
    role: i === 0 ? 'hero' : 'section',
    slots: [{ key: `m.${n}` }]
  }))
  const demo = await picture(1600, 1000, 'png')
  const shaped = await shapePictures({ drawn, groups, siteFile: async () => demo, note() {} })
  assert.equal(shaped.length, 3)
  assert.ok(shaped.every((p) => Buffer.isBuffer(p.bytes) && /^[0-9a-f]{64}$/.test(p.hash)))
  let inFlight = 0
  let peak = 0
  const order = []
  const apply = async (call) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    order.push(call.params.path)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    return { ok: true }
  }
  const { values, placed } = await uploadPictures({
    shaped,
    platform: 'wordpress',
    apply,
    siteKey: 's',
    note() {}
  })
  assert.equal(peak, 1, 'never two uploads in flight')
  assert.equal(placed, 3)
  assert.deepEqual(
    order,
    shaped.map((p) => `${FOLDER.wordpress}/${p.hash}.${p.ext}`),
    'in the order of the page'
  )
  assert.equal(Object.keys(values).length, 3)
})

test('an upload that throws, or answers busy, costs that picture only', async () => {
  const bytes = await picture(1600, 1000)
  const shaped = ['a', 'b'].map((n) => ({
    group: { sample: `images/${n}.png`, slots: [{ key: `m.${n}` }] },
    bytes,
    ext: 'jpg',
    hash: n.repeat(64).slice(0, 64)
  }))
  const notes = []
  let call = 0
  const { values, placed } = await uploadPictures({
    shaped,
    platform: 'joomla',
    siteKey: 's',
    note: (n) => notes.push(n),
    apply: async () => {
      call += 1
      if (call === 1) throw new Error('connection reset')
      return { ok: true }
    }
  })
  assert.equal(placed, 1)
  assert.deepEqual(Object.keys(values), ['m.b'])
  assert.match(notes[0], /connection reset/)
})
