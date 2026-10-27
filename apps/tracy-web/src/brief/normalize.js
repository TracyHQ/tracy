/**
 * Turn typed answers, chat messages and assets into a site brief — in CODE, before any model runs.
 *
 * 🔒 WHY THIS IS NOT A MODEL STEP. The brief is the record of what the customer actually said. A
 * model asked to produce it will, on a thin input, produce a plausible business instead of an
 * honest gap: an address, an opening hour, a founder's name, a price. Those read as facts on the
 * finished site and nobody downstream can tell them from the real ones. So this file does the
 * whole job with rules — every fact keeps the source it came from (`factRefs`), anything nobody
 * supplied goes to `missing`, and two sources that disagree go to `conflicts` carrying BOTH values
 * rather than a winner. The model's turn comes later, on a brief that already knows its own gaps.
 *
 * 🔒 THE DEMO'S FACTS ARE NOT THE CUSTOMER'S FACTS. A quickstart ships a whole working business —
 * a name, an address, testimonials, prices. Those arrive on the same wire as the customer's own
 * answers (the capability snapshot, the release setting) and are trivially mistaken for input.
 * `DEMO_SOURCE_KINDS` is the line: a value sourced from the archive can never become a `fact`, and
 * a key that ONLY the archive answered is `missing` with `why: 'demo-only'`. `normalize.test.mjs`
 * holds this one on its own because it is the failure that ships a fake business to a real one.
 *
 * ⚠ BLOCKED on session A. `fromTypedAnswers` is the adapter for A's typed-answer export, whose
 * module and shape are not on this branch yet (checked 22/09: A's work is uncommitted in its own
 * worktree). It reads the smallest shape that can be honest — `{ questionId, key, value }` — and
 * that is deliberately a seam, not a guess at A's schema. When A publishes, this adapter is the one
 * file that changes.
 */
import {
  BRIEF_SCHEMA,
  CUSTOMER_SOURCE_KINDS,
  DEMO_SOURCE_KINDS,
  envelopeHash,
  validateSiteBrief
} from './schema.mjs'

/**
 * Facts a site must never carry unless a person supplied them. Not a style list: each of these is a
 * claim a visitor can act on and be wrong about — turn up at an address, ring a number, pay a
 * price, trust a certification. A model filling one of these to complete a layout is the single
 * most expensive thing this pipeline can do, so they are named here and refused by rule.
 */
export const NEVER_INFERRED = Object.freeze([
  'address',
  'phone',
  'email',
  'openingHours',
  'staff',
  'founded',
  'statistics',
  'testimonials',
  'prices',
  'certifications',
  'licenses',
  'awards'
])

/** The fact keys a build cannot go without, read from the capability snapshot's own `core:` rows. */
export function requiredFactKeys(capabilities) {
  return (capabilities?.capabilities ?? [])
    .filter((c) => c?.kind === 'core' && typeof c.key === 'string')
    .map((c) => c.key.slice('core:'.length))
    .filter(Boolean)
}

/**
 * What a typed answer is FILED UNDER, given the question it answered.
 *
 * 🔒 `capabilityRefs` IS THE IDENTITY; `feeds` IS THE ROUTING. Measured 22/09/2026 against session
 * A's committed questionnaire (`tracy-apple/j6#gen-mucwqooe-fv9l`, schema `tracy-questions/v2`,
 * commit 17743927c): a question carries BOTH — `name` has `feeds: ['site.name', 'agent']` and
 * `capabilityRefs: ['core:name']`. Filing the answer under its `feeds` entry produced a brief with
 * four facts and, at the same time, `missing: [about, contact, name, tone]` — the customer had
 * answered every one of them. `requiredFactKeys` reads the snapshot's `core:` rows and strips the
 * prefix, so the vocabulary a fact must be spelled in is `name`, not `site.name`. `feeds` says
 * where an answer GOES (`agent` means the chat context, not a fact at all); it was never a name.
 *
 * So: an explicit `key` wins, then the `core:` capability the question names, then a `feeds` entry
 * that is not `agent`, then the question id. Nothing here guesses — every step reads a field the
 * question itself declares.
 *
 * @param {{questionId: string, key?: string, value: unknown, at?: string, setRevision?: number,
 *   capabilityRefs?: string[], feeds?: string[]}[]} answers
 */
export function fromTypedAnswers(answers = []) {
  return answers
    .filter((a) => a && typeof a === 'object')
    .map((a, i) => {
      const core = (a.capabilityRefs ?? []).find((r) => typeof r === 'string' && r.startsWith('core:'))
      const feed = (a.feeds ?? []).find((f) => typeof f === 'string' && f && f !== 'agent')
      const key =
        (typeof a.key === 'string' && a.key ? a.key : null) ??
        (core ? core.slice('core:'.length) : null) ??
        feed ??
        String(a.questionId ?? `answer-${i}`)
      return {
        key,
        value: a.value,
        kind: 'answer',
        ref: String(a.questionId ?? `answer-${i}`),
        at: typeof a.at === 'string' ? a.at : null,
        revision: Number.isInteger(a.setRevision) ? a.setRevision : null,
        // Kept so a later step can route the same answer where the question said it goes, without
        // re-reading the questionnaire. Never part of the fact's identity.
        ...(a.capabilityRefs ? { capabilityRefs: a.capabilityRefs } : {}),
        ...(a.feeds ? { feeds: a.feeds } : {})
      }
    })
}

/** A value that carries no information. Empty is a gap, never a fact. */
const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

/** Two values are the same fact when their canonical text matches after trimming. */
const sameValue = (a, b) =>
  JSON.stringify(typeof a === 'string' ? a.trim() : a) ===
  JSON.stringify(typeof b === 'string' ? b.trim() : b)

/**
 * Build the site brief.
 *
 * @param {object} args
 * @param {{buildId: string, siteKey: string, tenantId: string, workspaceId?: string}} args.build
 *   the build context, taken from the server's own session — never from a model's output.
 * @param {{tag: string, platform?: string|null, version?: string|null, capabilitiesHash: string}} args.release
 * @param {any} [args.capabilities] the capability snapshot session A's reader produced
 * @param {{key: string, value: unknown, kind: string, ref: string, at?: string|null}[]} [args.answers]
 *   typed answers, already passed through `fromTypedAnswers`
 * @param {{messageId: string, at?: string, facts?: {key: string, value: unknown}[]}[]} [args.chat]
 *   chat messages of THIS site's session. A message only contributes a fact when the caller has
 *   already extracted one; raw prose stays a source for the model step, never a fact here.
 * @param {{assetId: string, tenantId: string, role?: string, alt?: string}[]} [args.assets]
 * @param {{primary: string, secondary?: string[]}} args.locales
 * @param {{value: string, ref?: string}} [args.tone]
 * @param {{label: string, href: string, ref?: string}} [args.cta]
 * @param {number} [args.revision]
 * @param {string[]} [args.demoFacts] fact keys the ARCHIVE answers — recorded, never adopted
 */
export function normalizeBrief({
  build,
  release,
  capabilities = null,
  answers = [],
  chat = [],
  assets = [],
  locales,
  tone = null,
  cta = null,
  revision = 1,
  demoFacts = [],
  createdAt = new Date().toISOString()
}) {
  if (!build?.buildId || !build?.siteKey || !build?.tenantId)
    throw new Error('A brief is normalized against a build context, not against its own content')
  if (!release?.tag || !release?.capabilitiesHash)
    throw new Error('A brief pins the release and capability snapshot it was read against')

  /** @type {{id: string, kind: string, ref: string, at: string|null}[]} */
  const sources = []
  const sourceId = (kind, ref, at = null) => {
    const existing = sources.find((s) => s.kind === kind && s.ref === ref)
    if (existing) return existing.id
    sources.push({ id: `s${sources.length}`, kind, ref, at })
    return `s${sources.length - 1}`
  }

  /** Every candidate value for a key, with where it came from. Conflicts are read off this. */
  /** @type {Map<string, {value: unknown, from: string, kind: string}[]>} */
  const candidates = new Map()
  const offer = (key, value, kind, ref, at) => {
    if (!key) return
    const from = sourceId(kind, ref, at ?? null)
    if (isEmpty(value)) return
    const list = candidates.get(key) ?? []
    list.push({ value, from, kind })
    candidates.set(key, list)
  }

  for (const a of answers) {
    if (!CUSTOMER_SOURCE_KINDS.includes(a.kind ?? 'answer'))
      throw new Error(`An answer cannot carry source kind ${String(a.kind)}`)
    offer(a.key, a.value, 'answer', a.ref, a.at)
  }
  for (const message of chat) {
    const ref = String(message?.messageId ?? '')
    if (!ref) continue
    sourceId('chat', ref, message.at ?? null)
    for (const fact of message.facts ?? []) offer(fact?.key, fact?.value, 'chat', ref, message.at ?? null)
  }
  // The archive's own answers are recorded so the gap they cover is visible, and then left alone.
  for (const key of demoFacts) sourceId('release-demo', `demo:${key}`, null)

  /** @type {{key: string, value: unknown, factRefs: string[]}[]} */
  const facts = []
  /** @type {{key: string, why: string}[]} */
  const missing = []
  /** @type {{key: string, values: {value: unknown, factRefs: string[]}[]}[]} */
  const conflicts = []

  for (const [key, list] of [...candidates.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const customer = list.filter((c) => CUSTOMER_SOURCE_KINDS.includes(c.kind))
    if (customer.length === 0) {
      // Only the archive spoke. That is not an answer; it is a gap wearing the demo's clothes.
      missing.push({ key, why: 'demo-only' })
      continue
    }
    const distinct = []
    for (const c of customer) {
      const same = distinct.find((d) => sameValue(d.value, c.value))
      if (same) same.factRefs.push(c.from)
      else distinct.push({ value: c.value, factRefs: [c.from] })
    }
    if (distinct.length > 1) {
      conflicts.push({ key, values: distinct })
      continue
    }
    facts.push({ key, value: distinct[0].value, factRefs: distinct[0].factRefs })
  }

  const answered = new Set([...facts.map((f) => f.key), ...conflicts.map((c) => c.key)])
  // The archive's answers first, and with their own reason. A key the demo fills and the customer
  // did not is a gap that has to be VISIBLE even when no question asked for it — `NEVER_INFERRED`
  // is the list of the ones that cost the most — and `demo-only` says something `never-supplied`
  // does not: there is already content sitting in that place, and it is somebody else's.
  for (const key of demoFacts)
    if (!answered.has(key) && !missing.some((m) => m.key === key)) missing.push({ key, why: 'demo-only' })
  for (const key of requiredFactKeys(capabilities))
    if (!answered.has(key) && !missing.some((m) => m.key === key))
      missing.push({ key, why: 'never-supplied' })

  missing.sort((a, b) => (a.key < b.key ? -1 : 1))

  const pages = (capabilities?.capabilities ?? [])
    .filter((c) => c?.kind === 'page' || c?.kind === 'collection')
    .map((page) => ({
      key: page.key,
      label: page.label ?? null,
      role: page.meaning?.role ?? null,
      blocks: (capabilities?.capabilities ?? [])
        .filter((b) => b?.kind === 'block' && typeof b.key === 'string' && b.page === page.key)
        .map((b) => ({ key: b.key, role: b.meaning?.role ?? null, can: b.can ?? [] }))
    }))

  const briefAssets = assets
    .filter((a) => a?.assetId)
    .map((a) => ({
      assetId: a.assetId,
      tenantId: a.tenantId ?? null,
      role: a.role ?? null,
      alt: a.alt ?? null,
      factRefs: [sourceId('asset', a.assetId, null)]
    }))

  const body = {
    schema: BRIEF_SCHEMA,
    revision,
    site: {
      buildId: build.buildId,
      siteKey: build.siteKey,
      tenantId: build.tenantId,
      workspaceId: build.workspaceId ?? null
    },
    release: {
      tag: release.tag,
      platform: release.platform ?? null,
      version: release.version ?? null,
      capabilitiesHash: release.capabilitiesHash
    },
    sources,
    facts,
    missing,
    conflicts,
    pages,
    locales: { primary: locales?.primary, secondary: locales?.secondary ?? [] },
    tone: tone?.value
      ? { value: tone.value, factRefs: [sourceId('answer', tone.ref ?? 'tone', null)] }
      : null,
    cta:
      cta?.label && cta?.href
        ? { label: cta.label, href: cta.href, factRefs: [sourceId('answer', cta.ref ?? 'cta', null)] }
        : null,
    assets: briefAssets,
    status: missing.length || conflicts.length ? 'needs_input' : 'ready'
  }
  const brief = { ...body, createdAt, hash: envelopeHash(body) }
  const check = validateSiteBrief(brief)
  if (!check.ok)
    throw new Error(
      `The normalized brief is not a valid brief: ${check.errors.map((e) => e.code).join(', ')}`
    )
  return brief
}

/** Fact keys the archive supplied and nobody else did — what a follow-up question has to ask for. */
export function questionsToAsk(brief) {
  return (brief?.missing ?? []).map((m) => m.key)
}

export { DEMO_SOURCE_KINDS }
