// Shared set-up of the site writer bench tests (#329): the invented "Quay Fitness Studio" plan, brief and kit of the
// copy check fixtures (_site-copy-check.mjs), the kit written to a temporary contract folder so the bench reads it
// like a shipped kit, the site writer door assigned to a test provider, and the writer's answers. The model is always
// the scripted fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { startWriterRun } from '../src/site-writer/bench-control.js'
import { createSiteWriterQueue } from '../src/site-writer/bench-worker.js'
import { finalReply, usageOf } from './_agent-over-door-fake.mjs'
import { brief as copyBrief, copy, kit as copyKit, plan } from './_site-copy-check.mjs'

export { copy, plan }

export const SECRET = 's'.repeat(32)
export const KIT_REF = 'demo-gym/j6/1.0.0'
export const API_KEY = 'sk-test-writer-key'
export const quiet = { error() {}, warn() {}, log() {} }

/** The brief, with its one review tied to the review fact the plan cites, so the writer gets its full text. */
export function brief() {
  const b = copyBrief()
  b.reviews[0].factId = 'f-review-1'
  b.facts[1].evidence = [{ source: 'stated', quote: 'We open at 06:00 and close at 21:00.' }]
  return b
}

/** The invented kit as a shipped template-kit.json: a quickstart version and one image, as the reader requires. */
export function kit() {
  return {
    ...copyKit(),
    contract: KIT_REF,
    kit: 'tracy-template-kit/2',
    quickstart: { version: '1.0.0' },
    images: [{ id: 'block-2-1440', path: 'images/block-2-1440.jpg', sha256: 'e'.repeat(64) }],
    blocks: copyKit().blocks.map((b) =>
      b.id === 'block-2' ? { ...b, look: { image: 'block-2-1440', text: 'A wide hero with a heading.' } } : b
    )
  }
}

/**
 * A contract index holding the invented kit, in a temporary folder; `done()` removes it. With `contentMap`, a
 * content-map.json beside the kit, and `writeContentMap(value)` replaces it.
 */
export function kitIndex({ kitDoc = kit(), contentMap, platform = 'joomla' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-writer-kit-'))
  writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify(kitDoc))
  const writeContentMap = (value) => writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(value))
  if (contentMap) writeContentMap(contentMap)
  return {
    writeContentMap,
    index: new Map([[`demo-gym@1.0.0`, { id: KIT_REF, dir, platform }]]),
    done: () => rmSync(dir, { recursive: true, force: true })
  }
}

/** The writer door on a provider; DeepSeek Flash on DeepSeek's own API (the default) unless told otherwise. */
export async function assignWriterDoor(pool, { provider = 'deepseek', model = 'deepseek-flash' } = {}) {
  await saveProvider(
    pool,
    { id: provider, presetId: provider, apiKey: API_KEY, enabled: true },
    SECRET,
    'owner@tracy.test'
  )
  await assignDoor(pool, 'siteWriter', { providerId: provider, model }, 'owner@tracy.test')
}

/** Start a run and return it; fails the test when the start is refused. */
export async function startRun(pool, index, over = {}) {
  const started = await startWriterRun({
    pool,
    secret: SECRET,
    plan: plan(),
    planSource: { kind: 'file', name: 'quay-plan.json' },
    brief: brief(),
    briefSource: { kind: 'file', name: 'quay-brief.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    index,
    ...over
  })
  assert.equal(started.ok, true, JSON.stringify(started))
  return started.run
}

/** What a writing turn answers: the passing copy without what code adds (version, fingerprint, label slots). */
export function writerAnswer() {
  const { version: _v, fingerprint: _f, ...rest } = copy()
  return { ...rest, slots: rest.slots.filter((s) => s.owner === 'writer') }
}

/** One answer as the fake model's reply, with a usage that DeepSeek's own API reports (no cost: priced by the bench). */
export function reply(value, { prompt = 4000, completion = 1500 } = {}) {
  const r = finalReply({
    content: typeof value === 'string' ? value : JSON.stringify(value),
    usage: usageOf()
  })
  r.body.usage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: prompt
  }
  return r
}

/** A balance endpoint answering the given totals in order. */
export function balances(totals) {
  const asked = []
  const fetchImpl = async (url) => {
    asked.push(url)
    const total = totals.shift() ?? '0.00'
    return new Response(
      JSON.stringify({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: total }] }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
  return { fetchImpl, asked }
}

/** Run what is queued with one worker. */
export async function drain(pool, { fetchImpl, index, balanceFetch, retry = { attempts: 1 } }) {
  await createSiteWriterQueue({ pool, secret: SECRET, fetchImpl, index, balanceFetch, retry, log: quiet })
    .drain()
    .catch(() => {})
}

/** The text of the last user message of a request the fake model received. */
export const lastUserText = (request) => {
  const m = request.body.messages.filter((x) => x.role === 'user').at(-1)
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')
}
