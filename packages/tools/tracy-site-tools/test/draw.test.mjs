import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DRAWN_RULES, mediaDraw, pictureFolder, planDraw, slotChoices } from '../src/host/draw.mjs'
import { LOCAL_ACTIONS, planCall } from '../src/host/site.mjs'
import { siteToolDescription } from '../src/host/surface.mjs'
import { mediaUpload } from '../src/host/upload.mjs'

test('media.draw is a lane action of tracy_site', () => {
  assert.ok(LOCAL_ACTIONS.includes('media.draw'))
  const plan = planCall({ action: 'media.draw', params: { prompt: 'a cat' } })
  assert.equal(plan.ok, true)
  assert.equal(plan.local, true)
})

test('a draw needs a prompt, and a shape given one way only', () => {
  assert.match(planDraw({}).error, /prompt/)
  assert.match(planDraw({ prompt: 'x', like: '../etc/passwd' }).error, /like/)
  assert.match(planDraw({ prompt: 'x', aspect: 'wide' }).error, /aspect/)
  assert.match(planDraw({ prompt: 'x', like: 'images/a.jpg', aspect: '16:9' }).error, /one of/)
  assert.deepEqual(planDraw({ prompt: 'x', aspect: '16:10' }), {
    ok: true,
    prompt: 'x',
    like: null,
    aspect: 1.6,
    slot: null,
    replaces: null
  })
  assert.equal(
    planDraw({ prompt: 'x', like: 'images/northgate/hero-ru.png' }).like,
    'images/northgate/hero-ru.png'
  )
})

function fixture(t) {
  const webroot = mkdtempSync(path.join(tmpdir(), 'draw-'))
  t.after(() => rmSync(webroot, { recursive: true, force: true }))
  mkdirSync(path.join(webroot, 'images/northgate'), { recursive: true })
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(1600, 16)
  png.writeUInt32BE(1000, 20)
  writeFileSync(path.join(webroot, 'images/northgate/hero-ru.png'), png)
  return webroot
}

// The picture of a slot is the slot's shape: `like` names the picture it replaces, so the new one is
// cut to it and the sealed site accepts it. The upload goes through the site door as the person —
// never written into the webroot by the lane.
test('a picture like one on the site is drawn to its shape, uploaded, and handed back with no price and no model name', async (t) => {
  const webroot = fixture(t)
  let drawnWith = null
  let uploaded = null
  const answer = await mediaDraw({
    params: { prompt: 'A wedding tray of betel leaves', like: 'images/northgate/hero-ru.png' },
    webroot,
    door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
    draw: async (args) => {
      drawnWith = args
      return {
        ok: true,
        bytes: Buffer.from('jpeg'),
        ext: 'jpg',
        path: 'images/tracy-content/abc.jpg',
        width: 1600,
        height: 1000,
        model: 'google/gemini-3.1-flash-lite-image',
        costUsd: 0.0336
      }
    },
    upload: async (params) => {
      uploaded = params
      return { ok: true }
    }
  })
  assert.equal(drawnWith.prompt, 'A wedding tray of betel leaves')
  assert.equal(drawnWith.aspect, 1.6)
  assert.equal(uploaded.path, 'images/tracy-content/abc.jpg')
  assert.match(uploaded.apply_id, /^media-draw-/)
  assert.equal(uploaded.content_b64, Buffer.from('jpeg').toString('base64'))
  assert.equal(answer.ok, true)
  assert.equal(answer.path, 'images/tracy-content/abc.jpg')
  // 🔒 29/09/2026: no price and no model name reach the agent — it would say them to the customer.
  assert.equal('costUsd' in answer, false)
  assert.equal('model' in answer, false)
  assert.doesNotMatch(JSON.stringify(answer), /gemini|\$|cost/i)
  assert.match(answer.next, /content\.contract/)
})

test('no picture model, an unreadable shape, a failed draw or a refused upload: each said plainly', async (t) => {
  const webroot = fixture(t)
  const base = { webroot, upload: async () => ({ ok: true }) }
  const noDoor = await mediaDraw({ ...base, params: { prompt: 'x' }, door: null, draw: async () => ({}) })
  assert.equal(noDoor.code, 'NO_PICTURE_MODEL')
  const missing = await mediaDraw({
    ...base,
    params: { prompt: 'x', like: 'images/none.png' },
    door: { imageModel: 'm' },
    draw: async () => ({})
  })
  assert.equal(missing.code, 'LIKE_NOT_FOUND')
  const failed = await mediaDraw({
    ...base,
    params: { prompt: 'x' },
    door: { imageModel: 'm' },
    draw: async () => ({ ok: false, error: 'm answered no picture' })
  })
  assert.equal(failed.code, 'NOT_DRAWN')
  assert.match(failed.error, /no picture/)
  const refused = await mediaDraw({
    webroot,
    params: { prompt: 'x' },
    door: { imageModel: 'm' },
    draw: async () => ({
      ok: true,
      bytes: Buffer.from('j'),
      ext: 'jpg',
      path: 'images/tracy-content/a.jpg',
      width: 1,
      height: 1,
      model: 'm',
      costUsd: null
    }),
    upload: async () => ({ ok: false, code: 'TOOLSET_NOT_GRANTED', toolset: 'media' })
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'TOOLSET_NOT_GRANTED')
  assert.equal(refused.drawn, 'images/tracy-content/a.jpg')
})

// A sealed site refuses a picture it does not hold, and the agent must hear which door makes one.
test('a refused picture points at media.draw', async () => {
  const { refusalNext } = await import('../src/host/site.mjs')
  const next = refusalNext({
    ok: false,
    error: 'contract_failed',
    message: 'Image must already exist in the site media library: module-441.8'
  })
  assert.match(next ?? '', /media\.draw/)
})

// A slot names its own shape: the tool looks up the slot's demo picture (what the Claude Cowork plugin measures
// the new one against) instead of making the agent find a path or work out a ratio.
test("a picture drawn for a slot takes the shape of that slot's demo picture", async (t) => {
  const webroot = fixture(t)
  let aspect = null
  const answer = await mediaDraw({
    params: { prompt: 'x', slot: 'module-441.8' },
    webroot,
    door: { imageModel: 'm' },
    resolveSlot: async (key) =>
      key === 'module-441.8'
        ? { sample: 'images/northgate/hero-ru.png', current: 'images/tracy-content/old.jpg' }
        : null,
    draw: async (args) => {
      aspect = args.aspect
      return {
        ok: true,
        bytes: Buffer.from('j'),
        ext: 'jpg',
        path: 'images/tracy-content/b.jpg',
        width: 1600,
        height: 1000,
        model: 'm',
        costUsd: null
      }
    },
    upload: async () => ({ ok: true })
  })
  assert.equal(aspect, 1.6)
  assert.equal(answer.ok, true)
  assert.match(answer.next, /"module-441\.8":"images\/tracy-content\/b\.jpg"/)
  const unknown = await mediaDraw({
    params: { prompt: 'x', slot: 'module-999.1' },
    webroot,
    door: { imageModel: 'm' },
    resolveSlot: async () => null,
    draw: async () => ({}),
    upload: async () => ({ ok: true })
  })
  assert.equal(unknown.code, 'SLOT_NOT_FOUND')
})

/**
 * 🔒 A SLOT FIXES THE SHAPE, SO A like OR AN aspect BESIDE IT IS IGNORED, NOT REFUSED (bench v7, 30/09/2026:
 * "give the shape as one of slot, like or aspect, not several" was answered nine times in eight picture
 * runs — each a step, and most then dropped the slot, the one road a bound WordPress site accepts). Neutral
 * fixture: a contract whose only picture is `module-12.3`, 1600×1000 in its demo.
 */
test('a slot beside a like or an aspect is not refused: the slot wins, and the answer says what it ignored', async (t) => {
  const webroot = fixture(t)
  const plan = planDraw({ prompt: 'x', slot: 'module-12.3', like: 'images/a.jpg', aspect: '1:1' })
  assert.equal(plan.ok, true)
  assert.equal(plan.slot, 'module-12.3')
  assert.equal(plan.like, null)
  assert.equal(plan.aspect, null)
  assert.deepEqual(plan.notes, [
    'like ignored: the slot fixes the shape',
    'aspect ignored: the slot fixes the shape'
  ])
  // A like that would be refused alone (a path off the site) is ignored too: the slot is the address.
  assert.equal(planDraw({ prompt: 'x', slot: 'module-12.3', like: '../etc/passwd' }).ok, true)
  // Neither given: no note.
  assert.equal(planDraw({ prompt: 'x', slot: 'module-12.3' }).notes, undefined)
  // Without a slot the two shapes are still refused: which one is meant is not said.
  assert.match(planDraw({ prompt: 'x', like: 'images/a.jpg', aspect: '1:1' }).error, /one of/)
  let cutTo = null
  const answer = await mediaDraw({
    params: { prompt: 'x', slot: 'module-12.3', aspect: '1:1' },
    webroot,
    door: { imageModel: 'm' },
    resolveSlot: async () => ({ sample: 'images/northgate/hero-ru.png' }),
    draw: async (args) => {
      cutTo = args.aspect
      return {
        ok: true,
        bytes: Buffer.from('j'),
        ext: 'jpg',
        path: 'images/tracy-content/c.jpg',
        width: 1600,
        height: 1000
      }
    },
    upload: async () => ({ ok: true })
  })
  assert.equal(answer.ok, true)
  assert.equal(cutTo, 1.6, "the slot's demo shape, not the 1:1 that was typed")
  assert.deepEqual(answer.normalized, ['aspect ignored: the slot fixes the shape'])
  assert.match(answer.next, /"module-12\.3":"images\/tracy-content\/c\.jpg"/)
})

test('a slot key that is not one names where the keys are', () => {
  const said = planDraw({ prompt: 'x', slot: 'tb-why[image]' })
  assert.equal(said.ok, false)
  assert.match(said.error, /slot must be a contract image slot key such as module-441\.8 or home\.hero\.img/)
  assert.match(said.error, /content\.contract \{operation:"inspect", slots:"image", page\} lists them/)
})

/** A neutral contract: two blocks on one page, both languages of the first as separate blocks, one lean label. */
const IMAGE_SLOTS = [
  {
    key: 'module-12.3',
    label: '[Acme Studio] Home - Banner (en) / image',
    current: 'images/acme/banner.png'
  },
  { key: 'module-14.1', label: '[Acme Studio] Home - Crew (en) / photo', current: 'images/acme/crew.png' },
  { key: 'module-14.2', label: '…/ photo', current: 'images/acme/crew-2.png' },
  { key: 'module-31.3', label: '[Acme Studio] Home - Banner (fr) / image', current: 'images/acme/banner.png' }
]

test('slotChoices: the key, the block without its quickstart tag and its tail, the file the slot shows now', () => {
  assert.deepEqual(slotChoices(IMAGE_SLOTS), {
    slots: [
      'module-12.3 Home - Banner (en): banner.png',
      'module-14.1 Home - Crew (en): crew.png',
      'module-14.2: crew-2.png',
      'module-31.3 Home - Banner (fr): banner.png'
    ]
  })
  // WordPress names no label: the key is the page and the block.
  assert.deepEqual(slotChoices([{ key: 'home.hero.img', current: 'wp-content/uploads/2026/09/hero.png' }]), {
    slots: ['home.hero.img: hero.png']
  })
  // A site with more pictures than fit says how many it left out, and where the rest is.
  const many = Array.from({ length: 45 }, (_, i) => ({ key: `home.block-${i}.img`, current: `p/${i}.png` }))
  const cut = slotChoices(many)
  assert.equal(cut.slots.length, 40)
  assert.equal(cut.moreSlots, 5)
})

test('an unknown slot is answered with the image slots of the block it names, else of the whole site', async () => {
  const asked = []
  const imageSlots = async (entity) => {
    asked.push(entity)
    return entity === null ? IMAGE_SLOTS : IMAGE_SLOTS.filter((s) => s.key.startsWith(`${entity}.`))
  }
  const draw = async () => {
    throw new Error('the picture model is not paid for a slot that is not one')
  }
  const base = { webroot: null, door: { imageModel: 'm' }, resolveSlot: async () => null, imageSlots, draw }
  // A mistyped index of a right block: that block's pictures.
  const near = await mediaDraw({
    ...base,
    params: { prompt: 'x', slot: 'module-14.9' },
    upload: async () => ({})
  })
  assert.equal(near.ok, false)
  assert.equal(near.code, 'SLOT_NOT_FOUND')
  assert.equal(near.error, 'module-14.9 is not an image slot of this site.')
  assert.deepEqual(near.slots, ['module-14.1 Home - Crew (en): crew.png', 'module-14.2: crew-2.png'])
  assert.match(near.next, /Call media\.draw again with one of slots: the shape comes with the slot\./)
  assert.match(near.next, /content\.contract \{operation:"inspect", slots:"image", page:"<route>"\}/)
  assert.deepEqual(asked, ['module-14'])
  // A key whose block is nowhere: every picture of the site.
  asked.length = 0
  const far = await mediaDraw({
    ...base,
    params: { prompt: 'x', slot: 'hero.img' },
    upload: async () => ({})
  })
  assert.equal(far.code, 'SLOT_NOT_FOUND')
  assert.equal(far.slots.length, IMAGE_SLOTS.length)
  assert.deepEqual(asked, ['hero', null])
  // No list to give (an older Claude Cowork plugin, a lookup that failed): the old sentence, with the way to the keys.
  for (const failing of [undefined, async () => [], async () => Promise.reject(new Error('relay down'))]) {
    const bare = await mediaDraw({
      ...base,
      imageSlots: failing,
      params: { prompt: 'x', slot: 'hero.img' },
      upload: async () => ({})
    })
    assert.equal(bare.code, 'SLOT_NOT_FOUND')
    assert.equal(bare.slots, undefined)
    assert.match(bare.error, /list them with content\.contract \{operation:"inspect", slots:"image"\}/)
  }
})

test('a bound WordPress site asked for a picture with no slot is answered with its image slots', async () => {
  const wordpress = [
    { key: 'home.hero.img', current: 'wp-content/uploads/2026/09/hero.png' },
    { key: 'about.team.img', current: 'wp-content/uploads/2026/09/team.png' }
  ]
  let asked = 'not asked'
  const answer = await mediaDraw({
    params: { prompt: 'x', aspect: '4:5' },
    webroot: null,
    platform: 'wordpress',
    slotOnly: true,
    door: { imageModel: 'm' },
    imageSlots: async (entity) => {
      asked = entity
      return wordpress
    },
    draw: async () => {
      throw new Error('must not draw')
    },
    upload: async () => ({ ok: true })
  })
  assert.equal(answer.code, 'SLOT_REQUIRED')
  assert.equal(asked, null, 'no key was given, so every picture is listed')
  assert.equal(
    answer.error,
    'On this quickstart site a picture goes into an image slot: media.draw {prompt, slot:"<image slot key>"}.'
  )
  assert.deepEqual(answer.slots, ['home.hero.img: hero.png', 'about.team.img: team.png'])
  assert.match(
    answer.next,
    /Take the slot the picture replaces from slots and call media\.draw again with it/
  )
})

// Lee, 23/09/2026: an evidence-required slot takes an invented value too — declared as one. The agent
// drew five leadership portraits and certificates on j-ee6vsk and every apply was refused with only
// "Customer evidence required"; it has to hear how to say what the value is.
test('a slot refused for evidence says how to declare an invention', async () => {
  const { refusalNext } = await import('../src/host/site.mjs')
  const next = refusalNext({
    ok: false,
    error: 'contract_failed',
    message: 'Customer evidence required: module-841.1'
  })
  assert.match(next ?? '', /evidence/)
  assert.match(next ?? '', /module-841\.1/)
  assert.match(next ?? '', /Invented by Tracy/)
})

// A bound WordPress site takes a picture only at wp-content/uploads/tracy-content/<sha256> (the
// Claude Cowork plugin's CONTRACT_MEDIA_PATH), and names its image slots `<page>.<block>` — the same key the
// agent reads in content.read. Until 26/09/2026 the draw knew only Joomla's `images/` and
// `module-441.8`, which is why a bound WordPress site had no media.draw at all.
test('on WordPress the picture is drawn into wp-content/uploads/tracy-content, for a <page>.<block> slot', async (t) => {
  const webroot = mkdtempSync(path.join(tmpdir(), 'draw-wp-'))
  t.after(() => rmSync(webroot, { recursive: true, force: true }))
  mkdirSync(path.join(webroot, 'wp-content/uploads/2026/09'), { recursive: true })
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(800, 16)
  png.writeUInt32BE(1000, 20)
  writeFileSync(path.join(webroot, 'wp-content/uploads/2026/09/hero-ru.png'), png)
  let drawnWith = null
  let sent = null
  const answer = await mediaDraw({
    params: { prompt: 'Cement plant leadership, portrait', slot: 'home.hero.img' },
    webroot,
    platform: 'wordpress',
    door: { imageModel: 'm' },
    resolveSlot: async (key) =>
      key === 'home.hero.img' ? { sample: 'wp-content/uploads/2026/09/hero-ru.png' } : null,
    draw: async (args) => {
      drawnWith = args
      return {
        ok: true,
        bytes: Buffer.from('j'),
        ext: 'jpg',
        path: `${args.folder}/c.jpg`,
        width: 800,
        height: 1000,
        model: 'm',
        costUsd: 0.03
      }
    },
    upload: async (params) => {
      sent = params
      return { ok: true }
    }
  })
  assert.equal(drawnWith.folder, 'wp-content/uploads/tracy-content')
  assert.equal(drawnWith.aspect, 0.8)
  assert.equal(sent.path, 'wp-content/uploads/tracy-content/c.jpg')
  assert.doesNotMatch(sent.apply_id, /^contract-/, 'a sealed site refuses an upload under a contract- id')
  assert.equal(answer.ok, true)
  assert.match(answer.next, /"home\.hero\.img":"wp-content\/uploads\/tracy-content\/c\.jpg"/)
  // Joomla keeps its own folder.
  assert.equal(pictureFolder('joomla'), 'images/tracy-content')
  assert.equal(pictureFolder('wordpress'), 'wp-content/uploads/tracy-content')
  assert.equal(
    planDraw({ prompt: 'x', slot: 'investor-relations.text.img' }).slot,
    'investor-relations.text.img'
  )
  assert.match(planDraw({ prompt: 'x', slot: 'hero' }).error, /slot must be/)
})

// On a bound WordPress site a picture has nowhere to land but an image slot, and a Claude Cowork plugin older
// than image slots names none: without a slot the draw would be paid for and then refused.
test('a bound WordPress site draws for a slot only, and says so before anything is paid for', async () => {
  let drew = false
  const answer = await mediaDraw({
    params: { prompt: 'x', aspect: '4:5' },
    webroot: null,
    platform: 'wordpress',
    slotOnly: true,
    door: { imageModel: 'm' },
    draw: async () => {
      drew = true
      return {}
    },
    upload: async () => ({ ok: true })
  })
  assert.equal(drew, false)
  assert.equal(answer.code, 'SLOT_REQUIRED')
  assert.match(answer.error, /media\.draw \{prompt, slot:"<image slot key>"\}/)
  assert.match(answer.error, /slots:"image"/)
})

// EmDash (26/09/2026): the one CMS with no draw road — rounds 3, 4 and 5 all refused D4 "redraw the
// hero" there. Its pictures live in the site's media store, uploaded through `tracy_emdash
// media_upload {filename, contentType, base64}`, and land in an entry field by url — no contract slot,
// no webroot path to measure a `like` against.
test('on EmDash a picture is drawn to an aspect, uploaded through media_upload, and its url handed to content_update', async () => {
  let uploaded = null
  const answer = await mediaDraw({
    params: { prompt: 'an offshore drilling rig at dawn', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw: async (args) => ({
      ok: true,
      bytes: Buffer.from('png'),
      ext: 'png',
      path: `${args.folder}/abc.png`,
      width: 1600,
      height: 1000,
      model: 'm',
      costUsd: 0.03
    }),
    upload: async (params) => {
      uploaded = params
      return {
        ok: true,
        id: '01M3ETAF7D8QWHMKBEP0D1K7JE',
        url: '/_emdash/api/media/file/01M3ETAF7D8QWHMKBEP0D1K7JE.png'
      }
    }
  })
  assert.equal(answer.ok, true)
  assert.equal(uploaded.path, 'tracy-content/abc.png')
  assert.equal(uploaded.content_b64, Buffer.from('png').toString('base64'))
  assert.equal(answer.url, '/_emdash/api/media/file/01M3ETAF7D8QWHMKBEP0D1K7JE.png')
  assert.equal(answer.id, '01M3ETAF7D8QWHMKBEP0D1K7JE')
  assert.match(answer.next, /tracy_emdash content_update/)
  // The field takes the media item's id; the url is shown for the person.
  assert.match(answer.next, /"<image field>":"01M3ETAF7D8QWHMKBEP0D1K7JE"/)
  assert.match(answer.next, /01M3ETAF7D8QWHMKBEP0D1K7JE\.png/)
  assert.doesNotMatch(answer.next, /content\.contract/)
})

test('on EmDash a slot or a like is refused before the picture model is paid, each naming the road', async () => {
  const draw = async () => {
    throw new Error('must not draw')
  }
  const slot = await mediaDraw({
    params: { prompt: 'x', slot: 'home.hero' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw,
    upload: async () => ({ ok: true })
  })
  assert.equal(slot.code, 'NO_SLOTS_ON_EMDASH')
  assert.match(slot.error, /replaces:\{collection, id, field\}/)
  const like = await mediaDraw({
    params: { prompt: 'x', like: 'images/hero.jpg' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw,
    upload: async () => ({ ok: true })
  })
  assert.equal(like.code, 'LIKE_NOT_ON_EMDASH')
  assert.match(like.error, /replaces:\{collection, id, field\}/)
  assert.match(like.error, /aspect:"<w>:<h>"/)
  const bare = await mediaDraw({
    params: { prompt: 'x' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw,
    upload: async () => ({ ok: true })
  })
  assert.equal(bare.code, 'ASPECT_REQUIRED')
  // The way on says what the shape is: measured (replaces) or, for a new picture, the stored width:height —
  // never a nearby stock ratio or the CSS frame page.look shows (v7: 16/10, 5/4 and 4/3 for a 1000×880 picture).
  assert.match(bare.error, /replaces:\{collection, id, field\}/)
  assert.match(bare.error, /never a nearby stock ratio or the CSS frame/)
  assert.doesNotMatch(bare.error, /16\/10|page\.look shows it/)
  assert.equal(pictureFolder('emdash'), 'tracy-content')
})

// ── EmDash: the door measures the shape of the picture a field holds ─────────────────────────────────
//
// v7 (29/09/2026): three EmDash picks drew at a shape the model guessed — "16/10" before the entry was read,
// "5/4" for a 1000×880 picture, "4/3" read off the CSS frame — and three wrong pages came of it. A pick's own
// `emdash:` mark names the entry field; `replaces` hands it to the door, which reads the stored size.
// Neutral fixture: a `gallery` entry whose `cover` holds a 1000×880 picture.

const REPLACES = { collection: 'gallery', id: '01ENTRYAAAAAAAAAAAAAAAAAAA', field: 'cover' }
const emdashDrawn = () => ({
  ok: true,
  bytes: Buffer.from('png'),
  ext: 'png',
  path: 'tracy-content/n.png',
  width: 800,
  height: 704
})
const emdashUpload = async () => ({
  ok: true,
  id: '01NEWMEDIA',
  url: '/_emdash/api/media/file/01NEWMEDIA.png'
})
const measured = async () => ({ ok: true, width: 1000, height: 880 })

test('on EmDash `replaces` draws to the stored shape of the picture in that field: no ratio is typed', async () => {
  const asked = []
  let cutTo = null
  const answer = await mediaDraw({
    params: { prompt: 'x', replaces: REPLACES },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    measure: async (replaces) => {
      asked.push(replaces)
      return { ok: true, width: 1000, height: 880 }
    },
    draw: async (args) => {
      cutTo = args.aspect
      return emdashDrawn()
    },
    upload: emdashUpload
  })
  assert.deepEqual(asked, [REPLACES])
  assert.equal(cutTo, 1000 / 880, 'the stored width:height, unrounded — not 16/10, not 5/4, not 4/3')
  assert.equal(answer.ok, true)
  assert.equal(answer.id, '01NEWMEDIA')
  assert.equal('normalized' in answer, false, 'nothing was corrected')
})

test('on EmDash `replaces` beside an aspect measures, and says the aspect was ignored; when it cannot measure the aspect it was given is used, and said', async () => {
  let cutTo = null
  const drawOnce = (measure, params) =>
    mediaDraw({
      params: { prompt: 'x', replaces: REPLACES, ...params },
      webroot: null,
      platform: 'emdash',
      door: { imageModel: 'm' },
      measure,
      draw: async (args) => {
        cutTo = args.aspect
        return emdashDrawn()
      },
      upload: emdashUpload
    })
  const both = await drawOnce(measured, { aspect: '16/10' })
  assert.equal(cutTo, 1000 / 880)
  assert.deepEqual(both.normalized, ['aspect ignored: replaces fixes the shape'])
  const fallback = await drawOnce(
    async () => ({ ok: false, code: 'REPLACES_NOT_FOUND', error: 'no entry' }),
    {
      aspect: '4:5'
    }
  )
  assert.equal(cutTo, 0.8)
  assert.equal(fallback.ok, true)
  assert.deepEqual(fallback.normalized, ['replaces not measured: aspect used'])
  // A like beside replaces is ignored, not refused (it names a webroot path, and replaces is the address).
  const withLike = planDraw({ prompt: 'x', replaces: REPLACES, like: 'images/a.jpg' })
  assert.equal(withLike.ok, true)
  assert.equal(withLike.like, null)
  assert.deepEqual(withLike.notes, ['like ignored: replaces fixes the shape'])
})

test('on EmDash a picture that cannot be measured is refused before the picture model is paid, with the reason and the way on', async () => {
  const answer = await mediaDraw({
    params: { prompt: 'x', replaces: REPLACES },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    measure: async () => ({
      ok: false,
      code: 'REPLACES_NO_PICTURE',
      error: 'media 01MISSING, the picture in cover, is not in the library',
      next: 'media.scan lists the pictures with their sizes; aspect:"<w>:<h>" draws to a shape you choose.'
    }),
    draw: async () => {
      throw new Error('must not draw')
    },
    upload: emdashUpload
  })
  assert.equal(answer.ok, false)
  assert.equal(answer.code, 'REPLACES_NO_PICTURE')
  assert.match(answer.error, /is not in the library/)
  assert.match(answer.next, /aspect:"<w>:<h>"/)
})

test('`replaces` is an EmDash entry field: a shape of another kind is refused, and other CMSs say so', async () => {
  for (const replaces of [
    'home.hero_image',
    { collection: 'gallery', id: '01E' },
    { collection: 'a b', id: '01E', field: 'f' },
    []
  ]) {
    const plan = planDraw({ prompt: 'x', replaces })
    assert.equal(plan.ok, false)
    assert.match(plan.error, /replaces is \{collection, id, field\}/)
  }
  // A slot is an address too, and the stronger one: replaces is ignored beside it, and said.
  const slotted = planDraw({ prompt: 'x', slot: 'module-12.3', replaces: REPLACES })
  assert.equal(slotted.ok, true)
  assert.equal(slotted.slot, 'module-12.3')
  assert.deepEqual(slotted.notes, ['replaces ignored: the slot fixes the shape'])
  const elsewhere = await mediaDraw({
    params: { prompt: 'x', replaces: REPLACES },
    webroot: null,
    platform: 'joomla',
    door: { imageModel: 'm' },
    draw: async () => {
      throw new Error('must not draw')
    },
    upload: emdashUpload
  })
  assert.equal(elsewhere.code, 'REPLACES_ONLY_ON_EMDASH')
  assert.match(elsewhere.error, /slot\) or a picture on the site \(like\)/)
})

// ── What a drawn picture's answer says (bench v7, 30/09/2026) ─────────────────────────────────────────
//
// EmDash's answer used to carry `path: tracy-content/<sha>.jpg`, the STAGING name, which no file tool can
// open: a Designer run read_image'd it, was refused, and hunted the disk with find/ls/cp for six steps. A
// WordPress developer run drew four pictures, then painted one itself with a Python script (20 calls), and
// a Joomla run applied a drawn picture, looked at it, and undid it. The answer now names the road to look
// (`media.scan {id}`) and says three things once, in the turn that draws — never in the tool text every
// step pays for.

test('an EmDash draw answers the media id and url and no staging path, and says how to look at the picture', async () => {
  const answer = await mediaDraw({
    params: { prompt: 'x', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw: async () => emdashDrawn(),
    upload: emdashUpload
  })
  assert.equal(answer.ok, true)
  assert.equal('path' in answer, false, 'tracy-content/<sha> opens with no tool')
  assert.doesNotMatch(JSON.stringify(answer), /tracy-content\//)
  assert.deepEqual([answer.id, answer.url], ['01NEWMEDIA', '/_emdash/api/media/file/01NEWMEDIA.png'])
  assert.match(answer.next, /To look at it: media\.scan \{id:"01NEWMEDIA"\}\./)
  assert.ok(answer.next.includes(DRAWN_RULES))
  // The site that answered no id has nothing to look up: the sentence is not made up.
  const anonymous = await mediaDraw({
    params: { prompt: 'x', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw: async () => emdashDrawn(),
    upload: async () => ({ ok: true, url: '/_emdash/api/media/file/u.png' })
  })
  assert.doesNotMatch(anonymous.next, /media\.scan/)
})

test('a draw says, on every CMS, not to paint the picture by script, not to undo it unasked, and to say only what it saw', async (t) => {
  const webroot = fixture(t)
  const opens = {
    ok: true,
    bytes: Buffer.from('j'),
    ext: 'jpg',
    path: 'images/tracy-content/d.jpg',
    width: 1600,
    height: 1000
  }
  const joomla = await mediaDraw({
    params: { prompt: 'x', like: 'images/northgate/hero-ru.png' },
    webroot,
    door: { imageModel: 'm' },
    draw: async () => opens,
    upload: async () => ({ ok: true })
  })
  const wordpress = await mediaDraw({
    params: { prompt: 'x', slot: 'home.hero.img' },
    webroot,
    platform: 'wordpress',
    slotOnly: true,
    door: { imageModel: 'm' },
    resolveSlot: async () => ({ sample: 'images/northgate/hero-ru.png' }),
    draw: async () => ({ ...opens, path: 'wp-content/uploads/tracy-content/d.jpg' }),
    upload: async () => ({ ok: true })
  })
  for (const answer of [joomla, wordpress]) {
    assert.equal(answer.ok, true)
    assert.ok(answer.next.endsWith(DRAWN_RULES), answer.next)
  }
  assert.match(DRAWN_RULES, /paint a picture by script or bash in its place/)
  assert.match(DRAWN_RULES, /never undo one unasked/)
  assert.match(DRAWN_RULES, /Say only what the receipt or a look at it showed/)
  // A look at a picture it drew is the agent's to make (the stand's picture model is a double answering an
  // unrelated fixture): no clause stops it, and the clause is short — it rides in every draw's answer.
  assert.doesNotMatch(DRAWN_RULES, /never look|do not look|don.t look|no look/i)
  assert.ok(DRAWN_RULES.length <= 140, `${DRAWN_RULES.length} characters`)
  // …and it is not in what every step pays for.
  assert.doesNotMatch(siteToolDescription('wordpress-contract'), /paint a picture/)
  assert.doesNotMatch(siteToolDescription('emdash'), /paint a picture/)
})

test('a draw the picture model did not make says to tell the customer, not to paint one by hand', async () => {
  const failed = await mediaDraw({
    params: { prompt: 'x', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'm' },
    draw: async () => ({ ok: false, error: 'm answered no picture' }),
    upload: emdashUpload
  })
  assert.equal(failed.code, 'NOT_DRAWN')
  assert.equal(
    failed.next,
    'Tell the customer the picture could not be drawn; paint none by script or bash in its place.'
  )
})

// ── PD-3 (adversarial review of round 7): the apply that follows a picture needs no inspect ───────────
//
// The upload receipt lost "with the revision of your last inspect" (a model that has read the page was sent
// to inspect it again: 12–20 s on Joomla, and the apply's own description says Tracy sends the revision it
// read); the draw receipt kept it. Both receipts name the apply the same way now.
{
  /** A PNG header the upload road reads: 1200×800. */
  const picture = () => {
    const b = Buffer.alloc(40)
    b.writeUInt32BE(0x89504e47, 0)
    b.writeUInt32BE(0x0d0a1a0a, 4)
    b.writeUInt32BE(13, 8)
    b.write('IHDR', 12, 'ascii')
    b.writeUInt32BE(1200, 16)
    b.writeUInt32BE(800, 20)
    return b
  }
  /** @type {Array<[string, (t: any) => Promise<any>]>} */
  const receipts = [
    [
      'media.draw on Joomla, shaped like a picture',
      async (t) =>
        mediaDraw({
          params: { prompt: 'x', like: 'images/northgate/hero-ru.png' },
          webroot: fixture(t),
          door: { imageModel: 'm' },
          draw: async () => ({
            ok: true,
            bytes: Buffer.from('j'),
            ext: 'jpg',
            path: 'images/tracy-content/d.jpg',
            width: 1600,
            height: 1000
          }),
          upload: async () => ({ ok: true })
        })
    ],
    [
      'media.draw on WordPress, into a slot',
      async (t) =>
        mediaDraw({
          params: { prompt: 'x', slot: 'home.hero.img' },
          webroot: fixture(t),
          platform: 'wordpress',
          slotOnly: true,
          door: { imageModel: 'm' },
          resolveSlot: async () => ({ sample: 'images/northgate/hero-ru.png' }),
          draw: async () => ({
            ok: true,
            bytes: Buffer.from('j'),
            ext: 'jpg',
            path: 'wp-content/uploads/tracy-content/d.jpg',
            width: 1600,
            height: 1000
          }),
          upload: async () => ({ ok: true })
        })
    ],
    [
      'media.upload on a site with a contract',
      async (t) => {
        const siteRoot = mkdtempSync(path.join(tmpdir(), 'draw-upload-'))
        t.after(() => rmSync(siteRoot, { recursive: true, force: true }))
        writeFileSync(path.join(siteRoot, 'shop-front.png'), picture())
        return mediaUpload({
          params: { file: 'shop-front.png' },
          platform: 'wordpress',
          siteRoot,
          contract: true,
          upload: async (/** @type {any} */ sent) => ({ ok: true, path: sent.path })
        })
      }
    ]
  ]
  for (const [label, receipt] of receipts)
    test(`the receipt of ${label} names the apply with no inspect: Tracy adds the revision`, async (t) => {
      const answer = await receipt(t)

      assert.equal(answer.ok, true, JSON.stringify(answer).slice(0, 200))
      assert.match(answer.next, /content\.contract \{operation:"apply", changes:\{"[^"]+":"[^"]+"\}\}/)
      assert.match(answer.next, /Tracy adds the revision/)
      assert.doesNotMatch(answer.next, /inspect/i)
    })
}

// 🔒 02/10/2026: a Joomla article keeps two pictures (card and page); the drawn picture's next says so, on Joomla only.
test('a drawn picture’s next tells a Joomla article’s two pictures apart, and only on Joomla', async (t) => {
  const webroot = fixture(t)
  /** @param {string} platform */
  const drawn = async (platform) =>
    /** @type {any} */ (
      await mediaDraw({
        params: { prompt: 'A beach at dusk', like: 'images/northgate/hero-ru.png' },
        webroot,
        platform,
        door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
        draw: async () => ({
          ok: true,
          bytes: Buffer.from('jpeg'),
          ext: 'jpg',
          path: 'images/tracy-content/abc.jpg',
          width: 1600,
          height: 1000
        }),
        upload: async () => ({ ok: true })
      })
    )
  const joomla = await drawn('joomla')
  assert.equal(joomla.ok, true, JSON.stringify(joomla))
  assert.match(joomla.next, /image_intro:"<path>"/)
  assert.match(
    joomla.next,
    /image_fulltext the picture on its own page; "the picture of the article" is both\./
  )
  const wordpress = await drawn('wordpress')
  assert.doesNotMatch(String(wordpress.next ?? ''), /image_intro|image_fulltext/)
  assert.match(
    String(wordpress.next ?? ''),
    /On a block theme, a picture the theme prints \(a logo, a banner\) sits in a template part/
  )
  assert.doesNotMatch(String(joomla.next ?? ''), /templatePart/)
})

// Review of 02/10/2026: the article-pictures paragraph is for a picture with no slot ("only when no slot takes it"),
// yet it was appended to a draw into a slot as well, where the slot already names the write.
test('a Joomla picture drawn into a slot carries no article-pictures paragraph', async (t) => {
  const webroot = fixture(t)
  const answer = /** @type {any} */ (
    await mediaDraw({
      params: { prompt: 'A beach at dusk', slot: 'module-441.8' },
      webroot,
      platform: 'joomla',
      slotOnly: true,
      door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
      resolveSlot: async () => ({ sample: 'images/northgate/hero-ru.png' }),
      draw: async () => ({
        ok: true,
        bytes: Buffer.from('jpeg'),
        ext: 'jpg',
        path: 'images/tracy-content/abc.jpg',
        width: 1600,
        height: 1000
      }),
      upload: async () => ({ ok: true })
    })
  )
  assert.equal(answer.ok, true, JSON.stringify(answer))
  assert.match(answer.next, /content\.contract \{operation:"apply", changes:\{"module-441\.8":/)
  assert.doesNotMatch(answer.next, /image_intro|image_fulltext/)
})
