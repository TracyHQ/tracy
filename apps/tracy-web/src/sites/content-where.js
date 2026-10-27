/**
 * WHERE A QUICKSTART KEEPS WHAT A SITE AGENT IS ASKED ABOUT — search-engine fields, design,
 * menus, pages, forms, analytics, robots, language strings — and the door that changes each: the `where`
 * block of a `content.read {describe:true}` answer (#4 of the v6 plan, 28/09/2026).
 *
 * WHY. The agent asked "change the meta description", "add our analytics id" or "rename the menu"
 * explored before it acted: 10–27 calls on files, options and the database before a write or a
 * refusal (Joomla B3 27 calls in 111 s, WordPress C4 13, `tasks/todo-content-api-v2.md`), and the
 * writer and SEO roles have no shell to explore with at all. The describe call it already makes now
 * says where each thing lives on the quickstart the site was built from.
 *
 * 🔒 NOTHING HERE IS WRITTEN FROM MEMORY (CLAUDE.md principle 3: invented data is worse than none).
 * One file per quickstart release under `where/`, every entry read off that release's own files in
 * this repository and carrying the proof it was read from (`proof`: a file and a string it holds,
 * or a JSON pointer it answers). `test/content-where.test.mjs` re-reads every proof, every named
 * source file, every door's action on the platform's surfaces and every EmDash tool, and fails the
 * build when one is gone. A topic nobody could prove from the sources is left out of its file, not
 * filled with what a CMS usually does; a release no file names gets no `where` at all.
 *
 * The toolset of each door is not stored: the relay reads it off the door's own rules
 * (`toolsetOfDoor`, route.js — `APPLY_RULES` and `KIND_TOOLSET`), so a map cannot drift from them.
 */
import { readdirSync, readFileSync } from 'node:fs'

import { emdashTemplateIdOf } from '../lib/local-releases.js'

/** The topics a where-map may hold, in the order a describe lists them. */
export const WHERE_TOPICS = Object.freeze([
  'seo',
  'design',
  'menus',
  'pages',
  'forms',
  'analytics',
  'robots',
  'redirects',
  'strings'
])

/** The one sentence a describe says about its `where` block (the schema caps it at 300). */
export const WHERE_GUIDANCE =
  'Where this quickstart keeps each topic, read off its own release files: go straight to the record, option or file and the call named here instead of searching files or the database; toolset is what that call needs (permissions.toolsets).'

const DIR = new URL('./where/', import.meta.url)

/**
 * Every where-map this process carries, read once: shipped bytes, which change only with a new image.
 * @param {URL} [dir]
 * @returns {any[]}
 */
export function readWhereMaps(dir = DIR) {
  let names = []
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }
  return names.sort().map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')))
}

const MAPS = readWhereMaps()

/**
 * The where-map of the quickstart a site was built from: its platform, its release (for EmDash the
 * template id, the first segment of the tag, as `emdashTemplate` reads it) and a version the map
 * was read off exactly. Another version is not assumed to keep its places.
 * @param {any} site - the `site` row.
 * @param {any[]} [maps]
 */
export function whereMapFor(site, maps = MAPS) {
  const platform = site?.platform
  const tag = site?.quickstart_tag
  const version = site?.quickstart_version
  if (typeof tag !== 'string' || tag === '' || typeof version !== 'string') return null
  const release = platform === 'emdash' ? emdashTemplateIdOf(tag) : tag
  return (
    maps.find(
      (map) =>
        map.platform === platform &&
        map.quickstart === release &&
        Array.isArray(map.versions) &&
        map.versions.includes(version)
    ) ?? null
  )
}

/**
 * The `where` block of a describe document, or null: each entry as the agent reads it — what,
 * where, the door, the toolset that door needs, and how languages split it — without its proofs.
 * @param {any} site - the `site` row.
 * @param {{ profile: any, toolsetOfDoor: (door: any, input: { profile: any }) => string | null }} doors
 * @param {any[]} [maps]
 */
export function describeWhere(site, { profile, toolsetOfDoor }, maps = MAPS) {
  const map = whereMapFor(site, maps)
  if (map === null) return null
  /** @type {Record<string, any[]>} */
  const topics = {}
  for (const topic of WHERE_TOPICS) {
    // An entry read off some of the map's releases only (`versions`) is said for those alone.
    const entries = (Array.isArray(map.topics?.[topic]) ? map.topics[topic] : []).filter(
      (entry) => !Array.isArray(entry.versions) || entry.versions.includes(site.quickstart_version)
    )
    if (entries.length === 0) continue
    topics[topic] = entries.map((entry) => ({
      what: entry.what,
      where: entry.where,
      door: entry.door,
      toolset: toolsetOfDoor(entry.door, { profile }),
      languages: entry.languages
    }))
  }
  return { quickstart: `${map.quickstart}@${site.quickstart_version}`, guidance: WHERE_GUIDANCE, topics }
}
