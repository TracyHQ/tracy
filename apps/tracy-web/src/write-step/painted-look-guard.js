// The look guard on a painted icon (ADR 0044, decision 10): another drawing may replace a template's icon, and it keeps that icon's
// file size, its drawing's size, its line and its backing. It is judged as it is painted, against the template's own file, which the
// painted stage has read to draw it, so no page is measured. The judgement of "the same look" is `looksDiffer`, what the drawing is
// built to pass, so a refusal here means a drawing went wrong; the picture step answers for it.
import { iconLookOf, looksDiffer, sectionLineDiffers } from '../site-pictures/icons/template-icon-look.js'

export const PICTURE_STEP = 8
const COLOUR_SLACK = 24

const channels = (hex) => [1, 3, 5].map((at) => Number.parseInt(String(hex).slice(at, at + 2), 16))
const colourOff = (a, b) => channels(a).some((v, i) => Math.abs(v - channels(b)[i]) > COLOUR_SLACK)

/** The backing's colour: the template's own, unless it was a tint of the accent, which the brand's accent takes over. */
function backingColour(was, now, drawnIn) {
  if (!was.plate || !now.plate) return []
  const wanted = drawnIn?.plateFollows === 'accent' ? drawnIn.plate : was.plate.colour
  return colourOff(wanted, now.plate.colour)
    ? [`its backing is ${now.plate.colour}, and it should be ${wanted}`]
    : []
}

/**
 * @param {import('../site-pictures/icons/template-icon-look.js').IconLook} was the template icon
 * @param {import('../site-pictures/icons/template-icon-look.js').IconLook} now the drawn icon
 * @param {object} [drawnIn] what the drawing says it used
 * @returns {string[]} one sentence per difference
 */
export function iconLookFaults(was, now, drawnIn) {
  const file =
    was.width === now.width && was.height === now.height
      ? []
      : [`its file is ${now.width}x${now.height}, the template's ${was.width}x${was.height}`]
  return [...file, ...looksDiffer(was, now), ...backingColour(was, now, drawnIn)]
}

const refusal = (what, reason) => ({ step: PICTURE_STEP, what, reason })

/** Judges a run's drawn icons one by one, and their line weight over each section, as `sectionLineDiffers` does. */
export function iconGuard() {
  const sections = new Map()
  const refused = []
  return {
    async judge(item, { bytes, drawnIn }, was) {
      const now = await iconLookOf(bytes)
      if (!now) {
        refused.push(refusal(item.frame, 'the drawn icon cannot be read as an icon'))
        return
      }
      const said = iconLookFaults(was, now, drawnIn)
      if (said.length)
        refused.push(
          refusal(
            item.frame,
            `This icon does not look like the template icon it replaces: ${said.join('; ')}`
          )
        )
      const section = String(item.frame).split('.')[0]
      sections.set(section, [...(sections.get(section) ?? []), { was, now, frame: item.frame }])
    },
    refused() {
      for (const pairs of sections.values()) {
        const said = sectionLineDiffers(pairs)
        if (said)
          refused.push(
            refusal(
              pairs[0].frame,
              `These icons are drawn in another line weight than the template icons they replace: ${said}`
            )
          )
      }
      return refused
    }
  }
}
