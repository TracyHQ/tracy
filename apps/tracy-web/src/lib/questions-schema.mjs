/**
 * The questionnaire a customer answers before a build — as DATA, `tracy-questions/v1`.
 *
 * Until 15/09 the questions were code (`standardQuestions()` in BuildForm.tsx), which meant every
 * CMS asked the same five and a template could not ask its own. Now a questionnaire is a JSON file
 * that lives with the thing it describes and travels with its release: a quickstart's own set
 * beside its contract or template, a CMS's default set in its Build plugin. `/ops/cms` CHOOSES and
 * SHOWS; nobody edits question text in a database (15/09) — the text carries translations
 * and every answer needs a reader, and both of those are things a release can be held to.
 *
 * 🔒 EVERY QUESTION NAMES WHO READS ITS ANSWER (`feeds`). A question with no consumer is a promise
 * the form makes on nobody's behalf — the customer types, and the text goes nowhere. The vocabulary
 * below is the set of readers that exist today; adding a feed here means adding the code that
 * reads it, in the same change.
 */

export const SCHEMA = 'tracy-questions/v1'
/**
 * v2 — the same document, plus what a GENERATED set needs to say about itself (22/09/2026,
 * Generate/Re-generate task): `required`, `showWhen` (a declarative condition on an earlier
 * answer), `capabilityRefs` (which keys of the quickstart's capability snapshot a question serves)
 * and `why` (one sentence for the administrator). A v1 file is read exactly as before; a v1 file
 * carrying v2 fields is refused, because a half-migrated set is not a set of either version.
 */
export const SCHEMA_V2 = 'tracy-questions/v2'
export const SCHEMAS = Object.freeze([SCHEMA, SCHEMA_V2])

/**
 * Who reads an answer, by id. The right-hand side is where in the repo that reader lives.
 *
 *   agent           the brief the customer's message carries into the chat (BuildForm `extras`)
 *   site.name       the site's label — `POST /api/sites` reads `answers.name`
 *   copy.about      the copy stage's "one line about the business"
 *   copy.tone       the copy stage's tone
 *   seed.pages      the seed stage's page list (`buildSeedPlan`)
 *   site.languages  the languages the site is built in (Polylang / language packs / seeder locales)
 *   template        the template's own personalize step — answers by id into the fields
 *                   `seed/personalize.json` names (`tools/personalize.mjs`, EmDash Business, 15/09)
 *   site.logo       the site brand step: the logo file(s) the customer uploaded, by upload id
 *   site.favicon    the site brand step: the favicon file the customer uploaded, by upload id
 *   site.pages      the pages the build keeps: ids from the release's own page list
 *                   (`tracy_site_pages.json`); every page not picked is hidden, home never is
 *   site.business   Build from my business: the business Tracy researches (`sites/from-business.js`)
 *
 * ⚠ The three feeds of 07/10/2026 (the seven default questions, TracyHQ/tch#1013) land before the
 * code that writes them: `briefFromAnswers` (tracy-web `site-brief.js`) carries their answers by
 * name from day one, and the brand step (`setSiteBrand`) and the page hider read them in the same
 * campaign. Until then an answer to them is kept in the brief and written nowhere.
 */
export const FEEDS = Object.freeze([
  'agent',
  'site.name',
  'copy.about',
  'copy.tone',
  'seed.pages',
  'site.languages',
  'template',
  'site.logo',
  'site.favicon',
  'site.pages',
  'site.business'
])

/**
 * Feeds whose question carries NO options in its file: the server fills them when it serves the
 * set, from the release the customer picked (`site.pages`: the release's `tracy_site_pages.json`).
 * Such a question may be authored without options, and is still valid once the server filled them.
 */
export const SERVER_OPTIONS_FEEDS = Object.freeze(['site.pages'])

/**
 * The pages the seed stage knows how to build — the only options a `seed.pages` question may offer.
 * The form's `PAGES` is this list; the seeder's `buildSeedPlan` reads the same seven words.
 */
export const SEED_PAGES = Object.freeze(['home', 'product', 'service', 'blog', 'about', 'pricing', 'contact'])

/**
 * Language tags the default questionnaires no longer offer (07/10/2026, U10 of TracyHQ/tch#1013):
 * an obsolete code (`sr-yu`) and regional variants that only duplicate a language already offered —
 * the site is written in one language, and "German (Austria)" next to "German" asked the customer to
 * choose between two copies of one thing. English keeps two: `en-gb` and `en-us`. The language
 * catalogues keep these packs; only the question stops offering them
 * (`scripts/joomla-language-options.mjs`, `scripts/wordpress-language-options.mjs`).
 */
export const DROPPED_LANGUAGE_OPTIONS = Object.freeze([
  'sr-yu',
  'de-at',
  'de-ch',
  'de-li',
  'de-lu',
  'en-au',
  'en-ca',
  'en-nz',
  'fr-ca',
  'nl-be'
])

/**
 * Where each consumer READS an answer from — the binding a question makes when it names a feed.
 *
 * 🔒 THE READERS READ BY ID, so a binding is not a free-form path the author (or a model) may
 * invent: a question feeding `copy.about` IS the question with id `about`, because
 * `siteFromAnswers` reads `answers.about` and nothing else. `target: null` means "by the
 * question's own id" (the brief carries every id; a template's personalize map names its own).
 * `kinds` is the control that consumer can read; `options`, when set, the only values it accepts.
 * A v2 document is held to this table; a v1 document is not (it predates it, and its readers
 * already cope — see `bindingsOf`).
 */
export const CONSUMERS = Object.freeze({
  agent: { reads: 'brief.answers', target: null },
  'site.name': { reads: 'site label', target: 'name', kinds: ['text'] },
  'copy.about': { reads: 'copy stage prompt', target: 'about', kinds: ['text', 'longtext'] },
  'copy.tone': { reads: 'copy stage prompt', target: 'tone', kinds: ['choice', 'text'] },
  'seed.pages': { reads: 'seed stage plan', target: 'pages', kinds: ['multi'], options: SEED_PAGES },
  'site.languages': { reads: 'build languages', target: 'languages', kinds: ['languages'] },
  template: { reads: 'template personalize fields', target: null },
  'site.logo': { reads: 'site brand step', target: 'logo', kinds: ['logo'] },
  'site.favicon': { reads: 'site brand step', target: 'favicon', kinds: ['favicon'] },
  // No `options`: the pages are the release's own, filled in by the server (SERVER_OPTIONS_FEEDS).
  'site.pages': { reads: 'pages the build keeps', target: 'pages', kinds: ['multi'] },
  // Add site's Build from my business (`sites/from-business.js`): the business Tracy researches and builds from.
  'site.business': { reads: 'from-business door', target: 'business', kinds: ['business'] }
})

/**
 * Every binding one question makes: `{ consumer, target }`, target being the id its reader looks up.
 * @param {any} q
 * @returns {{ consumer: string, target: string }[]}
 */
export function bindingsOf(q) {
  /** @type {Record<string, { target: string | null }>} */
  const table = CONSUMERS
  return (Array.isArray(q?.feeds) ? q.feeds : [])
    .filter((/** @type {string} */ f) => table[f] !== undefined)
    .map((/** @type {string} */ consumer) => ({ consumer, target: table[consumer].target ?? q.id }))
}

/**
 * How an answer is drawn. Five, since 15/09: `longtext` (a textarea) and `languages` (the language
 * box) used to be picked BY ID — `about` and `languages` — so a set that named a question anything
 * else got the wrong control. Naming the drawing lets any set use it under any id (15/09).
 * `languages` takes options like `multi` (the languages offered); `longtext` takes none like `text`.
 *
 * `logo` and `favicon` (07/10/2026) are file questions: the answer is the id the upload door
 * returned (`POST /api/sites/brand-files`), never the file. A logo answer is one id, or one id per
 * tile (`{ light?, dark?, single? }`); a favicon answer is one id. Neither takes options.
 *
 * `business` (23/10/2026) is the business Tracy researches for Build from my business: a picked Google place
 * (`{ place: { provider, providerId, name } }`) or a pasted link (`{ url }`). Only that start draws it; the
 * Customize sheet's `SHEET_KINDS` leaves it out. It takes no options.
 */
export const KINDS = Object.freeze([
  'text',
  'longtext',
  'choice',
  'multi',
  'languages',
  'logo',
  'favicon',
  'business'
])
const WITH_OPTIONS = new Set(['choice', 'multi', 'languages'])

/**
 * The logo layouts a template can have, and the tiles each one draws (`variants` on the served logo
 * question, set by the server from the template profile): `pair` a light and a dark logo, `dark` one
 * logo on a dark header, `single` one logo.
 */
export const LOGO_LAYOUTS = Object.freeze({
  pair: Object.freeze(['light', 'dark']),
  dark: Object.freeze(['dark']),
  single: Object.freeze(['single'])
})

/**
 * Which layout a list of tiles is: the key of `LOGO_LAYOUTS` whose tiles it holds. Anything else —
 * absent, empty, unknown — is `single`, the one-tile question a set without a profile asks.
 * @param {unknown} variants
 * @returns {'pair' | 'dark' | 'single'}
 */
export function logoLayoutOf(variants) {
  const list = Array.isArray(variants) ? variants : []
  if (list.includes('light') && list.includes('dark')) return 'pair'
  if (list.length === 1 && list[0] === 'dark') return 'dark'
  return 'single'
}

/**
 * A served logo question fitted to a template: its tiles (`variants`) and the hint of that layout
 * (`variantHints[layout]`, falling back to the question's own `hint`). Pure; the input is not changed.
 * The server calls it when it knows the template; the form draws whatever it is given.
 * @template {{ hint?: string, variantHints?: Record<string, string> }} Q
 * @param {Q} question one question as `questionsFor` returns it
 * @param {readonly string[]} variants
 * @returns {Q & { variants: string[] }}
 */
export function withLogoVariants(question, variants) {
  const layout = logoLayoutOf(variants)
  const hint = question.variantHints?.[layout] ?? question.hint
  /** @type {any} */
  const out = { ...question, variants: [...LOGO_LAYOUTS[layout]] }
  if (hint !== undefined) out.hint = hint
  return out
}

const ID = /^[a-z][a-z0-9-]*$/
const LANG = /^[a-z]{2}(-[A-Za-z]{2,4})?$/

/**
 * Every way a questionnaire can be wrong, as sentences. Empty means valid.
 *
 * Deliberately a list and not a throw: the gate prints all of them at once, and a release author
 * fixes a file in one round rather than one problem per run.
 * @param {unknown} doc
 * @param {{ requireName?: boolean, capabilities?: Set<string> | null }} [opts] `requireName`: a CMS
 *   default set must carry `name` — the create door reads it as the site's label, and a default set
 *   without it builds an unnamed site. `capabilities`: the keys of the snapshot a v2 set was
 *   generated against; when given, every `capabilityRefs` entry must be one of them.
 * @returns {string[]}
 */
export function validateQuestions(doc, { requireName = false, capabilities = null } = {}) {
  /** @type {string[]} */
  const problems = []
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not an object']
  const d = /** @type {Record<string, any>} */ (doc)
  if (!SCHEMAS.includes(d.schemaVersion))
    problems.push(
      `schemaVersion must be one of ${SCHEMAS.join(', ')}, got ${JSON.stringify(d.schemaVersion)}`
    )
  const v2 = d.schemaVersion === SCHEMA_V2
  if (typeof d.owner !== 'string' || d.owner === '')
    problems.push('owner must name the quickstart id or the CMS this set belongs to')
  const languages = Array.isArray(d.languages) ? d.languages : null
  if (!languages || languages.length === 0) problems.push('languages must list at least one language')
  else {
    for (const l of languages)
      if (typeof l !== 'string' || !LANG.test(l))
        problems.push(`language ${JSON.stringify(l)} is not a language tag`)
    if (!languages.includes('en')) problems.push('languages must include en — the form falls back to it')
  }
  if (!Array.isArray(d.questions) || d.questions.length === 0) {
    problems.push('questions must be a non-empty list')
    return problems
  }
  const seen = new Set()
  const langs = languages ?? ['en']
  /** @param {any} value @param {string} where */
  const text = (value, where) => {
    if (!value || typeof value !== 'object') {
      problems.push(`${where} must be an object of language → text`)
      return
    }
    for (const l of langs)
      if (typeof value[l] !== 'string' || value[l].trim() === '') problems.push(`${where} has no ${l} text`)
  }
  d.questions.forEach((q, i) => {
    const where = `questions[${i}]${typeof q?.id === 'string' ? ` (${q.id})` : ''}`
    if (!q || typeof q !== 'object') {
      problems.push(`${where} is not an object`)
      return
    }
    if (typeof q.id !== 'string' || !ID.test(q.id)) problems.push(`${where}: id must match ${ID}`)
    else if (seen.has(q.id)) problems.push(`${where}: id repeats`)
    else seen.add(q.id)
    if (!KINDS.includes(q.kind)) problems.push(`${where}: kind must be one of ${KINDS.join(', ')}`)
    // Which page of the form (1-based); absent is page one. The form draws as many pages as there
    // are distinct values — this replaced the hard-coded `STEP_ONE` id list on 15/09.
    if (q.step !== undefined && !(Number.isInteger(q.step) && q.step >= 1))
      problems.push(`${where}: step must be a whole number from 1`)
    text(q.label, `${where}.label`)
    if (q.hint !== undefined) text(q.hint, `${where}.hint`)
    if (q.variantHints !== undefined) {
      if (q.kind !== 'logo') problems.push(`${where}: only a logo question has variantHints`)
      else if (!q.variantHints || typeof q.variantHints !== 'object' || Array.isArray(q.variantHints))
        problems.push(`${where}.variantHints must be an object of layout → text`)
      else
        for (const [layout, value] of Object.entries(q.variantHints)) {
          if (!(layout in LOGO_LAYOUTS))
            problems.push(
              `${where}.variantHints: ${JSON.stringify(layout)} is not a logo layout (known: ${Object.keys(LOGO_LAYOUTS).join(', ')})`
            )
          else text(value, `${where}.variantHints.${layout}`)
        }
    }
    // A question whose options the server fills (SERVER_OPTIONS_FEEDS) may come without them.
    const serverOptions =
      Array.isArray(q.feeds) && q.feeds.some((/** @type {string} */ f) => SERVER_OPTIONS_FEEDS.includes(f))
    if (WITH_OPTIONS.has(q.kind)) {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        if (!(serverOptions && q.options === undefined)) problems.push(`${where}: ${q.kind} needs options`)
      } else {
        for (const o of q.options)
          if (typeof o !== 'string' || !ID.test(o))
            problems.push(`${where}: option ${JSON.stringify(o)} must match ${ID}`)
        if (q.optionLabels !== undefined) {
          if (!q.optionLabels || typeof q.optionLabels !== 'object')
            problems.push(`${where}.optionLabels must be an object`)
          else
            for (const o of q.options)
              if (q.optionLabels[o] !== undefined) text(q.optionLabels[o], `${where}.optionLabels.${o}`)
        }
      }
    } else if (q.options !== undefined) problems.push(`${where}: a text question has no options`)
    if (!Array.isArray(q.feeds) || q.feeds.length === 0)
      problems.push(`${where}: feeds must name who reads the answer`)
    else
      for (const f of q.feeds)
        if (!FEEDS.includes(f))
          problems.push(`${where}: feed ${JSON.stringify(f)} has no reader (known: ${FEEDS.join(', ')})`)
    if (v2) validateV2Question(q, i, d.questions, where, problems, capabilities)
    else
      for (const key of V2_FIELDS)
        if (q[key] !== undefined)
          problems.push(`${where}: ${key} is a ${SCHEMA_V2} field; this document says ${d.schemaVersion}`)
  })
  if (requireName && !seen.has('name'))
    problems.push('a CMS default set must ask for `name` — the create door reads it as the site label')
  return problems
}

const V2_FIELDS = ['required', 'showWhen', 'capabilityRefs', 'why']
const MAX_CLAUSES = 4

/**
 * The v2 half of one question: `required`, `showWhen`, `capabilityRefs`, `why`, and the binding
 * rules of `CONSUMERS`. Every refusal is pushed onto `problems` as a sentence, like the rest.
 * @param {any} q
 * @param {number} i
 * @param {any[]} questions the whole list — a condition may only look at questions BEFORE `i`
 * @param {string} where
 * @param {string[]} problems
 * @param {Set<string> | null} capabilities
 */
function validateV2Question(q, i, questions, where, problems, capabilities) {
  if (q.required !== undefined && typeof q.required !== 'boolean')
    problems.push(`${where}: required must be true or false`)
  if (q.why !== undefined && (typeof q.why !== 'string' || q.why.trim() === ''))
    problems.push(`${where}: why must be a sentence for the administrator`)
  if (q.capabilityRefs !== undefined) {
    if (!Array.isArray(q.capabilityRefs) || q.capabilityRefs.length === 0)
      problems.push(`${where}: capabilityRefs must list at least one capability key`)
    else
      for (const ref of q.capabilityRefs) {
        if (typeof ref !== 'string' || ref.trim() === '')
          problems.push(`${where}: capabilityRefs holds something that is not a key`)
        else if (capabilities && !capabilities.has(ref))
          problems.push(
            `${where}: capabilityRefs names ${JSON.stringify(ref)}, which the capability snapshot does not have`
          )
      }
  }
  // Bindings: a fixed consumer reads one id and one control; a question that names it must BE that.
  /** @type {Record<string, { target: string | null, kinds?: string[], options?: readonly string[] }>} */
  const table = CONSUMERS
  for (const f of Array.isArray(q.feeds) ? q.feeds : []) {
    const consumer = table[f]
    if (!consumer) continue
    if (consumer.target !== null && q.id !== consumer.target)
      problems.push(
        `${where}: feed ${f} reads the answer of id \`${consumer.target}\`; a question with id \`${String(q.id)}\` feeds nobody there`
      )
    if (consumer.kinds && !consumer.kinds.includes(q.kind))
      problems.push(
        `${where}: feed ${f} reads a ${consumer.kinds.join(' or ')} answer, not kind ${String(q.kind)}`
      )
    if (consumer.options && Array.isArray(q.options))
      for (const o of q.options)
        if (!consumer.options.includes(o))
          problems.push(
            `${where}: feed ${f} knows no page ${JSON.stringify(o)} (known: ${consumer.options.join(', ')})`
          )
  }
  if (q.showWhen === undefined) return
  const clauses = q.showWhen && typeof q.showWhen === 'object' ? q.showWhen.all : undefined
  if (!Array.isArray(clauses) || clauses.length === 0 || clauses.length > MAX_CLAUSES) {
    problems.push(`${where}: showWhen.all must list 1 to ${MAX_CLAUSES} conditions`)
    return
  }
  const earlier = new Map(questions.slice(0, i).map((x) => [x?.id, x]))
  /** `is` values seen per question, to catch two different ones — a condition that never holds. */
  const isSeen = new Map()
  clauses.forEach((clause, n) => {
    const at = `${where}.showWhen.all[${n}]`
    if (!clause || typeof clause !== 'object') {
      problems.push(`${at} is not a condition`)
      return
    }
    const hasIs = clause.is !== undefined
    const hasHas = clause.has !== undefined
    if (hasIs === hasHas) {
      problems.push(
        `${at}: a condition says either \`is\` (a choice) or \`has\` (a multi), not both, not neither`
      )
      return
    }
    if (clause.question === q.id) {
      problems.push(`${at}: a question cannot depend on itself`)
      return
    }
    const ref = earlier.get(clause.question)
    if (!ref) {
      problems.push(
        questions.some((x) => x?.id === clause.question)
          ? `${at}: ${JSON.stringify(clause.question)} comes later — a condition may only look at an earlier question`
          : `${at}: no question ${JSON.stringify(clause.question)} to look at`
      )
      return
    }
    const options = Array.isArray(ref.options) ? ref.options : null
    if (!options) {
      problems.push(`${at}: ${JSON.stringify(clause.question)} has no options to match`)
      return
    }
    const value = hasIs ? clause.is : clause.has
    if (hasIs && ref.kind !== 'choice') {
      problems.push(
        `${at}: \`is\` matches a choice; ${JSON.stringify(clause.question)} is a ${String(ref.kind)} — use \`has\``
      )
      return
    }
    if (hasHas && !['multi', 'languages'].includes(ref.kind)) {
      problems.push(
        `${at}: \`has\` matches a multi; ${JSON.stringify(clause.question)} is a ${String(ref.kind)} — use \`is\``
      )
      return
    }
    if (!options.includes(value)) {
      problems.push(`${at}: ${JSON.stringify(clause.question)} has no option ${JSON.stringify(value)}`)
      return
    }
    if (hasIs) {
      const seen = isSeen.get(clause.question)
      if (seen !== undefined && seen !== value)
        problems.push(
          `${at}: ${JSON.stringify(clause.question)} cannot be both ${JSON.stringify(seen)} and ${JSON.stringify(value)} — this question would never show`
        )
      isSeen.set(clause.question, value)
    }
  })
}

/**
 * An answer nobody gave: absent, null, blank text, or an empty list.
 * @param {unknown} value
 */
export function isEmptyAnswer(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Whether one question is shown, given the answers so far — the ONE evaluator every surface
 * uses: the Ops preview, the Build form and the server that checks a submit. A clause holds only
 * when the question it looks at is itself shown and answered that way; so hiding a root hides
 * everything downstream of it, however deep.
 * @param {any} q
 * @param {Record<string, unknown> | null | undefined} answers
 * @param {Map<string, any>} byId every question, by id
 * @param {number} [depth]
 * @returns {boolean}
 */
export function isShown(q, answers, byId, depth = 0) {
  const clauses = q?.showWhen?.all
  if (!Array.isArray(clauses) || clauses.length === 0) return true
  if (depth > 32) return false // a cycle the validator did not see: a hidden question, never a hang
  return clauses.every((/** @type {any} */ clause) => {
    const ref = byId.get(clause.question)
    if (!ref || !isShown(ref, answers, byId, depth + 1)) return false
    const value = answers?.[clause.question]
    if (clause.is !== undefined) return value === clause.is
    if (clause.has !== undefined) return Array.isArray(value) && value.includes(clause.has)
    return false
  })
}

/**
 * The questions a person is asked, in order, given what they answered so far.
 * @template {{ id: string }} Q
 * @param {Q[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {Q[]}
 */
export function visibleQuestions(questions, answers) {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return questions.filter((q) => isShown(q, answers, byId))
}

/**
 * The answers that COUNT: those of shown questions only. A field a customer filled and then hid
 * by changing an earlier choice is not part of the brief — the form may keep the text around in
 * case they change their mind, but this is what the server reads.
 * @param {{ id: string }[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {Record<string, unknown>}
 */
export function effectiveAnswers(questions, answers) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const q of visibleQuestions(questions, answers))
    if (answers && answers[q.id] !== undefined) out[q.id] = answers[q.id]
  return out
}

/**
 * The ids of required questions that are shown and not answered.
 * @param {{ id: string, required?: boolean }[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {string[]}
 */
export function missingRequired(questions, answers) {
  return visibleQuestions(questions, answers)
    .filter((q) => q.required === true && isEmptyAnswer(answers?.[q.id]))
    .map((q) => q.id)
}

/**
 * JSON with keys sorted at every depth — so two documents that say the same thing produce the
 * same bytes, and a hash of those bytes is the identity of the CONTENT rather than of the typing.
 * Pure on purpose: the client bundle imports this file and cannot import node:crypto.
 * @param {any} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/**
 * One language's text out of a `{ lang: text }` map, falling back to English.
 * @param {Record<string, string> | undefined} map
 * @param {string} lang
 */
export function pick(map, lang) {
  if (!map) return undefined
  const short = lang.split('-')[0]
  return map[lang] ?? map[short] ?? map.en
}

/**
 * The questionnaire as the form draws it: labels already in one language.
 *
 * The shape is the form's `Question` (`client/api.ts`): `{ id, label, kind, options?, hint? }` plus
 * `optionLabels` for choices whose ids are not words, and `feeds` carried along so the message
 * builder can tell an agent-only answer from one a stage reads.
 * @param {{ languages: string[], questions: any[] }} doc a VALID document
 * @param {string} lang
 */
export function questionsFor(doc, lang) {
  return doc.questions.map((q) => {
    /** @type {Record<string, unknown>} */
    const out = {
      id: q.id,
      kind: q.kind,
      step: q.step ?? 1,
      label: pick(q.label, lang),
      feeds: [...q.feeds],
      required: q.required === true
    }
    if (q.showWhen) out.showWhen = structuredClone(q.showWhen)
    const hint = pick(q.hint, lang)
    if (hint !== undefined) out.hint = hint
    if (q.options) out.options = [...q.options]
    if (q.variantHints) {
      /** @type {Record<string, string>} */
      const hints = {}
      for (const [layout, map] of Object.entries(q.variantHints)) {
        const t = pick(/** @type {Record<string, string>} */ (map), lang)
        if (t !== undefined) hints[layout] = t
      }
      out.variantHints = hints
    }
    if (q.optionLabels) {
      /** @type {Record<string, string>} */
      const labels = {}
      for (const [o, map] of Object.entries(q.optionLabels)) {
        const t = pick(map, lang)
        if (t !== undefined) labels[o] = t
      }
      out.optionLabels = labels
    }
    return out
  })
}

/**
 * Parse and validate a questionnaire, throwing with every problem at once.
 * @param {string} raw
 * @param {{ requireName?: boolean, where?: string }} [opts]
 */
export function parseQuestions(raw, { requireName = false, where = 'questions.json' } = {}) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${where} is not JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  const problems = validateQuestions(doc, { requireName })
  if (problems.length > 0) throw new Error(`${where}:\n  - ${problems.join('\n  - ')}`)
  return doc
}
