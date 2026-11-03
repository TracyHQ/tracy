// The drawer of the fallback ladder (#344, ADR 0043 sections 3 and 4): one drawing for one frame, written at the size
// the frame's picture is written at (cut-photo.js outputSizeFor: the demo file's aspect, at least the display box).
//
// - `scene` and `object`: the model draws from the fixed template; code fits its answer to the frame (cover, centred).
// - `outpaint`: a portrait owner photo placed in the middle of a wide band at the band's height (never enlarged), the
//   sides grey; the model extends the sides, and code pastes the real photo back over the middle of its answer, so the
//   real part is the owner's own pixels. The entry records that box as `realPart`, which the looker outlines.
//
// Every drawing is kept in the bench's file store (runs/<run id>/draws/<key>.json, the key a hash of the mode, the
// text, the real photo, the size, the model and the template), so a later round or a resumed run pays once per
// drawing. A call that fails is not kept: the ladder moves on.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { outputSizeFor } from './cut-photo.js'
import { aspectRatioFor, askDrawer, drawingText } from './drawer-call.js'
import { fileStore, sha256Hex } from './file-store.js'

/** A frame at least this many times wider than tall is a wide band, which a portrait owner photo may be extended to. */
export const WIDE_BAND = 2
/** The longest side of the picture sent to be extended. */
const SEND_MAX = 1536
const GREY = { r: 128, g: 128, b: 128 }
const JPEG = { quality: 86, mozjpeg: false }

/** The drawing mode of a frame with no extendable photo: one thing on a quiet ground, or a scene. */
export const modeOf = (frame) => (/illustration|product/.test(String(frame?.role ?? '')) ? 'object' : 'scene')

/**
 * The drawer of one run.
 * @param {{ door: object, prompt: { parts: Record<string, string>, sha256: string }, storeDir: string, runId: string,
 *   photoBytes: Map<string, Buffer>, fetchImpl?: typeof fetch }} input
 */
export function createDrawing({ door, prompt, storeDir, runId, photoBytes, fetchImpl = fetch }) {
  const store = fileStore(storeDir)
  const kept = (key) => path.join(store.dir, 'runs', String(runId), 'draws', `${key}.json`)

  /** The real photo laid in the middle of the band, or null when it cannot be (not narrower, or it would grow). */
  async function bandOf(asset, out) {
    const upright = await sharp(Buffer.from(photoBytes.get(asset.id)), { failOn: 'none' })
      .rotate()
      .toBuffer()
    const meta = await sharp(upright).metadata()
    const enlarge = Number((out.height / meta.height).toFixed(4))
    const width = Math.round(meta.width * enlarge)
    if (enlarge > 1 || width >= out.width) return null
    const real = await sharp(upright).resize(width, out.height, { fit: 'fill' }).toBuffer()
    const realPart = { x: Math.floor((out.width - width) / 2), y: 0, width, height: out.height }
    const canvas = await sharp({
      create: { width: out.width, height: out.height, channels: 3, background: GREY }
    })
      .composite([{ input: real, left: realPart.x, top: 0 }])
      .png()
      .toBuffer()
    const sent = await sharp(canvas)
      .resize(SEND_MAX, SEND_MAX, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return {
      real,
      realPart,
      sent,
      enlarge,
      crop: { x: 0, y: 0, width: meta.width, height: meta.height },
      photoSha: sha256Hex(photoBytes.get(asset.id))
    }
  }

  /**
   * Draw one frame. `asset` (outpaint only) the owner photo to extend; `faults` the looker's fault names on a redraw.
   * @returns {Promise<{ made: object | null, call: object, extra: object, problem?: string }>} `made` the stored file
   *   ({ name, ext, sha256, width, height }); `call` the record of the call; `extra` the entry fields of an extension
   */
  async function draw({ frameId, wish, frame, demo, mode, asset = null, faults = null, attempt = 1 }) {
    const out = outputSizeFor(demo, frame, 2 * Number(frame.width))
    const band = mode === 'outpaint' ? await bandOf(asset, out) : null
    if (mode === 'outpaint' && !band)
      return {
        made: null,
        problem: 'the photo cannot be extended to this band without enlarging it',
        call: null,
        extra: {}
      }
    const text = drawingText(prompt.parts, mode, wish, faults)
    const key = sha256Hex(
      JSON.stringify([mode, text, band?.photoSha ?? null, out, door.model, prompt.sha256])
    )
    const base = { frame: frameId, mode, attempt }
    const extra = band
      ? { asset: asset.id, realPart: band.realPart, crop: band.crop, enlarge: band.enlarge }
      : {}
    const before = await readFile(kept(key), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (before && (await store.readPicture(before.name)))
      return {
        made: before,
        extra,
        call: {
          ...base,
          sha256: before.sha256,
          model: before.model,
          ms: before.ms,
          costUsd: before.costUsd,
          cached: true
        }
      }
    const answer = await askDrawer({
      door,
      text,
      image: band?.sent ?? null,
      aspect: aspectRatioFor(out.width, out.height),
      fetchImpl
    })
    const call = {
      ...base,
      sha256: null,
      model: answer.model,
      ms: answer.ms,
      costUsd: answer.costUsd,
      cached: false
    }
    if (!answer.bytes)
      return { made: null, problem: answer.problem, call: { ...call, problem: answer.problem }, extra }
    let fitted
    try {
      fitted = sharp(answer.bytes, { failOn: 'none' })
        .rotate()
        .resize(out.width, out.height, { fit: 'cover' })
      if (band)
        fitted = sharp(await fitted.png().toBuffer()).composite([
          { input: band.real, left: band.realPart.x, top: 0 }
        ])
      fitted = await fitted.jpeg(JPEG).toBuffer()
    } catch (error) {
      const problem = `the drawer's picture cannot be read: ${String(error?.message ?? error).slice(0, 200)}`
      return { made: null, problem, call: { ...call, problem }, extra }
    }
    const name = await store.putPicture(fitted, 'jpg')
    const made = {
      name,
      ext: 'jpg',
      sha256: name.split('.')[0],
      width: out.width,
      height: out.height,
      model: answer.model,
      ms: answer.ms,
      costUsd: answer.costUsd
    }
    await mkdir(path.dirname(kept(key)), { recursive: true })
    await writeFile(kept(key), JSON.stringify(made))
    return { made, extra, call: { ...call, sha256: made.sha256 } }
  }

  return { draw }
}
