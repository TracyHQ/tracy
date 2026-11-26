// The site door of each CMS the write step writes. The CMS a run's site is on chooses how its content contract is read and
// written: the write step names its kit's platform (`kit.platform`, the contract index's, as `openKit` gives it) and asks
// `siteDoorFor` for that platform's door. A platform with no door stops the run before anything is read or written, in
// words: one CMS's calls are never sent to a site of another.
//
// A door that writes:   { platform, writes: true, refusal(answer) -> words, applyContract({ apply, siteKey, mapping, dry? }),
//                         takes?(call) -> boolean, notTaken?(call) -> answer }
// A door not built yet: { platform, writes: false, missing: <what the write step still lacks there, in a reader's words> }
//
// The contract read and write go through the door on each CMS. The stages that call other plugin actions (hides of pages,
// page creation, menus, page settings) send them as the Claude Cowork for Joomla takes them; a door that takes only some
// actions (EmDash, WordPress: `takes`) answers the others itself (`onPlatform`), and a line that failed for want of a door
// is skipped with words (`notOnPlatform`), so those stages say what was not done there.
import { emdashSiteDoor } from './emdash.js'
import { joomlaSiteDoor } from './joomla.js'
import { wordpressSiteDoor } from './wordpress.js'

/** What the write step still lacks on each CMS it has no door for. */
const NOT_YET = Object.freeze({})

/** The name of each platform as a reader knows it. */
export const PLATFORM_NAMES = Object.freeze({ joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' })

/** The door of a platform ("joomla", "wordpress", "emdash"), or null for one the write step does not know. */
export function siteDoorFor(platform) {
  if (platform === 'joomla') return joomlaSiteDoor
  if (platform === 'emdash') return emdashSiteDoor
  if (platform === 'wordpress') return wordpressSiteDoor
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

/**
 * The door a run's stages call on this platform: the run's own door, except that a call the platform's site door does not
 * take is answered by that site door and never sent.
 * @param {{ apply: Function }} door
 * @param {string | undefined} platform
 */
export function onPlatform(door, platform) {
  const site = siteDoorFor(platform)
  if (!site?.writes || typeof site.takes !== 'function') return door
  const read = readingOnPlatform(door, platform)
  return { ...read, apply: async (call) => (site.takes(call) ? read.apply(call) : site.notTaken(call)) }
}

/**
 * The run's door with each call as the site's CMS takes it (the site door's `callOf`: a picture uploaded to the WordPress
 * plugin's folder) and each answer read as every CMS answers it (`answerOf`: the WordPress plugin's inspect as a list of
 * slots); every call is sent. The site check reads the site through this, as the write step does.
 * @param {{ apply: Function }} door
 * @param {string | undefined} platform
 */
export function readingOnPlatform(door, platform) {
  const site = siteDoorFor(platform)
  if (typeof site?.answerOf !== 'function' && typeof site?.callOf !== 'function') return door
  const callOf = site.callOf ?? ((call) => call)
  const answerOf = site.answerOf ?? ((_call, answer) => answer)
  return {
    ...door,
    apply: async (call) => {
      const sent = callOf(call)
      return answerOf(sent, await door.apply(sent))
    }
  }
}

/**
 * A report line as it reads on this platform: a line that failed only because the site's CMS has no door for what its
 * stage asks (the site door's `notDone`) is skipped, and says that, so the site check never takes it for a refusal of the
 * site. Every other line is as it was.
 * @param {{ status?: string, reason?: string | null }} line
 * @param {string | undefined} platform
 */
export function notOnPlatform(line, platform) {
  const site = siteDoorFor(platform)
  if (!site?.notDone || line?.status !== 'failed' || !site.notDone(String(line.reason ?? ''))) return line
  return {
    ...line,
    status: 'skipped',
    reason: `not on ${PLATFORM_NAMES[site.platform]} yet: ${line.reason}`
  }
}
