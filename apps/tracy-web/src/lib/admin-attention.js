/**
 * Admin attention — which quickstarts and demos need an administrator before a customer meets them
 * (04/10/2026; tasks/todo-admin-attention.md). One report per deployment, decided from what
 * THIS deployment holds: its stored releases, its demo sites, its contracts, its picture store and
 * its questionnaires. There is no list written by hand; an item disappears when the thing it names
 * is done.
 *
 * 🔒 EVERY RULE HERE IS SOMEBODY ELSE'S, CALLED — NOT RESTATED. Design inspiration is
 * `inspirationState` (the same cell the Quickstarts screen draws), a contract is `contractFor` (the
 * same lookup the site door seals with), a failed demo's reason is `failureReason` (the same line the
 * Demos screen shows), the questionnaire in use is `questionsInUse` (the same rule the Quickstarts
 * list applies). A second copy of any of them would let this page and the screen it links to
 * disagree, and the page would lose the one thing it is for: being believed.
 *
 * 🔒 CODES AND VALUES, NEVER SENTENCES. Every item is `{ check, severity, params }`; the screen
 * (`packages/web/tracy-harness/src/attention/strings.ts`) words it. The only prose that crosses this
 * door is text another part of the server already wrote (an installer's last line, a release's
 * refusal reason), passed on verbatim in `params` — it is data, like a product name.
 *
 * THREE SEVERITIES, AND ONLY TWO ARE COUNTED (04/10):
 *   - `broken`  — a customer meets something wrong today: a demo that failed to build, a card on
 *                 Design inspiration that cannot be drawn whole, a live demo that never reaches it.
 *   - `missing` — a quickstart offered without a piece it needs: no demo, no contract, no design
 *                 system on its contract, only the CMS's standard questions.
 *   - `hint`    — worth a look, not wrong: a demo behind its release, no card yet.
 * `count` is the number of SUBJECTS (a quickstart, or a demo whose quickstart is gone) with at least
 * one broken or missing item — a quickstart with three problems is one thing to open, not three.
 *
 * Only Tracy's own demo sites are read (04/10) — not the JoomlArt demo server.
 */

import { contractFor } from './contracts.js'
import { failureReason } from './demo-sites.js'
import { inspirationState } from './design-inspiration.js'
import { cardIdOf, platformOfTag } from './quickstart-releases.js'

/** The gaps the Quickstarts column used to call "not on Design inspiration" — now warnings. */
const INCOMPLETE_CODES = new Set([
  'pictures-missing',
  'layouts-without-shots',
  'no-demo',
  'no-category',
  'no-thumbnail',
  'no-blurb'
])

/** @typedef {'broken' | 'missing' | 'hint'} Severity */
/** @typedef {{ check: string, severity: Severity, params: Record<string, unknown> }} Item */

const RANK = { broken: 0, missing: 1, hint: 2 }

/** CMSes whose quickstarts are sealed by a content contract. EmDash builds from its own artifact
 * and personalize files, so "no contract" there is not a gap (measured on develop 04/10). */
const CONTRACT_CMS = new Set(['joomla', 'wordpress'])

/**
 * @param {object} world
 * @param {any[]} world.releases rows of `readReleases`
 * @param {Map<string, any>} world.demos `demoSitesByTag`: demo site + latest job, by tag
 * @param {Map<string, { url: string, version: string }>} world.live `liveDemosByTag`
 * @param {Map<string, Map<string, string>>} world.held `shotFilesFor`: pictures held, by template
 * @param {Map<string, any>} world.contracts `defaultContracts()`
 * @param {Map<string, unknown>} world.questions `questionsInUse().inUse`: the quickstart's OWN set
 *   in use (chosen or released), by tag; absent means the CMS's standard set
 */
export function attentionReport({ releases, demos, live, held, contracts, questions }) {
  /** @type {{ key: string, kind: 'quickstart' | 'demo', label: string, platform: string, version: string | null, demo: string | null, items: Item[] }[]} */
  const subjects = []
  const offered = new Set()

  for (const r of releases) {
    // A local pack is a stand's own experiment, a draft is not published, a design pack is applied
    // on top of a site: none of them is a quickstart a customer can be offered.
    if (r.local || r.kind !== 'quickstart' || r.github === 'draft') continue
    const cms = r.platform ?? platformOfTag(r.tag)
    const demo = demos.get(r.tag) ?? null
    /** @type {Item[]} */
    const items = []
    const add = (check, severity, params = {}) => items.push({ check, severity, params })
    const subject = (label, version) => ({
      key: r.tag,
      kind: /** @type {const} */ ('quickstart'),
      label,
      platform: cms,
      version,
      demo: demo?.label ?? null,
      items
    })

    if (!r.choosable) {
      // Published, yet Tracy cannot read its setting — offered on GitHub, absent from every picker.
      add('unreadable', 'broken', { reason: r.reason ?? null, tracy: r.tracy ?? null })
      subjects.push(subject(r.name ?? r.tag, null))
      continue
    }
    offered.add(r.tag)
    const version = r.setting.version
    const liveDemo = live.get(r.tag) ?? null

    const shown = inspirationState(r, {
      demo: liveDemo,
      // Keyed by the customer card's id (`cardIdOf`), the one its pictures are stored under.
      has: (file) => held.get(cardIdOf(r) ?? '')?.has(file) === true
    })
    // Since 04/10/2026 a card customers see is `on` even when it lacks pictures or a demo — what it
    // lacks moved to `issues`. This report keeps naming the same six gaps it named before, the
    // first one only, so a shown-but-incomplete card is still one "incomplete" line here.
    const gap = shown.issues.find((i) => INCOMPLETE_CODES.has(i.code))
    if (shown.state === 'card') add('inspiration-incomplete', 'broken', { code: shown.code, ...shown.params })
    else if (shown.state === 'on' && gap)
      add('inspiration-incomplete', 'broken', { code: gap.code, ...gap.params })
    else if (shown.state === 'none' && liveDemo) add('not-on-inspiration', 'broken')

    if (demo?.job_state === 'failed')
      add('demo-failed', 'broken', { demo: demo.label, reason: failureReason(demo.job_detail) })
    else if (!demo) add('no-demo', 'missing')

    if (CONTRACT_CMS.has(cms)) {
      const contract = contractFor(contracts, r.tag, version)
      if (contract === null) add('no-contract', 'missing', { version })
      // A quickstart with no contract is not ALSO reported here: one cause, one line.
      else if (!contract.design) add('no-design-system', 'missing', { contract: contract.id ?? null })
    }

    if (!questions.has(r.tag)) add('standard-questions', 'missing', { platform: cms })

    if (shown.state === 'none' && !liveDemo) add('no-card', 'hint')
    if (demo && demo.job_state !== 'failed' && demo.quickstart_version !== version)
      add('demo-behind', 'hint', { demoVersion: demo.quickstart_version ?? null, version })

    if (items.length > 0) subjects.push(subject(r.setting.label ?? r.tag, version))
  }

  // A demo whose quickstart is gone drops off the Demos screen (its list is built FROM the
  // releases), yet the site still answers on its address. Only here can anybody see it.
  for (const [tag, demo] of demos) {
    if (offered.has(tag)) continue
    subjects.push({
      key: demo.label,
      kind: 'demo',
      label: demo.label,
      platform: platformOfTag(tag) ?? 'joomla',
      version: demo.quickstart_version ?? null,
      demo: demo.label,
      items: [{ check: 'demo-orphan', severity: 'broken', params: { demo: demo.label, tag } }]
    })
  }

  for (const s of subjects) s.items.sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const ranked = subjects
    .map((s) => ({ ...s, worst: s.items[0].severity }))
    .sort((a, b) => RANK[a.worst] - RANK[b.worst] || a.key.localeCompare(b.key))

  const counts = { broken: 0, missing: 0, hint: 0 }
  for (const s of ranked) for (const i of s.items) counts[i.severity] += 1
  return {
    count: ranked.filter((s) => s.worst !== 'hint').length,
    counts,
    offered: offered.size,
    subjects: ranked
  }
}

// ── Why the standard questionnaire does not fit (04/10; decision #9: code, not a model) ──

/** Roles nobody asks a customer about: the menu and the search box follow from the rest. */
const SKIP_ROLES = new Set(['navigation', 'search'])

/** Roles the copy stage rewrites from the "about" answer — covered when that question works. */
const WRITTEN_FROM_ABOUT = new Set(['hero', 'about', 'cta'])

/** Capability kinds that are a piece of content on a page (`summarizeForModel`'s own list). */
const BLOCK_KINDS = new Set(['block', 'article', 'menu-item', 'field', 'collection-rewrite', 'form', 'hide'])

/**
 * Why a consumer cannot use an answer on this release, as a code. The sentence beside it in the
 * snapshot (`consumersFor`'s `why`) is English and part of the capability hash, so it is never
 * parsed: the code follows from the consumer and the platform, which is all `consumersFor` decides by.
 */
function deadCode(consumer, platform) {
  if (consumer === 'seed.pages') return platform === 'emdash' ? 'emdash-no-seed' : 'sealed-pages'
  if (consumer === 'site.pages') return 'no-page-list'
  if (consumer === 'site.languages') return platform === 'emdash' ? 'no-personalize' : 'unsealed-languages'
  if (consumer === 'copy.about' || consumer === 'copy.tone') return 'emdash-no-copy'
  if (consumer === 'template') return platform === 'emdash' ? 'no-personalize' : 'no-personalize-map'
  return 'unavailable'
}

/** A question's label as the screen shows it: the set's own Vietnamese, else its English, else its id. */
function labelOf(q) {
  const label = q?.label
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return label.vi ?? label.en ?? q.id
  return q?.id ?? ''
}

/**
 * What a quickstart holds against what the questionnaire in use asks — structure only.
 *
 * @param {object} args
 * @param {string | null} args.platform
 * @param {any} args.snapshot `readCapabilities` of the release, as read now
 * @param {{ name: string, doc: any } | null} args.set the set in use (`candidatesFor().inUse`)
 * @param {boolean} args.hasContract whether `contractFor` seals this version
 * @returns {{ setName: string | null, setSource: string | null,
 *   asked: { id: string, label: string, works: boolean, feeds: string[], dead: { consumer: string | null, code: string } | null }[],
 *   parts: { role: string, blocks: number, pages: number, examples: string[], covered: boolean }[],
 *   limited: null | 'no-contract' | 'identity-only' }}
 */
export function questionnaireAnalysis({ platform, snapshot, set, hasContract }) {
  const consumers = new Map((snapshot?.consumers ?? []).map((c) => [c.id, c.available === true]))
  const asked = (set?.doc?.questions ?? []).map((q) => {
    const feeds = Array.isArray(q.feeds) ? q.feeds : []
    const live = feeds.filter((f) => consumers.get(f) === true)
    const first = feeds.find((f) => consumers.get(f) !== true) ?? null
    return {
      id: q.id,
      label: labelOf(q),
      works: live.length > 0,
      feeds: live,
      dead:
        live.length > 0
          ? null
          : first === null
            ? { consumer: null, code: 'no-feeds' }
            : { consumer: first, code: consumers.has(first) ? deadCode(first, platform) : 'unknown-consumer' }
    }
  })
  const base = { setName: set?.name ?? null, setSource: set?.source ?? null, asked }

  if (CONTRACT_CMS.has(platform ?? '') && !hasContract) return { ...base, parts: [], limited: 'no-contract' }

  const aboutWorks = asked.some((a) => a.feeds.includes('copy.about'))
  const capabilities = snapshot?.capabilities ?? []
  const pagesOf = (role) =>
    capabilities.filter((c) => (c.kind === 'page' || c.kind === 'collection') && c.meaning?.role === role)
      .length
  /** @type {Map<string, { role: string, blocks: number, pages: number, examples: string[], covered: boolean }>} */
  const byRole = new Map()
  for (const c of capabilities) {
    const role = c.meaning?.role
    if (!BLOCK_KINDS.has(c.kind) || typeof role !== 'string' || SKIP_ROLES.has(role)) continue
    const part = byRole.get(role) ?? {
      role,
      blocks: 0,
      pages: pagesOf(role),
      examples: [],
      covered: WRITTEN_FROM_ABOUT.has(role) && aboutWorks
    }
    part.blocks += 1
    if (part.examples.length < 2 && typeof c.label === 'string' && !part.examples.includes(c.label))
      part.examples.push(c.label)
    byRole.set(role, part)
  }
  // A news section is often whole pages of articles and no block at all.
  const newsPages = pagesOf('news')
  if (newsPages > 0 && !byRole.has('news'))
    byRole.set('news', { role: 'news', blocks: 0, pages: newsPages, examples: [], covered: false })

  const parts = [...byRole.values()]
  return { ...base, parts, limited: parts.length === 0 ? 'identity-only' : null }
}
