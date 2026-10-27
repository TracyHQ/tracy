/**
 * 🔒 A PICTURE ID THE MODEL WROTE MUST BE ONE THE LIBRARY HOLDS.
 *
 * v7 cp3 (30/09/2026), EmDash: the model found the right library picture and copied its 26-character id
 * with one character lost into the home entry's `hero_image`. EmDash accepted `{id}` for a picture that
 * does not exist, the entry read `live`, the page showed no picture and the agent said it was done. The door
 * reads the entry before every `content_update` anyway; when a field that held a picture now names another
 * id, one `media_get` says whether the library has it — and only EmDash's own NOT_FOUND refuses.
 *
 * P2 (30/09/2026): what the library vouched for is not asked about again. One picture written into the 40
 * language rows of a page cost 40 `media_get` (12 of 37 s in v7 cp5); the ids `media.draw`, `media.upload`,
 * `media.scan` and `media_list` hand out are the library's own, so asking it about them is the same answer.
 * Only ids the library returned are kept, so a mistyped id is still refused.
 *
 *   node --test packages/tools/tracy-site-tools/test/emdash-media-ref.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { writtenPictureIds } from '../src/host/media-emdash.mjs'
import { A, answer, createEmdashState, failed, fakeSite, runDoor, SITE } from './emdash-door-fixture.mjs'
import { emdashHost } from './emdash-host-fixture.mjs'

const HOME = A.homeGet.item
const HERO = HOME.data.hero_image.id
const ABOUT = HOME.data.about_image
/** The hero id with the last character lost, as the model copied it. */
const TYPO = HERO.slice(0, -1)
/** @param {Record<string, unknown>} data */
const write = (data) => ({
  tool: 'content_update',
  arguments: { collection: 'home', id: HOME.id, data }
})

test('a picture id the library does not hold is refused before anything is written', async () => {
  const site = fakeSite({
    on: { media_get: () => failed(`[NOT_FOUND] Media not found: ${TYPO}`) }
  })
  const out = await runDoor(site, write({ hero_image: { id: TYPO } }))

  assert.equal(out.ok, false)
  assert.equal(out.code, 'MEDIA_NOT_FOUND')
  assert.match(out.error, new RegExp(`hero_image names picture ${TYPO}`))
  assert.match(out.next, /media\.scan/)
  assert.ok(out.error.length <= 160 && out.next.length <= 200, JSON.stringify(out))
  assert.equal(site.names().includes('content_update'), false, 'nothing reached the site')
  assert.deepEqual(
    site.calls
      .filter((c) => 'name' in c && c.name === 'media_get')
      .map((c) => /** @type {any} */ (c).arguments),
    [{ id: TYPO }]
  )
})

test('an id the library holds goes through, after one media_get', async () => {
  const OTHER = '01M36TAHP97FVD437HD71WGCCG'
  const site = fakeSite({
    on: { media_get: (args) => answer({ item: { id: args.id, mimeType: 'image/png' } }) }
  })
  const out = await runDoor(site, write({ hero_image: { id: OTHER } }))

  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.names().filter((n) => n === 'media_get').length, 1)
  assert.equal(site.names().filter((n) => n === 'content_update').length, 1)
})

test('nothing is checked when no picture changes: the same id, another kind of field, or no picture field at all', async () => {
  const same = fakeSite()
  assert.equal((await runDoor(same, write({ about_image: { id: ABOUT.id } }))).ok, true)
  assert.equal(same.names().includes('media_get'), false, 'the stored id again')

  const text = fakeSite()
  assert.equal((await runDoor(text, write({ title: 'Home' }))).ok, true)
  assert.equal(text.names().includes('media_get'), false, 'a plain field')

  // a field whose stored value is an object without a provider (a reference, a list item) is not a picture
  const entry = { ...HOME, data: { ...HOME.data, related: { id: '01M36TA83763RSVSN5R28DZ0B1' } } }
  const seen = fakeSite({ on: { content_get: () => answer({ ...A.homeGet, item: entry }) } })
  assert.equal((await runDoor(seen, write({ related: { id: '01M36TA83763RSVSN5R28DZ0B2' } }))).ok, true)
  assert.equal(seen.names().includes('media_get'), false, 'an entry reference')
})

test('a media_get that failed for another reason says nothing about the picture: the write goes on', async () => {
  const site = fakeSite({ on: { media_get: () => failed('fetch failed') } })
  const out = await runDoor(site, write({ hero_image: { id: TYPO } }))

  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.names().filter((n) => n === 'content_update').length, 1)
})

test('writtenPictureIds: only fields that held a picture (id and provider) and now name another id', () => {
  const stored = {
    hero: { id: 'AAA', provider: 'local' },
    ref: { id: 'REF' },
    title: 'x',
    same: { id: 'SAME', provider: 'local' }
  }
  assert.deepEqual(
    writtenPictureIds(
      {
        hero: { id: 'BBB' },
        ref: { id: 'OTHER' },
        title: 'y',
        same: { id: 'SAME' },
        fresh: { id: 'NEW' },
        s: 'str'
      },
      stored
    ),
    [{ field: 'hero', id: 'BBB' }]
  )
  assert.deepEqual(writtenPictureIds({}, stored), [])
  assert.deepEqual(writtenPictureIds({ hero: null }, stored), [])
})

// ── P2: what the library vouched for is not asked about again ────────────────────────────────────────

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** @param {number} n - n distinct ULIDs: the ids of the language rows of one page. */
const rowIds = (n) =>
  Array.from({ length: n }, (_, i) => `01${'W'.repeat(22)}${B32[Math.floor(i / 32)]}${B32[i % 32]}`)
/** The entry `args.id` names: the recorded home page, wearing its hero picture, under that row's id. */
const rowGet = (/** @type {any} */ args) => answer({ ...A.homeGet, item: { ...HOME, id: args.id } })
/** One row's write of a picture into its hero. */
const heroInto = (/** @type {string} */ rowId, /** @type {string} */ picture) => ({
  tool: 'content_update',
  arguments: { collection: 'home', id: rowId, data: { hero_image: { id: picture } } }
})
/** How many times the fake site was asked `tool`. */
const asked = (/** @type {ReturnType<typeof fakeSite>} */ site, /** @type {string} */ tool) =>
  site.names().filter((n) => n === tool).length

/** The picture the library holds in these tests, and the one an upload adds. */
const LIBRARY_ID = '01M36TAHP97FVD437HD71WGCCG'
const UPLOADED_ID = '01M36TAHP97FVD437HD71WGCCH'

/** A library the fake site answers from: EmDash's own NOT_FOUND for an id it does not hold. */
function library(/** @type {string[]} */ ids = [LIBRARY_ID]) {
  const held = new Set(ids)
  return {
    held,
    on: {
      content_get: rowGet,
      media_get: (/** @type {any} */ args) =>
        held.has(args.id)
          ? answer({ item: { id: args.id, mimeType: 'image/png' } })
          : failed(`[NOT_FOUND] Media not found: ${args.id}`),
      media_list: () => answer({ items: [...held].map((id) => ({ id, mimeType: 'image/png' })) }),
      media_upload: () => {
        held.add(UPLOADED_ID)
        return answer({ item: { id: UPLOADED_ID, url: `/_emdash/api/media/file/${UPLOADED_ID}.png` } })
      },
      media_update: (/** @type {any} */ args) => answer({ item: { id: args.id, alt: args.alt } }),
      media_delete: (/** @type {any} */ args) => {
        held.delete(args.id)
        return answer({ deleted: true, id: args.id })
      }
    }
  }
}
const UPLOAD = {
  tool: 'media_upload',
  arguments: { filename: 'photo.png', contentType: 'image/png', base64: 'iVBORw0KGgo=' }
}

test('P2: one picture written into 40 language rows is checked once, and every row is written', async () => {
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  for (const id of rowIds(40)) {
    const out = await runDoor(site, heroInto(id, LIBRARY_ID), { state })
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  }
  assert.equal(asked(site, 'media_get'), 1)
  assert.equal(asked(site, 'content_update'), 40)
})

test('P2: the same picture named by two fields of one write is checked once', async () => {
  const site = fakeSite({
    on: {
      ...library().on,
      content_get: () =>
        answer({
          ...A.homeGet,
          item: {
            ...HOME,
            data: { ...HOME.data, og_image: { id: HERO, provider: 'local', width: 1200, height: 630 } }
          }
        })
    }
  })
  const out = await runDoor(site, {
    tool: 'content_update',
    arguments: {
      collection: 'home',
      id: HOME.id,
      data: { hero_image: { id: LIBRARY_ID }, og_image: { id: LIBRARY_ID } }
    }
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(asked(site, 'media_get'), 1)
})

test('P2: an id media.draw or media.upload returned (a media_upload through the door) is not asked about', async () => {
  const [row] = rowIds(1)
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  const up = await runDoor(site, UPLOAD, { state })
  assert.equal(up.ok, true, JSON.stringify(up).slice(0, 300))
  const out = await runDoor(site, heroInto(row, UPLOADED_ID), { state })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(asked(site, 'media_get'), 0, 'the upload handed the id out')
  assert.equal(asked(site, 'content_update'), 1)
})

test('P2: an id media.scan read (a media_list, or a media_get of one id) is not asked about again', async () => {
  const [a, b] = rowIds(2)
  const other = '01M36TAHP97FVD437HD71WGCCJ'
  const listing = fakeSite({ on: library([LIBRARY_ID, other]).on })
  const state = createEmdashState()
  await runDoor(listing, { tool: 'media_list', arguments: { mimeType: 'image/', limit: 20 } }, { state })
  assert.equal((await runDoor(listing, heroInto(a, LIBRARY_ID), { state })).ok, true)
  assert.equal((await runDoor(listing, heroInto(b, other), { state })).ok, true)
  assert.equal(asked(listing, 'media_get'), 0, 'both ids came in the listing')

  const single = fakeSite({ on: library().on })
  const own = createEmdashState()
  await runDoor(single, { tool: 'media_get', arguments: { id: LIBRARY_ID } }, { state: own })
  assert.equal((await runDoor(single, heroInto(a, LIBRARY_ID), { state: own })).ok, true)
  assert.equal(asked(single, 'media_get'), 1, 'the scan of that one id was the only read')
})

test("P2: the `item` of a media_create and a row answered flat are the library's own ids too — an answer with no id keeps none", async () => {
  const CREATED_ID = '01M36TAHP97FVD437HD71WGCCK'
  const FLAT_ID = '01M36TAHP97FVD437HD71WGCCM'
  const [a, b, c] = rowIds(3)
  const site = fakeSite({
    on: {
      ...library().on,
      media_create: () => answer({ item: { id: CREATED_ID, mimeType: 'image/png' } }),
      media_upload: () => answer({ id: FLAT_ID, url: `/_emdash/api/media/file/${FLAT_ID}.png` }),
      media_update: () => answer({ ok: true })
    }
  })
  const state = createEmdashState()
  await runDoor(site, { tool: 'media_create', arguments: { storageKey: 'uploads/photo.png' } }, { state })
  assert.equal((await runDoor(site, heroInto(a, CREATED_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 0, "the create's `item`")

  await runDoor(site, UPLOAD, { state })
  assert.equal((await runDoor(site, heroInto(b, FLAT_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 0, 'a row with no `item` around it')

  // A write that answers no id empties the memo and vouches for nothing: the library is asked again.
  await runDoor(site, { tool: 'media_update', arguments: { id: FLAT_ID, alt: 'A photo' } }, { state })
  assert.equal((await runDoor(site, heroInto(c, LIBRARY_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 1)
  assert.equal(state.mediaKnown(SITE.label, 'session-a', FLAT_ID), false, 'the answer named no id')
})

test('P2: an id one character short is still refused after the full id was vouched for, and a refused id is never kept', async () => {
  const [a, b, c] = rowIds(3)
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  assert.equal((await runDoor(site, heroInto(a, LIBRARY_ID), { state })).ok, true)
  const short = LIBRARY_ID.slice(0, -1)
  for (const row of [b, c]) {
    const out = await runDoor(site, heroInto(row, short), { state })
    assert.equal(out.ok, false)
    assert.equal(out.code, 'MEDIA_NOT_FOUND', row)
    assert.match(out.error, new RegExp(`hero_image names picture ${short}`))
  }
  assert.equal(asked(site, 'content_update'), 1, 'only the row with the real id was written')
  assert.equal(asked(site, 'media_get'), 3, 'the real id once, the short one each time it came')
})

test('P2: a media_get that failed for another reason is not kept: the next row asks again', async () => {
  const site = fakeSite({ on: { content_get: rowGet, media_get: () => failed('fetch failed') } })
  const state = createEmdashState()
  for (const id of rowIds(2))
    assert.equal((await runDoor(site, heroInto(id, LIBRARY_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 2)
})

/**
 * A conversation of one turn, and a `media_delete` of `LIBRARY_ID` the customer agreed to: `deleteAgreed()`
 * asks (the card), plays the customer's yes and makes the confirmed call, and returns that call's answer.
 * @param {ReturnType<typeof fakeSite>} site
 */
function agreedDelete(site) {
  const state = createEmdashState()
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const extra = { state, memory, turn: memory.turnOf('session-a') }
  const del = { tool: 'media_delete', arguments: { id: LIBRARY_ID } }
  const deleteAgreed = async () => {
    const card = await runDoor(site, del, extra)
    assert.equal(card.code, 'CONFIRM_FIRST')
    const [q] = card.ask.questions
    memory.customerAnswered('session-a', card.ask, {
      answers: [{ id: q.id, selected: [q.options[0].label] }]
    })
    return runDoor(site, { ...del, confirm: true }, extra)
  }
  return { extra, deleteAgreed }
}

test('P2: a media delete empties the memo — the picture is asked about again, and refused once it is gone', async () => {
  const lib = library()
  const site = fakeSite({ on: lib.on })
  const { extra, deleteAgreed } = agreedDelete(site)
  const [a, b] = rowIds(2)
  assert.equal((await runDoor(site, heroInto(a, LIBRARY_ID), extra)).ok, true)
  assert.equal(asked(site, 'media_get'), 1)

  assert.equal((await deleteAgreed()).ok, true)
  assert.equal(lib.held.has(LIBRARY_ID), false)

  const after = await runDoor(site, heroInto(b, LIBRARY_ID), extra)
  assert.equal(after.code, 'MEDIA_NOT_FOUND', 'the picture is gone: no memo may vouch for it')
  assert.equal(asked(site, 'media_get'), 2)
})

// A media write empties the memo whatever came back, because what came back does not say what happened:
// a write whose answer was lost may have landed. These two are the cases an ok-only reading would break.
test('P2: a media delete whose answer was lost may have landed — the memo is emptied, and the picture refused once it is gone', async () => {
  const lib = library()
  // The site removes the picture, and the answer never makes it back: the exec timed out.
  lib.on.media_delete = (/** @type {any} */ args) => {
    lib.held.delete(args.id)
    return { ok: false, code: 'SITE_UNREACHABLE', error: 'exec timed out' }
  }
  const site = fakeSite({ on: lib.on })
  const { extra, deleteAgreed } = agreedDelete(site)
  const [a, b] = rowIds(2)
  assert.equal((await runDoor(site, heroInto(a, LIBRARY_ID), extra)).ok, true)
  assert.equal(asked(site, 'media_get'), 1)

  const lost = await deleteAgreed()
  assert.equal(lost.ok, false)
  assert.equal(lost.code, 'SITE_UNREACHABLE')
  assert.equal(lib.held.has(LIBRARY_ID), false, 'it landed, though nothing said so')

  const after = await runDoor(site, heroInto(b, LIBRARY_ID), extra)
  assert.equal(after.code, 'MEDIA_NOT_FOUND', 'no memo may vouch for a picture a lost answer left gone')
  assert.equal(asked(site, 'media_get'), 2)
  assert.equal(asked(site, 'content_update'), 1, 'only the row written before the delete')
})

test('P2: a media delete the site refused empties the memo too — nothing is taken to be still there', async () => {
  const lib = library()
  lib.on.media_delete = () => failed('[FORBIDDEN] media:delete needs the admin scope')
  const site = fakeSite({ on: lib.on })
  const { extra, deleteAgreed } = agreedDelete(site)
  const [a, b] = rowIds(2)
  assert.equal((await runDoor(site, heroInto(a, LIBRARY_ID), extra)).ok, true)
  assert.equal(asked(site, 'media_get'), 1)

  const refused = await deleteAgreed()
  assert.equal(refused.ok, false)
  assert.equal(lib.held.has(LIBRARY_ID), true, 'the picture is still there')

  assert.equal((await runDoor(site, heroInto(b, LIBRARY_ID), extra)).ok, true)
  assert.equal(asked(site, 'media_get'), 2, 'asked again, though the write was refused')
})

test('P2: any media write empties the memo and hands back only its own id', async () => {
  const [a, b, c] = rowIds(3)
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  assert.equal((await runDoor(site, heroInto(a, LIBRARY_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 1)
  assert.equal((await runDoor(site, UPLOAD, { state })).ok, true)
  assert.equal((await runDoor(site, heroInto(b, UPLOADED_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 1, 'the upload vouched for its own id')
  assert.equal((await runDoor(site, heroInto(c, LIBRARY_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 2, 'the one it emptied is asked about again')
  // A metadata update is a media write too: what was vouched for is asked about again, but the row it answered is kept.
  const update = { tool: 'media_update', arguments: { id: UPLOADED_ID, alt: 'A photo' } }
  assert.equal((await runDoor(site, update, { state })).ok, true)
  const [d, e] = rowIds(5).slice(3)
  assert.equal((await runDoor(site, heroInto(d, UPLOADED_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 2, "the updated row is the library's own answer")
  assert.equal((await runDoor(site, heroInto(e, LIBRARY_ID), { state })).ok, true)
  assert.equal(asked(site, 'media_get'), 3)
})

test('P2: the memo is per site and per conversation, and never kept without a conversation', async () => {
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  const [a, b, c, d, e, f] = rowIds(6)
  await runDoor(site, heroInto(a, LIBRARY_ID), { state })
  await runDoor(site, heroInto(b, LIBRARY_ID), { state })
  assert.equal(asked(site, 'media_get'), 1, 'the same site and conversation share it')
  await runDoor(site, heroInto(c, LIBRARY_ID), { state, site: { label: 'other-site' } })
  assert.equal(asked(site, 'media_get'), 2, 'another site does not')
  await runDoor(site, heroInto(d, LIBRARY_ID), { state, sessionId: 'session-b' })
  assert.equal(asked(site, 'media_get'), 3, 'another conversation does not')
  await runDoor(site, heroInto(e, LIBRARY_ID), { state, sessionId: null })
  await runDoor(site, heroInto(f, LIBRARY_ID), { state, sessionId: null })
  assert.equal(asked(site, 'media_get'), 5, 'with no conversation nothing is kept')
})

test('P2: an id is asked about again once the library last vouched for it more than ten minutes ago', async () => {
  let t = 1_000
  const site = fakeSite({ on: library().on })
  const state = createEmdashState({ now: () => t })
  const [a, b, c] = rowIds(3)
  await runDoor(site, heroInto(a, LIBRARY_ID), { state })
  t += 10 * 60_000
  await runDoor(site, heroInto(b, LIBRARY_ID), { state })
  assert.equal(asked(site, 'media_get'), 1, 'exactly ten minutes on: still vouched for')
  t += 1
  await runDoor(site, heroInto(c, LIBRARY_ID), { state })
  assert.equal(asked(site, 'media_get'), 2)
})

// The scoping `dropMedia` offers the host; the host's own two calls of it are pinned at the end of this file.
test("P2: dropMedia empties one site's memo — that site only", async () => {
  const site = fakeSite({ on: library().on })
  const state = createEmdashState()
  const [a, b, c, d] = rowIds(4)
  await runDoor(site, heroInto(a, LIBRARY_ID), { state })
  await runDoor(site, heroInto(b, LIBRARY_ID), { state, site: { label: 'other-site' } })
  assert.equal(asked(site, 'media_get'), 2)
  state.dropMedia(SITE.label)
  await runDoor(site, heroInto(c, LIBRARY_ID), { state })
  assert.equal(asked(site, 'media_get'), 3, 'the site that was dropped asks again')
  await runDoor(site, heroInto(d, LIBRARY_ID), { state, site: { label: 'other-site' } })
  assert.equal(asked(site, 'media_get'), 3, 'the other site keeps what it had')
})

test('P2: a conversation remembers at most 200 picture ids for a site, the oldest go first', () => {
  const state = createEmdashState()
  state.rememberMedia(
    'site-x',
    'session-a',
    Array.from({ length: 250 }, (_, i) => `id-${i}`)
  )
  assert.equal(state.mediaKnown('site-x', 'session-a', 'id-0'), false)
  assert.equal(state.mediaKnown('site-x', 'session-a', 'id-49'), false)
  assert.equal(state.mediaKnown('site-x', 'session-a', 'id-50'), true)
  assert.equal(state.mediaKnown('site-x', 'session-a', 'id-249'), true)
  assert.equal(state.mediaKnown('site-x', null, 'id-249'), false, 'no conversation: nothing is vouched for')
})

/** A PNG header 1200×800: enough for `media.upload` to read the size. */
const PICTURE = (() => {
  const b = Buffer.alloc(40)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(1200, 16)
  b.writeUInt32BE(800, 20)
  return b
})()

// Through the shipped tools: `tracy_site media.upload` and `tracy_emdash` are two doors of one conversation
// sharing one state, and a slip in that wiring (another session, another label) would leave the pieces above green.
test('through the shipped tools: the id media.upload returned is not asked about when the entry is written', async () => {
  const url = `/_emdash/api/media/file/${UPLOADED_ID}.png`
  const host = emdashHost({
    on: (name, args) =>
      name === 'media_upload'
        ? { item: { id: UPLOADED_ID, url } }
        : name === 'media_get'
          ? { isError: true, text: `[NOT_FOUND] Media not found: ${args.id}` }
          : name === 'content_get'
            ? A.homeGet
            : name === 'content_update'
              ? A.homeStagedUpdate
              : { ok: true }
  })
  writeFileSync(path.join(host.cwd, 'logo.png'), PICTURE)
  const up = await host.site({ action: 'media.upload', params: { file: 'logo.png' } })
  assert.equal(up.ok, true, JSON.stringify(up).slice(0, 300))
  assert.equal(up.id, UPLOADED_ID)

  const done = await host.run(heroInto(HOME.id, up.id))
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.equal(host.calls.filter((c) => c.name === 'media_get').length, 0, 'the upload handed the id out')
  assert.equal(host.calls.filter((c) => c.name === 'content_update').length, 1)

  // An id the upload did not hand out is still asked about, and still refused when the library has none.
  const short = await host.run(heroInto(HOME.id, UPLOADED_ID.slice(0, -1)))
  assert.equal(short.ok, false)
  assert.equal(short.code, 'MEDIA_NOT_FOUND')
  assert.equal(host.calls.filter((c) => c.name === 'media_get').length, 1)
})

// ── the host's own two calls of `dropMedia` ───────────────────────────────────────────────────────────
//
// A build writes the site behind the memo: a rebuilt site holds other pictures, and an id the library
// vouched for before it may be gone. The host empties the memo in two places — the `tools/result` of a
// `tracy_site_build_*`, and the `agent/pre-step` that sees the build's state notice change — and neither
// is reachable from `runEmdashTool`, so each is driven here through the host's own listeners. A line
// lost from either leaves the memo vouching for gone ids, up to ten minutes, with every test above green.

/** A host whose library holds any id it is asked about, and whose home page reads as the row named. */
function libraryHost() {
  return emdashHost({
    on: (name, args) =>
      name === 'media_get'
        ? { item: { id: args.id, mimeType: 'image/png' } }
        : name === 'content_get'
          ? { ...A.homeGet, item: { ...HOME, id: args.id } }
          : name === 'content_update'
            ? A.homeStagedUpdate
            : { ok: true }
  })
}
/** How many times the host's site was asked about a picture. */
const libraryReads = (/** @type {ReturnType<typeof emdashHost>} */ host) =>
  host.calls.filter((c) => c.name === 'media_get').length

/** The host's own `tools/result` listeners, told that `name` finished in the host's conversation. */
function toolFinished(/** @type {ReturnType<typeof emdashHost>} */ host, /** @type {string} */ name) {
  for (const fn of host.listeners.get('tools/result') ?? [])
    fn(
      { name, arguments: {}, agent: { session: { id: 'session-x', header: { cwd: host.cwd } } } },
      { isError: false }
    )
}

test('through the shipped host: a finished site build empties the memo — another tool finishing does not', async () => {
  const host = libraryHost()
  const [a, b, c, d] = rowIds(4)
  assert.equal((await host.run(heroInto(a, LIBRARY_ID))).ok, true)
  assert.equal((await host.run(heroInto(b, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 1, 'one picture in two rows: one read')

  toolFinished(host, 'bash')
  toolFinished(host, 'tracy_site')
  assert.equal((await host.run(heroInto(c, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 1, 'no build finished: the memo stands')

  toolFinished(host, 'tracy_site_build_emdash')
  assert.equal((await host.run(heroInto(d, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 2, 'the build may have replaced the picture: the library is asked again')
})

/** The four stages of the build pipeline, `at` of them done and the next one running. */
const stagesAt = (/** @type {number} */ at) =>
  ['check', 'install', 'seed', 'copy'].map((name, i) => ({
    name,
    status: i < at ? 'done' : i === at ? 'running' : 'pending'
  }))

/** Files the host's site with a running build job at stage `at`, where `siteContext` reads it. */
function buildAt(/** @type {ReturnType<typeof emdashHost>} */ host, /** @type {number} */ at) {
  const filed = path.join(host.cwd, 'docs', 'agents', 'build', 'sites')
  mkdirSync(filed, { recursive: true })
  writeFileSync(
    path.join(filed, `${path.basename(host.cwd)}.json`),
    JSON.stringify({ job: 'build-one', status: 'running', stages: stagesAt(at) })
  )
}

/** The agent `agent/pre-step` hands over: its session log is `events`, all of it visible. */
const stepAgent = (/** @type {string} */ cwd, /** @type {any[]} */ events) => ({
  id: 'session-x',
  session: {
    id: 'session-x',
    header: { cwd },
    seq: events.length,
    eventAt: (/** @type {number} */ seq) => events[seq],
    surface: { nodes: events.map((_, seq) => seq) }
  }
})

/** Messages a step sent, written back as the session log events a later step reads. */
const asEvents = (/** @type {any[]} */ sent) =>
  sent.map((message, seq) => ({
    type: 'user/message',
    seq,
    data: { source: message.source, content: message.content }
  }))

/**
 * One `agent/pre-step` of the host's conversation that claims a customer message; returns the notices the
 * step added besides it.
 * @param {ReturnType<typeof emdashHost>} host @param {any[]} events @param {string} text
 */
async function step(host, events, text) {
  const [hook] = host.listeners.get('agent/pre-step') ?? []
  const message = { id: 'm', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
  const decision = await hook({ agent: stepAgent(host.cwd, events), messages: [message] }, async () => ({
    kind: 'enter',
    messages: [message]
  }))
  return decision.messages.filter((/** @type {any} */ m) => m !== message)
}
const saysBuild = (/** @type {any[]} */ sent) =>
  sent.some((m) => m.source.producer === 'tracy-site-tools:site-state')

test('through the shipped host: the build moving on empties the memo — the build first being said, or said again unchanged, does not', async () => {
  const host = libraryHost()
  const [a, b, c, d] = rowIds(4)
  buildAt(host, 1)
  assert.equal((await host.run(heroInto(a, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 1)

  // The first step of a conversation says the build's state for the first time: nothing moved.
  const first = await step(host, [], 'change the hero picture')
  assert.equal(saysBuild(first), true)
  assert.equal((await host.run(heroInto(b, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 1, 'said for the first time is not a change: the memo stands')

  // The same state on the next step is not said again.
  const same = await step(host, asEvents(first), 'and again')
  assert.equal(saysBuild(same), false)
  assert.equal((await host.run(heroInto(c, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 1)

  // The build moves on: its notice goes out again, and with it the memo is emptied.
  buildAt(host, 2)
  const moved = await step(host, asEvents(first), 'and now')
  assert.equal(saysBuild(moved), true)
  assert.equal((await host.run(heroInto(d, LIBRARY_ID))).ok, true)
  assert.equal(libraryReads(host), 2, 'the build may have replaced the picture: the library is asked again')
})
