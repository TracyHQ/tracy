/**
 * LANG-5: when the customer chooses a language the website has exactly that one language; when
 * they do not, it stays as the template (spec `tasks/spec-template-customization-question-readiness.md`,
 * LANG-5).
 *
 * The template's side is declaring every language edition the demo really carries, the same set in
 * every declaring place, so Tracy can turn off each one the customer did not choose:
 * - Joomla: one published content language needs nothing; more need the contract's
 *   `multilingual-map.json`, and its source language + `editions.json` locales + content-map entity
 *   languages must be exactly the demo's languages.
 * - WordPress: the Polylang languages = `editions.json` (source + locales) = `inventory.json`
 *   languages; every edition locale has `missing: []`; `demo-trim-map.json` `counts.languages` is
 *   that number. A demo with Polylang languages and no `editions.json` fails.
 * - EmDash: `tracy_setting.json` languages = release `manifest.json` `languages.live` =
 *   `template.config.json` locales = `seed/site-model.json` `locales.all` = the locales of the seed
 *   content. Turning the other locales off is Tracy's copy of the personalize tool there (the theme's
 *   `tools/personalize.mjs`, copied into the tracy-web image and run by Apply), with the theme's
 *   `src/middleware.ts` redirecting their URLs, so a clean EmDash release is `live-only`: only a built
 *   site shows it works.
 * Turning languages off on Joomla and WordPress is Tracy's (spec, Tracy item 11).
 */
import { demoLanguages, missingFrom } from '../readers/demo-languages.js'
import { findings, listed } from '../readers/rule-findings.js'

/**
 * Compare one declaring place with the demo's languages.
 * @param {ReturnType<typeof findings>} f
 * @param {string[]} carried
 * @param {{ name: string, languages: string[] | null }} place
 */
function compare(f, carried, place) {
  if (!place.languages) {
    f.problem(`the demo carries ${listed(carried)} but there is no ${place.name}`)
    return
  }
  const missing = missingFrom(carried, place.languages)
  const extra = missingFrom(place.languages, carried)
  if (missing.length) f.problem(`${place.name} lacks ${listed(missing)}`)
  if (extra.length) f.problem(`${place.name} declares ${listed(extra)}, which the demo does not carry`)
}

export const lang5OneLanguage = {
  id: 'LANG-5',
  title: 'The website has exactly the one language the customer chose',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'LANG-5')
    let langs = null
    await f.part('the demo languages', async () => {
      langs = await demoLanguages(context)
      if (langs.platform === 'joomla') {
        f.note(
          `The demo carries ${listed(langs.carried) || 'no language'}; the language filter plugin is ${langs.languageFilter ? 'on' : 'off'}.`
        )
        if (langs.carried.length > 1) {
          f.owner('contract')
          compare(f, langs.carried, langs.declared[0])
        }
      }
      if (langs.platform === 'wordpress' && langs.carried.length > 0) {
        f.owner('contract')
        for (const place of langs.declared) compare(f, langs.carried, place)
        // `missing` lists slots (`page-home:projects.heading`) an authored edition does not have,
        // which is content, not a language left undeclared; only a whole page (no field) fails.
        const locales = langs.editions?.locales ?? {}
        const pageless = Object.entries(locales)
          .map(([k, l]) => [
            k,
            (Array.isArray(l?.missing) ? l.missing : []).filter((m) => !String(m).includes(':'))
          ])
          .filter(([, m]) => m.length)
          .map(([k, m]) => `${k} (${m.join(', ')})`)
        if (pageless.length) f.problem(`editions.json locales with no edition of a page: ${listed(pageless)}`)
        const slots = Object.entries(locales).filter(([, l]) => Array.isArray(l?.missing) && l.missing.length)
        for (const [k, l] of slots)
          f.note(`editions.json locale ${k} has ${l.missing.length} slots without a translation.`)
        const trim = langs.contract?.json('demo-trim-map.json')
        if (!trim) f.problem('the contract has no demo-trim-map.json for the Polylang editions')
        else if (Number(trim.counts?.languages) !== langs.carried.length)
          f.problem(
            `demo-trim-map.json counts ${trim.counts?.languages ?? 'no'} languages, the demo carries ${langs.carried.length}`
          )
      }
      if (langs.platform === 'emdash') {
        const carried = langs.carried.length ? langs.carried : (langs.declared[0].languages ?? [])
        for (const place of langs.declared) compare(f, carried, place)
      }
    })
    const emdash = context.release.platform === 'emdash'
    return f.outcome({
      pass: 'every language edition the demo carries is declared, the same in every place',
      liveOnly: emdash
        ? "turning off the other locales is Tracy's copy of the personalize tool (tools/personalize.mjs in the tracy-web image), with the theme's src/middleware.ts redirecting their URLs; only a built site shows it"
        : undefined,
      fix: emdash
        ? 'Make tracy_setting.json languages, manifest.json languages.live, template.config.json locales and seed/site-model.json locales.all list the same locales as the seed content (regenerate site-model.json), then cut a new release.'
        : `Regenerate the contract editions (${context.release.platform === 'joomla' ? 'multilingual-map.json, editions.json' : 'editions.json, inventory.json, demo-trim-map.json'}) from this demo database so they declare exactly its languages.`
    })
  }
}
