// The parts of a template whose words sit on a picture (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026), for
// `brand-colour-css.mjs`: a hero or band painted with a background image, or laid under a dark overlay (`::before` with a
// translucent black). Words in the brand colour there are judged against the picture, not the page ground: a photograph
// shows bright and dark patches under the same word, so the tone must stand clear of the overlay on every side.
//
//   pictureScopesOf  the selectors (as class/id sets) of the parts painted with a picture or an overlay, read from the CSS
//                    and from the inline `style="background-image:..."` of the pages
//   onPicture        whether a selector item sits inside one of them
//   pictureGround    the ground words on a picture are judged against: the darkest overlay laid on a mid grey photo, or a
//                    dark ground when the picture has no overlay (a photograph behind words is darkened by the template)
//
// Measured, never named: no template or class is named here.
import { hexOf, mixOf } from './brand-colour-maths.mjs'
import { coloursIn, itemsOf } from './brand-colour-measure.mjs'

/** A background picture from a file: a photograph. A data URI is an icon drawn in the stylesheet, never a photograph. */
const PHOTO = /url\(\s*(?!["']?data:)/i
const MID_PHOTO = { r: 128, g: 128, b: 128 }
const NO_OVERLAY = '#1a1a1a'
/** Layout and utility classes that say nothing about a part (`style-1`, `container`, `col-lg-8`, `d-flex`). */
const GENERIC =
  /^(?:style-\d+|container(?:-fluid)?|row|col(?:-.*)?|d-.*|t\d-section|section|inner|item(?:-inner)?|clearfix)$/

/** The simple tokens (`.class`, `#id`) of a selector part, without states or pseudo elements. */
const tokensOf = (part) =>
  new Set(
    [
      ...String(part)
        .replace(/::?[\w-]+(?:\([^)]*\))?/g, '')
        .matchAll(/[.#][\w-]+/g)
    ].map((m) => m[0])
  )

/**
 * @param {Array<{at: string[], selector: string, decls: Array<{prop: string, value: string}>}>} rules
 * @param {Array<{html: string}>} pages
 * @returns {{scopes: Array<Set<string>>, overlays: Array<{r: number, g: number, b: number, a?: number}>}}
 */
export function pictureScopesOf(rules, pages = []) {
  const scopes = []
  const overlays = []
  for (const r of rules)
    for (const item of itemsOf(r.selector)) {
      const pseudo = /::?(?:before|after)\s*$/.test(item)
      const pictured = r.decls.some(
        (d) =>
          (/^background(?:-image)?$/.test(d.prop) && PHOTO.test(d.value) && !pseudo) ||
          (d.prop === 'background-size' && /cover/.test(d.value) && !pseudo)
      )
      // A pseudo element laid over the whole of its part and painted a translucent or opaque dark colour: an overlay.
      const covers =
        r.decls.some((d) => d.prop === 'position' && /absolute|fixed/.test(d.value)) &&
        r.decls.some((d) => /^(?:inset|width|height)$/.test(d.prop) && /100%|^0$/.test(d.value.trim()))
      const shade =
        pseudo && covers
          ? r.decls
              .filter((d) => /^background(?:-color)?$/.test(d.prop))
              .flatMap((d) => coloursIn(d.value))
              .find((c) => (c.a ?? 1) >= 0.3 && c.r + c.g + c.b < 200)
          : null
      if (!pictured && !shade) continue
      const last =
        item
          .trim()
          .split(/\s+|>|\+|~/)
          .filter(Boolean)
          .at(-1) ?? ''
      const tokens = tokensOf(last)
      if (tokens.size) scopes.push(tokens)
      if (shade) overlays.push(shade)
    }
  for (const page of pages ?? [])
    for (const m of String(page?.html ?? '').matchAll(
      /<[a-z][\w-]*\s([^>]*style\s*=\s*["'][^"']*background(?:-image)?\s*:[^"']*url\((?!\s*["']?data:)[^>]*)>/gi
    )) {
      const attrs = m[1]
      const tokens = new Set()
      const id = /\sid\s*=\s*["']([^"']+)["']/i.exec(` ${attrs}`)
      if (id) tokens.add(`#${id[1]}`)
      const cls = /\sclass\s*=\s*["']([^"']+)["']/i.exec(` ${attrs}`)
      for (const c of cls ? cls[1].split(/\s+/) : []) if (c && !GENERIC.test(c)) tokens.add(`.${c}`)
      // An element is a scope by any one of its own names: a rule names it by one class or by its id.
      for (const t of tokens) scopes.push(new Set([t]))
    }
  return { scopes, overlays }
}

/**
 * Whether selector item `item` names something inside (or on) a part painted with a picture: one of its compounds holds
 * every token of a scope. The part itself counts (its own words sit on its picture).
 * @param {string} item
 * @param {Array<Set<string>>} scopes
 */
export function onPicture(item, scopes) {
  if (!scopes.length) return false
  const parts = String(item)
    .trim()
    .split(/\s+|>|\+|~/)
    .filter(Boolean)
    .map(tokensOf)
  return scopes.some((s) => parts.some((p) => [...s].every((t) => p.has(t))))
}

/**
 * The ground words on a picture are judged against: the darkest overlay over a mid grey photograph, or a dark ground
 * when the template paints no overlay.
 * @param {Array<{r: number, g: number, b: number, a?: number}>} overlays
 */
export function pictureGround(overlays) {
  if (!overlays.length) return NO_OVERLAY
  const grounds = overlays.map((o) => mixOf(MID_PHOTO, o, o.a ?? 1))
  const darkest = grounds.reduce((a, b) => (a.r + a.g + a.b <= b.r + b.g + b.b ? a : b))
  return hexOf(darkest)
}
