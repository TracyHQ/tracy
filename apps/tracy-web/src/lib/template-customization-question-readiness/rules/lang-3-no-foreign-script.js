/**
 * LANG-3: no words of another writing system slip into the site (spec
 * `tasks/spec-template-customization-question-readiness.md`, LANG-3).
 *
 * The template's side: the source edition (English, as a rule) carries no Cyrillic, Arabic, Kana
 * or Han letters outside what Tracy rewrites or removes. Read per CMS:
 * - Joomla: every `text` slot sample of a contract entity in the source language (or `*`), except
 *   a slot that needs evidence (`requiresEvidence`: Tracy removes its module when the customer gives
 *   none); the template's English `.ini` files.
 * - WordPress: the published pages, posts and template parts of the source edition (Polylang),
 *   and the theme files.
 * - EmDash: the default-locale entries of `seed/seed.json` (collections a `trim` rule empties are
 *   removed, so skipped) and `src/**`.
 * Words the AI writes on a built site are Tracy's (JA Nova WordPress, 30 Arabic lines): this rule
 * reads only the release, never a built site.
 */
import { contractEntities, contractSlots, releaseContract } from '../readers/contract-profile-of-release.js'
import { findings, listed, plural } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'

const SCRIPTS = /** @type {const} */ ([
  ['Cyrillic', /[Ѐ-ӿ]/, /^(ru|uk|bg|sr|be|mk|kk|ky|mn|tg)\b/i],
  ['Arabic', /[؀-ۿ]/, /^(ar|fa|ur|ps|ku)\b/i],
  ['Kana', /[぀-ヿ]/, /^ja\b/i],
  ['Han', /[一-鿿]/, /^(zh|ja)\b/i]
])

/** The writing systems foreign to `language` that `text` holds. */
function foreign(/** @type {string} */ text, /** @type {string} */ language) {
  return SCRIPTS.filter(([, letters, native]) => letters.test(text) && !native.test(language)).map(
    ([name]) => name
  )
}

/** The first foreign line of a text, shortened, with its scripts; null when there is none. */
function firstForeign(/** @type {string} */ text, /** @type {string} */ language) {
  for (const line of text.replace(/<[^>]*>/g, ' ').split('\n')) {
    const scripts = foreign(line, language)
    if (!scripts.length) continue
    const at = Math.min(
      ...SCRIPTS.filter(([name]) => scripts.includes(name)).map(([, letters]) => line.search(letters))
    )
    return `${scripts.join('+')}: "${line.slice(Math.max(0, at - 12), at + 24).trim()}"`
  }
  return null
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f) {
  const contract = releaseContract(context)
  const source = contract?.json('multilingual-map.json')?.sourceLanguage ?? 'en-GB'
  const language = new Map(contractEntities(contract).map((e) => [e.key, e.identity?.language ?? '*']))
  const slots = []
  for (const s of contractSlots(contract)) {
    if (s.type !== 'text' || s.requiresEvidence === true) continue
    if (![source, '*'].includes(language.get(s.entity) ?? '*')) continue
    const hit = firstForeign(String(s.sample ?? ''), source)
    if (hit) slots.push(`${s.key} (${hit})`)
  }
  if (slots.length) {
    f.owner('contract')
    f.problem(`${plural(slots.length, 'source-language slot')} with another script: ${listed(slots, 6)}`)
  }
  await f.part('the template files', async () => {
    const files = []
    for (const [file, text] of await templateSourceFiles(context)) {
      if (!/\.ini$|^html\/.*\.php$|^acm\/.*\.php$/.test(file) || /\/(?!en-GB)[a-z]{2}-[A-Z]{2}\//.test(file))
        continue
      const hit = firstForeign(text, source)
      if (hit) files.push(`${file} (${hit})`)
    }
    if (files.length) f.problem(`template files carry another script: ${listed(files)}`)
  })
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpress(context, f) {
  const wp = await wordpressDemo(context)
  const source = wp.source ?? 'en'
  const rows = []
  for (const p of wp.posts) {
    if (
      p.post_status !== 'publish' ||
      !['page', 'post', 'wp_template_part', 'wp_block'].includes(p.post_type)
    )
      continue
    if (!wp.isSource(p)) continue
    const hit = firstForeign(`${p.post_title ?? ''}\n${p.post_content ?? ''}`, source)
    if (hit) rows.push(`${p.post_type} ${p.ID} (${hit})`)
  }
  if (rows.length)
    f.problem(`${plural(rows.length, 'source-language post')} with another script: ${listed(rows, 6)}`)
  await f.part('the theme files', async () => {
    const files = []
    for (const [file, text] of await templateSourceFiles(context)) {
      if (!/\.(html|php)$/.test(file) || /(^|\/)languages\//.test(file)) continue
      const hit = firstForeign(text, source)
      if (hit) files.push(`${file} (${hit})`)
    }
    if (files.length) f.problem(`theme files carry another script: ${listed(files)}`)
  })
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(context, f) {
  const files = await templateSourceFiles(context)
  const seedText = files.get('seed/seed.json')
  if (seedText) {
    const { defaultLocale = 'en', content = {} } = JSON.parse(seedText)
    const personalize = files.get('seed/personalize.json')
    const emptied = new Set(
      (personalize ? (JSON.parse(personalize).trim ?? []) : [])
        .filter((/** @type {any} */ r) => Number(r.keep) === 0)
        .map((/** @type {any} */ r) => r.collection)
    )
    const rows = []
    for (const [collection, entries] of Object.entries(content)) {
      if (emptied.has(collection) || !Array.isArray(entries)) continue
      for (const e of entries) {
        if ((e?.locale ?? defaultLocale) !== defaultLocale) continue
        const hit = firstForeign(JSON.stringify(e?.data ?? e).replaceAll('\\n', '\n'), defaultLocale)
        if (hit) rows.push(`${collection}/${e?.slug ?? e?.id ?? '?'} (${hit})`)
      }
    }
    if (rows.length)
      f.problem(
        `${plural(rows.length, 'default-locale seed record')} with another script: ${listed(rows, 6)}`
      )
  }
  // Markup a page draws fails; a script's `.ts` word tables per locale are the theme's
  // translations and are only noted.
  const markup = []
  const tables = []
  for (const [file, text] of files) {
    if (!/^src\/.*\.(astro|ts|tsx)$/.test(file)) continue
    const hit = firstForeign(text, 'en')
    if (hit) (file.endsWith('.astro') ? markup : tables).push(`${file} (${hit})`)
  }
  if (markup.length) f.problem(`theme markup carries another script: ${listed(markup)}`)
  if (tables.length) f.note(`Theme code with another script (a locale's word table): ${listed(tables)}.`)
}

export const lang3NoForeignScript = {
  id: 'LANG-3',
  title: 'No words of another writing system on the site',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'LANG-3')
    await f.part('the demo content', async () => {
      const run = { joomla, wordpress, emdash }[context.release.platform]
      if (run) await run(context, f)
    })
    return f.outcome({
      pass: 'the source edition carries no other writing system outside what Tracy rewrites or removes',
      fix: 'Write the source edition in its own script only (replace the foreign words in the demo, then cut the contract again).'
    })
  }
}
