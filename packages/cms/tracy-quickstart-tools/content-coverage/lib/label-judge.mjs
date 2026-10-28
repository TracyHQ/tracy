// The LLM label judge of the content coverage audit (ADR 0040, spec #37): once per component, a vision model looks at
// the component's crop with its numbered slots and its slot table and says whether each slot's role is right, with a
// suggested role from the version 3 vocabulary when it is not. It is there for the two errors the mechanical rules
// (`label-rules.mjs`) cannot catch: a fact slot labelled editorial, and a claim (a number, an award) inside text
// labelled editorial. The verdicts go into the committed `content-coverage.json` as `labelJudge`; the Road to live step
// reads them there and never calls a model.
//
// Same pattern as the demo look judge (`apps/tracy-web/src/opportunities-build/demo-look.js`): bounded cost (a call
// cap and a cents cap, each call reserving its ceiling first), answers held to a closed shape, a verdict cached per
// slot content hash (with the prompt version) so only what changed is judged again, and NO MODEL, NO CLAIM: a slot the
// model did not judge is `not judged`, never right.
import { createHash } from 'node:crypto'

import {
  ARTICLE_ROLES,
  ROLE_VOCABULARY_V3,
  isFactRole,
  isRole
} from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { locate } from './verify/locate.mjs'

/** The prompt and block version: a cached verdict from another version is never reused. */
export const LABEL_JUDGE_VERSION = 'label-judge/1'
/** Default bounds of one audit run. */
export const JUDGE_LIMITS = Object.freeze({ maxCalls: 150, maxCents: 300 })
/** Pixels of page kept around a component's slots in its crop, so the model sees where it sits. */
export const JUDGE_MARGIN = 48
const JUDGED_TYPES = new Set(['text', 'html', 'image'])
const ARTICLE = new Set(ARTICLE_ROLES)
const SAMPLE_MAX = 300

/** The group a role belongs to: a fact about the business, a sample article's own content, or page copy. */
export const roleGroupOf = (role) => (isFactRole(role) ? 'fact' : ARTICLE.has(role) ? 'article' : 'editorial')

/** What a verdict is about: the slot as the model saw it. A change to any of these asks again. */
export function slotHash(slot) {
  const seen = [
    LABEL_JUDGE_VERSION,
    slot.key,
    slot.type,
    String(slot.sample ?? ''),
    slot.role ?? null,
    slot.group?.id ?? null,
    slot.group?.kind ?? null,
    slot.fit?.kind ?? null
  ]
  return createHash('sha256').update(JSON.stringify(seen)).digest('hex').slice(0, 16)
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)

/** The title of a component: its entity's own title, else its first title slot. */
function titleOf(component, entities) {
  const own = entities.get(component.entity)?.identity?.title
  if (typeof own === 'string' && own.trim()) return own.trim()
  return String(component.rows.find((r) => r.slot.column === 'title')?.slot.sample ?? component.entity)
}

/** What the model is shown for one component, beside its crop. */
function unitOf(component, { pages, entities, onPage }) {
  const page = pages.find((p) => p.n === component.page)
  const identity = entities.get(component.entity)?.identity ?? {}
  const i = onPage.indexOf(component)
  return {
    id: component.id,
    page: { title: String(page?.title ?? ''), url: String(page?.url ?? '') },
    module: {
      entity: component.entity,
      title: titleOf(component, entities),
      position: typeof identity.position === 'string' ? identity.position : null
    },
    neighbours: [onPage[i - 1], onPage[i + 1]].filter(Boolean).map((c) => titleOf(c, entities)),
    slots: component.rows.map((r) => ({
      n: r.n,
      key: r.slot.key,
      sample: cut(String(r.slot.sample ?? ''), SAMPLE_MAX),
      role: r.slot.role ?? null,
      group: r.slot.group?.id ?? null,
      fit: r.slot.fit?.kind ?? null
    }))
  }
}

/** One answered slot held to the closed shape; null when it cannot be taken. */
function heldVerdict(answer, slot) {
  const hash = slotHash(slot)
  if (answer?.verdict === 'right') return { key: slot.key, hash, verdict: 'right' }
  if (answer?.verdict !== 'wrong') return null
  const suggested = answer.suggestedRole
  if (suggested === slot.role) return { key: slot.key, hash, verdict: 'right' }
  if (!isRole(suggested, ROLE_VOCABULARY_V3)) return null
  const from = roleGroupOf(slot.role)
  const to = roleGroupOf(suggested)
  return {
    key: slot.key,
    hash,
    verdict: 'wrong',
    role: slot.role ?? null,
    suggested,
    groupWrong: from !== to && (from === 'fact' || to === 'fact'),
    why: cut(typeof answer.why === 'string' ? answer.why.trim() : '', 200)
  }
}

/**
 * @param {{
 *   map: any, findings: any, mods?: any, previous?: any,
 *   ask: null | { model: string, ceilingCents: number, judge: (unit: any) => Promise<{ slots: any[], cents?: number }> },
 *   crop: (components: any[], options: { margin: number }) => Promise<Map<string, string>>,
 *   limits?: { maxCalls: number, maxCents: number }, unavailable?: string
 * }} input
 *   `ask` null: no model (`unavailable` names why, default NO_VISION_MODEL); `crop` returns each component's image
 */
export async function judgeLabels({
  map,
  findings,
  mods = {},
  previous = null,
  ask,
  crop,
  limits = JUDGE_LIMITS,
  unavailable = 'NO_VISION_MODEL'
}) {
  const applies = map.roleVocabularyVersion === ROLE_VOCABULARY_V3
  const model = locate({ map, findings, isFactRole, mods })
  const eligible = (s) => JUDGED_TYPES.has(s.type)
  for (const c of model.components) c.rows = c.rows.filter((r) => eligible(r.slot))
  const components = model.components.filter((c) => c.rows.length > 0)
  const located = components.flatMap((c) => c.rows.map((r) => r.slot))
  const total = map.slots.filter(eligible).length

  const cache = new Map()
  const prior = previous?.labelJudge
  if (prior?.version === LABEL_JUDGE_VERSION && Array.isArray(prior.slots))
    for (const v of prior.slots) cache.set(v.key, v)
  const cached = (slot) => (cache.get(slot.key)?.hash === slotHash(slot) ? cache.get(slot.key) : null)

  const verdicts = new Map()
  const need = []
  for (const c of components) {
    const hits = c.rows.map((r) => cached(r.slot))
    if (hits.every(Boolean)) for (const v of hits) verdicts.set(v.key, v)
    else need.push(c)
  }

  let reason = null
  let calls = 0
  let cents = 0
  if (need.length > 0 && !applies) reason = 'VOCABULARY_NOT_V3'
  else if (need.length > 0 && !ask) reason = unavailable
  else if (need.length > 0) {
    const ceiling = Math.max(0, Number(ask.ceilingCents) || 0)
    const affordable = ceiling > 0 ? Math.floor(limits.maxCents / ceiling) : Number.POSITIVE_INFINITY
    const planned = need.slice(0, Math.max(0, Math.min(limits.maxCalls, affordable)))
    if (planned.length < need.length) reason = 'BUDGET_EXCEEDED'
    const images = planned.length ? await crop(planned, { margin: JUDGE_MARGIN }) : new Map()
    const byPage = (n) => components.filter((c) => c.page === n).sort((a, b) => a.top - b.top)
    const context = { pages: model.pages, entities: new Map((map.entities ?? []).map((e) => [e.key, e])) }
    for (const c of planned) {
      if (calls >= limits.maxCalls || cents + ceiling > limits.maxCents) {
        reason = 'BUDGET_EXCEEDED'
        break
      }
      const image = images.get(c.id)
      if (!image) {
        reason ??= 'NO_CROP'
        continue
      }
      let answer
      try {
        calls += 1
        answer = await ask.judge({ ...unitOf(c, { ...context, onPage: byPage(c.page) }), image })
        cents += Number.isFinite(answer?.cents) ? answer.cents : ceiling
      } catch {
        cents += ceiling
        reason ??= 'VISION_FAILED'
        continue
      }
      const byN = new Map((Array.isArray(answer?.slots) ? answer.slots : []).map((a) => [a?.n, a]))
      for (const r of c.rows) {
        const v = heldVerdict(byN.get(r.n), r.slot)
        if (v) verdicts.set(v.key, v)
        else reason ??= 'ANSWER_UNREADABLE'
      }
    }
  }

  const slots = [...verdicts.values()].sort((a, b) => a.key.localeCompare(b.key))
  const wrong = slots.filter((v) => v.verdict === 'wrong')
  const judged = slots.length
  const state =
    located.length === 0
      ? total > 0
        ? 'not-judged'
        : 'judged'
      : judged === 0
        ? 'not-judged'
        : judged < located.length
          ? 'partly'
          : 'judged'
  return {
    version: LABEL_JUDGE_VERSION,
    roleVocabularyVersion: map.roleVocabularyVersion ?? null,
    applies,
    model: ask?.model ?? null,
    state,
    reason: state === 'judged' ? null : (reason ?? 'NOTHING_LOCATED'),
    calls,
    cents,
    counts: {
      slots: total,
      located: located.length,
      notLocated: total - located.length,
      judged,
      notJudged: located.length - judged,
      right: judged - wrong.length,
      wrongGroup: wrong.filter((v) => v.groupWrong).length,
      mismatch: wrong.filter((v) => !v.groupWrong).length
    },
    slots
  }
}
