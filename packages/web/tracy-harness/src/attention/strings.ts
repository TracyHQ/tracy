/**
 * Codes of the Admin attention doors → keys of the `attention` dictionary (`i18n/ns/attention.ts`).
 *
 * The server answers codes and values only (`apps/tracy-web/src/lib/admin-attention.js`); this file
 * is the one place those codes become sentences. Third-party text (an installer's last line, a
 * release's refusal reason, a question's own label) arrives in `params` and is printed verbatim.
 * Every function takes the caller's `t`, so the words follow the language on screen.
 *
 * A LEAF: imports only types and the English source, so the shell reads the rail without the screen.
 */
import type { T } from '../i18n/index.ts'
import type { AttentionKey } from '../i18n/ns/attention.ts'
import type { Analysis, Item, Severity, Subject } from './api'

/** The rail row's words; the shell resolves the key in the language on screen. */
export const RAIL_KEY = 'attention.rail' satisfies AttentionKey

export const CMS_LABEL: Record<string, string> = {
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
}

export const severityLabel = (severity: Severity, t: T) => t(`attention.severity.${severity}`)

/** One title per check, and the screen that fixes it. */
const CHECKS: Record<string, { title: AttentionKey; fix: 'demo' | 'quickstart' }> = {
  'demo-failed': { title: 'attention.check.demoFailed', fix: 'demo' },
  'not-on-inspiration': { title: 'attention.check.notOnInspiration', fix: 'quickstart' },
  'inspiration-incomplete': { title: 'attention.check.inspirationIncomplete', fix: 'quickstart' },
  'demo-orphan': { title: 'attention.check.demoOrphan', fix: 'demo' },
  unreadable: { title: 'attention.check.unreadable', fix: 'quickstart' },
  'no-demo': { title: 'attention.check.noDemo', fix: 'demo' },
  'no-contract': { title: 'attention.check.noContract', fix: 'quickstart' },
  'no-design-system': { title: 'attention.check.noDesignSystem', fix: 'quickstart' },
  'standard-questions': { title: 'attention.check.standardQuestions', fix: 'quickstart' },
  'demo-behind': { title: 'attention.check.demoBehind', fix: 'demo' },
  'no-card': { title: 'attention.check.noCard', fix: 'quickstart' }
}
export const knownCheck = (check: string) => Object.hasOwn(CHECKS, check)
/** The screen that fixes a check; an unknown check is fixed on its Quickstart. */
export const fixOf = (check: string) => (knownCheck(check) ? CHECKS[check].fix : 'quickstart')
/** A check's title; an unknown code shows as itself, never a guessed sentence. */
export const titleOf = (check: string, t: T) => (knownCheck(check) ? t(CHECKS[check].title) : check)
export const seeInLabel = (check: string, t: T) =>
  t(fixOf(check) === 'demo' ? 'attention.seeIn.demo' : 'attention.seeIn.quickstart')

export type AreaId = 'quickstarts' | 'demos' | 'inspiration' | 'contracts' | 'design' | 'questions'

/** The left column (Brian, 04/10): one area per kind of issue; `checks: null` is every issue. */
export const AREAS: { id: AreaId; checks: string[] | null }[] = [
  { id: 'quickstarts', checks: null },
  { id: 'demos', checks: ['demo-failed', 'demo-orphan', 'no-demo', 'demo-behind'] },
  { id: 'inspiration', checks: ['not-on-inspiration', 'inspiration-incomplete', 'no-card'] },
  { id: 'contracts', checks: ['no-contract'] },
  { id: 'design', checks: ['no-design-system'] },
  { id: 'questions', checks: ['standard-questions'] }
]
export const areaLabel = (id: AreaId, t: T) => t(`attention.area.${id}.label`)
export const areaBlurb = (id: AreaId, t: T) => t(`attention.area.${id}.blurb`)

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const INSPIRATION: Record<string, AttentionKey> = {
  unpublished: 'attention.inspiration.unpublished',
  'no-template': 'attention.inspiration.noTemplate',
  'no-demo': 'attention.inspiration.noDemo',
  'no-category': 'attention.inspiration.noCategory',
  'no-thumbnail': 'attention.inspiration.noThumbnail',
  'no-blurb': 'attention.inspiration.noBlurb'
}

/** The design inspiration reason, from `inspirationState`'s code. */
function inspirationWhy(p: Record<string, unknown>, t: T): string | null {
  if (p.code === 'pictures-missing') {
    const files = Array.isArray(p.files) ? p.files.filter((f): f is string => typeof f === 'string') : []
    const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? ', …' : '')
    return t('attention.inspiration.picturesMissing', {
      missing: num(p.missing) ?? files.length,
      total: num(p.total) ?? '?',
      files: shown
    })
  }
  if (p.code === 'layouts-without-shots')
    return t('attention.inspiration.layoutsWithoutShots', { layouts: num(p.layouts) ?? '?' })
  return typeof p.code === 'string' && Object.hasOwn(INSPIRATION, p.code) ? t(INSPIRATION[p.code]) : null
}

/** The reason line under an item, from its code and values. */
export function whyOf(item: Item, subject: Subject, t: T): string | null {
  const p = item.params ?? {}
  switch (item.check) {
    case 'unreadable': {
      const reason = text(p.reason)
      return reason ? t('attention.why.unreadable', { reason }) : null
    }
    case 'demo-failed':
      return text(p.reason)
    case 'not-on-inspiration':
      return t('attention.why.notOnInspiration')
    case 'inspiration-incomplete':
      return inspirationWhy(p, t)
    case 'demo-orphan':
      return t('attention.why.demoOrphan', { demo: text(p.demo) ?? subject.key, tag: text(p.tag) ?? '?' })
    case 'no-contract':
      return t('attention.why.noContract', {
        key: subject.key,
        version: text(p.version) ?? subject.version ?? '?'
      })
    case 'no-design-system': {
      const contract = text(p.contract)
      if (!contract) return null
      return t('attention.why.noDesignSystem', { contract, version: contract.split('/').at(-1) ?? '' })
    }
    case 'demo-behind':
      return t('attention.why.demoBehind', {
        demoVersion: text(p.demoVersion) ?? '?',
        version: text(p.version) ?? '?'
      })
    default:
      return null
  }
}

// ── Questionnaire analysis ─────────────────────────────────────────────────────────────────────

/** Content roles, and whether a questionnaire of its own should ask about each (`.ask` key). */
const ROLE: Record<string, { name: AttentionKey; ask?: AttentionKey }> = {
  services: { name: 'attention.role.services', ask: 'attention.role.services.ask' },
  pricing: { name: 'attention.role.pricing', ask: 'attention.role.pricing.ask' },
  team: { name: 'attention.role.team', ask: 'attention.role.team.ask' },
  testimonials: { name: 'attention.role.testimonials', ask: 'attention.role.testimonials.ask' },
  projects: { name: 'attention.role.projects', ask: 'attention.role.projects.ask' },
  contact: { name: 'attention.role.contact', ask: 'attention.role.contact.ask' },
  gallery: { name: 'attention.role.gallery', ask: 'attention.role.gallery.ask' },
  faq: { name: 'attention.role.faq', ask: 'attention.role.faq.ask' },
  news: { name: 'attention.role.news', ask: 'attention.role.news.ask' },
  events: { name: 'attention.role.events', ask: 'attention.role.events.ask' },
  hero: { name: 'attention.role.hero' },
  about: { name: 'attention.role.about' },
  cta: { name: 'attention.role.cta' }
}
export const roleName = (role: string, t: T) => (Object.hasOwn(ROLE, role) ? t(ROLE[role].name) : role)

const FEED: Record<string, AttentionKey> = {
  'site.name': 'attention.feed.siteName',
  'copy.about': 'attention.feed.copyAbout',
  'copy.tone': 'attention.feed.copyTone',
  'site.languages': 'attention.feed.siteLanguages',
  'seed.pages': 'attention.feed.seedPages',
  template: 'attention.feed.template'
}
/** What a working question fills, in words; `agent` alone is said separately. */
export const feedsText = (feeds: string[], t: T) =>
  feeds
    .filter((f) => f !== 'agent')
    .map((f) => (Object.hasOwn(FEED, f) ? t(FEED[f]) : f))
    .join(', ')

/** Why a consumer cannot use an answer on this release, from the server's code. */
const DEAD: Record<string, AttentionKey> = {
  'sealed-pages': 'attention.dead.sealedPages',
  'unsealed-languages': 'attention.dead.unsealedLanguages',
  'emdash-no-copy': 'attention.dead.emdashNoCopy',
  'no-page-list': 'attention.dead.noPageList',
  'emdash-no-seed': 'attention.dead.emdashNoSeed',
  'no-personalize': 'attention.dead.noPersonalize',
  'no-personalize-map': 'attention.dead.noPersonalizeMap',
  'no-feeds': 'attention.dead.noFeeds',
  'unknown-consumer': 'attention.dead.unavailable',
  unavailable: 'attention.dead.unavailable'
}
const deadWhy = (code: string, t: T) => t(Object.hasOwn(DEAD, code) ? DEAD[code] : DEAD.unavailable)

/** The four sections' sentences, from the server's structure. */
export function analysisText(
  a: Analysis,
  tag: string,
  t: T
): { limited: string | null; problems: string[]; suggestions: string[] } {
  const dead = a.asked.filter((q) => !q.works)
  const deadLines = dead.map((q) =>
    t('attention.analysis.deadQuestion', { label: q.label, why: deadWhy(q.dead?.code ?? 'unavailable', t) })
  )
  const dropLines = dead.map((q) => t('attention.analysis.dropQuestion', { label: q.label }))
  if (a.limited === 'no-contract')
    return {
      limited: t('attention.analysis.noContract.limited'),
      problems: deadLines,
      suggestions: [t('attention.analysis.noContract.suggestion')]
    }
  if (a.limited === 'identity-only')
    return {
      limited: t('attention.analysis.identityOnly.limited'),
      problems: deadLines,
      suggestions: [
        t('attention.analysis.identityOnly.contentMap'),
        t('attention.analysis.identityOnly.thenAsk')
      ]
    }
  const gaps = a.parts.filter((p) => !p.covered)
  const problems: string[] = []
  const suggestions: string[] = []
  if (gaps.length > 0) {
    const blocks = gaps.reduce((n, g) => n + g.blocks, 0)
    const newsPages = gaps.filter((g) => g.blocks === 0).reduce((n, g) => n + g.pages, 0)
    const places = [
      blocks > 0 ? t('attention.analysis.blocks', { count: blocks }) : null,
      newsPages > 0 ? t('attention.analysis.newsPages', { count: newsPages }) : null
    ].filter((s): s is string => s !== null)
    const where =
      places.length === 2
        ? t('attention.analysis.and', { first: places[0], second: places[1] })
        : places.join('')
    problems.push(
      t('attention.analysis.gaps', {
        parts: gaps.map((g) => roleName(g.role, t)).join(', '),
        template: tag.split('/').at(-2) ?? tag,
        where
      })
    )
    if (gaps.some((g) => g.role === 'contact')) problems.push(t('attention.analysis.contactGap'))
  }
  problems.push(...deadLines)
  for (const g of gaps) {
    const ask = Object.hasOwn(ROLE, g.role) ? ROLE[g.role].ask : undefined
    if (ask) suggestions.push(t('attention.analysis.suggestRole', { role: roleName(g.role, t), ask: t(ask) }))
  }
  suggestions.push(...dropLines)
  return { limited: null, problems, suggestions }
}
