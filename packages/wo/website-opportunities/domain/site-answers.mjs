import { contactOf } from './pinned-copy.mjs'
import { pagePlan } from './page-plan.mjs'
import { showablePeopleOf } from './brief-people.mjs'

// Answers to the deployment's own Site questions (served by GET /api/sites/questions), filled from a
// brief. Only what the brief supports is answered; anything else stays unanswered so the create door
// applies its own default instead of a guess.

const ABOUT_MAX = 300

function sentenceCap(text, max) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')).trim()
}

function aboutOf(brief) {
  const sections = (brief.sitemap ?? []).flatMap((p) => p.sections ?? [])
  const bio = sections
    .flatMap((s) => s.evidence ?? [])
    .find((e) => e.source === 'profile.bio' && e.quote)?.quote
  const hero = sections.find((s) => s.kind === 'hero')?.copy
  // The About line the reading made of quoted words (#1780) comes before the raw bio.
  return sentenceCap(brief.reading?.about || bio || hero || '', ABOUT_MAX)
}

function labelOf(q, id) {
  const l = q.optionLabels?.[id]
  return String((l && typeof l === 'object' ? l.en : l) ?? '').toLowerCase()
}

/** The template's pages as the plan reads them: the question's options, with their English labels. */
function planOf(brief, q, now) {
  const options = Array.isArray(q.options) ? q.options : []
  const menus = (brief.sitemap ?? []).flatMap((p) => p.sections ?? []).filter((s) => s.kind === 'menu')
  const menuLinks = menus.flatMap((s) => (s.evidence ?? []).map((e) => e.url).filter(Boolean))
  const prices = menus.flatMap((s) => s.menuItems ?? []).filter((i) => i?.price).length
  const services = (brief.sitemap ?? [])
    .flatMap((p) => p.sections ?? [])
    .filter((s) => s.kind === 'services')
    .flatMap((s) => s.services ?? []).length
  return pagePlan({
    pages: options.map((id) => ({ id: String(id), label: labelOf(q, id) })),
    locked: Array.isArray(q.locked) ? q.locked : [],
    content: brief.content?.items ?? [],
    facts: {
      images: (brief.assets ?? []).filter((a) => a.kind === 'image').length,
      prices,
      services,
      menuLinks,
      socials: brief.business?.socials ?? {},
      contact: Object.keys(contactOf(brief)).length,
      // The people a team page can show (`brief-people.mjs`): with none, the team page has nothing true to show.
      people: showablePeopleOf(brief).length
    },
    now: now ?? brief.madeAt ?? new Date().toISOString(),
    cms: brief.cms ?? null
  })
}

function toneOf(brief, q) {
  const voice = String(brief.brand?.voice ?? '')
  const options = Array.isArray(q.options) ? q.options : []
  const want = /informal tone/.test(voice) ? 'warm' : /neutral tone/.test(voice) ? 'plain' : null
  return want && options.includes(want) ? want : null
}

/**
 * @param {object} brief a validated brief
 * @param {{questions: any[], set?: {contentHash?: string}}} served the questions door's answer
 * @param {{now?: string}} [at] - when the plan is made: past events and offers are judged against it
 * @returns {{answers: Record<string, string|string[]>, questionnaire: string|null, notes: string[], pagePlan: object|null}}
 */
export function answersFromBrief(brief, served, { now } = {}) {
  let plan = null
  const answers = {}
  const notes = []
  for (const q of served?.questions ?? []) {
    if (q.id === 'name' && q.kind === 'text' && brief.business?.name)
      answers.name = String(brief.business.name).trim()
    else if (q.id === 'about' && q.kind === 'longtext') {
      const about = aboutOf(brief)
      if (about) answers.about = about
    } else if (q.kind === 'multi' && (q.feeds ?? []).includes('site.pages')) {
      plan = planOf(brief, q, now)
      const off = plan.pages.filter((p) => !p.keep)
      // Nothing to take off: no answer, which the create door reads as every page kept.
      if (!off.length) notes.push('pages: every template page is kept')
      else answers[q.id] = plan.keep
      for (const p of off) notes.push(`pages: ${p.id} off — ${p.why}`)
    } else if (q.id === 'tone' && q.kind === 'choice') {
      const tone = toneOf(brief, q)
      if (tone) answers.tone = tone
    } else notes.push(`${q.id}: left to the template default`)
  }
  const hash = served?.set?.contentHash
  return {
    answers,
    questionnaire: typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) ? hash : null,
    notes,
    pagePlan: plan
  }
}

/**
 * The contact facts the create door takes beside the answers (`brief.facts`): phone, email, address and opening hours,
 * each with its source and when the brief was resolved. Only what the brief holds; a fact left out is never a "clear".
 * @param {object} brief a validated brief
 * @returns {Record<string, {value: string, source: string, fetchedAt?: string}>}
 */
export function contactFacts(brief) {
  const at = typeof brief?.madeAt === 'string' ? { fetchedAt: brief.madeAt } : {}
  return Object.fromEntries(
    Object.entries(contactOf(brief)).map(([kind, fact]) => [kind, { ...fact, ...at }])
  )
}
