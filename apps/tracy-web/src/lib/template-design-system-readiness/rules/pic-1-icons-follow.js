/**
 * PIC-1: no icon shown as a picture is drawn in the template's brand colour, where a worn design
 * system cannot recolour it.
 *
 * An SVG shown through `<img src>` or a CSS `background` url is a closed picture: the page's
 * variables do not reach inside it, so its stroke stays the template's accent under every system (JA
 * Kinetic WP 1.0.11's Integrations icons, `stroke="#A3E635"`: lime under Moxie's dark and olive under
 * its light, the 20/10/2026 eye check). The preview probe's ACCENT-LEAK sees such a picture only on
 * the page it measures; this rule reads every page's content and every stylesheet of the release, so
 * it runs on Check again with no new measurement.
 *
 * A finding: an SVG the release shows (`readers/icon-pictures.js`) whose chromatic paints are all
 * within 15 degrees of the hue of the template's accent (its light or dark palette in the slot
 * contract; `readers/svg-paint.js`), and that no contract rule or worn-scope rule of the template
 * recolours (`readers/recolour-rules.js`). Never judged: a logo or brand mark (its own rules, IDENT-*),
 * a status picture (a field's valid tick, an alert icon: by its selector or its colour, the slot tunes those),
 * a picture with a second hue (an illustration), an SVG embedding a raster (a photograph), a mask
 * (painted by the system), a template whose accent is a grey.
 */
import { iconPictures, svgOf } from '../readers/icon-pictures.js'
import {
  contractBlocks,
  inlineRecolours,
  recolours,
  selectorCovers,
  SIDES,
  selectorReaches,
  wornBlocks
} from '../readers/recolour-rules.js'
import { releaseFiles, stylesheetsOf } from '../readers/release-files.js'
import { slotOf } from '../readers/slot.js'
import { brandColoursOf, brandDrawing, statusColoursOf } from '../readers/svg-paint.js'

const LOGO = /logo|brand|wordmark|favicon/i
/** A selector of a field or message state (Bootstrap's :valid tick, an alert icon): the slot tunes status colours. */
const STATE =
  /:(in)?valid\b|[.-](is-)?(in)?valid\b|\b(success|danger|warning|error|alert|invalid-feedback|valid-feedback)\b/i
/** How many pictures a message names before it says how many more. */
const SHOWN = 6

/** @param {import('../readers/icon-pictures.js').IconRef} ref */
const isLogo = (ref) =>
  LOGO.test(ref.ref) || LOGO.test(ref.selector ?? '') || (ref.chain ?? []).some((e) => LOGO.test(e.attrs))

/** @type {import('../index.js').Rule} */
export const pic1IconsFollow = {
  id: 'PIC-1',
  title: "No icon picture is drawn in the template's brand colour",
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'template',
  async run(context) {
    const name = context.release.name
    const slot = await slotOf(context)
    if (!slot.name)
      return {
        status: 'not-applicable',
        message: `${name} has no slot contract, so no system is worn on it (SLOT-1).`
      }
    const hasDark = Object.keys(slot.contract?.darkTokens ?? {}).length > 0
    const brand = brandColoursOf(slot.palettes, hasDark)
    if (!brand.length)
      return {
        status: 'not-applicable',
        message: `${name}'s accent is not a colour with a hue, so no picture can keep it.`
      }
    const status = statusColoursOf(slot.palettes)
    const { svgs, refs } = await iconPictures(context)
    // a Joomla contract's rules are written under six :root (joomla.mjs HI): they outrank a template rule
    // that adds a qualified root or body (`html.t4-dark`) before the same selector
    const outranksRoot = context.release.platform === 'joomla'
    const blocks = [
      ...contractBlocks(slot.contract).map((b) => ({ ...b, outranksRoot })),
      // a worn-scope rule of the template applies under every system, on both sides
      ...wornBlocks(stylesheetsOf(await releaseFiles(context))).map((b) => ({
        ...b,
        outranksRoot: false,
        sides: [...SIDES]
      }))
    ].filter((b) => recolours(b.decls))
    /** @type {Map<string, { colour: string, brand: string, places: Set<string>, sides: Set<string> }>} */
    const found = new Map()
    for (const ref of refs) {
      if (isLogo(ref) || STATE.test(ref.selector ?? '')) continue
      const svg = ref.svg !== undefined ? { file: ref.ref, text: ref.svg } : svgOf(svgs, ref.ref)
      if (!svg) continue
      const drawn = brandDrawing(svg.text, brand, status)
      if (!drawn) continue
      const own = ref.chain?.at(-1)
      // an inline style is the picture's own, on both sides
      if (ref.via === 'img' && own && inlineRecolours(own.attrs)) continue
      // the sides of light on which some rule recolours this picture; it is fixed only when every side is
      const reaching = blocks.filter((b) =>
        ref.via === 'css'
          ? selectorCovers(b.selector, ref.selector ?? '', { outranksRoot: b.outranksRoot })
          : ref.via === 'img' && selectorReaches(b.selector, ref.chain ?? [])
      )
      const open = SIDES.filter((side) => !reaching.some((b) => b.sides.includes(side)))
      if (!open.length) continue
      const hit = found.get(svg.file) ?? { ...drawn, places: new Set(), sides: new Set() }
      for (const side of open) hit.sides.add(side)
      hit.places.add(ref.via === 'css' ? `${ref.from} ${ref.selector}` : ref.from)
      found.set(svg.file, hit)
    }
    const brandList = brand.map((b) => b.hex).join(', ')
    if (!found.size)
      return {
        status: 'pass',
        message: `No picture the release shows is drawn in its brand colour (${brandList}) where a system cannot recolour it (${refs.length} SVG place(s) read).`
      }
    const lines = [...found].map(
      ([file, h]) =>
        `${file}: drawn in ${h.colour} (brand ${h.brand}), not recoloured on the ${[...h.sides].join(' and ')} side${h.sides.size > 1 ? 's' : ''}, shown from ${[...h.places].slice(0, 3).join('; ')}${h.places.size > 3 ? ` and ${h.places.size - 3} more` : ''}`
    )
    const files = [...found.keys()]
    return {
      status: 'fail',
      message: `${found.size} icon picture(s) drawn in the template's brand colour stay that colour under every system: ${files.slice(0, SHOWN).join(', ')}${files.length > SHOWN ? `, and ${files.length - SHOWN} more` : ''}.`,
      fix: `Draw each of these icons so the page can paint it: put the SVG inline with stroke or fill currentColor (or var(--ds-c-accent, <its colour>)), or show it as a mask (mask-image: url(<file>); background-color: var(--ds-c-accent, <its colour>)) instead of an <img> or a background picture; or, while the template is not released again, recolour it in the slot contract (packages/design/tracy-ds-slot/templates/${slot.name}.json). Then release again and press Check again.`,
      details: lines
    }
  }
}
