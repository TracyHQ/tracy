// The CMS adapter for a platform. Each adapter reads the site through `source` and answers in CMS-neutral words.
import { setUrlStyle } from '../../kit-paths.mjs'
import { themeVersionOf, templateVersionOf } from '../../stamp.mjs'
import { joomlaAdapter, showcaseViewOf as joomlaShowcaseView } from './joomla.mjs'
import { showcaseViewOf as wordpressShowcaseView, wordpressAdapter } from './wordpress.mjs'

const ADAPTERS = { joomla: joomlaAdapter, wordpress: wordpressAdapter }

/** @param {string} platform @param {{query: Function|null, readFile: Function|null}} source */
export function adapterFor(platform, source) {
  const make = ADAPTERS[String(platform ?? '').toLowerCase()]
  if (!make) throw new Error(`no site adapter for platform ${platform}: add one in lib/site/adapters`)
  return make(source)
}

const SHOWCASE_VIEWS = { joomla: joomlaShowcaseView, wordpress: wordpressShowcaseView }

/**
 * Which page views of a platform exist only to show a CMS feature off (showcase-pages.mjs). A platform with no rule
 * judges showcase pages from the content map alone.
 * @param {string} platform
 * @returns {(kind: string) => string|null}
 */
export function showcaseViewFor(platform) {
  return SHOWCASE_VIEWS[String(platform ?? '').toLowerCase()] ?? (() => null)
}

/**
 * The template's own file that states its version, read on the site, and how to read it: Joomla's
 * `templateDetails.xml`, a WordPress theme's `style.css` header. Null when the contract names no template.
 * @param {{platform?: string, template?: string, theme?: string}} manifest
 */
export function templateFileOf(manifest) {
  if (String(manifest?.platform ?? '').toLowerCase() === 'wordpress') {
    const theme = manifest.theme ?? manifest.quickstart?.theme
    return theme ? { path: `wp-content/themes/${theme}/style.css`, versionOf: themeVersionOf } : null
  }
  return manifest?.template
    ? { path: `templates/${manifest.template}/templateDetails.xml`, versionOf: templateVersionOf }
    : null
}

/**
 * Settle what a run reads differently per platform, once, from the contract's platform: how page addresses are
 * spelled (Joomla `/index.php/<path>`, WordPress pretty permalinks `/<path>/`).
 * @param {string} platform
 */
export function usePlatform(platform) {
  setUrlStyle(String(platform ?? '').toLowerCase() === 'wordpress' ? 'pretty-slash' : 'index-php')
}
