// The writer of the AI quickstart build (ticket #594, ADR 0046), replacing the demo led writer on the new path. It
// writes every page of the approved plan IN PARALLEL, ONE call to the standard build model per page (no separate smaller
// model). Each call reads that page's fields with their declared types and limits (Contract A) and the plan data each
// block shows (`page-writer-request.mjs`); it never reads demo copy. Copy is written in the plan's language, the language
// the business uses publicly.
//
// Each call also writes the page's search title and description (`seo`, locked brand decision 21) within the template's
// limits (`seoLimitsOf`), and follows the business's own voice when the needs profile carries one (`voice`).
//
// Once every page is written the pure copy check (`page-copy-check.mjs`) measures every field against its declared
// type and limit, and holds that copy carries no business value the plan data does not hold (`invented_data`: a phone
// number, email address, URL, price, opening hours, year, count or award), never describes the page itself
// (`about_the_page`), never uses a phrase the voice avoids (`avoided_phrase`), and that a child list row's copy carries
// no value of another row (`other_row_data`). The site check (`page-writer-site-check.mjs`) then reads every page
// together, with the copy of pages written before (`others`): a repeated sentence (`repeated_copy`) or a title another
// page has (`seo_title_not_unique`) fails on the later page. Only the failing fields go back to the model, in ONE more
// call for that page. A field that still fails throws a
// `PageWriterError` with code `copy_check_failed`, the failing fields (key and problem codes, as many as the step
// chain's record keeps) and the `attempts` made, marked `noRerun`: the writer made its own second attempt, so the build
// stops at once (ADR 0047, #591; #597). `data_over_limit` is a plan matter a re-run repeats: `noRerun` too.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { charCount } from './page-copy-check.mjs'
import { placeLimitsOf } from './field-place-limits.mjs'
import { PageWriterError, blockDescriptionsOf, knownEntriesOf, pageFieldsOf } from './page-writer-fields.mjs'
import { pageOut } from './page-writer-page.mjs'
import { writeAll } from './page-writer-rounds.mjs'
import { foreignValuesOf } from './page-writer-rows.mjs'
import { planDataOf } from './plan-data.mjs'
import { seoLimitsOf } from './seo-limits.mjs'

export { PageWriterError } from './page-writer-fields.mjs'
export { readWriterReply, readWriterSeo } from './page-writer-page.mjs'
export { PAGE_WRITE_ATTEMPTS } from './page-writer-rounds.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every page it wrote. */
export const PAGE_WRITER_PROMPT_FILE = 'page-writer-prompt.md'
export const PAGE_WRITER_PROMPT = readFileSync(
  new URL(`./${PAGE_WRITER_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PAGE_WRITER_PROMPT).digest('hex')
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
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], mapping?: object, others?: object[],
 *   model: (request: object) => Promise<unknown>, signal?: AbortSignal, rewrite?: boolean}} input `plan`: the approved plan
 *   (`composePlan`); `profile`: the needs profile it was composed from, which holds the item field values and the
 *   business's voice; `mapping`: the template mapping, for its SEO limits; `others`: pages written before by another
 *   writer step (`{id, fields, seo?}`), which this call's pages must not repeat; `rewrite: false` writes once with no
 *   rewrite round (the step chain's second attempt, so a page is written at most twice in one build)
 * @returns {Promise<{pages: Array<{id: string, fields: object[], attempts: object[], seo?: object}>, prompt: object}>}
 *   `seo`: the page's search `title` and `description` when the writer wrote them; `attempts`:
 *   one entry per call that page took (1, or 2 after a rewrite); each page's
 *   text fields in block order: `{key, block, item?, row?, list?, field, kind, from}` plus `value` for `from: 'writer'` (written by
 *   the model) and `from: 'data'` (copied, with `data`: the plan id it came from), or `action` (`hide` | `fallback`)
 *   and `fallback` for `from: 'no-data'`
 */
export async function writePages({
  plan,
  profile,
  blockStore,
  library = [],
  mapping,
  others = [],
  model,
  signal,
  rewrite = true
}) {
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
    known: knownEntriesOf(byId, data.rowsById),
    voice: profile?.voice,
    seoLimits: seoLimitsOf(mapping),
    prompt: PAGE_WRITER_PROMPT
  }
  // A row's copy field is checked against the other rows of its own list: it never carries a sibling row's data.
  const fieldsByPage = plan.pages.map((page) => {
    const fields = pageFieldsOf(page, context)
    return fields.map((f) =>
      f.row && f.from === 'writer' ? { ...f, foreign: foreignValuesOf(f, fields, data) } : f
    )
  })
  const over = dataOverLimit(fieldsByPage)
  if (over.length > 0)
    throw new PageWriterError(
      'data_over_limit',
      `${over.length} data value(s) are longer than their field holds: ${over.map((f) => `${f.key} (${f.length} of ${f.limit})`).join(', ')}`,
      boundedDetails('fields', over, (f) => f),
      { noRerun: true }
    )
  const states = plan.pages.map((page, i) => ({
    page,
    fields: fieldsByPage[i],
    slots: fieldsByPage[i].filter((f) => f.from === 'writer'),
    values: {},
    seo: undefined,
    attempts: [],
    unreadable: [],
    failing: []
  }))
  await writeAll(states, {
    plan,
    context,
    model,
    signal,
    others: Array.isArray(others) ? others : [],
    rewrite
  })
  const pages = states.map((s) => ({
    id: s.page.id,
    fields: pageOut(s),
    attempts: s.attempts,
    failing: s.failing,
    ...(s.seo ? { seo: s.seo } : {})
  }))
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
    pages: pages.map(({ id, fields, attempts, seo }) => ({ id, fields, attempts, ...(seo ? { seo } : {}) })),
    prompt: { file: PAGE_WRITER_PROMPT_FILE, sha256: PROMPT_SHA256 }
  }
}
