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
 *   cut-outs   the step of the cut-out ladder the plan chose (`cutout-pictures.js`): the owner's own transparent
 *              picture, an owner photo in a frame, or a clear picture the head block hides. Never drawn.
 *
 * 🔒 NEVER IN THE WAY OF THE BUILD: a model that fails, a labeller that refuses or a picture that cannot be cut leaves the
 * slot on its neutral substitute with a note; nothing here throws for one picture.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { declaredSize } from 'website-opportunities/domain/pictures/slot-map.mjs'
import { brandInkOf, brandPaletteOf } from 'website-opportunities/domain/brand-colours.mjs'
import { cutForPlace } from '../../lib/picture-cut.js'
import { drawForPlace, drawKey, drawPrompt } from '../../lib/picture-draw.js'
import { iconColourOf, iconPicture } from '../../lib/icon-glyphs.js'
import { iconStyleOf, sectionWeightOf } from '../../lib/icon-style.js'
import { footprintOf, framedPicture, ownCutOutPicture } from './cutout-pictures.js'
import { substitutePicture } from '../../lib/substitute-picture.js'
import { sizeOf } from './pictures.js'
import { blurredBand } from '../../lib/photo-sharpness.js'
import { pool } from './shared.js'
import { drawingFailureReason, logDrawingFailure } from './drawing-failures.js'
import { pictureDeadline } from './picture-deadline.js'

/** Pictures drawn at once: each is a paid model call of ~8 s. */
const DRAW_AT_ONCE = 2
/** Tries of one drawing: the first, and one more when the labeller refuses it. */
const TRIES = 2

/**
 * Whether a drawing, cut to the shape it is placed at (the centre, as the cut step takes it), has an edge band blurred
 * and stretched (`blurredBand`). An unreadable drawing is not judged here.
 * @param {Uint8Array} bytes
 * @param {number} aspect
 */
async function paddedAt(bytes, aspect) {
  try {
    const size = await sizeOf(Buffer.from(bytes))
    if (!size || !(aspect > 0)) return false
    const wide = size[0] / size[1] > aspect
    const width = wide ? Math.round(size[1] * aspect) : size[0]
    const height = wide ? size[1] : Math.round(size[0] / aspect)
    const cut = await cutForPlace(bytes, {
      aspect,
      source: { width, height },
      output: { width, height },
      strategy: 'centre'
    })
    return (await blurredBand(cut.bytes)) !== null
  } catch {
    return false
  }
}

/**
 * Draw one item: from the cache, else from the model, checked by the labeller and drawn once more when refused.
 * @returns {Promise<{bytes: Buffer, costUsd: number, calls: number, cached: boolean, checked: boolean} |
 *   {refused: string[], reasonClass: string, costUsd: number, calls: number}>}
 */
async function drawChecked({ item, real, drawDoor, chat, signal, drawMs, verdictOf }) {
  const shaOf = new Map(real.pictures.map((p) => [p.id, p.sha256]))
  const key = drawKey(item, {
    model: drawDoor.imageModel,
    shas: item.referenceIds.map((id) => shaOf.get(id))
  })
  const cached = await pictureDeadline(() => real.drawing?.get(key) ?? null, signal).catch(() => {
    signal?.throwIfAborted()
    return null
  })
  // A drawing kept before the band check is checked now: a padded one is drawn again, never reused.
  if (cached && !(await pictureDeadline(() => paddedAt(cached.bytes, item.aspect), signal)))
    return { bytes: cached.bytes, costUsd: 0, calls: 0, cached: true, checked: true }
  // No labeller: nothing could be checked, so nothing is drawn (never an unchecked picture on the site).
  if (!real.checkDrawing) {
    logDrawingFailure('refused by the labeller')
    return { refused: ['labeller-unavailable'], reasonClass: 'refused by the labeller', costUsd: 0, calls: 0 }
  }
  const references = (
    await pictureDeadline(() => Promise.all(item.referenceIds.map((id) => real.bytes(id))), signal)
  ).filter(Boolean)
  if (references.length === 0) {
    logDrawingFailure('model failed')
    return { refused: ['no-reference-readable'], reasonClass: 'model failed', costUsd: 0, calls: 0 }
  }
  const refused = []
  let reasonClass = 'model failed'
  let costUsd = 0
  let calls = 0
  try {
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      signal?.throwIfAborted()
      const cutoff = AbortSignal.any([AbortSignal.timeout(drawMs), ...(signal ? [signal] : [])])
      let got
      try {
        calls += 1
        got = await drawForPlace({ door: drawDoor, chat, item, references, signal: cutoff })
      } catch (error) {
        reasonClass = drawingFailureReason(error)
        refused.push(reasonClass.replaceAll(' ', '-'))
        logDrawingFailure(reasonClass)
        // Retrying cannot replenish a provider balance and must not replace the actionable credit reason.
        if (reasonClass === 'out of credit' || cutoff.aborted) break
        continue
      }
      costUsd += Number(got.costUsd) || 0
      // The labeller is asked twice at most; still no answer, the drawing is refused (it is not the drawing's fault, so
      // it is not drawn again).
      const readLabels = () => pictureDeadline(() => real.checkDrawing(got.bytes), cutoff).catch(() => null)
      let labels = await readLabels()
      labels ??= await readLabels()
      signal?.throwIfAborted()
      const verdict = verdictOf(labels)
      if (!verdict.ok) {
        reasonClass = 'refused by the labeller'
        refused.push(verdict.reason)
        logDrawingFailure(reasonClass, verdict.reason)
        if (verdict.reason === 'labeller-unavailable') break
        continue
      }
      // A model asked for a wide frame sometimes fills its edge with a blurred, stretched copy of the scene: such a
      // drawing fails like an unsharp photo, and is drawn once more (sharpness gate, #189).
      if (await pictureDeadline(() => paddedAt(got.bytes, item.aspect), cutoff)) {
        reasonClass = 'picture quality'
        refused.push('blurred-region')
        logDrawingFailure(reasonClass, 'blurred-region')
        continue
      }
      signal?.throwIfAborted()
      await pictureDeadline(() => real.drawing?.put(key, got.bytes) ?? null, signal).catch(() => {})
      signal?.throwIfAborted()
      return { bytes: got.bytes, costUsd, calls, cached: false, checked: true }
    }
  } catch (error) {
    reasonClass = drawingFailureReason(error)
    refused.push(reasonClass.replaceAll(' ', '-'))
    logDrawingFailure(reasonClass)
  }
  return { refused, reasonClass, costUsd, calls }
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
 *   refused: Array<{drawing: string, reasons: string[], reasonClass: string}>}}>}
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
      signal?.throwIfAborted()
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
        variant: g.variant,
        // The logo's colours, so a drawing sits with the site's brand colours (ADR 0023 amended 29/10/2026).
        ...paletteOf(real)
      }
      // The job deadline also covers cache reads, references and labelling, not just the provider call.
      const jobSignal = AbortSignal.any([AbortSignal.timeout(drawMs * TRIES), ...(signal ? [signal] : [])])
      const got = await drawChecked({
        item,
        real,
        drawDoor,
        chat,
        signal: jobSignal,
        drawMs,
        verdictOf: domain.drawnPictureVerdict
      })
      stats.calls += got.calls
      stats.costUsd += got.costUsd
      if (!('bytes' in got)) {
        stats.refused.push({ drawing: g.id, reasons: got.refused, reasonClass: got.reasonClass })
        if (got.reasonClass !== 'out of credit')
          note(
            `a picture drawn for ${groups[0].file} was refused (${got.refused.join(', ')}), ${got.reasonClass}, so it takes a brand colour block`
          )
        return
      }
      stats.drawings += 1
      const size = await pictureDeadline(() => sizeOf(Buffer.from(got.bytes)), jobSignal)
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
        const cut = await pictureDeadline(
          () => cutForPlace(got.bytes, { aspect, source: box, output, strategy: 'centre' }),
          jobSignal
        )
        jobSignal.throwIfAborted()
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
  for (const [index, answer] of answers.entries()) {
    if (answer.ok) continue
    const reasonClass = drawingFailureReason(answer.error)
    logDrawingFailure(reasonClass)
    stats.refused.push({
      drawing: drawings[index].id,
      reasons: [reasonClass.replaceAll(' ', '-')],
      reasonClass
    })
    if (reasonClass !== 'out of credit')
      note(`a picture could not be drawn (${reasonClass}), so it takes a brand colour block`)
  }
  if (stats.refused.some((item) => item.reasonClass === 'out of credit'))
    note(
      'The picture provider is out of credit. Undrawn pictures use brand colour blocks. Add credit before drawing again.'
    )
  stats.costUsd = Number(stats.costUsd.toFixed(4))
  stats.ms = Date.now() - started
  return { drawn, stats }
}

/**
 * The decor groups of a build (#195): icons rendered from the icon set, cut-outs by the ladder's step. One upload per demo
 * file and glyph (a dark and a light icon of one item are two files, each in its own colour).
 * @param {object} input
 * @param {Array<{key: string, file: string, action: string, glyph?: string, mode?: string, step?: number,
 *   mediaId?: string, reason?: string, asked?: string}>} input.decisions - `planDecor`'s slots
 * @param {Map<string, any>} input.slotOf - content map slots by key (declared ones included)
 * @param {(file: string) => Promise<Uint8Array | null>} input.siteBytes
 * @param {any} input.real
 * @param {(note: string) => void} input.note
 * @returns {Promise<{shaped: any[], stats: {icons: number, cutOuts: number, framed: number, cleared: number,
 *   calls: number, costUsd: number}}>}
 */
export async function shapeDecor({ decisions, slotOf, siteBytes, real, note }) {
  const stats = { icons: 0, cutOuts: 0, framed: 0, cleared: 0, calls: 0, costUsd: 0 }
  const sizes = new Map()
  const demoOf = async (file, sample) => {
    if (!sizes.has(file)) {
      const bytes = await siteBytes(file).catch(() => null)
      const size = bytes ? await sizeOf(Buffer.from(bytes)) : null
      const declared = declaredSize(sample)
      sizes.set(file, {
        width: size?.[0] ?? declared?.width ?? null,
        height: size?.[1] ?? declared?.height ?? null,
        colour: await iconColourOf(bytes),
        footprint: await footprintOf(bytes).catch(() => null),
        // The demo icon's look (outline weight, solid, two-tone): the new icon takes the matching weight (#189).
        style: await iconStyleOf(bytes)
      })
    }
    return sizes.get(file)
  }
  // One weight per section (the entity the icons sit in): the weight most of its demo icons measure (#189).
  const sectionOf = (d) => slotOf.get(d.key)?.entity ?? d.key
  const styles = new Map()
  for (const d of decisions) {
    if (d.action !== 'icon') continue
    const demo = await demoOf(d.file, slotOf.get(d.key)?.sample)
    const list = styles.get(sectionOf(d)) ?? []
    list.push(demo.style)
    styles.set(sectionOf(d), list)
  }
  const weightOf = new Map([...styles].map(([section, list]) => [section, sectionWeightOf(list)]))
  const units = new Map()
  for (const d of decisions) {
    if (d.action !== 'icon' && d.action !== 'cut-out') continue
    const weight = d.action === 'icon' ? weightOf.get(sectionOf(d)) : null
    const id = d.action === 'icon' ? `${d.file}#icon:${d.glyph}:${weight}` : `${d.file}#cut-out`
    const unit = units.get(id) ?? { id, decision: d, weight, occurrences: [] }
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
  // A picture the ladder makes is made at the widest size its slots ask (`fit.minWidth`), in the demo frame's shape, so
  // the site's own fit step never enlarges it again.
  const frameOf = (demo, occurrences) => {
    const min = Math.max(0, ...occurrences.map((o) => Number(slotOf.get(o.key)?.fit?.minWidth) || 0))
    const width = Math.max(demo.width, min)
    return { width, height: Math.round((demo.height * width) / demo.width) }
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
          weight: unit.weight ?? 'regular',
          width: demo.width,
          height: demo.height,
          // An icon the demo drew in the template's brand colour takes the logo's at the same luminance, so it reads on
          // the same ground (`brandInkOf`); a grey one, or a site with no logo colours, keeps the demo's.
          colour: brandInkOf(demo.colour, brandPaletteOf(real.brief)) ?? real.colours?.[0] ?? '#222222',
          // A demo glyph on its own disc or tile: the new glyph sits on the same ground (#189).
          ground: demo.style?.groundShape ?? null
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
            weight: unit.weight ?? 'regular',
            ground: Boolean(demo.style?.groundShape),
            reason: d.reason,
            width: demo.width,
            height: demo.height
          }
        }
      }
      // The ladder's steps 1 and 3 (`cutout-ladder.mjs`): the owner's own picture, never a drawing.
      if ((d.mode === 'own' || d.mode === 'framed') && d.mediaId) {
        const own = await Promise.resolve(real.bytes(d.mediaId)).catch(() => null)
        const frame = frameOf(demo, unit.occurrences)
        if (own) {
          const bytes =
            d.mode === 'own'
              ? await ownCutOutPicture(own, frame.width, frame.height, demo.footprint)
              : await framedPicture(own, frame.width, frame.height)
          stats[d.mode === 'own' ? 'cutOuts' : 'framed'] += 1
          return {
            decor: true,
            group,
            bytes,
            ext: 'png',
            hash: createHash('sha256').update(bytes).digest('hex'),
            receipt: {
              kind: d.mode === 'own' ? 'cut-out' : 'framed',
              origin: 'real',
              mediaId: d.mediaId,
              step: d.step ?? null,
              reason: d.reason,
              width: frame.width,
              height: frame.height
            }
          }
        }
        note(`the owner's picture for ${d.file} could not be read, so the figure is taken off`)
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
        // Taken off (step 2): the head block hides this clear picture, so no empty box is left (`cutout-css.js`).
        hide: true,
        receipt: {
          kind: 'blank',
          origin: 'placeholder',
          reason: 'cut-out-off',
          step: 2,
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

/** The logo's palette as a drawing item's `palette` (`picture-draw.js` `drawPrompt`), or nothing without one. */
function paletteOf(/** @type {any} */ real) {
  const palette = brandPaletteOf(real?.brief)
  return palette ? { palette: [palette.primary, ...(palette.secondary ? [palette.secondary] : [])] } : {}
}
