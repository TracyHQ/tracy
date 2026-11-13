// The needs profile step of the AI quickstart build (ticket #592, ADR 0046 decision 3): research in, a typed record of
// what the business has out, per data kind of the shared role vocabulary (`place-content-roles/3`). The plan composer
// (#593) reads it; the model never sees the demo or the template.
//
// ONE call to the standard build model (the model the step chain already uses; no separate smaller model) reads the
// free text of every source, source by source. Code then does everything that must not be left to a model:
// - a fact the model reports is kept only when it cites a known source and its evidence is found in that source's text;
// - structured listing fields and reviews are taken as they are, without the model;
// - disagreements become conflicts with a trust order default (`needs-profile-merge.mjs`);
// - the site language and the questions (important conflicts, main button, contact, language) follow rules
//   (`needs-profile-questions.mjs`, `needs-profile-conflict-questions.mjs`).
//
// Research, as this step reads it:
//   { sources: [{ id, origin: 'website' | 'google' | 'social', ref?, language?, text?, captions?: string[],
//                 fields?: { '<data kind>': value | value[] }, reviews?: [{ author?, text, rating? }],
//                 pictures?: [{ id, ref, label?, alt? }] }] }
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ROLE_VOCABULARY_V3 } from './place-content-roles.mjs'
import { TRUST_ORDER, mergeFacts, mergeItems } from './needs-profile-merge.mjs'
import { modelObservations, structuredObservations } from './needs-profile-observations.mjs'
import { questionsOf, siteLanguageOf } from './needs-profile-questions.mjs'
import { kindLimitsOf, storeBlocksOf } from './answer-field-limits.mjs'
import { mergeRows } from './needs-profile-rows.mjs'

export const NEEDS_PROFILE_SCHEMA = 'tracy-needs-profile/v1'
/** The draft prompt (product owner review: #600). Its hash is recorded on every profile it made. */
export const NEEDS_PROFILE_PROMPT_FILE = 'needs-profile-prompt.md'
export const NEEDS_PROFILE_PROMPT = readFileSync(
  new URL(`./${NEEDS_PROFILE_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(NEEDS_PROFILE_PROMPT).digest('hex')

/** A failure of this step, with a code the step chain reports (ADR 0047: re-run once, then stop and report). */
export class NeedsProfileError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`)
    this.code = code
  }
}

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

const usable = (s) => isText(s?.id) && TRUST_ORDER.includes(s?.origin)

/**
 * The sources of `research`, checked; throws `research_unusable` when none can be read, or when two sources share an
 * id (their observations could not be told apart, so they are never collapsed into one).
 */
export function sourcesOf(research) {
  const sources = list(research?.sources).filter(usable)
  if (sources.length === 0)
    throw new NeedsProfileError('research_unusable', 'no source with an id and a known origin')
  const ids = sources.map((s) => s.id)
  const twice = ids.find((id, n) => ids.indexOf(id) !== n)
  if (twice !== undefined)
    throw new NeedsProfileError('research_unusable', `two sources share the id "${twice}"`)
  return sources
}

/** The sources of `research` set aside (no id, or an origin outside the trust order), as `dropped` entries. */
const unusableSourcesOf = (research) =>
  list(research?.sources)
    .filter((s) => !usable(s))
    .map((s) => ({
      from: 'research',
      source: isText(s?.id) ? s.id : null,
      code: 'source_unusable',
      reason: 'a source without an id or with an origin outside the trust order',
      scope: 'observation'
    }))

/** The request of the one model call: the prompt, and the words of every source (never the template or the demo). */
export function needsProfileRequest(sources) {
  const read = sources.map((s) => ({
    id: s.id,
    origin: s.origin,
    ...(isText(s.text) ? { text: s.text } : {}),
    ...(list(s.captions).length ? { captions: list(s.captions).filter(isText) } : {}),
    ...(list(s.pictures).length
      ? { pictures: list(s.pictures).map((p) => ({ id: p.id, ...(isText(p.alt) ? { alt: p.alt } : {}) })) }
      : {})
  }))
  return { system: NEEDS_PROFILE_PROMPT, user: JSON.stringify({ sources: read }), format: 'json' }
}

/** The model's reply as an object; throws `model_reply_unreadable` when it is not the JSON the prompt asks for. */
export function readModelReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    const body = reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    try {
      value = JSON.parse(body)
    } catch {
      throw new NeedsProfileError('model_reply_unreadable', 'the reply is not JSON')
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NeedsProfileError('model_reply_unreadable', 'the reply is not a JSON object')
  return value
}

/**
 * The needs profile from research and the model's reading of it. Pure: the same inputs give the same profile.
 * @param {{sources: object[]}} research
 * @param {{facts?: object[], items?: object[], pictures?: object[], languages?: object[]}} reading
 * @param {{blockStore?: object, library?: object[]}} [template] the template's block store and the Tracy library, when
 *   known: a typed answer and every offered choice then fit the template's fields (`answer-field-limits.mjs`)
 */
export function needsProfileOf(research, reading, { blockStore, library } = {}) {
  const sources = sourcesOf(research)
  const structured = structuredObservations(sources)
  const read = modelObservations(reading ?? {}, sources)
  // A picture the research did not label takes the label the model read for it, else its own alt text.
  const labels = new Map(
    list(reading?.pictures)
      .filter((p) => isText(p?.picture) && isText(p?.label))
      .map((p) => [`${p.source}/${p.picture}`, p.label])
  )
  for (const item of structured.items)
    if (item.kind === 'gallery' && !item.label)
      item.label = labels.get(`${item.source.id}/${item.pictureId}`) ?? item.alt
  const conflicts = []
  const facts = mergeFacts([...structured.facts, ...read.facts], conflicts)
  const items = mergeItems([...read.items, ...structured.items], conflicts)
  // Rows of the business itself, most trusted source first; the key is present only when a row was kept.
  const order = (row) => TRUST_ORDER.indexOf(row.source.origin)
  const rows = mergeRows(
    [...read.rows].sort((a, b) => order(a) - order(b)),
    'business'
  )
  const said = Object.fromEntries(
    list(reading?.languages)
      .filter((l) => isText(l?.source))
      .map((l) => [l.source, l.language])
  )
  const language = siteLanguageOf(sources, said)
  const limits = blockStore ? kindLimitsOf(storeBlocksOf(blockStore, library)) : undefined
  const { questions, accounting } = questionsOf({ facts, items, conflicts, sources, language, limits })
  // Every conflict says whether a question asks it (`question`) or why none does (`notAsked`).
  const asked = new Map(
    accounting.map((a) => [a.conflict, a.question ? { question: a.question } : { notAsked: a.reason }])
  )
  const unread = language.unread.map(({ source, said: word, from }) => ({
    from,
    source,
    value: word,
    code: 'language_not_recognised',
    reason: 'the language is neither a language tag nor an unambiguous language name',
    scope: 'field'
  }))
  return {
    schema: NEEDS_PROFILE_SCHEMA,
    roleVocabularyVersion: ROLE_VOCABULARY_V3,
    prompt: { file: NEEDS_PROFILE_PROMPT_FILE, sha256: PROMPT_SHA256 },
    trustOrder: TRUST_ORDER,
    sources: sources.map((s) => ({ id: s.id, origin: s.origin, ...(isText(s.ref) ? { ref: s.ref } : {}) })),
    language,
    facts,
    items,
    ...(rows.length ? { rows } : {}),
    conflicts: conflicts.map((c) => ({ ...c, ...asked.get(c.id) })),
    questions,
    dropped: [...unusableSourcesOf(research), ...structured.dropped, ...read.dropped, ...unread]
  }
}

/**
 * The needs profile step: one call to the standard build model, then `needsProfileOf`.
 * @param {{research: object, model: (request: {system: string, user: string, format: 'json'}) => Promise<unknown>}} input
 *   `model` is the build model the step chain hands the step (a scripted fake in tests). `blockStore` and `library`
 *   (optional) are the template's: see `needsProfileOf`.
 */
export async function buildNeedsProfile({ research, model, blockStore, library }) {
  if (typeof model !== 'function') throw new NeedsProfileError('model_missing', 'no build model was given')
  const sources = sourcesOf(research)
  const reading = readModelReply(await model(needsProfileRequest(sources)))
  return needsProfileOf(research, reading, { blockStore, library })
}
