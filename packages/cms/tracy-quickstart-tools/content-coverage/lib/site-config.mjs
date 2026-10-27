// Site-wide strings of a Joomla site (site name, default meta), never its secrets: from a JSON file
// when one is given, else from the configuration.php inside the webroot of the quickstart pack.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The configuration.php fields a visitor can read on a page; passwords and keys are never read. */
const VISIBLE_FIELDS = new Set([
  'sitename',
  'MetaDesc',
  'MetaAuthor',
  'MetaRights',
  'offline_message',
  'fromname'
])

/** `public $sitename = 'JA Boxing';` lines, visible fields only. */
export function parseConfigurationPhp(body) {
  const out = {}
  for (const m of String(body).matchAll(/^\s*public \$(\w+)\s*=\s*'((?:[^'\\]|\\.)*)'\s*;/gm)) {
    if (VISIBLE_FIELDS.has(m[1])) out[m[1]] = m[2].replace(/\\'/g, "'")
  }
  return out
}

/**
 * @param {{ siteConfig?: string, webroot?: string }} input
 * @returns {Record<string, string>}
 */
export function readSiteConfig({ siteConfig, webroot }) {
  if (siteConfig && existsSync(siteConfig)) return JSON.parse(readFileSync(siteConfig, 'utf8'))
  const php = webroot ? join(webroot, 'configuration.php') : null
  if (php && existsSync(php)) return parseConfigurationPhp(readFileSync(php, 'utf8'))
  return {}
}
