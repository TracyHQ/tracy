// The text of the Privacy Policy page the plan creates (#575, item B of the page writer audit), copied from the step
// chain's site writer: a created legal page has no kit slots, so the writer writes its full text, a `title` and a
// `body` of paragraphs (`apps/tracy-web/src/site-writer/writer-prompt.md`, its `pages` entry), checked by W13 (the
// title is a heading, `copy-check/rules-page-headings.js`) and W14 (a complete policy, `copy-check/rules-privacy.js`).
//
// What the new model forces: W14 found the themes by English keywords; the build chat writes in the business's own
// language, and code never reads free text for its meaning. So the writer names the themes each paragraph covers
// (`covers`, from the six keys of W14) and code checks that structure: at least `PRIVACY_MIN_PARAGRAPHS` paragraphs,
// at least `PRIVACY_MIN_THEMES` distinct themes, every key one of the six. Every paragraph is held like a copy field
// (plain text, no dash, nothing invented against the whole plan data, the template's name, the voice's avoid list) and
// the site check holds it against every page written before. One rewrite of the whole page, then a typed stop.
//
// The not-found page is not written: the step chain's write step skips it for this template too (its words are the
// platform's own, `write-step/page-settings-stage.js`; `draft-write-system-pages.mjs`). Pure but for the model call.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fieldValueProblems } from './page-copy-check.mjs'
import { PageWriterError } from './page-writer-fields.mjs'
import { seoFailing } from './page-writer-page.mjs'
import { createdPrivacyOf, privacyRequestOf, readPrivacyReply } from './page-writer-privacy-request.mjs'
import { siteCopyFailing } from './page-writer-site-check.mjs'
import { PRIVACY_KIND, PRIVACY_PAGE_ID } from './plan-system-pages.mjs'

export const PRIVACY_PROMPT_FILE = 'page-writer-privacy-prompt.md'
export const PRIVACY_PROMPT = readFileSync(new URL(`./${PRIVACY_PROMPT_FILE}`, import.meta.url), 'utf8')
/** W14's numbers and themes (`rules-privacy.js`). */
export const PRIVACY_MIN_PARAGRAPHS = 5
export const PRIVACY_MIN_THEMES = 4
export const PRIVACY_THEMES = Object.freeze(['collected', 'photos', 'sharing', 'kept', 'rights', 'contact'])
/** W13: the page heading's limit and the separator a browser title has. */
export const PAGE_TITLE_LIMIT = 60
const PARAGRAPH = { name: 'paragraph', type: 'text', kind: 'legal.paragraph', limit: 2000 }
const TITLE = { name: 'title', type: 'text', kind: 'legal.title', limit: PAGE_TITLE_LIMIT }

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const said = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The problems of the written page: W13, W14, every paragraph as a copy field, its search texts, the site check. */
export function privacyFailing(page, { context, others, businessName }) {
  if (!page)
    return [
      {
        key: 'page',
        problems: [
          { code: 'reply_unreadable', message: 'the reply was not the JSON object {"title", "body": [...]}' }
        ]
      }
    ]
  const check = { known: context.known, avoid: context.voice?.avoid, templateNames: context.templateNames }
  const failing = []
  const add = (key, problems) => problems.length && failing.push({ key, problems })
  const title = fieldValueProblems(TITLE, page.title, check)
  if (typeof page.title === 'string' && page.title.includes(' | '))
    title.push({
      code: 'browser_title',
      message: 'the title is the heading on the page: no " | ", the browser title goes in seo'
    })
  else if (
    isText(businessName) &&
    said(page.title) !== said(businessName) &&
    said(page.title).endsWith(said(businessName))
  )
    title.push({
      code: 'browser_title',
      message:
        'the title ends with the business name: it is the heading on the page, the browser title goes in seo'
    })
  add('title', title)
  page.body.forEach((p, i) => add(`body.${i + 1}`, fieldValueProblems(PARAGRAPH, p?.text, check)))
  const themes = new Set(page.body.flatMap((p) => list(p?.covers)))
  const unknown = [...themes].filter((t) => !PRIVACY_THEMES.includes(t))
  const named = [...themes].filter((t) => PRIVACY_THEMES.includes(t))
  const missing = PRIVACY_THEMES.filter((t) => !themes.has(t))
  const w14 = []
  if (page.body.length < PRIVACY_MIN_PARAGRAPHS)
    w14.push({
      code: 'privacy_thin',
      message: `${page.body.length} paragraphs, a privacy policy needs at least ${PRIVACY_MIN_PARAGRAPHS}`
    })
  else if (named.length < PRIVACY_MIN_THEMES)
    w14.push({
      code: 'privacy_thin',
      message: `covers ${named.length} of the privacy themes, at least ${PRIVACY_MIN_THEMES} are needed; missing: ${missing.join(', ')}`
    })
  if (unknown.length)
    w14.push({
      code: 'privacy_theme_unknown',
      message: `covers names ${unknown.join(', ')}; the keys are ${PRIVACY_THEMES.join(', ')}`
    })
  add('body', w14)
  failing.push(...seoFailing(page.seo, context.seoLimits, check))
  const own = {
    id: PRIVACY_PAGE_ID,
    fields: page.body.map((p, i) => ({
      key: `body.${i + 1}`,
      from: 'writer',
      kind: PARAGRAPH.kind,
      limit: PARAGRAPH.limit,
      value: p?.text
    })),
    seo: page.seo
  }
  for (const f of siteCopyFailing([...others, own], { known: context.known, own: new Set([own.id]) }))
    add(f.key, f.problems)
  return failing
}

/**
 * Write the created Privacy page of the plan, after every other page (the step chain's writing order).
 * `kept`: the page a revision's previous build wrote (`{..., fingerprint}`), kept when its inputs are unchanged.
 * @returns {Promise<object | null>} `{id, kind, title, body, covers, seo?, fingerprint, attempts}`, or null when the
 *   plan creates none
 */
export async function writePrivacyPage({
  plan,
  context,
  model,
  signal,
  others,
  rewrite: rewriting = true,
  kept
}) {
  const entry = createdPrivacyOf(plan)
  if (!entry) return null
  const businessName = list(plan.facts).find((f) => f.kind === 'business.name')?.value
  // What the page is written from, the copy of other pages aside: a revision keeps the page while it is unchanged
  // and still passes the check against the pages written now (#599: an unchanged request takes no call).
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(privacyRequestOf(entry, { plan, context, written: [] })))
    .digest('hex')
  if (kept?.id === entry.id && kept.fingerprint === fingerprint) {
    const page = {
      title: kept.title,
      body: list(kept.body).map((text, i) => ({ text, covers: list(kept.covers?.[i]) })),
      seo: kept.seo
    }
    if (privacyFailing(page, { context, others, businessName }).length === 0) return { ...kept, attempts: [] }
  }
  const written = others
    .map((p) => ({
      page: p.id,
      words: list(p.fields)
        .filter((f) => f.from === 'writer' && isText(f.value))
        .map((f) => f.value)
    }))
    .filter((p) => p.words.length)
  const attempts = []
  let page = null
  let failing = []
  for (let n = 0; n < (rewriting ? 2 : 1); n++) {
    if (signal?.aborted) throw signal.reason ?? new Error('stopped')
    const rewrite =
      n > 0 ? failing.map((f) => ({ key: f.key, problems: f.problems.map((p) => p.message) })) : undefined
    let reply
    try {
      reply = await model({
        system: PRIVACY_PROMPT,
        user: JSON.stringify(privacyRequestOf(entry, { plan, context, written, rewrite })),
        format: 'json'
      })
    } catch (error) {
      throw new PageWriterError(
        'writer_call_failed',
        `page ${entry.id}: ${error?.message ?? error}`,
        { page: entry.id, cause: error },
        { noRerun: n > 0 }
      )
    }
    page = readPrivacyReply(reply)
    failing = privacyFailing(page, { context, others, businessName })
    attempts.push({
      failing: failing.map((f) => ({ key: f.key, problems: f.problems.map((p) => ({ code: p.code })) }))
    })
    if (failing.length === 0) break
  }
  if (failing.length)
    throw new PageWriterError(
      'copy_check_failed',
      `the privacy page still fails the copy check: ${failing.map((f) => f.key).join(', ')}`,
      {
        failing: failing.slice(0, 20).map((f) => ({
          page: entry.id,
          key: f.key,
          problems: [...new Set(f.problems.map((p) => p.code))].slice(0, 5).map((code) => ({ code }))
        })),
        failingCount: failing.length,
        attempts: attempts.length
      },
      { noRerun: true }
    )
  return {
    id: entry.id,
    kind: PRIVACY_KIND,
    title: page.title,
    body: page.body.map((p) => p.text),
    covers: page.body.map((p) => list(p.covers)),
    ...(page.seo ? { seo: page.seo } : {}),
    fingerprint,
    attempts
  }
}
