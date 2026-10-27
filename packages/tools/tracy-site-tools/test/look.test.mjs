/**
 * Who sees the page `page.look` photographs. The rule under test is one sentence: the answer the
 * agent gets must match what `read_image` would actually do with that file on this session's model —
 * the picture itself when it can open it (W4; the old invitation when the store cannot take it), a
 * description when it cannot, and the plain truth when nothing can. No model, no dsh and no browser: the services are fakes, so every branch is pinned here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  answerContent,
  imageModel,
  pageSeen,
  pictureRef,
  readsImages,
  sessionRoute
} from '../src/host/look.mjs'

const FLASH = { provider: 'deepseek-official', id: 'deepseek-v4-flash', inputModalities: ['text'] }
const VISION = {
  provider: 'deepseek-official',
  id: 'deepseek-v4-flash-vision-exp',
  inputModalities: ['text', 'image']
}

/** A screenshot on disk — the bytes never reach a decoder here, only the fake store. */
function screenshot() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'look-')), '1757980000000.png')
  writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex'))
  return { file, url: 'http://demonam2-web-1/' }
}

/**
 * One lane: which models it knows, which model the session runs, and what the image-capable model
 * answers. `calls` records every route the model runtime was asked to stream.
 */
function lane({ catalog = [VISION, FLASH], session = FLASH, answer = 'A header reading Bakery.' } = {}) {
  const calls = []
  const llm = {
    resolveModelInfo: (provider, model) => {
      const found = catalog.find((entry) => entry.provider === provider && entry.id === model)
      return Promise.resolve(found ?? { provider, id: model, inputModalities: ['text'] })
    },
    listModels: () => Promise.resolve(catalog),
    stream: (options) => {
      calls.push(options)
      return (async function* () {
        if (answer instanceof Error) {
          yield {
            type: 'finish',
            reason: { kind: 'error', failure: { code: 'MODEL_FAILED', message: answer.message } }
          }
          return
        }
        yield { type: 'text-delta', text: answer }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    }
  }
  const saved = []
  const attachments = {
    saveImage: (input) => {
      saved.push(input)
      return Promise.resolve({
        attachmentId: 'sha256:1',
        mediaType: input.mediaType,
        bytes: input.data.length
      })
    }
  }
  const services = {
    llm,
    attachments,
    agentDefaultModel: { currentSelection: () => ({ provider: session.provider, model: session.id }) }
  }
  return { calls, saved, ctx: { get: (name) => services[name] } }
}

test('sessionRoute reads the route where read_image reads it: request header, then options, then the default', () => {
  assert.deepEqual(
    sessionRoute(
      {
        agent: {
          session: { requestHeader: () => ({ config: { provider: 'pi-ai', model: 'asked-for' } }) },
          options: { provider: 'deepseek-official', model: 'created-with' }
        }
      },
      { currentSelection: () => ({ provider: 'deepseek-official', model: 'host-default' }) }
    ),
    { provider: 'pi-ai', model: 'asked-for' }
  )
  assert.deepEqual(
    sessionRoute(
      { agent: { session: {}, options: { provider: 'deepseek-official', model: 'created-with' } } },
      undefined
    ),
    { provider: 'deepseek-official', model: 'created-with' }
  )
  // No agent at all — the lane's own engine calling the tool — falls back to the host's selection.
  assert.deepEqual(
    sessionRoute(undefined, {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'host-default' })
    }),
    {
      provider: 'deepseek-official',
      model: 'host-default'
    }
  )
  assert.equal(sessionRoute(undefined, undefined), null)
  // A service that throws is a lane without an answer, not a crash in a screenshot.
  assert.equal(
    sessionRoute(undefined, {
      currentSelection: () => {
        throw new Error('no default model on this lane')
      }
    }),
    null
  )
})

test('readsImages: only an explicit image modality counts — unknown is no, exactly as read_image treats it', () => {
  assert.equal(readsImages(VISION), true)
  assert.equal(readsImages(FLASH), false)
  assert.equal(readsImages({}), false)
  assert.equal(readsImages(null), false)
})

test('imageModel takes the catalog entry that declares images, and the deployment name wins over it', () => {
  const route = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
  assert.deepEqual(imageModel([FLASH, VISION], route, undefined), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash-vision-exp'
  })
  // A bare id is a model on the session's own provider; a qualified one names both halves.
  assert.deepEqual(imageModel([], route, 'deepseek-v5-vision'), {
    provider: 'deepseek-official',
    model: 'deepseek-v5-vision'
  })
  assert.deepEqual(imageModel([], route, 'pi-ai/some-vision'), { provider: 'pi-ai', model: 'some-vision' })
  assert.equal(imageModel([FLASH], route, undefined), null)
  assert.equal(imageModel([FLASH], route, '   '), null)
})

// 🔒 W4 (26/09): this test pinned `next: 'Open it with read_image to see the page.'` until the picture
// started riding the answer; the old invitation is now the fallback pinned by the two tests below it.
test('a session whose model reads images gets the picture itself in the answer, and no model is called', async () => {
  const { ctx, calls, saved } = lane({ session: VISION })
  const shot = screenshot()
  const seen = await pageSeen(ctx, undefined, {}, shot)
  assert.deepEqual(seen.picture, { attachmentId: 'sha256:1', mediaType: 'image/png', bytes: 8 })
  assert.match(seen.next, /attached to this answer: look at it here, no read_image needed/)
  assert.match(seen.next, /Cite the file path/)
  assert.equal(seen.description, undefined)
  assert.equal(calls.length, 0)
  // One save, of the very file on disk, under its own name — what read_image would have saved.
  assert.equal(saved.length, 1)
  assert.equal(saved[0].name, path.basename(shot.file))
  assert.equal(saved[0].mediaType, 'image/png')
})

test('an image-capable session with no image store keeps the read_image invitation, unchanged', async () => {
  const { ctx } = lane({ session: VISION })
  const withoutStore = { get: (name) => (name === 'attachments' ? undefined : ctx.get(name)) }
  assert.deepEqual(await pageSeen(withoutStore, undefined, {}, screenshot()), {
    next: 'Open it with read_image to see the page.'
  })
})

test('a store that refuses the picture, or answers no usable reference, keeps the read_image invitation', async () => {
  const { ctx } = lane({ session: VISION })
  for (const saveImage of [
    () => Promise.reject(new Error('IMAGE_DIMENSION_TOO_LARGE')),
    () => Promise.resolve({ mediaType: 'image/png' }),
    () => Promise.resolve(null)
  ]) {
    const refusing = { get: (name) => (name === 'attachments' ? { saveImage } : ctx.get(name)) }
    assert.deepEqual(await pageSeen(refusing, undefined, {}, screenshot()), {
      next: 'Open it with read_image to see the page.'
    })
  }
})

test("a picture over read_image's byte cap, or of a type the deployment refuses, is never saved", async () => {
  const { ctx, saved } = lane({ session: VISION })
  for (const imageLimits of [
    { maxImageBytes: 4, maxMessageImageBytes: 100 },
    { maxImageBytes: 100, maxMessageImageBytes: 4 },
    { mediaTypes: ['image/jpeg'] }
  ]) {
    const capped = {
      get: (name) => (name === 'attachments' ? { ...ctx.get('attachments'), imageLimits } : ctx.get(name))
    }
    assert.deepEqual(await pageSeen(capped, undefined, {}, screenshot()), {
      next: 'Open it with read_image to see the page.'
    })
  }
  assert.equal(saved.length, 0)
})

test('answerContent: an answer without a picture renders byte for byte as JSON.stringify did', () => {
  for (const value of [
    {
      ok: true,
      file: '/site/a/docs/agents/look/1.png',
      url: 'http://a/',
      next: 'Open it with read_image to see the page.'
    },
    { ok: false, code: 'BAD_PATH', error: 'x' },
    { picture: 'not a reference', ok: true },
    [1, 2],
    'plain',
    null
  ]) {
    assert.deepEqual(answerContent(value), [{ type: 'text', text: JSON.stringify(value) }])
  }
})

test('answerContent: a hidden key leaves the text as the answer without it would have rendered', () => {
  const plain = { ok: true, changed: [], next: 'n' }
  const timed = { ok: true, changed: [], next: 'n', _timing: { totalMs: 5 } }
  assert.deepEqual(answerContent(timed, ['_timing']), answerContent(plain, ['_timing']))
  assert.deepEqual(answerContent(plain, ['_timing']), [{ type: 'text', text: JSON.stringify(plain) }])
})

test('answerContent: a picture becomes an image block after the text, and leaves the text', () => {
  const picture = { attachmentId: 'sha256:1', mediaType: 'image/png', bytes: 8, width: 1280, height: 900 }
  const blocks = answerContent({ ok: true, file: '/f.png', url: 'http://a/', picture, next: 'n' })
  assert.deepEqual(blocks, [
    { type: 'text', text: JSON.stringify({ ok: true, file: '/f.png', url: 'http://a/', next: 'n' }) },
    { type: 'image', attachment: picture }
  ])
})

test('pictureRef keeps only what an image block carries, and refuses a reference with no id or type', () => {
  assert.deepEqual(
    pictureRef({
      attachmentId: 'sha256:2',
      mediaType: 'image/png',
      bytes: 10,
      width: 2,
      height: 3,
      name: 'x.png',
      originalDimensions: { width: 4, height: 6 },
      extra: () => {}
    }),
    {
      attachmentId: 'sha256:2',
      mediaType: 'image/png',
      bytes: 10,
      width: 2,
      height: 3,
      name: 'x.png',
      originalDimensions: { width: 4, height: 6 }
    }
  )
  assert.equal(pictureRef({ mediaType: 'image/png' }), null)
  assert.equal(pictureRef({ attachmentId: 'sha256:2' }), null)
  assert.equal(pictureRef(undefined), null)
})

test('a text-only session gets the page described by the catalog image model, with the picture attached', async () => {
  const { ctx, calls, saved } = lane()
  const shot = screenshot()
  const seen = await pageSeen(ctx, undefined, {}, shot)
  assert.equal(seen.description, 'A header reading Bakery.')
  assert.equal(seen.describedBy, 'deepseek-official/deepseek-v4-flash-vision-exp')
  assert.match(
    seen.next,
    /^The model this session runs does not accept images, so read_image on this file would fail/
  )
  assert.match(seen.next, /`description` is what an image-capable model saw on the page/)
  assert.doesNotMatch(seen.next, /Open it with read_image/)

  // The screenshot itself went to the model: the durable store holds those bytes, and the one
  // request carries an image block plus the question, on the image-capable route.
  assert.equal(saved.length, 1)
  assert.equal(saved[0].mediaType, 'image/png')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].provider, 'deepseek-official')
  assert.equal(calls[0].model, 'deepseek-v4-flash-vision-exp')
  assert.equal(calls[0].reasoningEffort, 'off')
  assert.deepEqual(
    calls[0].messages[0].content.map((block) => block.type),
    ['image', 'text']
  )
  assert.equal(calls[0].messages[0].content[0].attachment.attachmentId, 'sha256:1')
  assert.match(calls[0].messages[0].content[1].text, /http:\/\/demonam2-web-1\//)
})

test('an adapter that refuses `off` is asked again without it rather than losing the description', async () => {
  const { ctx, calls } = lane()
  let first = true
  const inner = ctx.get('llm').stream
  ctx.get('llm').stream = (options) => {
    if (first) {
      first = false
      inner(options)
      return (async function* () {
        yield {
          type: 'finish',
          reason: { kind: 'error', failure: { code: 'UNSUPPORTED_REASONING_EFFORT', message: 'off' } }
        }
      })()
    }
    return inner(options)
  }
  const seen = await pageSeen(ctx, undefined, {}, screenshot())
  assert.equal(seen.description, 'A header reading Bakery.')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].reasoningEffort, undefined)
})

test('no image-capable model anywhere: the tool says nothing has seen the page, and never names read_image', async () => {
  const { ctx } = lane({ catalog: [FLASH] })
  const shot = screenshot()
  const seen = await pageSeen(ctx, undefined, {}, shot)
  assert.equal(seen.description, undefined)
  assert.match(seen.next, /no image-capable model is available here/)
  // The door it names must be one that is registered: `browser_read` was not, anywhere.
  assert.match(seen.next, /`page\.text \{path:"\/"\}`/)
  assert.match(seen.next, /http:\/\/demonam2-web-1\//)
  assert.doesNotMatch(seen.next, /browser_read/)
  assert.doesNotMatch(seen.next, /Open it with read_image/)
})

test('a model call that fails names the model that failed and still leaves the screenshot to cite', async () => {
  const { ctx } = lane({ answer: new Error('402 payment required') })
  const seen = await pageSeen(ctx, undefined, {}, screenshot())
  assert.equal(seen.description, undefined)
  assert.match(seen.next, /deepseek-official\/deepseek-v4-flash-vision-exp did not describe it/)
  assert.match(seen.next, /402 payment required/)
  assert.match(seen.next, /cite the file above as the picture you saved/)
})

test('a lane with no model runtime, or no image store, keeps the old answer or says why it cannot look', async () => {
  const shot = screenshot()
  // Nothing to ask: this tool cannot tell whether read_image would work, so it claims nothing new.
  assert.deepEqual(await pageSeen({ get: () => undefined }, undefined, {}, shot), {
    next: 'Open it with read_image to see the page.'
  })
  const { ctx } = lane()
  const withoutStore = { get: (name) => (name === 'attachments' ? undefined : ctx.get(name)) }
  const seen = await pageSeen(withoutStore, undefined, {}, shot)
  assert.match(seen.next, /this Tracy host has no image store to hand it the picture/)
  assert.doesNotMatch(seen.next, /Open it with read_image/)
})
