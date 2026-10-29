/**
 * Translations of each template card's English blurb, for the public Templates pages.
 *
 * The English blurb is published data on the release (`tracy_design_inspiration.json`, mirrored into
 * `quickstart_releases.inspiration` and rewritten by every read of the releases), so translations
 * cannot live there. They live in `template_blurb_translation`, keyed by the sha256 of the English:
 * a reworded blurb has a new key and is translated again, and nobody has to remember to.
 *
 * Runs on the master only, after each read of the releases and after a card is saved; shards get the
 * translations inside `GET /api/templates` (`card.blurbs`). No model on the `web` door: nothing runs
 * and every page stays English. A translation that fails a check is not stored, and that language
 * shows English; a failing card waits longer before each new try (`template_blurb_translation_failure`).
 */
import { createHash } from 'node:crypto'
import { droppedTerms, hasTerm, KEEP_VERBATIM_TERMS } from './kept-terms.js'
import { modelForDoor } from './llm-door.js'
import { readReleases, templateCards } from './quickstart-releases.js'

/** The languages a blurb is translated into: the landing site's own languages. */
export const BLURB_LANGUAGES = Object.freeze(['de', 'fr', 'es', 'it', 'nl'])
const LANGUAGE = { de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', nl: 'Dutch' }
const FORMAL = { de: 'Sie', fr: 'vous', es: 'usted', it: 'Lei', nl: 'u' }
const BRANDS = ['WordPress', 'Joomla', 'EmDash']
export const BLURB_MAX = 300
export const TRANSLATE_TIMEOUT_MS = 30_000
/** First wait after a failure; doubles each time, capped at a day. */
const BACKOFF_MS = 30 * 60 * 1000
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000

/** @param {string} english */
export const blurbHash = (english) => createHash('sha256').update(english.trim()).digest('hex')

/** The words a translation must keep exactly: kept terms the English holds, the template name, the CMS names. */
export function keptWords(english, name) {
  const terms = KEEP_VERBATIM_TERMS.filter((term) => hasTerm(english, term))
  const names = [name, ...BRANDS].filter((n) => typeof n === 'string' && n !== '' && english.includes(n))
  return [...new Set([...terms, ...names])]
}

/** Why a translation is refused, or null when it may be stored. */
export function refusalOf(english, translated, name) {
  if (typeof translated !== 'string' || translated.trim() === '') return 'empty'
  const text = translated.trim()
  if (text.length > BLURB_MAX) return 'too long'
  if (/[–—]/.test(text)) return 'dash'
  if (text.toLowerCase() === english.trim().toLowerCase()) return 'still English'
  const dropped = droppedTerms(english, text)
  if (dropped.length > 0) return `dropped ${dropped.join(', ')}`
  const lostName = [name, ...BRANDS].find((n) => n && english.includes(n) && !text.includes(n))
  return lostName ? `dropped ${lostName}` : null
}

/** One call: every missing language of one blurb. Answers `{ texts }` or `{ why }`, never throws. */
export async function translateBlurb({
  english,
  name,
  langs,
  model,
  fetchImpl = fetch,
  timeoutMs = TRANSLATE_TIMEOUT_MS
}) {
  const kept = keptWords(english, name)
  const system = [
    'You translate the short description of a website template for a public template gallery.',
    `Answer with JSON only: an object whose keys are exactly ${langs.map((l) => JSON.stringify(l)).join(', ')} (${langs.map((l) => LANGUAGE[l]).join(', ')}) and whose values are the translations.`,
    'Keep the meaning, the marketing tone and roughly the length of the English. Add no claim.',
    `Address the reader formally: ${langs.map((l) => `${LANGUAGE[l]} "${FORMAL[l]}"`).join(', ')}.`,
    ...(kept.length ? [`Keep these words exactly as written, untranslated: ${kept.join(', ')}.`] : []),
    ...(langs.includes('de')
      ? ['In German, hyphenate a compound with a kept word: "Template-Vorschau", never "Templatevorschau".']
      : []),
    'Never use an em dash or an en dash; use a comma or a full stop.',
    `At most ${String(BLURB_MAX)} characters per translation.`
  ].join('\n')
  try {
    const res = await fetchImpl(`${model.baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(timeoutMs),
      method: 'POST',
      headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model.words,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ template: name, english }) }
        ]
      })
    })
    if (!res.ok) return { why: `the model answered HTTP ${String(res.status)}` }
    const said = (await res.json())?.choices?.[0]?.message?.content
    const parsed = JSON.parse(
      String(said ?? '')
        .replace(/^\s*```(?:json)?|```\s*$/g, '')
        .trim()
    )
    if (!parsed || typeof parsed !== 'object') return { why: 'the model did not answer with an object' }
    return { texts: parsed }
  } catch (error) {
    return { why: String(error?.message ?? error).slice(0, 200) }
  }
}

/** The cards customers are offered, as `{ name, english }`, one per distinct English blurb. */
async function shownBlurbs(pool) {
  const out = new Map()
  for (const t of templateCards(await readReleases(pool))) {
    const english = typeof t.card?.blurb === 'string' ? t.card.blurb.trim() : ''
    if (english && !out.has(blurbHash(english)))
      out.set(blurbHash(english), { name: t.label ?? t.id, english })
  }
  return [...out.values()]
}

async function noteFailure(pool, sha, why, now) {
  await pool.query(
    `insert into template_blurb_translation_failure (source_sha256, failures, next_at, last_error, updated_at)
     values ($1, 1, $2::timestamptz + make_interval(secs => $3::float8 / 1000), $4, $2)
     on conflict (source_sha256) do update set
       failures = template_blurb_translation_failure.failures + 1,
       next_at = $2::timestamptz + make_interval(secs => least($3::float8 * power(2, template_blurb_translation_failure.failures), $5::float8) / 1000),
       last_error = $4, updated_at = $2`,
    [sha, now, BACKOFF_MS, why.slice(0, 500), BACKOFF_MAX_MS]
  )
}

/**
 * One pass: one model call per English blurb that lacks a language and is not backing off.
 * A call that does not answer ends the pass (the next cards would meet the same model).
 */
export async function sweepBlurbTranslations(
  pool,
  config,
  {
    fetchImpl = fetch,
    log = console,
    now = () => new Date(),
    modelOf = () => modelForDoor(pool, 'web', config, { log }),
    readCards = shownBlurbs
  } = {}
) {
  const model = await modelOf()
  if (!model) return { translated: 0, skipped: 'no model' }
  const cards = await readCards(pool)
  const shas = cards.map((c) => blurbHash(c.english))
  const have = await pool.query(
    'select source_sha256, lang from template_blurb_translation where source_sha256 = any($1)',
    [shas]
  )
  const waiting = await pool.query(
    'select source_sha256 from template_blurb_translation_failure where source_sha256 = any($1) and next_at > $2',
    [shas, now()]
  )
  const held = new Set(waiting.rows.map((r) => r.source_sha256))
  let translated = 0
  for (const card of cards) {
    const sha = blurbHash(card.english)
    const langs = BLURB_LANGUAGES.filter(
      (l) => !have.rows.some((r) => r.source_sha256 === sha && r.lang === l)
    )
    if (langs.length === 0 || held.has(sha)) continue
    // eslint-disable-next-line no-await-in-loop -- one call at a time: a sweep never floods the model.
    const answer = await translateBlurb({ english: card.english, name: card.name, langs, model, fetchImpl })
    if (!answer.texts) {
      log.warn?.(`[blurb-translations] ${card.name}: ${answer.why}`)
      await noteFailure(pool, sha, answer.why, now())
      return { translated, failed: answer.why }
    }
    const refused = []
    for (const lang of langs) {
      const why = refusalOf(card.english, answer.texts[lang], card.name)
      if (why) {
        refused.push(`${lang}: ${why}`)
        continue
      }
      await pool.query(
        `insert into template_blurb_translation (source_sha256, lang, text, model) values ($1, $2, $3, $4)
         on conflict (source_sha256, lang) do nothing`,
        [sha, lang, answer.texts[lang].trim(), model.words ?? null]
      )
      translated += 1
    }
    if (refused.length > 0) {
      log.warn?.(`[blurb-translations] ${card.name}: refused ${refused.join('; ')}`)
      await noteFailure(pool, sha, refused.join('; '), now())
    } else await pool.query('delete from template_blurb_translation_failure where source_sha256 = $1', [sha])
  }
  return { translated }
}

const job = { enabled: false, running: null, again: false }

/** Called by the cron on the master only; until then every kick does nothing (shards, tests of other doors). */
export function startBlurbTranslationJob() {
  job.enabled = true
}

/** Translate what is missing, in the background. Single flight; a kick during a pass runs one more pass. Never rejects. */
export function kickBlurbTranslations(pool, config, options = {}) {
  if (!job.enabled || !pool) return null
  if (job.running) {
    job.again = true
    return job.running
  }
  const log = options.log ?? console
  job.running = (async () => {
    try {
      do {
        job.again = false
        // eslint-disable-next-line no-await-in-loop -- one pass after another, never two at once.
        await sweepBlurbTranslations(pool, config, options)
      } while (job.again)
    } catch (error) {
      log.warn?.(`[blurb-translations] sweep failed: ${String(error?.message ?? error)}`)
    } finally {
      job.running = null
    }
  })()
  return job.running
}

/**
 * The stored translations of these English blurbs, one query: sha256 → `{ lang: text }`.
 * Any failure answers an empty map, so a page never fails over a translation.
 * @param {string[]} blurbs
 */
export async function blurbTranslations(pool, blurbs) {
  const out = new Map()
  const shas = [...new Set(blurbs.filter((b) => typeof b === 'string' && b.trim()).map(blurbHash))]
  if (!pool || shas.length === 0) return out
  try {
    const { rows } = await pool.query(
      'select source_sha256, lang, text from template_blurb_translation where source_sha256 = any($1) and lang = any($2)',
      [shas, BLURB_LANGUAGES]
    )
    for (const r of rows) out.set(r.source_sha256, { ...out.get(r.source_sha256), [r.lang]: r.text })
  } catch {}
  return out
}
