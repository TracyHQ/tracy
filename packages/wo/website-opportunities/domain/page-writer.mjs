// The writer of the AI quickstart build (ticket #594, ADR 0046), replacing the demo led writer on the new path. It
// writes every page of the approved plan IN PARALLEL, ONE call to the standard build model per page (no separate smaller
// model). Each call reads that page's fields with their declared types and limits (Contract A) and the plan data each
// block shows (`page-writer-request.mjs`); it never reads demo copy. Copy is written in the plan's language, the language
// the business uses publicly.
//
// Right after a page is written the pure copy check (`page-copy-check.mjs`) measures every field against its declared
// type and limit. Only the failing fields go back to the model, in ONE more call for that page. A field that still fails
// throws a `PageWriterError` with code `copy_check_failed` and every failing field, for the stop and report rule
// (ADR 0047, #591).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { checkPageCopy } from './page-copy-check.mjs'
import { PageWriterError, blockDescriptionsOf, pageSlotsOf, pageWriterUser } from './page-writer-request.mjs'
import { planDataOf } from './plan-data.mjs'

export { PageWriterError } from './page-writer-request.mjs'

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
async function writePage({ plan, page, context, model, signal }) {
  const slots = pageSlotsOf(page, context)
  const values = {}
  const attempts = []
  let rewrite
  for (let n = 0; n < PAGE_WRITE_ATTEMPTS && slots.length > 0; n++) {
    if (signal?.aborted) throw signal.reason ?? new Error('stopped')
    const user = pageWriterUser({ plan, page, slots, ...context, rewrite })
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
    const failing = written ? checkPageCopy(asked, values).failing : unreadable(asked)
    attempts.push({ asked: asked.map((s) => s.key), failing })
    if (failing.length === 0) break
    rewrite = failing
  }
  const failing = attempts.at(-1)?.failing ?? []
  const copy = slots.map(({ key, block, item, field }) => ({
    key,
    block,
    ...(item ? { item } : {}),
    field: field.name,
    value: values[key]
  }))
  return { id: page.id, copy, attempts, failing }
}

/**
 * Write every page of a plan, in parallel.
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], model: (request: object) =>
 *   Promise<unknown>, signal?: AbortSignal}} input `plan`: the approved plan (`composePlan`); `profile`: the needs
 *   profile it was composed from, which holds the item field values
 * @returns {Promise<{pages: Array<{id: string, copy: object[], attempts: object[]}>, prompt: object}>}
 */
export async function writePages({ plan, profile, blockStore, library = [], model, signal }) {
  if (typeof model !== 'function') throw new PageWriterError('model_missing', 'no build model was given')
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0)
    throw new PageWriterError('plan_missing', 'the plan has no pages to write')
  const context = { blocks: blockDescriptionsOf(blockStore, library), byId: planDataOf(profile).byId }
  const settled = await Promise.allSettled(
    plan.pages.map((page) => writePage({ plan, page, context, model, signal }))
  )
  const rejected = settled.find((s) => s.status === 'rejected')
  if (rejected) throw rejected.reason
  const pages = settled.map((s) => s.value)
  const failing = pages.flatMap((p) => p.failing.map((f) => ({ page: p.id, ...f })))
  if (failing.length > 0)
    throw new PageWriterError(
      'copy_check_failed',
      `${failing.length} field(s) still fail the copy check after one rewrite: ${failing.map((f) => f.key).join(', ')}`,
      { failing, pages }
    )
  return {
    pages: pages.map(({ id, copy, attempts }) => ({ id, copy, attempts })),
    prompt: { file: PAGE_WRITER_PROMPT_FILE, sha256: PROMPT_SHA256 }
  }
}
