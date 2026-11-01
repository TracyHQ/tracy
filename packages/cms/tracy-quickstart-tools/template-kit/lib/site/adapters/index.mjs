// The CMS adapter for a platform. Each adapter reads the site through `source` and answers in CMS-neutral words.
import { joomlaAdapter } from './joomla.mjs'

const ADAPTERS = { joomla: joomlaAdapter }

/** @param {string} platform @param {{query: Function|null, readFile: Function|null}} source */
export function adapterFor(platform, source) {
  const make = ADAPTERS[String(platform ?? '').toLowerCase()]
  if (!make) throw new Error(`no site adapter for platform ${platform}: add one in lib/site/adapters`)
  return make(source)
}
