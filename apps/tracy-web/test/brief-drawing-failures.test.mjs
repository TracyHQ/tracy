/** Drawing failures remain visible without leaking provider responses or credentials. Fixtures are fictional. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { drawnPictureVerdict } from 'website-opportunities/domain/fill-draw.mjs'
import { drawPlanned } from '../src/sites/brief-engines/drawn-pictures.js'
import { drawPrompt } from '../src/lib/picture-draw.js'

const TRADES = [
  { label: 'Cedar Racket Club', category: 'sports coaching' },
  { label: 'Willow Bread Studio', category: 'bakery' }
]

async function drawingBuild(
  t,
  subject,
  { error, errors, count = 1, labels, bytesError, signal, pending, drawMs = 1000 } = {}
) {
  const photo = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#557799' } })
    .jpeg()
    .toBuffer()
  const warnings = []
  const notes = []
  let chatCalls = 0
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')))
  const drawings = Array.from({ length: count }, (_, n) => ({
    id: `drawing-${n}`,
    mode: 'scene',
    aspect: 1,
    referenceIds: ['owner-photo'],
    subject: { kind: 'business', ...subject }
  }))
  const { stats, drawn } = await drawPlanned({
    plan: {
      drawings,
      unfilled: drawings.map((g) => ({ action: 'draw', drawing: g.id, groupId: g.id }))
    },
    byGroup: new Map(drawings.map((g) => [g.id, { id: g.id, file: `images/${g.id}.jpg` }])),
    real: {
      pictures: [{ id: 'owner-photo', sha256: 'fictional-photo-sha' }],
      bytes: async () => {
        if (pending === 'references') return new Promise(() => {})
        if (bytesError) throw bytesError
        return photo
      },
      drawing: pending === 'cache' ? { get: () => new Promise(() => {}) } : null,
      checkDrawing: async () =>
        pending === 'labeller' ? new Promise(() => {}) : (labels ?? { textPresence: 'absent', faceBoxes: [] })
    },
    drawDoor: { url: 'https://pictures.example/api', key: 'fixture-secret', imageModel: 'test-image' },
    chat: async () => {
      const failure = errors?.[chatCalls] ?? error
      chatCalls += 1
      if (pending === 'model') return new Promise(() => {})
      if (failure) throw failure
      return { images: [{ bytes: photo }], usage: { cost: 0.01 } }
    },
    domain: { drawnPictureVerdict },
    note: (note) => notes.push(note),
    drawMs,
    signal
  })
  return { stats, drawn, notes, warnings, chatCalls }
}

for (const trade of TRADES) {
  test(`${trade.category}: a timed-out provider is not called again while its first request may still run`, async (t) => {
    const stop = new AbortController()
    const guard = setTimeout(() => stop.abort(), 100)
    try {
      const result = await drawingBuild(t, trade, { pending: 'model', drawMs: 20, signal: stop.signal })
      assert.equal(result.chatCalls, 1)
      assert.equal(result.stats.calls, 1)
    } finally {
      clearTimeout(guard)
    }
  })

  for (const pending of ['cache', 'references', 'labeller']) {
    test(`${trade.category}: the picture deadline bounds an unresponsive ${pending} and all queued drawings`, async (t) => {
      const stop = new AbortController()
      const timer = setTimeout(() => stop.abort(), 20)
      let guard
      try {
        const result = await Promise.race([
          drawingBuild(t, trade, { pending, signal: stop.signal, count: 4 }),
          new Promise((resolve) => {
            guard = setTimeout(() => resolve(null), 300)
          })
        ])
        assert.ok(
          result,
          'picture work must return after its deadline even if a dependency ignores the signal'
        )
        assert.equal(result.drawn.size, 0)
        assert.ok(
          result.chatCalls <= (pending === 'labeller' ? 2 : 0),
          'queued work never starts another model call'
        )
        assert.equal(result.stats.calls, result.chatCalls, 'paid attempts remain counted after cancellation')
        assert.equal(result.stats.costUsd, result.chatCalls * 0.01, 'known provider costs remain counted')
      } finally {
        clearTimeout(timer)
        clearTimeout(guard)
      }
    })
  }

  test(`${trade.category}: drawing prompts forbid every visible face and all lettering`, () => {
    for (const mode of ['scene', 'outpaint', 'object']) {
      const prompt = drawPrompt({ mode, aspect: 2, subject: trade })
      assert.match(prompt, /no faces of any kind/i)
      assert.match(prompt, /no lettering/i)
    }
  })

  for (const [labels, reason] of [
    [{ faceBoxes: [{}], textPresence: 'absent' }, 'face-found'],
    [{ faceBoxes: [], textPresence: 'present' }, 'text-found']
  ]) {
    test(`${trade.category}: ${reason} is logged per refusal and stops after one redraw`, async (t) => {
      const result = await drawingBuild(t, trade, { labels })
      assert.equal(result.chatCalls, 2)
      assert.deepEqual(result.stats.refused[0].reasons, [reason, reason])
      assert.ok(result.warnings.every((line) => line.includes(reason)))
    })
  }

  test(`${trade.category}: eleven credit failures give receipt reasons and one operator note`, async (t) => {
    const error = new Error('model call failed: This request requires at least $1.00 in balance')
    const result = await drawingBuild(t, trade, { error, count: 11 })
    assert.equal(result.drawn.size, 0)
    assert.equal(result.stats.refused.length, 11)
    assert.ok(result.stats.refused.every((item) => item.reasonClass === 'out of credit'))
    assert.equal(result.notes.length, 1, 'provider outage is explained once for the build')
    assert.match(result.notes[0], /picture provider is out of credit/i)
    assert.ok(result.warnings.length >= 11, 'every drawing failure is logged')
  })

  test(`${trade.category}: an exhausted balance stops retries before a later error can hide the credit note`, async (t) => {
    const result = await drawingBuild(t, trade, {
      errors: [
        new Error('model call failed: This request requires at least $1.00 in balance'),
        new Error('model call failed: Rate limit exceeded\nBearer fixture-secret')
      ]
    })
    assert.equal(result.stats.refused[0].reasonClass, 'out of credit')
    assert.equal(result.notes.length, 1)
    assert.match(result.notes[0], /picture provider is out of credit/i)
    assert.equal(result.chatCalls, 1, 'an immediate retry cannot replenish the provider balance')
    assert.equal(result.warnings.length, 1)
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret|Bearer|\\n/)
  })

  for (const [message, reason] of [
    ['model call failed: Rate limit exceeded (after 3 tries)', 'rate limit'],
    ['model call failed: No endpoints found for image-model', 'model not found'],
    ['model call failed: fetch failed (after 3 tries)', 'network'],
    ['the picture took too long', 'network']
  ]) {
    test(`${trade.category}: ${reason} remains visible in the receipt, note and safe log`, async (t) => {
      const error = new Error(
        `${message}\nBearer fixture-secret https://pictures.example/?key=fixture-secret`
      )
      const result = await drawingBuild(t, trade, { error })
      assert.equal(result.stats.refused[0].reasonClass, reason)
      assert.ok(result.notes.some((note) => note.includes(reason)))
      assert.equal(result.warnings.length, result.stats.calls, 'one line per failed provider call')
      assert.ok(result.warnings.every((line) => line.includes(reason)))
      assert.doesNotMatch(JSON.stringify(result), /fixture-secret|Bearer|pictures\.example|\\n/)
    })
  }

  test(`${trade.category}: labeller refusal has a reason class and logs each rejected attempt`, async (t) => {
    const result = await drawingBuild(t, trade, { labels: { textPresence: 'present', faceBoxes: [] } })
    assert.equal(result.stats.refused[0].reasonClass, 'refused by the labeller')
    assert.deepEqual(result.stats.refused[0].reasons, ['text-found', 'text-found'])
    assert.ok(result.notes.some((note) => note.includes('refused by the labeller')))
    assert.equal(result.warnings.length, 2)
    assert.ok(result.warnings.every((line) => line.includes('refused by the labeller')))
  })

  test(`${trade.category}: picture preparation failures are classified without leaking their errors`, async (t) => {
    const result = await drawingBuild(t, trade, {
      bytesError: new Error('network fetch failed\nAuthorization: Bearer fixture-secret')
    })
    assert.equal(result.stats.refused[0]?.reasonClass, 'network')
    assert.equal(result.warnings.length, 1)
    assert.match(result.notes[0], /network/)
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret|Authorization|\\n/)
  })
}
