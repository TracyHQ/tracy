/**
 * The content map lists check of the readiness verdict (ticket #437, piece `contract`): a content map that lists the
 * site's articles and menus but holds no `itemLists` (the blocks that show a list of articles), `itemPages` (the
 * article pages a list leads to) or `menuBlocks` (the menus a customer edits) leaves the flow blind to them: a list
 * cannot be refilled, an article page cannot be named, a menu cannot be rebuilt.
 *
 * What the site has is read from the data the repository already holds, nothing is crawled again:
 *   itemPages   the map has at least one article entity
 *   itemLists   the map has at least two article entities, or the kit pictures a list of items (rowKind `items`)
 *   menuBlocks  the map has a menu item and a module, or the kit pictures a menu block
 * The map cannot say a site has a menu or a list that its own entities do not show, so a site whose map lists
 * nothing of the kind is not flagged for it.
 *
 *   null   every kind the site has is present: nothing to flag, the piece keeps the code it already has
 *   todo   one or more absent or empty (`content-map-missing-lists`, `{ missing, fix }`)
 *
 * Joomla only (the keys are those of the Joomla content map). Not judged (null): no readable map.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor } from '../contracts.js'
import { kitOfRelease } from '../template-kit/road-step.js'

const KEYS = Object.freeze(['itemLists', 'itemPages', 'menuBlocks'])

const countOf = (value) => (value && typeof value === 'object' ? Object.keys(value).length : 0)

/** @param {any} map @param {any} kitDoc @returns {string[]} the keys the site has */
export function listsTheSiteHas(map, kitDoc) {
  const kinds = new Map()
  for (const e of Array.isArray(map?.entities) ? map.entities : [])
    kinds.set(e?.kind, (kinds.get(e?.kind) ?? 0) + 1)
  const blocks = Array.isArray(kitDoc?.blocks) ? kitDoc.blocks : []
  const kitLists = blocks.some((b) => (b?.lists ?? []).some((l) => l?.rowKind === 'items'))
  const kitMenu = blocks.some((b) => /menu/.test(String(b?.role ?? '')))
  const has = []
  if ((kinds.get('article') ?? 0) >= 2 || kitLists) has.push('itemLists')
  if ((kinds.get('article') ?? 0) >= 1) has.push('itemPages')
  if (((kinds.get('menuItem') ?? 0) >= 1 && (kinds.get('module') ?? 0) >= 1) || kitMenu)
    has.push('menuBlocks')
  return has
}

export const CONTENT_MAP_LISTS_CHECK = Object.freeze({
  piece: 'contract',
  step: 'content-map-lists',
  judge(release, world) {
    if (release?.platform !== 'joomla') return null
    let map = world?.contentMap
    if (map === undefined) {
      const version = typeof release?.setting?.version === 'string' ? release.setting.version : undefined
      const dir = contractFor(world?.contracts ?? new Map(), release?.tag, version)?.dir
      if (!dir) return null
      try {
        map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
      } catch {
        return null
      }
    }
    if (!map || typeof map !== 'object') return null
    const kit = world?.templateKit ?? kitOfRelease(release, world?.contracts ?? new Map())
    const has = listsTheSiteHas(map, kit?.state === 'read' ? kit.doc : null)
    if (has.length === 0) return null
    const missing = KEYS.filter((k) => has.includes(k) && countOf(map[k]) === 0)
    if (missing.length === 0) return null
    return {
      state: 'todo',
      code: 'content-map-missing-lists',
      params: {
        missing,
        fix: `Capture the content map again with the current quickstart tools so it holds ${missing.join(', ')}, then seal it in a new contract version.`
      }
    }
  }
})
