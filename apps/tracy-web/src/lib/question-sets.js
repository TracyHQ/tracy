/**
 * The questionnaires a quickstart could be asked with, and the one it is asked with.
 *
 * 🔒 CANDIDATES, NOT AN OVERRIDE (15/09: *"the admin can choose"*). The shape this replaced had
 * one row per owner that WON over the released file, and it could not say which released file an
 * edit had been made from — so a release published afterwards lost to that edit, silently and
 * forever. Here every set is a row of its own:
 *
 *   released  — a `tracy_site_question.json` as it arrived, keyed by the sha256 of its bytes. A file
 *               that changes upstream ADDS a candidate; nothing in use is touched.
 *   custom    — written on this server, usually copied from another candidate and then edited.
 *   generated — drafted by the model from the release's capabilities (22/09); carries `provenance`
 *               (capability hash, request, prompt/schema versions, model) and `baseSetId`.
 *   standard  — the Build plugin's own set, shipped in the image. It has no row: a copy here would
 *               be a second truth that drifts, so it is a candidate the code composes.
 *
 * `question_choice` holds the decision, one row per owner. No row means "the server's own rule" —
 * the newest released set if there is one, else the CMS's standard — because a row here is a
 * DECISION and a default is not one.
 *
 * 🔒 A DRAFT NEVER BECOMES THE RULE. Before 22/09 the rule was "the first row", and with no
 * released set that was whichever custom set had been written — a Generate press changed what
 * customers were asked. The rule names only released and standard; every other row is a draft
 * until Use names it, and Use is compare-and-swapped on the choice AND on the exact content the
 * administrator was looking at.
 *
 * 🔒 READ-ONLY SINCE 10/10/2026. The generator and the /ops editor that wrote `custom` and
 * `generated` rows (and the Use press that wrote `question_choice`) were removed; the rows they
 * left are kept as data and still read here, and the customer is asked the CMS standard file
 * regardless (D11, `build-questions.js`).
 */
import { createHash } from 'node:crypto'
import { canonicalJson, validateQuestions } from './questions-schema.mjs'

export const STANDARD = 'standard'
/** The id of the composed candidate for a CMS's own set — stable, so a choice can name it. */
export const standardIdFor = (platform) => `${platform}@standard`

/** The identity of a questionnaire's CONTENT: sha256 of its canonical JSON. */
export const contentHashOf = (doc) => createHash('sha256').update(canonicalJson(doc)).digest('hex')

const parse = (doc) => (typeof doc === 'string' ? JSON.parse(doc) : doc)

const rowToSet = (r) => {
  const doc = parse(r.doc)
  return {
    id: r.id,
    owner: r.owner,
    name: r.name,
    source: r.source,
    version: r.version,
    sha256: r.sha256,
    doc,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    revision: r.revision,
    // A row written before 025 has no hash; it is hashed on read and written back on next save.
    contentHash: r.content_hash ?? contentHashOf(doc),
    baseSetId: r.base_set_id ?? null,
    provenance: r.provenance ? parse(r.provenance) : null
  }
}

/**
 * Every candidate for one owner, newest released first, with `inUse` marked.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} owner a quickstart tag, or a CMS name
 * @param {any} standardDoc the CMS's own document from the image, or null
 * @param {{ capabilityHash?: string | null }} [opts] the release's CURRENT capability hash, when
 *   known — a generated set made against another one is marked `stale`
 */
export async function candidatesFor(pool, owner, standardDoc, { capabilityHash = null } = {}) {
  const { rows } = await pool.query(
    `select id, owner, name, source, version, sha256, doc, updated_by, updated_at, revision,
            content_hash, base_set_id, provenance
       from question_set where owner = $1`,
    [owner]
  )
  const list = rows.map(rowToSet)
  list.sort((a, b) => {
    if (a.source !== b.source) {
      if (a.source === 'released') return -1
      if (b.source === 'released') return 1
    }
    if (a.source === 'released') return String(b.version ?? '').localeCompare(String(a.version ?? ''))
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  })
  if (standardDoc)
    list.push({
      id: standardIdFor(standardDoc.owner),
      owner,
      name: `Standard ${standardDoc.owner}`,
      source: STANDARD,
      version: null,
      sha256: null,
      doc: standardDoc,
      updatedBy: null,
      updatedAt: null,
      revision: 0,
      contentHash: contentHashOf(standardDoc),
      baseSetId: null,
      provenance: null
    })

  const chosen = (await pool.query('select set_id, revision from question_choice where owner = $1', [owner]))
    .rows[0]
  // The rule, when nobody decided: the newest released set, else the CMS's own. Never a draft.
  const byRule = list.find((s) => s.source === 'released') ?? list.find((s) => s.source === STANDARD) ?? null
  // A choice that names a set this build no longer has (a release withdrawn, a set deleted) falls
  // back to the rule rather than to nothing — and the screen still shows what is in use.
  const inUse = list.find((s) => s.id === chosen?.set_id) ?? byRule
  return {
    sets: list.map((s) => ({
      ...s,
      inUse: s.id === inUse?.id,
      // What today's validator says of the stored bytes. Empty for a set that can be chosen.
      problems: validateQuestions(s.doc),
      stale:
        s.source === 'generated' &&
        typeof capabilityHash === 'string' &&
        s.provenance?.capabilityHash !== capabilityHash
    })),
    inUse,
    choice: chosen ? { setId: chosen.set_id, revision: chosen.revision } : null,
    // True when the row names something gone: worth saying on the screen, never worth guessing at.
    choiceMissing: Boolean(chosen && !list.some((s) => s.id === chosen.set_id))
  }
}

/**
 * Which set every quickstart is asked with, for a whole list at once — the rule `candidatesFor`
 * applies to one owner, in one pair of queries rather than one pair per row: the chosen row, else
 * the newest RELEASED row; absent means the CMS's own set. Never a set written or generated here
 * that nobody chose.
 *
 * 🔒 ONE COPY OF THE RULE. The Quickstarts list (`ops/quickstarts.js`) and Admin attention
 * (`lib/admin-attention.js`, the `standard-questions` check) both read it from here, so the column
 * and the attention page cannot disagree about whether a quickstart still asks the standard set.
 * Before 22/09 "first row" won in the list, and a fresh draft showed up as what customers meet.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @returns {Promise<{ sets: { id: string, owner: string, name: string, source: string, version: string | null, questions: number }[],
 *   inUse: Map<string, { id: string, owner: string, name: string, source: string, version: string | null, questions: number }> }>}
 */
export async function questionsInUse(pool) {
  const [{ rows }, { rows: choices }] = await Promise.all([
    pool.query(
      `select id, owner, name, source, version, jsonb_array_length(doc -> 'questions') as questions
         from question_set order by (source = 'released') desc, version desc`
    ),
    pool.query('select owner, set_id from question_choice')
  ])
  const sets = rows.map((r) => ({ ...r, questions: Number(r.questions) }))
  const chosenOf = new Map(choices.map((r) => [r.owner, r.set_id]))
  const inUse = new Map()
  for (const set of sets) {
    const chosen = chosenOf.get(set.owner)
    const wins = chosen ? set.id === chosen : set.source === 'released' && !inUse.has(set.owner)
    if (wins) inUse.set(set.owner, set)
  }
  return { sets, inUse }
}

/** The candidate customers are actually asked for this owner, or null when there is none. */
export async function inUseSet(pool, owner, standardDoc) {
  const { inUse } = await candidatesFor(pool, owner, standardDoc)
  return inUse
}

/** The document customers are actually asked for this owner, or null when there is none. */
export async function inUseDoc(pool, owner, standardDoc) {
  return (await inUseSet(pool, owner, standardDoc))?.doc ?? null
}
