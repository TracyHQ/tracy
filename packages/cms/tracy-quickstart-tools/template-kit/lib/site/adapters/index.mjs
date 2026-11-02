// The CMS adapter for a platform. Each adapter reads the site through `source` and answers in CMS-neutral words.
import { joomlaAdapter, showcaseViewOf as joomlaShowcaseView } from './joomla.mjs'

const ADAPTERS = { joomla: joomlaAdapter }

/** @param {string} platform @param {{query: Function|null, readFile: Function|null}} source */
export function adapterFor(platform, source) {
  const make = ADAPTERS[String(platform ?? '').toLowerCase()]
  if (!make) throw new Error(`no site adapter for platform ${platform}: add one in lib/site/adapters`)
  return make(source)
}

const SHOWCASE_VIEWS = { joomla: joomlaShowcaseView }

/**
 * Which page views of a platform exist only to show a CMS feature off (showcase-pages.mjs). A platform with no rule
 * judges showcase pages from the content map alone.
 * @param {string} platform
 * @returns {(kind: string) => string|null}
 */
export function showcaseViewFor(platform) {
  return SHOWCASE_VIEWS[String(platform ?? '').toLowerCase()] ?? (() => null)
}
