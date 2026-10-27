/**
 * A picture into an image slot, from the value the model copied to what the component takes.
 *
 * Round 7 (bench v7, 29/09/2026): `content.read` shows a WordPress picture as `/wp-content/uploads/…`,
 * the component takes `wp-content/uploads/…` and refuses the shown form (`SLOT_IMAGE_INVALID`). Five of
 * five WordPress runs that reused a library picture copied the shown form; the refusal's next said only
 * "media.draw draws a picture", a refused apply forgot the revision the model had read, and the worst
 * run concluded that a slot cannot take an existing picture and rewrote the block's markup.
 * Fixtures are neutral: a shop's hero and a gallery card.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { libraryPath, repairedPictures } from '../src/host/normalize.mjs'
import { planCall, refusalNext } from '../src/host/site.mjs'
import { runSiteCall } from '../src/host/site-call.mjs'

const SHOWN = '/wp-content/uploads/2026/09/gallery-2.png'
const TAKEN = 'wp-content/uploads/2026/09/gallery-2.png'

/** A bound WordPress site's content.read of its home page: two pictures, one text, one revision. */
const HOME_READ = (revision = 'rev-home-1', url = 'http://shop.test:8080') => ({
  schemaVersion: 'tracy-content/v1',
  protocol: {
    selected: 'tracy-content/v1',
    relayExtensions: [],
    cowork: { kind: 'wordpress', capability: 'v1' }
  },
  site: { id: 'site-shop', url, defaultLocale: 'en-US', locales: ['en-US'] },
  contents: [
    {
      id: 'content_home',
      revision,
      type: 'page',
      blocks: [
        {
          fields: [
            { key: 'hero.heading', type: 'text', value: 'Welcome', slotKey: 'home.hero.heading' },
            {
              key: 'hero.img',
              type: 'image',
              value: '/wp-content/uploads/2026/09/hero.png',
              slotKey: 'home.hero.img'
            },
            { key: 'gallery.2.img', type: 'image', value: SHOWN, slotKey: 'home.gallery.2.img' }
          ],
          items: []
        }
      ]
    }
  ]
})

/** The component's refusal of a picture written with a leading slash, with `errors[]` (W3). */
const badForm = (/** @type {string[]} */ ...slots) => ({
  ok: false,
  error: 'contract_failed',
  message: `Image must be a png, jpg or webp under wp-content/uploads/: ${slots[0]}`,
  errors: slots.map((slotKey) => ({
    code: 'SLOT_IMAGE_INVALID',
    message: `Image must be a png, jpg or webp under wp-content/uploads/: ${slotKey}`,
    field: { slotKey, contentId: 'content_home' },
    severity: 'recoverable'
  }))
})

/**
 * A fake relay: the read answers the envelope, an apply is refused for a picture not written as
 * `wp-content/uploads/…` and accepted otherwise. Every call is recorded.
 * @param {(params: Record<string, any>) => unknown} [apply]
 */
function shop(apply) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const memory = createCallMemory({ now: () => 1_000 })
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.read') return HOME_READ()
    if (params.operation === 'inspect') return WP_INSPECT
    if (apply !== undefined) return apply(params)
    // The component's rule (`IMAGE_PATH`): a path under wp-content/uploads/, written without an address.
    const badly = Object.entries(params.changes ?? {}).filter(
      ([, v]) => typeof v === 'string' && !v.startsWith('wp-content/uploads/')
    )
    if (badly.length > 0) return badForm(...badly.map(([k]) => k))
    return { ok: true, written: [{ kind: 'post', id: 42 }], contentRevisions: { content_home: 'rev-home-2' } }
  }
  /** @param {unknown} args */
  const call = async (args) => {
    const plan = planCall(args)
    assert.ok(plan.ok, JSON.stringify(plan))
    return /** @type {Promise<any>} */ (
      runSiteCall({
        plan,
        send,
        memory,
        sessionId: 'session-shop',
        label: 'shop-1',
        actorKey: 'ana@example.com',
        facts: { platform: 'wordpress', sealed: true, contractDoor: true },
        sleep: async () => {}
      })
    )
  }
  const applies = () => sent.filter(([, p]) => p.operation === 'apply').map(([, p]) => p)
  return { sent, memory, call, applies }
}

/** A bound WordPress site's inspect: `slots` is a MAP of key → current words, pictures in `imageSlots`. */
const WP_INSPECT = {
  ok: true,
  contract: 'shop/wp7/1.0.0',
  revision: 'rev-site-1',
  slots: {
    'home.hero.heading': 'Welcome',
    'home.hero.img': 'wp-content/uploads/2026/09/hero.png',
    'home.gallery.2.img': TAKEN
  },
  imageSlots: {
    'home.hero.img': 'wp-content/uploads/2026/09/hero.png',
    'home.gallery.2.img': TAKEN
  },
  entities: [{ key: 'page-home', kind: 'page' }]
}

const readHome = { action: 'content.read', params: { id: 'content_home' } }
const applyHero = (/** @type {string} */ value) => ({
  action: 'content.contract',
  params: { operation: 'apply', changes: { 'home.hero.img': value } }
})

// ── the value: shown form → taken form ─────────────────────────────────────────────────────────────

test('libraryPath: a leading slash and this site’s own address are cut; nothing else is touched', () => {
  assert.equal(libraryPath(SHOWN), TAKEN)
  assert.equal(libraryPath(`  ${SHOWN}\n`), TAKEN, 'trimmed, as the component reads a path')
  assert.equal(libraryPath(TAKEN), TAKEN, 'the taken form is left as it is')
  assert.equal(libraryPath('/images/northgate/hero.png'), 'images/northgate/hero.png', 'Joomla’s folder too')
  assert.equal(libraryPath(`http://shop.test:8080${SHOWN}`, 'shop.test'), TAKEN, 'own address, any port')
  assert.equal(libraryPath(`https://SHOP.test${SHOWN}?ver=3`, 'shop.test'), TAKEN, 'scheme, case and query')
  // Never another host's picture as if it were this site's file, and never without a known host.
  assert.equal(libraryPath(`https://cdn.example.com${SHOWN}`, 'shop.test'), `https://cdn.example.com${SHOWN}`)
  assert.equal(libraryPath(`http://shop.test${SHOWN}`), `http://shop.test${SHOWN}`)
  assert.equal(libraryPath(`https://user@shop.test${SHOWN}`, 'shop.test'), `https://user@shop.test${SHOWN}`)
  // A `..` segment and a protocol-relative address are left for the component to refuse.
  assert.equal(libraryPath('/wp-content/uploads/../wp-config.php'), '/wp-content/uploads/../wp-config.php')
  assert.equal(libraryPath('//cdn.example.com/a.png'), '//cdn.example.com/a.png')
  assert.equal(libraryPath('/'), '/')
  assert.equal(libraryPath(''), '')
  assert.equal(libraryPath(42), 42)
})

test('repairedPictures: only a refusal for the WRITING of pictures, every one rewritable, is repaired', () => {
  const changes = { 'home.hero.img': SHOWN, 'home.gallery.2.img': '/wp-content/uploads/2026/09/b.png' }
  const fixed = repairedPictures(badForm('home.hero.img', 'home.gallery.2.img').errors, changes)
  assert.deepEqual(fixed?.changes, {
    'home.hero.img': TAKEN,
    'home.gallery.2.img': 'wp-content/uploads/2026/09/b.png'
  })
  assert.equal(fixed?.notes.length, 2)
  assert.match(fixed?.notes[0] ?? '', /home\.hero\.img: leading "\/" cut from the picture path/)
  assert.ok(fixed?.notes.every((n) => n.length <= 90))
  // The same slot named twice is one repair.
  assert.equal(repairedPictures(badForm('home.hero.img', 'home.hero.img').errors, changes)?.notes.length, 1)
  // Anything else in the refusal, and the whole apply would be refused again.
  const mixed = [
    ...badForm('home.hero.img').errors,
    { code: 'SLOT_TOO_LONG', field: { slotKey: 'home.hero.heading' }, severity: 'recoverable' }
  ]
  assert.equal(repairedPictures(mixed, { ...changes, 'home.hero.heading': 'x' }), null)
  // A picture already in the taken form (refused for another reason), a slot that was not sent, no errors.
  assert.equal(repairedPictures(badForm('home.hero.img').errors, { 'home.hero.img': TAKEN }), null)
  assert.equal(repairedPictures(badForm('home.other').errors, changes), null)
  assert.equal(repairedPictures([], changes), null)
  assert.equal(repairedPictures(undefined, changes), null)
})

// ── the call: read → apply the shown form ──────────────────────────────────────────────────────────

test('🔒 the form content.read shows is sent once more in the form the component takes — the model never sees the refusal', async () => {
  const { call, applies } = shop()
  await call(readHome)
  const out = await call(applyHero(SHOWN))
  assert.equal(out.ok, true, JSON.stringify(out))
  const sent = applies()
  assert.equal(sent.length, 2, 'refused once, sent once more')
  assert.equal(sent[0].changes['home.hero.img'], SHOWN)
  assert.equal(sent[1].changes['home.hero.img'], TAKEN)
  // Nothing was written by the first, so the second is a new apply on the same read.
  assert.notEqual(sent[0].apply_id, sent[1].apply_id)
  assert.notEqual(sent[0].request_id, sent[1].request_id)
  assert.match(sent[1].apply_id, /^contract-/)
  assert.deepEqual(sent[1].expected_content_revisions, { content_home: 'rev-home-1' })
  assert.equal(out.applyId, sent[1].apply_id)
  assert.ok(
    !out.normalized.some((/** @type {string} */ n) => n.startsWith('apply_id ')),
    'the ids of the send nobody saw answered are not reported'
  )
  assert.ok(
    out.normalized.some((/** @type {string} */ n) => /home\.hero\.img: leading "\/" cut/.test(n)),
    'the answer says what Tracy corrected'
  )
})

test('an address of this site is cut too, once a read has named its host; another host’s is refused as before', async () => {
  const own = shop()
  await own.call(readHome)
  const out = await own.call(applyHero(`http://shop.test:8080${SHOWN}`))
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(own.applies().at(-1)?.changes['home.hero.img'], TAKEN)
  assert.match(out.normalized.join(' '), /site address cut from the picture path/)

  // No host known yet (nothing read): the address is not guessed at.
  const blind = shop((p) =>
    String(p.changes['home.hero.img']).startsWith('http')
      ? badForm('home.hero.img')
      : { ok: true, written: [] }
  )
  await blind.call({
    action: 'content.contract',
    params: {
      operation: 'apply',
      expected_revision: 'rev-site-1',
      changes: { 'home.hero.img': `http://shop.test${SHOWN}` }
    }
  })
  assert.equal(blind.applies().length, 1)

  const foreign = shop()
  await foreign.call(readHome)
  const refused = await foreign.call(applyHero(`https://cdn.example.com${SHOWN}`))
  assert.equal(refused.ok, false)
  assert.equal(foreign.applies().length, 1, 'not this site’s address: nothing to repair')
  assert.match(refused.next, /no leading "\/" or web address/)
})

test('a refusal for anything but the writing is the model’s — one send, and the next names the way on', async () => {
  const gone = shop(() => ({
    ok: false,
    error: 'contract_failed',
    message: 'Image must already be in the site media library: home.hero.img',
    errors: [
      {
        code: 'SLOT_IMAGE_INVALID',
        message: 'Image must already be in the site media library: home.hero.img',
        field: { slotKey: 'home.hero.img', contentId: 'content_home' },
        severity: 'recoverable'
      }
    ]
  }))
  await gone.call(readHome)
  const out = await gone.call(applyHero(TAKEN))
  assert.equal(out.ok, false)
  assert.equal(gone.applies().length, 1)
  assert.match(
    out.next,
    /no such picture in the library.*media\.upload \{file\}.*media\.draw \{prompt, slot:"home\.hero\.img"\}/
  )
})

test('the repair is one more send and no more: a second refusal is the answer', async () => {
  const stubborn = shop((p) => badForm(...Object.keys(p.changes)))
  await stubborn.call(readHome)
  const out = await stubborn.call(applyHero(SHOWN))
  assert.equal(out.ok, false)
  assert.equal(stubborn.applies().length, 2)
})

// ── INSPECT_FIRST shows the slots' real values on a WordPress site ─────────────────────────────────

test('🔒 INSPECT_FIRST on WordPress shows what the slots hold, not null for every one of them', async () => {
  const { call, applies } = shop()
  const out = await call(applyHero(TAKEN))
  assert.equal(out.code, 'INSPECT_FIRST')
  assert.equal(applies().length, 0, 'nothing was written')
  assert.deepEqual(out.current, { 'home.hero.img': 'wp-content/uploads/2026/09/hero.png' })
  assert.match(out.next, /^current shows what these slots hold now\./)
  assert.ok(out.next.length <= 200)
})

test('INSPECT_FIRST: a key the site does not have shows null and says what null means', async () => {
  const { call } = shop()
  const out = await call({
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'hero.img': TAKEN, 'home.hero.img': TAKEN } }
  })
  assert.equal(out.code, 'INSPECT_FIRST')
  assert.equal(out.current['hero.img'], null)
  assert.equal(out.current['home.hero.img'], 'wp-content/uploads/2026/09/hero.png')
  assert.match(
    out.next,
    /^A null is no slot of this site: use a slotKey content\.read shows, then apply with expected_revision:"rev-site-1"\.$/
  )
  assert.ok(out.next.length <= 200)
})

// ── the refusal's next ─────────────────────────────────────────────────────────────────────────────

/** @param {string} message @param {string | null} platform @param {string} [slotKey] */
const imageNext = (message, platform, slotKey = 'home.hero.img') =>
  refusalNext(
    {
      ok: false,
      error: 'contract_failed',
      message,
      errors: [
        {
          code: 'SLOT_IMAGE_INVALID',
          message,
          field: { slotKey, contentId: 'c' },
          severity: 'recoverable'
        }
      ]
    },
    { platform, sealed: true, action: 'content.contract' }
  ) ?? ''

test('🔒 SLOT_IMAGE_INVALID names the form the slot takes, and that a picture already in the library is fine', () => {
  const next = imageNext
  const form = next('Image must be a png, jpg or webp under wp-content/uploads/: home.hero.img', 'wordpress')
  assert.match(form, /home\.hero\.img takes a library picture: wp-content\/uploads\/<file>/)
  assert.match(form, /no leading "\/" or web address/)
  assert.match(form, /media\.upload the customer's/)
  assert.match(form, /media\.draw \{prompt, slot:"home\.hero\.img"\}/)
  assert.match(next('x', 'joomla', 'module-441.8'), /images\/<file>, no leading "\/"/)
  assert.doesNotMatch(next('x', 'joomla', 'module-441.8'), /wp-content/)
  assert.match(next('x', null), /wp-content\/uploads\/<file> or images\/<file>/)
  assert.match(
    next('Image aspect ratio does not match its slot', 'wordpress'),
    /needs the slot's shape: another library picture/
  )
  assert.match(
    next('Image must already exist in the site media library: module-441.8', 'joomla', 'module-441.8'),
    /no such picture in the library/
  )
  for (const message of [
    'x',
    'Image aspect ratio does not match its slot',
    'Image must already be in the site media library: k'
  ])
    for (const platform of ['wordpress', 'joomla', null])
      assert.ok(next(message, platform).length <= 220, `${platform}: ${next(message, platform)}`)
})

// ── PD-1 (adversarial review of round 7): a customer's own photo of the wrong shape ───────────────────
//
// The Files-tab notice sends "use the picture I uploaded" to `media.upload {file}`, whose receipt puts the
// file in its slot; a customer's file rarely has the slot demo's shape, and the refusal named only another
// library picture or a DRAWN one — so the photo was replaced by an AI picture, unsaid. Nothing crops it.
for (const platform of ['wordpress', 'joomla', null])
  test(`a wrong-shape refusal tells the model the customer's own photo does not fit, to say so and ask, never to draw one unasked: ${platform}`, () => {
    const next = imageNext('Image aspect ratio does not match its slot', platform, 'module-441.8')

    assert.match(next, /another library picture, or media\.draw \{prompt, slot:"module-441\.8"\}/)
    assert.match(next, /customer's own photo does not fit: tell them and ask for another/)
    assert.match(next, /never draw one unasked/)
    assert.ok(next.length <= 220, `${next.length} characters: ${next}`)
  })

// The other two picture refusals do not say it: a path form or a missing picture is not about a photo's shape.
for (const message of [
  'Image must be a png, jpg or webp under wp-content/uploads/: home.hero.img',
  'Image must already exist in the site media library: home.hero.img'
])
  test(`only the wrong-shape refusal speaks of the customer's own photo: ${message.slice(0, 40)}`, () => {
    assert.doesNotMatch(imageNext(message, 'wordpress'), /does not fit|never draw/)
  })
