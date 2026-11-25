// A JA Diner EmDash site behind its MCP tools, in memory, for the EmDash content contract tests (emdash-contract.test.mjs,
// write-step-emdash.test.mjs): the release's own seed (`packages/cms/tracy-emdash-theme-diner/seed/seed.json`) as the
// site holds it after create, answered the way EmDash 1.1's tools answer (`vendor/emdash/emdash/packages/core/src/mcp/
// server.ts`): `content_get` gives `{item, _rev}`, `content_update` needs that `_rev` and with `status: 'published'` publishes
// at once, a draft is not found by a reader without draft access (the agent token has it). `calls(list)` answers as the
// site's host does (`apps/tracy-host/src/emdash-content.js`): `{ok, results: [{ok, data} | {ok: false, code, detail}]}`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openContentMap } from '../src/lib/content-map-source.js'

const THEME = fileURLToPath(new URL('../../../packages/cms/tracy-emdash-theme-diner/', import.meta.url))
export const DINER_CONTRACT = 'tracy-diner/emdash-0.x/0.1.4'
export const DINER_SITE = { quickstart_tag: 'tracy-diner/emdash-0.x', quickstart_version: '0.1.4' }

/** The content map of the release the fake site is built from. */
export const dinerContentMap = () => openContentMap(DINER_CONTRACT).doc

const seed = () => JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))

/** Words of a Portable Text array, as `markdown: true` answers them (paragraphs only). */
const markdownOfBlocks = (blocks) =>
  Array.isArray(blocks)
    ? blocks
        .map((b) => (Array.isArray(b?.children) ? b.children.map((c) => c?.text ?? '').join('') : ''))
        .filter(Boolean)
        .join('\n\n')
    : blocks

/**
 * @param {{ media?: object[], refuseUpdate?: (args: object) => string | null, drafts?: string[] }} [script]
 *   `media`: the library's items, newest first; `refuseUpdate`: the words of a refused `content_update`, or null;
 *   `drafts`: entries (`<collection>/<slug>`) that are drafts on this site
 */
export function emdashMcpSite(script = {}) {
  const s = seed()
  const richtext = new Set(
    s.collections.flatMap((c) =>
      c.fields.filter((f) => f.type === 'portableText').map((f) => `${c.slug}.${f.slug}`)
    )
  )
  const entries = new Map()
  let n = 0
  for (const [collection, list] of Object.entries(s.content))
    for (const e of list)
      entries.set(`${collection}/${e.slug}`, {
        collection,
        item: {
          id: `01JDINER${String((n += 1)).padStart(18, '0')}`,
          slug: e.slug,
          locale: e.locale ?? 'en',
          status: (script.drafts ?? []).includes(`${collection}/${e.slug}`)
            ? 'draft'
            : (e.status ?? 'published'),
          data: structuredClone(e.data ?? {})
        },
        rev: 1
      })
  const settings = { ...s.settings }
  const terms = new Map(
    (s.taxonomies ?? []).map((t) => [
      t.name,
      (t.terms ?? []).map((x) => ({ id: x.id, slug: x.slug, label: x.label }))
    ])
  )
  // Each menu as `menu_get` answers it: its items flat, each with its parent's id and its order under that parent.
  let itemIds = 0
  const flatten = (nodes, parentId = null) =>
    (nodes ?? []).flatMap((node, i) => {
      const id = `MI${String((itemIds += 1)).padStart(4, '0')}`
      const { children, url, ...rest } = node
      return [
        { ...rest, id, parentId, sortOrder: i, ...(url ? { customUrl: url } : {}) },
        ...flatten(children, id)
      ]
    })
  const menus = new Map(
    (s.menus ?? []).map((m) => [m.name, { name: m.name, label: m.label, items: flatten(m.items) }])
  )
  const media = [...(script.media ?? [])]
  const sent = []
  const byRef = (collection, ref) =>
    entries.get(`${collection}/${ref}`) ??
    [...entries.values()].find((e) => e.collection === collection && e.item.id === ref) ??
    null
  const ok = (data) => ({ ok: true, data })
  const no = (detail) => ({ ok: false, code: 'TOOL_FAILED', detail })
  const revOf = (e) => `rev-${e.item.id}-${e.rev}`

  const tools = {
    content_get({ collection, id, markdown }) {
      const e = byRef(collection, id)
      if (!e) return no(`Content item not found: ${id}`)
      const item = structuredClone(e.item)
      if (markdown)
        for (const key of Object.keys(item.data))
          if (richtext.has(`${collection}.${key}`)) item.data[key] = markdownOfBlocks(item.data[key])
      return ok({ item, _rev: revOf(e) })
    },
    content_update(args) {
      const e = byRef(args.collection, args.id)
      if (!e) return no(`Content item not found: ${args.id}`)
      if (args._rev !== revOf(e)) return no('Content has changed since _rev was read')
      const refused = script.refuseUpdate?.(args)
      if (refused) return no(refused)
      Object.assign(e.item.data, structuredClone(args.data ?? {}))
      if (args.status) e.item.status = args.status
      e.rev += 1
      return ok({ item: structuredClone(e.item), _rev: revOf(e) })
    },
    settings_get: () => ok({ ...settings }),
    settings_update(args) {
      Object.assign(settings, args)
      return ok({ ...settings })
    },
    taxonomy_list_terms({ taxonomy }) {
      const list = terms.get(taxonomy)
      return list ? ok({ items: structuredClone(list) }) : no(`Taxonomy '${taxonomy}' not found`)
    },
    taxonomy_update_term({ taxonomy, termSlug, label }) {
      const term = terms.get(taxonomy)?.find((t) => t.slug === termSlug)
      if (!term) return no(`Term '${termSlug}' not found`)
      if (label !== undefined) term.label = label
      return ok({ term: { ...term } })
    },
    menu_get({ name }) {
      const menu = menus.get(name)
      return menu ? ok(structuredClone(menu)) : no(`Menu '${name}' not found`)
    },
    menu_set_items({ name, items }) {
      const menu = menus.get(name)
      if (!menu) return no(`Menu '${name}' not found`)
      const ids = []
      const order = new Map()
      menu.items = items.map((it) => {
        const id = `MI${String((itemIds += 1)).padStart(4, '0')}`
        ids.push(id)
        const parentId = it.parentIndex === undefined ? null : ids[it.parentIndex]
        const sortOrder = order.get(parentId) ?? 0
        order.set(parentId, sortOrder + 1)
        const { parentIndex: _p, ...rest } = it
        return { ...rest, id, parentId, sortOrder }
      })
      return ok({ ...structuredClone(menu) })
    },
    media_list({ cursor }) {
      const at = cursor ? Number(cursor) : 0
      const items = media.slice(at, at + 100)
      return ok({ items, ...(at + 100 < media.length ? { nextCursor: String(at + 100) } : {}) })
    },
    media_get({ id }) {
      const item = media.find((m) => m.id === id)
      return item ? ok({ item }) : no(`Media not found: ${id}`)
    }
  }

  return {
    sent,
    entries,
    menus,
    settings,
    terms,
    media,
    /** What an entry holds now. */
    entry: (collection, slug) => entries.get(`${collection}/${slug}`)?.item ?? null,
    /** The host's `/emdash-content`: each call in order, each answered on its own. */
    calls: async (list) => {
      sent.push(...list)
      return {
        ok: true,
        results: list.map((c) => (tools[c.tool] ? tools[c.tool](c.args ?? {}) : no(`no tool ${c.tool}`)))
      }
    }
  }
}
