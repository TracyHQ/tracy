// Three measures read on each side of the template's light and dark switch, by the host's look read (`demo-qa-look.js`). Each is a
// pure judge of what the host read, so each is tested on invented reads.
//   band-contrast       words on a plain ground that the brand style touched
//   words-over-picture  words against the picture region under them
//   logo-readable       a logo's pixels against the ground they sit on
import {
  each,
  contrast,
  lookEntries,
  luminance,
  needed,
  ratioOfLuminances,
  sidesSaid,
  truncatedFailures
} from './look-reads.js'
import { pathOfMeasure } from './page-faults.js'
import { TEMPLATE_STEP } from '../lib/site-build-steps.js'
import { hex, neutralReason } from '../lib/brand-accent/colour-math.js'

/**
 * The share of a logo's ink that reads under LOGO_GONE_RATIO against its ground: over LOGO_BLOCK_SHARE the logo is gone (a block),
 * from LOGO_WARN_SHARE it needs a person's eye (a warning), under it the logo still reads. The owner ruled a logo with 31% to 34% of
 * its ink under 2:1 no fault (04/11/2026): the club name stayed readable and only the dark part of the mark faded.
 */
export const LOGO_GONE_RATIO = 2
export const LOGO_BLOCK_SHARE = 0.6
export const LOGO_WARN_SHARE = 0.4

/**
 * The bar for words the brand style coloured with its accent: 3:1, WCAG's level for large text and controls. An accent reads as a
 * highlight, a link or a button label, and the owner ruled 3.28:1 on a dark footer no fault (04/11/2026). The template's own words keep
 * 4.5:1 (`needed`).
 */
export const BRAND_ACCENT_BAR = 3
/**
 * The floor for the template's own colours, on a plain ground or over a picture: under 3:1 is a step 0 warning, at or over it nothing.
 * The owner ruled the template's default grey body and menu text (3.55:1 to 4.30:1, the same on the template's demo) no fault
 * (04/11/2026). The brand's bars do not move.
 */
export const TEMPLATE_FLOOR = 3
const rgb = (c) => (c ? `rgb(${c.slice(0, 3).join(', ')})` : null)
const round = (n) => Number(n.toFixed(2))

/**
 * Words on a plain ground, with the brand style on and off. Worse than the template and under the bar is the brand's. Words the
 * style did not touch, or left no worse, are the template's own: nothing at TEMPLATE_FLOOR or over, else a warning on step 0 said
 * once per side, selector and colours across the whole run, so a template's muted text blocks no customer's site and is not
 * repeated on every page.
 */
export function judgeBandContrast(entries) {
  const failures = []
  const seen = new Set()
  for (const m of entries)
    for (const [side, read] of Object.entries(m.look.sides))
      for (const w of each(read.words)) {
        if (!w.fg || !w.bg) continue
        const ratio = contrast(w.fg, w.bg)
        if (ratio >= needed(w.large)) continue
        const before = w.fgOff && w.bgOff ? contrast(w.fgOff, w.bgOff) : null
        const template = before === null || ratio >= before - 0.01
        if (ratio >= (template ? TEMPLATE_FLOOR : BRAND_ACCENT_BAR)) continue
        // A footer's words are the same words on every page: said once, on the first page they were read.
        const id = `${template ? 'own' : 'brand'} ${side} ${w.selector} ${w.fg} ${w.bg}`
        if (seen.has(id)) continue
        seen.add(id)
        failures.push(
          template
            ? {
                page: m.path,
                width: m.width,
                level: 'warn',
                causingStep: TEMPLATE_STEP,
                measured: `${w.selector} "${w.text}" ${rgb(w.fg)} on ${rgb(w.bg)} reads ${round(ratio)}:1`,
                reason: `The template's own words read under ${TEMPLATE_FLOOR}:1 in the ${side} theme, and the brand style did not make them so.`
              }
            : {
                page: m.path,
                width: m.width,
                measured: `${w.selector} "${w.text}" ${rgb(w.fg)} on ${rgb(w.bg)} reads ${round(ratio)}:1, ${round(before)}:1 before the brand style`,
                reason: `The brand style makes these words read under ${BRAND_ACCENT_BAR}:1 in the ${side} theme.`
              }
        )
      }
  return failures
}

/** The ratio of a colour against a shot picture: the bright end under light words, the dark end under dark ones, never the mean. */
export function overPictureRatio(fg, under) {
  const text = luminance(fg)
  return ratioOfLuminances(text, text > under.p50 ? under.p85 : under.p15)
}

const fileOf = (src) => {
  try {
    return decodeURI(new URL(src).pathname).replace(/^\/+/, '')
  } catch {
    return String(src ?? '')
      .split(/[?#]/)[0]
      .replace(/^\/+/, '')
  }
}

/** How much worse than on the untouched site words must read for the picture to be what makes them fail. */
const MATERIALLY_WORSE = 0.3

/** What the write report says it placed, and the pictures the untouched site had. */
function picturesKnown(report, baseline) {
  const placed = each(report?.slots)
    .filter(
      (s) =>
        s.status === 'written' &&
        typeof s.ordered === 'string' &&
        /^(?:picture|share-image|body-background)/.test(s.part ?? '')
    )
    .map((s) => s.ordered.split('#')[0].replace(/^\/+/, ''))
  const own = new Set(each(baseline?.pictures?.files).map(fileOf))
  return {
    isPlaced: (src) => {
      const file = fileOf(src)
      return /(?:^|\/)tracy-content\//.test(file) || placed.some((p) => file.endsWith(p))
    },
    isTemplate: (src) => own.has(fileOf(src))
  }
}

/** The same words on the untouched site at this width and side, across pages when this page has none: their best reading. */
function untouchedRatio(over, { path, width, side, key }) {
  const same = each(over).filter((w) => w.key === key && w.width === width && w.side === side)
  const here = same.filter((w) => pathOfMeasure(w.page) === pathOfMeasure(path))
  const pool = here.length ? here : same
  return pool.length ? Math.max(...pool.map((w) => overPictureRatio(w.fg, w.under))) : null
}

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.slice(0, 3).every((v, i) => v === b[i])
/**
 * Which contrast rule words over a picture keep, the rule the plain-ground measure keeps (cards G and B, carried here by card AX):
 * `grey`, the template's own neutral grey (the brand style left it): TEMPLATE_FLOOR, a warning under it; `accent`, a colour the
 * brand style gave: BRAND_ACCENT_BAR; `other`, any other colour: 4.5:1 (3:1 large).
 */
export function overPictureRule(w) {
  const touched = Array.isArray(w.fgOff) && !same(w.fg, w.fgOff)
  const neutral = neutralReason(hex(...w.fg.slice(0, 3)))
  if (!touched && neutral?.startsWith('grey')) return { kind: 'grey', need: TEMPLATE_FLOOR }
  if (touched && !neutral) return { kind: 'accent', need: BRAND_ACCENT_BAR }
  return { kind: 'other', need: needed(w.large) }
}

/**
 * Words on a picture against the region the host shot under them, held to `overPictureRule`. The template's grey under its floor
 * warns once per fact (side, selector, colour and picture), on whichever page first shows it. Otherwise a brand colour that fails
 * where the template's passes is the brand's. A brand colour that fails where the template's passes is the
 * brand's. Otherwise the picture step answers when its picture is what makes them fail: the same words read at the bar, or clearly
 * better, on the untouched site. Words that read as badly there too, or lie on the template's own picture or a gradient, are the
 * template's, which warns only under TEMPLATE_FLOOR. Accent words over a veiled layer (the host's `veiled`: a picture under a
 * pseudo-element veil or a blur, the template's own blurred background) warn instead of blocking: the owner ruled them readable
 * (card AW, 2026-11-06).
 */
export function judgeWordsOverPicture(entries, { report, baseline } = {}) {
  const known = picturesKnown(report, baseline)
  const failures = []
  const seen = new Set()
  let measured = 0
  let unshot = 0
  for (const m of entries)
    for (const [side, read] of Object.entries(m.look.sides))
      for (const w of each(read.over)) {
        if (!w.under) {
          unshot++
          continue
        }
        measured++
        const ratio = overPictureRatio(w.fg, w.under)
        const { kind, need } = overPictureRule(w)
        if (ratio >= need) continue
        const id =
          kind === 'grey'
            ? `grey ${side} ${w.selector} ${w.fg} ${fileOf(w.underSrc)}`
            : `${m.path} ${m.width} ${side} ${w.selector} ${w.fg}`
        if (seen.has(id)) continue
        seen.add(id)
        const before = w.fgOff ? overPictureRatio(w.fgOff, w.under) : ratio
        // A baseline kept from before `over` moved up holds it under `look`.
        const was = untouchedRatio(baseline?.over ?? baseline?.look?.over, {
          path: m.path,
          width: m.width,
          side,
          key: w.key
        })
        const base = {
          page: m.path,
          width: m.width,
          measured: `${w.selector} "${w.text}" ${rgb(w.fg)} reads ${round(ratio)}:1 over ${fileOf(w.underSrc) || 'a gradient'}${was === null ? '' : `, ${round(was)}:1 on the untouched site`}`,
          file: w.underSrc ?? null
        }
        const pictureNew =
          Boolean(w.underSrc) && (known.isPlaced(w.underSrc) || !known.isTemplate(w.underSrc))
        const pictureMakesIt = pictureNew && (was === null || was >= need || ratio < was - MATERIALLY_WORSE)
        if (kind === 'grey') {
          failures.push({
            ...base,
            level: 'warn',
            causingStep: pictureMakesIt ? 8 : TEMPLATE_STEP,
            reason: `The template's grey words read under ${need}:1 over this picture in the ${side} theme.`
          })
        } else if (kind === 'accent' && w.veiled) {
          failures.push({
            ...base,
            level: 'warn',
            ...(before >= need ? { causingStep: 2 } : {}),
            reason: `The accent words read under ${need}:1 over the template's veiled background in the ${side} theme.`
          })
        } else if (before >= need) {
          failures.push({
            ...base,
            causingStep: 2,
            reason: `The brand colour reads under ${need}:1 over this picture in the ${side} theme, and the template's colour read ${round(before)}:1.`
          })
        } else if (pictureMakesIt) {
          failures.push({
            ...base,
            reason: `The picture makes these words read under ${need}:1 in the ${side} theme.`
          })
        } else if (ratio < TEMPLATE_FLOOR) {
          failures.push({
            ...base,
            level: 'warn',
            causingStep: TEMPLATE_STEP,
            reason: `These words read under ${need}:1 in the ${side} theme, and the template's own ground reads no better.`
          })
        }
      }
  return { failures, measured, unshot }
}

/**
 * A logo's ink against its ground. Part of its ink under 2:1 has gone, which blocks; under 3:1 it is faint, which warns. Whose it is
 * follows the file: one the brand step wrote is the brand's, any other the template's. A logo that fills its box carries its own ground.
 */
export function judgeLogos(entries, { report } = {}) {
  const brandFiles = each(report?.slots)
    .filter((s) => s.part === 'brand-logo' && s.status === 'written' && typeof s.ordered === 'string')
    .map((s) => s.ordered.split('#')[0].replace(/^\/+/, ''))
  const failures = []
  const seen = new Set()
  let read = 0
  let unread = 0
  for (const m of entries)
    for (const [side, s] of Object.entries(m.look.sides))
      for (const logo of each(s.logos)) {
        if (typeof logo.under2 !== 'number') {
          if (!logo.ink && logo.ink !== 0) unread++
          continue
        }
        read++
        if (logo.plate) continue
        const gone = logo.under2 > LOGO_BLOCK_SHARE
        if (!gone && logo.under2 < LOGO_WARN_SHARE) continue
        const file = fileOf(logo.src)
        // A logo is the same logo on every page: said once per file and theme, on the first page it was read.
        const id = `${side} ${file}`
        if (seen.has(id)) continue
        seen.add(id)
        const brands =
          !logo.src || /(?:^|\/)tracy-brand\//.test(file) || brandFiles.some((b) => file.endsWith(b))
        failures.push({
          page: m.path,
          width: m.width,
          level: gone ? 'block' : 'warn',
          causingStep: brands ? 2 : TEMPLATE_STEP,
          measured: `${logo.selector} ${file}: ${Math.round(logo.under2 * 100)}% of its ink under ${LOGO_GONE_RATIO}:1${logo.faintInk ? `, ${rgb(logo.faintInk)} on ${rgb(logo.faintGround)}` : ''}`,
          reason: gone
            ? `Part of this logo vanishes into its ground in the ${side} theme.`
            : `Much of this logo is faint on its ground in the ${side} theme.`
        })
      }
  return { failures, read, unread }
}

export const bandContrastGroup = {
  name: 'band-contrast',
  causingStep: 2,
  async run(context) {
    const { entries } = await lookEntries(context, 'band contrast')
    const { themes, themeFailures } = sidesSaid(entries)
    return {
      checked: entries.length,
      themes,
      failures: [...judgeBandContrast(entries), ...themeFailures, ...truncatedFailures(entries)]
    }
  }
}

export const wordsOverPictureGroup = {
  name: 'words-over-picture',
  causingStep: 8,
  async run(context) {
    const { entries } = await lookEntries(context, 'words over a picture')
    const { themes, themeFailures } = sidesSaid(entries)
    const { failures, measured, unshot } = judgeWordsOverPicture(entries, context)
    const failuresAll = [...failures, ...themeFailures]
    if (unshot)
      failuresAll.push({
        level: 'warn',
        measured: unshot,
        reason: `${unshot} texts on a picture could not be shot, so they were not judged.`
      })
    return {
      checked: measured,
      unshot,
      themes,
      ...(measured || unshot ? {} : { notApplicable: 'no page read prints words over a picture' }),
      failures: failuresAll
    }
  }
}

export const logoReadableGroup = {
  name: 'logo-readable',
  causingStep: 2,
  async run(context) {
    const { entries } = await lookEntries(context, 'the logos')
    const { themes, themeFailures } = sidesSaid(entries)
    const desktop = entries.filter((m) => m.width === 1440)
    const { failures, read, unread } = judgeLogos(desktop, context)
    const failuresAll = [...failures, ...themeFailures]
    if (unread)
      failuresAll.push({
        level: 'warn',
        measured: unread,
        reason: `${unread} logos could not be shot, so they were not judged.`
      })
    return { checked: read, unread, themes, notCompared: ['logos at the phone width'], failures: failuresAll }
  }
}
