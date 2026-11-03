// Shared set-up of the brand bench tests (brand step trial bench, #320): both brand doors assigned to a test provider,
// fake brand tools answering in the shapes the real ones do, an in-memory run folder holding the pictures of an
// invented business (drawn by code, test/_brand-gate-files.mjs), and a model router that gives the agent and the
// reviewer their own scripted replies. No real model is called and no money is spent.
import { logoStaged } from '../src/brand-step/brand-logo.js'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { startBrandRun } from '../src/brand-step/brand-control.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { assignDoor, saveModels, saveProvider } from '../src/lib/llm-store.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { loadCase } from './_brand-gate-files.mjs'
import { KIT_REF, readyKitImages, SECRET } from './_site-planner-bench.mjs'

export { KIT_REF, SECRET }
export const API_KEY = 'sk-or-brand-test-secret-key'
export const AGENT_MODEL = 'vendor/agent-model'
export const REVIEWER_MODEL = 'vendor/reviewer-model'
export const quiet = { error() {}, warn() {}, log() {} }
/** Prices for the three test models (brand-prices.js shape); a model not listed has no price and is refused. */
export const TEST_PRICES = [
  {
    match: /^(agent|reviewer|picture)-model$/,
    price: { inputCacheHit: 1, inputCacheMiss: 2, output: 4, callCeiling: 0.05 }
  }
]

/** Both brand doors on one OpenRouter-like provider, two different models; `models` is the provider's own list. */
export async function assignBrandDoors(
  pool,
  {
    enabled = true,
    agent = AGENT_MODEL,
    reviewer = REVIEWER_MODEL,
    models,
    agentProvider = 'openrouter'
  } = {}
) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled },
    SECRET,
    'owner@tracy.test'
  )
  if (agentProvider !== 'openrouter')
    await saveProvider(
      pool,
      { id: agentProvider, presetId: agentProvider, apiKey: API_KEY, enabled },
      SECRET,
      'owner@tracy.test'
    )
  if (models) await saveModels(pool, 'openrouter', models)
  if (agent)
    await assignDoor(pool, 'brandAgent', { providerId: agentProvider, model: agent }, 'owner@tracy.test')
  if (reviewer)
    await assignDoor(pool, 'brandReviewer', { providerId: 'openrouter', model: reviewer }, 'owner@tracy.test')
}

const PNG = await sharp({ create: { width: 900, height: 700, channels: 4, background: '#cc3322' } })
  .png()
  .toBuffer()

/** Fake brand tools: they answer in the shapes the real tools of brand-step/tools/ answer. */
export function fakeTools({ onCall = () => {}, failOn = null } = {}) {
  const tool = (name, answer) => ({
    name,
    description: `fake ${name}`,
    inputSchema: { type: 'object' },
    async run(input, ctx) {
      onCall(name, input, ctx)
      if (failOn === name) throw new Error(`${name} broke`)
      return typeof answer === 'function' ? answer(input, ctx) : answer
    }
  })
  return [
    tool('open_image', () => ({
      ok: true,
      id: 'page-home-1440',
      image: { mediaType: 'image/png', base64: PNG.toString('base64') }
    })),
    tool('set_name', {
      ok: true,
      text: 'Name',
      rendersAs: 'Name',
      files: { light: 'name-light.png', dark: 'name-dark.png' },
      twoLines: null,
      sidecar: 'name/name.json'
    }),
    tool('make_lettermark', { ok: true, file: 'mark-lettermark.png' }),
    tool('compose_logo', {
      ok: true,
      sides: {
        light: { file: 'logo-light.png', variants: { twoLines: null } },
        dark: { file: 'logo-dark.png', variants: { twoLines: null } }
      }
    }),
    tool('fit_logo', (input) => ({ ok: true, file: `spot-${input.spot}.png`, shows: 'logo' })),
    tool('make_favicon', {
      ok: true,
      mark: 'mark-lettermark.png',
      phoneMark: 'mark-lettermark.png',
      phoneGround: '#121111',
      tabIcons: 'transparent',
      tileGround: null,
      tileMark: null,
      tileMarkRecoloured: false,
      files: { ico: 'favicon.ico', png32: 'f32.png', png512: 'f512.png', phone180: 'p180.png' },
      check: {
        bboxShare: 0.6,
        pass: true,
        tabs: { '#ffffff': { contrastShare: 0.9 }, '#202124': { contrastShare: 0.8 } }
      },
      candidates: [
        {
          kind: 'transparent',
          png32: 'c32.png',
          pass: true,
          bboxShare: 0.6,
          contrastShare: { '#ffffff': 0.9, '#202124': 0.8 }
        }
      ]
    }),
    tool('name_slots', { ok: true, slots: [], ownerTasks: [] }),
    tool('look_logo', async (input, ctx) => {
      const { answer, cost } = await ctx.review({
        images: [{ mediaType: 'image/png', bytes: PNG }],
        question: String(input.question ?? 'q')
      })
      return { verdict: answer, cost }
    })
  ]
}

/** A run folder in memory with the pictures of one invented case: has, read, write (a new name every time). */
export function memoryRunFiles(entries = new Map()) {
  const map = new Map(entries)
  let n = 0
  return {
    map,
    has: (p) => map.has(p),
    read: async (p) => {
      if (!map.has(p)) throw new Error(`file not found: ${p}`)
      return map.get(p)
    },
    write: async (hint, bytes) => {
      const path = `${hint.replace(/\.png$/, '')}-${++n}.png`
      map.set(path, Buffer.from(bytes))
      return path
    }
  }
}

/** The wiring the bench takes (brand-wiring.js) with fakes; `files` is the one folder every run shares. */
export const fakeWiring = ({ tools = fakeTools(), files, font = { family: 'Invented Sans' } } = {}) => {
  return async () => ({ tools, filesFor: () => files, fontFor: async () => font, prices: TEST_PRICES })
}

/** Routes each request to the agent's or the reviewer's scripted replies by the model it names. */
export function modelRouter({ agent = [], reviewer = [] } = {}) {
  const a = scriptedModel(agent)
  const r = scriptedModel(reviewer)
  return {
    agent: a,
    reviewer: r,
    requests: [],
    fetchImpl(url, init) {
      const body = JSON.parse(init.body)
      this.requests.push({ url, body })
      return (body.model === REVIEWER_MODEL ? r : a).fetchImpl(url, init)
    },
    left: () => a.left() + r.left()
  }
}

export const saveCall = (brandFile, cost = 0.01) =>
  toolCallReply({ calls: [['save_brand_file', { brandFile }]], usage: usageOf({ cost }) })
export const done = (cost = 0.01) => finalReply({ content: 'Saved.', usage: usageOf({ cost }) })

/** One invented case (the second approved example, words only) as the run's brief, brand file and picture folder. */
export async function brandCase(id = '2-words-only') {
  const c = await loadCase(id)
  const files = memoryRunFiles(c.entries)
  // the found logo of the brief is in the run folder (the worker loads it there before the first call, #321)
  if (c.brief.brand.logo && !logoStaged(files, c.brief.brand.logo))
    files.map.set(`media/${c.brief.brand.logo}.png`, PNG)
  return { ...c, files }
}

/** Start a run on a case; fails the test when the start is refused. */
export async function startRun(pool, c, over = {}) {
  const started = await startBrandRun({
    pool,
    secret: SECRET,
    brief: c.brief,
    briefSource: { kind: 'file', name: `${c.id}.json` },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files }),
    ...over
  })
  assert.equal(started.ok, true, JSON.stringify(started))
  return started.run
}

/** Start a run, then let one worker claim and run everything queued. */
export async function runOnce(pool, c, { agent, reviewer, tools = fakeTools(), over = {}, queue = {} }) {
  await assignBrandDoors(pool)
  const run = await startRun(pool, c, over)
  const model = modelRouter({ agent, reviewer })
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: readyKitImages(),
    wiring: fakeWiring({ tools, files: c.files }),
    log: quiet,
    retry: { attempts: 1 },
    ...queue
  }).drain()
  return { run: await readRun(pool, run.id), model }
}
