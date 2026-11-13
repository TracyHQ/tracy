// Icon typed fields of an AI quickstart build (ticket #595, owner decision 13/11/2026). ADR 0040 kept the template's own
// icon (`editorial.item_icon` decides `keep`), so a yoga studio built on JA Boxing showed a boxing glove. On a build from
// an AI quickstart that rule no longer applies (ADR 0040, amended 13/11/2026): every icon field, at every depth, is
// filled from the picture step's icon library, by ADR 0043's mechanism, or hidden.
//
//   1. Code reads each item's WRITTEN copy (the page writer's output, `icon-copy.mjs`, its heading first) and its plan
//      data, and filters the library down to candidates (`icon-candidates.mjs`). On a site not written in English the
//      build model first gives English keywords for every item in one call (`icon-keywords.mjs`). The model then only
//      ranks the candidates (`icon-ranking.mjs`); a name outside them is a failure, never a pick.
//   2. A social icon (`iconOf: "network"`) stands for its link's network: code takes the network's mark
//      (`icon-social.mjs`), no model.
//   3. Each icon is written in the theme its field declares, or in both (`icon-entry.mjs`), painted in colour roles
//      (ADR 0043 section 1a: never a colour value) and drawn at the frame the block store declares.
//   4. No candidate, an empty ranking, or an icon its section already shows: the field is hidden with the reason.
//      Never a photo, never a generated picture, never the demo icon.
//   5. Any failure throws `IconSelectionError` with a code (ADR 0047): re-run once, then stop and report.
import { iconCountsOf, iconProblemsOf } from './icon-check.mjs'
import { contentCatalog, iconCandidates, subjectOf } from './icon-candidates.mjs'
import { wordsOfScope, writtenByScope } from './icon-copy.mjs'
import { DEFAULT_ICON_LOOK, entryOf } from './icon-entry.mjs'
import { iconScopesOfPlan } from './icon-fields.mjs'
import { englishKeywordsOf, isEnglish } from './icon-keywords.mjs'
import { IconSelectionError, rankIconCandidates } from './icon-ranking.mjs'
import { networkOf, socialReasonOf } from './icon-social.mjs'

export { DEFAULT_ICON_LOOK } from './icon-entry.mjs'
/** A site with at least this many content icon items, all hidden, is noted `icons_all_hidden`. */
export const ALL_HIDDEN_MIN_ITEMS = 4
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The decision of a social scope: its network's mark, or hidden with why. */
function socialChoice(url, names) {
  const reason = socialReasonOf(url)
  if (reason) return { reason }
  const net = networkOf(url)
  if (!names.has(net.icon)) return { reason: 'social_icon_not_in_library', network: net.network }
  return { name: net.icon, network: net.network, by: 'network', reason: `the ${net.network} mark` }
}

/** The notes a report shows: twin fields that do not say their theme, and a site whose content icons are all hidden. */
function notesOf(scopes, chosen) {
  const notes = []
  const undeclared = scopes.filter((s) => s.fields.length > 1 && s.fields.some((f) => !f.theme))
  if (undeclared.length)
    notes.push({
      code: 'icon_theme_undeclared',
      scopes: undeclared.map((s) => s.id),
      message: 'twin icon fields do not declare their theme: each was given a light and a dark version'
    })
  const content = scopes.filter((s) => s.case === 'content')
  if (content.length >= ALL_HIDDEN_MIN_ITEMS && content.every((s) => !chosen.get(s.id)?.name)) {
    const reasons = {}
    for (const s of content) reasons[chosen.get(s.id).reason] = (reasons[chosen.get(s.id).reason] ?? 0) + 1
    notes.push({
      code: 'icons_all_hidden',
      items: content.length,
      reasons,
      message: `every one of the ${content.length} content icons of the site is hidden`
    })
  }
  return notes
}

/**
 * Select the icon of every icon field of an approved plan, from the written copy.
 * @param {{plan: object, data: object, blocks: Map<string, object>, copy: {pages: object[]},
 *   iconLibrary: {set: string, icons: Array<{name: string, tags?: string[], categories?: string[]}>},
 *   model?: Function, looks?: Record<string, typeof DEFAULT_ICON_LOOK>}} input `copy`: the page writer's output
 *   (`writePages`); `model`: the standard build model's TEXT call (keywords and ranking); `looks`: per store block id,
 *   the weight and roles measured from its demo icons (ADR 0043 1a)
 * @returns {Promise<{icons: object[], counts: object, notes: object[], prompt: object | null,
 *   keywordsPrompt: object | null}>}
 */
export async function selectIcons({ plan, data, blocks, copy, iconLibrary, model, looks = {} }) {
  const scopes = iconScopesOfPlan(plan?.pages, blocks, data)
  const empty = {
    icons: [],
    counts: iconCountsOf({ icons: [] }),
    notes: [],
    prompt: null,
    keywordsPrompt: null
  }
  if (scopes.length === 0) return empty
  const written = writtenByScope(copy, scopes)
  const icons = list(iconLibrary?.icons)
  if (icons.length === 0 || !isText(iconLibrary?.set))
    throw new IconSelectionError('icon_library_missing', 'icon fields need the icon library and its set name')
  if (scopes.some((s) => s.case === 'content') && typeof model !== 'function')
    throw new IconSelectionError('icon_ranker_missing', 'icon fields need the build model (its text call)', {
      items: scopes.filter((s) => s.case === 'content').map((s) => s.id)
    })
  const names = new Set(icons.map((i) => i.name))
  const catalog = contentCatalog(icons)
  const chosen = new Map()
  const content = []
  for (const scope of scopes) {
    if (scope.case === 'undeclared') chosen.set(scope.id, { reason: 'icon_item_undeclared' })
    else if (scope.case === 'social') chosen.set(scope.id, socialChoice(scope.social?.url, names))
    else {
      const words = wordsOfScope(scope, written, data)
      if (words.all.length === 0) chosen.set(scope.id, { words: [], reason: 'icon_words_missing' })
      else content.push({ id: scope.id, scope, words })
    }
  }
  // A site not written in English: one call gives English keywords for every item, and candidates are filtered on them.
  const translate = !isEnglish(plan.language)
  const { keywords, prompt: keywordsPrompt } = translate
    ? await englishKeywordsOf({
        language: plan.language,
        items: content.map((c) => ({
          id: c.id,
          heading: c.words.heading.join(' / '),
          text: c.words.text.join(' / ')
        })),
        model
      })
    : { keywords: new Map(), prompt: null }
  const asked = []
  for (const c of content) {
    const english = keywords.get(c.id)
    const subject = translate
      ? subjectOf({ heading: english ?? [] })
      : subjectOf({ heading: c.words.heading, text: c.words.text })
    const candidates = iconCandidates(subject, catalog)
    const record = { words: c.words.all, ...(translate ? { keywords: english ?? [] } : {}) }
    if (candidates.length === 0) chosen.set(c.id, { ...record, reason: 'no_candidate_icon' })
    else asked.push({ id: c.id, scope: c.scope, words: c.words.all, record, candidates })
  }
  const { rankings, prompt } = await rankIconCandidates({ asked, model })
  // No icon twice in one block: each item takes its best ranked name its block does not show yet.
  const taken = new Map()
  for (const { id, scope, record } of asked) {
    const used = taken.get(`${scope.page}.${scope.block}`) ?? new Set()
    taken.set(`${scope.page}.${scope.block}`, used)
    const ranked = rankings.get(id) ?? []
    const name = ranked.find((n) => !used.has(n))
    if (name) used.add(name)
    chosen.set(
      id,
      name
        ? {
            ...record,
            name,
            by: 'model',
            reason: 'ranked by the build model from the candidates of its words'
          }
        : { ...record, reason: ranked.length ? 'icon_repeats_in_block' : 'no_matching_icon' }
    )
  }
  const out = scopes.flatMap((scope) =>
    scope.fields.map((field) =>
      entryOf(scope, field, chosen.get(scope.id), {
        set: iconLibrary.set,
        look: looks[scope.blockId] ?? DEFAULT_ICON_LOOK
      })
    )
  )
  const selection = { icons: out, counts: iconCountsOf({ icons: out }), notes: notesOf(scopes, chosen) }
  const problems = iconProblemsOf(selection, { names })
  if (problems.length)
    throw new IconSelectionError('icon_policy_broken', `${problems.length} icon rules broken`, { problems })
  return { ...selection, prompt, keywordsPrompt }
}
