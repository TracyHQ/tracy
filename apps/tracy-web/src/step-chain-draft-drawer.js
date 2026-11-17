// The drawer of a draft run's pictures step (#575 pictures gap audit, port 1): every frame the picture policy marked
// `generated` (no fitting owner photo, a frame that may be drawn: never a person, a gallery, a video, an event's or a
// post's picture) is drawn by the step chain's drawer, looked at by the step chain's looker, and stored as a draft
// picture like an owner photo, so the write uploads its stored bytes instead of stopping `picture_not_stored`.
//
// Copied from the step chain, unchanged: the drawer door and its call (`site-pictures/drawer-door.js`,
// `drawer-call.js` `askDrawer`, `drawingText`, `aspectRatioFor`, `framingOf`), the fixed template
// (`drawing-prompt.md`), the mode (`ladder-draw.js` `modeOf`: one thing on a quiet ground, else a scene), the fit
// (cover, centred, JPEG 86), the retries of a provider failure (`DRAWER_TRIES`, `DRAWER_BACKOFF_MS`, then
// `DrawerProviderError`, which stops the run), the cache of every drawing by the hash of its request (a re-run pays
// once), at most `DRAW_CONCURRENCY` drawings at a time, and the drawing rungs of the fallback ladder
// (`ladder-rungs.js`): draw, one redraw with the looker's fault names, `REDRAW_ALT_TRIES` other compositions, then the
// best picture rejected for minor faults only (`onlyMinorFaults`). A frame no rung fills stays empty
// (`drawing_rejected`), as the step chain returns it.
//
// Changed by the new model: the wish is the build model's (`picture-wishes.mjs`), the frame size the kit's declared
// frame, the drawings are kept as draft pictures (`drawn.keep`, `drawn.find`) instead of the bench's file store, and the
// looks are the build model's (`step-chain-draft-look.js`). No outpaint and no cut-out rung: the build chat places no
// owner photo to extend, and no kit frame is a cut-out.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { askDrawer, aspectRatioFor, drawingText, framingOf } from './site-pictures/drawer-call.js'
import { REDRAW_ALT_TRIES, DRAW_CONCURRENCY } from './site-pictures/ladder-climb.js'
import { DRAWER_BACKOFF_MS, DRAWER_TRIES, DrawerProviderError } from './site-pictures/ladder-draw.js'
import { onlyMinorFaults } from './site-pictures/looker-call.js'
import { inParallel } from './site-pictures/looker-step.js'
import { picturePrompts } from './site-pictures/picture-prompts.js'
import { lookAt } from './step-chain-draft-look.js'

const JPEG = { quality: 86, mozjpeg: false }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** The drawing mode of a build chat frame (`ladder-draw.js` `modeOf` reads the planner's role, here the field kind). */
export const drawModeOf = (frame) =>
  /illustration|product/.test(String(frame?.kind ?? '')) ? 'object' : 'scene'

/** The rungs one frame climbs, in order: `{faults: boolean, recompose: number}`. */
const RUNGS = [
  { name: 'draw', recompose: 0 },
  { name: 'redraw', recompose: 0 },
  ...Array.from({ length: REDRAW_ALT_TRIES }, (_, i) => ({ name: 'redraw-alt', recompose: i + 1 }))
]

/**
 * The drawer of one run.
 * @param {{door: {baseUrl: string, apiKey: string, model: string}, drawn: {find: Function, keep: Function},
 *   model: Function, accountId: string | null, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>,
 *   backoffMs?: number[]}} input `drawn`: the draft picture store of drawings (`find(key, ctx)` answers
 *   `{id, sha256, mime, bytes}` or null, `keep(picture, ctx)` answers `{id, sha256, mime}`); `model` the build model
 *   (the looks)
 */
export function createDraftDrawer({
  door,
  drawn,
  model,
  accountId,
  fetchImpl = fetch,
  wait = sleep,
  backoffMs = DRAWER_BACKOFF_MS
}) {
  const prompt = picturePrompts()
  const ctx = { accountId }
  const inflight = new Set()
  const spend = { draws: 0, cached: 0, looks: 0, usd: 0 }

  // One drawing, sent again while the provider fails it (`ladder-draw.js` askTrying).
  async function askTrying(frameId, request) {
    for (let tries = 1; ; tries++) {
      const call = askDrawer({ ...request, door, fetchImpl })
      inflight.add(call)
      const answer = await call.finally(() => inflight.delete(call))
      if (!answer.provider) return answer
      if (tries >= DRAWER_TRIES)
        throw new DrawerProviderError(frameId, answer.provider.status, answer.problem, tries)
      await Promise.allSettled(inflight)
      await wait(backoffMs[tries - 1] ?? backoffMs.at(-1) ?? 0)
    }
  }

  /** One drawing of a frame: the stored picture with its bytes, or `{problem}`. */
  async function drawOnce(frame, wish, out, { faults = null, recompose = 0 }) {
    const mode = drawModeOf(frame)
    const text = drawingText(prompt.drawing, mode, wish, faults, null, {
      recompose,
      framing: framingOf(out.width, out.height)
    })
    const key = sha256(JSON.stringify([mode, text, null, out, door.model, prompt.sha256]))
    const before = await drawn.find(key, ctx)
    if (before?.bytes?.length) {
      spend.cached += 1
      return before
    }
    const answer = await askTrying(frame.id, { text, aspect: aspectRatioFor(out.width, out.height) })
    spend.draws += 1
    spend.usd += Number.isFinite(answer.costUsd) ? answer.costUsd : 0
    if (!answer.bytes) return { problem: answer.problem }
    let bytes
    try {
      bytes = await sharp(answer.bytes, { failOn: 'none' })
        .rotate()
        .resize(out.width, out.height, { fit: 'cover' })
        .jpeg(JPEG)
        .toBuffer()
    } catch (error) {
      return {
        problem: `the drawer's picture cannot be read: ${String(error?.message ?? error).slice(0, 200)}`
      }
    }
    const kept = await drawn.keep({ key, bytes, mime: 'image/jpeg', ...out }, ctx)
    if (!kept?.id) return { problem: 'the drawing could not be stored' }
    return { ...kept, bytes }
  }

  /**
   * Draw one frame up its rungs.
   * @returns {Promise<{picture: {id: string, sha256?: string, mime: string} | null, look: object | null,
   *   rungs: Array<{rung: string, outcome: string, faults?: string[]}>}>}
   */
  async function drawFrame(frame, wish, alt) {
    const out = frame.generate?.size ?? frame.size
    const rungs = []
    let faults = null
    let best = null
    for (const rung of RUNGS) {
      const made = await drawOnce(frame, wish, out, {
        faults: rung.name === 'draw' ? null : faults,
        recompose: rung.recompose
      })
      if (made.problem) {
        rungs.push({ rung: rung.name, outcome: 'no-picture' })
        continue
      }
      const look = await lookAt({ model, bytes: made.bytes, size: out, wish, frame, alt })
      spend.looks += look.calls
      const picture = { id: made.id, sha256: made.sha256, mime: made.mime ?? 'image/jpeg' }
      if (look.verdict === 'pass') {
        rungs.push({ rung: rung.name, outcome: 'placed' })
        return { picture, look, rungs }
      }
      rungs.push({ rung: rung.name, outcome: 'rejected', faults: look.faults })
      faults = look.faults
      if (onlyMinorFaults(look.faults) && !best) best = { picture, look }
    }
    if (best) {
      rungs.push({ rung: 'best-rejected', outcome: 'placed', faults: best.look.faults })
      return { ...best, rungs }
    }
    return { picture: null, look: null, rungs }
  }

  return {
    spend,
    /**
     * Draw every frame of `todo` (`[{frame, wish}]`), at most `DRAW_CONCURRENCY` at a time.
     * @param {(frame: object) => object | null} altOf the alt ask of a frame (`step-chain-draft-look.js`)
     */
    drawAll: (todo, altOf = () => null) =>
      inParallel(todo, DRAW_CONCURRENCY, ({ frame, wish }) => drawFrame(frame, wish, altOf(frame)))
  }
}
