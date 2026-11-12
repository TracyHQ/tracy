import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { darkenPicture, luminanceOf } from '../src/site-pictures/darken.js'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fileFields } from '../src/site-pictures/frame-entries.js'
import { createFinisher } from '../src/site-pictures/ladder-step.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { applyPicks } from '../src/site-pictures/picker-picks.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const TEXT = 'text would not read'
// The actual rejected photographs average 0.399/0.404/0.416. A bright table area amid a dark room reproduces why
// average brightness alone cannot establish readability, without retaining any customer photograph in the repository.
async function brightPatch() {
  const patch = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  return sharp({ create: { width: 200, height: 100, channels: 3, background: '#000000' } })
    .composite([{ input: patch, left: 0, top: 0 }])
    .jpeg()
    .toBuffer()
}
async function fixture(
  t,
  { frameExtra = {}, entryExtra = {}, faults = [TEXT], always = false, unreadableAfter = false } = {}
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wo-readability-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = fileStore(dir)
  const bytes = await brightPatch()
  await store.putPicture(bytes, 'jpg')
  const originalSha = sha(bytes)
  const frame = {
    id: 'block-hero.0',
    kind: 'photo',
    width: 200,
    height: 100,
    shownAs: 'background',
    canHide: true,
    ...frameExtra
  }
  const idx = {
    frames: new Map([[frame.id, frame]]),
    wishes: new Map([
      [frame.id, { frame: frame.id, match: 'specific', shows: 'An empty table before service.', avoid: [] }]
    ]),
    twinsOf: new Map(),
    listOf: () => 'frames'
  }
  const doc = {
    frames: [
      {
        frame: frame.id,
        source: 'owner-photo',
        asset: 'owner',
        ...fileFields({ sha256: originalSha, ext: 'jpg', width: 200, height: 100 }),
        darkened: false,
        ...entryExtra
      }
    ],
    siteSettings: [],
    pending: [],
    returns: [],
    usage: [],
    picks: [],
    cost: {},
    timing: {}
  }
  const calls = []
  const prompts = picturePrompts()
  const finisher = () =>
    createFinisher({
      idx,
      plan: {},
      kit: {},
      usable: [],
      photoBytes: new Map(),
      store,
      drawing: null,
      drawer: null,
      looker: createLooker({
        idx,
        alts: null,
        storeDir: dir,
        runId: 'retry',
        door: {
          providerId: 'openrouter',
          baseUrl: 'https://example.test/api',
          apiKey: 'test',
          model: 'test/looker'
        },
        prompt: { text: prompts.looker, sha256: prompts.roles.looker },
        fetchImpl: async (_url, init) => {
          calls.push(JSON.parse(init.body))
          const failed = always || calls.length === 1
          if (unreadableAfter && calls.length > 1)
            return new Response(
              JSON.stringify({ choices: [{ message: { content: 'not a readable verdict' } }] }),
              { headers: { 'content-type': 'application/json' } }
            )
          const said = {
            verdict: failed ? 'fail' : 'pass',
            faults: failed ? faults : [],
            seen: 'A table in a room.'
          }
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(said) } }],
              usage: { cost: 0.001 }
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
      })
    })
  return { doc, bytes, originalSha, store, calls, finisher, idx }
}

test('a low-mean bright patch receives one readability transform and a fresh independent look before fallback', async (t) => {
  const f = await fixture(t)
  assert.ok((await luminanceOf(f.bytes)) < 0.42)
  assert.equal(await darkenPicture(f.bytes), null)
  const out = await f.finisher().finish(f.doc, { lastRound: true })
  const entry = out.doc.frames[0]
  assert.equal(entry.source, 'owner-photo')
  assert.notEqual(entry.sha256, f.originalSha)
  assert.equal(entry.looker.verdict, 'pass')
  assert.equal(f.calls.length, 2)
  assert.equal(out.doc.readabilityRetries.length, 1)
  assert.equal(out.doc.readabilityRetries[0].sourceSha256, f.originalSha)
  assert.equal(out.doc.readabilityRetries[0].sha256, entry.sha256)
  assert.equal(out.doc.readabilityRetries[0].strength, 0.45)
  assert.equal(out.doc.looker.calls.length, 2)
  assert.deepEqual(
    f.calls.map((c) => c.messages.length),
    [2, 2]
  )
  assert.notDeepEqual(f.calls[0].messages[1].content[1], f.calls[1].messages[1].content[1])
  assert.ok(!out.doc.ladder.some((row) => row.steps.some((step) => step.rung === 'hide')))
})

test('mixed readability and subject failures advance fallback without any transform or extra look', async (t) => {
  const f = await fixture(t, { faults: [TEXT, 'wrong subject'], always: true })
  const out = await f.finisher().finish(f.doc, { lastRound: true })
  assert.equal(f.calls.length, 1)
  assert.equal(out.doc.readabilityRetries.length, 0)
  assert.equal(out.doc.frames[0].source, 'hide')
  const rejected = out.doc.ladder.flatMap((row) => row.steps).filter((step) => step.outcome === 'rejected')
  assert.ok(rejected.some((step) => step.detail.includes('wrong subject')))
})

test('replaying the original or completed manifest reuses deterministic files and cached independent looks', async (t) => {
  const f = await fixture(t)
  const first = await f.finisher().finish(f.doc, { lastRound: true })
  const replay = await f.finisher().finish(f.doc, { lastRound: true })
  assert.equal(f.calls.length, 2)
  assert.equal(replay.doc.frames[0].sha256, first.doc.frames[0].sha256)
  assert.equal(replay.paid, 0)
  const resumed = await f.finisher().finish(first.doc, { lastRound: true })
  assert.equal(f.calls.length, 2)
  assert.equal(resumed.doc.readabilityRetries.length, 1)
  assert.equal(resumed.doc.frames[0].sha256, first.doc.frames[0].sha256)
  assert.equal(resumed.paid, 0)
})

test('cut-outs and verified template overlays never receive a readability retry', async (t) => {
  for (const opts of [
    { frameExtra: { kind: 'cutout' }, entryExtra: { cutout: { figure: 0.5 } } },
    { frameExtra: { templateOverlay: { colour: '#000000', strength: 0.6, from: 'fixture' } } }
  ]) {
    const f = await fixture(t, opts)
    const out = await f.finisher().finish(f.doc, { lastRound: true })
    assert.equal(f.calls.length, 1)
    assert.equal(out.doc.readabilityRetries?.length ?? 0, 0)
    assert.equal(out.doc.frames[0].sha256, f.originalSha)
  }
})

test('an unknown template mask does not exempt a candidate and repeated readability failure advances fallback', async (t) => {
  const f = await fixture(t, { frameExtra: { templateOverlay: 'unknown' }, always: true })
  const out = await f.finisher().finish(f.doc, { lastRound: true })
  assert.equal(f.calls.length, 2)
  assert.equal(out.doc.readabilityRetries.length, 1)
  assert.equal(out.doc.frames[0].source, 'hide')
  assert.match(JSON.stringify(f.calls[0].messages), /overlay over it is unknown/)
})

test('a previously retried source cannot receive another transform when reintroduced in a later round', async (t) => {
  const f = await fixture(t)
  const first = await f.finisher().finish(f.doc, { lastRound: true })
  const originalAgain = { ...f.doc, readabilityRetries: first.doc.readabilityRetries }
  const out = await f.finisher().finish(originalAgain, { lastRound: true })
  assert.equal(f.calls.length, 2)
  assert.equal(out.files.length, 0)
  assert.equal(out.doc.readabilityRetries.length, 1)
  assert.equal(out.doc.frames[0].source, 'hide')
})

test('picker fix rounds preserve transformed bytes and retry history when the same original candidate is selected', async (t) => {
  const f = await fixture(t)
  const first = await f.finisher().finish(f.doc, { lastRound: true })
  const ready = {
    base: {},
    parts: { frames: [], siteSettings: [], pending: [], returns: [], usage: [] },
    idx: f.idx,
    picker: {
      frames: [
        {
          frame: 'block-hero.0',
          list: 'frames',
          candidates: new Map([
            [
              'photo1',
              {
                asset: 'owner',
                sha256: f.originalSha,
                ext: 'jpg',
                width: 200,
                height: 100
              }
            ]
          ])
        }
      ]
    }
  }
  const changed = applyPicks(
    first.doc,
    { changes: [{ frame: 'block-hero.0', photo: 'photo1', reason: 'same owner image' }] },
    { ready }
  )
  assert.equal(changed.ok, true)
  assert.deepEqual(changed.doc.readabilityRetries, first.doc.readabilityRetries)
  assert.equal(changed.doc.frames[0].sha256, first.doc.frames[0].sha256)
  const out = await f.finisher().finish(changed.doc, { lastRound: true })
  assert.equal(f.calls.length, 2)
  assert.equal(out.doc.frames[0].looker.verdict, 'pass')
  assert.equal(out.doc.readabilityRetries.length, 1)
  assert.equal(out.paid, 0)
})

test('a transformed picture cannot pass without a readable independent verdict', async (t) => {
  const f = await fixture(t, { unreadableAfter: true })
  const out = await f.finisher().finish(f.doc, { lastRound: true })
  assert.equal(f.calls.length, 3)
  assert.equal(out.doc.readabilityRetries.length, 1)
  assert.notEqual(out.doc.frames[0].sha256, f.originalSha)
  assert.equal(out.doc.frames[0].looker.verdict, 'fail')
  assert.deepEqual(out.doc.frames[0].looker.faults, ['look unreadable'])
  assert.equal(out.rule.status, 'fail')
})

test('processing policy changes the run lifetime fingerprint without changing role prompt hashes', async () => {
  const prompts = picturePrompts()
  const legacy = sha(
    Object.entries(prompts.roles)
      .map(([role, hash]) => `${role} ${hash}`)
      .join('\n')
  )
  assert.equal(prompts.policy, 'readability-retry/2')
  assert.notEqual(prompts.sha256, legacy)
})
