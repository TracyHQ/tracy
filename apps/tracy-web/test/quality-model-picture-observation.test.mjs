import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { callQualityModel, qualityCallBudget } from '../src/opportunities-build/quality-model.js'
import { createEnginePictureClock } from '../src/sites/engine-picture-clock.js'

// The quickstart workflow labels the owner's photos through this gateway while its Apply runs, so a vision request
// made here inside the write clock must reach the build receipt as an error finding, like every other picture call.
const config = {
  providerId: 'configured',
  endpointHost: 'model.example.test',
  model: 'fictional-vision-model',
  role: 'observations',
  hash: 'model-config',
  capabilities: { vision: true, reasoning: true },
  reasoning: {
    enabled: true,
    effort: 'high',
    parameter: 'reasoning_effort',
    profile: 'deepseek-chat-thinking/1'
  },
  price: {
    inputCentsPerM: 30,
    cacheCentsPerM: 0.6,
    outputCentsPerM: 120,
    maxImageTokens: 1024,
    validUntil: '2099-01-01T00:00:00Z'
  }
}
const model = { config, credential: { baseUrl: 'https://model.example.test', apiKey: 'fictional-key' } }
const answer = (time) => ({
  ok: true,
  json: async () => {
    time.now = 7
    return {
      id: 'fictional',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{ finish_reason: 'stop', message: { content: '{"pictures":[]}' } }]
    }
  }
})

for (const trade of [
  { name: 'Hazel Loaf Bakery', kind: 'bakery' },
  { name: 'Birch Smile Dental', kind: 'dental clinic' }
]) {
  test(`${trade.kind}: a quality vision request inside apply is an error finding with its body read timed`, async () => {
    const bytes = Buffer.from(`fictional photo of ${trade.name}`)
    const image = {
      id: 'owner-photo',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`
    }
    const args = {
      config,
      system: 'Observe images',
      input: { business: trade.name },
      images: [image],
      maxTokens: 2000,
      maxInputTokens: 20000,
      maxImages: 4
    }
    const time = { now: 0 }
    const clock = createEnginePictureClock({ now: () => time.now })
    try {
      await clock.run(async () => {
        clock.startApply()
        await callQualityModel({
          model,
          ...args,
          budget: qualityCallBudget(args),
          now: () => time.now,
          fetchImpl: async () => {
            time.now = 3
            return answer(time)
          }
        })
        clock.endApply()
      })
      const report = clock.report()
      assert.equal(report.pictureCallsDuringApply, 1)
      assert.equal(report.visionDuringApplyMs, 7)
      assert.equal(report.findings[0]?.code, 'PICTURE_MODEL_DURING_APPLY')
      assert.equal(report.findings[0]?.severity, 'error')
    } finally {
      clock.close()
    }
  })

  test(`${trade.kind}: a text-only quality request inside apply is not a picture call`, async () => {
    const args = {
      config: { ...config, role: 'editorial', capabilities: { vision: false, reasoning: true } },
      system: 'Write copy',
      input: { business: trade.name },
      images: [],
      maxTokens: 2000,
      maxInputTokens: 20000,
      maxImages: 4
    }
    const time = { now: 0 }
    const clock = createEnginePictureClock({ now: () => time.now })
    try {
      await clock.run(async () => {
        clock.startApply()
        await callQualityModel({
          model: { ...model, config: args.config },
          ...args,
          budget: qualityCallBudget(args),
          now: () => time.now,
          fetchImpl: async () => answer(time)
        })
        clock.endApply()
      })
      assert.equal(clock.report().pictureCallsDuringApply, 0)
      assert.deepEqual(clock.report().findings, [])
    } finally {
      clock.close()
    }
  })
}
