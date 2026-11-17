// One page of the page writer (ticket #594): one call to the build model for the page's copy fields and its search
// title and description, the reply read, and the page's own check (`page-copy-check.mjs`). The orchestration (pages in
// parallel, the site check, the one rewrite) is `page-writer.mjs`. Pure apart from the model call.
import { checkPageCopy, fieldValueProblems } from './page-copy-check.mjs'
import { PageWriterError } from './page-writer-fields.mjs'
import { ownerEchoFailing } from './page-writer-owner-echo.mjs'
import { pageWriterUser } from './page-writer-request.mjs'
import { emphasisProblems } from './page-writer-emphasis.mjs'

/** The keys of the page's search title and description in a rewrite and in the failing fields. */
export const SEO_KEYS = Object.freeze({ title: 'seo.title', description: 'seo.description' })

function parsed(reply) {
  if (typeof reply !== 'string') return reply
  try {
    return JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return null
  }
}

/** The written values of a reply by slot key, or null when the reply is not the JSON object the prompt asks for. */
export function readWriterReply(reply) {
  const fields = parsed(reply)?.fields
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null
}

/** The search title and description of a reply (`{title?, description?}`, strings only), or null when it gave none. */
export function readWriterSeo(reply) {
  const seo = parsed(reply)?.seo
  if (!seo || typeof seo !== 'object' || Array.isArray(seo)) return null
  const out = {}
  for (const name of ['title', 'description']) if (seo[name] !== undefined) out[name] = seo[name]
  return Object.keys(out).length ? out : null
}

/** The emphasis of a reply by key (strings only), or an empty object. */
export function readWriterEmphasis(reply) {
  const emphasis = parsed(reply)?.emphasis
  if (!emphasis || typeof emphasis !== 'object' || Array.isArray(emphasis)) return {}
  return Object.fromEntries(Object.entries(emphasis).filter(([, v]) => typeof v === 'string'))
}

/** The fields a reply returns, `key -> reason`: each with a reason of its own, the step chain's `returns`. */
export function readWriterReturns(reply) {
  const out = {}
  for (const r of Array.isArray(parsed(reply)?.returns) ? parsed(reply).returns : [])
    if (typeof r?.key === 'string' && typeof r.reason === 'string' && r.reason.trim() !== '')
      out[r.key] = r.reason.trim()
  return out
}

/**
 * The problems of the written search title and description. Both are optional (the write order then builds its own,
 * `write-order-pages.mjs` `seoOf`, so every page still has both, as the step chain's W09 asks), but a written one is
 * held like a copy field: plain text within the limit, no invented data, no dash.
 */
export function seoFailing(seo, limits, context) {
  const failing = []
  for (const name of ['title', 'description']) {
    if (seo?.[name] === undefined) continue
    const field = { name, type: 'text', kind: `seo.${name}`, limit: limits[name] }
    const problems = fieldValueProblems(field, seo[name], context)
    if (problems.length) failing.push({ key: SEO_KEYS[name], value: seo[name], problems })
  }
  return failing
}

const unreadable = (slots) =>
  slots.map(({ key }) => ({
    key,
    value: undefined,
    problems: [{ code: 'reply_unreadable', message: 'the reply was not the JSON object {"fields": {...}}' }]
  }))

/**
 * The page's own check: every asked field and the search details, with the voice's avoid list, then the owner echo
 * check (`page-writer-owner-echo.mjs`, only when the build has the owner's statement) over every written value.
 */
export function pageFailing(state, context) {
  const check = { known: context.known, avoid: context.voice?.avoid, templateNames: context.templateNames }
  const lost = new Set(state.unreadable.map((f) => f.key))
  const returned = state.returned ?? {}
  const checked = state.slots.filter((s) => !lost.has(s.key) && !Object.hasOwn(returned, s.key))
  const failing = [
    ...state.unreadable,
    ...checkPageCopy(checked, state.values, check).failing,
    ...seoFailing(state.seo, context.seoLimits, check)
  ]
  // W16: the accent words of every written field (`page-writer-emphasis.mjs`).
  for (const slot of checked) {
    const problems = emphasisProblems(slot.field, state.values[slot.key], state.emphasis?.[slot.key])
    if (problems.length === 0) continue
    const same = failing.find((x) => x.key === slot.key)
    if (same) same.problems.push(...problems)
    else failing.push({ key: slot.key, value: state.values[slot.key], problems })
  }
  for (const f of ownerEchoFailing(state, context.ownerEcho, SEO_KEYS)) {
    if (lost.has(f.key)) continue
    const same = failing.find((x) => x.key === f.key)
    if (same) same.problems.push(...f.problems)
    else failing.push(f)
  }
  return failing
}

/**
 * One call for a page: its first writing (`rewrite` absent) or its rewrite of the failing fields. The state's values
 * and search details take only what this call was asked for.
 */
export async function callPage(state, { plan, context, model, signal, rewrite }) {
  const { page, fields } = state
  // A revision's first call asks only the fields of the blocks it changed (`state.ask`, #599); the rest keep their words.
  const slots = !rewrite && state.ask ? state.ask : state.slots
  if (signal?.aborted) throw signal.reason ?? new Error('stopped')
  // A revision's first call that asks some blocks only keeps the page's search texts: none asked, none taken.
  const askedSeo = rewrite
    ? rewrite.filter((f) => Object.values(SEO_KEYS).includes(f.key))
    : state.ask
      ? []
      : null
  // The other blocks' words ride along as read only context (#599); their keys are never taken from the answer.
  const asking = new Set(slots.map((s) => s.key))
  const kept =
    !rewrite && state.ask
      ? state.slots.filter((s) => !asking.has(s.key)).map((s) => ({ ...s, value: state.values[s.key] }))
      : undefined
  const user = pageWriterUser({
    plan,
    page,
    slots,
    shown: fields,
    ...context,
    kept,
    rewrite,
    seo: !askedSeo || askedSeo.length ? context.seoLimits : undefined
  })
  let reply
  try {
    reply = await model({ system: context.prompt, user: JSON.stringify(user), format: 'json' })
  } catch (error) {
    throw new PageWriterError('writer_call_failed', `page ${page.id}: ${error?.message ?? error}`, {
      page: page.id,
      cause: error
    })
  }
  const written = readWriterReply(reply)
  const asked = rewrite ? slots.filter((s) => rewrite.some((f) => f.key === s.key)) : slots
  // Only the slots this call was asked for are taken: a value for any other key is dropped, never written. A field the
  // writer returns (with its reason) is no longer its: the block's no data rule takes it (`pageOut`).
  const returns = readWriterReturns(reply)
  const emphasis = readWriterEmphasis(reply)
  state.returned ??= {}
  state.emphasis ??= {}
  if (written)
    for (const { key } of asked) {
      if (Object.hasOwn(returns, key) && !Object.hasOwn(written, key)) {
        state.returned[key] = returns[key]
        delete state.values[key]
        continue
      }
      delete state.returned[key]
      if (Object.hasOwn(written, key)) state.values[key] = written[key]
      // An emphasis a rewrite leaves out is kept while the new value still holds its words.
      const kept = state.emphasis[key]
      const declares = Boolean(asked.find((s) => s.key === key)?.field?.emphasis)
      if (Object.hasOwn(emphasis, key)) state.emphasis[key] = emphasis[key]
      else if (!(declares && typeof kept === 'string' && String(state.values[key]).includes(kept)))
        delete state.emphasis[key]
    }
  const seo = readWriterSeo(reply)
  for (const name of ['title', 'description'])
    if (seo?.[name] !== undefined && (!askedSeo || askedSeo.some((f) => f.key === SEO_KEYS[name])))
      state.seo = { ...state.seo, [name]: seo[name] }
  state.asked = [...asked.map((s) => s.key), ...(askedSeo ?? []).map((f) => f.key)]
  state.unreadable = written ? [] : unreadable(asked)
}

/** A page's fields as the writer returns them, in block order. */
export function pageOut(state) {
  return state.fields.map((f) => {
    const reason = state.returned?.[f.key]
    if (f.from === 'writer' && reason !== undefined)
      return fieldOut(state, {
        ...f,
        from: 'no-data',
        action: f.noData?.action ?? 'hide',
        ...(f.noData?.fallback === undefined ? {} : { fallback: f.noData.fallback }),
        returned: reason
      })
    return fieldOut(state, f)
  })
}

function fieldOut(
  state,
  { key, block, item, row, list, field, from, value, data, action, fallback, derived, returned }
) {
  const emphasis = from === 'writer' ? state.emphasis?.[key] : undefined
  return {
    key,
    block,
    ...(item ? { item } : {}),
    ...(row ? { row, list } : {}),
    field: field.name,
    kind: field.kind,
    from,
    ...(from === 'writer' ? { value: state.values[key] } : {}),
    ...(from === 'data' ? { value, data } : {}),
    ...(from === 'no-data'
      ? { action, ...(fallback === undefined ? {} : { fallback }), ...(derived ? { derived } : {}) }
      : {}),
    ...(typeof emphasis === 'string' ? { emphasis } : {}),
    ...(returned === undefined ? {} : { returned })
  }
}
