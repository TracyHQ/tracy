// The alt of a picture comes from the picture placed (step 8), not from the wish the writer wrote it from (step 6): the
// looker, which already sees every finished picture, writes its alt in the same answer, in the site's language, in the
// business's terms and within the slot's limit, and the export hands those alts to the write step. Initials get the
// person's name. Every word, picture and business here is invented; a fake endpoint stands in for the model.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { ALT_MAX, altAskFor, cleanAlt } from '../src/site-pictures/alt-ask.js'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { fileStore } from '../src/site-pictures/file-store.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { brief, kit, pictures, plan } from './_site-pictures-check.mjs'

const door = { providerId: 'openrouter', baseUrl: 'https://models.test/api/v1', apiKey: 'k', model: 'm' }
const prompt = { text: 'look', sha256: 'p'.repeat(64) }
const wish = {
  frame: 'f',
  match: 'specific',
  shows: 'a potter at the wheel',
  mustInclude: [],
  avoid: [],
  mood: null
}

function fakeModel(answer) {
  const sent = []
  const fetchImpl = async (_url, init) => {
    sent.push(JSON.parse(init.body).messages[1].content[0].text)
    const body = {
      model: door.model,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 60, cost: 0.0004 }
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { fetchImpl, sent }
}

async function look(answer, { altAsk, twin = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'looker-alt-'))
  try {
    const store = fileStore(dir)
    const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#556677' } })
      .jpeg()
      .toBuffer()
    const name = await store.putPicture(bytes, 'jpg')
    const idx = { frames: new Map([['f', { width: 300, height: 200 }]]), wishes: new Map([['f', wish]]) }
    const model = fakeModel(answer)
    const looker = createLooker({
      door,
      prompt,
      storeDir: dir,
      runId: 'r1',
      idx,
      alts: null,
      altAsk,
      fetchImpl: model.fetchImpl
    })
    const frames = [{ frame: 'f', source: 'owner-photo', file: name, sha256: name.split('.')[0] }]
    if (twin) frames.push({ frame: 'g', source: 'twin', twinOf: 'f', file: name, sha256: name.split('.')[0] })
    const looked = await looker.look({ frames, siteSettings: [], cost: {}, timing: {} })
    return { looked, sent: model.sent }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const ask = { language: 'de', business: 'Kiln Row Studio', limit: () => 60 }
const passWith = (alt) => ({ verdict: 'pass', faults: [], seen: 'A potter shapes a bowl on a wheel.', alt })

test('the looker writes the alt of the picture it sees, in the site language, within the slot limit', async () => {
  const { looked, sent } = await look(passWith('A potter in a green apron shapes a bowl'), { altAsk: ask })
  assert.equal(looked.doc.frames[0].alt, 'A potter in a green apron shapes a bowl')
  // The seen sentence stays the looker's own, in plain English; the look record is unchanged.
  assert.equal(looked.doc.frames[0].seen, 'A potter shapes a bowl on a wheel.')
  assert.equal(looked.doc.frames[0].looker.alt, undefined)
  assert.match(sent[0], /alt text/i)
  assert.match(sent[0], /"de"/)
  assert.match(sent[0], /Kiln Row Studio/)
  assert.match(sent[0], /at most 60 characters/)
})

test('a twin takes the alt of its source with its look', async () => {
  const { looked } = await look(passWith('A bowl on the wheel'), { altAsk: ask, twin: true })
  assert.equal(looked.doc.frames.find((e) => e.frame === 'g').alt, 'A bowl on the wheel')
})

test('without an alt ask the message asks for no alt and no entry gets one', async () => {
  const { looked, sent } = await look(passWith('Ignored words'))
  assert.equal(looked.doc.frames[0].alt, undefined)
  assert.doesNotMatch(sent[0], /alt text/i)
})

test('an answer without an alt is still a look; the frame gets no alt', async () => {
  const { looked } = await look(
    { verdict: 'pass', faults: [], seen: 'A potter shapes a bowl.' },
    { altAsk: ask }
  )
  assert.equal(looked.rule.status, 'pass')
  assert.equal(looked.doc.frames[0].alt, undefined)
})

test('an alt is held to the limit at a word, and loses double quotes and long dashes', () => {
  assert.equal(cleanAlt('A bowl — still wet – on the "wheel"', 125), 'A bowl, still wet, on the wheel')
  assert.equal(cleanAlt('One two three four five', 13), 'One two three')
  assert.equal(cleanAlt('Image of a bowl.', 125), 'Image of a bowl.')
  assert.equal(cleanAlt('   ', 125), null)
  assert.equal(cleanAlt(42, 125), null)
})

test('the alt ask reads the plan language and name, and the limit of the alt slot beside the picture', () => {
  const plan = { site: { language: 'fr', name: 'Fern Lane Ceramics' } }
  const k = {
    contentMap: {
      slots: [
        { key: 'module-8.5', entity: 'module-8', type: 'image', group: { id: 'r0', kind: 'gallery' } },
        {
          key: 'module-8.11',
          entity: 'module-8',
          type: 'text',
          sample: '',
          group: { id: 'r0', kind: 'gallery' },
          jsonPath: ['gallery', 'g', 'g[alt]', 0],
          maxCharacters: 40
        },
        { key: 'module-9.0', entity: 'module-9', type: 'image' }
      ]
    }
  }
  const got = altAskFor({ plan, kit: k })
  assert.equal(got.language, 'fr')
  assert.equal(got.business, 'Fern Lane Ceramics')
  assert.equal(got.limit('block-8.5'), 40)
  assert.equal(got.limit('block-9.0'), ALT_MAX)
  assert.equal(altAskFor({ plan: { site: {} }, kit: k }), null, 'no language, no alt asked')
})

test('the export hands the write step the alt of every placed picture, and the name of initials', () => {
  const m = pictures()
  const at = (id) => m.frames.find((e) => e.frame === id)
  at('block-2.0').alt = 'A hand-thrown bowl on the wheel'
  at('block-4.1').alt = 'Rosa Vell'
  at('block-7.1').alt = 'A drawn shelf of jugs'
  at('block-3.2').alt = 'Hidden frames never place an alt'
  const out = exportPictureMapping({
    pictures: m,
    contract: 'c',
    revision: 'r',
    kit: kit(),
    plan: plan(),
    brief: brief()
  })
  assert.deepEqual(out.alts, {
    'block-2.0': 'A hand-thrown bowl on the wheel',
    'block-4.1': 'Rosa Vell',
    'block-7.1': 'A drawn shelf of jugs'
  })
  assert.deepEqual(
    exportPictureMapping({
      pictures: pictures(),
      contract: 'c',
      revision: 'r',
      kit: kit(),
      plan: plan(),
      brief: brief()
    }).alts,
    {}
  )
})
