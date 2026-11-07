#!/usr/bin/env node
// Is this WordPress quickstart in the scope of the skill (SKILL.md section 0)? Read from the release's own two files,
// the database dump and the webroot archive (the ones the verdict's local mode downloads), never from a running site.
//
//   block theme     the active theme, or its parent, has templates/index.html (or block-templates/index.html): the
//                   rule WordPress itself uses (wp_is_block_theme)
//   page builder    no active plugin and no active theme is a page builder
//   WooCommerce     WooCommerce is not active and the dump holds no product
//   one language    the dump holds no Polylang language (the rule capture-contract.mjs refuses a dump by)
//
//   node scope.mjs --database <database.sql.gz> (--webroot-archive <webroot.tar.gz> | --webroot <dir>)
//
// Prints one line per refusal. Exit 0 in scope, 1 out of scope, 2 usage or read error.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import {
  phpArray,
  readDump,
  tableNames,
  tableRows,
  wordpressPrefix
} from '../../../../packages/cms/tracy-quickstart-tools/mysqldump.mjs'

/** Plugin folders and theme slugs that build pages outside the block editor. */
export const PAGE_BUILDER_PLUGINS = Object.freeze([
  'elementor',
  'elementor-pro',
  'beaver-builder-lite-version',
  'bb-plugin',
  'js_composer',
  'divi-builder',
  'oxygen',
  'brizy',
  'brizy-pro',
  'siteorigin-panels',
  'fusion-builder',
  'live-composer-page-builder',
  'thrive-visual-editor',
  'kingcomposer',
  'visualcomposer',
  'breakdance',
  'cornerstone',
  'themify-builder'
])
export const PAGE_BUILDER_THEMES = Object.freeze(['divi', 'extra', 'avada', 'bricks', 'x', 'pro'])
const WOOCOMMERCE_TYPES = new Set(['product', 'product_variation', 'shop_order'])

/** The folder of a plugin entry of `active_plugins` (`elementor/elementor.php` is `elementor`). */
const folderOf = (entry) => String(entry).split('/')[0].toLowerCase()

/**
 * Why a release is out of scope, or nothing.
 * @param {{ stylesheet: string, template: string, plugins: string[], blockThemes: string[], postTypes: string[], languages: number }} facts
 *   `plugins` the active plugin entries, `blockThemes` the theme slugs of the webroot that carry a block template index
 * @returns {{ code: string, why: string }[]}
 */
export function refusalsOf({ stylesheet, template, plugins, blockThemes, postTypes, languages }) {
  const out = []
  const themes = [...new Set([stylesheet, template].filter(Boolean))]
  if (!themes.some((t) => blockThemes.includes(t)))
    out.push({
      code: 'not-block-theme',
      why: `the active theme ${themes.join(' on parent ') || '(none)'} has no templates/index.html: not a block theme`
    })
  const builders = [
    ...plugins.map(folderOf).filter((p) => PAGE_BUILDER_PLUGINS.includes(p)),
    ...themes.filter((t) => PAGE_BUILDER_THEMES.includes(String(t).toLowerCase()))
  ]
  if (builders.length)
    out.push({ code: 'page-builder', why: `a page builder is active: ${builders.join(', ')}` })
  const shop = plugins.map(folderOf).includes('woocommerce')
  const products = postTypes.filter((t) => WOOCOMMERCE_TYPES.has(t))
  if (shop || products.length)
    out.push({
      code: 'woocommerce',
      why: shop
        ? 'WooCommerce is active'
        : `the dump holds WooCommerce posts (${[...new Set(products)].join(', ')})`
    })
  if (languages > 0)
    out.push({ code: 'several-languages', why: `the dump holds ${languages} Polylang language(s)` })
  return out
}

/** The theme slugs whose folder holds a block template index, from a list of webroot paths. */
export function blockThemesOf(paths) {
  const re = /(?:^|\/)wp-content\/themes\/([^/]+)\/(?:templates|block-templates)\/index\.html$/
  return [...new Set(paths.map((p) => re.exec(p)?.[1]).filter(Boolean))]
}

/** The facts `refusalsOf` reads, from the dump text. */
export function dumpFactsOf(sql) {
  const prefix = wordpressPrefix(sql)
  const options = new Map(tableRows(sql, `${prefix}options`).map((o) => [o.option_name, o.option_value]))
  const plugins = Object.values(phpArray(options.get('active_plugins') ?? '') ?? {}).map(String)
  const postTypes = tableRows(sql, `${prefix}posts`).map((p) => String(p.post_type))
  const taxonomy = `${prefix}term_taxonomy`
  const languages = tableNames(sql).includes(taxonomy)
    ? tableRows(sql, taxonomy).filter((t) => t.taxonomy === 'language').length
    : 0
  return {
    stylesheet: String(options.get('stylesheet') ?? ''),
    template: String(options.get('template') ?? ''),
    plugins,
    postTypes,
    languages
  }
}

/** @param {string[]} argv @returns {number} */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      database: { type: 'string' },
      'webroot-archive': { type: 'string' },
      webroot: { type: 'string' }
    }
  })
  if (!values.database || !(values['webroot-archive'] || values.webroot)) {
    process.stderr.write(
      'usage: scope.mjs --database <database.sql.gz> (--webroot-archive <webroot.tar.gz> | --webroot <dir>)\n'
    )
    return 2
  }
  try {
    const facts = dumpFactsOf(readDump(values.database))
    let blockThemes
    if (values.webroot) {
      blockThemes = [facts.stylesheet, facts.template].filter((t) =>
        ['templates', 'block-templates'].some((d) =>
          existsSync(path.join(values.webroot, 'wp-content', 'themes', t, d, 'index.html'))
        )
      )
    } else {
      const listing = execFileSync('tar', ['-tzf', values['webroot-archive']], { maxBuffer: 1 << 28 })
      blockThemes = blockThemesOf(listing.toString('utf8').split('\n'))
    }
    const refusals = refusalsOf({ ...facts, blockThemes })
    for (const r of refusals) process.stdout.write(`out of scope (${r.code}): ${r.why}\n`)
    if (refusals.length === 0)
      process.stdout.write(
        `in scope: block theme ${facts.stylesheet}, ${facts.plugins.length} active plugin(s)\n`
      )
    return refusals.length ? 1 : 0
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2))
