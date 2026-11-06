// The icon half of the picture step (ADR 0043 section 3, #345): every icon frame of the plan gets a library icon and
// two PREVIEW files, light and dark, rendered by code at the frame's size. The weight and the plate are MEASURED from
// the kit's demo icons, and so is the colour, but only as a ROLE (paint.js: accent, text, on-dark): the entry carries
// the roles as its `paint` recipe and the files are drawn in a neutral stand-in palette; the write step resolves the
// roles from the Design system. Measured (icon-style.js, icon-ink.js), never read from a template name; the name comes from a
// shortlist of the plan's words ranked by a cheap text model that cannot invent one (icon-ranker.js); no icon twice
// in one block (icon-shortlist.js). Handed to fillFrames as its `icons` option.
//
// The two files: `file` is the frame's own variant (`paint.light`, the role its demo icon plays); `dark` is the
// same icon in the role for the other theme (`paint.dark`). A kit twin of the frame (the dark or light copy of it) is written here too, holding
// the variant its own demo icon has, so the mapping (#339) places the dark file through the twin. No twin demo to
// read means the twin takes the other variant; a plate keeps its role in both.

import { outputSizeFor } from '../cut-photo.js'
import { fileFields, placedEntry } from '../frame-entries.js'
import { counterpartRole, previewColour, roleOf } from '../../lib/picture-paint/paint.js'
import { contrast, iconColourOf, luminanceOfHex } from '../../lib/picture-paint/icons/icon-ink.js'
import { rankIcons } from './icon-ranker.js'
import { iconPicture } from '../../lib/picture-paint/icons/icon-render.js'
import { assignIcons, iconShortlist, usableCatalog } from './icon-shortlist.js'
import { iconStyleOf, sectionWeightOf } from '../../lib/picture-paint/icons/icon-style.js'
import { PHOSPHOR_SET, phosphorCatalog } from '../../lib/picture-paint/icons/phosphor-set.js'

const FALLBACK_INK = '#222222'

/** The plate of a recipe: the demo's ground shape with a role in place of its colour. */
const plateOf = (ground, accent) =>
  ground
    ? {
        role: roleOf(ground.colour, accent),
        opacity: ground.opacity,
        radius: ground.radius,
        box: ground.box,
        glyph: ground.glyph
      }
    : null
const plateShape = ({ role: _role, ...shape }) => shape

/** One theme variant of an icon: the role of its glyph and of its plate. */
const variantOf = (colour, ground, accent) => ({
  glyph: roleOf(colour, accent),
  plate: plateOf(ground, accent)
})
const sameVariant = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * @param {{ catalog?: Array<object>, door?: Function | null, readDemo?: (frame: object) => Promise<Buffer | null>,
 *   business?: string | null, signal?: AbortSignal }} [deps] `readDemo`: the demo icon's bytes of a kit frame, or null
 */
export function createIconFiller({
  catalog = phosphorCatalog(),
  door = null,
  readDemo = async () => null,
  business = null,
  signal
} = {}) {
  const usable = usableCatalog(catalog)
  let ranking = { model: null, usage: null, note: null }

  async function demoOf(frame) {
    const bytes = frame ? await readDemo(frame).catch(() => null) : null
    return { style: await iconStyleOf(bytes), colour: await iconColourOf(bytes) }
  }

  // Names first, for all frames of the site: the model is asked once.
  async function namesFor(jobs) {
    const items = jobs.map((j) => ({
      id: j.frameId,
      section: j.frame.blockId ?? j.frameId,
      words: [j.wish.shows, ...(Array.isArray(j.wish.mustInclude) ? j.wish.mustInclude : [])]
        .filter((w) => typeof w === 'string' && w.trim())
        .join('; '),
      menu: iconShortlist(j.wish, usable)
    }))
    const asked = await rankIcons({ door, items: items.filter((i) => i.menu.length), business, signal })
    ranking = { model: asked.model, usage: asked.usage, note: asked.note }
    return assignIcons(
      items.map((i) => ({
        id: i.id,
        section: i.section,
        candidates: [
          ...(asked.rankings?.[i.id] ?? []).map((name) => ({ name, by: 'model' })),
          ...i.menu.map((name) => ({ name, by: 'shortlist' }))
        ]
      }))
    )
  }

  /**
   * @param {{ jobs: Array<{frameId: string, wish: object, frame: object, list: string}>, idx: object,
   *   accent?: string }} input `idx` is the picture check's index of the inputs (frames, twinsOf, demoSize)
   * @returns {Promise<{ entries: Array<{list: string, entry: object}>, files: object[], returns: object[] }>}
   */
  async function fill({ jobs, idx, accent }) {
    const entries = []
    const files = []
    const returns = []
    const names = await namesFor(jobs)
    const demos = new Map()
    for (const j of jobs) demos.set(j.frameId, await demoOf(j.frame))
    const sectionOf = (j) => j.frame.blockId ?? j.frameId
    const weights = new Map()
    for (const section of new Set(jobs.map(sectionOf)))
      weights.set(
        section,
        sectionWeightOf(jobs.filter((j) => sectionOf(j) === section).map((j) => demos.get(j.frameId).style))
      )

    for (const j of jobs) {
      const { frameId, frame, list } = j
      const { name, by } = names.get(frameId)
      const own = demos.get(frameId)
      const weight = weights.get(sectionOf(j))
      const ground = own.style?.groundShape ?? null
      // Roles, never colours (paint.js): the measured demo colours only say which role the glyph and plate play.
      const ownVariant = variantOf(own.colour, ground, accent)
      const size = outputSizeFor(idx.demoSize(frameId), frame, frame.width)
      // A preview file: the roles drawn in the neutral stand-in palette, never the brand's or the template's colour.
      const render = (v) =>
        iconPicture({
          glyph: name,
          weight,
          ...size,
          colour: previewColour(v.glyph),
          ground: v.plate ? { ...plateShape(v.plate), colour: previewColour(v.plate.role) } : null
        })
      try {
        const twins = (idx.twinsOf.get(frameId) ?? []).filter((t) => idx.frames.get(t)?.writable !== false)
        const twinDemos = new Map()
        for (const t of twins) twinDemos.set(t, await demoOf(idx.frames.get(t)))
        // The other variant is the role a twin's own demo icon plays when its colour differs from this one's, else
        // the counterpart role; a twin whose demo has the same ink keeps this frame's own file.
        const ink = own.colour ?? FALLBACK_INK
        const differs = (t) =>
          twinDemos.get(t).colour &&
          contrast(luminanceOfHex(twinDemos.get(t).colour), luminanceOfHex(ink)) >= 1.5
        const lead = twins.find(differs)
        const leadDemo = lead ? twinDemos.get(lead) : null
        const otherVariant = leadDemo
          ? variantOf(leadDemo.colour, leadDemo.style?.groundShape || ground, accent)
          : {
              glyph: ground ? ownVariant.glyph : counterpartRole(ownVariant.glyph),
              plate: ownVariant.plate
            }
        const paint = { light: ownVariant, dark: otherVariant }
        const madeOwn = await render(ownVariant)
        const madeOther = sameVariant(ownVariant, otherVariant) ? madeOwn : await render(otherVariant)
        files.push(madeOwn, madeOther)
        const why = `${by === 'model' ? 'ranked by the text model' : by === 'shortlist' ? 'first of the shortlist' : 'a neutral mark: no word of the plan calls an icon'}; weight ${weight}${own.style ? '' : ' (no demo icon to measure)'}, colour ${ownVariant.glyph}${ground ? `, on the demo plate (${ownVariant.plate.role})` : ''}, decided when written`
        entries.push({
          list,
          entry: placedEntry(frameId, 'icon', madeOwn, {
            icon: { light: name, dark: name, set: PHOSPHOR_SET, weight },
            dark: fileFields(madeOther),
            paint,
            preview: true,
            reason: why,
            ...(list === 'siteSettings' ? { writeDoor: 'none' } : {})
          })
        })
        for (const t of twins) {
          const keepsOwn = twinDemos.get(t).colour && !differs(t)
          const made = keepsOwn ? madeOwn : madeOther
          const holds = made === madeOwn ? 'light' : 'dark'
          entries.push({
            list: 'frames',
            entry: placedEntry(t, 'twin', made, {
              twinOf: frameId,
              paint: { ...paint, holds },
              preview: true,
              reason: `follows ${frameId}, the ${made === madeOwn ? 'same' : 'other'} theme variant of ${name}`
            })
          })
        }
      } catch (error) {
        returns.push({ frame: frameId, reason: `the icon ${name} could not be rendered: ${error.message}` })
      }
    }
    return { entries, files, returns }
  }

  return { fill, ranking: () => ranking }
}
