// Icon typed fields of an AI quickstart build (ticket #595, owner decision 13/11/2026). ADR 0040 kept the template's own
// icon (`editorial.item_icon` decides `keep`), so a yoga studio built on JA Boxing showed a boxing glove. On a build from
// an AI quickstart that rule no longer applies: every icon field is filled from the picture step's icon library, by
// ADR 0043's mechanism, or hidden.
//
//   1. Code reads each item's WRITTEN copy (the page writer's output, its heading first) and its plan data, and filters
//      the library down to candidates (`icon-candidates.mjs`). The model only ranks them (`icon-ranking.mjs`); a name
//      outside the candidates is a failure, never a pick.
//   2. A social icon stands for its link's network: code takes the network's mark (`icon-social.mjs`), no model.
//   3. Each icon has a light and a dark version, painted in colour roles (ADR 0043 section 1a: never a colour value)
//      and drawn at the frame the block store declares.
//   4. No candidate, an empty ranking, or an icon its section already shows: the field is hidden with the reason.
//      Never a photo, never a generated picture, never the demo icon.
//   5. Any failure throws `IconSelectionError` with a code (ADR 0047): re-run once, then stop and report.
import { iconCountsOf, iconProblemsOf } from './icon-check.mjs'
import { contentCatalog, iconCandidates, subjectWordsOf } from './icon-candidates.mjs'
import { iconScopesOfPlan } from './icon-fields.mjs'
import { IconSelectionError, rankIconCandidates } from './icon-ranking.mjs'
import { networkOf } from './icon-social.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** ADR 0043 section 1a with no demo icon to read: the glyph in the accent, the other theme keeps the accent. */
export const DEFAULT_ICON_LOOK = Object.freeze({
  weight: 'regular',
  light: Object.freeze({ glyph: 'accent', plate: null }),
  dark: Object.freeze({ glyph: 'accent', plate: null })
})
const HEADING = /\.(heading|name|title)$/

/** The written copy by scope key (`<page>|<block>|<item>`), each value with its field's kind, headings first. */
function copyByScope(copy, blocks, pages) {
  const blockOf = new Map(list(pages).flatMap((p) => list(p.blocks).map((b) => [`${p.id}|${b.id}`, b.block])))
  const out = new Map()
  for (const page of list(copy?.pages))
    for (const entry of list(page.copy)) {
      if (!isText(entry.value)) continue
      const d = blocks.get(blockOf.get(`${page.id}|${entry.block}`)) ?? {}
      const field = [...list(d.fields), ...list(d.itemFields)].find((f) => f.name === entry.field)
      const key = `${page.id}|${entry.block}|${entry.item ?? ''}`
      if (!out.has(key)) out.set(key, [])
      out.get(key).push({ field: entry.field, kind: field?.kind ?? '', value: entry.value })
    }
  for (const values of out.values())
    values.sort((a, b) => (HEADING.test(b.kind) ? 1 : 0) - (HEADING.test(a.kind) ? 1 : 0))
  return out
}

/** The words an item's icon is matched against: its written copy (heading first), then its plan data's own words. */
function wordsOfScope(scope, written, data) {
  const key = `${scope.page}|${scope.block}|${scope.item ?? ''}`
  const copy = (written.get(key) ?? []).filter((c) => !scope.for || scope.for.includes(c.field))
  const entry = scope.item ? data.byId.get(scope.item) : null
  const own = entry?.what === 'item' ? Object.values(entry.source?.fields ?? {}).map((f) => f?.value) : []
  return [...copy.map((c) => c.value), entry?.entry?.label, ...own].filter(isText)
}

/** One icon field's record: the chosen icon with its two theme versions at the declared frame, or hidden with why. */
function entryOf(scope, field, chosen, { set, look }) {
  const base = {
    id: field.id,
    page: scope.page,
    block: scope.block,
    blockId: scope.blockId,
    field: field.field,
    kind: field.kind,
    storage: field.storage,
    frame: field.frame,
    case: scope.case === 'social' ? 'social' : 'content',
    ...(scope.item ? { item: scope.item } : {}),
    ...(scope.social ? { network: chosen.network ?? null } : {}),
    ...(chosen.words ? { words: chosen.words } : {})
  }
  if (!chosen.name) return { ...base, source: 'none', reason: chosen.reason }
  const version = (theme) => ({
    theme,
    icon: chosen.name,
    set,
    weight: look.weight,
    width: field.frame?.width ?? null,
    height: field.frame?.height ?? null,
    paint: { glyph: look[theme].glyph, plate: look[theme].plate ?? null }
  })
  return {
    ...base,
    source: 'library',
    icon: { name: chosen.name, set, weight: look.weight },
    variants: { light: version('light'), dark: version('dark') },
    sizeFrom: field.frame
      ? 'the frame the block store declares'
      : 'no frame declared: the template sizes the icon',
    by: chosen.by,
    reason: chosen.reason
  }
}

/**
 * Select the icon of every icon field of an approved plan, from the written copy.
 * @param {{plan: object, data: object, blocks: Map<string, object>, copy: {pages: object[]},
 *   iconLibrary: {set: string, icons: Array<{name: string, tags?: string[], categories?: string[]}>},
 *   model?: Function, looks?: Record<string, typeof DEFAULT_ICON_LOOK>}} input `copy`: the page writer's output
 *   (`writePages`); `looks`: per store block id, the weight and roles measured from its demo icons (ADR 0043 1a)
 * @returns {Promise<{icons: object[], counts: object, prompt: object | null}>}
 */
export async function selectIcons({ plan, data, blocks, copy, iconLibrary, model, looks = {} }) {
  const scopes = iconScopesOfPlan(plan?.pages, blocks, data)
  if (scopes.length === 0) return { icons: [], counts: iconCountsOf({ icons: [] }), prompt: null }
  if (!Array.isArray(copy?.pages))
    throw new IconSelectionError(
      'icon_copy_missing',
      'icon fields are matched to the written copy, and none was given'
    )
  const icons = list(iconLibrary?.icons)
  if (icons.length === 0 || !isText(iconLibrary?.set))
    throw new IconSelectionError('icon_library_missing', 'icon fields need the icon library and its set name')
  const names = new Set(icons.map((i) => i.name))
  const catalog = contentCatalog(icons)
  const written = copyByScope(copy, blocks, plan.pages)
  const chosen = new Map()
  const asked = []
  for (const scope of scopes) {
    if (scope.case === 'undeclared') chosen.set(scope.id, { reason: 'icon_item_undeclared' })
    else if (scope.case === 'social') {
      const net = networkOf(scope.social?.url)
      if (!scope.social?.url) chosen.set(scope.id, { reason: 'no_social_link' })
      else if (!net) chosen.set(scope.id, { reason: 'social_network_unknown' })
      else if (!names.has(net.icon))
        chosen.set(scope.id, { reason: 'social_icon_not_in_library', network: net.network })
      else
        chosen.set(scope.id, {
          name: net.icon,
          network: net.network,
          by: 'network',
          reason: `the ${net.network} mark`
        })
    } else {
      const words = wordsOfScope(scope, written, data)
      const candidates = iconCandidates(subjectWordsOf(words), catalog)
      if (candidates.length === 0) chosen.set(scope.id, { reason: 'no_candidate_icon' })
      else asked.push({ id: scope.id, scope, words, candidates })
    }
  }
  const { rankings, prompt } = await rankIconCandidates({ asked, model })
  // No icon twice in one block: each item takes its best ranked name its block does not show yet.
  const taken = new Map()
  for (const { id, scope, words } of asked) {
    const used = taken.get(`${scope.page}.${scope.block}`) ?? new Set()
    taken.set(`${scope.page}.${scope.block}`, used)
    const ranked = rankings.get(id) ?? []
    const name = ranked.find((n) => !used.has(n))
    if (name) used.add(name)
    chosen.set(
      id,
      name
        ? {
            name,
            words,
            by: 'model',
            reason: 'ranked by the build model from the candidates of its written words'
          }
        : { words, reason: ranked.length ? 'icon_repeats_in_block' : 'no_matching_icon' }
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
  const selection = { icons: out, counts: iconCountsOf({ icons: out }), prompt }
  const problems = iconProblemsOf(selection, { names })
  if (problems.length)
    throw new IconSelectionError('icon_policy_broken', `${problems.length} icon rules broken`, { problems })
  return selection
}
