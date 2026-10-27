/**
 * Which languages a release's demo carries, and every place that declares them, for the rules that
 * need Tracy to know each language edition of the demo (LANG-1, LANG-5, PAGE-8):
 *
 *   const { carried, declared } = await demoLanguages(context)
 *   // carried: the languages the demo content really has, lower case ("en-gb", "ru")
 *   // declared: [{ name, languages }], one per declaring place, `languages` null when it is absent
 *
 * - Joomla: carried = published `#__languages` plus the language of every published menu item,
 *   article and module (not `*`); declared = the contract's `multilingual-map.json` source language
 *   with the `editions.json` locales and the content-map entity languages (one place, as the build
 *   reads them together).
 * - WordPress: carried = the Polylang `language` terms; declared = the contract's `editions.json`
 *   (source + locales) and `inventory.json` languages.
 * - EmDash: carried = the locales of `seed/seed.json` content; declared = `tracy_setting.json`
 *   `languages`, the release `manifest.json` `languages.live`, `template.config.json` `locales` and
 *   `seed/site-model.json` `locales.all`.
 */
import { readText } from '../release-source.js'
import { demoTables } from './demo-tables.js'
import { contractEntities, releaseContract } from './contract-profile-of-release.js'
import { templateSourceFiles } from './template-source-tree.js'

/** @typedef {{ name: string, languages: string[] | null }} Declared */

const norm = (/** @type {unknown} */ l) => String(l).trim().toLowerCase().replaceAll('_', '-')
const set = (/** @type {Iterable<unknown>} */ list) =>
  [...new Set([...list].filter((l) => l != null && l !== '' && l !== '*').map(norm))].sort()

/** @param {import('../index.js').RuleContext} context */
async function joomla(context) {
  const t = await demoTables(context)
  const carried = set([
    ...t
      .rows('languages')
      .filter((r) => Number(r.published) === 1)
      .map((r) => r.lang_code),
    ...t
      .rows('menu')
      .filter((r) => Number(r.published) === 1 && Number(r.client_id) === 0)
      .map((r) => r.language),
    ...t
      .rows('content')
      .filter((r) => Number(r.state) === 1)
      .map((r) => r.language),
    ...t
      .rows('modules')
      .filter((r) => Number(r.published) === 1 && Number(r.client_id) === 0)
      .map((r) => r.language)
  ])
  const contract = releaseContract(context)
  const map = contract?.json('multilingual-map.json')
  const editions = contract?.json('editions.json')
  /** @type {Declared[]} */
  const declared = [
    {
      name: 'contract multilingual-map.json + editions.json + content-map.json',
      languages: map
        ? set([
            map.sourceLanguage,
            ...Object.keys(editions?.locales ?? {}),
            ...contractEntities(contract).map((e) => e.identity?.language)
          ])
        : null
    }
  ]
  const filter = t.rows('extensions').find((r) => r.element === 'languagefilter' && r.type === 'plugin')
  return { carried, declared, contract, languageFilter: Number(filter?.enabled) === 1 }
}

/** @param {import('../index.js').RuleContext} context */
async function wordpress(context) {
  const t = await demoTables(context)
  const ids = new Set(
    t
      .rows('term_taxonomy')
      .filter((r) => r.taxonomy === 'language')
      .map((r) => String(r.term_id))
  )
  const carried = set(
    t
      .rows('terms')
      .filter((r) => ids.has(String(r.term_id)))
      .map((r) => r.slug)
  )
  const contract = releaseContract(context)
  const editions = contract?.json('editions.json')
  const inventory = contract?.json('inventory.json')
  /** @type {Declared[]} */
  const declared = [
    {
      name: 'contract editions.json',
      languages: editions ? set([editions.source?.language, ...Object.keys(editions.locales ?? {})]) : null
    },
    {
      name: 'contract inventory.json',
      languages: Array.isArray(inventory?.languages)
        ? set(inventory.languages.map((/** @type {any} */ l) => l.slug))
        : null
    }
  ]
  return { carried, declared, contract, editions }
}

/** @param {import('../index.js').RuleContext} context */
async function emdash(context) {
  const files = await templateSourceFiles(context)
  const json = (/** @type {string} */ name) => {
    const text = files.get(name)
    return text === undefined ? null : JSON.parse(text)
  }
  const seed = json('seed/seed.json')
  const model = json('seed/site-model.json')
  const config = json('template.config.json')
  const manifestText = await readText(context.source, 'manifest.json')
  const manifest = manifestText ? JSON.parse(manifestText) : null
  const content = seed?.content ?? {}
  const carried = set(
    Object.values(content).flatMap((rows) =>
      Array.isArray(rows) ? rows.map((r) => r?.locale ?? seed?.defaultLocale) : []
    )
  )
  /** @type {Declared[]} */
  const declared = [
    {
      name: 'tracy_setting.json languages',
      languages: Array.isArray(context.setting.languages) ? set(context.setting.languages) : null
    },
    {
      name: 'release manifest.json languages.live',
      languages: Array.isArray(manifest?.languages?.live) ? set(manifest.languages.live) : null
    },
    {
      name: 'template.config.json locales',
      languages: Array.isArray(config?.locales) ? set(config.locales) : null
    },
    {
      name: 'seed/site-model.json locales.all',
      languages: Array.isArray(model?.locales?.all) ? set(model.locales.all) : null
    }
  ]
  return { carried, declared, files, model, seed }
}

/**
 * @param {import('../index.js').RuleContext} context
 */
export async function demoLanguages(context) {
  const { platform } = context.release
  if (platform === 'joomla') return { platform, ...(await joomla(context)) }
  if (platform === 'wordpress') return { platform, ...(await wordpress(context)) }
  return { platform, ...(await emdash(context)) }
}

/**
 * The languages of `a` missing from `b`.
 * @param {string[]} a
 * @param {string[]} b
 */
export const missingFrom = (a, b) => a.filter((l) => !b.includes(l))
