// An any-real frame takes any real owner photo that fits it (spec #336, ADR 0043 section 3b): the looker is told so, is
// not shown the plan's subject words, may not name "wrong subject" for it, and code drops that fault if the model names
// it anyway. Every other fault still fails the picture, and a specific frame keeps the full subject check. A fake
// endpoint stands in for the model; no real call.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { fileStore } from '../src/site-pictures/file-store.js'
import { lookMessage, lookWords, readLook } from '../src/site-pictures/looker-call.js'
import { createLooker } from '../src/site-pictures/looker-step.js'

const door = {
  providerId: 'openrouter',
  baseUrl: 'https://models.test/api/v1',
  apiKey: 'k',
  model: 'openai/gpt-6-luna'
}
const prompt = { text: 'look', sha256: 'p'.repeat(64) }
const wishOf = (match) => ({
  frame: 'f',
  match,
  shows: 'a coach holding pads for a boxer',
  mustInclude: ['pads'],
  avoid: ['other gym signage'],
  mood: 'focused'
})

// A model that always gives `answer`, and remembers the user messages it was sent.
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

async function lookOnce(match, answer) {
  const dir = await mkdtemp(path.join(tmpdir(), 'looker-any-real-'))
  try {
    const store = fileStore(dir)
    const bytes = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 90, b: 90 } }
    })
      .jpeg()
      .toBuffer()
    const name = await store.putPicture(bytes, 'jpg')
    const idx = {
      frames: new Map([['f', { width: 400, height: 300 }]]),
      wishes: new Map([['f', wishOf(match)]])
    }
    const model = fakeModel(answer)
    const looker = createLooker({
      door,
      prompt,
      storeDir: dir,
      runId: 'r1',
      idx,
      alts: null,
      fetchImpl: model.fetchImpl
    })
    const doc = {
      frames: [{ frame: 'f', source: 'owner-photo', file: name, sha256: name.split('.')[0] }],
      siteSettings: [],
      cost: {},
      timing: {}
    }
    const looked = await looker.look(doc)
    return { looked, sent: model.sent }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const wrongSubject = {
  verdict: 'fail',
  faults: ['wrong subject'],
  seen: 'Two boxers spar in a ring.'
}

test('an any-real frame passes a real owner photo the model calls the wrong subject', async () => {
  const { looked, sent } = await lookOnce('any-real', wrongSubject)
  assert.equal(looked.rule.status, 'pass')
  assert.deepEqual(looked.doc.frames[0].looker, {
    verdict: 'pass',
    faults: [],
    seen: 'Two boxers spar in a ring.'
  })
  // The model was told the frame takes any real photo, was not given the subject words, nor offered the fault.
  assert.match(sent[0], /accepts any real photo of the business/)
  assert.doesNotMatch(sent[0], /coach holding pads|mustInclude/)
  assert.doesNotMatch(sent[0], /"wrong subject"/)
  assert.match(sent[0], /other gym signage/)
  assert.match(looked.rule.notes.join('\n'), /wrong subject/)
})

test('a specific frame with the same answer fails', async () => {
  const { looked, sent } = await lookOnce('specific', wrongSubject)
  assert.equal(looked.rule.status, 'fail')
  assert.deepEqual(looked.doc.frames[0].looker.faults, ['wrong subject'])
  assert.match(sent[0], /coach holding pads/)
  assert.match(sent[0], /"wrong subject"/)
  assert.doesNotMatch(sent[0], /accepts any real photo/)
})

test('an any-real frame still fails a forbidden item, with or without a wrong subject beside it', async () => {
  const { looked } = await lookOnce('any-real', {
    verdict: 'fail',
    faults: ['wrong subject', 'forbidden item'],
    seen: 'A gym front with another gym sign.'
  })
  assert.equal(looked.rule.status, 'fail')
  assert.deepEqual(looked.doc.frames[0].looker.faults, ['forbidden item'])
  assert.match(looked.rule.failures[0].detail, /forbidden item/)
})

test('the pure parts: words, message and reading follow the frame match', () => {
  assert.deepEqual(lookWords(wishOf('any-real')), {
    match: 'any-real',
    avoid: ['other gym signage'],
    mood: 'focused'
  })
  assert.equal(lookWords(wishOf('specific')).shows, 'a coach holding pads for a boxer')
  const image = { base64: 'AAAA', width: 10, height: 10 }
  const text = lookMessage({ words: lookWords(wishOf('any-real')), image, outlined: false, anyReal: true })[0]
    .text
  assert.match(text, /accepts any real photo/)
  assert.doesNotMatch(text, /"wrong subject"/)
  assert.deepEqual(readLook(JSON.stringify(wrongSubject), { anyReal: true }), {
    verdict: 'pass',
    faults: [],
    seen: 'Two boxers spar in a ring.',
    dropped: ['wrong subject']
  })
  assert.equal(readLook(JSON.stringify(wrongSubject)).verdict, 'fail')
})

// A real run passed a gallery photo with two people cut at the chin: the any-real rules let a cut through the subject
// pass unless "what is left cannot be read", and no fault named a cut head. "face cut" fails any picture frame.
const faceCut = {
  verdict: 'fail',
  faults: ['face cut'],
  seen: 'Two tennis players on a clay court, cut at the chin.'
}

test('an any-real frame fails a picture whose edge cuts a head, and is offered the fault', async () => {
  const { looked, sent } = await lookOnce('any-real', faceCut)
  assert.equal(looked.rule.status, 'fail')
  assert.deepEqual(looked.doc.frames[0].looker.faults, ['face cut'])
  assert.match(sent[0], /"face cut"/)
  const both = await lookOnce('any-real', { ...faceCut, faults: ['wrong subject', 'face cut'] })
  assert.deepEqual(both.looked.doc.frames[0].looker.faults, ['face cut'])
})

test('a specific frame fails a cut head too', async () => {
  const { looked, sent } = await lookOnce('specific', faceCut)
  assert.equal(looked.rule.status, 'fail')
  assert.match(sent[0], /"face cut"/)
})

test('the looker prompt names the face cut fault and holds it for any-real frames', async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(new URL('../src/site-pictures/looker-prompt.md', import.meta.url), 'utf8')
  assert.match(text, /^- face cut: /m)
  // The any-real paragraph lists it among the faults that still fail the picture.
  const anyReal = text.slice(
    text.indexOf('accepts any real photo'),
    text.indexOf('When the message says part')
  )
  assert.match(anyReal, /face cut/)
})
