/**
 * Where a Joomla template shows a logo, and the two writes every Joomla logo shares: the upload and the footer image slot
 * (plan `tasks/plan-ten-logo-favicon.md`, T19, T20; measured 07/10/2026 from the release webroots of `ja-products`).
 *
 * 🔒 WHICH SPOT IS DARK IS MEASURED, NOT GUESSED. A spot is dark when the demo logo the template ships for it is a light
 * picture (mean luminance of its opaque pixels above 180 of 255, `sharp`): Seven's `home-4` profile shows a white logo,
 * so its header is dark. Those measured spots live in each version row of `template-profiles.json` (`darkSpots`, checked
 * by `template-profile-dark-spots.js`), where the readiness check reads them too. Beyond them, three rules hold for
 * every template: a `logos: "dark"` design is dark everywhere, the T4 keys `site_logo_dark`, `site_logo_dark_small` and `site_logo_2` (JA Spa's overlay logo) are dark,
 * and a T3 template style whose title says "Dark" (JA Mood "Home Dark") is dark.
 * 🔒 A NEW FILE NAME EVERY TIME (`<role>-<sha256 16>-<stamp>.png`, plan 5.7 #9): static files are cached up to four
 * hours, and a name a template already uses (`images/joomlart/logo/...`) is never written over.
 */
import { createHash } from 'node:crypto'

/** Where the brand pictures land: under `images/`, the only root the contract's image slots accept. */
const FOLDER = 'images/tracy-brand'

/** The T4 keys that always show on a dark background. */
const DARK_KEYS = new Set(['site_logo_dark', 'site_logo_dark_small', 'site_logo_2'])

/**
 * The dark-spot test of one release version: the row's own `darkSpots` plus the shared rules.
 * @param {any} profile - the template profile row (`templateProfileOf`)
 */
export function darkSpotsOf(profile) {
  const all = profile?.logos === 'dark'
  const spots = profile?.darkSpots ?? {}
  return {
    /** A T4 profile's key. */
    t4: (/** @type {string} */ name, /** @type {string} */ key) =>
      all || DARK_KEYS.has(key) || (spots.profiles ?? []).includes(name),
    /** A T3 template style, by its title. */
    t3: (/** @type {string} */ title) => all || spots.header === true || /\bdark\b/i.test(String(title)),
    footer: all || spots.footer === true
  }
}

/**
 * The logo variant for a spot: the dark-background one for a dark spot, the light-background one otherwise, the single
 * logo of a one-logo design for either. Null when the customer gave none for that spot (it then shows the name, Q7).
 * @param {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} logos @param {boolean} dark
 * @returns {'light' | 'dark' | 'single' | null}
 */
export function variantFor(logos, dark) {
  if (logos.single) return 'single'
  if (dark) return logos.dark ? 'dark' : null
  return logos.light ? 'light' : null
}

/** The template folder a published release installs (`quickstart/ja-social-ii/j6` → `ja_social_ii`). */
export function templateFolderOf(release) {
  const slug = /^(?:quickstart\/)?([a-z0-9-]+)\/j\d+$/.exec(String(release ?? ''))?.[1]
  if (!slug) return null
  if (slug === 'tracy-base') return 'tracy'
  return slug.replace(/-/g, '_')
}

/**
 * Uploads, each picture once: the first ask uploads it under a new name, every later ask answers the same path.
 * @param {{write: Function, stamp: string, skip: (where: string, reason: string) => void}} io
 * @param {Record<string, Uint8Array | undefined>} pictures - by role (`logo-light`, `logo-dark`, `logo`, `favicon`)
 * @returns {(role: string, where: string) => Promise<string | null>}
 */
export function uploader({ write, stamp, skip }, pictures) {
  /** @type {Map<string, Promise<string | null>>} */
  const done = new Map()
  return (role, where) => {
    if (!done.has(role))
      done.set(
        role,
        (async () => {
          const bytes = pictures[role]
          if (!bytes) return null
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          const path = `${FOLDER}/${role}-${sha256.slice(0, 16)}-${stamp}.png`
          try {
            await write('media.upload', { path, content_b64: Buffer.from(bytes).toString('base64') })
            return path
          } catch (error) {
            skip(where, `the site refused the picture (${error instanceof Error ? error.message : error})`)
            return null
          }
        })()
      )
    return /** @type {Promise<string | null>} */ (done.get(role))
  }
}

/** The role an uploaded logo variant is named by. */
export const roleOf = (/** @type {'light' | 'dark' | 'single'} */ variant) =>
  variant === 'single' ? 'logo' : `logo-${variant}`

/**
 * Put a logo into the footer image slot of the sealing contract (`content.contract apply`). The picture is the one
 * `prepareBrand` padded to the row's `frame`, the slot sample's shape, so the plugin's aspect check (0.02) passes.
 * 🔒 ITS OWN APPLY ID: the contract door takes only a `contract-` id, new for every revision. The Apply door records it
 * beside the brand id (`recordedDoor`), so undoing the build takes it back too.
 * @returns {Promise<boolean>}
 */
export async function placeFooterLogo({ slot, path, read, write, stamp, skip }) {
  try {
    const state = await read('content.contract', { operation: 'inspect' })
    if (state?.ok === false) throw new Error(String(state.message ?? state.error ?? 'no answer'))
    if (!state?.slots?.some((s) => s?.key === slot && s?.type === 'image')) {
      skip('footer-logo', `the site's content contract has no picture slot ${slot}`)
      return false
    }
    const changes = { [slot]: path }
    const requestId = createHash('sha256')
      .update(JSON.stringify({ stamp, revision: state.revision, changes }))
      .digest('hex')
    await write('content.contract', {
      operation: 'apply',
      apply_id: `contract-${stamp}`,
      expected_revision: state.revision,
      request_id: requestId,
      changes,
      evidence: {}
    })
    return true
  } catch (error) {
    skip(
      'footer-logo',
      `the site refused the footer logo (${error instanceof Error ? error.message : error})`
    )
    return false
  }
}
