import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  promises as fsPromises,
  renameSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { normalizeCall, uploadBytesProblem } from '../src/host/normalize.mjs'
import { refusalNext } from '../src/host/site.mjs'
import { SURFACE_ACTIONS } from '../src/host/surface.mjs'
import {
  chatAttachments,
  filesTabPictures,
  findAttachment,
  heldSpelling,
  mediaUpload,
  readChatPicture,
  readSiteFile,
  UPLOAD_MAX_BYTES,
  uploadParams
} from '../src/host/upload.mjs'

// 🔒 `media.upload {file}` (27/09/2026): the customer's picture is NAMED, and the host reads it from the
// site folder the Files tab writes into (`upload.mjs`). Before it, every road wanted bytes the model
// typed: on EmDash the agent looped 24–40 steps (7–12 min) on the local stand, and a WordPress or
// Joomla call with no `content_b64` wrote a 0-byte file and answered ok (F5).

/** A PNG header that says `w`×`h` — all `imageSize` reads, and all a door here needs to see. */
function png(w = 1200, h = 800, pad = 0) {
  const b = Buffer.alloc(33 + pad)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}
/** A JPEG whose first segment is its frame (SOF0): `w`×`h`. */
function jpeg(w = 640, h = 480) {
  const b = Buffer.alloc(24)
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0)
  b.writeUInt16BE(h, 7)
  b.writeUInt16BE(w, 9)
  return b
}
/** A WebP (VP8X) that says `w`×`h`. */
function webp(w = 300, h = 200) {
  const b = Buffer.alloc(30)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(22, 4)
  b.write('WEBPVP8X', 8, 'ascii')
  b.writeUIntLE(w - 1, 24, 3)
  b.writeUIntLE(h - 1, 27, 3)
  return b
}
const sha = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex')

/** A sites root with the site `label` (and a neighbour), and a folder outside both. */
function sites(label = 'shop1') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-upload-'))
  const siteRoot = path.join(root, label)
  mkdirSync(path.join(siteRoot, 'docs'), { recursive: true })
  mkdirSync(path.join(root, 'other'), { recursive: true })
  const outside = mkdtempSync(path.join(tmpdir(), 'tch-upload-outside-'))
  return { root, siteRoot, outside }
}

test('a picture in the site folder is read: its bytes, digest, kind and size from its own header', async () => {
  const { siteRoot } = sites()
  const bytes = png(1600, 1000, 64)
  writeFileSync(path.join(siteRoot, 'logo.png'), bytes)
  writeFileSync(path.join(siteRoot, 'docs', 'hero.jpeg'), jpeg(640, 480))
  writeFileSync(path.join(siteRoot, 'banner.webp'), webp(300, 200))
  const logo = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'logo.png' }))
  assert.equal(logo.ok, true)
  assert.deepEqual(
    { name: logo.name, ext: logo.ext, type: logo.contentType, w: logo.width, h: logo.height },
    { name: 'logo.png', ext: 'png', type: 'image/png', w: 1600, h: 1000 }
  )
  assert.equal(logo.sha256, sha(bytes))
  assert.deepEqual(logo.bytes, bytes)
  // A path in the folder, or the absolute path the host sees, names the same file.
  const hero = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'docs/hero.jpeg' }))
  assert.deepEqual([hero.ext, hero.contentType, hero.width, hero.height], ['jpg', 'image/jpeg', 640, 480])
  const banner = /** @type {any} */ (
    await readSiteFile({ siteRoot, file: path.join(siteRoot, 'banner.webp') })
  )
  assert.deepEqual([banner.ext, banner.width, banner.height], ['webp', 300, 200])
})

test('🔒 the fence is the site folder, resolved: outside, "..", and a symlink out are refused', async () => {
  const { root, siteRoot, outside } = sites()
  // Real pictures on the other side, so a refusal cannot be a mere "not found".
  writeFileSync(path.join(root, 'other', 'theirs.png'), png())
  writeFileSync(path.join(outside, 'secret.png'), png())
  writeFileSync(path.join(siteRoot, 'logo.png'), png())
  for (const file of ['../other/theirs.png', path.join(outside, 'secret.png'), 'docs/../logo.png']) {
    const out = /** @type {any} */ (await readSiteFile({ siteRoot, file }))
    assert.equal(out.code, 'FILE_OUTSIDE_SITE', file)
  }
  // A link the agent's shell could plant inside the folder: its name is inside, its target is not.
  symlinkSync(path.join(outside, 'secret.png'), path.join(siteRoot, 'innocent.png'))
  assert.equal(
    /** @type {any} */ (await readSiteFile({ siteRoot, file: 'innocent.png' })).code,
    'FILE_OUTSIDE_SITE'
  )
  symlinkSync(path.join(outside), path.join(siteRoot, 'docs', 'linked-dir'))
  assert.equal(
    /** @type {any} */ (await readSiteFile({ siteRoot, file: 'docs/linked-dir/secret.png' })).code,
    'FILE_OUTSIDE_SITE'
  )
  // A link that stays inside is only another name for a file of this site.
  symlinkSync(path.join(siteRoot, 'logo.png'), path.join(siteRoot, 'docs', 'same.png'))
  assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file: 'docs/same.png' })).ok, true)
})

/**
 * 🔒 EVERY COMPONENT OF THE WALK, NOT JUST THE LAST (28/09/2026). `O_NOFOLLOW` guards the final name
 * only, and `realpath` answers where the path led at that moment. The agent's shell can turn a
 * DIRECTORY on the walk into a symlink to ANOTHER CUSTOMER'S site between the resolve and the open —
 * a directory component is followed whatever the flag says — and the inode check could not see it,
 * because the stat before the open was taken after the swap too. Here the swap is made by a real
 * `rename` while the read is in flight, timed on the `fs` calls the read makes.
 */
test('🔒 a directory swapped for a link to another site between the check and the open reads nothing', async () => {
  const { root, siteRoot } = sites()
  const theirs = path.join(root, 'other')
  mkdirSync(path.join(siteRoot, 'pics'), { recursive: true })
  writeFileSync(path.join(siteRoot, 'pics', 'hero.png'), png(100, 100))
  // Another customer's picture, the same name, real bytes: a refusal cannot be a mere "not found".
  mkdirSync(path.join(theirs, 'pics'), { recursive: true })
  writeFileSync(path.join(theirs, 'pics', 'hero.png'), png(4000, 3000))

  const swapped = path.join(siteRoot, 'pics-gone')
  const link = path.join(siteRoot, 'pics')
  let swap = () => {
    renameSync(link, swapped)
    symlinkSync(path.join(theirs, 'pics'), link)
    swap = () => {}
  }
  // The swap lands in the REAL window: after the walk was checked and before the file is opened, on
  // the `stat` between them. Everything the open then sees agrees — the stat, the handle's inode — and
  // only the walk checked AGAIN after the open can tell. `O_NOFOLLOW` cannot: the link it would have
  // to refuse is a directory on the way, not the last name.
  const realStat = fsPromises.stat
  fsPromises.stat = async (...args) => {
    swap()
    return await realStat.apply(fsPromises, args)
  }
  let out
  try {
    out = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'pics/hero.png' }))
  } finally {
    fsPromises.stat = realStat
  }
  assert.equal(out.ok, false, JSON.stringify(out).slice(0, 200))
  assert.ok(
    out.code === 'FILE_OUTSIDE_SITE' || out.code === 'FILE_NOT_FOUND',
    `a swapped walk is refused, not read: ${out.code}`
  )
  assert.equal(out.bytes, undefined, 'no bytes of another customer left this call')
  // Put back: the same call on an unswapped folder reads this site's own picture, 100×100.
  renameSync(link, path.join(siteRoot, 'pics-link'))
  renameSync(swapped, link)
  const own = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'pics/hero.png' }))
  assert.deepEqual([own.ok, own.width, own.height], [true, 100, 100])
})

test("🔒 a site's secrets never leave, by name or behind a link", async () => {
  const { siteRoot } = sites()
  mkdirSync(path.join(siteRoot, '.webroot'), { recursive: true })
  writeFileSync(path.join(siteRoot, '.webroot', 'wp-config.php'), "<?php define('DB_PASSWORD', 'x');")
  writeFileSync(path.join(siteRoot, '.webroot', 'configuration.php'), '<?php class JConfig {}')
  writeFileSync(path.join(siteRoot, '.env'), 'KEY=x')
  writeFileSync(path.join(siteRoot, 'dsh-passwords.env'), 'KEY=x')
  for (const file of ['.webroot/wp-config.php', '.webroot/configuration.php', '.env', 'dsh-passwords.env'])
    assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file })).code, 'FILE_SECRET', file)
  symlinkSync(path.join(siteRoot, '.webroot', 'wp-config.php'), path.join(siteRoot, 'photo.png'))
  assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file: 'photo.png' })).code, 'FILE_SECRET')
})

test('only a regular file of at most 8 MiB whose header says PNG, JPEG or WebP is read', async () => {
  const { siteRoot } = sites()
  // 8 MiB exactly passes; one byte more is refused before anything is read.
  const exact = path.join(siteRoot, 'exact.png')
  writeFileSync(exact, png())
  truncateSync(exact, UPLOAD_MAX_BYTES)
  assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file: 'exact.png' })).ok, true)
  const big = path.join(siteRoot, 'big.png')
  writeFileSync(big, png())
  truncateSync(big, UPLOAD_MAX_BYTES + 1)
  const tooBig = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'big.png' }))
  assert.equal(tooBig.code, 'FILE_TOO_LARGE')
  assert.equal(tooBig.bytes, UPLOAD_MAX_BYTES + 1)
  assert.equal(UPLOAD_MAX_BYTES, 8_388_608)
  // Not pictures: text, a GIF (no door here takes one into tracy-content), an empty file.
  writeFileSync(path.join(siteRoot, 'notes.txt'), 'hello')
  writeFileSync(path.join(siteRoot, 'anim.gif'), Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'))
  writeFileSync(path.join(siteRoot, 'empty.png'), '')
  for (const file of ['notes.txt', 'anim.gif', 'empty.png'])
    assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file })).code, 'NOT_A_PICTURE', file)
  // Not files at all, or nothing.
  assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file: 'docs' })).code, 'FILE_NOT_FOUND')
  assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file: 'nope.png' })).code, 'FILE_NOT_FOUND')
  for (const file of [undefined, '', '   ', 42])
    assert.equal(/** @type {any} */ (await readSiteFile({ siteRoot, file })).code, 'UPLOAD_NEEDS_FILE')
})

test('🔒 a FIFO planted in the site folder is refused, never opened (an open would wait forever)', async (t) => {
  const { siteRoot } = sites()
  try {
    execFileSync('mkfifo', [path.join(siteRoot, 'pipe.png')])
  } catch {
    t.skip('no mkfifo on this machine')
    return
  }
  const out = /** @type {any} */ (await readSiteFile({ siteRoot, file: 'pipe.png' }))
  assert.equal(out.code, 'FILE_NOT_FOUND')
})

// ── PD-2 (adversarial review of round 7): a name is the same text in either Unicode form ────────────────
//
// A Mac saves "Ả" as A + U+0309 and a model types it as the one letter U+1EA2. ext4 (the fleet) keeps a
// name's bytes, so only one of the two exists and `media.upload {file}` answered FILE_NOT_FOUND for a file
// the Files-tab notice had just listed — with the notice saying not to `ls` for it. APFS (where these tests
// run) finds either, which hid it: the folder below is made byte-exact by answering `realpath` as ext4 would.

const NFD = (/** @type {string} */ text) => text.normalize('NFD')
const NFC = (/** @type {string} */ text) => text.normalize('NFC')
/** A customer's own file name: Vietnamese accents, spaces. */
const PHOTO = 'Ảnh dự án.jpg'
/** One name, four canonically equal spellings ("ự" alone, decomposed, and two half-way ones). */
const HALF_WAY = ['ự', 'ự']

/**
 * Run `body` with `realpath` inside `base` answering as a byte-exact filesystem does: a name that differs
 * from the stored one only in its Unicode form is not found.
 * @template T
 * @param {string} base - the site folder, symlink-resolved.
 * @param {() => Promise<T>} body
 * @returns {Promise<T>}
 */
async function onByteExactNames(base, body) {
  const original = fsPromises.realpath
  fsPromises.realpath = /** @type {any} */ (
    async (/** @type {string} */ target, /** @type {any[]} */ ...rest) => {
      const parts = path.relative(base, String(target)).split(path.sep)
      if (parts[0] !== '..' && parts[0] !== '') {
        let dir = base
        for (const part of parts) {
          const names = await fsPromises.readdir(dir).catch(() => /** @type {string[]} */ ([]))
          if (!names.includes(part))
            throw Object.assign(new Error(`ENOENT: no such file or directory, realpath '${target}'`), {
              code: 'ENOENT'
            })
          dir = path.join(dir, part)
        }
      }
      return await original.call(fsPromises, target, ...rest)
    }
  )
  try {
    return await body()
  } finally {
    fsPromises.realpath = original
  }
}

{
  /** @param {Record<string, string[]>} listing - the names each folder holds, by its path. */
  const folders = (listing) => async (/** @type {string} */ dir) => {
    if (!Object.hasOwn(listing, dir)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return listing[dir]
  }
  const FOLDER = 'Bản đồ'
  const rows = [
    ['a decomposed name asked composed', { '/site': [NFD(PHOTO)] }, NFC(PHOTO), NFD(PHOTO)],
    ['a composed name asked decomposed', { '/site': [NFC(PHOTO)] }, NFD(PHOTO), NFC(PHOTO)],
    ['the exact name held: nothing else to offer', { '/site': [NFC(PHOTO)] }, NFC(PHOTO), null],
    [
      'every segment of a path is spelled as held',
      { '/site': ['logo.png', NFD(FOLDER)], [`/site/${NFD(FOLDER)}`]: [NFD(PHOTO)] },
      `${NFC(FOLDER)}/${NFC(PHOTO)}`,
      `${NFD(FOLDER)}/${NFD(PHOTO)}`
    ],
    [
      'two entries that are the same text are a guess, not an answer',
      { '/site': [NFD(PHOTO), NFC(PHOTO).replace('ự', HALF_WAY[0])] },
      NFC(PHOTO),
      null
    ],
    ['a name nothing is like', { '/site': ['logo.png'] }, NFC(PHOTO), null],
    ['a folder that cannot be listed', {}, NFC(PHOTO), null],
    ['an absolute path is not spelled here', { '/site': [NFD(PHOTO)] }, `/site/${NFC(PHOTO)}`, null]
  ]
  for (const [label, listing, asked, expected] of rows)
    test(`heldSpelling: ${label}`, async () => {
      assert.equal(await heldSpelling('/site', /** @type {string} */ (asked), folders(listing)), expected)
    })
}

{
  const rows = [
    ['saved decomposed, typed composed', [NFD(PHOTO)], NFC(PHOTO)],
    ['saved composed, typed decomposed', [NFC(PHOTO)], NFD(PHOTO)],
    ['saved and typed the same way', [NFD(PHOTO)], NFD(PHOTO)],
    ['inside a folder saved decomposed', [NFD('Bản đồ'), NFD(PHOTO)], `${NFC('Bản đồ')}/${NFC(PHOTO)}`]
  ]
  for (const [label, saved, asked] of rows)
    test(`readSiteFile on a byte-exact folder: a picture ${label} is found`, async () => {
      const { siteRoot } = sites()
      const heldName = saved[saved.length - 1]
      const dir = saved.length === 2 ? path.join(siteRoot, saved[0]) : siteRoot
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, heldName), png(1600, 1000, 64))
      const base = await fsPromises.realpath(siteRoot)

      await onByteExactNames(base, async () => {
        // The folder is byte-exact here: the other spelling is NOT a file that exists.
        if (asked !== path.relative(siteRoot, path.join(dir, heldName)))
          await assert.rejects(fsPromises.realpath(path.join(base, asked)), /ENOENT/)
        const out = /** @type {any} */ (await readSiteFile({ siteRoot, file: asked }))

        assert.equal(out.ok, true, JSON.stringify(out).slice(0, 200))
        assert.equal(out.name, heldName, 'the answer names the file as the folder holds it')
        assert.deepEqual([out.width, out.height], [1600, 1000])
      })
    })
}

test('🔒 a picture found by another Unicode form still goes through the fence: a link out of the folder is refused', async () => {
  const { siteRoot, outside } = sites()
  writeFileSync(path.join(outside, 'secret.png'), png())
  symlinkSync(outside, path.join(siteRoot, NFD('Ảnh')))
  const base = await fsPromises.realpath(siteRoot)

  await onByteExactNames(base, async () => {
    const out = /** @type {any} */ (await readSiteFile({ siteRoot, file: `${NFC('Ảnh')}/secret.png` }))

    assert.equal(out.ok, false)
    assert.equal(out.code, 'FILE_OUTSIDE_SITE')
    assert.equal(out.bytes, undefined)
  })
})

test('🔒 the Files-tab notice does not lie: each name it lists is found as listed and in the other Unicode form', async () => {
  const { siteRoot } = sites()
  for (const name of [NFD(PHOTO), NFC('Bìa sách.png'), 'plain.webp'])
    writeFileSync(path.join(siteRoot, name), name.endsWith('.webp') ? webp() : png())
  const listed = await filesTabPictures(siteRoot)
  assert.equal(listed.length, 3)
  const base = await fsPromises.realpath(siteRoot)

  await onByteExactNames(base, async () => {
    for (const name of listed)
      for (const asked of new Set([name, NFC(name), NFD(name)])) {
        const out = /** @type {any} */ (await readSiteFile({ siteRoot, file: asked }))
        assert.equal(out.ok, true, `${JSON.stringify(asked)}: ${JSON.stringify(out).slice(0, 160)}`)
      }
  })
})

test('WordPress and Joomla: the bytes, their digest and a content-addressed name the bound component accepts', () => {
  const bytes = jpeg()
  const picture = /** @type {any} */ ({ name: 'Hero.JPEG', bytes, sha256: sha(bytes), ext: 'jpg' })
  const wp = uploadParams(picture, 'wordpress')
  const { apply_id: wpReceipt, ...wpRest } = wp
  assert.deepEqual(wpRest, {
    path: `wp-content/uploads/tracy-content/${sha(bytes)}.jpg`,
    content_b64: bytes.toString('base64'),
    sha256: sha(bytes)
  })
  // 🔒 ONE RECEIPT PER UPLOAD, NOT PER PICTURE (28/09/2026). It used to be `media-<sha16>` — the
  // picture's own digest — so uploading the SAME picture a second time reused the first upload's
  // receipt, and `apply.revert` on the second removed the file the page put up on the first. The
  // digest still opens the name, so a receipt still says which bytes went.
  assert.match(wpReceipt, /^media-[a-f0-9]{12}-[a-z0-9]+$/)
  assert.ok(wpReceipt.startsWith(`media-${sha(bytes).slice(0, 12)}-`))
  assert.notEqual(
    uploadParams(picture, 'wordpress').apply_id,
    uploadParams(picture, 'wordpress').apply_id,
    'the same picture uploaded twice is two receipts'
  )
  // The path both components' bound rule reads (`CONTRACT_MEDIA_PATH`, Joomla `Engine.php:155`).
  assert.match(wp.path, /^wp-content\/uploads\/tracy-content\/[a-f0-9]{64}\.(png|jpg|webp)$/)
  assert.equal(uploadParams(picture, 'joomla').path, `images/tracy-content/${sha(bytes)}.jpg`)
  assert.doesNotMatch(wp.apply_id, /^contract-/, 'a bound component refuses a contract- receipt for media')
  // A path the call names is kept (leading slash dropped): where the model asked the file to land.
  assert.equal(
    uploadParams(picture, 'wordpress', '/wp-content/uploads/2026/09/hero.jpg').path,
    'wp-content/uploads/2026/09/hero.jpg'
  )
})

test('EmDash: the stubbed upload gets the bytes, the name, the type and the alt; the answer names the id to write', async () => {
  const { siteRoot } = sites()
  const bytes = png(1600, 1000)
  // A name that says JPEG over PNG bytes: the kind is the bytes', the stem the customer's.
  writeFileSync(path.join(siteRoot, 'Our Logo.jpeg'), bytes)
  /** @type {any[]} */
  const sent = []
  const out = /** @type {any} */ (
    await mediaUpload({
      params: { file: 'Our Logo.jpeg', alt: '  The shop front  ' },
      platform: 'emdash',
      siteRoot,
      upload: async (p) => {
        sent.push(p)
        return { ok: true, id: '01M3ETAF7D8QWHMKBEP0D1K7JE', url: '/_emdash/api/media/file/01M3.png' }
      }
    })
  )
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].bytes, bytes)
  assert.equal(sent[0].filename, 'Our-Logo.png')
  assert.equal(sent[0].contentType, 'image/png')
  assert.equal(sent[0].alt, 'The shop front')
  assert.equal(out.ok, true)
  assert.deepEqual(
    [out.id, out.url, out.width, out.height],
    ['01M3ETAF7D8QWHMKBEP0D1K7JE', '/_emdash/api/media/file/01M3.png', 1600, 1000]
  )
  assert.match(
    out.next,
    /tracy_emdash content_update \{collection, id, _rev, data:\{"<image field>":"01M3ETAF7D8QWHMKBEP0D1K7JE"\}/
  )
  // 🔒 E5.e4 (dev e2e 04/10/2026): EmDash keeps one item per picture (content hash), so the same bytes
  // come back as the item ALREADY in the library, alt and all — the alt sent is not stored. The answer
  // said nothing of it; the agent then wrote the customer's alt onto that item with media_update and
  // the home page hero's description changed. Now the answer says the item was already there, keeps
  // its alt, and that changing it changes every place it shows.
  const reused = /** @type {any} */ (
    await mediaUpload({
      params: { file: 'Our Logo.jpeg', alt: 'E2E04 upload' },
      platform: 'emdash',
      siteRoot,
      upload: async () => ({
        ok: true,
        id: '01M3PJRPQKF2ARBKGSTW09N8TV',
        url: '/_emdash/api/media/file/01M3.png',
        deduplicated: true,
        alt: 'Drop a site photo here · 4:5'
      })
    })
  )
  assert.equal(reused.ok, true)
  assert.equal(reused.deduplicated, true)
  assert.equal(reused.id, '01M3PJRPQKF2ARBKGSTW09N8TV')
  assert.match(reused.alt, /^not stored: /)
  assert.match(reused.alt, /already in the media library/)
  assert.match(reused.alt, /"Drop a site photo here · 4:5"/)
  assert.match(reused.next, /already in the media library/)
  assert.match(reused.next, /media_update .*changes it everywhere it shows.*ask the customer first/)
  // A new picture says none of that.
  assert.equal(out.deduplicated, undefined)
  assert.doesNotMatch(out.next, /already in the media library/)
  // EmDash's refusal comes back as it is, the file named; a file refused here is never sent.
  const refused = /** @type {any} */ (
    await mediaUpload({
      params: { file: 'Our Logo.jpeg' },
      platform: 'emdash',
      siteRoot,
      upload: async () => ({ ok: false, code: 'TOOL_FAILED', error: '[INVALID_TYPE] File type not allowed' })
    })
  )
  assert.deepEqual([refused.ok, refused.code, refused.file], [false, 'TOOL_FAILED', 'Our Logo.jpeg'])
  const fenced = /** @type {any} */ (
    await mediaUpload({
      params: { file: '../x.png' },
      platform: 'emdash',
      siteRoot,
      upload: async () => assert.fail('nothing is sent for a file refused here')
    })
  )
  assert.equal(fenced.code, 'FILE_OUTSIDE_SITE')
})

test('WordPress and Joomla: the component gets the host-built call, and the answer says where the picture went', async () => {
  const { siteRoot } = sites()
  const bytes = png(800, 600)
  writeFileSync(path.join(siteRoot, 'logo.png'), bytes)
  /** @type {any[]} */
  const sent = []
  const upload = async (/** @type {any} */ p) => {
    sent.push(p)
    return { ok: true, path: p.path, bytes: 33, created: true, next: 'the receipt' }
  }
  const open = /** @type {any} */ (
    await mediaUpload({ params: { file: 'logo.png', alt: 'Logo' }, platform: 'wordpress', siteRoot, upload })
  )
  assert.deepEqual(Object.keys(sent[0]).sort(), ['apply_id', 'content_b64', 'path', 'sha256'])
  assert.equal(sent[0].path, `wp-content/uploads/tracy-content/${sha(bytes)}.png`)
  assert.equal(Buffer.from(sent[0].content_b64, 'base64').equals(bytes), true)
  assert.equal(open.ok, true)
  assert.equal(open.path, sent[0].path)
  assert.deepEqual(
    [open.width, open.height, open.file, open.apply_id],
    [800, 600, 'logo.png', sent[0].apply_id]
  )
  assert.match(open.alt, /not stored/, 'an alt this door cannot keep is said, not dropped')
  assert.match(open.next, /the content\.update of the record that shows it/)
  assert.doesNotMatch(open.next, /content\.contract/, 'an open surface has no contract door')
  const bound = /** @type {any} */ (
    await mediaUpload({ params: { file: 'logo.png' }, platform: 'joomla', siteRoot, contract: true, upload })
  )
  assert.equal(sent[1].path, `images/tracy-content/${sha(bytes)}.png`)
  assert.match(
    bound.next,
    /content\.contract \{operation:"apply", changes:\{"<image slot key>":"images\/tracy-content\/[a-f0-9]{64}\.png"\}\}/
  )
  // The component's refusal is the answer, next and all.
  const refusal = { ok: false, error: 'content_only', message: 'x', next: 'its own next' }
  assert.equal(
    await mediaUpload({
      params: { file: 'logo.png' },
      platform: 'joomla',
      siteRoot,
      upload: async () => refusal
    }),
    refusal
  )
})

test('🔒 F5: an upload with no bytes, empty bytes or text that is not base64 never leaves the host', () => {
  for (const [params, why] of /** @type {const} */ ([
    [{ path: 'images/x.png', apply_id: 'm1' }, /names no file/],
    [{ path: 'images/x.png', apply_id: 'm1', content_b64: '' }, /empty/],
    [{ path: 'images/x.png', apply_id: 'm1', content_b64: '   ' }, /empty/],
    [{ path: 'images/x.png', apply_id: 'm1', content_b64: 'not base64!' }, /not valid base64/],
    [{ path: 'images/x.png', apply_id: 'm1', content_b64: 'abcde' }, /not valid base64/]
  ]))
    for (const platform of ['wordpress', 'joomla']) {
      const n = /** @type {any} */ (normalizeCall('media.upload', params, { platform }))
      assert.equal(n.kind, 'refuse', `${platform} ${JSON.stringify(params)}`)
      assert.equal(n.answer.code, 'UPLOAD_NEEDS_FILE')
      assert.match(n.answer.error, why)
      assert.match(refusalNext(n.answer, { platform }) ?? '', /media\.upload \{file:"<name>"\}/)
    }
  // Real base64 goes out — with whitespace, or unpadded, as PHP's strict decoder takes it.
  assert.equal(uploadBytesProblem('iVBORw0KGgo='), null)
  assert.equal(uploadBytesProblem('iVBO\nRw0KGgo'), null)
  const ok = /** @type {any} */ (
    normalizeCall(
      'media.upload',
      {
        path: 'images/x.png',
        apply_id: 'm1',
        content_b64: 'iVBORw0KGgo=',
        sha256: 'a'.repeat(64),
        alt: 'x',
        file: 'y'
      },
      { platform: 'joomla' }
    )
  )
  assert.equal(ok.kind, 'relay')
  assert.deepEqual(Object.keys(ok.params).sort(), ['apply_id', 'content_b64', 'path', 'sha256'])
  assert.deepEqual(ok.host, { alt: 'x', file: 'y' }, "Tracy's own keys are taken off, never relayed")
  // …and a key no reader reads is refused by name instead of relayed (the other half of F5).
  const stray = /** @type {any} */ (
    normalizeCall(
      'media.upload',
      { path: 'images/x.png', apply_id: 'm1', content_b64: 'iVBORw0KGgo=', base64: 'x' },
      { platform: 'wordpress' }
    )
  )
  assert.equal(stray.answer.code, 'UNKNOWN_PARAM')
})

test('every refusal of the file road names the way on, on every surface, within 200 characters', () => {
  for (const code of [
    'UPLOAD_NEEDS_FILE',
    'FILE_NOT_FOUND',
    'FILE_OUTSIDE_SITE',
    'FILE_SECRET',
    'FILE_TOO_LARGE',
    'NOT_A_PICTURE',
    // The chat road (29/09/2026): each names media.upload again — with a name from the list, or the Files tab.
    'NO_ATTACHMENT',
    'ATTACHMENT_NOT_FOUND',
    'ATTACHMENT_AMBIGUOUS',
    'ATTACHMENT_UNREADABLE',
    'UPLOAD_TWO_SOURCES'
  ])
    for (const [surface, actions] of Object.entries(SURFACE_ACTIONS)) {
      const platform =
        surface === 'emdash' ? 'emdash' : surface.startsWith('wordpress') ? 'wordpress' : 'joomla'
      const next =
        refusalNext({ ok: false, code, error: 'x' }, { platform, action: 'media.upload', actions }) ?? ''
      assert.ok(next !== '' && next.length <= 200, `${code} ${surface}: ${next.length}`)
      assert.match(next, /media\.upload/, `${code} ${surface}`)
      assert.ok(actions.includes('media.upload'), `${surface} carries the action its next names`)
      // Only the refusal of typed bytes speaks of them (to say: never); the rest name the file.
      if (code !== 'UPLOAD_NEEDS_FILE') assert.doesNotMatch(next, /base64/i, code)
    }
  assert.match(refusalNext({ ok: false, code: 'FILE_TOO_LARGE' }) ?? '', /8 MiB \(8,388,608 bytes\)/)
  assert.match(refusalNext({ ok: false, code: 'FILE_NOT_FOUND' }) ?? '', /Files tab/)
  // A picture the Files tab does not have may be the one sent in the chat: that road is named too.
  assert.match(refusalNext({ ok: false, code: 'FILE_NOT_FOUND' }) ?? '', /media\.upload \{attachment:/)
  assert.match(
    refusalNext({ ok: false, code: 'UPLOAD_NEEDS_FILE' }) ?? '',
    /\{attachment:"<its name or sha256>"\}/
  )
})

// ── media.upload {attachment} (29/09/2026): the picture the customer sent IN THE CHAT ───────────────
//
// dsh keeps it in its attachment store, which no door reached: bench v5 (cause O) measured 12 min /
// 28 steps on WordPress (the picture re-encoded smaller so its base64 fit a call) and a 725 s timeout
// on EmDash (55 k output tokens of base64 typed by hand). The model now NAMES it, and the host reads it
// back — chosen among this session's own attachments only, never a path the model typed.

/** dsh's durable reference to a stored image, as a `user/message` carries it. */
function imageRef(bytes, { name = 'hero.png', width = 1200, height = 800, originalDimensions } = {}) {
  return {
    attachmentId: `sha256:${sha(bytes)}`,
    mediaType: 'image/png',
    bytes: bytes.length,
    width,
    height,
    ...(name === null ? {} : { name }),
    ...(originalDimensions ? { originalDimensions } : {})
  }
}
/** A person's message with these attachments (image or file blocks), as the session log keeps it. */
const sent = (parts, kind = 'user') => ({
  type: 'user/message',
  data: { source: { kind }, content: [{ type: 'text', text: 'use this one' }, ...parts] }
})
const image = (ref) => ({ type: 'image', attachment: ref })
const fileBlock = (bytes, name) => ({
  type: 'file',
  attachment: { attachmentId: `sha256:${sha(bytes)}`, name, bytes: bytes.length }
})
/** dsh's attachment store, stubbed: the bytes it holds by digest, and every read it was asked for. */
function store(held, reads = []) {
  const byDigest = new Map(held.map((b) => [sha(b), b]))
  return {
    reads,
    readImage: async (ref) => {
      reads.push(ref.attachmentId)
      const b = byDigest.get(String(ref.attachmentId).slice(7))
      if (b === undefined) throw Object.assign(new Error('missing'), { code: 'ATTACHMENT_NOT_FOUND' })
      return { ref, data: new Uint8Array(b) }
    },
    readFileStream: async function* (ref) {
      reads.push(ref.attachmentId)
      const b = byDigest.get(String(ref.attachmentId).slice(7))
      if (b === undefined) throw Object.assign(new Error('missing'), { code: 'ATTACHMENT_NOT_FOUND' })
      yield new Uint8Array(b.subarray(0, 10))
      yield new Uint8Array(b.subarray(10))
    }
  }
}

test("chatAttachments: a person's pictures and files in this session, newest first, one per digest", () => {
  const a = png(1600, 1000, 1)
  const b = jpeg(640, 480)
  const shot = png(1280, 800, 2)
  const events = [
    sent([image(imageRef(a, { name: 'first.png' }))]),
    // A tool's picture (a page.look screenshot) and a plugin's message are not the customer's.
    { type: 'tool/result', data: { content: [image(imageRef(shot, { name: 'shot.png' }))] } },
    sent([image(imageRef(shot, { name: 'context.png' }))], 'plugin'),
    sent([fileBlock(b, 'survey.jpg'), image(imageRef(a, { name: 'first again.png' }))])
  ]
  const got = chatAttachments(events)
  assert.deepEqual(
    got.map((x) => [x.kind, x.name, x.digest]),
    [
      ['file', 'survey.jpg', sha(b)],
      ['image', 'first again.png', sha(a)]
    ]
  )
  assert.deepEqual(chatAttachments(undefined), [])
  // A reference whose id is not a sha256 digest is not an attachment at all.
  assert.deepEqual(chatAttachments([sent([image({ attachmentId: 'x', name: 'x.png' })])]), [])
})

test('findAttachment: by name, by its sha256 id (8+ hex), by the store path dsh showed, or refused with the list', () => {
  const a = png(1600, 1000, 1)
  const b = png(900, 560, 3)
  const attached = chatAttachments([
    sent([image(imageRef(a, { name: 'hero-kaluga-dusk.jpg' })), image(imageRef(b, { name: null }))])
  ])
  const pick = (asked) => /** @type {any} */ (findAttachment(asked, attached))
  for (const asked of [
    'hero-kaluga-dusk.jpg',
    'HERO-kaluga-dusk.JPG',
    '"hero-kaluga-dusk.jpg"',
    'hero-kaluga-dusk',
    `sha256:${sha(a)}`,
    `sha256:${sha(a).slice(0, 8)}`,
    sha(a).slice(0, 12),
    `Image "hero-kaluga-dusk.jpg" (sha256:${sha(a)})`,
    `/desk-home/attachments/v1/objects/${sha(a).slice(0, 2)}/${sha(a)}`
  ])
    assert.equal(pick(asked).entry?.digest, sha(a), asked)
  // A picture with no name is chosen by its id.
  assert.equal(pick(`sha256:${sha(b).slice(0, 10)}`).entry?.digest, sha(b))
  // Nothing answers: refused, and the refusal lists what this conversation holds, by name and id.
  const none = pick('logo.png')
  assert.equal(none.code, 'ATTACHMENT_NOT_FOUND')
  assert.deepEqual(none.attached, [
    { name: 'hero-kaluga-dusk.jpg', id: `sha256:${sha(a).slice(0, 12)}`, size: '1200x800' },
    { name: null, id: `sha256:${sha(b).slice(0, 12)}`, size: '1200x800' }
  ])
  assert.equal(pick('').code, 'ATTACHMENT_NOT_FOUND')
  assert.equal(pick(42).code, 'ATTACHMENT_NOT_FOUND')
  // Two pictures under one name: the model is asked for the id, never given the first.
  const twice = chatAttachments([
    sent([image(imageRef(a, { name: 'image.png' }))]),
    sent([image(imageRef(b, { name: 'image.png' }))])
  ])
  const both = /** @type {any} */ (findAttachment('image.png', twice))
  assert.equal(both.code, 'ATTACHMENT_AMBIGUOUS')
  assert.equal(both.attached.length, 2)
  // A conversation with no attachment says so.
  assert.equal(/** @type {any} */ (findAttachment('hero.png', [])).code, 'NO_ATTACHMENT')
})

{
  // dsh keeps an attachment's name as the browser sent it: a Mac's is decomposed, and a model types it composed.
  const rows = [
    ['saved decomposed, typed composed', NFD(PHOTO), NFC(PHOTO)],
    ['saved composed, typed decomposed', NFC(PHOTO), NFD(PHOTO)],
    ['saved decomposed, typed without its extension', NFD(PHOTO), NFC(PHOTO).replace('.jpg', '')]
  ]
  for (const [label, saved, asked] of rows)
    test(`findAttachment: a name ${label} is the same picture`, () => {
      const a = png(1600, 1000, 1)
      const attached = chatAttachments([sent([image(imageRef(a, { name: saved }))])])

      const found = /** @type {any} */ (findAttachment(asked, attached))

      assert.equal(found.entry?.digest, sha(a))
    })
}

test("🔒 readChatPicture: only THIS conversation's attachments are reachable — another session's id or a path elsewhere reads nothing", async () => {
  const mine = png(1600, 1000, 1)
  const theirs = png(1590, 1000, 5)
  const reads = []
  const shared = store([mine, theirs], reads)
  const events = [sent([image(imageRef(mine, { name: 'mine.png' }))])]
  // The store holds both (one host dsh serves every site); only the one in this log is chosen.
  for (const asked of [
    `sha256:${sha(theirs)}`,
    sha(theirs).slice(0, 16),
    `/desk-home/attachments/v1/objects/${sha(theirs).slice(0, 2)}/${sha(theirs)}`,
    '/desk-home/dsh-passwords.env',
    '../../dsh-passwords.env',
    'theirs.png'
  ]) {
    const out = /** @type {any} */ (await readChatPicture({ asked, events, store: shared }))
    assert.equal(out.code, 'ATTACHMENT_NOT_FOUND', asked)
  }
  assert.deepEqual(reads, [], 'nothing was read for a picture this conversation does not hold')
  const ok = /** @type {any} */ (await readChatPicture({ asked: 'mine.png', events, store: shared }))
  assert.equal(ok.ok, true)
  assert.deepEqual(reads, [`sha256:${sha(mine)}`])
})

test('readChatPicture: the stored bytes, checked — digest, size, kind — and a reduced copy said as such', async () => {
  const bytes = png(1600, 1000, 64)
  const events = [sent([image(imageRef(bytes, { name: 'hero.png', width: 1600, height: 1000 }))])]
  const out = /** @type {any} */ (await readChatPicture({ asked: 'hero.png', events, store: store([bytes]) }))
  assert.equal(out.ok, true)
  assert.deepEqual(
    [out.name, out.ext, out.contentType, out.width, out.height, out.sha256],
    ['hero.png', 'png', 'image/png', 1600, 1000, sha(bytes)]
  )
  assert.equal(out.bytes.equals(bytes), true)
  assert.equal(out.reduced, undefined)
  // A file block (a picture sent as a file) is read through the streamed read, verbatim.
  const photo = jpeg(640, 480)
  const asFile = /** @type {any} */ (
    await readChatPicture({
      asked: 'survey.jpg',
      events: [sent([fileBlock(photo, 'survey.jpg')])],
      store: store([photo])
    })
  )
  assert.deepEqual([asFile.ok, asFile.ext, asFile.width, asFile.height], [true, 'jpg', 640, 480])
  assert.equal(asFile.bytes.equals(photo), true)
  // dsh reduced it at admission: the answer says so, and where the full size goes.
  const big = /** @type {any} */ (
    await readChatPicture({
      asked: 'hero.png',
      events: [
        sent([
          image(
            imageRef(bytes, {
              name: 'hero.png',
              width: 1600,
              height: 1000,
              originalDimensions: { width: 4000, height: 2500 }
            })
          )
        ])
      ],
      store: store([bytes])
    })
  )
  assert.match(
    big.reduced,
    /reduced copy of this picture: 1600x1000 of the 4000x2500 sent\. For the full size, the customer puts the file in the Files tab\./
  )
  // Bytes that are not the reference's are never sent, whatever the store says.
  const liar = { readImage: async (ref) => ({ ref, data: new Uint8Array(png(1600, 1000, 65)) }) }
  const bad = /** @type {any} */ (await readChatPicture({ asked: 'hero.png', events, store: liar }))
  assert.equal(bad.code, 'ATTACHMENT_UNREADABLE')
  // A store that lost the object, or no store at all: refused, nothing guessed.
  assert.equal(
    /** @type {any} */ (await readChatPicture({ asked: 'hero.png', events, store: store([]) })).code,
    'ATTACHMENT_UNREADABLE'
  )
  assert.equal(
    /** @type {any} */ (await readChatPicture({ asked: 'hero.png', events, store: undefined })).code,
    'ATTACHMENT_UNREADABLE'
  )
  // Over 8 MiB by its own reference: refused before the store is asked.
  const reads = []
  const huge = { ...imageRef(bytes, { name: 'huge.png' }), bytes: UPLOAD_MAX_BYTES + 1 }
  const tooBig = /** @type {any} */ (
    await readChatPicture({ asked: 'huge.png', events: [sent([image(huge)])], store: store([bytes], reads) })
  )
  assert.equal(tooBig.code, 'FILE_TOO_LARGE')
  assert.deepEqual(reads, [])
  // A file that is no picture (a PDF sent in the chat) is refused by its bytes.
  const pdf = Buffer.from('%PDF-1.7 not a picture')
  const notPicture = /** @type {any} */ (
    await readChatPicture({
      asked: 'brief.pdf',
      events: [sent([fileBlock(pdf, 'brief.pdf')])],
      store: store([pdf])
    })
  )
  assert.equal(notPicture.code, 'NOT_A_PICTURE')
})

test('mediaUpload {attachment}: the same doors as {file} — content-addressed on WordPress, the name and alt on EmDash', async () => {
  const { siteRoot } = sites()
  const bytes = jpeg(1590, 1000)
  const events = [
    sent([
      image({
        ...imageRef(bytes, { name: 'hero-kaluga-dusk.jpg', width: 1590, height: 1000 }),
        mediaType: 'image/jpeg'
      })
    ])
  ]
  const readAttachment = (asked) => readChatPicture({ asked, events, store: store([bytes]) })
  /** @type {any[]} */
  const wpSent = []
  const wp = /** @type {any} */ (
    await mediaUpload({
      params: { attachment: 'hero-kaluga-dusk.jpg' },
      platform: 'wordpress',
      siteRoot,
      readAttachment,
      upload: async (p) => (wpSent.push(p), { ok: true, path: p.path, created: true })
    })
  )
  assert.equal(wpSent[0].path, `wp-content/uploads/tracy-content/${sha(bytes)}.jpg`)
  assert.equal(Buffer.from(wpSent[0].content_b64, 'base64').equals(bytes), true)
  assert.equal(wpSent[0].sha256, sha(bytes))
  assert.equal(wp.ok, true)
  // The answer names the picture the way the call did: a later call by that name takes the same road.
  assert.deepEqual(
    [wp.attachment, wp.file, wp.width, wp.height],
    ['hero-kaluga-dusk.jpg', undefined, 1590, 1000]
  )
  assert.match(wp.next, /the content\.update of the record that shows it/)
  /** @type {any[]} */
  const emSent = []
  const em = /** @type {any} */ (
    await mediaUpload({
      params: { attachment: 'sha256:' + sha(bytes).slice(0, 8), alt: 'Kaluga at dusk' },
      platform: 'emdash',
      siteRoot,
      readAttachment,
      upload: async (p) => (
        emSent.push(p), { ok: true, id: '01M3ETAF7D8QWHMKBEP0D1K7JE', url: '/_emdash/api/media/file/x.jpg' }
      )
    })
  )
  assert.deepEqual(
    [emSent[0].filename, emSent[0].contentType, emSent[0].alt, emSent[0].bytes.equals(bytes)],
    ['hero-kaluga-dusk.jpg', 'image/jpeg', 'Kaluga at dusk', true]
  )
  assert.equal(em.attachment, 'hero-kaluga-dusk.jpg')
  assert.match(em.next, /data:\{"<image field>":"01M3ETAF7D8QWHMKBEP0D1K7JE"\}/)
  // EmDash's refusal comes back naming the attachment, not a file the Files tab never had.
  const emNo = /** @type {any} */ (
    await mediaUpload({
      params: { attachment: 'hero-kaluga-dusk.jpg' },
      platform: 'emdash',
      siteRoot,
      readAttachment,
      upload: async () => ({ ok: false, code: 'TOOL_FAILED', error: '[INVALID_TYPE] no' })
    })
  )
  assert.deepEqual([emNo.ok, emNo.attachment, emNo.file], [false, 'hero-kaluga-dusk.jpg', undefined])
  // One picture per call: both named is refused before either is read.
  const never = () => assert.fail('nothing is read or sent for a call naming two pictures')
  const two = /** @type {any} */ (
    await mediaUpload({
      params: { file: 'a.png', attachment: 'b.png' },
      platform: 'joomla',
      siteRoot,
      readAttachment: never,
      upload: never
    })
  )
  assert.equal(two.code, 'UPLOAD_TWO_SOURCES')
  // A caller with no session log or store to read from refuses the attachment rather than guess.
  const blind = /** @type {any} */ (
    await mediaUpload({ params: { attachment: 'b.png' }, platform: 'joomla', siteRoot, upload: never })
  )
  assert.equal(blind.code, 'ATTACHMENT_UNREADABLE')
})
