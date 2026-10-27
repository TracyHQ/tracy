/**
 * What the public export of this repository leaves out (`scripts/opensource/public-tree.json`), so a
 * gate can tell "missing because it is internal" from "missing because it is broken".
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

/** @returns {string[]} the excluded paths; a trailing `/` marks a folder. */
export function publicTreeExcludes(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'scripts/opensource/public-tree.json'), 'utf8')).exclude
}

/**
 * The excluded entry a repository-relative path falls under, when that entry is absent from the tree
 * (the tree is an export); null when the path is not excluded or the entry is present (the private
 * repository, where the path is checked like any other).
 * @param {string} rel - path relative to the repository root, `/`-separated.
 * @param {{root?: string, excludes?: string[]}} [o]
 * @returns {string | null}
 */
export function absentExclusion(rel, { root = ROOT, excludes = publicTreeExcludes(root) } = {}) {
  const hit = excludes.find((e) =>
    e.endsWith('/') ? rel === e.slice(0, -1) || rel.startsWith(e) : rel === e
  )
  return hit !== undefined && !existsSync(join(root, hit)) ? hit : null
}
