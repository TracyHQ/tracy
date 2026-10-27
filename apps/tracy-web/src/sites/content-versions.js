/**
 * WHAT CHANGED SINCE THE LAST READ: `version`, `ifVersion` and `changedSince` on `content.read`.
 *
 * A conversation reads the same pages again and again — after its own write, after a customer's
 * edit in the CMS admin, at the start of every turn. Each read sends the model the whole answer
 * again. Every content already carries a revision that moves when its content moves, from every
 * Claude Cowork plugin; so the relay can say, without any Claude Cowork plugin learning a new query:
 *
 * - `version` on every answer: a digest of what was read (the query, the projection, the seat, and
 *   each content's id and revision). Deterministic, so it needs no state: the same site read the
 *   same way gives the same version, across processes and restarts.
 * - `ifVersion`: the version the caller holds. When the new answer has the same version, the relay
 *   answers `notModified` instead of the answer again.
 * - `changedSince`: the version of a walk (`view=pages`, or an earlier `changedSince`). The
 *   relay walks the listing again and answers only the contents whose revision moved, the new ones,
 *   and the ids that are gone. A walk cut short (`truncated`) is kept too: compared over the rows
 *   it saw, a row it never reached counts as new, and ids are called gone only by a walk that
 *   reached the end. Timestamps cannot do this: a Joomla menu item has no modified time,
 *   and a deleted record has none at all. The walk's revisions are kept here, in memory, for
 *   {@link VERSION_TTL_MS}; an unknown or expired version is refused by name, and the caller reads
 *   the full list again.
 *
 * The Claude Cowork plugin is still asked every time: the relay keeps no copy of a site, so what this saves is
 * what the model reads, not the Claude Cowork plugin's own time.
 */
import { createHash } from 'node:crypto'

/** How long a walk's revisions can answer `changedSince`. */
export const VERSION_TTL_MS = 30 * 60 * 1000
/** Walks kept at once; the oldest goes first. */
export const VERSION_MAX_KEPT = 500

/**
 * The version of one answer.
 * @param {unknown} scope - everything that makes this read this read: site, seat, query, projection.
 * @param {any[]} rows - the contents read (each `{id, revision}`).
 */
export function versionOf(scope, rows) {
  const digest = createHash('sha256')
    .update(JSON.stringify([scope, rows.map((row) => [row?.id ?? null, row?.revision ?? null])]))
    .digest('hex')
  return `cv1.${digest.slice(0, 32)}`
}

/**
 * The query as the scope of a version: its keys sorted, the version parameters themselves left out.
 * @param {Record<string, unknown>} params
 */
export function queryScope(params) {
  return Object.fromEntries(
    Object.keys(params)
      .filter((key) => key !== 'ifVersion' && key !== 'changedSince')
      .sort()
      .map((key) => [key, params[key]])
  )
}

/**
 * The walks this process answered, by version. Only what `changedSince` needs to compare:
 * each content's revision, and the scope the walk was read in.
 * @param {{ now?: () => number }} [options]
 */
export function createVersionStore({ now = Date.now } = {}) {
  /** @type {Map<string, { at: number, scope: string, revisions: Map<string, string|null> }>} */
  const kept = new Map()
  return {
    /**
     * @param {string} version @param {unknown} scope @param {any[]} rows
     */
    remember(version, scope, rows) {
      kept.delete(version)
      kept.set(version, {
        at: now(),
        scope: JSON.stringify(scope),
        revisions: new Map(rows.map((row) => [row.id, row.revision ?? null]))
      })
      while (kept.size > VERSION_MAX_KEPT) kept.delete(kept.keys().next().value)
    },
    /**
     * The revisions of the walk `version` names, when it was read in the same scope and is fresh.
     * @param {string} version @param {unknown} scope
     */
    recall(version, scope) {
      const held = kept.get(version)
      if (!held || now() - held.at > VERSION_TTL_MS || held.scope !== JSON.stringify(scope)) return null
      return held.revisions
    }
  }
}

/**
 * What moved between a walk's revisions and the rows read now.
 * @param {Map<string, string|null>} before
 * @param {any[]} rows
 */
export function changesBetween(before, rows) {
  const now = new Set()
  const changed = []
  for (const row of rows) {
    now.add(row.id)
    if (!before.has(row.id) || before.get(row.id) !== (row.revision ?? null)) changed.push(row)
  }
  const removed = [...before.keys()].filter((id) => !now.has(id))
  return { changed, removed }
}
