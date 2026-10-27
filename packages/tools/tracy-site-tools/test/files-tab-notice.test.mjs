/**
 * A picture the customer put in the Files tab is in the site folder and NOT in the media library until
 * `media.upload {file}` reads it — and nothing the model was sent said so.
 *
 * Round 7 (bench v7, 29/09/2026): in 5 of the 12 "use the picture I uploaded" runs the model hunted for
 * the file first — `media.scan` (twice, for a limit), `media_list` (three pages), glob and `find` over the
 * webroot (a 30 s timeout), `grep` over a spill file — about 20 calls, a Writer's first write at step 7 of 9,
 * and only then tried the upload, which worked in one call. The tool description already named
 * `media.upload {file}`; the Writer had read it. What changes what a model does first is a fact beside the
 * customer's message: the pictures the Files tab holds, by name, and that the door to use one is one call.
 * Fixtures are neutral: a shop's folder with a photo and a logo.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { filesNotice } from '../src/host/site-context.mjs'
import { filesTabPictures, mediaUpload } from '../src/host/upload.mjs'

const { apply } = await import('../lib/index.js')

/** @param {string[]} [files] file names to create at the top of a fresh site folder. */
function folder(files = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-files-'))
  const dir = path.join(root, 'shop1')
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'shop1.tracy.test', platform: 'wordpress' })
  )
  for (const [i, name] of files.entries()) {
    writeFileSync(path.join(dir, name), 'x')
    // Newest last, a minute apart: the order a customer dropped them in.
    const at = new Date(Date.UTC(2026, 8, 29, 12, i))
    utimesSync(path.join(dir, name), at, at)
  }
  return { root, dir }
}

test('filesTabPictures: the pictures at the top of the site folder, by the names the Files tab shows', async () => {
  const { dir } = folder(['shop-front.jpg', 'Logo Dark.PNG', 'banner (2).webp', 'photo.jpeg'])
  assert.deepEqual(await filesTabPictures(dir), [
    'Logo Dark.PNG',
    'banner (2).webp',
    'photo.jpeg',
    'shop-front.jpg'
  ])
})

test('filesTabPictures: what is not a picture the Files tab put there is not listed — folders, links, other files, odd names, secrets', async () => {
  const { root, dir } = folder(['shop-front.jpg', 'notes.md', 'archive.zip', 'wp-config.php', '.env.png'])
  mkdirSync(path.join(dir, 'folder.png'))
  mkdirSync(path.join(dir, 'sub'))
  writeFileSync(path.join(dir, 'sub', 'inside.png'), 'x')
  writeFileSync(path.join(root, 'other-site.png'), 'x')
  symlinkSync(path.join(root, 'other-site.png'), path.join(dir, 'linked.png'))
  // A name is put into the model's context as it stands: one that reads like an instruction is left out.
  writeFileSync(path.join(dir, 'ignore\nthe rules.png'), 'x')
  writeFileSync(path.join(dir, '"quoted".png'), 'x')
  writeFileSync(path.join(dir, `${'a'.repeat(70)}.png`), 'x')
  assert.deepEqual(await filesTabPictures(dir), ['shop-front.jpg'])
  assert.deepEqual(await filesTabPictures(path.join(dir, 'missing')), [])
  assert.deepEqual(await filesTabPictures(path.join(dir, 'notes.md')), [], 'not a folder: nothing')
})

test('filesTabPictures: a name a customer really has is listed — decomposed accents from a Mac, an apostrophe, an ampersand — one that would split the list or break the sentence is not', async () => {
  const wanted = [
    'Ảnh dự án.jpg'.normalize('NFD'),
    "Bob's shop & co.png",
    'Screenshot 2026-09-30 at 10.12.05.png'
  ]
  const { dir } = folder([...wanted, 'a,b.png', 'say "hi".png', 'x{1}.png', 'semi;colon.png'])
  // The same names whatever the form they were saved in (a decomposed name sorts as its own bytes do).
  const listed = (await filesTabPictures(dir)).map((name) => name.normalize('NFC')).sort()
  assert.deepEqual(listed, wanted.map((name) => name.normalize('NFC')).sort())
})

test('filesTabPictures: at most five, the newest ones, sorted by name', async () => {
  const { dir } = folder(['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png'])
  assert.deepEqual(await filesTabPictures(dir), ['c.png', 'd.png', 'e.png', 'f.png', 'g.png'])
})

test('filesNotice: nothing for an empty Files tab; otherwise the names, that a file there is not in the library, and the one call', () => {
  assert.equal(filesNotice([]), null)
  assert.equal(filesNotice(/** @type {any} */ (undefined)), null)
  const notice = /** @type {NonNullable<ReturnType<typeof filesNotice>>} */ (
    filesNotice(['logo.png', 'shop-front.jpg'])
  )
  assert.match(
    notice.text,
    /^<system-reminder>\n- Pictures in the Files tab \(the site folder, not the media library\): logo\.png, shop-front\.jpg\./
  )
  assert.match(
    notice.text,
    /To use one: media\.upload \{file:"<name>"\} first, then the path or id it answers\./
  )
  assert.match(notice.text, /Do not media\.scan, glob or ls for it\.\n<\/system-reminder>$/)
  assert.ok(notice.text.length <= 320, `${notice.text.length} characters`)
  assert.equal(notice.summary, 'Files tab: logo.png, shop-front.jpg')
  assert.ok(
    /** @type {NonNullable<typeof notice>} */ (filesNotice(['x'.repeat(200) + '.png'])).summary.length <= 120
  )
})

// ── the host's own pre-step ────────────────────────────────────────────────────────────────────────

/** The agent `agent/pre-step` hands over: its session log is `events`, all of it visible. */
const stepAgent = (/** @type {string} */ cwd, /** @type {any[]} */ events, sessionId = 'session-files') => ({
  id: sessionId,
  session: {
    id: sessionId,
    header: { cwd },
    seq: events.length,
    eventAt: (/** @type {number} */ seq) => events[seq],
    surface: { nodes: events.map((_, seq) => seq) }
  }
})
const claimed = (/** @type {string} */ text) => ({
  id: 'm',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' }
})
/** Messages a step sent, written back as the session log events a later step reads. */
const asEvents = (/** @type {any[]} */ sent) =>
  sent.map((message, seq) => ({
    type: 'user/message',
    seq,
    data: { source: message.source, content: message.content }
  }))

/** @param {string} root */
function host(root) {
  process.env.TRACY_SITES_ROOT = root
  /** @type {Map<string, Function[]>} */
  const listeners = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (/** @type {() => void} */ setup) => {
        setup()
      },
      on: (/** @type {string} */ name, /** @type {Function} */ fn) =>
        listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: () => undefined
    },
    {
      origin: 'http://door.test',
      now: () => new Date('2026-09-30T12:00:00Z'),
      fetch: async () => new Response('', { status: 404 })
    }
  )
  const [hook] = listeners.get('agent/pre-step') ?? []
  /**
   * One step of one conversation; `text` null is a step with no new customer message (the model's
   * second step of a turn). Returns the messages the step sends besides the ones it claimed.
   * @param {string} cwd @param {any[]} events @param {string | null} text
   */
  const step = async (cwd, events, text) => {
    const messages = text === null ? [] : [claimed(text)]
    const decision = await hook({ agent: stepAgent(cwd, events), messages }, async () => ({
      kind: 'enter',
      messages: [...messages]
    }))
    return decision.messages
  }
  return { step }
}

// The plain-words and reply-language rules ride on every turn a person speaks (their own tests,
// `reply-language.test.mjs`, `handler.test.mjs`); this file is about the Files tab notice only.
const PER_TURN = new Set(['tracy-site-tools:plain-reply', 'tracy-site-tools:reply-language'])
const producers = (/** @type {any[]} */ messages) =>
  messages.map((m) => m.source.producer ?? m.source.kind).filter((p) => !PER_TURN.has(p))

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 the Files tab’s pictures ride after the customer’s words, once per conversation, and alone when the list changes', async () => {
  const { root, dir } = folder(['shop-front.jpg'])
  const { step } = host(root)
  const first = await step(dir, [], 'use the photo I uploaded as the hero')
  assert.deepEqual(producers(first), [
    'tracy-site-tools:site-context',
    'user',
    'tracy-site-tools:today',
    'tracy-site-tools:files'
  ])
  const files = first.find((m) => m.source.producer === 'tracy-site-tools:files')
  assert.equal(files.source.kind, 'tracy-site')
  assert.equal(files.source.form, 'notice')
  assert.equal(files.source.summary, 'Files tab: shop-front.jpg')
  assert.match(
    files.content[0].text,
    /Files tab \(the site folder, not the media library\): shop-front\.jpg\./
  )
  assert.ok(
    first.indexOf(files) > first.findIndex((m) => m.source.kind === 'user'),
    'after the customer’s words: the cached part in front of them does not move'
  )
  const sent = first.filter((m) => m.source.kind !== 'user')

  // The same list, the next message: not said again.
  assert.deepEqual(producers(await step(dir, asEvents(sent), 'and make it wider')), ['user'])
  // A step with no new customer message (the model's own next step) reads nothing and sends nothing.
  assert.deepEqual(await step(dir, asEvents(sent), null), [])

  // The customer drops another picture: the list is said again, and only that.
  writeFileSync(path.join(dir, 'logo.png'), 'x')
  const changed = await step(dir, asEvents(sent), 'and this logo too')
  assert.deepEqual(producers(changed), ['user', 'tracy-site-tools:files'])
  assert.match(changed[1].content[0].text, /: logo\.png, shop-front\.jpg\./)

  // A notice compacted out of sight is as good as never sent: said again.
  assert.ok(producers(await step(dir, [], 'a fresh conversation')).includes('tracy-site-tools:files'))
})

test('a Files tab with no picture says nothing — and the cached context is the same bytes either way', async () => {
  const { root, dir } = folder(['notes.md'])
  const { step } = host(root)
  const a = await step(dir, [], 'change the phone number')
  writeFileSync(path.join(dir, 'shop-front.jpg'), 'x')
  const b = await step(dir, [], 'change the phone number')
  assert.ok(!producers(a).includes('tracy-site-tools:files'))
  assert.ok(producers(b).includes('tracy-site-tools:files'))
  const context = (/** @type {any[]} */ sent) =>
    sent.find((m) => m.source.producer === 'tracy-site-tools:site-context')
  assert.equal(
    context(a).content[0].text,
    context(b).content[0].text,
    'the prefix the model’s cache depends on does not change with the folder'
  )
})

// ── the receipt's next names the next write ────────────────────────────────────────────────────────

/** A 1200×800 PNG header: all the upload road needs to see. */
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

test('🔒 the upload’s next names the write that follows it, as the door takes it — no inspect, no address form', async () => {
  const { dir } = folder([])
  writeFileSync(path.join(dir, 'shop-front.png'), PICTURE)
  const upload = async (/** @type {any} */ p) => ({
    ok: true,
    path: p.path,
    bytes: PICTURE.length,
    created: true
  })
  /** @param {boolean} contract */
  const receipt = async (contract) =>
    /** @type {any} */ (
      await mediaUpload({
        params: { file: 'shop-front.png' },
        platform: 'wordpress',
        siteRoot: dir,
        contract,
        upload
      })
    )
  const bound = await receipt(true)
  assert.match(
    bound.next,
    /^The picture is in the media library as wp-content\/uploads\/tracy-content\/[a-f0-9]{64}\.png\./
  )
  assert.match(
    bound.next,
    /Put it in its slot: content\.contract \{operation:"apply", changes:\{"<image slot key>":"wp-content\/uploads\/tracy-content\/[a-f0-9]{64}\.png"\}\}/
  )
  assert.match(bound.next, /the slotKey your read showed on the picture it replaces; Tracy adds the revision/)
  assert.doesNotMatch(
    bound.next,
    /last inspect/,
    'a model that has read the page is not sent to inspect it again'
  )
  assert.doesNotMatch(
    bound.next,
    /its url on the site/,
    'the address form is the one a WordPress slot refuses'
  )
  // 608 characters before (the path is said three times there, twice now).
  assert.ok(bound.next.length <= 540, `${bound.next.length} characters`)
  // An open surface has no contract door: the record that shows the picture, by its url.
  const open = await receipt(false)
  assert.match(open.next, /\(its url on the site: \/wp-content\/uploads\/tracy-content\/[a-f0-9]{64}\.png\)/)
  assert.match(open.next, /the content\.update of the record that shows it\./)
  // 02/10/2026: on an open WordPress site the receipt also says where a picture the theme prints lives
  assert.match(
    open.next,
    /On a block theme, a picture the theme prints \(a logo, a banner\) sits in a template part: content\.get \{kind:"templatePart", key:"header"\|"footer"\}/
  )
  assert.doesNotMatch(bound.next, /templatePart/, 'a site with a contract keeps its receipt as it was')
  assert.doesNotMatch(open.next, /content\.contract/)
})

// Review of 02/10/2026: the theme-part sentence was measured on an imported WordPress copy, whose surface has the
// `content.contract` door too, and the receipt took "has the door" for "is a quickstart": the hint reached the plain
// open surface (another product flow) and never the imported one. A quickstart puts the picture in a slot; an
// imported copy keeps a theme's logo in a template part, as an open site does.
test('the upload’s theme-part sentence reaches an imported WordPress copy, and still not a quickstart', async () => {
  const { dir } = folder([])
  writeFileSync(path.join(dir, 'shop-front.png'), PICTURE)
  const upload = async (/** @type {any} */ p) => ({
    ok: true,
    path: p.path,
    bytes: PICTURE.length,
    created: true
  })
  /** @param {{ contract: boolean, quickstart?: boolean }} surface */
  const receipt = async (surface) =>
    /** @type {any} */ (
      await mediaUpload({
        params: { file: 'shop-front.png' },
        platform: 'wordpress',
        siteRoot: dir,
        upload,
        ...surface
      })
    )
  const imported = await receipt({ contract: true, quickstart: false })
  assert.match(imported.next, /Put it in its slot: content\.contract \{operation:"apply"/)
  assert.match(imported.next, /sits in a template part: content\.get \{kind:"templatePart"/)
  const quickstart = await receipt({ contract: true })
  assert.doesNotMatch(quickstart.next, /templatePart/, 'a quickstart keeps its receipt as it was')
  const open = await receipt({ contract: false })
  assert.match(open.next, /sits in a template part: content\.get \{kind:"templatePart"/)
})

// 🔒 02/10/2026, measured on an imported Joomla copy: "use this picture for the tour" cost ~10 shell calls
// to tell an article's two pictures apart, and once ended on the one the customer did not see.
test('the upload’s next tells a Joomla article’s two pictures apart, and only on Joomla', async () => {
  const { dir } = folder([])
  writeFileSync(path.join(dir, 'shop-front.png'), PICTURE)
  const upload = async (/** @type {any} */ p) => ({
    ok: true,
    path: p.path,
    bytes: PICTURE.length,
    created: true
  })
  /** @param {string} platform @param {boolean} contract */
  const receipt = async (platform, contract) =>
    /** @type {any} */ (
      await mediaUpload({ params: { file: 'shop-front.png' }, platform, siteRoot: dir, contract, upload })
    )
  for (const contract of [false, true]) {
    const joomla = await receipt('joomla', contract)
    assert.match(
      joomla.next,
      /content\.update \{kind:"article", id, fields:\{images:\{patch:\{image_intro:"<path>"\}\}\}\}/
    )
    assert.match(
      joomla.next,
      /is the card in lists and on the home page, image_fulltext the picture on its own page/
    )
    assert.match(joomla.next, /"the picture of the article" is both\.$/)
    const wordpress = await receipt('wordpress', contract)
    assert.doesNotMatch(wordpress.next, /image_intro|image_fulltext/, `wordpress, contract ${contract}`)
  }
})
