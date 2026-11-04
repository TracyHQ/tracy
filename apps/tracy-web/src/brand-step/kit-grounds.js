// What the gate reads from a template kit: the kit id and the grounds the template opens on. Pure functions.
import { homeShotOf } from './brand-first-message.js'

/** The kit's quickstart id as the brand file writes it: "<product>@<version>", e.g. "ja-boxing@1.0.10". */
export const kitId = (k) => `${k.quickstart?.product}@${k.quickstart?.version}`

/** The template's own text colour for names/headings on each side, read from the kit's measured tokens. */
export function sideText(k) {
  const t = k.site.brandColours.tokens
  const get = (side, name) => t.find((x) => x.side === side && x.name === name)?.value?.toLowerCase()
  const opens = k.site.brandColours.opensOn?.markers?.includes('dark-active') ? 'dark' : 'light'
  // base tokens are the side the template opens on; .light-active / .dark-active override the other side. A T3
  // template has no CSS variables: its heading colour is the LESS variable the kit read (`@headings-color`).
  const base =
    get('base', '--headings-color') ?? get('base', '--t4-heading-color') ?? get('base', '@headings-color')
  return {
    dark: (opens === 'dark' ? base : get('.dark-active', '--headings-color')) ?? '#ffffff',
    light: (opens === 'light' ? base : get('.light-active', '--headings-color')) ?? '#212529',
    opens
  }
}

/** The template's own ground of each side (kit site.brandColours): { opening, other, opens }. */
export function templateGrounds(k) {
  const bc = k.site.brandColours
  const opens = sideText(k).opens
  const other = bc.sides?.find((s) => s.groundSide && s.groundSide !== opens)?.ground?.toLowerCase() ?? null
  return { opens, opening: bc.opensOn.ground.toLowerCase(), other }
}

/**
 * Why a kit cannot feed the gate, or null when it can. An empty part is a problem, not a pass: a kit whose site reader
 * found nothing (no colour variables, no name slot, a logo the page shows with no slot to write it) would let the gate
 * judge a brand against defaults it invented.
 */
export function kitProblem(k) {
  if (!k || typeof k !== 'object') return 'the kit is not an object'
  if (!k.quickstart?.product || !k.quickstart?.version)
    return 'the kit has no quickstart.product and quickstart.version'
  if (!Array.isArray(k.site?.logoSpots) || !k.site.logoSpots.length) return 'the kit has no site.logoSpots'
  const unwritable = k.site.logoSpots.filter((s) => s?.shownIn?.length && !s.frameId).map((s) => s.id)
  if (unwritable.length)
    return `the kit has logo spots the page shows with no frame to write them: ${unwritable.join(', ')}`
  if (!Array.isArray(k.site?.nameSlots) || !k.site.nameSlots.length) return 'the kit has no site.nameSlots'
  const bc = k.site?.brandColours
  if (
    !bc?.primary?.value ||
    !bc.opensOn?.ground ||
    !Array.isArray(bc.sides) ||
    !bc.sides.length ||
    !Array.isArray(bc.tokens) ||
    !bc.tokens.length
  ) {
    return 'the kit has no usable site.brandColours (primary, opensOn, sides, tokens)'
  }
  return null
}

/**
 * Why a kit cannot feed the brand step, or null: what the gate reads, the favicon, the home shot at 1440. The brand
 * bench refuses a run on it (brand-control.js), and Template kit on the Road to live holds Publish on it
 * (lib/template-kit/flow-reads.js), so a kit /ops passes is a kit the brand step accepts.
 */
export function brandKitProblem(doc) {
  const problem = kitProblem(doc)
  if (problem) return problem
  if (!doc.site.favicon) return 'the kit has no site.favicon'
  if (!homeShotOf({ doc })) return 'the kit has no home page shot at 1440'
  return null
}
