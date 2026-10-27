/**
 * A bound JA Podcast j6 1.0.1 site for `joomla-kept-tags.test.mjs`: its rows as the release's presentation lock pins them,
 * the tag map its quickstart database ships (`installation/sql/mysql/custom.sql`: 190 rows, articles 1-5 and 8-40, each
 * tagged 3-7), the Claude Cowork plugin's rules for both, and a model double for the Joomla engine.
 */
import { readFileSync } from 'node:fs'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'

export const contract = contractFor(defaultContracts(), 'quickstart/ja-podcast/j6', '1.0.1')
const lockOf = () => JSON.parse(readFileSync(`${contract.dir}/presentation-lock.json`, 'utf8')).entities
const mapOf = () => JSON.parse(readFileSync(`${contract.dir}/content-map.json`, 'utf8'))

/** JA Podcast 1.0.1's tag map, as its quickstart database ships it: 38 articles, five tags each. */
const podcastTagMap = () => {
  const map = new Map()
  for (const id of [1, 2, 3, 4, 5, ...Array.from({ length: 33 }, (_, i) => i + 8)])
    map.set(id, [3, 4, 5, 6, 7])
  return map
}

/** A model double: every text slot gets the customer's words, every other slot keeps its sample. */
export const model = {
  models: async () => ({
    text: {
      usage: () => ({}),
      chat: async ({ messages }) => {
        const input = JSON.parse(messages[1].content)
        if (messages[0].content.startsWith('You are tidying')) return '{"relabel": {}}'
        if (messages[0].content.startsWith('You finish the words')) return '{"values": {}}'
        if (Array.isArray(input)) return JSON.stringify(input.map(({ i, text }) => ({ i, text })))
        const values = {}
        for (const s of input.slots ?? [])
          if (!s.requiresEvidence)
            values[s.key] = s.type === 'text' && s.sample.trim() ? 'Hanoi Roofing' : s.sample
        return JSON.stringify({ values, pending: [], invented: [] })
      }
    }
  })
}

/**
 * A bound JA Podcast site: its rows as the release's lock pins them, its tag map, and the plugin's rules for both. A write
 * that names `tags` replaces an article's; any other write keeps them (0.24.1+). Deleting a tag takes its pairings; a
 * category trashed or deleted is recorded, its articles keep their tags.
 */
export function podcastSite() {
  const lock = lockOf()
  const rows = (/** @type {string} */ kind) =>
    Object.entries(lock)
      .filter(([key]) => key.startsWith(`${kind}-`))
      .map(([key, row]) => ({ id: Number(key.slice(kind.length + 1)), .../** @type {any} */ (row) }))
  const table = {
    article: rows('article'),
    category: rows('category'),
    menuItem: rows('menuItem'),
    module: rows('module')
  }
  const map = mapOf()
  const site = {
    revision: 'rev-1',
    tags: podcastTagMap(),
    /** Every write that named tags, deleted a tag or took a category off. */
    tagWrites: /** @type {any[]} */ ([]),
    writes: 0,
    /** The articles a write reached, by id: the Apply must reach some for the count to mean anything. */
    articlesWritten: /** @type {Set<number>} */ (new Set()),
    stateOf: (/** @type {number} */ id) => table.article.find((r) => r.id === id)?.state,
    write(
      /** @type {{ kind: string, id: number, fields?: Record<string, unknown> }} */ step,
      deleted = false
    ) {
      site.writes += 1
      if (step.kind === 'tag' && deleted) {
        site.tagWrites.push({ deleted: 'tag', id: step.id })
        for (const [id, tags] of site.tags)
          site.tags.set(
            id,
            tags.filter((t) => t !== step.id)
          )
      }
      if (step.kind === 'category' && (deleted || Number(step.fields?.published) === -2))
        site.tagWrites.push({ trashed: 'category', id: step.id })
      if (step.kind === 'article' && step.fields && 'tags' in step.fields) {
        site.tagWrites.push({ article: step.id, tags: step.fields.tags })
        site.tags.set(step.id, Array.isArray(step.fields.tags) ? step.fields.tags.map(Number) : [])
      }
      if (step.kind === 'article') site.articlesWritten.add(step.id)
      const row = table[step.kind]?.find((r) => r.id === step.id)
      if (row && step.fields) Object.assign(row, step.fields)
      return true
    },
    apply: async ({ action, params }) => {
      if (action === 'content.list') {
        const all = table[params.kind]
        if (!all) return { ok: true, items: [] }
        return {
          ok: true,
          items: all.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 200))
        }
      }
      // Where a module shows, as the release's content map records it (`#__modules_menu`: 0 every page, -N all but N).
      if (action === 'content.get' && params.kind === 'moduleAssignment') {
        const menus = new Set()
        for (const page of map.pages ?? [])
          for (const a of page.assignedModules ?? [])
            if (a.entity === `module-${params.id}`)
              for (const m of a.assignmentMode === 'all' ? [0] : (a.menuIds ?? []).map(Number))
                menus.add(a.assignmentMode === 'exclude' ? -m : m)
        return { ok: true, item: { menuids: JSON.stringify([...menus]) } }
      }
      if (action === 'content.get') {
        const row = table[params.kind]?.find((r) => r.id === params.id)
        return row ? { ok: true, item: { ...row } } : { ok: false, error: 'not_found' }
      }
      if (action === 'content.update') return site.write(params) ? { ok: true } : { ok: false }
      if (action === 'content.delete') return site.write(params, true) ? { ok: true } : { ok: false }
      if (action === 'content.batch') {
        for (const step of params.operations) site.write(step)
        return { ok: true }
      }
      if (action === 'media.upload') return { ok: true }
      if (action !== 'content.contract')
        return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
      switch (params.operation) {
        case 'inspect':
          return {
            ok: true,
            contract: contract.id,
            revision: site.revision,
            slots: map.slots.map((s) => ({ ...s, current: s.sample })),
            pages: map.pages ?? [],
            job: null
          }
        case 'apply':
          // The plugin writes each slot through Joomla's Table; 0.24.1+ keeps the tags of every article it writes.
          site.writes += Object.keys(params.changes ?? {}).length
          for (const key of Object.keys(params.changes ?? {})) {
            const article = /^article-(\d+)\./.exec(key)
            if (article) site.articlesWritten.add(Number(article[1]))
          }
          site.revision = 'rev-2'
          return { ok: true, afterRevision: 'rev-2' }
        case 'demoTrim.apply':
          return { ok: true, status: 'completed', moved: 0 }
        case 'multilingual.retire':
          return { ok: true, status: 'completed', hidden: {} }
        default:
          return {
            ok: false,
            error: 'unsupported',
            message: `Unknown contract operation ${params.operation}`
          }
      }
    }
  }
  return site
}
