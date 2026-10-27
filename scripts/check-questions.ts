/**
 * Questionnaire gate — every `questions.json` in the tree and every pinned catalogue questionnaire is
 * valid, and the declared copy matches the released one.
 *
 * WHY IT MUST BE A MACHINE. A questionnaire is per-release data (decided 15/09): the form draws exactly
 * what the file says, and the answers go exactly where the file says (`feeds`). Its three failures show
 * up NOWHERE:
 *
 *   1. Missing translation — the form draws English labels in the middle of a Vietnamese form, no error.
 *   2. A question nobody reads (`feeds` empty or pointing at a reader that does not exist) — the customer
 *      types, the words go nowhere; exactly what was caught on EmDash on 15/09 when the form asked four
 *      questions no stage used.
 *   3. The catalogue promises a different questionnaire than the release — `quickstarts.json` carries the
 *      inline copy (what tracy-web and the fleet read), the release carries the file in the zip; one word
 *      of drift and the site is asked something other than what the template was designed to receive.
 *
 * The gate reads THREE places: each Build plugin's default set (`packages/site/tracy-site-build-<cms>/questions.json`,
 * must have `name`), the questionnaire in a Joomla contract profile (`contracts/<id>/<major>/<ver>/questions.json`),
 * and the inline `questions` of each `quickstarts.json` entry; plus the mirror in the tracy-web image
 * (`apps/tracy-web/src/questions/<cms>.json`) must equal the canonical bytes, for the same reason as `design-templates`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseQuestions, validateQuestions } from '../packages/site/tracy-site-build-core/src/questions.mjs'
import { SHIPPED_LANGUAGES } from './shipped-languages.mjs'
import { joomlaContractLanguageOptions, joomlaLanguageOptions } from './joomla-language-options.mjs'
import { emdashStandardLanguageOptions, wordpressLanguageOptions } from './wordpress-language-options.mjs'
import { EMDASH_TEMPLATES, emdashLanguageOptions } from './emdash-language-options.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLATFORMS = ['wordpress', 'joomla', 'emdash'] as const
const QUICKSTARTS = 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
/** Where a quickstart's own questionnaire lives in this repo, when the template is one of ours. */
const PACKAGED: Record<string, string> = {
  'tracy-business/emdash': 'packages/cms/tracy-emdash-theme-business/seed/questions.json'
}

const problems: string[] = []
let checked = 0

/**
 * Every language a person can switch the interface to must have text.
 *
 * 🔒 A SET THAT COVERS FEWER IS A FORM THAT ASKS IN ENGLISH INSIDE AN INTERFACE THAT IS NOT, and
 * nothing else reports it: the resolver falls back to `en` per key, silently and correctly. The
 * list is the shown languages of `@tracy/core/interface-languages` (`shipped-languages.mjs`), so a
 * language added to the menu turns this red instead of going unnoticed.
 *
 * `excused` names languages not demanded of this one document; only the release copies below use it.
 */
function coversShipped(rel: string, doc: any, excused: ReadonlySet<string> = new Set()): void {
  const have = new Set(Array.isArray(doc?.languages) ? doc.languages : [])
  const missing = SHIPPED_LANGUAGES.map((l) => l.id).filter((id) => !have.has(id) && !excused.has(id))
  if (missing.length > 0)
    problems.push(
      `${rel}: lacks ${String(missing.length)} languages Tracy ships (${missing.join(', ')}) — the form will ask in English inside a non-English interface`
    )
}

function check(rel: string, opts: { requireName?: boolean; owner?: string } = {}): unknown {
  const full = join(ROOT, rel)
  if (!existsSync(full)) {
    problems.push(`${rel} is missing`)
    return null
  }
  let doc: any
  try {
    doc = parseQuestions(readFileSync(full, 'utf8'), { requireName: opts.requireName, where: rel })
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e))
    return null
  }
  if (opts.owner !== undefined && doc.owner !== opts.owner)
    problems.push(`${rel}: owner is ${JSON.stringify(doc.owner)}, must be ${JSON.stringify(opts.owner)}`)
  coversShipped(rel, doc)
  checked += 1
  return doc
}

// 1. Each CMS's default set, and its mirror in the tracy-web image
for (const cms of PLATFORMS) {
  const src = `packages/site/tracy-site-build-${cms}/questions.json`
  check(src, { requireName: true, owner: cms })
  const mirror = `apps/tracy-web/src/questions/${cms}.json`
  if (!existsSync(join(ROOT, mirror)))
    problems.push(`${mirror} is missing — the create-site door would read a file that does not exist`)
  else if (!readFileSync(join(ROOT, src)).equals(readFileSync(join(ROOT, mirror))))
    problems.push(`${mirror} differs from ${src}; copy it again: cp ${src} ${mirror}`)
}

// 1b. The schema/resolver module — one copy in core, one copied into tracy-web (which cannot import packages/)
{
  const src = 'packages/site/tracy-site-build-core/src/questions.mjs'
  const mirror = 'apps/tracy-web/src/lib/questions-schema.mjs'
  if (!existsSync(join(ROOT, mirror))) problems.push(`${mirror} is missing`)
  else if (!readFileSync(join(ROOT, src)).equals(readFileSync(join(ROOT, mirror))))
    problems.push(`${mirror} differs from ${src}; copy it again: cp ${src} ${mirror}`)
}

// 1b. The Joomla set must offer exactly the languages the pack catalog has — no more (the form promises a
// language the Claude Cowork plugin refuses), no fewer (it hides a pinned pack). This list is GENERATED from
// `language-packs.json` by `sync-questions.mjs`; compared element by element, since one off is one language off.
{
  const rel = 'packages/site/tracy-site-build-joomla/questions.json'
  const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as {
    questions?: Array<{ kind?: string; id?: string; options?: string[]; optionLabels?: unknown }>
  }
  const q = doc.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
  const want = joomlaLanguageOptions()
  if (!q) problems.push(`${rel}: the Joomla set asks no language`)
  else {
    if (JSON.stringify(q.options) !== JSON.stringify(want))
      problems.push(
        `${rel}: languages.options differ from the language pack catalog (${String(q.options?.length ?? 0)} vs ${String(want.length)}); run: node scripts/sync-questions.mjs`
      )
    if (q.optionLabels !== undefined)
      problems.push(
        `${rel}: languages.optionLabels is a hand-written label table — the form names languages through Intl.DisplayNames; run: node scripts/sync-questions.mjs`
      )
  }
}

// 1b-wp. The WordPress set must likewise offer exactly the languages the WordPress catalogue has — same
// reason, same failure. The list is GENERATED from `tracy-seeder/src/wordpress-language-packs.json` by
// `sync-questions.mjs`; one element off is one language off.
{
  const rel = 'packages/site/tracy-site-build-wordpress/questions.json'
  const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as {
    questions?: Array<{ kind?: string; id?: string; options?: string[]; optionLabels?: unknown }>
  }
  const q = doc.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
  const want = wordpressLanguageOptions()
  if (!q) problems.push(`${rel}: the WordPress set asks no language`)
  else {
    if (JSON.stringify(q.options) !== JSON.stringify(want))
      problems.push(
        `${rel}: languages.options differ from the WordPress locale catalogue (${String(q.options?.length ?? 0)} vs ${String(want.length)}); run: node scripts/sync-questions.mjs`
      )
    if (q.optionLabels !== undefined)
      problems.push(
        `${rel}: languages.optionLabels is a hand-written label table — the form names languages through Intl.DisplayNames; run: node scripts/sync-questions.mjs`
      )
  }
}

// 1b-emdash-standard. The EmDash default set offers the WordPress list (O5, 07/10/2026), generated by
// `sync-questions.mjs`; a drift is one language promised on one CMS and not the others.
{
  const rel = 'packages/site/tracy-site-build-emdash/questions.json'
  const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as {
    questions?: Array<{ kind?: string; id?: string; options?: string[] }>
  }
  const q = doc.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
  const want = emdashStandardLanguageOptions()
  if (!q) problems.push(`${rel}: the EmDash default set asks no language`)
  else if (JSON.stringify(q.options) !== JSON.stringify(want))
    problems.push(
      `${rel}: languages.options differ from the WordPress list (${String(q.options?.length ?? 0)} vs ${String(want.length)}); run: node scripts/sync-questions.mjs`
    )
}

// 1b-emdash. An EmDash template offers exactly the locales it ships — no more (the form promises a
// language the site cannot serve), no fewer (a shipped language can never be chosen). The list is
// GENERATED from `template.config.json` by `sync-questions.mjs`. A template shipping more than one
// locale must ask the question at all: without it every build is English only.
for (const dir of EMDASH_TEMPLATES) {
  const rel = `${dir}/seed/questions.json`
  if (!existsSync(join(ROOT, rel))) continue
  const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as {
    questions?: Array<{ kind?: string; id?: string; options?: string[]; optionLabels?: unknown }>
  }
  const q = doc.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
  const want = emdashLanguageOptions(join(ROOT, dir))
  if (!q) {
    // Languages, not tags: the regional Englishes (`ENGLISH_VARIANTS`) are labels of one `en`.
    const languages = new Set(want.map((l) => l.split('-')[0]))
    if (languages.size > 1)
      problems.push(
        `${rel}: the template ships ${String(languages.size)} languages but its questionnaire asks no language, so every build is English only`
      )
    continue
  }
  if (JSON.stringify(q.options) !== JSON.stringify(want))
    problems.push(
      `${rel}: languages.options differ from the locales in template.config.json (${String(q.options?.length ?? 0)} vs ${String(want.length)}); run: node scripts/sync-questions.mjs`
    )
  if (q.optionLabels !== undefined)
    problems.push(
      `${rel}: languages.optionLabels is a hand-written label table — the form names languages through Intl.DisplayNames; run: node scripts/sync-questions.mjs`
    )
}

// 1c. The list of languages Tracy ships — canonical copy generated from two sources, mirror for the tracy-web image
{
  const mirror = 'apps/tracy-web/src/questions/languages.json'
  const want = `${JSON.stringify(SHIPPED_LANGUAGES, null, 2)}\n`
  if (!existsSync(join(ROOT, mirror)))
    problems.push(`${mirror} is missing — run: node scripts/sync-questions.mjs`)
  else if (readFileSync(join(ROOT, mirror), 'utf8') !== want)
    problems.push(`${mirror} differs from the shipped language list; run: node scripts/sync-questions.mjs`)
}

// 2. Questionnaires in contract profiles (optional — none means falling back to the CMS default)
const contractsRoot = join(ROOT, CONTRACTS)
if (existsSync(contractsRoot))
  for (const id of readdirSync(contractsRoot))
    for (const major of safeList(join(contractsRoot, id)))
      for (const ver of safeList(join(contractsRoot, id, major))) {
        const rel = `${CONTRACTS}/${id}/${major}/${ver}/questions.json`
        if (!existsSync(join(ROOT, rel))) continue
        check(rel, { owner: `${id}/${major}` })
        // A contract offers the languages its archive ships (joomlaContractLanguageOptions): an option
        // beyond them is a language that comes out as a copy with no main menu (j-ee6vsk, 23/09/2026).
        const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as {
          questions?: Array<{ kind?: string; id?: string; options?: string[] }>
        }
        const q = doc.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
        const want = joomlaContractLanguageOptions(join(contractsRoot, id, major, ver))
        if (q && JSON.stringify(q.options) !== JSON.stringify(want))
          problems.push(
            `${rel}: languages.options differ from the languages this contract ships (${String(q.options?.length ?? 0)} vs ${String(want.length)}); run: node scripts/sync-questions.mjs`
          )
      }

// 3. The inline copy in the catalogue — valid, and equal to the packaged one when the template is ours
/**
 * TEMPORARY: languages a catalogue copy of a PUBLISHED questionnaire may still lack.
 *
 * Spanish joined the interface on 02/10/2026 (spec #730), and every questionnaire authored in this
 * repo got `es` text that day (#757). The copies of questionnaires already published as
 * `tracy_site_question.json` on JoomlArt-Products/ja-products releases (`tracy-base/emdash-0.x`,
 * `tracy-business/emdash-0.x`, `tracy-saas/emdash-0.x`) cannot gain it until each template is
 * released again, so `es` is excused HERE ONLY, for catalogue entries that are not a packaged
 * template (a packaged one must equal its seed, which carries `es`). Every questionnaire under
 * `packages/` is still checked against the full list above.
 *
 * Remove `es` from this set once those three releases carry it (tracked in #757).
 */
const NOT_YET_RELEASED = new Set(['es'])
const catalog = JSON.parse(readFileSync(join(ROOT, QUICKSTARTS), 'utf8')) as Record<string, any>
for (const [id, entry] of Object.entries(catalog)) {
  if (entry.questions === undefined || entry.questions === null) continue
  const where = `${QUICKSTARTS} → ${id}.questions`
  const bad = validateQuestions(entry.questions)
  if (bad.length > 0) problems.push(`${where}:\n  - ${bad.join('\n  - ')}`)
  else {
    coversShipped(where, entry.questions, PACKAGED[id] === undefined ? NOT_YET_RELEASED : new Set())
    checked += 1
    if (entry.questions.owner !== id)
      problems.push(
        `${where}: owner is ${JSON.stringify(entry.questions.owner)}, must be ${JSON.stringify(id)}`
      )
  }
  const packaged = PACKAGED[id]
  if (packaged !== undefined) {
    const file = join(ROOT, packaged)
    if (!existsSync(file))
      problems.push(`${packaged} is missing while catalogue entry ${id} carries a questionnaire`)
    else if (JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) !== JSON.stringify(entry.questions))
      problems.push(
        `${where} differs from ${packaged} — the catalogue promises a different questionnaire than the release; copy the file's contents into the entry`
      )
  }
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `Questionnaire gate: ${String(problems.length)} error(s)\n${problems.map((p) => `  - ${p}`).join('\n')}\n`
  )
  process.exit(1)
}
process.stdout.write(
  `Questionnaire gate: ${String(checked)} questionnaires valid, covering ${String(SHIPPED_LANGUAGES.length)} languages, mirrors match, catalogue matches the releases.\n`
)
