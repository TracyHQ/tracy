/**
 * The PAGE-5 signals added after the g59 test builds (10/10/2026):
 * - social lists (K6, EmDash): every seed list of social profiles must have an `identity` rule
 *   `from: "social"`, so Tracy keeps the demo's buttons and empties only their links; and no view
 *   may drop an item because its link is empty (`.filter((s) => s?.url)`), or the buttons vanish
 *   once Tracy empties the links (g59: Tracy SaaS keeps the demo company's live profiles, Tracy
 *   Business and Base write `[]`).
 * - a label rule carries its destination: a rule or slot that lets Tracy rewrite a button's words
 *   must let Tracy see where the button goes, or the new words name another page (g59: "Xem bánh →"
 *   on a button that opens /contact). EmDash: a `copy` rule on a field drawn inside a link needs a
 *   sibling link field in the same entry (`hero_cta2_label` ↔ `hero_cta2_url`) or the destination on
 *   the rule (`leadsTo: "/contact"`, the field the kit passes to the model with the label). WordPress: a text slot on a named `core/button` needs the url slot of the same block.
 *   Joomla: a text slot on an ACM button label needs a url slot on the link field beside it.
 * Called by `page-5-buttons-lead-somewhere.js`.
 */
import { contractSlots, releaseContract } from '../readers/contract-profile-of-release.js'
import { listed } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { blocksOf } from '../site-pages/wordpress-blocks.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'

const NETWORK =
  /\b(facebook|instagram|twitter|x\.com|linkedin|tiktok|youtube|pinterest|threads|t\.me|telegram|whatsapp|discord|github|vk\.com|dribbble|behance|mastodon|bluesky)\b/i
const LINK_KEY = /^(url|href|link)$/i
const LABEL_FIELD = /_(label|button)$/
const ACM_LABEL =
  /(btn|button)[\w-]*\]?$|cta[\w-]*(label|title)([-_]?\d+)?\]?$|link[-_](title|text|label)([-_]?\d+)?\]?$/i
const ACM_LINK = /(link|url|href)([-_]?\d+)?\]?$/i

/** The default-locale entries of an EmDash seed, as `{ collection, slug, data }`. */
function seedEntries(/** @type {any} */ seed) {
  const locale = seed?.defaultLocale ?? 'en'
  const out = []
  for (const [collection, rows] of Object.entries(seed?.content ?? {}))
    for (const r of Array.isArray(rows) ? rows : [])
      if ((r?.locale ?? locale) === locale) out.push({ collection, slug: r?.slug, data: r?.data ?? r ?? {} })
  return out
}

/** A list of social profiles: objects with a link field, naming a network by key or by link. */
const isSocialList = (/** @type {unknown} */ v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((x) => x && typeof x === 'object' && !Array.isArray(x)) &&
  v.some((x) => Object.keys(x).some((k) => LINK_KEY.test(k) || /^(network|platform)$/.test(k))) &&
  v.some((x) => NETWORK.test(JSON.stringify(x)) || 'network' in x || 'platform' in x)

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f */
export async function emdashSocialLists(context, f) {
  const files = await templateSourceFiles(context)
  const seed = files.get('seed/seed.json')
  const rules = JSON.parse(files.get('seed/personalize.json') ?? '{}')
  if (!seed) return
  const kept = new Set(
    (rules.identity ?? [])
      .filter((/** @type {any} */ r) => r.from === 'social')
      .map((/** @type {any} */ r) => `${r.collection}.${r.field}`)
  )
  const lists = new Set()
  for (const e of seedEntries(JSON.parse(seed)))
    for (const [field, value] of Object.entries(e.data))
      if (isSocialList(value)) lists.add(`${e.collection}.${field}`)
  const missing = [...lists].filter((l) => !kept.has(l))
  if (missing.length)
    f.problem(
      `social lists with no identity rule from "social" (K6: keep the demo's buttons, empty only their links): ${listed(missing)}`
    )
  const dropping = []
  for (const [file, text] of files) {
    if (!/^src\/.*\.(astro|tsx?)$/.test(file)) continue
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      const at = line.indexOf('.filter(')
      if (at < 0 || !/social/i.test(line)) return
      // The predicate, which may run onto the next line.
      const predicate = `${line.slice(at)} ${lines[i + 1] ?? ''}`.slice(0, 160)
      if (/\burl\b|\bhref\b/.test(predicate) && !/\|\||live\(/.test(predicate))
        dropping.push(`${file}:${i + 1}`)
    })
  }
  if (dropping.length)
    f.problem(
      `views that drop a social item whose link is empty (render it without a link instead): ${listed(dropping)}`
    )
}

/** EmDash: copy rules on a field drawn inside a link, with no sibling link field and no target. */
async function emdashTargets(/** @type {import('../index.js').RuleContext} */ context) {
  const files = await templateSourceFiles(context)
  const rules = JSON.parse(files.get('seed/personalize.json') ?? '{}')
  const seed = files.get('seed/seed.json')
  const entries = seed ? seedEntries(JSON.parse(seed)) : []
  const views = [...files].filter(([n]) => /^src\/.*\.astro$/.test(n))
  const out = []
  for (const rule of rules.copy ?? []) {
    const field = String(rule.field ?? '')
    if (!LABEL_FIELD.test(field) || rule.leadsTo || rule.target) continue
    const line = views
      .flatMap(([n, t]) => t.split('\n').map((l, i) => ({ n, i, l })))
      .find(({ l }) => /<a\b[^>]*\bhref=/.test(l) && (l.includes(`.${field}}`) || l.includes(`("${field}")`)))
    if (!line) continue
    const stem = field.replace(LABEL_FIELD, '')
    const data =
      entries.find((e) => e.collection === rule.collection && (!rule.slug || e.slug === rule.slug))?.data ??
      {}
    if (['url', 'link', 'href'].some((k) => `${stem}_${k}` in data)) continue
    const href = /\bhref=\{([^}]*)\}/.exec(line.l)?.[1] ?? '?'
    out.push(`${rule.collection}.${field} (its link is ${href}, ${line.n}:${line.i + 1})`)
  }
  return out
}

/** WordPress: a text slot on a named button block with no url slot for the same block. */
async function wordpressTargets(/** @type {import('../index.js').RuleContext} */ context) {
  const slots = contractSlots(releaseContract(context))
  if (!slots.length) return []
  const wp = await wordpressDemo(context)
  const buttons = new Set()
  for (const p of wp.posts)
    if (p.post_status === 'publish' && wp.isSource(p))
      for (const t of blocksOf(p.post_content))
        if (t.name === 'core/button' && t.attrs?.metadata?.name) buttons.add(t.attrs.metadata.name)
  const urls = new Set(slots.filter((s) => s.type === 'url').map((s) => `${s.entity} ${s.target?.block}`))
  return slots
    .filter(
      (s) => s.type === 'text' && buttons.has(s.target?.block) && !urls.has(`${s.entity} ${s.target?.block}`)
    )
    .map((s) => s.key)
}

/** Joomla: a text slot on an ACM button label whose link field beside it has no url slot. */
function joomlaTargets(/** @type {import('../index.js').RuleContext} */ context) {
  const contract = releaseContract(context)
  const slots = contractSlots(contract)
  const lock = contract?.json('presentation-lock.json')?.entities ?? {}
  const slotted = new Set(
    slots.filter((s) => s.type === 'url').map((s) => `${s.entity} ${(s.jsonPath ?? []).join('|')}`)
  )
  const out = []
  for (const s of slots) {
    const [group, field, index] = s.jsonPath ?? []
    if (s.type !== 'text' || typeof field !== 'string' || !ACM_LABEL.test(field) || ACM_LINK.test(field))
      continue
    let config
    try {
      config = JSON.parse(JSON.parse(String(lock[s.entity]?.params ?? '{}'))['jatools-config'] ?? 'null')
    } catch {
      continue
    }
    const fields = Object.keys(config?.[group] ?? {}).filter(
      (k) => ACM_LINK.test(k) && !/target|type/i.test(k)
    )
    if (!fields.length) continue
    // The link field with the label's number (`button-2` ↔ `btn-link-2`), else the one sharing the
    // longest start with it (`btn1-label` ↔ `btn1-link`).
    const number = (/** @type {string} */ k) => /(\d+)\D*$/.exec(k)?.[1] ?? ''
    const common = (/** @type {string} */ a) => {
      const n = [...a].findIndex((c, i) => c !== field[i])
      return n < 0 ? a.length : n
    }
    const link = fields.sort(
      (a, b) =>
        Number(number(b) === number(field)) - Number(number(a) === number(field)) || common(b) - common(a)
    )[0]
    // A flat ACM field (`jsonPath` [group, field]) holds one string; a list field holds one per item.
    const stored = config[group][link]
    const value = index === undefined ? stored : stored?.[index]
    if (typeof value !== 'string' || !value.trim()) continue
    const path = index === undefined ? [group, link] : [group, link, index]
    if (!slotted.has(`${s.entity} ${path.join('|')}`)) out.push(`${s.key} (${field}, link ${link})`)
  }
  return out
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f */
export async function labelTargets(context, f) {
  const { platform } = context.release
  const found =
    platform === 'emdash'
      ? await emdashTargets(context)
      : platform === 'wordpress'
        ? await wordpressTargets(context)
        : joomlaTargets(context)
  if (found.length)
    f.problem(
      `label rules without their destination (Tracy rewrites the words of a button without knowing where it goes): ${listed(found, 6)}`
    )
}
