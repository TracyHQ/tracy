/**
 * LANG-1: browsers and Google read the language the customer chose (spec
 * `tasks/spec-template-customization-question-readiness.md`, LANG-1).
 *
 * The template's side, both static: (a) `<html lang>` comes from the platform, never a literal
 * (Joomla template entry files print `$this->language` or `{t4:language}`; a WordPress block theme
 * writes no `<html>` and a PHP one calls `language_attributes()`; an EmDash `.astro` layout binds
 * `lang={...}`); (b) every language edition the demo carries is declared, so Tracy knows which one
 * is the source (Joomla: multilingual map + editions when the demo has more than one language;
 * WordPress: `editions.json` equal to the Polylang languages; EmDash: `site-model.json`
 * `locales.all` inside `tracy_setting.json` `languages`, and `astro.config.mjs` not pinned to
 * English). The value a built page finally prints is set by Tracy and the CMS plugin, so it is a
 * note, not a live-only part of this rule.
 */
import { demoLanguages, missingFrom } from '../readers/demo-languages.js'
import { findings, listed } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'

const HTML_TAG = /<html\b[^>]*>/gi
const LANG_ATTR = /\blang\s*=\s*(["'])(.*?)\1/i

/** The text without code comments, where a doc block may mention `<html>` (wp-ja-kinetic `inc/extra.php`). */
const withoutComments = (/** @type {string} */ text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '')

/** A literal language value: no PHP, no T4 placeholder, no variable. */
const literal = (/** @type {string} */ value) => !/<\?|\$|\{/.test(value)

/**
 * The hard-coded `<html lang>` of the template's entry files.
 * @param {string} platform
 * @param {Map<string, string>} files
 */
function hardCodedLang(platform, files) {
  const found = []
  for (const [name, text] of files) {
    if (platform === 'joomla' && !/^(index|error|offline|component)\.php$/.test(name)) continue
    if (platform === 'wordpress' && !/\.(html|php)$/.test(name)) continue
    if (platform === 'emdash' && !/^src\/.*\.astro$/.test(name)) continue
    for (const tag of withoutComments(text).match(HTML_TAG) ?? []) {
      if (platform === 'wordpress' && name.endsWith('.html')) {
        found.push(`${name} writes its own <html> tag (a block theme leaves it to WordPress)`)
        continue
      }
      if (platform === 'wordpress' && !tag.includes('language_attributes')) {
        found.push(`${name} writes <html> without language_attributes()`)
        continue
      }
      if (platform === 'emdash' && /\blang\s*=\s*\{/.test(tag)) continue
      const lang = LANG_ATTR.exec(tag)
      if (lang && literal(lang[2])) found.push(`${name} hard-codes <html lang="${lang[2]}">`)
    }
  }
  return found
}

export const lang1PageLanguage = {
  id: 'LANG-1',
  title: 'Browsers and Google read the language the customer chose',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { platform } = context.release
    const f = findings(context, 'LANG-1')
    await f.part('the template files', async () => {
      for (const p of hardCodedLang(platform, await templateSourceFiles(context))) f.problem(p)
    })
    await f.part('the demo languages', async () => {
      const langs = await demoLanguages(context)
      if (langs.platform === 'joomla' && langs.carried.length > 1) {
        const [place] = langs.declared
        if (!place.languages) {
          f.owner('contract')
          f.problem(
            `the demo carries ${langs.carried.length} languages (${listed(langs.carried)}) but the contract has no multilingual-map.json, so Tracy cannot tell the source edition`
          )
        } else {
          const missing = missingFrom(langs.carried, place.languages)
          if (missing.length) {
            f.owner('contract')
            f.problem(`the demo carries ${listed(missing)}, which the contract editions do not declare`)
          }
        }
      }
      if (langs.platform === 'wordpress' && langs.carried.length > 0) {
        const [editions] = langs.declared
        if (!editions.languages) {
          f.owner('contract')
          f.problem(
            `the demo database carries ${langs.carried.length} Polylang languages but the contract has no editions.json, so Tracy cannot tell the source edition`
          )
        } else {
          const missing = missingFrom(langs.carried, editions.languages)
          const extra = missingFrom(editions.languages, langs.carried)
          if (missing.length || extra.length) f.owner('contract')
          if (missing.length) f.problem(`Polylang languages not in editions.json: ${listed(missing)}`)
          if (extra.length)
            f.problem(`editions.json declares languages the demo does not carry: ${listed(extra)}`)
        }
      }
      if (langs.platform === 'emdash') {
        const setting = langs.declared[0].languages ?? []
        const model = langs.declared[3].languages ?? []
        const missing = missingFrom(model, setting)
        if (missing.length)
          f.problem(
            `seed/site-model.json carries ${listed(missing)}, which tracy_setting.json languages does not list`
          )
        const config = langs.files.get('astro.config.mjs') ?? ''
        if (setting.length > 1 && /locales\s*:\s*\[\s*['"]en['"]\s*\]/.test(config))
          f.problem("astro.config.mjs pins locales: ['en'] while the release offers several languages")
      }
    })
    f.note('The lang value a built page prints is set by Tracy and the CMS plugin; check it on a built site.')
    return f.outcome({
      pass: '<html lang> comes from the platform and every demo language edition is declared',
      fix:
        platform === 'emdash'
          ? 'Bind <html lang> to the served locale and keep seed/site-model.json locales inside tracy_setting.json languages; cut a new release.'
          : `Print <html lang> from the platform (no literal) and declare every demo language edition in the contract (${platform === 'joomla' ? 'multilingual-map.json, editions.json' : 'editions.json'}).`
    })
  }
}
