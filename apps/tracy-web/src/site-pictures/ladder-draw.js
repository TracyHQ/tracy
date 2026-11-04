// The drawer of the fallback ladder (#344, ADR 0043 sections 3 and 4): one drawing for one frame, written at the size
// the frame's picture is written at (cut-photo.js outputSizeFor: the demo file's aspect, at least the display box).
//
// - `scene` and `object`: the model draws from the fixed template; code fits its answer to the frame (cover, centred).
// - `outpaint`: a portrait owner photo placed in the middle of a wide band at the band's height (never enlarged), the
//   sides grey; the model extends the sides, and code pastes the real photo back over the middle of its answer, so the
//   real part is the owner's own pixels. The entry records that box as `realPart`, which the looker outlines.
// - `cutout` (#346): the figure of a cut-out frame drawn on a flat plain ground of one colour (cutout-ground.js
//   groundFor); code removes the ground and contains the figure in the frame's size as a PNG with alpha. The entry
//   records the ground and that it was removed in `cutout`. A ground that cannot be removed cleanly is a failed draw,
//   with the looker fault the redraw names. When the kit's demo picture of the frame can be read (`readDemo`), it is
//   attached as a style reference only (flattened on a light grey, at most STYLE_MAX px): the template's `style` part
//   tells the model to copy its framing, scale, pose energy, light and attitude and nothing of its subject. The call
//   record names it by its sha256 (`styleSha256`). When that demo picture has a backdrop behind its figure (a disc and
//   accent bands, cutout-backdrop.js), the entry records its recipe in `backdrop`, with a review composite of the
//   figure over it (the disc in the neutral preview palette, the bands in the template accent, marked `preview`); the
//   placed file stays the figure alone and step 9 paints the backdrop in the brand's colours.
//
// Every drawing is kept in the bench's file store (runs/<run id>/draws/<key>.json, the key a hash of the mode, the
// text, the real photo, the size, the model and the template), so a later round or a resumed run pays once per
// drawing. A call that fails is not kept: the ladder moves on.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { outputSizeFor } from './cut-photo.js'
import { backdropOf } from './cutout-backdrop.js'
import { backdropComposite } from './cutout-backdrop-draw.js'
import { cutoutFile, groundFor } from './cutout-ground.js'
import { askDrawer, aspectRatioFor, drawingText } from './drawer-call.js'
import { fileStore, sha256Hex } from './file-store.js'
import { PREVIEW_PALETTE, previewColour } from './paint.js'

/** A frame at least this many times wider than tall is a wide band, which a portrait owner photo may be extended to. */
export const WIDE_BAND = 2
/** The longest side of the picture sent to be extended. */
const SEND_MAX = 1536
/** The longest side of a demo picture sent as a style reference. */
export const STYLE_MAX = 768
const STYLE_GROUND = { r: 220, g: 220, b: 220 }
const GREY = { r: 128, g: 128, b: 128 }
const JPEG = { quality: 86, mozjpeg: false }

/** The drawing mode of a frame with no extendable photo: one thing on a quiet ground, or a scene. */
export const modeOf = (frame) => (/illustration|product/.test(String(frame?.role ?? '')) ? 'object' : 'scene')

/**
 * The drawer of one run.
 * @param {{ door: object, prompt: { parts: Record<string, string>, sha256: string }, storeDir: string, runId: string,
 *   photoBytes: Map<string, Buffer>, readDemo?: ((frame: object) => Promise<Buffer | null>) | null,
 *   accent?: string | null, fetchImpl?: typeof fetch }} input `readDemo`: the kit's demo picture of a frame
 *   (demo-pictures.js), or null; `accent` the template accent, the colour a backdrop preview's bands are drawn in
 */
export function createDrawing({
  door,
  prompt,
  storeDir,
  runId,
  photoBytes,
  readDemo = null,
  accent = null,
  fetchImpl = fetch
}) {
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

  /** The kit's demo picture of a cut-out frame as a style reference, or null when it cannot be read. */
  async function styleOf(frame) {
    const demo = readDemo ? await readDemo(frame).catch(() => null) : null
    if (!demo?.length) return null
    try {
      const backdrop = await backdropOf(demo, { accent })
      const sent = await sharp(Buffer.from(demo), { failOn: 'none' })
        .rotate()
        .flatten({ background: STYLE_GROUND })
        .resize(STYLE_MAX, STYLE_MAX, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      return { sent, sha256: sha256Hex(demo), backdrop }
    } catch {
      return null
    }
  }

  /**
   * Draw one frame. `asset` (outpaint only) the owner photo to extend; `faults` the looker's fault names on a redraw.
   * @returns {Promise<{ made: object | null, call: object, extra: object, problem?: string, faults?: string[] }>}
   *   `made` the stored file ({ name, ext, sha256, width, height }); `call` the record of the call; `extra` the entry
   *   fields of an extension or a cut-out; `faults` the looker faults of a cut-out whose ground could not be removed
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
    const ground = mode === 'cutout' ? groundFor(wish) : null
    const style = mode === 'cutout' ? await styleOf(frame) : null
    const text = drawingText(prompt.parts, mode, wish, faults, ground, { style: Boolean(style) })
    const key = sha256Hex(
      JSON.stringify([mode, text, band?.photoSha ?? style?.sha256 ?? null, out, door.model, prompt.sha256])
    )
    const base = { frame: frameId, mode, attempt, ...(style ? { styleSha256: style.sha256 } : {}) }
    const extra = band
      ? { asset: asset.id, realPart: band.realPart, crop: band.crop, enlarge: band.enlarge }
      : {}
    const before = await readFile(kept(key), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (before && (await store.readPicture(before.name)))
      return withBackdrop(style, {
        made: before,
        extra: before.cutout ? { cutout: before.cutout } : extra,
        call: {
          ...base,
          sha256: before.sha256,
          model: before.model,
          ms: before.ms,
          costUsd: before.costUsd,
          cached: true
        }
      })
    const answer = await askDrawer({
      door,
      text,
      image: band?.sent ?? style?.sent ?? null,
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
    if (ground) return withBackdrop(style, await cutoutOf(answer.bytes, ground, out, call, key))
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
    return { ...(await keep(key, fitted, 'jpg', out, call)), extra }
  }

  // The drawing's ground removed (cutout-ground.js); a ground that cannot be removed cleanly is a failed draw.
  async function cutoutOf(bytes, ground, out, call, key) {
    let cut
    try {
      cut = await cutoutFile(bytes, ground, out)
    } catch (error) {
      cut = {
        ok: false,
        reason: `it cannot be read: ${String(error?.message ?? error).slice(0, 200)}`,
        fault: null
      }
    }
    if (!cut.ok) {
      const problem = `the ground of the drawing could not be removed cleanly: ${cut.reason}`
      return {
        made: null,
        problem,
        faults: cut.fault ? [cut.fault] : null,
        call: { ...call, problem },
        extra: {}
      }
    }
    const stored = await keep(key, cut.png, 'png', out, call, { cutout: cut.cutout })
    return { ...stored, extra: { cutout: cut.cutout } }
  }

  // A placed cut-out whose demo has a backdrop: the recipe in the entry, and the review composite stored beside it
  // (`backdropFile`, which the ladder keeps with the run's files). A composite that cannot be made leaves it out.
  async function withBackdrop(style, res) {
    const recipe = style?.backdrop
    if (!res.made || !recipe) return res
    try {
      const figure = await store.readPicture(res.made.name)
      // The review colours: the disc in the neutral preview palette, the bands in the template accent so the owner
      // can judge them (labelled in `drawnIn`; step 9 uses the brand's accent).
      const drawnIn = {
        circle: previewColour(recipe.paint.circle),
        stripes: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : PREVIEW_PALETTE.accent
      }
      const { png, width, height } = await backdropComposite(figure, recipe, drawnIn)
      const name = await store.putPicture(png, 'png')
      const sha256 = name.split('.')[0]
      const preview = { file: `files/${name}`, width, height, sha256, drawnIn, preview: true }
      return {
        ...res,
        backdropFile: { name, ext: 'png', sha256, width, height },
        extra: { ...res.extra, backdrop: { shape: recipe.shape, paint: recipe.paint, preview } }
      }
    } catch {
      return res
    }
  }

  // Store the finished file and its record (by the drawing's key), so a later round reads it instead of paying again.
  async function keep(key, bytes, ext, out, call, more = {}) {
    const name = await store.putPicture(bytes, ext)
    const made = {
      name,
      ext,
      sha256: name.split('.')[0],
      width: out.width,
      height: out.height,
      model: call.model,
      ms: call.ms,
      costUsd: call.costUsd,
      ...more
    }
    await mkdir(path.dirname(kept(key)), { recursive: true })
    await writeFile(kept(key), JSON.stringify(made))
    return { made, call: { ...call, sha256: made.sha256 } }
  }

  return { draw }
}
