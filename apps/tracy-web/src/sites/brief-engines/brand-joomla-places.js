/**
 * Where a Joomla template shows a logo, and the two writes every Joomla logo shares: the upload and the footer image slot
 * (plan `tasks/plan-ten-logo-favicon.md`, T19, T20; measured 07/10/2026 from the release webroots of `joomlart-products`).
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

/** An ICO file (reserved 0, type 1): it is uploaded as `.ico`, every other picture as `.png`. */
const isIco = (/** @type {Uint8Array} */ bytes) =>
  bytes.length > 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0

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
          const path = `${FOLDER}/${role}-${sha256.slice(0, 16)}-${stamp}.${isIco(bytes) ? 'ico' : 'png'}`
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
 * 🔒 A CONTRACT THAT CANNOT BE READ IS NOT A REFUSAL OF THE LOGO. The contract reads every bound record before any apply,
 * and one record an earlier step rewrote outside it (a slot node gone) refuses every apply on the site with "HTML slot is
 * missing or ambiguous". Then, and whenever a refusal names no slot problem, the logo goes into the slot's own module HTML
 * through the content door (`logoIntoModule`), still sized by the slot's fit (the row's `frame` when the contract gave
 * none). A refusal that judges the picture (a `SLOT_` code) is final: the spot shows the name (`nameForDemoLogos`).
 * @param {{slot: string, path?: string | null, pathFor?: ((fit: any) => Promise<string | null>) | null, read: Function,
 *   write: Function, stamp: string, skip: (where: string, reason: string) => void, frame?: {width: number, height: number} | null,
 *   demoFiles?: string[]}} input
 * @returns {Promise<boolean>}
 */
export async function placeFooterLogo({
  slot,
  path = null,
  pathFor = null,
  read,
  write,
  stamp,
  skip,
  frame = null,
  demoFiles = []
}) {
  /** @type {any} */
  let state = null
  /** @type {unknown} */
  let refused = null
  try {
    state = await read('content.contract', { operation: 'inspect' })
    if (state?.ok === false)
      throw Object.assign(new Error(String(state.message ?? state.error ?? 'no answer')), { answer: state })
  } catch (error) {
    refused = error
    state = null
  }
  const listed = state?.slots?.find((/** @type {any} */ s) => s?.key === slot && s?.type === 'image')
  if (state && !listed) {
    skip('footer-logo', `the site's content contract has no picture slot ${slot}`)
    return false
  }
  // `pathFor` sees the slot's Slot fit first (a logo too narrow for it is set on a wider canvas, or not placed at all).
  // A contract that could not be read gave no fit: the row's frame stands for it.
  if (pathFor) path = await pathFor(state ? (listed.fit ?? null) : fitOfFrame(frame))
  if (!path) return false
  if (state) {
    const changes = { [slot]: path }
    const requestId = createHash('sha256')
      .update(JSON.stringify({ stamp, revision: state.revision, changes }))
      .digest('hex')
    try {
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
      refused = error
    }
  }
  const why = refused instanceof Error ? refused.message : String(refused)
  if (judgesPicture(refused)) {
    skip('footer-logo', `the site refused the footer logo (${why})`)
    return false
  }
  const placed = await logoIntoModule({ slot, path, demoFiles, read, write }).catch((error) => {
    skip(
      'footer-logo',
      `the site refused the footer logo (${why}; ${error instanceof Error ? error.message : error})`
    )
    return null
  })
  if (placed === false)
    skip('footer-logo', `the site refused the footer logo (${why}) and its module shows no template logo`)
  return placed === true
}

/** The Slot fit a row's `frame` stands for when the contract gives none: the frame is the slot sample's box. */
export function fitOfFrame(/** @type {{width: number, height: number} | null | undefined} */ frame) {
  const width = Number(frame?.width)
  const height = Number(frame?.height)
  if (!(width > 0 && height > 0)) return null
  return {
    kind: 'logo',
    boxes: { desktop: { width, height } },
    minWidth: Math.ceil(width * 1.5),
    aspect: width / height
  }
}

/** Whether a refusal judged the picture itself (a slot problem code), rather than the contract as a whole. */
function judgesPicture(/** @type {any} */ error) {
  const answer = error?.answer
  const codes = [
    answer?.code,
    ...(Array.isArray(answer?.problems) ? answer.problems.map((/** @type {any} */ p) => p?.code) : [])
  ]
  return codes.some((code) => typeof code === 'string' && code.startsWith('SLOT_'))
}

/**
 * The logo in the footer slot's own module HTML, through the content door: every picture there showing one of the
 * template's logo files shows the logo instead. Only a module slot (`module-<id>.<n>`) has one HTML to change.
 * @param {{slot: string, path: string, demoFiles: string[], read: Function, write: Function}} input
 * @returns {Promise<boolean>} whether a picture was changed
 */
export async function logoIntoModule({ slot, path, demoFiles, read, write }) {
  const id = Number(/^module-(\d+)\.\d+$/.exec(slot)?.[1])
  if (!id || !demoFiles.length) return false
  const answer = await read('content.get', { kind: 'module', id })
  if (answer?.ok === false || !answer?.item)
    throw new Error(String(answer?.message ?? answer?.error ?? 'module not found'))
  let placed = 0
  const html = String(answer.item.content ?? '').replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\ssrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? ''
    if (!demoFiles.some((f) => src.includes(f))) return tag
    placed += 1
    // The template's other sizes of its own logo (`srcset`) would win over the new `src` on a sharp screen; Joomla's media
    // field reads the file back from `data-path`; a fixed `width` would stretch a logo of another shape (the height stays).
    return tag.replace(/\s(?:srcset|data-path|width)\s*=\s*(["'])[\s\S]*?\1/gi, '').replace(src, path)
  })
  if (!placed) return false
  await write('content.update', { kind: 'module', id, fields: { content: html } })
  return true
}
