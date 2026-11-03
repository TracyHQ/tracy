// Shared set-up of the picture bench picker tests (#342): the picker door assigned to a test provider (DeepSeek Flash
// on DeepSeek's own API, the default), a plan of the invented Kestrel Row Bike Workshop with frames that need a
// specific picture, the picker's answers and what it was sent. The model is always the scripted fake of
// _agent-over-door-fake.mjs: no real model is called.
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { createSitePicturesQueue } from '../src/site-pictures/bench-worker.js'
import { isLook, lookReply, plan, quiet, SECRET, startRun } from './_site-pictures-bench.mjs'

export { SECRET }

/** The picker door on DeepSeek Flash. */
export async function assignPickerDoor(pool) {
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-test-picker-key', enabled: true },
    SECRET,
    'owner@tracy.test'
  )
  await assignDoor(
    pool,
    'picturePicker',
    { providerId: 'deepseek', model: 'deepseek-flash' },
    'owner@tracy.test'
  )
}

/** The frames of the picker plan that need a specific picture: the hero and a feature on home, a section on about. */
export const PICKER_FRAMES = ['block-2.0', 'block-6.1', 'block-5.1']

/**
 * The Kestrel plan without its gallery (whose any-real frames would take every photo of the home page), with the hero,
 * the feature (a kit twin follows it) and the about section (a plan twin follows it) asking for a specific picture.
 */
export function pickerPlan() {
  const p = plan()
  const home = p.pages[0]
  home.blocks = home.blocks.filter((b) => b.block !== 'block-3')
  for (const page of p.pages)
    for (const b of page.blocks)
      for (const w of b.pictures ?? [])
        if (PICKER_FRAMES.includes(w.frame))
          Object.assign(w, { match: 'specific', shows: `the workshop, ${w.frame}` })
  return p
}

/** Start a picker run on the picker plan (or `over`), with the door's secret. */
export const startPickerRun = (pool, where, over = {}) =>
  startRun(pool, where, { plan: pickerPlan(), secret: SECRET, ...over })

/** One picker answer as DeepSeek's own API sends it: content, its reasoning and token counts (no cost). */
export function reply(value, { prompt = 6000, completion = 400 } = {}) {
  return {
    body: {
      id: `gen-picker-${Math.random().toString(16).slice(2)}`,
      model: 'deepseek-flash',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: typeof value === 'string' ? value : JSON.stringify(value),
            reasoning_content: 'looking at the thumbnails'
          }
        }
      ],
      usage: {
        prompt_tokens: prompt,
        completion_tokens: completion,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: prompt
      }
    }
  }
}

/** A balance endpoint answering the given totals in order. */
export function balances(totals) {
  return async () =>
    new Response(
      JSON.stringify({
        is_available: true,
        balance_infos: [{ currency: 'USD', total_balance: totals.shift() ?? '0.00' }]
      }),
      { headers: { 'content-type': 'application/json' } }
    )
}

/**
 * Run what is queued with one worker that can open the picker door (and read a release webroot, `webroot`). Looks go
 * to `looker` (a function of the request body; by default every picture passes), every other call to `fetchImpl`.
 */
export async function drainPicker(
  pool,
  { index, dir, fetchImpl, balanceFetch = balances([]), retry = { attempts: 1 }, webroot, looker }
) {
  const routed = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null
    if (!isLook(body)) return fetchImpl(url, init)
    return looker ? looker(body) : lookReply()
  }
  await createSitePicturesQueue({
    pool,
    secret: SECRET,
    index,
    storeDir: dir,
    fetchImpl: routed,
    balanceFetch,
    retry,
    ...(webroot ? { webroot } : {}),
    log: quiet
  })
    .drain()
    .catch(() => {})
}

/** What the first request showed the picker: its frames (with their photo codes), the code labels and the images. */
export function pickerView(request) {
  const user = request.body.messages.find((m) => m.role === 'user')
  const texts = user.content.filter((p) => p.type === 'text').map((p) => p.text)
  const frames = JSON.parse(texts[0].split('\n\n')[1])
  const labels = texts.slice(1).map((t) => {
    const [, code, width, height] = /^Photo (P\d+) \((\d+) x (\d+)\):$/.exec(t)
    return { code, width: Number(width), height: Number(height) }
  })
  const images = user.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url)
  return { frames: new Map(frames.map((f) => [f.frame, f])), labels, images }
}

/** The text of the last user message of a request. */
export const lastUserText = (request) => {
  const m = request.body.messages.filter((x) => x.role === 'user').at(-1)
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join('')
}
