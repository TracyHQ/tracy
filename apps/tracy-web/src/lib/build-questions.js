/**
 * The questionnaire a new site is asked — resolved here and nowhere else.
 *
 * 🔒 ONE SOURCE THIS ROUND: THE IMAGE'S STANDARD FILE FOR THE CMS (D11, 07/10/2026, #1013).
 * Every site is asked the seven default questions of its CMS. Three tiers used to be resolved here
 * — the quickstart's own set (released, written or generated here, or chosen in /ops), then the
 * CMS default chosen in /ops/cms (`build_questions.source`), then the standard file — and they are
 * no longer read: a released `tracy_site_question.json` with no choice made Tracy Business EmDash
 * ask twelve generated questions and SaaS three released ones on dev. There is no switch for the
 * seven. The rows those tiers read stay in the database untouched; the /ops editor, generator and
 * Use press that wrote them were removed 10/10/2026. Asking per-template questions is a later round.
 *
 * The text lives in git (the files under `src/questions/`), never in the database.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fitQuestions, withServedFields } from './fit-questions.js'
import { contentHashOf, standardIdFor } from './question-sets.js'
import { FEEDS, parseQuestions, questionsFor } from './questions-schema.mjs'

const PLATFORMS = ['wordpress', 'joomla', 'emdash']
export const STANDARD = 'standard'
export { FEEDS }

/** The CMS default sets the image carries, read once at boot like the catalogue. */
export function loadStandardQuestions(dir = fileURLToPath(new URL('../questions/', import.meta.url))) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const platform of PLATFORMS) {
    const file = `${dir}${platform}.json`
    out[platform] = parseQuestions(readFileSync(file, 'utf8'), { requireName: true, where: file })
  }
  return out
}

/**
 * What an administrator may pick as a CMS's default: its standard file, and every quickstart of
 * that platform whose entry carries a questionnaire.
 * @param {string} platform
 * @param {Record<string, any>} standard from `loadStandardQuestions`
 * @param {Record<string, any>} quickstarts the catalogue
 */
export function questionChoices(platform, standard, releases = []) {
  const options = []
  const own = standard[platform]
  if (own)
    options.push({
      id: STANDARD,
      name: `Standard (${own.questions.length} questions)`,
      count: own.questions.length
    })
  // A release may be named as a CMS default only when this server can actually ask its set: it is
  // for this platform, it is installable, and it has a questionnaire of its own.
  for (const r of releases) {
    if (r.platform !== platform || !r.choosable || !r.questions) continue
    options.push({
      id: r.tag,
      name: `${r.setting?.label ?? r.tag} (${r.questions.questions.length} questions)`,
      count: r.questions.questions.length
    })
  }
  return options
}

/**
 * The chosen default source for a platform, or `standard` when nobody chose.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} platform
 */
export async function readDefaultSource(pool, platform) {
  const { rows } = await pool.query(
    'SELECT source, revision, updated_by, updated_at FROM build_questions WHERE platform = $1',
    [platform]
  )
  const row = rows[0]
  return {
    platform,
    source: row?.source ?? STANDARD,
    revision: row?.revision ?? 0,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null
  }
}

/**
 * Compare-and-swap, same as `saveBuildBase`: a stale revision loses rather than overwrites.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} platform
 * @param {{ id: string }[]} choices
 * @param {unknown} source
 * @param {unknown} revision
 * @param {string} email
 */
export async function saveDefaultSource(pool, platform, choices, source, revision, email) {
  if (
    typeof source !== 'string' ||
    !choices.some((c) => c.id === source) ||
    !Number.isSafeInteger(revision) ||
    /** @type {number} */ (revision) < 0
  )
    return { error: 'INVALID_SOURCE' }
  const result =
    revision === 0
      ? await pool.query(
          `INSERT INTO build_questions (platform, source, updated_by)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING revision`,
          [platform, source, email]
        )
      : await pool.query(
          `UPDATE build_questions SET source=$1, updated_by=$2,
        revision=revision+1, updated_at=now() WHERE platform=$3 AND revision=$4 RETURNING revision`,
          [source, email, platform, revision]
        )
  return result.rows.length ? { ok: true } : { error: 'SOURCE_CHANGED' }
}

/**
 * The questionnaire a site is asked, one language drawn: always the standard file of its CMS (D11),
 * fitted to the template the site is built from (D7, `fit-questions.js`) — logo tiles from the
 * template profile, the release's own pages, the logo and favicon questions only while brand uploads
 * are on. The fitting happens BEFORE the hash, so `set.contentHash` and the returned `doc` (what the
 * door keeps in `question_snapshot`) are the questions the customer was really shown.
 *
 * `quickstart` and `pool` are still accepted so a caller does not change shape, and the quickstart
 * is echoed back, but neither selects the set: no stored set, choice or CMS default is read.
 * @param {object} args
 * @param {string} args.platform
 * @param {string | null} args.quickstart the archive the site starts from, when known
 * @param {string} args.lang the person's language (dsh locale)
 * @param {unknown} [args.pool] no longer read (D11)
 * @param {Record<string, any>} args.standard from `loadStandardQuestions`
 * @param {any} [args.release] the row of `readReleases` for `quickstart`, or null (no profile, no pages)
 * @param {boolean} [args.brandUploads] `brandUploadsAvailable`: false leaves the logo and favicon out
 * @param {(line: string) => void} [args.warn] where a missing template profile is reported
 * @returns {Promise<{ source: 'standard', owner: string, quickstart: string | null, languages: 'one',
 *   questions: any[], doc: any, set: { id: string, revision: number, contentHash: string } }>}
 *   `set` is the identity of the exact document served — what a Build form snapshots, and what a
 *   submit is later judged against. `languages: 'one'`: every template is built in one language (D10).
 */
export async function resolveQuestions({
  platform,
  quickstart,
  lang,
  standard,
  release = null,
  brandUploads = false,
  warn
}) {
  const file = standard[platform]
  if (!file) throw new Error(`No standard questionnaire for ${platform} in this build`)
  const doc = fitQuestions(file, { release, brandUploads, ...(warn ? { warn } : {}) })
  return {
    source: 'standard',
    owner: platform,
    quickstart,
    languages: 'one',
    questions: questionsFor(doc, lang).map((q, i) => withServedFields(q, doc.questions[i])),
    doc,
    set: { id: standardIdFor(platform), revision: 0, contentHash: contentHashOf(doc) }
  }
}
