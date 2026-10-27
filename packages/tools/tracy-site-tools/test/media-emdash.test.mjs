// media.scan on EmDash (v6 L2-01, L4-01): the library through media_list, one picture copied where
// read_image opens it. Fence: only the storage key and a file under docs/agents/look/ are named.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { MEDIA_COPY_SCRIPT, containerMediaFile, mediaCopyArgv, parseMediaCopy } from '../src/host/exec.mjs'
import { emdashMediaScan, measureReplaced, pictureRow, planScan } from '../src/host/media-emdash.mjs'

const ROW = {
  id: '01M3GF56T5C7QY3D3D9CJDFRKC',
  filename: 'elektra.png',
  mimeType: 'image/png',
  width: 320,
  height: 120,
  alt: '',
  storageKey: '01M3GF56T5K3S92ZRJFQKWZFPE.01M3GF56T7DEH9V3AAPYRVEB07.png'
}

test('scan lists the library rows with an id, size, alt and the file url; the storage key stays inside', async () => {
  const calls = []
  const out = await emdashMediaScan({
    params: { limit: 500 },
    label: 'x',
    call: async (tool, args) => {
      calls.push([tool, args])
      return { ok: true, result: { items: [ROW], nextCursor: 'c' } }
    },
    copy: async () => assert.fail('a list copies nothing'),
    seen: async () => assert.fail('a list looks at nothing')
  })
  assert.deepEqual(calls, [['media_list', { mimeType: 'image/', limit: 100 }]])
  assert.equal(out.ok, true)
  assert.equal(out.platform, 'emdash')
  assert.equal(out.scanned, 1)
  assert.equal(out.more, true)
  assert.equal(out.media[0].id, ROW.id)
  assert.equal(out.media[0].url, `/_emdash/api/media/file/${ROW.storageKey}`)
  assert.equal('storageKey' in out.media[0], false)
  assert.match(out.next, /media\.scan \{id\}/)
})

test('scan {id} copies the picture into docs/agents/look and hands it over', async () => {
  let copied = null
  const out = await emdashMediaScan({
    params: { id: ROW.id },
    label: 'x',
    now: () => 7,
    call: async (tool) =>
      tool === 'media_get' ? { ok: true, result: { item: ROW } } : assert.fail(`unexpected ${tool}`),
    copy: async (input) => {
      copied = input
      return { ok: true, file: '/site/x/docs/agents/look/f.png', bytes: 9, mediaType: 'image/png' }
    },
    seen: async (shot) => ({ picture: { id: 'a' }, next: `seen ${shot.mediaType}` })
  })
  assert.deepEqual(copied, { storageKey: ROW.storageKey, name: `media-${ROW.id}-7.png` })
  assert.equal(out.ok, true)
  assert.equal(out.file, '/site/x/docs/agents/look/f.png')
  assert.equal(out.next, 'seen image/png')
  assert.equal(out.filename, 'elektra.png')
})

test('a copy that fails says so and forbids an alt written unseen; a non-picture is refused', async () => {
  const failing = await emdashMediaScan({
    params: { id: ROW.id },
    label: 'x',
    call: async () => ({ ok: true, result: { item: ROW } }),
    copy: async () => ({ ok: false, error: 'HTTP 404' }),
    seen: async () => ({})
  })
  assert.equal(failing.code, 'MEDIA_COPY_FAILED')
  assert.match(failing.next, /not write an alt you have not seen/)
  const pdf = await emdashMediaScan({
    params: { id: ROW.id },
    label: 'x',
    call: async () => ({ ok: true, result: { item: { ...ROW, mimeType: 'application/pdf' } } }),
    copy: async () => assert.fail('nothing copied'),
    seen: async () => ({})
  })
  assert.equal(pdf.code, 'NOT_A_PICTURE')
})

test('a bad id or a hostile storage key never reaches a path', () => {
  assert.equal(planScan({ id: '../etc/passwd' }).ok, false)
  assert.equal(pictureRow({ ...ROW, storageKey: '../../x' }).storageKey, null)
  assert.equal(pictureRow({ ...ROW, storageKey: 'a/b.png' }).url, null)
})

test('the copy script refuses a key or a destination outside its fence, before any request', () => {
  const run = (key, file) =>
    spawnSync(process.execPath, ['-e', MEDIA_COPY_SCRIPT, key, file], { encoding: 'utf8', timeout: 5000 })
      .stdout
  const good = '/site/lab-1/docs/agents/look/media-x.png'
  assert.match(run('../x.png', good), /TRACY_MEDIA_ERR bad request/)
  assert.match(run('a..b.png', good), /TRACY_MEDIA_ERR bad request/)
  assert.match(run('k.png', '/site/lab-1/docs/agents/../../x.png'), /TRACY_MEDIA_ERR bad request/)
  assert.match(run('k.png', '/etc/cron.d/x'), /TRACY_MEDIA_ERR bad request/)
  assert.match(run('k.png', '/site/lab-1/docs/agents/look/sub/x.png'), /TRACY_MEDIA_ERR bad request/)
  assert.deepEqual(mediaCopyArgv({ container: 'c', storageKey: 'k.png', file: good }).slice(0, 4), [
    'exec',
    '-u',
    'www-data',
    'c'
  ])
  assert.equal(containerMediaFile('lab-1', 'a.png'), '/site/lab-1/docs/agents/look/a.png')
})

test('the copy answer is parsed strictly', () => {
  assert.deepEqual(parseMediaCopy('TRACY_MEDIA OK 12 image/webp'), {
    ok: true,
    bytes: 12,
    mediaType: 'image/webp'
  })
  assert.equal(parseMediaCopy('TRACY_MEDIA_ERR HTTP 404').ok, false)
  assert.equal(parseMediaCopy('').ok, false)
})

// ── media.draw {replaces}: the stored size of the picture an entry field holds (v7 EmDash picks) ──────
//
// Neutral fixtures: a `gallery` entry whose `cover` holds a picture of 1000×880, and a list of items each
// with a `photo`. The answers are what `runEmdashTool` gives for `content_get` and `media_get`.

const ENTRY = 'gallery'
const at = (field, extra = {}) => ({ collection: ENTRY, id: '01ENTRYAAAAAAAAAAAAAAAAAAA', field, ...extra })
/** A `tracy_emdash` road answering from a table, and recording what was asked. */
const road = (entry, library = {}) => {
  const asked = []
  const call = async (tool, args) => {
    asked.push([tool, args])
    if (tool === 'content_get')
      return entry === null
        ? { ok: false, code: 'EMDASH_REFUSED', error: '[NOT_FOUND] no such entry' }
        : { ok: true, result: { item: { id: args.id, data: entry } } }
    if (tool === 'media_get')
      return library[args.id]
        ? { ok: true, result: { item: library[args.id] } }
        : { ok: false, code: 'EMDASH_REFUSED', error: '[NOT_FOUND] no such media' }
    return assert.fail(`unexpected ${tool}`)
  }
  return { call, asked }
}

test('measureReplaced: the size the entry itself holds, read with one content_get and nothing else', async () => {
  const { call, asked } = road({
    cover: { id: '01MEDIACOVERAAAAAAAAAAAAA', provider: 'local', width: 1000, height: 880, alt: 'x' }
  })
  const got = await measureReplaced({ replaces: at('cover'), call })
  assert.deepEqual(got, { ok: true, width: 1000, height: 880, id: '01MEDIACOVERAAAAAAAAAAAAA' })
  assert.deepEqual(asked, [['content_get', { collection: ENTRY, id: '01ENTRYAAAAAAAAAAAAAAAAAAA' }]])
})

test('measureReplaced: a bare media id, or an item cached without its size, is read from the library; a locale is passed on', async () => {
  const library = {
    '01MEDIAB': { id: '01MEDIAB', width: 1600, height: 1000, filename: 'b.png', mimeType: 'image/png' }
  }
  const bare = road({ cover: '01MEDIAB' }, library)
  assert.deepEqual(await measureReplaced({ replaces: at('cover', { locale: 'fr' }), call: bare.call }), {
    ok: true,
    width: 1600,
    height: 1000,
    id: '01MEDIAB'
  })
  assert.deepEqual(bare.asked, [
    ['content_get', { collection: ENTRY, id: '01ENTRYAAAAAAAAAAAAAAAAAAA', locale: 'fr' }],
    ['media_get', { id: '01MEDIAB' }]
  ])
  const cached = road({ cover: { id: '01MEDIAB', provider: 'local' } }, library)
  assert.equal((await measureReplaced({ replaces: at('cover'), call: cached.call })).width, 1600)
})

test('measureReplaced: a picture inside a list is reached by its position', async () => {
  const { call } = road({
    items: [
      { title: 'a', photo: { id: '01MEDIAONE', width: 640, height: 480 } },
      { title: 'b', photo: { id: '01MEDIATWO', width: 300, height: 900 } }
    ]
  })
  const got = await measureReplaced({ replaces: at('items.1.photo'), call })
  assert.equal(got.ok, true)
  assert.equal(got.width, 300)
  assert.equal(got.height, 900)
})

test('measureReplaced: a road that throws is a refusal with its way on, not an exception', async () => {
  const got = await measureReplaced({
    replaces: at('cover'),
    call: async () => {
      throw new Error('the site container is gone')
    }
  })
  assert.equal(got.ok, false)
  assert.equal(got.code, 'REPLACES_NOT_FOUND')
  assert.match(got.next, /aspect:"<w>:<h>"/)
})

test('measureReplaced: every way it cannot measure is a readable refusal that names aspect as the way on', async () => {
  /** @param {any} got @param {string} code @param {RegExp} error */
  const refused = (got, code, error) => {
    assert.equal(got.ok, false)
    assert.equal(got.code, code)
    assert.match(got.error, error)
    assert.match(got.next, /aspect:"<w>:<h>"/)
    // T10: an error is at most 160 characters and a next at most 200.
    assert.ok(got.error.length <= 160, got.error)
    assert.ok(got.next.length <= 200, got.next)
  }
  // The entry cannot be read.
  refused(
    await measureReplaced({ replaces: at('cover'), call: road(null).call }),
    'REPLACES_NOT_FOUND',
    /content_get read no entry gallery\/01ENTRY/
  )
  // The field holds nothing, or something that is not a picture.
  refused(
    await measureReplaced({ replaces: at('cover'), call: road({ title: 'x' }).call }),
    'REPLACES_NO_PICTURE',
    /cover of gallery\/\S+ holds nothing/
  )
  refused(
    await measureReplaced({ replaces: at('title'), call: road({ title: 'not a picture at all' }).call }),
    'REPLACES_NO_PICTURE',
    /title of gallery\/\S+ is not a picture/
  )
  // An unknown media id: the library has no such row.
  const unknown = await measureReplaced({ replaces: at('cover'), call: road({ cover: '01MISSING' }).call })
  refused(unknown, 'REPLACES_NO_PICTURE', /media 01MISSING, the picture in cover, is not in the library/)
  assert.match(unknown.next, /media\.scan lists the pictures/)
  // A library row that knows no size.
  refused(
    await measureReplaced({
      replaces: at('cover'),
      call: road({ cover: '01NOSIZE' }, { '01NOSIZE': { id: '01NOSIZE', filename: 'f.png' } }).call
    }),
    'REPLACES_NO_PICTURE',
    /holds media 01NOSIZE, whose size the library does not know/
  )
})
