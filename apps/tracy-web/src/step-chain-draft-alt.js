// The alt text hand-off of an assembled run (#597), from the pictures step to the write order.
//
// The write order owns alt text (`write-order-block.mjs`): an own picture says its label, a drawn one its label or its
// item's, an initials avatar the person's name. The labels are made by the vision call, which is asked for no
// language (its prompt is under review, #600, and is not changed here), so they are read as English. The hand-off runs
// after the pictures step and the writer, before the order is built: every placed frame gets one alt, the first of its
// choices that passes the alt guard, recorded by where it came from (`altFrom`: `label`, `item`, `site`) so the build
// record counts the fallbacks.
//
//   choices  an English site: the picture's label, the item's own label, the site name. Any other site: the label or
//            the item's label only when its text reads as the site language (`tinyld`), else the site name; an
//            English label is never the alt of a site in another language.
//   guard    the copy check of written copy (`fieldValueProblems`: plain text, no dash, no invented data, award or
//            superlative claim the plan data does not hold), no held person or held business name (as words or in a
//            slug), no template name. Cut first to the alt limit at a word boundary: no kit declares an alt limit, so
//            it is `ALT_LIMIT`.
import { detect } from 'tinyld'
import { fieldValueProblems } from 'website-opportunities/domain/page-copy-check.mjs'
import { knownEntriesOf } from 'website-opportunities/domain/page-writer-fields.mjs'
import { planDataOf } from 'website-opportunities/domain/plan-data.mjs'
import { namesTemplate } from 'website-opportunities/domain/plan-request-claims.mjs'
import { heldTextsOf, namesHeldInAnyForm } from 'website-opportunities/domain/plan-withheld.mjs'

/** The most characters an alt text holds (no kit declares one; a screen reader reads about this much at once). */
export const ALT_LIMIT = 125

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const baseOf = (language) => (isText(language) ? language.toLowerCase().split(/[-_]/)[0] : 'en')

/** Whether a text reads as the language (`tinyld`); a text too short to tell does not. */
export const readsAs = (text, language) => isText(text) && detect(text) === baseOf(language)

/** A text cut to `limit` characters at a word boundary, without a dangling comma or full stop. */
export function cutAlt(text, limit = ALT_LIMIT) {
  const chars = [...String(text).trim().replace(/\s+/g, ' ')]
  if (chars.length <= limit) return chars.join('')
  const head = chars.slice(0, limit).join('')
  const space = head.lastIndexOf(' ')
  return (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/u, '')
}

/** The site name: the business name the profile shows (the neutral identity while the real one is held). */
const siteNameOf = (profile) =>
  list(profile?.facts?.['business.name']).find((f) => isText(f?.value))?.value ?? null

const itemLabelOf = (item) =>
  isText(item?.label)
    ? item.label
    : (Object.entries(item?.fields ?? {}).find(([role, f]) => role.endsWith('.name') && isText(f?.value))?.[1]
        ?.value ?? null)

/** The alt guard: the cut text when it passes, else null. */
export function altGuard({ profile, withheld, template }) {
  const held = heldTextsOf(withheld)
  const data = planDataOf(profile)
  const known = knownEntriesOf(data.byId, data.rowsById)
  const field = { name: 'alt', type: 'text', limit: ALT_LIMIT }
  return (text) => {
    if (!isText(text)) return null
    const alt = cutAlt(text)
    if (fieldValueProblems(field, alt, { known }).length) return null
    if (namesHeldInAnyForm([alt], held)) return null
    if (
      isText(template?.name) &&
      (namesTemplate(alt, template) || namesHeldInAnyForm([alt], [template.name]))
    )
      return null
    return alt
  }
}

/**
 * The frames of the pictures step with the alt text the write order reads (`label`) settled for every own and drawn
 * picture, and `altFrom` saying which choice it is (`label`, `item`, `site`, or null when none passed).
 * @param {object[]} frames the `frames` of `placeBuildPictures`
 * @param {{profile: object, language?: string, withheld?: object, template?: {name?: string}}} context the profile
 *   the order is built from, the site language, `withheld` of the full profile and the template of the kit
 */
export function withAltTexts(frames, { profile, language, withheld, template }) {
  const guard = altGuard({ profile, withheld, template })
  const english = baseOf(language) === 'en'
  const inSite = (text) => (english || readsAs(text, language) ? text : null)
  const items = new Map(
    Object.values(profile?.items ?? {})
      .flat()
      .filter((i) => isText(i?.id))
      .map((i) => [i.id, i])
  )
  const site = siteNameOf(profile)
  return list(frames).map((frame) => {
    if (frame?.source !== 'own' && frame?.source !== 'generated') return frame
    const item = frame.item ? items.get(frame.item) : null
    const choices = [
      ['label', inSite(frame.label)],
      ['item', inSite(itemLabelOf(item))],
      ['site', site]
    ]
    for (const [from, text] of choices) {
      const alt = guard(text)
      if (alt) return { ...frame, label: alt, altFrom: from }
    }
    return { ...frame, label: null, altFrom: null }
  })
}

/** How the alts of the frames were settled: by choice, `fallbacks` being every alt that is not the picture's label. */
export function altCountsOf(frames) {
  const counts = { label: 0, item: 0, site: 0, none: 0 }
  for (const f of list(frames))
    if (f && 'altFrom' in f) counts[f.altFrom ?? 'none'] = (counts[f.altFrom ?? 'none'] ?? 0) + 1
  return { ...counts, fallbacks: counts.item + counts.site }
}

/** Every placed picture of a built order whose alt text is missing or names something held off the site. */
export function altProblemsOf(order, withheld) {
  const held = heldTextsOf(withheld)
  const problems = []
  for (const picture of list(order?.pictures)) {
    if (!['own', 'generated', 'initials'].includes(picture?.source)) continue
    if (!isText(picture.alt)) problems.push({ code: 'alt_text_missing', frame: picture.frame })
    else if (namesHeldInAnyForm([picture.alt], held))
      problems.push({ code: 'alt_text_withheld', frame: picture.frame })
  }
  return problems
}
