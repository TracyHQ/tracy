// Regression tests for the review findings F2 (bootstrap/content must not force), F3 (media/form
// repairs must not publish drafts) and F4 (media identity by content hash) against the mock
// EmDash API, using the non-Northgate DE/FR fixture (F5). They assert what the importer DID on
// the server (request log + resulting state), not only what it printed.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileP = promisify(execFile)
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const FIX = path.join(ROOT, 'tests/fixtures/mini')
const SEED = JSON.parse(readFileSync(path.join(FIX, 'seed/seed.json'), 'utf8'))
const LOGO = readFileSync(path.join(FIX, 'seed/media/logo.png'))
const OTHER = readFileSync(path.join(FIX, 'logo-other-bytes.png'))

let mock, site, work
before(async () => {
  mock = createMockEmdash()
  site = await mock.listen()
})
after(async () => {
  await mock.close()
})
beforeEach(() => {
  mock.state.entries.clear()
  mock.state.media.clear()
  mock.state.forms.clear()
  mock.state.log.length = 0
  for (const c of SEED.collections)
    mock.state.schema.set(c.slug, {
      item: { slug: c.slug, label: c.label },
      fields: c.fields.map((f) => ({
        ...f,
        required: !!f.required,
        unique: !!f.unique,
        searchable: !!f.searchable,
        indexed: !!f.indexed,
        validation: f.validation ?? null
      }))
    })
  work = mkdtempSync(path.join(tmpdir(), 'seed-apply-'))
  mkdirSync(path.join(work, 'data'))
  writeFileSync(path.join(work, 'data/tracy-agent.token'), 'ec_pat_testtoken_0123456789abcdef\n')
})
const receiptsFile = () => path.join(work, 'data/seed-receipts.json')
const receipts = () => JSON.parse(readFileSync(receiptsFile(), 'utf8'))
// The mock server lives in THIS process, so child processes must run asynchronously (a spawnSync
// would block the event loop and the importer would wait forever for its first answer).
async function sh(file, argv) {
  try {
    const r = await execFileP(file, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 })
    return { status: 0, code: 0, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr }
  } catch (e) {
    return {
      status: e.code,
      code: e.code,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      out: (e.stdout ?? '') + (e.stderr ?? '')
    }
  }
}
function run(cmd, ...extra) {
  return sh('node', [
    'tools/seed-apply.mjs',
    cmd,
    '--site',
    site,
    '--token-file',
    path.join(work, 'data/tracy-agent.token'),
    '--seed',
    path.join(FIX, 'seed'),
    '--config',
    path.join(FIX, 'template.config.json'),
    '--receipts',
    receiptsFile(),
    '--forms',
    path.join(FIX, 'forms.json'),
    ...extra
  ])
}
const writes = () => mock.state.log.filter((l) => l.method !== 'GET' && !/forms\/list/.test(l.path))
const entry = (coll, slug, locale) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === coll && e.slug === slug && e.locale === locale
  )
/** What EmDash's first-run setup leaves behind: every seed entry published, no receipts anywhere. */
function setupApplied() {
  for (const [coll, list] of Object.entries(SEED.content))
    for (const e of list) mock.state.addEntry(coll, e.slug, e.locale, e.data)
}
/** An editor saves and publishes a change through the admin UI. */
function editorPublishes(e, patch) {
  e.live = { ...e.live, ...patch }
  e.version++
  e.updatedAt = new Date(Date.now() + ++mock.state.counter).toISOString()
  e.liveRevisionId = `REV-editor-${e.version}`
}
function editorDrafts(e, patch) {
  e.draft = { ...e.draft, ...patch }
  e.draftRevisionId = `DRF-editor-${e.version}`
  e.version++
  e.updatedAt = new Date(Date.now() + ++mock.state.counter).toISOString()
}

describe('F2 — content reconcile without --force', () => {
  it('adopts entries an earlier setup wrote (live == seed) without a single write', async () => {
    setupApplied()
    const r = await run('content')
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(writes(), [], 'no PUT/POST for entries the site already holds')
    assert.equal(Object.keys(receipts().entries).length, 4)
    assert.match(r.out, /adopt +seiten\/start\/de/)
  })
  it('creates missing entries and publishes them; a rerun is all `same`', async () => {
    let r = await run('content')
    assert.equal(r.code, 0, r.out)
    assert.equal(entry('seiten', 'start', 'fr').status, 'published')
    assert.equal(entry('seiten', 'start', 'fr').live.titel, 'Bienvenue')
    mock.state.log.length = 0
    r = await run('content')
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(writes(), [])
    assert.equal((r.out.match(/did {2}same/g) ?? []).length, 4)
  })
  it("keeps an editor's published change when the seed is unchanged (no overwrite, receipt untouched)", async () => {
    await run('content')
    const before = receipts().entries['seiten/start/de']
    const e = entry('seiten', 'start', 'de')
    editorPublishes(e, { titel: "Editor's title" })
    mock.state.log.length = 0
    const r = await run('content')
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(writes(), [])
    assert.equal(e.live.titel, "Editor's title")
    assert.match(r.out, /editor +seiten\/start\/de.*keeping theirs/)
    assert.deepEqual(
      receipts().entries['seiten/start/de'],
      before,
      'receipt keeps OUR last rev so the divergence stays visible'
    )
  })
  it('reports a conflict, exit 3, no write, when both the seed and an editor changed the entry', async () => {
    await run('content')
    const e = entry('seiten', 'start', 'de')
    editorPublishes(e, { titel: "Editor's title" })
    // the seed changes too: a modified copy of the fixture
    const seed2 = mkdtempSync(path.join(tmpdir(), 'seed2-'))
    cpSync(path.join(FIX, 'seed'), seed2, { recursive: true })
    const s = JSON.parse(readFileSync(path.join(seed2, 'seed.json'), 'utf8'))
    s.content.seiten[0].data.titel = 'Seed v2 title'
    writeFileSync(path.join(seed2, 'seed.json'), JSON.stringify(s))
    mock.state.log.length = 0
    const r = await sh('node', [
      'tools/seed-apply.mjs',
      'content',
      '--site',
      site,
      '--token-file',
      path.join(work, 'data/tracy-agent.token'),
      '--seed',
      seed2,
      '--config',
      path.join(FIX, 'template.config.json'),
      '--receipts',
      receiptsFile()
    ])
    assert.equal(r.status, 3, r.stdout + r.stderr)
    assert.deepEqual(writes(), [])
    assert.equal(e.live.titel, "Editor's title")
    assert.match(r.stdout, /conflict +seiten\/start\/de/)
    assert.equal(receipts().runs.at(-1).conflicts, 1)
  })
  it('does not silently adopt an untracked entry whose live content differs from the seed (lost receipts)', async () => {
    setupApplied()
    const e = entry('kontakt', 'kontakt', 'fr')
    editorPublishes(e, { titel: 'Nous contacter' })
    const r = await run('content')
    assert.equal(r.code, 3, r.out)
    assert.deepEqual(writes(), [])
    assert.equal(e.live.titel, 'Nous contacter')
    assert.equal(receipts().entries['kontakt/kontakt/fr'], undefined, 'not claimed')
    assert.equal(Object.keys(receipts().entries).length, 3, 'the three matching ones are adopted')
  })
})

describe('G8 findings — adopt after a no-op rev bump; --force scope; runs log', () => {
  it('adopt re-claims a tracked entry whose rev moved while live still equals the seed (e.g. discard-draft)', async () => {
    await run('content')
    const e = entry('seiten', 'start', 'de')
    editorDrafts(e, { titel: 'tmp' })
    e.draft = null
    e.draftRevisionId = null // draft made, then discarded: rev bumped, live unchanged
    let r = await run('content')
    assert.match(r.out, /editor +seiten\/start\/de/)
    mock.state.log.length = 0
    r = await run('adopt')
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /adopt +seiten\/start\/de.*receipt was behind/)
    assert.deepEqual(writes(), [])
    r = await run('content')
    assert.match(r.out, /same +seiten\/start\/de/)
  })
  it('--force resolves conflicts only; editor-changed entries with an unchanged seed stay unless --force-all', async () => {
    await run('content')
    editorPublishes(entry('seiten', 'start', 'de'), { titel: 'Editor DE' }) // seed unchanged → `editor`
    editorPublishes(entry('kontakt', 'kontakt', 'fr'), { titel: 'Editor FR' }) // seed will change → conflict
    const seed2 = mkdtempSync(path.join(tmpdir(), 'seed2-'))
    cpSync(path.join(FIX, 'seed'), seed2, { recursive: true })
    const s = JSON.parse(readFileSync(path.join(seed2, 'seed.json'), 'utf8'))
    s.content.kontakt[1].data.titel = 'Contact v2'
    writeFileSync(path.join(seed2, 'seed.json'), JSON.stringify(s))
    const seedArgs = [
      '--site',
      site,
      '--token-file',
      path.join(work, 'data/tracy-agent.token'),
      '--seed',
      seed2,
      '--config',
      path.join(FIX, 'template.config.json'),
      '--receipts',
      receiptsFile()
    ]
    let r = await sh('node', ['tools/seed-apply.mjs', 'content', ...seedArgs, '--force'])
    assert.equal(r.code, 0, r.out)
    assert.equal(entry('kontakt', 'kontakt', 'fr').live.titel, 'Contact v2', 'conflict resolved for the seed')
    assert.equal(
      entry('seiten', 'start', 'de').live.titel,
      'Editor DE',
      'editor-only change untouched by --force'
    )
    assert.match(r.out, /editor +seiten\/start\/de/)
    r = await sh('node', ['tools/seed-apply.mjs', 'content', ...seedArgs, '--force-all'])
    assert.equal(r.code, 0, r.out)
    assert.equal(entry('seiten', 'start', 'de').live.titel, 'Willkommen', '--force-all resets it')
    assert.equal(receipts().entries['seiten/start/de'].forcedOver, 'editor')
  })
  it('receipts.runs keeps one record per run, marked finished only at the end', async () => {
    await run('content')
    await run('media')
    const runs = receipts().runs
    assert.equal(runs.length, 2)
    assert.ok(runs.every((x) => x.finished === true))
    assert.deepEqual(
      runs.map((x) => x.command),
      ['content', 'media']
    )
  })
})

describe('F2 — the bootstrap wrapper (real entrypoint)', () => {
  function bootstrap() {
    return sh('bash', [
      'tools/bootstrap-site.sh',
      site,
      path.join(work, 'data'),
      '--config',
      path.join(FIX, 'template.config.json'),
      '--seed',
      path.join(FIX, 'seed')
    ])
  }
  it("never passes --force; a rerun after an editor's publish keeps the edit; first run adopts setup content", async () => {
    mock.state.needsSetup = true
    setupApplied() // what the setup POST would leave behind (the mock's setup route stores the body only)
    let r = await bootstrap()
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(mock.state.setupBody.title, 'Atelier Nord', 'identity comes from template.config.json')
    assert.equal(mock.state.setupBody.tagline, 'Möbel aus Holz')
    assert.ok(!/--force/.test(r.stdout + r.stderr))
    // an editor publishes a change on an entry with no pending media/form repair → clean rerun, exit 0
    const k = entry('kontakt', 'kontakt', 'de')
    editorPublishes(k, { titel: 'Kontaktieren Sie uns' })
    mock.state.log.length = 0
    r = await bootstrap()
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(k.live.titel, 'Kontaktieren Sie uns', "editor's published text survives a bootstrap rerun")
    assert.deepEqual(
      writes().filter((w) => /\/content\//.test(w.path)),
      [],
      'no content write at all'
    )
    assert.match(r.stdout, /setup already complete; reconciling without --force/)
    // an editor replaces the seeded image and text on a media-target entry → both kept, no write
    const e = entry('seiten', 'start', 'fr')
    e.live.bild = { id: 'EDITORS-OWN-IMAGE' }
    editorPublishes(e, { text: "Texte de l'éditeur" })
    mock.state.log.length = 0
    r = await bootstrap()
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(e.live.text, "Texte de l'éditeur")
    assert.equal(e.live.bild.id, 'EDITORS-OWN-IMAGE', "editor's image kept")
    assert.deepEqual(
      writes().filter((w) => w.path.includes(e.id)),
      [],
      'no write to the editor-changed entry'
    )
  })
  it('exits 3 with guidance when seed and editor both changed (wrapper, not helper)', async () => {
    await run('content')
    editorPublishes(entry('kontakt', 'kontakt', 'de'), { titel: 'Kontaktieren Sie uns' })
    const cfg = JSON.parse(readFileSync(path.join(FIX, 'template.config.json'), 'utf8'))
    const seed2 = mkdtempSync(path.join(tmpdir(), 'seed2-'))
    cpSync(path.join(FIX, 'seed'), seed2, { recursive: true })
    const s = JSON.parse(readFileSync(path.join(seed2, 'seed.json'), 'utf8'))
    s.content.kontakt[0].data.titel = 'Kontakt v2'
    writeFileSync(path.join(seed2, 'seed.json'), JSON.stringify(s))
    writeFileSync(
      path.join(work, 'cfg.json'),
      JSON.stringify({ ...cfg, forms: { ...cfg.forms, file: path.join(FIX, 'forms.json') } })
    )
    const r = await sh('bash', [
      'tools/bootstrap-site.sh',
      site,
      path.join(work, 'data'),
      '--config',
      path.join(work, 'cfg.json'),
      '--seed',
      seed2
    ])
    assert.equal(r.status, 3, r.stdout + r.stderr)
    assert.match(r.stderr, /need a decision/)
    assert.equal(entry('kontakt', 'kontakt', 'de').live.titel, 'Kontaktieren Sie uns')
  })
})

describe('F3 — media/form repairs never publish a pending draft', () => {
  it('skips an entry that has a published version and a different unpublished draft; both survive', async () => {
    await run('content')
    const e = entry('seiten', 'start', 'de')
    editorDrafts(e, { titel: 'UNPUBLISHED EDITOR DRAFT' })
    const rec = receipts().entries['seiten/start/de']
    mock.state.log.length = 0
    const r = await run('media')
    assert.equal(r.code, 3, r.out)
    const contentWrites = writes().filter((w) => w.path.includes(e.id))
    assert.deepEqual(contentWrites, [], 'no PUT and no /publish on the drafted entry')
    assert.equal(e.live.titel, 'Willkommen', 'public text unchanged')
    assert.equal(e.draft.titel, 'UNPUBLISHED EDITOR DRAFT', 'draft unchanged')
    assert.equal(e.draftRevisionId !== null, true)
    assert.deepEqual(receipts().entries['seiten/start/de'], rec, 'receipt not rewritten')
    assert.match(r.out, /conflict +seiten\/start\/de.*pending draft/)
    // the sibling without a draft was patched from its PUBLIC data
    const fr = entry('seiten', 'start', 'fr')
    assert.equal(fr.live.bild?.id, [...mock.state.media.values()][0].id)
    assert.equal(fr.draft, null)
  })
  it('form binding: same rule (draft → conflict, no publish); editor divergence → conflict', async () => {
    await run('content')
    const de = entry('kontakt', 'kontakt', 'de')
    const fr = entry('kontakt', 'kontakt', 'fr')
    editorDrafts(de, { titel: 'Entwurf' })
    editorPublishes(fr, { titel: 'Contactez-nous' })
    mock.state.log.length = 0
    const r = await run('forms')
    assert.equal(r.code, 3, r.out)
    assert.equal(mock.state.forms.size, 2, 'forms themselves are created')
    assert.deepEqual(
      writes().filter((w) => /\/content\//.test(w.path)),
      []
    )
    assert.equal(de.draft.titel, 'Entwurf')
    assert.equal(de.live.formular_id, undefined)
    assert.equal(fr.live.titel, 'Contactez-nous')
    assert.equal(fr.live.formular_id, undefined)
    assert.match(r.out, /kontakt\/kontakt\/de.*pending draft/)
    assert.match(r.out, /kontakt\/kontakt\/fr.*editor changed/)
  })
  it('binds the form id on a clean entry from liveData and publishes only that', async () => {
    await run('content')
    const r = await run('forms')
    assert.equal(r.code, 0, r.out)
    const de = entry('kontakt', 'kontakt', 'de')
    assert.equal(de.live.formular_id, [...mock.state.forms.values()].find((f) => f.slug === 'anfrage-de').id)
    assert.equal(de.draft, null)
  })
})

describe('F4 — media identity is the content hash, never filename+size', () => {
  it('does not reuse a library item with the same name and size but different bytes', async () => {
    await run('content')
    assert.equal(LOGO.length, OTHER.length)
    const old = mock.state.addMedia('logo.png', OTHER)
    const r = await run('media')
    assert.equal(r.code, 0, r.out)
    const rec = receipts().media.logo
    assert.notEqual(rec.mediaId, old.id, 'a new item was uploaded')
    assert.equal(mock.state.media.get(rec.mediaId).contentHash, rec.contentHash)
    assert.equal(rec.contentHash, `sha1:${await_sha1(LOGO)}`)
    assert.match(r.out, /upload +media:logo/)
  })
  it('reuses a byte-identical library item through the hash dedupe API, hash verified from the server', async () => {
    await run('content')
    const same = mock.state.addMedia('anything-else.png', LOGO)
    const r = await run('media')
    assert.equal(r.code, 0, r.out)
    assert.equal(receipts().media.logo.mediaId, same.id)
    assert.equal(receipts().media.logo.reused, true)
    assert.equal(mock.state.log.filter((l) => l.path.endsWith('/upload')).length, 0, 'no bytes uploaded')
  })
  it("re-uploads when the receipt's library item no longer carries our bytes", async () => {
    await run('content')
    await run('media')
    const first = receipts().media.logo.mediaId
    mock.state.media.get(first).contentHash = 'sha1:0000000000000000000000000000000000000000'
    const r = await run('media')
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /stale +media:logo/)
    assert.notEqual(receipts().media.logo.mediaId, first)
  })
})

import { createHash } from 'node:crypto'
function await_sha1(b) {
  return createHash('sha1').update(b).digest('hex')
}
