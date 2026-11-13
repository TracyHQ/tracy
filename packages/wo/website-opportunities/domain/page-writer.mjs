// The writer of the AI quickstart build (ticket #594, ADR 0046), replacing the demo led writer on the new path. It
// writes every page of the approved plan IN PARALLEL, ONE call to the standard build model per page (no separate smaller
// model). Each call reads that page's fields with their declared types and limits (Contract A) and the plan data each
// block shows (`page-writer-request.mjs`); it never reads demo copy. Copy is written in the plan's language, the language
// the business uses publicly.
//
// Right after a page is written the pure copy check (`page-copy-check.mjs`) measures every field against its declared
// type and limit, and holds that copy carries no phone number, email address, URL or price the plan data does not hold
// (`invented_data`), and that a child list row's copy carries no value of another row (`other_row_data`). Only the
// failing fields go back to the model, in ONE more call for that page. A field that still fails throws a
// `PageWriterError` with code `copy_check_failed`, the failing fields (key and problem codes, as many as the step
// chain's record keeps) and the `attempts` made, marked `noRerun`: the writer made its own second attempt, so the build
// stops at once (ADR 0047, #591; #597). `data_over_limit` is a plan matter a re-run repeats: `noRerun` too.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { charCount, checkPageCopy } from './page-copy-check.mjs'
import { placeLimitsOf } from './field-place-limits.mjs'
import { PageWriterError, blockDescriptionsOf, knownValuesOf, pageFieldsOf } from './page-writer-fields.mjs'
import { pageWriterUser } from './page-writer-request.mjs'
import { foreignValuesOf } from './page-writer-rows.mjs'
import { planDataOf } from './plan-data.mjs'

export { PageWriterError } from './page-writer-fields.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every page it wrote. */
export const PAGE_WRITER_PROMPT_FILE = 'page-writer-prompt.md'
export const PAGE_WRITER_PROMPT = readFileSync(
  new URL(`./${PAGE_WRITER_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PAGE_WRITER_PROMPT).digest('hex')
/** How many calls a page may take: the first writing and one rewrite of the failing fields. */
export const PAGE_WRITE_ATTEMPTS = 2

/** The written values of a reply by slot key, or null when the reply is not the JSON object the prompt asks for. */
export function readWriterReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  const fields = value?.fields
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null
}

const unreadable = (slots) =>
  slots.map(({ key }) => ({
    key,
    value: undefined,
    problems: [{ code: 'reply_unreadable', message: 'the reply was not the JSON object {"fields": {...}}' }]
  }))

/** One page: written, checked, its failing fields rewritten once, checked again. */
async function writePage({ plan, page, fields, context, model, signal }) {
  const slots = fields.filter((f) => f.from === 'writer')
  const values = {}
  const attempts = []
  let rewrite
  for (let n = 0; n < PAGE_WRITE_ATTEMPTS && slots.length > 0; n++) {
    if (signal?.aborted) throw signal.reason ?? new Error('stopped')
    const user = pageWriterUser({ plan, page, slots, shown: fields, ...context, rewrite })
    let reply
    try {
      reply = await model({ system: PAGE_WRITER_PROMPT, user: JSON.stringify(user), format: 'json' })
    } catch (error) {
      throw new PageWriterError('writer_call_failed', `page ${page.id}: ${error?.message ?? error}`, {
        page: page.id,
        cause: error
      })
    }
    const written = readWriterReply(reply)
    const asked = rewrite ? slots.filter((s) => rewrite.some((f) => f.key === s.key)) : slots
    // Only the slots this call was asked for are taken: a value for any other key is dropped, never written.
    if (written) for (const { key } of asked) if (Object.hasOwn(written, key)) values[key] = written[key]
    const failing = written
      ? checkPageCopy(asked, values, { known: context.known }).failing
      : unreadable(asked)
    attempts.push({ asked: asked.map((s) => s.key), failing })
    if (failing.length === 0) break
    rewrite = failing
  }
  const failing = attempts.at(-1)?.failing ?? []
  const out = fields.map(
    ({ key, block, item, row, list, field, from, value, data, action, fallback, derived }) => ({
      key,
      block,
      ...(item ? { item } : {}),
      ...(row ? { row, list } : {}),
      field: field.name,
      kind: field.kind,
      from,
      ...(from === 'writer' ? { value: values[key] } : {}),
      ...(from === 'data' ? { value, data } : {}),
      ...(from === 'no-data'
        ? { action, ...(fallback === undefined ? {} : { fallback }), ...(derived ? { derived } : {}) }
        : {})
    })
  )
  return { id: page.id, fields: out, attempts, failing }
}

/**
 * The step chain keeps at most this many bytes of an error's details as JSON and cuts heavier ones (the engine's
 * `MAX_ERROR_DETAILS_BYTES`); the writer's details stay under it, with room for `attempts` and the count.
 */
export const WRITER_DETAILS_BYTES = 3800

/** `{[name]: entries, [name + 'Count']: total}`, as many leading entries (each `shape`d) as fit the budget. */
export function boundedDetails(name, entries, shape) {
  const kept = []
  let bytes = 0
  for (const entry of entries) {
    const shaped = shape(entry)
    const size = Buffer.byteLength(JSON.stringify(shaped)) + 1
    if (bytes + size > WRITER_DETAILS_BYTES) break
    kept.push(shaped)
    bytes += size
  }
  return { [name]: kept, [`${name}Count`]: entries.length }
}

/** Every data field whose value is longer than its field holds, on every page: a plan matter, never shortened. */
function dataOverLimit(fieldsByPage) {
  return fieldsByPage
    .flat()
    .filter((f) => f.from === 'data' && charCount(f.value) > f.field.limit)
    .map(({ page, key, field, value, data }) => ({
      page,
      key,
      kind: field.kind,
      data,
      length: charCount(value),
      limit: field.limit
    }))
}

/**
 * Write every page of a plan, in parallel.
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], model: (request: object) =>
 *   Promise<unknown>, signal?: AbortSignal}} input `plan`: the approved plan (`composePlan`); `profile`: the needs
 *   profile it was composed from, which holds the item field values
 * @returns {Promise<{pages: Array<{id: string, fields: object[], attempts: object[]}>, prompt: object}>} `attempts`:
 *   one entry per call that page took (1, or 2 after a rewrite); each page's
 *   text fields in block order: `{key, block, item?, row?, list?, field, kind, from}` plus `value` for `from: 'writer'` (written by
 *   the model) and `from: 'data'` (copied, with `data`: the plan id it came from), or `action` (`hide` | `fallback`)
 *   and `fallback` for `from: 'no-data'`
 */
export async function writePages({ plan, profile, blockStore, library = [], model, signal }) {
  if (typeof model !== 'function') throw new PageWriterError('model_missing', 'no build model was given')
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0)
    throw new PageWriterError('plan_missing', 'the plan has no pages to write')
  const data = planDataOf(profile)
  const { byId } = data
  const blocks = blockDescriptionsOf(blockStore, library)
  const context = {
    blocks,
    byId,
    data,
    placeLimits: placeLimitsOf(blocks.values()),
    known: knownValuesOf(byId, data.rowsById)
  }
  // A row's copy field is checked against the other rows' values: it never carries another row's data.
  const fieldsByPage = plan.pages.map((page) =>
    pageFieldsOf(page, context).map((f) =>
      f.row && f.from === 'writer' ? { ...f, foreign: foreignValuesOf(f.rowData, data) } : f
    )
  )
  const over = dataOverLimit(fieldsByPage)
  if (over.length > 0)
    throw new PageWriterError(
      'data_over_limit',
      `${over.length} data value(s) are longer than their field holds: ${over.map((f) => `${f.key} (${f.length} of ${f.limit})`).join(', ')}`,
      boundedDetails('fields', over, (f) => f),
      { noRerun: true }
    )
  const settled = await Promise.allSettled(
    plan.pages.map((page, i) => writePage({ plan, page, fields: fieldsByPage[i], context, model, signal }))
  )
  const rejected = settled.find((s) => s.status === 'rejected')
  if (rejected) throw rejected.reason
  const pages = settled.map((s) => s.value)
  const failing = pages.flatMap((p) => p.failing.map((f) => ({ page: p.id, ...f })))
  // The writer already made its own second attempt (the rewrite): the engine does not run it twice more (#597, Q4).
  // `attempts` is how many calls the most tried page took, the attempt the build reports for the step.
  if (failing.length > 0)
    throw new PageWriterError(
      'copy_check_failed',
      `${failing.length} field(s) still fail the copy check after one rewrite: ${failing.map((f) => f.key).join(', ')}`,
      {
        ...boundedDetails('failing', failing, ({ page, key, problems }) => ({
          page,
          key,
          problems: [...new Set(problems.map((p) => p.code))].slice(0, 5).map((code) => ({ code }))
        })),
        attempts: Math.max(...pages.map((p) => p.attempts.length))
      },
      { noRerun: true }
    )
  return {
    pages: pages.map(({ id, fields, attempts }) => ({ id, fields, attempts })),
    prompt: { file: PAGE_WRITER_PROMPT_FILE, sha256: PROMPT_SHA256 }
  }
}
