/**
 * WHO LOOKS at the picture `page.look` takes.
 *
 * WHY THIS FILE EXISTS (measured 16/09/2026). `page.look` answered "Open it with read_image to see
 * the page." whatever model the session ran, and on a host whose model does not declare image input
 * that call fails: `model "<id>" does not declare image input`. The agent spends a step and
 * still never sees the page.
 *
 * ⚠ THE COMPOSED DEFAULT IS NOT SUCH A MODEL, and this comment named the wrong one until 16/09.
 * `@deepseek-ai/dsh-base` composes `agent-default-model` as `deepseek-flash`, which DOES declare
 * image input — measured at 187 requests in a real session. `deepseek-v4-flash` is its text-only
 * twin and is what a deployment gets only by choosing it. The fallback below is therefore for a
 * host that has moved off the default, not for the default. The model is a SHARED setting of the host (`agent-default-model` in
 * `/desk-home/settings.yaml`), so whether a look at a page works had nothing to do with the site or
 * the person — it depended on a setting nobody making the call can see.
 *
 * So the tool looks for itself: when the session's own model does not accept images, the screenshot
 * goes to an image-capable model of the SAME provider and its description comes back beside the file
 * path. One screenshot pays for one image call; every other message of the chat still runs on the
 * model the deployment chose.
 *
 * A session already running an image-capable model gets the PICTURE ITSELF in the answer (W4, 26/09):
 * the screenshot rides the tool result as an image block, the way `read_image` returns one, so the
 * agent sees the page in the same step instead of spending a second one on `read_image` (C41 on the
 * 25/09 WordPress bench lost 34 s to that extra step). dsh serialises image blocks inside tool
 * results (`llm-deepseek/src/protocols/messages/serialize.ts`, `input()`). A second model call would
 * cost more and say less than the picture. Without an image store the old `read_image` invitation
 * stands. Cost accepted: the picture stays in the history of every later step (cached, still tokens).
 *
 * 🔒 THE SAME TEST `read_image` MAKES, or this file lies about what would happen. `read_image` reads
 * the route off the request header of the epoch in flight, falls back to the agent's own options,
 * and requires `inputModalities` to name `image` EXPLICITLY — unknown counts as no
 * (`vendor/tracy/deepseek-harness/packages/fs/tool-fs/src/read-image.ts`, `assertImageCapableRoute`).
 *
 * 🔒 THE THREE SERVICES ARE READ, NOT INJECTED (`ctx.get`). A composition without `llm`,
 * `agentDefaultModel` or `attachments` must lose the description, not the whole tool — `inject` has
 * no optional half, so a name declared there and absent is a plugin that never activates
 * (`scripts/build-host.mjs`). Every path below answers with a saved screenshot either way.
 */

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * One exact model route: which adapter, and which model on it.
 * @typedef {{ provider: string, model: string }} Route
 */

/**
 * What this file reads off dsh's model runtime (`ctx.llm`); every other method is left alone.
 * @typedef {{
 *   resolveModelInfo: (provider: string, model: string) => Promise<{ inputModalities?: readonly string[] }>,
 *   listModels: (provider: string) => Promise<readonly { id?: string, provider?: string, inputModalities?: readonly string[] }[]>,
 *   stream: (options: Record<string, unknown>) => AsyncIterable<Record<string, any>>
 * }} LlmService
 */

/**
 * dsh's durable image store (`ctx.attachments`), as much of it as one screenshot needs.
 * @typedef {{
 *   saveImage?: (input: { data: Uint8Array, mediaType: string, name?: string }) => Promise<unknown>,
 *   imageLimits?: { maxImageBytes?: number, maxMessageImageBytes?: number, mediaTypes?: readonly string[] }
 * }} AttachmentStore
 */

/** Room for a page's worth of visible text; a description is prose, not a document. */
const DESCRIBE_MAX_TOKENS = 1200

/** How long one description may take before the screenshot is answered without it. */
const DESCRIBE_TIMEOUT_MS = 60_000

const DESCRIBE_SYSTEM =
  'You are the eyes of another agent that cannot open images. You are given one screenshot of one web ' +
  'page. Say what is on it in plain prose, in the order it appears down the page: the header and its ' +
  'menu, each heading and the visible words under it, pictures and where they sit, the footer, and ' +
  'anything plainly wrong (a missing image, placeholder text left in, blocks with no styling, text ' +
  'running over text). Quote visible words exactly. Never name anything you cannot see in the picture, ' +
  'and never guess at what is below the fold. At most 250 words, no headings, no markdown.'

/**
 * What the agent is told when its own model can open the file but this tool could not hand the
 * picture over (no image store, or the store refused it) — the answer this tool always gave.
 */
const READ_IMAGE_NEXT = 'Open it with read_image to see the page.'

/** The same three answers for a library picture (`media.scan {id}`): the words say picture, not page. */
const PICTURE_READ_NEXT = 'Open it with read_image to see the picture, then write its alt from what it shows.'
const PICTURE_SEEN_NEXT =
  'The picture is attached to this answer: look at it here, no read_image needed, and write its alt from what it shows.'
const PICTURE_DESCRIBED_NEXT =
  'The model this session runs does not accept images, so read_image would fail — `description` is what an image-capable model saw in the picture. Write its alt from that.'
const PICTURE_BLIND_NEXT =
  'Nothing could look at this picture: say so and ask the customer what it shows. Do not write an alt you have not seen.'

/** …and when the picture rides the answer itself (W4): no second step, and the file still to cite. */
const SEEN_NEXT =
  'The screenshot is attached to this answer: look at it here, no read_image needed. Cite the file ' +
  'path when you tell the customer which page you looked at.'

/** …and when another model had to look for it. */
const DESCRIBED_NEXT =
  'The model this session runs does not accept images, so read_image on this file would fail — ' +
  '`description` is what an image-capable model saw on the page. Cite the file path when you tell the ' +
  'customer which page you looked at.'

/**
 * …and when nothing could look at it. It says so rather than promising a call that fails, and names
 * the one way left to learn what the page says.
 * 🔒 IT NAMES A DOOR THAT EXISTS. This sentence said `browser_read` until 17/09, and no plugin in
 * this repo or in dsh registers that name — it appears in no session's tool list. So the one hint
 * offered at the exact moment nothing could see the page pointed at nothing, and the agent fell back
 * to `curl` plus a tag-stripper it wrote itself. `page.text` is the same picture in words.
 *
 * THE PATH COMES OFF THE URL rather than from a second argument: the caller already built that URL
 * from the path, and a second parameter is a second thing to forget — the first version of this took
 * one and the look tests, which pass only `{file, url}`, rendered `path:"undefined"`.
 *
 * @param {string} url - the page's address inside the fleet; its pathname is what `page.text` takes.
 * @param {string} why - why no model described the picture, in the same sentence.
 * @returns {string}
 */
function blindNext(url, why) {
  let pagePath = '/'
  try {
    pagePath = new URL(url).pathname || '/'
  } catch {
    pagePath = '/'
  }
  return (
    `The model this session runs does not accept images, so read_image on this file would fail, and ${why}. ` +
    `Nothing has seen this page yet: read it with \`tracy_site\` \`page.text {path:"${pagePath}"}\` (${url}), ` +
    'and cite the file above as the picture you saved.'
  )
}

/**
 * The key under which a picture rides a tool answer until `answerContent` turns it into an image
 * block. It never reaches the model as JSON text: the block carries the same reference.
 */
export const PICTURE_KEY = 'picture'

/**
 * The durable reference an image block carries (`ImageAttachmentRef` in `@deepseek-ai/dsh-attachment`),
 * copied field by field so the tool value stays plain, lossless JSON.
 * @typedef {{ attachmentId: string, mediaType: string, bytes?: number, width?: number, height?: number,
 *   name?: string, originalDimensions?: { width: number, height: number } }} PictureRef
 */

/**
 * A saved screenshot's reference as a plain object, or null when the store answered something an image
 * block cannot carry (no id, no media type) — the caller then keeps the old `read_image` answer.
 * @param {unknown} ref
 * @returns {PictureRef | null}
 */
export function pictureRef(ref) {
  const r = /** @type {Record<string, unknown> | null} */ (ref && typeof ref === 'object' ? ref : null)
  if (r === null || typeof r.attachmentId !== 'string' || r.attachmentId === '') return null
  if (typeof r.mediaType !== 'string' || r.mediaType === '') return null
  /** @type {PictureRef} */
  const out = { attachmentId: r.attachmentId, mediaType: r.mediaType }
  for (const key of /** @type {const} */ (['bytes', 'width', 'height'])) {
    if (Number.isInteger(r[key])) out[key] = /** @type {number} */ (r[key])
  }
  if (typeof r.name === 'string') out.name = r.name
  const od = /** @type {Record<string, unknown> | null} */ (
    r.originalDimensions && typeof r.originalDimensions === 'object' ? r.originalDimensions : null
  )
  if (od !== null && Number.isInteger(od.width) && Number.isInteger(od.height))
    out.originalDimensions = {
      width: /** @type {number} */ (od.width),
      height: /** @type {number} */ (od.height)
    }
  return out
}

/**
 * The model-facing content of one `tracy_site` / `tracy_emdash` answer: the answer as JSON text, as
 * it always was — and, when it carries a picture (`page.look` on an image-capable session), that
 * picture as an image block after the text, the shape `read_image` renders.
 *
 * 🔒 WITHOUT A PICTURE OR A HIDDEN KEY THE TEXT IS BYTE-IDENTICAL to the `JSON.stringify(value)` both
 * tools rendered before W4, so no other action's answer moves by a byte. The picture key is dropped
 * from the text: the block already carries the reference, and dsh writes its own handle line beside
 * the image (`serialize.ts`, `requestImageHandleText`). So is every key in `hidden` — the replace
 * job's phase timings (S5, `replace-road.mjs` `TIMING_KEY`), which go to `tool/result.meta` instead:
 * the text is then what the same answer without them would have rendered, byte for byte.
 * @param {unknown} value
 * @param {readonly string[]} [hidden] - keys that never reach the model's text.
 * @returns {({ type: 'text', text: string } | { type: 'image', attachment: PictureRef })[]}
 */
export function answerContent(value, hidden = []) {
  const a = /** @type {Record<string, unknown> | null} */ (
    value && typeof value === 'object' && !Array.isArray(value) ? value : null
  )
  if (a === null) return [{ type: 'text', text: JSON.stringify(value) }]
  const picture = pictureRef(a[PICTURE_KEY])
  const drop = hidden.filter((k) => Object.hasOwn(a, k))
  if (picture !== null) drop.push(PICTURE_KEY)
  if (drop.length === 0) return [{ type: 'text', text: JSON.stringify(value) }]
  /** @type {Record<string, unknown>} */
  const rest = {}
  for (const [k, v] of Object.entries(a)) if (!drop.includes(k)) rest[k] = v
  const shown = { type: /** @type {const} */ ('text'), text: JSON.stringify(rest) }
  return picture === null ? [shown] : [shown, { type: 'image', attachment: picture }]
}

/** @param {unknown} value @returns {string | null} */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The model route this call actually runs on — the two places `read_image` reads, in its order: the
 * request header of the epoch in flight, then the options the session was created with. A call that
 * arrives without an agent (a lane's own engine) falls back to the host's default selection.
 * @param {import('./types.js').ToolRun | undefined} exec
 * @param {{ currentSelection?: () => { provider?: string, model?: string } } | undefined} fallback
 * @returns {Route | null}
 */
export function sessionRoute(exec, fallback) {
  let routed
  try {
    routed = exec?.agent?.session?.requestHeader?.()
  } catch {
    routed = undefined
  }
  let selection
  try {
    selection = fallback?.currentSelection?.()
  } catch {
    selection = undefined
  }
  const provider =
    text(routed?.config?.provider) ?? text(exec?.agent?.options?.provider) ?? text(selection?.provider)
  const model = text(routed?.config?.model) ?? text(exec?.agent?.options?.model) ?? text(selection?.model)
  return provider === null || model === null ? null : { provider, model }
}

/**
 * Whether one model declares image input. An absent list means unknown, and unknown counts as NO —
 * the polarity `read_image` uses, so this answer and that refusal can never disagree.
 * @param {{ inputModalities?: readonly string[] } | null | undefined} info
 * @returns {boolean}
 */
export function readsImages(info) {
  const modalities = info?.inputModalities
  return Array.isArray(modalities) && modalities.includes('image')
}

/**
 * Which model is asked to describe the picture: what the deployment named, else the first model this
 * provider's catalog declares image input for. Discovery rather than a hardcoded name, because the
 * catalog is the adapter's own data (`llm-deepseek`'s `DEFAULT_MODELS`, today
 * `deepseek-v4-flash-vision-exp`) and a deployment may carry a different one.
 * @param {readonly { id?: string, provider?: string, inputModalities?: readonly string[] }[]} catalog
 * @param {Route} route - the session's own route; its provider is where an unqualified name lands.
 * @param {string | null | undefined} configured - `provider/model`, or a model id, from the config.
 * @returns {Route | null}
 */
export function imageModel(catalog, route, configured) {
  const named = text(configured)
  if (named !== null) {
    const cut = named.indexOf('/')
    const provider = cut === -1 ? '' : named.slice(0, cut).trim()
    const model = cut === -1 ? named : named.slice(cut + 1).trim()
    // A name the deployment wrote wins over the catalog: catalog membership is advisory in dsh, so
    // an endpoint that is not listed is still callable.
    if (model !== '') return { provider: provider === '' ? route.provider : provider, model }
  }
  for (const entry of catalog) {
    const id = text(entry?.id)
    if (id !== null && readsImages(entry))
      return { provider: text(entry?.provider) ?? route.provider, model: id }
  }
  return null
}

/**
 * What one side question to an image-capable model is asked with: its own instructions, its own room
 * to answer, and when it must end.
 * @typedef {{ system: string, maxTokens: number, signal: AbortSignal }} Asking
 */

/**
 * One take from an image-capable model: the pictures, one question, the text deltas joined.
 * @param {LlmService} llm
 * @param {Route} route
 * @param {string | undefined} reasoningEffort
 * @param {Record<string, unknown>} message
 * @param {Asking} asking
 * @returns {Promise<{ ok: true, text: string, usage: Record<string, number> | null } | { ok: false, detail: string }>}
 */
async function streamOnce(llm, route, reasoningEffort, message, asking) {
  let said = ''
  // An adapter that hands whole blocks instead of deltas still ends every text block with `block-end`.
  let blockText = ''
  /** @type {Record<string, number> | null} */
  let usage = null
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      system: asking.system,
      messages: [message],
      maxTokens: asking.maxTokens,
      signal: asking.signal
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') said += typeof chunk.text === 'string' ? chunk.text : ''
      else if (chunk.type === 'block-end') {
        const block = chunk.block
        if (block?.type === 'text' && typeof block.text === 'string') blockText += block.text
      } else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
      else if (
        chunk.type === 'finish' &&
        (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')
      ) {
        const failure = chunk.reason.failure
        return {
          ok: false,
          detail: `${failure?.code ?? chunk.reason.kind} ${failure?.message ?? ''}`.trim()
        }
      }
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
  const answer = (said !== '' ? said : blockText).trim()
  return answer === ''
    ? { ok: false, detail: 'the model answered nothing' }
    : { ok: true, text: answer, usage }
}

/**
 * Ask one image-capable model one question about one message of pictures and words, thinking off
 * (see {@link describe} for why), and again without that setting for an adapter that does not know it.
 * @param {LlmService} llm
 * @param {Route} route
 * @param {Record<string, unknown>} message - one `user` message carrying the image blocks and the question.
 * @param {Asking} asking
 * @returns {Promise<{ ok: true, text: string, usage: Record<string, number> | null } | { ok: false, detail: string }>}
 */
export async function askImageModel(llm, route, message, asking) {
  const first = await streamOnce(llm, route, 'off', message, asking)
  if (first.ok || !/UNSUPPORTED_REASONING_EFFORT/.test(first.detail)) return first
  return streamOnce(llm, route, undefined, message, asking)
}

/**
 * Ask one image-capable model what the page shows.
 *
 * `reasoningEffort: 'off'` because describing a picture needs no chain of thought and a reasoning
 * model spends the whole budget on one — measured on this very model (Lee's lane, 09/09:
 * `deepseek-v4-flash-vision-exp` at `high` returned 0 characters through 16k tokens, see
 * `tracy-design-inspiration`'s `callModel`). An adapter that does not know `off` gets the call again
 * without it.
 * @param {LlmService} llm
 * @param {Route} route
 * @param {unknown} attachment - the durable reference the attachment store gave for the screenshot.
 * @param {string} url - the page's address, so the answer is anchored to one page.
 * @returns {Promise<{ ok: true, text: string } | { ok: false, detail: string }>}
 */
async function describe(llm, route, attachment, url, picture = false) {
  const message = {
    id: randomUUID(),
    role: 'user',
    content: [
      { type: 'image', attachment },
      {
        type: 'text',
        text: picture
          ? "This is one picture from a website's media library. Describe what it shows in a sentence that could be its alt text: the subject, and any words printed on it, read exactly."
          : `This is a desktop-width screenshot of the page ${url}. Describe what it shows.`
      }
    ],
    source: { kind: 'user' }
  }
  return askImageModel(llm, route, message, {
    system: DESCRIBE_SYSTEM,
    maxTokens: DESCRIBE_MAX_TOKENS,
    // A look at a page must end. The adapter's own idle watchdog is five minutes, and a tool call
    // that sits there that long is worse for the person waiting than a screenshot with no
    // description: an abort comes back as a terminal chunk, which is answered like any failure.
    signal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS)
  })
}

/**
 * Hand the screenshot to a session whose own model reads images: saved to dsh's image store, its
 * reference rides the answer under {@link PICTURE_KEY} and `answerContent` renders it as an image
 * block (W4). Same store call as `read_image` makes (`saveImage` before the result is appended, so
 * the block references a committed object).
 *
 * 🔒 ANY FAILURE KEEPS THE OLD ANSWER, never a worse one: no store, a refusal (a page taller than
 * the store's dimension limit, `IMAGE_DIMENSION_TOO_LARGE`), or a reference an image block cannot
 * carry — the agent is sent to `read_image` exactly as before W4, and that tool says what it says.
 * @param {{ get?: (name: string) => unknown }} ctx
 * @param {{ file: string, url: string, mediaType?: string }} shot - `mediaType` is set for a library
 *   picture (`media.scan {id}`), which may be a jpeg or a webp; a screenshot is a png.
 * @returns {Promise<{ picture?: PictureRef, next: string }>}
 */
async function handOver(ctx, shot) {
  const mediaType = shot.mediaType ?? 'image/png'
  const readNext = shot.mediaType === undefined ? READ_IMAGE_NEXT : PICTURE_READ_NEXT
  const attachments = /** @type {AttachmentStore | undefined} */ (ctx.get?.('attachments'))
  if (typeof attachments?.saveImage !== 'function') return { next: readNext }
  // 🔒 read_image's own caps, checked before the store is asked: the deployment's media types, and the
  // smaller of the per-image and per-message byte bounds (a tool result is one message carrying one
  // image, `read-image.ts` `byteCap`). A picture read_image would refuse must not ride the answer.
  const limits = attachments.imageLimits
  if (Array.isArray(limits?.mediaTypes) && !limits.mediaTypes.includes(mediaType)) return { next: readNext }
  const cap = Math.min(limits?.maxImageBytes ?? Infinity, limits?.maxMessageImageBytes ?? Infinity)
  let picture = null
  try {
    const data = await fs.readFile(shot.file)
    if (data.length <= cap)
      picture = pictureRef(await attachments.saveImage({ data, mediaType, name: path.basename(shot.file) }))
  } catch {
    picture = null
  }
  return picture === null
    ? { next: readNext }
    : { [PICTURE_KEY]: picture, next: shot.mediaType === undefined ? SEEN_NEXT : PICTURE_SEEN_NEXT }
}

/**
 * What `page.look` says about the picture it has just saved: the picture itself when this session's
 * model can open it (W4; the old `read_image` invitation when it cannot be handed over), otherwise a
 * description read out of the picture by a model that can — and, when neither is possible, the plain
 * fact that nothing has seen the page.
 * @param {{ get?: (name: string) => unknown }} ctx
 * @param {import('./types.js').ToolRun | undefined} exec
 * @param {{ lookModel?: string }} config
 * @param {{ file: string, url: string }} shot
 * @returns {Promise<{ picture?: PictureRef, description?: string, describedBy?: string, next: string }>}
 */
export async function pageSeen(ctx, exec, config, shot) {
  const llm = /** @type {LlmService | undefined} */ (ctx.get?.('llm'))
  const route = sessionRoute(
    exec,
    /** @type {{ currentSelection?: () => { provider?: string, model?: string } } | undefined} */ (
      ctx.get?.('agentDefaultModel')
    )
  )
  // No model runtime, or no route to ask about: say nothing new. The session may well read images,
  // and claiming otherwise would send the agent the long way round for nothing.
  const isPicture = shot.mediaType !== undefined
  if (llm === undefined || route === null) return { next: isPicture ? PICTURE_READ_NEXT : READ_IMAGE_NEXT }
  /** @type {{ inputModalities?: readonly string[] } | null} */
  let info = null
  try {
    info = await llm.resolveModelInfo(route.provider, route.model)
  } catch {
    info = null
  }
  // An unresolvable route is the one case `read_image` also refuses, but this tool cannot prove it
  // here — leave the old advice rather than describe a page the session could have seen itself.
  if (info === null) return { next: isPicture ? PICTURE_READ_NEXT : READ_IMAGE_NEXT }
  if (readsImages(info)) return handOver(ctx, shot)

  /** @type {readonly { id?: string, provider?: string, inputModalities?: readonly string[] }[]} */
  let catalog = []
  try {
    catalog = await llm.listModels(route.provider)
  } catch {
    catalog = []
  }
  const eyes = imageModel(catalog, route, config.lookModel)
  if (eyes === null)
    return {
      next: isPicture ? PICTURE_BLIND_NEXT : blindNext(shot.url, 'no image-capable model is available here')
    }
  const attachments = /** @type {AttachmentStore | undefined} */ (ctx.get?.('attachments'))
  if (typeof attachments?.saveImage !== 'function')
    return {
      next: isPicture
        ? PICTURE_BLIND_NEXT
        : blindNext(shot.url, 'this Tracy host has no image store to hand it the picture')
    }

  const describedBy = `${eyes.provider}/${eyes.model}`
  let attachment
  try {
    attachment = await attachments.saveImage({
      data: await fs.readFile(shot.file),
      mediaType: shot.mediaType ?? 'image/png',
      name: path.basename(shot.file)
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      next: isPicture
        ? PICTURE_BLIND_NEXT
        : blindNext(shot.url, `the screenshot could not be handed to ${describedBy} (${detail})`)
    }
  }
  const said = await describe(llm, eyes, attachment, shot.url, isPicture)
  if (said.ok)
    return {
      description: said.text,
      describedBy,
      next: isPicture ? PICTURE_DESCRIBED_NEXT : DESCRIBED_NEXT
    }
  return {
    next: isPicture
      ? PICTURE_BLIND_NEXT
      : blindNext(shot.url, `${describedBy} did not describe it (${said.detail})`)
  }
}
