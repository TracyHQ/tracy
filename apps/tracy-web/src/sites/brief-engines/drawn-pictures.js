/**
 * The drawing step of a brief build (spec TracyHQ/tracy#189, tickets #194 and #195), run where the Customize engine places
 * the owner's photos (`real-pictures.js` `shapeReal`). The fill plan decided what is drawn (`domain/fill-draw.mjs`) and
 * which icons and cut-outs follow the business (`domain/decor-plan.mjs`); this step makes the pictures.
 *
 *   drawings   each planned drawing once, through the picture model door (`lib/picture-draw.js`), at most `DRAW_AT_ONCE`
 *              at a time and each within its own time limit; read back by the photo labeller and refused when it shows
 *              words, a logo or a face; refused once more, the slots it serves keep the brand colour block. A drawing
 *              accepted is cached by references, shape, mode, subject, prompt version and model, so a rebuild pays nothing.
 *   icons      each subject-carrying item icon rendered from the icon set (`lib/icon-glyphs.js`) at the demo icon's size,
 *              in the demo icon's own colour
 *   cut-outs   an object of the activity drawn on a plain ground and cut free of it, checked like any drawing; else the
 *              figure is cleared (a transparent picture of its size)
 *
 * 🔒 NEVER IN THE WAY OF THE BUILD: a model that fails, a labeller that refuses or a picture that cannot be cut leaves the
 * slot on its neutral substitute with a note; nothing here throws for one picture.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { declaredSize } from 'website-opportunities/domain/pictures/slot-map.mjs'
import { cutForPlace } from '../../lib/picture-cut.js'
import { drawForPlace, drawKey, drawPrompt } from '../../lib/picture-draw.js'
import { iconColourOf, iconPicture } from '../../lib/icon-glyphs.js'
import { substitutePicture } from '../../lib/substitute-picture.js'
import { sizeOf } from './pictures.js'
import { pool } from './shared.js'

/** Pictures drawn at once: each is a paid model call of ~8 s. */
const DRAW_AT_ONCE = 2
/** Tries of one drawing: the first, and one more when the labeller refuses it. */
const TRIES = 2
/** A pixel this close to white is the plain ground of an object drawn for a cut-out. */
const GROUND = 238

/**
 * Draw one item: from the cache, else from the model, checked by the labeller and drawn once more when refused.
 * @returns {Promise<{bytes: Buffer, costUsd: number, calls: number, cached: boolean, checked: boolean} |
 *   {refused: string[], costUsd: number, calls: number}>}
 */
async function drawChecked({ item, real, drawDoor, chat, signal, drawMs, verdictOf }) {
  const shaOf = new Map(real.pictures.map((p) => [p.id, p.sha256]))
  const key = drawKey(item, {
    model: drawDoor.imageModel,
    shas: item.referenceIds.map((id) => shaOf.get(id))
  })
  const cached = await (real.drawing?.get(key) ?? Promise.resolve(null)).catch(() => null)
  if (cached) return { bytes: cached.bytes, costUsd: 0, calls: 0, cached: true, checked: true }
  // No labeller: nothing could be checked, so nothing is drawn (never an unchecked picture on the site).
  if (!real.checkDrawing) return { refused: ['labeller-unavailable'], costUsd: 0, calls: 0 }
  const references = (await Promise.all(item.referenceIds.map((id) => real.bytes(id)))).filter(Boolean)
  if (references.length === 0) return { refused: ['no-reference-readable'], costUsd: 0, calls: 0 }
  const refused = []
  let costUsd = 0
  let calls = 0
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const cutoff = AbortSignal.any([AbortSignal.timeout(drawMs), ...(signal ? [signal] : [])])
    let got
    try {
      calls += 1
      got = await drawForPlace({ door: drawDoor, chat, item, references, signal: cutoff })
    } catch (error) {
      refused.push(/too long/.test(String(error?.message)) ? 'timed-out' : 'model-failed')
      continue
    }
    costUsd += Number(got.costUsd) || 0
    // The labeller is asked twice at most; still no answer, the drawing is refused (it is not the drawing's fault, so
    // it is not drawn again).
    let labels = await real.checkDrawing(got.bytes).catch(() => null)
    labels ??= await real.checkDrawing(got.bytes).catch(() => null)
    const verdict = verdictOf(labels)
    if (!verdict.ok) {
      refused.push(verdict.reason)
      if (verdict.reason === 'labeller-unavailable') break
      continue
    }
    await (real.drawing?.put(key, got.bytes) ?? Promise.resolve()).catch(() => {})
    return { bytes: got.bytes, costUsd, calls, cached: false, checked: true }
  }
  return { refused, costUsd, calls }
}

/**
 * The planned drawings, made and cut to every group they serve.
 * @param {object} input
 * @param {{unfilled: any[], drawings?: any[]}} input.plan - the placement plan with the fill plan's drawings
 * @param {Map<string, any>} input.byGroup - the file groups by id (`slotMap`, split by unit)
 * @param {any} input.real - the build's pictures (`realPicturesOf`), with `checkDrawing` when a labeller is set
 * @param {{url: string, key: string, imageModel: string} | null} input.drawDoor
 * @param {Function} input.chat
 * @param {any} input.domain
 * @param {(note: string) => void} input.note
 * @param {AbortSignal} [input.signal]
 * @param {number} input.drawMs
 * @param {boolean} [input.outpaintOnly]
 * @returns {Promise<{drawn: Map<string, any>, stats: {drawings: number, calls: number, costUsd: number, ms: number,
 *   refused: Array<{drawing: string, reasons: string[]}>}}>}
 */
export async function drawPlanned({
  plan,
  byGroup,
  real,
  drawDoor,
  chat,
  domain,
  note,
  signal,
  drawMs,
  outpaintOnly = false
}) {
  const started = Date.now()
  const drawn = new Map()
  const stats = { drawings: 0, calls: 0, costUsd: 0, ms: 0, refused: [] }
  const drawings = (plan.drawings ?? []).filter((g) => !outpaintOnly || g.mode === 'outpaint')
  if (drawings.length === 0) return { drawn, stats }
  if (!drawDoor?.imageModel) {
    note(`no picture model is set, so ${drawings.length} picture(s) to draw take a brand colour block`)
    return { drawn, stats }
  }
  const asGroup = (g) => ({ sample: g.id, role: g.role, slots: g.occurrences })
  const answers = await pool(
    drawings.map((g) => async () => {
      const groups = plan.unfilled
        .filter((u) => u.action === 'draw' && u.drawing === g.id)
        .map((u) => byGroup.get(u.groupId))
        .filter(Boolean)
      if (groups.length === 0) return
      const item = {
        mode: g.mode,
        aspect: g.aspect,
        referenceIds: g.referenceIds,
        subject: g.subject,
        variant: g.variant
      }
      const got = await drawChecked({
        item,
        real,
        drawDoor,
        chat,
        signal,
        drawMs,
        verdictOf: domain.drawnPictureVerdict
      })
      stats.calls += got.calls
      stats.costUsd += got.costUsd
      if (!('bytes' in got)) {
        stats.refused.push({ drawing: g.id, reasons: got.refused })
        note(
          `a picture drawn for ${groups[0].file} was refused (${got.refused.join(', ')}), so it takes a brand colour block`
        )
        return
      }
      stats.drawings += 1
      const size = await sizeOf(Buffer.from(got.bytes))
      if (!size) return
      let first = true
      for (const group of groups) {
        // The shape the drawing was planned at: the slot's own box when the site measures one (fitAspectOf), so a
        // drawing is never cut to the demo file's shape and then again to the box's.
        const aspect = g.aspect || group.demo.width / group.demo.height
        const box = domain.cropBox(size[0], size[1], aspect)
        // A drawing is a picture like any other: never enlarged past the role's limit (C9).
        const target = Math.min(group.demo.width, (domain.ROLES[group.role] ?? domain.ROLES.section).min)
        if (target / box.width > domain.MAX_SCALE) {
          note(`a picture drawn for ${group.file} came back too small, so it takes a brand colour block`)
          continue
        }
        const output = domain.outputSize(box, aspect, group.demo.width)
        if (!output) continue
        const cut = await cutForPlace(got.bytes, { aspect, source: box, output, strategy: 'centre' })
        drawn.set(group.id, {
          group: asGroup(group),
          bytes: cut.bytes,
          ext: cut.ext,
          hash: cut.sha256,
          receipt: {
            kind: 'drawn',
            origin: g.mode === 'outpaint' ? 'outpainted' : 'generated',
            drawing: g.id,
            mode: g.mode,
            subject: g.subject,
            referenceIds: g.referenceIds,
            prompt: drawPrompt(item),
            model: drawDoor.imageModel,
            // The cost is the drawing's, counted once however many slots it serves.
            costUsd: first ? got.costUsd : 0,
            reused: !first,
            cached: got.cached,
            checked: got.checked,
            width: cut.width,
            height: cut.height
          }
        })
        first = false
      }
    }),
    DRAW_AT_ONCE
  )
  for (const answer of answers)
    if (!answer.ok)
      note(
        `a picture could not be drawn: ${answer.error instanceof Error ? answer.error.message : answer.error}`
      )
  stats.costUsd = Number(stats.costUsd.toFixed(4))
  stats.ms = Date.now() - started
  return { drawn, stats }
}

/** An object drawn on a plain light ground, cut free of it: the ground turned transparent, fitted to the frame. */
async function cutFree(bytes, width, height) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4)
    if (data[i] >= GROUND && data[i + 1] >= GROUND && data[i + 2] >= GROUND) data[i + 3] = 0
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
}

/**
 * The decor groups of a build (#195): icons rendered from the icon set, cut-outs drawn or cleared. One upload per demo
 * file and glyph (a dark and a light icon of one item are two files, each in its own colour).
 * @param {object} input
 * @param {Array<{key: string, file: string, action: string, glyph?: string, mode?: string, subject?: any,
 *   referenceIds?: string[]}>} input.decisions - `planDecor`'s slots
 * @param {Map<string, any>} input.slotOf - content map slots by key (declared ones included)
 * @param {(file: string) => Promise<Uint8Array | null>} input.siteBytes
 * @param {any} input.real
 * @param {any} input.domain
 * @param {{url: string, key: string, imageModel: string} | null} input.drawDoor
 * @param {Function | null} input.chat
 * @param {(note: string) => void} input.note
 * @param {AbortSignal} [input.signal]
 * @param {number} input.drawMs
 * @returns {Promise<{shaped: any[], stats: {icons: number, cutOuts: number, cleared: number, calls: number, costUsd: number}}>}
 */
export async function shapeDecor({
  decisions,
  slotOf,
  siteBytes,
  real,
  domain,
  drawDoor,
  chat,
  note,
  signal,
  drawMs
}) {
  const stats = { icons: 0, cutOuts: 0, cleared: 0, calls: 0, costUsd: 0 }
  const units = new Map()
  for (const d of decisions) {
    if (d.action !== 'icon' && d.action !== 'cut-out') continue
    const id = d.action === 'icon' ? `${d.file}#icon:${d.glyph}` : `${d.file}#cut-out`
    const unit = units.get(id) ?? { id, decision: d, occurrences: [] }
    const slot = slotOf.get(d.key)
    unit.occurrences.push({
      key: d.key,
      entity: slot?.entity,
      label: slot?.label ?? '',
      sample: slot?.sample,
      // The words the site takes a kept picture with (`replace_kept`): see `decorAsked` in the decor plan.
      ...(typeof d.asked === 'string' && d.asked ? { asked: d.asked } : {})
    })
    units.set(id, unit)
  }
  const sizes = new Map()
  const demoOf = async (file, sample) => {
    if (!sizes.has(file)) {
      const bytes = await siteBytes(file).catch(() => null)
      const size = bytes ? await sizeOf(Buffer.from(bytes)) : null
      const declared = declaredSize(sample)
      sizes.set(file, {
        width: size?.[0] ?? declared?.width ?? null,
        height: size?.[1] ?? declared?.height ?? null,
        colour: await iconColourOf(bytes)
      })
    }
    return sizes.get(file)
  }
  const answers = await pool(
    [...units.values()].map((unit) => async () => {
      const d = unit.decision
      const demo = await demoOf(d.file, unit.occurrences[0]?.sample)
      if (!demo.width || !demo.height) return null
      const group = {
        sample: unit.id,
        role: d.action === 'icon' ? 'icon' : 'cut-out',
        slots: unit.occurrences
      }
      if (d.action === 'icon') {
        const icon = await iconPicture({
          glyph: d.glyph,
          width: demo.width,
          height: demo.height,
          colour: demo.colour ?? real.colours?.[0] ?? '#222222'
        })
        stats.icons += 1
        return {
          decor: true,
          group,
          bytes: icon.bytes,
          ext: icon.ext,
          hash: icon.sha256,
          receipt: {
            kind: 'icon',
            origin: 'icon-set',
            glyph: d.glyph,
            reason: d.reason,
            width: demo.width,
            height: demo.height
          }
        }
      }
      if (d.mode === 'object' && drawDoor?.imageModel && chat) {
        const item = {
          mode: 'object',
          aspect: demo.width / demo.height,
          referenceIds: d.referenceIds,
          subject: d.subject
        }
        const got = await drawChecked({
          item,
          real,
          drawDoor,
          chat,
          signal,
          drawMs,
          verdictOf: domain.drawnPictureVerdict
        })
        stats.calls += got.calls
        stats.costUsd += got.costUsd
        if ('bytes' in got) {
          const bytes = await cutFree(got.bytes, demo.width, demo.height)
          stats.cutOuts += 1
          return {
            decor: true,
            group,
            bytes,
            ext: 'png',
            hash: createHash('sha256').update(bytes).digest('hex'),
            receipt: {
              kind: 'cut-out',
              origin: 'generated',
              mode: 'object',
              subject: d.subject,
              referenceIds: d.referenceIds,
              prompt: drawPrompt(item),
              model: drawDoor.imageModel,
              costUsd: got.costUsd,
              checked: got.checked,
              width: demo.width,
              height: demo.height
            }
          }
        }
        note(
          `a cut-out drawn for ${d.file} was refused (${got.refused.join(', ')}), so the figure is cleared`
        )
      }
      const blank = await substitutePicture({
        substitute: { kind: 'blank' },
        width: demo.width,
        height: demo.height
      })
      stats.cleared += 1
      return {
        decor: true,
        group,
        bytes: blank.bytes,
        ext: blank.ext,
        hash: blank.sha256,
        receipt: {
          kind: 'blank',
          origin: 'placeholder',
          reason: 'cut-out-cleared',
          width: demo.width,
          height: demo.height
        }
      }
    }),
    DRAW_AT_ONCE
  )
  const shaped = []
  for (const answer of answers)
    if (answer.ok && answer.value) shaped.push(answer.value)
    else if (!answer.ok)
      note(
        `a decorative picture could not be made: ${answer.error instanceof Error ? answer.error.message : answer.error}`
      )
  stats.costUsd = Number(stats.costUsd.toFixed(4))
  return { shaped, stats }
}

/**
 * The picture slots a contract's profile only declares (`customize: "keep"`): never planned by the words path, read here
 * so the icons and cut-outs among them can follow the business (#195). Empty when the map cannot be read.
 * @param {{dir: string} | null | undefined} contract
 */
export function declaredPictureSlots(contract) {
  if (!contract?.dir) return []
  try {
    const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
    return (map.slots ?? []).filter((s) => s?.type === 'image' && s.customize === 'keep')
  } catch {
    return []
  }
}
