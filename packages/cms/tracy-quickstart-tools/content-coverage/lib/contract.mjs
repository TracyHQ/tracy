// Load a contract folder (manifest, content-map, presentation-lock) and index its slots
// in the canonical forms the matcher compares against.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normText, normPath, normHref, basename, letterCount, alnumCount, compact } from './normalize.mjs'

const readJson = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
/** sha256 of a contract file's bytes: the coverage file names the exact map and lock it measured. */
export const fileSha256 = (dir, name) =>
  createHash('sha256')
    .update(readFileSync(join(dir, name)))
    .digest('hex')

/** Joomla table (without prefix) of each contract entity kind. */
export const KIND_TABLE = {
  article: 'content',
  module: 'modules',
  menuItem: 'menu',
  category: 'categories',
  templateStyle: 'template_styles',
  contact: 'contact_details',
  tag: 'tags',
  field: 'fields'
}

/** WordPress contracts name their platform, or carry `wp<major>` in their id (`ja-diner/wp7/1.0.1`). */
const isWordpress = (manifest) =>
  manifest.platform === 'wordpress' || /\/wp\d+\//.test(String(manifest.id ?? ''))

export function loadContract(dir, siteUrl) {
  const manifest = readJson(dir, 'manifest.json')
  const map = readJson(dir, 'content-map.json')
  const lock = readJson(dir, 'presentation-lock.json')
  const platform = isWordpress(manifest) ? 'wordpress' : 'joomla'
  const entityByKey = new Map(map.entities.map((e) => [e.key, e]))
  // "table:id" -> entity key, so a DB row found by the classifier can say whether the contract knows it.
  const entityByRow = new Map(map.entities.map((e) => [`${KIND_TABLE[e.kind]}:${e.sourceId}`, e.key]))
  /**
   * The contract entity a database row is, or undefined. A Joomla entity names its row by id; a WordPress entity names
   * its page by slug and its option by name, so the row is matched by those.
   */
  const entityOfRow = (table, id, row) => {
    if (platform !== 'wordpress') return entityByRow.get(`${table}:${id}`)
    const key =
      table === 'posts' && row?.post_type === 'page'
        ? `page-${row.post_name}`
        : table === 'options'
          ? `option-${row?.option_name}`
          : null
    return key && entityByKey.has(key) ? key : undefined
  }

  const text = new Map() // normText(sample) -> [slot keys]
  const textCompact = new Map() // compact(normText(sample)) -> [slot keys]
  const textList = [] // [{norm, key}] for containment checks, longest first
  const image = new Map() // normPath -> [slot keys]
  const imageBase = new Map() // basename -> [slot keys] (weak evidence only)
  const url = new Map() // normHref -> [slot keys]
  const rawSample = new Map() // exact sample string -> [slot keys] (a video id, an e-mail address)
  const push = (m, k, v) => {
    if (!k) return
    const a = m.get(k)
    if (a) a.push(v)
    else m.set(k, [v])
  }

  for (const s of map.slots) {
    if (typeof s.sample === 'string' && s.sample.trim()) push(rawSample, s.sample.trim(), s.key)
    if (s.type === 'image') {
      const p = normPath(s.sample, siteUrl)
      push(image, p, s.key)
      push(imageBase, basename(p), s.key)
    } else if (s.type === 'url') {
      push(url, normHref(s.sample, siteUrl), s.key)
    } else {
      const n = normText(s.sample)
      if (!n) continue
      push(text, n, s.key)
      if (compact(n).length >= 4) push(textCompact, compact(n), s.key)
      // A field that holds markup (<li>, ((li))) renders as several blocks: each text segment is that slot's text.
      if (/<[a-z/][^>]*>|\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)/i.test(s.sample)) {
        for (const seg of String(s.sample).split(/<[^>]+>|\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?\)\)/i)) {
          const sn = normText(seg)
          // A phone number or a figure has digits and no letters: count both, as the page reader does.
          if (alnumCount(sn) >= 2 && sn !== n) {
            push(text, sn, s.key)
            push(textCompact, compact(sn), s.key)
            if (letterCount(sn) >= 3 || alnumCount(sn) >= 7) textList.push({ norm: sn, key: s.key })
          }
        }
      }
      // A phone number or a figure in a field of its own has no letter: count digits too, as for a segment above, so
      // a block that prints it after a label slot ("or CALL: (239) 555-0108") is that pair, not a hole.
      if (letterCount(n) >= 3 || alnumCount(n) >= 7) textList.push({ norm: n, key: s.key })
    }
  }
  textList.sort((a, b) => b.norm.length - a.norm.length)

  // Pages declared by the map: menu item id + route. `index.php?Itemid=<id>` opens any of them
  // whatever the site's SEF settings, so the audit never depends on guessing URL rewriting.
  const mapPages =
    platform === 'wordpress'
      ? // A WordPress map declares no routes: every page entity opens by its slug, whatever the permalinks are.
        map.entities
          .filter((e) => e.kind === 'page' && typeof e.identity?.slug === 'string')
          .map((e) => ({ entity: e.key, route: e.identity.slug, openAs: `?pagename=${e.identity.slug}` }))
      : map.pages
  const pages = mapPages.map((p) => {
    const ent = entityByKey.get(p.entity)
    const initial = lock.entities?.[p.entity] ?? {}
    return {
      entity: p.entity,
      sourceId: ent?.sourceId,
      route: p.route,
      link: p.link,
      openAs: p.openAs,
      type: platform === 'wordpress' ? 'page' : initial.type,
      published: platform === 'wordpress' ? '1' : initial.published,
      title: initial.title,
      assignedModules: p.assignedModules?.map((m) => m.entity) ?? []
    }
  })

  // Files the lock pins, split into template/framework assets and media-library files.
  const lockedFiles = new Set(Object.keys(lock.files ?? {}).map((f) => f.toLowerCase()))

  return {
    dir,
    manifest,
    map,
    lock,
    sha256: {
      contentMap: fileSha256(dir, 'content-map.json'),
      presentationLock: fileSha256(dir, 'presentation-lock.json')
    },
    entityByKey,
    entityByRow,
    entityOfRow,
    platform,
    pages,
    lockedFiles,
    slotsByKey: new Map(map.slots.map((s) => [s.key, s])),
    index: { text, textCompact, textList, image, imageBase, url, rawSample },
    template: manifest.template ?? manifest.theme,
    prefix: manifest.quickstart?.prefix ?? manifest.quickstart?.tablePrefix ?? ''
  }
}

/**
 * Is this media path pinned by the presentation lock as a DESIGN asset?
 * The lock hashes every file under its fileRoots AND under `images/` (the media library).
 * Hashing `images/` protects bytes, it does not decide that a demo photo is design, so only
 * files outside `images/` count as "locked on purpose".
 */
export function isLockedDesignAsset(contract, path) {
  const p = path.toLowerCase()
  return contract.lockedFiles.has(p) && !p.startsWith('images/')
}
