// Opportunity score, spec-wo-find-v2 §4: web 40 · demand 30 · marketing 20 · contact 10; chains and closed places halved.
/**
 * Scoring rules: the opportunity score (0–100, grade A from 75, B from 50, else C) is the sum of what each rule gives,
 * then halved once for a chain and once for a closed place. A rule is one module whose default export is a
 * plain object of the shape below; `scoringRules` checks it when it is used. This module and the rules in
 * `scoring/` are pure and import nothing outside `domain/`: the browser client scores with them too.
 *
 * A rule:
 *   id         kebab-case, unique among the rules in use
 *   weight     the most points it can give; more is cut to `weight`, less than 0 to 0
 *   holdsScore optional; true when the score is `pending` while this rule answers `points: null`
 *   score(evidence) → { points: number | null, reason: string, params?: object } | null
 *     `null` = the rule does not apply to this place and adds no reason. `points: null` = the data it needs is
 *     still being checked (the client shows a spinner); `0` = checked, no points. `reason` is the translation key
 *     the client shows. Pure: no clock, no network, no randomness beyond `evidence`.
 *
 * Evidence: { candidate, siteCheck, social, slowSiteThreshold, now }; `now` is a Date, `slowSiteThreshold` is a
 * number (50 unless the operator set another).
 */
import noWebsite from './scoring/no-website.mjs'
import websiteHealth from './scoring/website-health.mjs'
import demand from './scoring/demand.mjs'
import marketing from './scoring/marketing.mjs'
import contact from './scoring/contact.mjs'
import { isListingUrl } from './link-kinds.mjs'

const GRADE_A = 75
const GRADE_B = 50
const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
// Not rules: they scale the sum, so they run after every rule.
const HALVINGS = [
  ['chain.penalty', (candidate) => candidate.chain === true],
  ['closed.penalty', (candidate) => candidate.temporarilyClosed === true]
]

/** A checked, frozen rule; a TypeError names what is wrong. */
export function defineScoringRule(rule) {
  if (!rule || typeof rule !== 'object') throw new TypeError('a scoring rule is an object')
  if (typeof rule.id !== 'string' || !ID.test(rule.id))
    throw new TypeError(`scoring rule id must be kebab-case: ${String(rule.id)}`)
  if (!Number.isFinite(rule.weight) || rule.weight <= 0)
    throw new TypeError(`scoring rule ${rule.id}: weight must be a positive number`)
  if (typeof rule.score !== 'function')
    throw new TypeError(`scoring rule ${rule.id}: score(evidence) is missing`)
  return Object.freeze({
    id: rule.id,
    weight: rule.weight,
    holdsScore: rule.holdsScore === true,
    score: rule.score
  })
}

/** The rules the score is made of, in the order their reasons are listed. */
export const BUILT_IN_SCORING_RULES = scoringRules([noWebsite, websiteHealth, demand, marketing, contact])

/** The rules checked as one set: each defined, no id twice. */
export function scoringRules(rules = BUILT_IN_SCORING_RULES) {
  const seen = new Set()
  return Object.freeze(
    rules.map((r) => {
      const rule = defineScoringRule(r)
      if (seen.has(rule.id)) throw new TypeError(`scoring rule ${rule.id} is listed twice`)
      seen.add(rule.id)
      return rule
    })
  )
}

const clamp = (points, weight) => (points === null ? null : Math.min(weight, Math.max(0, points)))

/**
 * {score, grade, pending, reasons [[key, points|null, params?]]} of one place under `rules` (already checked by
 * `scoringRules`). Same input shape as `scoreOpportunity`.
 */
export function scoreWithRules(
  rules,
  { candidate = {}, siteCheck = null, social = null, slowSiteThreshold = 50, now = new Date() } = {}
) {
  // A listing site's page recorded as the website (magicpin, Tripadvisor…) is no website of the business: every
  // rule sees a place without one, and nothing of that page's check is scored.
  const listed = isListingUrl(candidate?.website)
  const evidence = {
    candidate: listed ? { ...candidate, website: undefined } : candidate,
    siteCheck: listed ? null : siteCheck,
    social,
    slowSiteThreshold: Number.isFinite(slowSiteThreshold) ? slowSiteThreshold : 50,
    now
  }
  const reasons = []
  let pending = false
  for (const rule of rules) {
    const answer = rule.score(evidence)
    if (answer === null || answer === undefined) continue
    const points = answer.points === null ? null : Number(answer.points)
    if (points !== null && !Number.isFinite(points))
      throw new TypeError(`scoring rule ${rule.id} answered non-numeric points`)
    if (points === null && rule.holdsScore) pending = true
    const kept = clamp(points, rule.weight)
    reasons.push(answer.params === undefined ? [answer.reason, kept] : [answer.reason, kept, answer.params])
  }
  let score = reasons.reduce((sum, [, points]) => sum + (points ?? 0), 0)
  for (const [key, applies] of HALVINGS) {
    if (!applies(candidate)) continue
    const halved = Math.round(score / 2)
    reasons.push([key, halved - score])
    score = halved
  }
  const grade = score >= GRADE_A ? 'A' : score >= GRADE_B ? 'B' : 'C'
  return { score, grade, pending, reasons }
}

/**
 * Pure: {score 0–100, grade A|B|C, pending (a part is still being checked), reasons [[key, points|null, params?]]}.
 * `status` (new|seen|researched|demo) is accepted for the caller's convenience and does not move the score.
 */
export function scoreOpportunity({
  candidate = {},
  siteCheck = null,
  social = null,
  status = 'new',
  slowSiteThreshold = 50,
  now = new Date()
} = {}) {
  void status
  return scoreWithRules(BUILT_IN_SCORING_RULES, { candidate, siteCheck, social, slowSiteThreshold, now })
}
