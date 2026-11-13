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

const PLAN_EDIT_SCHEMA = 'tracy-build-plan-edit/v1'
/** The id of the plan review request: the one question the tool's guard admits beside the engine's own. */
export const PLAN_REVIEW_ID = 'plan-review'
const REVIEW_ID = PLAN_REVIEW_ID

/** Translate with the English source; a plugin passes its bound locale instead. */
const english = (key, vars = {}) =>
  BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))

const firstSource = (sources) => sources?.[0]?.name ?? ''
const isWebsite = (alternative) => (alternative.sources ?? []).some((s) => s.kind === 'website')

/** The values of a disputed fact, the website's first, the current value selected. */
function choiceOf(fact, assumption) {
  const ordered = [...assumption.alternatives].sort((a, b) => Number(isWebsite(b)) - Number(isWebsite(a)))
  return {
    field: assumption.field,
    said: assumption.said,
    options: ordered.map((a) => ({
      value: a.value,
      source: firstSource(a.sources),
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
    return { services: serviceIds.map((id) => plan.items.find((i) => i.id === id).label) }
  const facts = []
  const counts = []
  for (const id of data) {
    const fact = plan.facts.find((f) => f.id === id)
    if (fact) {
      facts.push(fact.label)
      continue
    }
    const item = plan.items.find((i) => i.id === id)
    if (!item) continue
    const n = item.count ?? 1
    const seen = counts.find((c) => c.kind === item.kind)
    if (seen) seen.count += n
    else counts.push({ kind: item.kind, count: n })
  }
  return { facts, counts }
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
    out.push(item ? { head: item.label, rows } : { rows })
  }
  return out
}

/** What a planned row reads as: a row's label, a fact's value, an item's label or a page's name; null if unknown. */
function rowLabelOf(row, plan) {
  if (row.page !== undefined) return plan.pages.find((p) => p.id === row.page)?.name ?? null
  const id = row.data
  const found =
    (plan.rows ?? []).find((r) => r.id === id)?.label ??
    plan.facts.find((f) => f.id === id)?.value ??
    plan.items.find((i) => i.id === id)?.label
  return found ?? null
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
    const what = plainWordsOf(l.what)
    const key = JSON.stringify([what, l.kind, l.reason])
    const seen = byKey.get(key)
    if (seen) seen.count += 1
    else {
      const line = { what, kind: l.kind, reason: l.reason, count: 1 }
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

/**
 * The plan card's content.
 * @param {any} plan - a Contract B plan
 */
export function planCardOf(plan) {
  const disputed = new Map(
    (plan.assumptions ?? [])
      .filter((a) => Array.isArray(a.alternatives) && /^facts\[[^\]]+\]\.value$/.test(a.field))
      .map((a) => [a.field, a])
  )
  const services = plan.items.filter((i) => i.kind === 'service')
  const serviceIds = services.map((s) => s.id)
  const name = plan.facts.find((f) => f.kind === 'business.name')?.value ?? ''
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
        label: f.label,
        value: f.value,
        source: firstSource(f.sources),
        choice: assumption ? choiceOf(f, assumption) : null
      }
    }),
    language: plan.language,
    look: {
      template: plan.look.template.name,
      accent: plan.look.accent,
      // The dark theme's accent when it differs from the light one (#616); shown, not offered for editing yet.
      accentDark: typeof plan.look.accentDark === 'string' ? plan.look.accentDark : null,
      logo:
        plan.look.logo.kind === 'own'
          ? { kind: 'own', source: plan.look.logo.source }
          : { kind: plan.look.logo.kind }
    },
    services: services.map((s) => ({
      id: s.id,
      field: `items[${s.id}].label`,
      label: s.label,
      source: firstSource(s.sources)
    })),
    pages: plan.pages.map((p) => ({
      id: p.id,
      name: p.name,
      blocks: p.blocks.map((b) => {
        const lists = listsOf(b.lists, plan)
        return {
          id: b.id,
          label: b.label,
          reason: b.reason,
          holds: holdsOf(b, plan, serviceIds),
          ...(lists.length > 0 ? { lists } : {})
        }
      })
    })),
    pictures: {
      own: { frames: plan.pictures.own.frames, from: [...(plan.pictures.own.from ?? [])] },
      generated: {
        frames: plan.pictures.generated.frames,
        ...(plan.pictures.generated.reason ? { reason: plan.pictures.generated.reason } : {})
      }
    },
    // A disputed fact is settled at the fact itself; every other assumption is listed.
    assumptions: (plan.assumptions ?? [])
      .filter((a) => !disputed.has(a.field))
      .map((a) => ({ id: a.id, said: a.said })),
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
 * The `ask_user_question` request that dsh draws as its plan review bar: the plan's one line summary under review,
 * Approve and Request changes. The plan itself is on the plan card, so the request carries only its summary.
 * @param {any} plan
 * @param {(key: string, vars?: Record<string, unknown>) => string} [t]
 */
export function planReviewRequestOf(plan, t = english) {
  const { name, counts } = planCardOf(plan)
  const pages = t(counts.pages === 1 ? 'review.pages.one' : 'review.pages.other', { count: counts.pages })
  const services = t(counts.services === 1 ? 'review.services.one' : 'review.services.other', {
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
  const approve = t('review.approve')
  return {
    questions: [
      {
        id: REVIEW_ID,
        question: t('review.question'),
        detail: `# ${summary}`,
        options: [{ label: approve }, { label: t('review.change') }],
        intent: { kind: 'plan-review', approve }
      }
    ]
  }
}

/**
 * The approval in the plan review bar's answer: the plan and revision approved, or null for anything else. Site
 * creation starts from this (#610); nothing is written to a site before it.
 * @param {any} plan
 * @param {{ answers?: { id: string, selected?: string[] }[] } | null} reply
 * @param {(key: string, vars?: Record<string, unknown>) => string} [t]
 */
export function approvalOf(plan, reply, t = english) {
  const answer = reply?.answers?.find((a) => a.id === REVIEW_ID)
  if (answer?.selected?.[0] !== t('review.approve')) return null
  return { plan: { id: plan.id, revision: plan.revision } }
}
