// The SEO and library rules of an AI quickstart mapping file (ticket #584). Pure. Called by `mappingPlaceProblems`
// (`ai-quickstart-mapping-places.mjs`) with the page recipes.
//   - `seo.titleLimit` and `seo.descriptionLimit`: the longest title and description, in characters, a positive whole
//     number each, with `seo.limitsWhy` (search result display limits, not template measurements);
//   - every page type of the recipes has its title, description and share image (`seo.pageTypes`), the share image
//     in the 1200x630 frame, and its share title (`ogTitle`): `{sameAs: "title", locations | derived}`, the value of
//     the SEO title written where the template prints og:title, never the short heading of the page;
//   - the library names a template position (`library.position`, with per page type exceptions) and the class of the
//     template's own page width container its blocks sit in (`library.containerClass`).
import { locationProblem } from './ai-quickstart-mapping-entry.mjs'

const SEO_FIELDS = ['title', 'description', 'shareImage']
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const isLocation = (value) => isObject(value) && locationProblem(value) === null
const locs = (v) => Array.isArray(v) && v.length > 0 && v.every(isLocation)

/** The SEO limits: `seo.titleLimit`, `seo.descriptionLimit`, positive whole numbers, and why they are what they are. */
function seoLimitProblems(seo, report) {
  for (const key of ['titleLimit', 'descriptionLimit'])
    if (!(Number.isInteger(seo[key]) && seo[key] > 0))
      report(
        `seo.${key}`,
        `${key}: the longest ${key.replace('Limit', '')} in characters, a positive whole number`
      )
  if (!isName(seo.limitsWhy))
    report(
      'seo.limitsWhy',
      'say where the title and description limits come from (search result display limits)'
    )
}

/** The share title of a page type: the SEO title's value, written at its locations or drawn by the template. */
function ogTitleProblem(v) {
  if (!isObject(v) || v.sameAs !== 'title')
    return 'ogTitle: {sameAs: "title", locations} (the share title is the SEO title, not the page heading)'
  if (!(locs(v.locations) || isName(v.derived)))
    return 'ogTitle: the locations the SEO title is also written to, or derived with what the template draws it from'
  return null
}

export function seoProblems(seo, pageRecipes, report) {
  if (!isObject(seo)) return
  seoLimitProblems(seo, report)
  if (seo.pageTypes === undefined) return
  const frame = seo.shareImageFrame
  if (!(isObject(frame) && frame.width === 1200 && frame.height === 630))
    report('seo.shareImageFrame', 'the share image frame is {width: 1200, height: 630}')
  const types = (Array.isArray(pageRecipes?.recipes) ? pageRecipes.recipes : []).map((r) => r?.pageType)
  for (const type of types.filter(isName)) {
    const at = `seo.pageTypes[${type}]`
    const decl = seo.pageTypes?.[type]
    const record = isName(decl) ? seo[decl] : decl
    if (!isObject(record)) {
      report(at, `page type "${type}" has no SEO fields: name a record of seo or declare them`)
      continue
    }
    for (const name of SEO_FIELDS) {
      const v = record[name]
      if (!(locs(v) || (isObject(v) && isName(v.derived))))
        report(
          `${at}.${name}`,
          `${name}: a list of locations, or {derived} with what the template draws it from`
        )
    }
    const og = ogTitleProblem(record.ogTitle)
    if (og) report(`${at}.ogTitle`, og)
  }
}

export function libraryProblems(library, pageRecipes, report) {
  if (!isObject(library) || !isName(library.position))
    return report('library.position', 'name the template position the Tracy library blocks are published in')
  if (!isName(library.containerClass))
    report(
      'library.containerClass',
      "name the class of the template's own page width container a library block sits in, as measured"
    )
  const types = new Set((pageRecipes?.recipes ?? []).map((r) => r?.pageType))
  for (const [type, position] of Object.entries(library.pageTypes ?? {}))
    if (!types.has(type) || !isName(position))
      report(`library.pageTypes[${type}]`, 'a page type of the recipes, with the position it uses instead')
}
