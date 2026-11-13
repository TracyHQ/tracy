// One page of the page writer (ticket #594): one call to the build model for the page's copy fields and its search
// title and description, the reply read, and the page's own check (`page-copy-check.mjs`). The orchestration (pages in
// parallel, the site check, the one rewrite) is `page-writer.mjs`. Pure apart from the model call.
import { checkPageCopy, fieldValueProblems } from './page-copy-check.mjs'
import { PageWriterError } from './page-writer-fields.mjs'
import { pageWriterUser } from './page-writer-request.mjs'

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

/**
 * The problems of the written search title and description. Both are optional (the write order then builds its own),
 * but a written one is held like a copy field: plain text within the limit, no invented data, no dash.
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

/** The page's own check: every asked field and the search details, with the voice's avoid list. */
export function pageFailing(state, context) {
  const check = { known: context.known, avoid: context.voice?.avoid }
  const lost = new Set(state.unreadable.map((f) => f.key))
  return [
    ...state.unreadable,
    ...checkPageCopy(
      state.slots.filter((s) => !lost.has(s.key)),
      state.values,
      check
    ).failing,
    ...seoFailing(state.seo, context.seoLimits, check)
  ]
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
  const askedSeo = rewrite ? rewrite.filter((f) => Object.values(SEO_KEYS).includes(f.key)) : null
  const user = pageWriterUser({
    plan,
    page,
    slots,
    shown: fields,
    ...context,
    rewrite,
    seo: !rewrite || askedSeo.length ? context.seoLimits : undefined
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
  // Only the slots this call was asked for are taken: a value for any other key is dropped, never written.
  if (written) for (const { key } of asked) if (Object.hasOwn(written, key)) state.values[key] = written[key]
  const seo = readWriterSeo(reply)
  for (const name of ['title', 'description'])
    if (seo?.[name] !== undefined && (!askedSeo || askedSeo.some((f) => f.key === SEO_KEYS[name])))
      state.seo = { ...state.seo, [name]: seo[name] }
  state.asked = [...asked.map((s) => s.key), ...(askedSeo ?? []).map((f) => f.key)]
  state.unreadable = written ? [] : unreadable(asked)
}

/** A page's fields as the writer returns them, in block order. */
export function pageOut(state) {
  return state.fields.map(
    ({ key, block, item, row, list, field, from, value, data, action, fallback, derived }) => ({
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
        : {})
    })
  )
}
