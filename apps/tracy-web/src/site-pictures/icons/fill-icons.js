// The icon half of the picture step (ADR 0043 section 3, #345): every icon frame of the plan gets a library icon and
// two files, light and dark, rendered by code at the frame's size. The weight, the colour and the plate are MEASURED
// from the kit's demo icons (icon-style.js, icon-ink.js), never read from a template name; the name comes from a
// shortlist of the plan's words ranked by a cheap text model that cannot invent one (icon-ranker.js); no icon twice
// in one block (icon-shortlist.js). Handed to fillFrames as its `icons` option.
//
// The two files: `file` is the frame's own variant (the colour its demo icon has); `dark` is the same icon in the
// colour for the other theme. A kit twin of the frame (the dark or light copy of it) is written here too, holding
// the variant its own demo icon has, so the mapping (#339) places the dark file through the twin. No twin demo to
// read means the twin takes the other variant; a plate keeps its colours in both.

import { outputSizeFor } from '../cut-photo.js'
import { fileFields, placedEntry } from '../frame-entries.js'
import {
  contrast,
  hexOf,
  iconColourOf,
  luminance,
  luminanceOfHex,
  rgbOf,
  towardContrast
} from './icon-ink.js'
import { rankIcons } from './icon-ranker.js'
import { iconPicture } from './icon-render.js'
import { assignIcons, iconShortlist, usableCatalog } from './icon-shortlist.js'
import { iconStyleOf, sectionWeightOf } from './icon-style.js'
import { phosphorCatalog } from './phosphor-set.js'

const FALLBACK_INK = '#222222'
/** The dark ground an icon for the dark theme is read against, and white for the light one. */
const DARK_GROUND = luminance(18, 18, 18)
const LIGHT_GROUND = 1

/** The same icon in the colour for the other theme: moved toward white or black until it reads at 3:1; a plate keeps it. */
export function counterpartInk(colour, onPlate) {
  const rgb = rgbOf(colour)
  if (!rgb || onPlate) return colour
  const lum = luminance(rgb.r, rgb.g, rgb.b)
  const ground = lum <= 0.35 ? DARK_GROUND : LIGHT_GROUND
  return contrast(lum, ground) >= 3 ? colour : hexOf(towardContrast(rgb, ground))
}

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
      const ink = own.colour ?? accent ?? FALLBACK_INK
      const size = outputSizeFor(idx.demoSize(frameId), frame, frame.width)
      const render = (colour, plate) => iconPicture({ glyph: name, weight, ...size, colour, ground: plate })
      try {
        const twins = (idx.twinsOf.get(frameId) ?? []).filter((t) => idx.frames.get(t)?.writable !== false)
        const twinDemos = new Map()
        for (const t of twins) twinDemos.set(t, await demoOf(idx.frames.get(t)))
        // The other variant is the colour a twin's own demo icon has when it differs from this one's, else the
        // counterpart colour; a twin whose demo has the same ink keeps this frame's own file.
        const differs = (t) =>
          twinDemos.get(t).colour &&
          contrast(luminanceOfHex(twinDemos.get(t).colour), luminanceOfHex(ink)) >= 1.5
        const lead = twins.find(differs)
        const other = lead ? twinDemos.get(lead).colour : counterpartInk(ink, ground !== null)
        const otherPlate = (lead && twinDemos.get(lead).style?.groundShape) || ground
        const madeOwn = await render(ink, ground)
        const madeOther = other === ink && otherPlate === ground ? madeOwn : await render(other, otherPlate)
        files.push(madeOwn, madeOther)
        const why = `${by === 'model' ? 'ranked by the text model' : by === 'shortlist' ? 'first of the shortlist' : 'a neutral mark: no word of the plan calls an icon'}; weight ${weight}${own.style ? '' : ' (no demo icon to measure)'}, colour ${ink}${ground ? ', on the demo plate' : ''}`
        entries.push({
          list,
          entry: placedEntry(frameId, 'icon', madeOwn, {
            icon: { light: name, dark: name },
            dark: fileFields(madeOther),
            recolourable: true,
            reason: why,
            ...(list === 'siteSettings' ? { writeDoor: 'none' } : {})
          })
        })
        for (const t of twins) {
          const keepsOwn = twinDemos.get(t).colour && !differs(t)
          const made = keepsOwn ? madeOwn : madeOther
          entries.push({
            list: 'frames',
            entry: placedEntry(t, 'twin', made, {
              twinOf: frameId,
              recolourable: true,
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
