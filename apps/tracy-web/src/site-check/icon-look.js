// The site check's guard on replaced icons (#380): an icon may be replaced, its look may not change. For each icon the picture
// step drew, its file is read off the site beside the template icon it replaced, and the host's boxes of the written pages are
// held to the boxes the untouched site drew. The look's judgement is `looksDiffer`, the same one the drawing is built to pass.
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const BOX_SLACK_PX = 2
const COLOUR_SLACK = 24
const FIX = 'Fix it in the picture step (step 8).'

const fileOfSrc = (src) => {
  try {
    return decodeURIComponent(new URL(src, 'http://x.invalid/').pathname).replace(/^\/+/, '')
  } catch {
    return ''
  }
}

const channels = (hex) => [1, 3, 5].map((at) => Number.parseInt(String(hex).slice(at, at + 2), 16))
const colourOff = (a, b) => channels(a).some((v, i) => Math.abs(v - channels(b)[i]) > COLOUR_SLACK)

/** The backing's colour: the template's own, unless it was a tint of the accent, which the brand's accent takes over. */
function colourFault(was, now, drawnIn) {
  if (!was.plate || !now.plate) return null
  const wanted = drawnIn?.plateFollows === 'accent' ? drawnIn.plate : was.plate.colour
  return colourOff(wanted, now.plate.colour)
    ? `its backing is ${now.plate.colour}, and it should be ${wanted}`
    : null
}

/** Each written page's drawn boxes held to the untouched site's, at the width the baseline was read at. */
function boxFaults(lines, read, frames) {
  const templateOf = new Map(lines.map((l) => [l.ordered, l.painted.template.file]))
  const faults = []
  for (const measure of read.measures.filter((m) => m.width === 1440)) {
    for (const box of measure.pictureBoxes ?? []) {
      const file = fileOfSrc(box.src)
      const was = frames.find((f) => f.page === measure.path && f.file === templateOf.get(file))
      if (!was) continue
      if (Math.abs(was.width - box.width) > BOX_SLACK_PX || Math.abs(was.height - box.height) > BOX_SLACK_PX)
        faults.push({
          page: measure.path,
          width: measure.width,
          measured: `${box.width}x${box.height}, the template's ${was.width}x${was.height}`,
          reason: `A replaced icon is drawn at another size than the icon it replaced. ${FIX}`
        })
    }
  }
  return faults
}

export const iconLookGroup = {
  name: 'icon-look',
  causingStep: 8,
  level: 'block',
  async run(context) {
    const lines = (context.report?.slots ?? []).filter(
      (s) => s.part === 'picture-painted' && s.painted?.kind === 'icon' && s.status === 'written'
    )
    if (!lines.length) return { checked: 0, failures: [] }
    if (typeof context.siteFile !== 'function')
      throw new GroupUnmeasured('No reader of the site files was given, so the icons were not read.')
    const { iconLookOf, looksDiffer, sectionLineDiffers } = await import(
      '../site-pictures/icons/template-icon-look.js'
    )
    const seen = new Map()
    const lookOf = async (file) => {
      if (!seen.has(file)) {
        const bytes = await context.siteFile(file)
        seen.set(file, bytes ? await iconLookOf(bytes) : null)
      }
      return seen.get(file)
    }
    const failures = []
    const judged = []
    const sections = new Map()
    for (const line of lines) {
      const where = { slot: line.slot, key: line.key, ordered: line.ordered }
      const template = line.painted.template
      if (template === null) continue
      if (template === undefined) {
        failures.push({
          ...where,
          reason: `This icon was drawn without reading the template icon it replaces. ${FIX}`
        })
        continue
      }
      judged.push(line)
      const was = await lookOf(template.file)
      const now = await lookOf(line.ordered)
      if (!was || !now)
        throw new GroupUnmeasured(`The site did not give ${was ? line.ordered : template.file} as an icon.`)
      const section = String(line.slot).split('.')[0]
      sections.set(section, [...(sections.get(section) ?? []), { was, now, line }])
      const said = [...looksDiffer(was, now), colourFault(was, now, line.painted.drawnIn)].filter(Boolean)
      if (said.length)
        failures.push({
          ...where,
          measured: said.join('; '),
          reason: `This icon does not look like the template icon it replaced (${template.file}). ${FIX}`
        })
    }
    for (const pairs of sections.values()) {
      const said = sectionLineDiffers(pairs)
      if (said)
        failures.push({
          slot: pairs[0].line.slot,
          key: pairs[0].line.key,
          measured: said,
          reason: `These icons are drawn in another line weight than the template icons they replaced. ${FIX}`
        })
    }
    const frames = context.baseline?.iconFrames
    if (!judged.length) return { checked: lines.length, failures }
    const read = await pagesRead(context)
    if (!Array.isArray(frames) || !read.measures.some((m) => Array.isArray(m.pictureBoxes))) {
      if (failures.length) return { checked: lines.length, failures }
      throw new GroupUnmeasured(
        'The drawn sizes were not measured: the baseline holds no icon boxes (measure it again), or the host answered none.'
      )
    }
    return { checked: lines.length, failures: [...failures, ...boxFaults(judged, read, frames)] }
  }
}
