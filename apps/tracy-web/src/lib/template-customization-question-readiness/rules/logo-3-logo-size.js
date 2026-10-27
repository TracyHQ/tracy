/**
 * LOGO-3: the customer's logo fits the place of the demo logo; the header does not grow and does
 * not cover the menu (spec `tasks/spec-template-customization-question-readiness.md`, LOGO-3).
 *
 * H_demo is how tall the demo logo shows: the row's `frame.height` (the demo logo the spot was
 * drawn for), else the demo picture's own height (Joomla: the `#joomlaImage` hint or the file).
 * H_cap is how tall the template's CSS lets an uploaded 1200 x 300 logo be:
 *
 * - Joomla: the largest `max-height` (else `height`) in px of a desktop rule on a header logo
 *   picture (`img`, `.logo-img`); off-canvas, small, sticky and mobile (`max-width` media) rules are
 *   not the header. No such rule: nothing holds the logo, and a 1200 x 300 one shows 300 px tall.
 * - WordPress: a Site Logo block's `width` holds the picture to that width, so 300 / 1200 of it.
 * - EmDash: the Tailwind height of the `BrandLogo` `imgClass` (`h-10` is 40 px, `max-h-…`). The demo
 *   shows a text lockup there, so a fixed class height is the place's size and passes on its own.
 *
 * Fails when H_cap is over 110% of H_demo and the row has no `logoHeight`; when `logoHeight` is more
 * than 10% off H_demo; when the row's `frame` is more than 10% off the demo picture's proportions.
 * When neither the row nor the picture gives H_demo, or no cap is found and the row has no
 * `logoHeight`, the rule is `live-only`. Covering the menu, sticky headers and mobile sizes are only
 * seen on a built site.
 */
import { PROFILE_ROW_FIX, exactBrandProfile } from '../readers/brand-profile.js'
import { cssRules } from '../readers/css-rules.js'
import { emdashLogoPlaces } from '../readers/emdash-logo-places.js'
import { filledKeys, joomlaLogoPlaces } from '../readers/joomla-logo-places.js'
import { MissingPictureLibraryError, joomlaImageValue, pictureFacts } from '../readers/picture-facts.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'
import { wordpressLogoPlaces } from '../readers/wordpress-logo-places.js'

const LIVE_NOTE =
  'Only a built site shows whether the logo covers the menu, and its size in a sticky header or on a phone.'
const HEADER_PICTURE = /\bimg\b|logo-img|site-logo|custom-logo/i
const NOT_HEADER =
  /off-?canvas|logo-control|logo-text|small|-sm\b|footer|sticky|mobile|:before|:after|\bion-/i

/** A CSS length in px (`40px`, `2.5rem`), or null. */
const px = (/** @type {string | undefined} */ v) => {
  const m = /^\s*([\d.]+)(px|rem|em)\s*(?:!important)?\s*$/.exec(v ?? '')
  return m ? Number(m[1]) * (m[2] === 'px' ? 1 : 16) : null
}

/** Joomla: the largest desktop header-logo cap, and the demo picture's height and proportions. */
async function joomlaSizes(/** @type {import('../index.js').RuleContext} */ context) {
  const places = await joomlaLogoPlaces(context)
  const caps = []
  for (const [file, css] of await templateSource(context).texts(
    (n) => /^css\/[^/]+\.css$/.test(n) && !/dark|rtl/.test(n)
  ))
    for (const r of cssRules(css)) {
      if (r.within.some((w) => /max-width/i.test(w))) continue
      if (
        !r.selector.split(',').some((s) => /logo/i.test(s) && HEADER_PICTURE.test(s) && !NOT_HEADER.test(s))
      )
        continue
      const cap =
        px(/(?:^|;)\s*max-height\s*:([^;]+)/.exec(r.body)?.[1]) ??
        px(/(?:^|;)\s*height\s*:([^;]+)/.exec(r.body)?.[1])
      if (cap !== null) caps.push({ cap, where: `${file} ${r.selector.trim()}` })
    }
  const values =
    places.framework === 't4'
      ? [...places.t4]
          .sort((a, b) => (a.name === 'default' ? -1 : b.name === 'default' ? 1 : 0))
          .flatMap((p) =>
            filledKeys(p)
              .filter(([k]) => k === 'site_logo')
              .map(([, v]) => v)
          )
      : places.t3.map((s) => String(s.params.logoimage ?? '')).filter((v) => v.trim())
  let picture = null
  if (values.length) {
    const { file, hint } = joomlaImageValue(values[0])
    const bytes = (await templateSource(context).webrootFiles([file])).get(file)
    const facts = bytes ? await pictureFacts(bytes) : null
    picture = facts ? { file, width: facts.width, height: facts.height } : hint ? { file, ...hint } : null
  }
  const top = caps.sort((a, b) => b.cap - a.cap)[0]
  // No desktop rule: T4 and T3 print the picture at its own size, so a 1200 x 300 logo shows 300 px tall.
  return {
    cap: top?.cap ?? 300,
    capWhere: top?.where ?? 'no desktop CSS rule holds the header logo picture',
    picture
  }
}

/** WordPress and EmDash: the cap an uploaded 1200 x 300 logo meets. */
async function otherCap(/** @type {import('../index.js').RuleContext} */ context) {
  if (context.release.platform === 'wordpress') {
    const { spots } = await wordpressLogoPlaces(context)
    const widths = spots.map((s) => s.width).filter((w) => w !== null)
    if (!widths.length || widths.length < spots.length) return { cap: null, capWhere: null }
    const w = Math.max(.../** @type {number[]} */ (widths))
    return { cap: (w * 300) / 1200, capWhere: `a Site Logo block ${w} px wide` }
  }
  const { spots } = await emdashLogoPlaces(context)
  const heights = spots.map((s) => {
    const m = /(?:^|\s)(?:max-)?h-(?:(\d+(?:\.\d+)?)|\[(\d+)px\])(?=\s|$)/.exec(s.imgClass)
    return m ? (m[1] ? Number(m[1]) * 4 : Number(m[2])) : null
  })
  if (!heights.length || heights.includes(null)) return { cap: null, capWhere: null }
  return { cap: Math.max(.../** @type {number[]} */ (heights)), capWhere: 'the BrandLogo imgClass heights' }
}

export const logo3LogoSize = {
  id: 'LOGO-3',
  title: "The customer's logo fits the place of the demo logo",
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('tracy'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    const { row, problem } = exactBrandProfile(context)
    if (!row) return { status: 'fail', message: `${name} fails LOGO-3: ${problem}.`, fix: PROFILE_ROW_FIX }
    let sizes
    try {
      sizes =
        platform === 'joomla' ? await joomlaSizes(context) : { ...(await otherCap(context)), picture: null }
    } catch (e) {
      // A missing picture library stops the whole check (index.js), never this rule alone.
      if (e instanceof MissingPictureLibraryError) throw e
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the template's logo size cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    const frame = row.frame && row.frame.height > 0 ? row.frame : null
    // An EmDash demo shows a text lockup, not a picture: the class height IS the place's size.
    const fixedByClass = platform === 'emdash' && sizes.cap !== null
    const demo = frame?.height ?? sizes.picture?.height ?? (fixedByClass ? sizes.cap : null)
    const details = [
      `demo logo height: ${demo ?? 'unknown'} px (${frame ? 'row frame' : sizes.picture ? `picture ${sizes.picture.file}` : fixedByClass ? 'the logo class' : 'no frame, no picture'})`,
      `cap on an uploaded logo: ${sizes.cap === null ? 'none found' : `${sizes.cap} px (${sizes.capWhere})`}`,
      LIVE_NOTE
    ]
    const problems = []
    if (frame && sizes.picture) {
      const off = frame.width / frame.height / (sizes.picture.width / sizes.picture.height)
      if (Math.abs(off - 1) > 0.1)
        problems.push(
          `the row's frame ${frame.width} x ${frame.height} is not the shape of the demo logo ${sizes.picture.width} x ${sizes.picture.height}`
        )
    }
    const height = Number(row.logoHeight)
    if (row.logoHeight !== undefined && demo !== null && Math.abs(height / demo - 1) > 0.1)
      problems.push(`the row's logoHeight ${height} is more than 10% off the demo logo's ${demo} px`)
    if (row.logoHeight === undefined && demo !== null && sizes.cap !== null && sizes.cap > 1.1 * demo)
      problems.push(
        `the template lets a logo reach ${sizes.cap} px, the demo logo is ${demo} px, and the row has no logoHeight`
      )
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails LOGO-3: ${problems.join('; ')}.`,
        fix: `Set "logoHeight": ${demo ?? '<the demo logo height>'} (and a frame of the demo logo's size) on the row in apps/tracy-web/src/lib/template-profiles.json, or hold the logo to the demo height in the template CSS and cut a new release.`,
        details
      }
    if (demo === null || (sizes.cap === null && row.logoHeight === undefined))
      return {
        status: 'live-only',
        message: `${name}: the demo logo height or the template's cap on a logo cannot be read from its files; measure the logo on a built site.`,
        details
      }
    return {
      status: 'pass',
      message: `${name}: an uploaded logo is held to the demo logo's ${demo} px.`,
      details
    }
  }
}
