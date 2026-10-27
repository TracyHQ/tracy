/**
 * The standard questionnaire fitted to the template a site is built from (D7, TracyHQ/tch#1013).
 *
 * 🔒 THE SERVER DECIDES, THE PANEL ONLY DRAWS. The standard file of a CMS is the same for every
 * template; what differs per template is filled in here, BEFORE the set is hashed and kept in
 * `question_snapshot`, so the snapshot holds what the customer was really shown and a submit is
 * judged against it:
 *
 *   logo     `variants` — the tiles of the template's logo layout (`template-profiles.json`):
 *            pair → ['light', 'dark'], dark → ['dark'], single → ['single']. A release with no
 *            profile row asks one logo (['single']) and leaves a line in the server log.
 *   pages    `options` (page ids), `optionLabels` and `locked: [<home id>]`, from the release's own
 *            `tracy_site_pages.json` (`pagesOf`). A release without that file (or no release at
 *            all) serves the question with NO options and `keepsAllPages: true`: the build keeps
 *            every page of the design, and the panel may say so instead of offering a list.
 *   logo, favicon  left out entirely while brand uploads are off (`brandUploadsAvailable`: the
 *            `site-brand-uploads` switch and an artifact store). No other question is ever dropped.
 *
 * Every template is built in ONE language this round (D10): the door says `languages: 'one'`
 * beside the set (`resolveQuestions`), not inside it.
 */
import { templateProfileOf } from './template-profiles.js'
import { LOGO_LAYOUTS, pick, withLogoVariants } from './questions-schema.mjs'
import { pagesOf } from './site-pages-schema.mjs'

/** The fields this module adds to a question, carried onto the question as the form draws it. */
const SERVED_FIELDS = ['variants', 'locked', 'keepsAllPages']

const isPagesQuestion = (/** @type {any} */ q) => Array.isArray(q?.feeds) && q.feeds.includes('site.pages')
const isBrandQuestion = (/** @type {any} */ q) => q?.kind === 'logo' || q?.kind === 'favicon'

/**
 * The pages question of a set, filled from a release's page list — or emptied and flagged when the
 * release ships none. Pure: returns a new document; every other question is untouched.
 * @param {{ languages?: string[], questions: any[] }} doc
 * @param {{ pages?: unknown } | null} release a row of `readReleases`, or null
 */
export function fitPagesQuestion(doc, release) {
  const pages = pagesOf(release)
  const languages = Array.isArray(doc.languages) && doc.languages.length ? doc.languages : ['en']
  return {
    ...doc,
    questions: doc.questions.map((q) => {
      if (!isPagesQuestion(q)) return q
      const { options, optionLabels, locked, keepsAllPages, ...rest } = q
      if (!pages) return { ...rest, keepsAllPages: true }
      return {
        ...rest,
        options: pages.map((p) => p.id),
        // The label is the template's own menu text, the same in every language of the set.
        optionLabels: Object.fromEntries(
          pages.map((p) => [p.id, Object.fromEntries(languages.map((l) => [l, p.label]))])
        ),
        locked: pages.filter((p) => p.home === true).map((p) => p.id)
      }
    })
  }
}

/**
 * The whole set fitted to one release: logo tiles, the template's pages, brand questions kept or left out.
 * @param {{ languages?: string[], questions: any[] }} doc the standard file of the CMS
 * @param {{ release?: any, brandUploads?: boolean, warn?: (line: string) => void }} [opts]
 *   `release` a row of `readReleases` (its `tag` and `setting.version` find the profile), or null.
 */
export function fitQuestions(doc, { release = null, brandUploads = false, warn = console.warn } = {}) {
  const kept = { ...doc, questions: doc.questions.filter((q) => brandUploads || !isBrandQuestion(q)) }
  const profile = release ? templateProfileOf(release.tag, release.setting?.version) : null
  let warned = false
  const fitted = {
    ...kept,
    questions: kept.questions.map((q) => {
      if (q.kind !== 'logo') return q
      if (!profile && !warned) {
        warned = true
        warn(
          `[questions] no template profile for ${release ? `${release.tag}@${release.setting?.version}` : 'a site with no release'}; the logo question asks one logo`
        )
      }
      return withLogoVariants(q, profile ? LOGO_LAYOUTS[profile.logos] : LOGO_LAYOUTS.single)
    })
  }
  return fitPagesQuestion(fitted, release)
}

/**
 * A question as the form draws it (`questionsFor`), given the served fields of its fitted document
 * question — `questionsFor` knows only the authored fields.
 * @param {Record<string, unknown>} drawn one question of `questionsFor(doc, lang)`
 * @param {any} authored the same question of the fitted document
 */
export function withServedFields(drawn, authored) {
  const out = { ...drawn }
  for (const key of SERVED_FIELDS)
    if (authored?.[key] !== undefined) out[key] = structuredClone(authored[key])
  return out
}

/**
 * The pages a build keeps, from a fitted set and the answers by question id.
 *
 * `all` is the template's list (`{id, label, home?}`, in its own order); `picked` the ids kept: the ones
 * ticked that the template has, plus home always. A page id the template does not have is dropped with a
 * note, never a failed create. The question unanswered keeps every page. Null pages when the set asks no
 * pages question or the template ships no page list.
 * @param {{ questions: any[] }} doc fitted with `fitPagesQuestion`
 * @param {Record<string, unknown>} given answers by question id
 * @returns {{ pages: { all: { id: string, label: string, home?: true }[], picked: string[] } | null,
 *   notes: string[] }}
 */
export function pagesOfBrief(doc, given) {
  const q = (doc?.questions ?? []).find(isPagesQuestion)
  if (!q || !Array.isArray(q.options) || q.options.length === 0) return { pages: null, notes: [] }
  const locked = Array.isArray(q.locked) ? q.locked : []
  const all = q.options.map((/** @type {string} */ id) => ({
    id,
    label: pick(q.optionLabels?.[id], 'en') ?? id,
    ...(locked.includes(id) ? { home: /** @type {true} */ (true) } : {})
  }))
  const raw = given?.[q.id]
  if (raw === undefined) return { pages: { all, picked: [...q.options] }, notes: [] }
  const list = (Array.isArray(raw) ? raw : []).filter((v) => typeof v === 'string')
  const notes = list
    .filter((id) => !q.options.includes(id))
    .map((id) => `page ${JSON.stringify(id.slice(0, 80))} is not a page of this template; dropped`)
  const picked = q.options.filter((/** @type {string} */ id) => list.includes(id) || locked.includes(id))
  return { pages: { all, picked }, notes }
}
