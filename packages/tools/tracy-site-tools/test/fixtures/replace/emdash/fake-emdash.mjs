/**
 * An in-memory EmDash MCP door, and a harness that runs the replace job's REAL scripts
 * (`EMDASH_INDEX_SCRIPT`, `EMDASH_WRITE_SCRIPT`) against it — the exact strings the argv carry, with
 * `require`, `process`, `fetch`, the clock and the timers bound to fakes — so the tests assert the
 * code that ships, not a paraphrase of it (the pattern of `test/exec.test.mjs`'s `runScript`).
 *
 * The door answers what EmDash 0.38 answers for the tools the scripts call (`structure/emdash-src/
 * server.ts`): `content_list` (live columns, `nextCursor` paging), `content_update` (`_rev` checked
 * against base64 of `<version>:<updatedAt>`, data merged at the TOP level, `status:"published"`
 * publishes and answers `{item, _rev}`), `menu_get`/`menu_set_items` (every item re-created with a
 * new id, `parentIndex` → `parentId`), `settings_get`/`settings_update`, `schema_list_collections`,
 * `menu_list`, `taxonomy_list`, `taxonomy_list_terms`. Refusals are `isError` results with EmDash's
 * own `[CODE] …` text.
 */

import { createHash } from 'node:crypto'

/** A minted-shape token: it must never appear in anything a script writes out. */
export const TOKEN = 'ec_pat_FAKEtoken0123456789abcdefgh'

const clone = (v) => JSON.parse(JSON.stringify(v))
const rev = (row) => Buffer.from(`${row.version}:${row.updatedAt}`, 'utf8').toString('base64')

/**
 * @param {{ rows: any[], menus: any[], terms: any[], settings: any }} site - `site.json`.
 * @param {{ fault?: (name: string, args: any, n: number) => any, pageSize?: number }} [options]
 *   `fault` may answer instead of the door: `{ isError: '<text>' }`, `{ status: 500 }`, `'drop'`
 *   (the connection fails after the call reached the door — a write still lands), `'lost'` (fails
 *   before it does), `'hang'` (never answers).
 */
export function createFakeEmdash(site, { fault = () => undefined, pageSize = 100 } = {}) {
  const state = {
    rows: clone(site.rows).map((r) => ({ ...r, deletedAt: null })),
    menus: clone(site.menus),
    terms: clone(site.terms),
    settings: { ...clone(site.settings), postsPerPage: 4 },
    clock: Date.parse('2026-09-25T10:00:00.000Z')
  }
  /** @type {{ name: string, args: any }[]} */
  const calls = []
  let ids = 0
  const mint = () => `01FAKE${String((ids += 1)).padStart(20, '0')}`.slice(0, 26)
  const text = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
  const err = (t) => ({ isError: true, content: [{ type: 'text', text: t }] })

  /** @param {string} name @param {any} a */
  function tool(name, a) {
    switch (name) {
      case 'content_list': {
        const all = state.rows.filter(
          (r) =>
            r.collection === a.collection &&
            (a.locale === undefined || r.locale === a.locale) &&
            (a.status === undefined || r.status === a.status)
        )
        if (!state.rows.some((r) => r.collection === a.collection))
          return err(`[NOT_FOUND] Collection "${a.collection}" not found`)
        const start = a.cursor ? Number(a.cursor) : 0
        const size = Math.min(a.limit ?? 50, pageSize)
        const page = all.slice(start, start + size).map((r) => ({ ...clone(r), type: r.collection }))
        return text({
          items: page,
          ...(start + size < all.length ? { nextCursor: String(start + size) } : {})
        })
      }
      case 'schema_list_collections': {
        // A site may name its collections (with their `urlPattern`); else each collection its rows use, bare.
        const named = new Map((site.collections ?? []).map((c) => [c.slug, c]))
        for (const r of state.rows)
          if (!named.has(r.collection)) named.set(r.collection, { slug: r.collection })
        return text({ items: [...named.values()].map((c) => clone(c)) })
      }
      case 'menu_list':
        return text(
          state.menus
            .filter((m) => a.locale === undefined || m.locale === a.locale)
            .map((m) => ({ name: m.name, locale: m.locale, itemCount: m.items.length }))
        )
      case 'menu_get': {
        const m = state.menus.find(
          (x) => x.name === a.name && (a.locale === undefined || x.locale === a.locale)
        )
        return m ? text(clone(m)) : err(`[NOT_FOUND] Menu "${a.name}" not found`)
      }
      case 'taxonomy_list':
        return text({
          taxonomies: [...new Set(state.terms.map((t) => t.taxonomy))].map((n) => ({ name: n }))
        })
      case 'taxonomy_list_terms':
        return text({
          items: state.terms.filter(
            (t) => t.taxonomy === a.taxonomy && (a.locale === undefined || t.locale === a.locale)
          )
        })
      case 'settings_get':
        return text(clone(state.settings))
      case 'settings_update':
        Object.assign(state.settings, a)
        return text(clone(state.settings))
      case 'content_update': {
        const row = state.rows.find((r) => r.collection === a.collection && r.id === a.id)
        if (!row) return err(`[NOT_FOUND] Content item not found: ${a.id}`)
        if (a._rev !== rev(row)) return err('[CONFLICT] Content changed while the operation was in progress')
        row.data = { ...row.data, ...clone(a.data) }
        state.clock += 1000
        row.version += 1
        row.updatedAt = new Date(state.clock).toISOString()
        if (a.status === 'published') {
          row.status = 'published'
          row.version += 1
          row.liveRevisionId = row.draftRevisionId ?? row.liveRevisionId
          row.draftRevisionId = null
        }
        return text({ item: { ...clone(row), type: row.collection }, _rev: rev(row) })
      }
      case 'menu_set_items': {
        const m = state.menus.find((x) => x.name === a.name && x.locale === a.locale)
        if (!m) return err(`[NOT_FOUND] Menu "${a.name}" not found`)
        const made = []
        for (const [k, it] of a.items.entries()) {
          if (it.parentIndex !== undefined && !(it.parentIndex < k))
            return err('[VALIDATION_ERROR] parentIndex must be earlier')
          made.push({
            id: mint(),
            menuId: m.items[0]?.menuId ?? 'MENU',
            parentId: it.parentIndex === undefined ? null : made[it.parentIndex].id,
            sortOrder: k,
            type: it.type,
            referenceCollection: it.referenceCollection ?? null,
            referenceId: it.referenceId ?? null,
            customUrl: it.customUrl ?? null,
            label: it.label,
            titleAttr: it.titleAttr ?? null,
            target: it.target ?? null,
            cssClasses: it.cssClasses ?? null,
            createdAt: new Date(state.clock).toISOString(),
            locale: m.locale,
            translationGroup: null
          })
        }
        m.items = made
        return text({ name: m.name, locale: m.locale, itemCount: made.length })
      }
      default:
        return err(`[NOT_FOUND] Tool ${name} not found`)
    }
  }

  /** The `fetch` the scripts see. */
  async function fetch(url, opts) {
    const body = JSON.parse(opts.body)
    const { name, arguments: args } = body.params
    calls.push({
      name,
      args: clone(args),
      url,
      method: opts.method,
      redirect: opts.redirect,
      auth: opts.headers.authorization
    })
    const f = fault(name, args, calls.filter((c) => c.name === name).length)
    if (f === 'hang') return new Promise(() => {})
    if (f === 'lost') throw new Error(`socket hang up while sending Bearer ${TOKEN}`)
    if (f && typeof f === 'object' && typeof f.status === 'number')
      return { status: f.status, text: async () => 'upstream failed' }
    let result
    if (f && typeof f === 'object' && typeof f.isError === 'string') result = err(f.isError)
    else result = tool(name, args)
    if (f === 'drop') throw new Error('the connection closed before the answer')
    return { status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) }
  }

  return {
    fetch,
    calls,
    state,
    /** The data of one entry now. */
    row: (collection, slug, locale) =>
      state.rows.find((r) => r.collection === collection && r.slug === slug && r.locale === locale),
    menu: (name, locale) => state.menus.find((m) => m.name === name && m.locale === locale),
    /** Mark an entry as holding an unpublished change (D12). */
    stageDraft(collection, slug, locale) {
      const r = this.row(collection, slug, locale)
      r.draftRevisionId = 'DRAFT0000000000000000000000'
    },
    /** Someone else writes the entry between the read and the write. */
    touch(collection, slug, locale, field, value) {
      const r = this.row(collection, slug, locale)
      r.data[field] = value
      state.clock += 1000
      r.version += 1
      r.updatedAt = new Date(state.clock).toISOString()
    }
  }
}

/**
 * Run one of the scripts with its request on stdin; resolve its stdout (its one line).
 * @param {string} script
 * @param {{ fetch: Function, stdin: unknown, token?: string | null, now?: () => number,
 *   setTimeout?: Function, clearTimeout?: Function }} options
 */
export function runScript(script, options) {
  return new Promise((resolve, reject) => {
    let out = ''
    const data = []
    const end = []
    const done = () => resolve(out)
    const proc = {
      stdout: {
        write: (s) => {
          out += String(s)
          setImmediate(done)
          return true
        }
      },
      stdin: { on: (ev, cb) => (ev === 'data' ? data.push(cb) : ev === 'end' ? end.push(cb) : null) },
      exit: () => {
        throw { __exit: true }
      }
    }
    const token = options.token === undefined ? TOKEN : options.token
    const req = (name) =>
      name === 'fs'
        ? {
            readFileSync: () => {
              if (token === null) throw new Error('ENOENT')
              return `${token}\n`
            }
          }
        : name === 'crypto'
          ? { createHash }
          : {}
    const clock = options.now ? { now: options.now } : Date
    const names = [
      'require',
      'process',
      'fetch',
      'AbortSignal',
      'Date',
      'setTimeout',
      'clearTimeout',
      'Buffer'
    ]
    const values = [
      req,
      proc,
      options.fetch,
      AbortSignal,
      clock,
      options.setTimeout ?? setTimeout,
      options.clearTimeout ?? clearTimeout,
      Buffer
    ]
    try {
      new Function(...names, script)(...values)
    } catch (e) {
      if (!e || !e.__exit) return reject(e)
    }
    if (out !== '') return resolve(out)
    for (const cb of data) cb(Buffer.from(JSON.stringify(options.stdin)))
    for (const cb of end) cb()
    const started = Date.now()
    const iv = setInterval(() => {
      if (out !== '') {
        clearInterval(iv)
        resolve(out)
      } else if (Date.now() - started > 3000) {
        clearInterval(iv)
        reject(new Error('script wrote nothing'))
      }
    }, 2)
  })
}

/** A timer the test fires by hand: the script's deadline without a 45 s wait. */
export function manualTimers() {
  /** @type {Function[]} */
  const pending = []
  return {
    setTimeout: (fn) => {
      pending.push(fn)
      return pending.length
    },
    clearTimeout: (id) => {
      pending[id - 1] = () => {}
    },
    fire: () => {
      for (const fn of pending.splice(0)) fn()
    }
  }
}
