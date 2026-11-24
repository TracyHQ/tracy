// The site door of each CMS the write step writes. The CMS a run's site is on chooses how its content contract is read and
// written: the write step names its kit's platform (`kit.platform`, the contract index's, as `openKit` gives it) and asks
// `siteDoorFor` for that platform's door. A platform with no door stops the run before anything is read or written, in
// words: one CMS's calls are never sent to a site of another.
//
// A door that writes:   { platform, writes: true, refusal(answer) -> words, applyContract({ apply, siteKey, mapping, dry? }) }
// A door not built yet: { platform, writes: false, missing: <what the write step still lacks there, in a reader's words> }
//
// Only the contract read and the contract write go through the door so far; the stages that call other plugin actions
// (hides, page creation, menus, brand settings) still send them as the Claude Cowork for Joomla takes them, which is why
// WordPress and EmDash have no door that writes yet. Each of those gets its door when its write stages exist.
import { joomlaSiteDoor } from './joomla.js'

/** What the write step still lacks on each CMS it has no door for. */
const NOT_YET = Object.freeze({
  wordpress:
    'WordPress write doors (the Claude Cowork for WordPress empties no slot, hides no block, removes no row, creates no page and renames no menu item yet)',
  emdash: "EmDash write door (entries, settings, menus and media through the site's own API)"
})

/** The name of each platform as a reader knows it. */
export const PLATFORM_NAMES = Object.freeze({ joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' })

/** The door of a platform ("joomla", "wordpress", "emdash"), or null for one the write step does not know. */
export function siteDoorFor(platform) {
  if (platform === 'joomla') return joomlaSiteDoor
  if (typeof platform === 'string' && Object.hasOwn(NOT_YET, platform))
    return Object.freeze({ platform, writes: false, missing: NOT_YET[platform] })
  return null
}

/**
 * Why a run on this kit cannot write, as the stop cause of its report, or null when its platform has a door that writes.
 * @param {{ ref?: string, platform?: string } | null | undefined} kit
 * @returns {{ code: string, reason: string } | null}
 */
export function platformStop(kit) {
  const platform = kit?.platform
  const door = siteDoorFor(platform)
  if (!door)
    return {
      code: 'WRITE_STEP_KIT_PLATFORM',
      reason: `The kit ${kit?.ref ?? '(no ref)'} names no platform the write step knows (got ${JSON.stringify(platform ?? null)}; expected ${Object.keys(PLATFORM_NAMES).join(', ')}).`
    }
  if (!door.writes)
    return {
      code: 'WRITE_STEP_NOT_ON_PLATFORM',
      reason: `The write step cannot write a ${PLATFORM_NAMES[door.platform]} site yet: it has no ${door.missing}. Nothing was read or written.`
    }
  return null
}
