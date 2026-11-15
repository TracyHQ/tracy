/**
 * The build chat's plan card and plan review bar as data (TracyHQ/tracy#606).
 *
 * `planCardOf` reads a Contract B plan (`tracy-build-plan/v1`) into what the card shows: business facts with their
 * source, the look section, services, pages and the data each block will hold, the pictures summary, assumptions and
 * what was left out. A fact the sources disagree on (an assumption with `alternatives` on `facts[<id>].value`) carries
 * its values as a choice, the website's first. The plan carries no written copy, and neither does the card.
 *
 * `planEditOf` turns a change into the structured plan edit (`tracy-build-plan-edit/v1`) the chat sends; the card then
 * follows the plan tracy-web answers with. `planChangeOf` reads an in place editor's text into one change, and
 * `changedFieldsOf` reads from the draft which values were just changed (#607). `planReviewRequestOf` is the one request dsh's plan review bar
 * (ui-user-questions PlanReviewPanel) draws, and `approvalOf` reads its answer. Pure: no React, no DOM, no dsh import.
 */
import { BUILD_CHAT_STRINGS } from './conversation.mjs'
import { plainTextOf as text } from './plain-text.mjs'

const PLAN_EDIT_SCHEMA = 'tracy-build-plan-edit/v1'
/** The id of the plan review request: the one question the tool's guard admits beside the engine's own. */
export const PLAN_REVIEW_ID = 'plan-review'
const REVIEW_ID = PLAN_REVIEW_ID

/** Translate with the English source; a plugin passes its bound locale instead. */
const english = (key, vars = {}) =>
  BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))

const firstSource = (sources) => text(sources?.[0]?.name ?? '')
/** The origin code of the first source (`website`, `google`, `social`, `answer`), for the card's own words; null if none. */
const firstSourceKind = (sources) => (typeof sources?.[0]?.kind === 'string' ? sources[0].kind : null)
const isWebsite = (alternative) => (alternative.sources ?? []).some((s) => s.kind === 'website')

/** The values of a disputed fact, the website's first, the current value selected. */
function choiceOf(fact, assumption) {
  const ordered = [...assumption.alternatives].sort((a, b) => Number(isWebsite(b)) - Number(isWebsite(a)))
  return {
    field: assumption.field,
    said: text(assumption.said),
    // `value` is what a pick sends, exactly as the plan holds it; `text` is how it reads on the card.
    options: ordered.map((a) => ({
      value: a.value,
      text: text(a.value),
      source: firstSource(a.sources),
      sourceKind: firstSourceKind(a.sources),
      selected: a.value === fact.value
    }))
  }
}

/** What one block will hold: the services list when it shows every service, else its facts and item counts. */
function holdsOf(block, plan, serviceIds) {
  const data = block.data ?? []
  if (
    serviceIds.length > 0 &&
    data.length === serviceIds.length &&
    serviceIds.every((id) => data.includes(id))
  )
    return { services: serviceIds.map((id) => text(plan.items.find((i) => i.id === id).label)) }
  const facts = []
  /** The data kind of each fact in `facts`, in the same order, so the card can say its label in its own words. */
  const factKinds = []
  const counts = []
  for (const id of data) {
    const fact = plan.facts.find((f) => f.id === id)
    if (fact) {
      facts.push(text(fact.label))
      factKinds.push(typeof fact.kind === 'string' ? fact.kind : null)
      continue
    }
    const item = plan.items.find((i) => i.id === id)
    if (!item) continue
    const n = item.count ?? 1
    const seen = counts.find((c) => c.kind === item.kind)
    if (seen) seen.count += n
    else counts.push({ kind: item.kind, count: n })
  }
  return { facts, factKinds, counts }
}

const MAX_LIST_DEPTH = 3

/**
 * The child lists of one block as the card shows them: each list headed by its item's label (a list of the block itself has no heading; the list's technical `name` is
 * never shown, and the plan has no owner readable list label yet), each row by
 * the label of the row it names, the value of the fact it names or the name of the page it names. A row that names
 * nothing the plan holds is left out (never invented), and a list with no rows is not shown. Rows keep the plan's
 * order; nested lists follow their row, at most three levels deep.
 */
function listsOf(lists, plan, depth = 1) {
  if (!Array.isArray(lists) || depth > MAX_LIST_DEPTH) return []
  const out = []
  for (const list of lists) {
    const rows = []
    for (const row of list.rows ?? []) {
      const label = rowLabelOf(row, plan)
      if (label === null) continue
      const nested = listsOf(row.lists, plan, depth + 1)
      rows.push(nested.length > 0 ? { label, lists: nested } : { label })
    }
    if (rows.length === 0) continue
    const item = list.item ? plan.items.find((i) => i.id === list.item) : null
    out.push(item ? { head: text(item.label), rows } : { rows })
  }
  return out
}

/** What a planned row reads as: a row's label, a fact's value, an item's label or a page's name; null if unknown. */
function rowLabelOf(row, plan) {
  if (row.page !== undefined) return text(plan.pages.find((p) => p.id === row.page)?.name ?? null)
  const id = row.data
  const found =
    (plan.rows ?? []).find((r) => r.id === id)?.label ??
    plan.facts.find((f) => f.id === id)?.value ??
    plan.items.find((i) => i.id === id)?.label
  return text(found ?? null)
}

/**
 * A left out label in plain words. The engine may name a page by its slug ("news-post page"): hyphens between letters
 * become spaces and the first letter is upper case ("News post page"). A proper owner readable label should come from
 * the contract; until it carries one, no slug reaches the card.
 * @param {string} what
 */
function plainWordsOf(what) {
  const text = String(what ?? '').replace(/(\p{L})-(?=\p{L})/gu, '$1 ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "photos" for "Photo": the plural of a one word label, the first letter lower case unless it is an acronym. */
function pluralOf(word) {
  const lower = /^\p{Lu}\p{Lu}/u.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1)
  if (/(s|x|z|ch|sh)$/i.test(lower)) return `${lower}es`
  if (/[^aeiou]y$/i.test(lower)) return `${lower.slice(0, -1)}ies`
  return `${lower}s`
}

/**
 * What was left out, one line per distinct thing and reason, in plan order: 37 photos left out for the same reason
 * are one line, "37 photos", with `count`. A label of several words is not made plural by guesswork; it takes its
 * count after it, "Video in the top banner (2)". A plural label should come from the contract.
 * @param {any[]} leftOut
 */
function leftOutOf(leftOut) {
  const lines = []
  const byKey = new Map()
  for (const l of leftOut ?? []) {
    const what = plainWordsOf(text(l.what))
    const reason = text(l.reason)
    const key = JSON.stringify([what, l.kind, reason])
    const seen = byKey.get(key)
    if (seen) seen.count += 1
    else {
      const line = { what, kind: l.kind, reason, count: 1 }
      byKey.set(key, line)
      lines.push(line)
    }
  }
  return lines.map(({ count, ...line }) => {
    if (count === 1) return line
    const what = /\s/.test(line.what) ? `${line.what} (${count})` : `${count} ${pluralOf(line.what)}`
    return { ...line, what, count }
  })
}

const listOr = (value) => (Array.isArray(value) ? value : [])

/**
 * A plan with every part the card reads present: a draft stored under an earlier plan shape (no pictures, no logo, a
 * page without blocks) reads its missing parts as empty, so the card and the review bar still draw.
 * @param {any} plan
 */
function wholePlanOf(plan) {
  const look = plan?.look ?? {}
  const pictures = plan?.pictures ?? {}
  return {
    ...plan,
    facts: listOr(plan?.facts),
    items: listOr(plan?.items),
    pages: listOr(plan?.pages).map((p) => ({ ...p, blocks: listOr(p?.blocks) })),
    look: { ...look, template: look.template ?? {}, logo: look.logo ?? {} },
    pictures: {
      own: { frames: 0, ...pictures.own },
      generated: { frames: 0, ...pictures.generated }
    }
  }
}

/**
 * The plan card's content.
 * @param {any} contractPlan - a Contract B plan
 */
export function planCardOf(contractPlan) {
  const plan = wholePlanOf(contractPlan)
  const disputed = new Map(
    (plan.assumptions ?? [])
      .filter((a) => Array.isArray(a.alternatives) && /^facts\[[^\]]+\]\.value$/.test(a.field))
      .map((a) => [a.field, a])
  )
  const services = plan.items.filter((i) => i.kind === 'service')
  const serviceIds = services.map((s) => s.id)
  const name = text(plan.facts.find((f) => f.kind === 'business.name')?.value ?? '')
  return {
    planId: plan.id,
    revision: plan.revision,
    name,
    facts: plan.facts.map((f) => {
      const field = `facts[${f.id}].value`
      const assumption = disputed.get(field)
      return {
        id: f.id,
        field,
        // The data kind (`business.name`) and the source's origin code: the card says both in its own words.
        kind: typeof f.kind === 'string' ? f.kind : null,
        label: text(f.label),
        value: text(f.value),
        source: firstSource(f.sources),
        sourceKind: firstSourceKind(f.sources),
        choice: assumption ? choiceOf(f, assumption) : null
      }
    }),
    language: plan.language,
    look: {
      template: typeof plan.look.template.name === 'string' ? plan.look.template.name : '',
      accent: plan.look.accent,
      // The dark theme's accent when it differs from the light one (#616); shown, not offered for editing yet.
      accentDark: typeof plan.look.accentDark === 'string' ? plan.look.accentDark : null,
      logo:
        plan.look.logo.kind === 'own'
          ? { kind: 'own', source: plan.look.logo.source }
          : { kind: plan.look.logo.kind ?? null }
    },
    services: services.map((s) => ({
      id: s.id,
      field: `items[${s.id}].label`,
      label: text(s.label),
      source: firstSource(s.sources),
      sourceKind: firstSourceKind(s.sources)
    })),
    pages: plan.pages.map((p) => ({
      id: p.id,
      name: text(p.name),
      blocks: p.blocks.map((b) => {
        const lists = listsOf(b.lists, plan)
        return {
          id: b.id,
          label: text(b.label),
          reason: text(b.reason),
          holds: holdsOf(b, plan, serviceIds),
          ...(lists.length > 0 ? { lists } : {})
        }
      })
    })),
    pictures: {
      own: { frames: plan.pictures.own.frames, from: [...(plan.pictures.own.from ?? [])] },
      generated: {
        frames: plan.pictures.generated.frames,
        ...(plan.pictures.generated.reason ? { reason: text(plan.pictures.generated.reason) } : {})
      }
    },
    // A disputed fact is settled at the fact itself; every other assumption is listed.
    assumptions: (plan.assumptions ?? [])
      .filter((a) => !disputed.has(a.field))
      .map((a) => ({ id: a.id, said: text(a.said) })),
    leftOut: leftOutOf(plan.leftOut),
    counts: { pages: plan.pages.length, services: services.length }
  }
}

/**
 * The structured plan edit for changes to the plan's current revision.
 * @param {any} plan - the plan the edit applies to
 * @param {{ field: string, value: unknown }[]} changes
 * @param {string} id - the edit's id, unique per draft
 */
export function planEditOf(plan, changes, id) {
  return {
    schema: PLAN_EDIT_SCHEMA,
    id,
    plan: { id: plan.id, revision: plan.revision },
    changes: changes.map((c) => ({ field: c.field, value: c.value }))
  }
}

/**
 * The change an in place editor's text makes to one field, or null when there is nothing to send: an empty or
 * unchanged text, or a count that is not a whole number of zero or more. A count field holds a number; every other
 * editable value is text.
 * @param {string} field - the plan field
 * @param {string | number} current - the field's value now
 * @param {string} text - what the owner typed
 * @returns {{ field: string, value: string | number } | null}
 */
export function planChangeOf(field, current, text) {
  const typed = String(text ?? '').trim()
  if (typed === '') return null
  if (typeof current === 'number') {
    if (!/^\d+$/.test(typed)) return null
    const value = Number(typed)
    return value === current ? null : { field, value }
  }
  return typed === current ? null : { field, value: typed }
}

/**
 * The plan fields the owner just changed, read from the draft rather than from the card's memory, so a card drawn
 * again from the draft still shows them. They are the draft's last edit while that edit can still be undone and the
 * plan is the revision it made; after an undo, or once a newer plan arrives from the chat, nothing is highlighted.
 * @param {{ plan: any, lastEdit?: any, canUndo?: boolean }} draft
 * @returns {string[]}
 */
export function changedFieldsOf({ plan, lastEdit = null, canUndo = false }) {
  if (!canUndo || !lastEdit?.plan || !plan) return []
  if (lastEdit.plan.id !== plan.id || lastEdit.plan.revision + 1 !== plan.revision) return []
  return (lastEdit.changes ?? []).map((c) => c.field)
}

/**
 * The two answer values of the plan review. They are values, not words to show: the review bar draws its buttons
 * from its own translated strings and answers with one of these, so an approval never depends on a displayed word,
 * whatever the owner's language. The tool's guard refuses a review whose options are not exactly these.
 */
export const PLAN_REVIEW_APPROVE = 'Approve'
export const PLAN_REVIEW_CHANGE = 'Change the plan'

/**
 * The id of the plan review handed out for one plan revision: `plan-review:<plan id>:<revision>`. The answer carries
 * the id back, so an approval names the revision the owner reviewed, never whatever revision is current later.
 * @param {{ id: string, revision: number }} plan
 */
export const planReviewIdOf = (plan) => `${REVIEW_ID}:${plan.id}:${plan.revision}`

/**
 * The plan revision a plan review id names, or null when the id is not a plan review of one revision.
 * @param {unknown} id
 * @returns {{ id: string, revision: number } | null}
 */
export function planOfReviewId(id) {
  if (typeof id !== 'string' || !id.startsWith(`${REVIEW_ID}:`)) return null
  const rest = id.slice(REVIEW_ID.length + 1)
  const cut = rest.lastIndexOf(':')
  if (cut <= 0) return null
  const revision = rest.slice(cut + 1)
  if (!/^\d+$/.test(revision)) return null
  return { id: rest.slice(0, cut), revision: Number(revision) }
}

/**
 * The `ask_user_question` request that dsh draws as its plan review bar: the plan's one line summary under review,
 * Approve and Change the plan. The plan itself is on the plan card, so the request carries only its summary. Its id
 * names the plan revision under review (`planReviewIdOf`); its options are the fixed answer values.
 * @param {any} plan
 * @param {(key: string, vars?: Record<string, unknown>) => string} [t]
 */
export function planReviewRequestOf(plan, t = english) {
  const { name, counts } = planCardOf(plan)
  const pages = t(counts.pages === 1 ? 'review.pages.one' : 'review.pages.other', { count: counts.pages })
  const services = t(counts.services === 1 ? 'plan.count.service.one' : 'plan.count.service.other', {
    count: counts.services
  })
  // A count of zero is left out: "2 pages", never "2 pages, 0 services".
  const parts = [counts.pages > 0 ? pages : null, counts.services > 0 ? services : null].filter(
    (p) => p !== null
  )
  const summary =
    parts.length === 2
      ? t('review.summary', { name, pages, services })
      : parts.length === 1
        ? t('review.summary.one', { name, part: parts[0] })
        : name
  return {
    questions: [
      {
        id: planReviewIdOf(plan),
        question: t('review.question'),
        detail: `# ${summary}`,
        options: [{ label: PLAN_REVIEW_APPROVE }, { label: PLAN_REVIEW_CHANGE }],
        intent: { kind: 'plan-review', approve: PLAN_REVIEW_APPROVE }
      }
    ]
  }
}

/**
 * The approval in the plan review bar's answer: the plan and revision the answered review named, or null for
 * anything else (Change the plan, a review that names no revision). Site creation starts from this (#610); nothing
 * is written to a site before it, and tracy-web builds it only while that revision is still the current one.
 * @param {{ answers?: { id: string, selected?: string[] }[] } | null} reply
 */
export function approvalOf(reply) {
  const answer = (reply?.answers ?? []).find((a) => planOfReviewId(a?.id) !== null)
  if (!answer || answer.selected?.[0] !== PLAN_REVIEW_APPROVE) return null
  return { plan: planOfReviewId(answer.id) }
}
