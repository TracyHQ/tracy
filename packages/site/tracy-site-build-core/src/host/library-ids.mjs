/**
 * The inspiration ids the build may be asked for. The catalog now lives on the public page and
 * the design-inspiration host caches it on disk by vendor commit (`$DSH_HOME/design-library/
 * <commit>/data/catalog.json`, `current` naming the commit — tasks/todo-thu-vien-mot-cho.md);
 * that cache is read first, the image's own catalog file second, so a lane that never opened the
 * tab still validates against something. Both absent = an empty set, and `check` refuses every id.
 */
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** @param {string} file */
function rowsIn(file) {
  const parsed = /** @type {{ systems?: { id?: unknown, name?: unknown }[] }} */ (
    JSON.parse(readFileSync(file, 'utf8'))
  )
  return (parsed.systems ?? []).filter((s) => typeof s.id === 'string')
}

/** @param {string} file */
function idsIn(file) {
  return new Set(rowsIn(file).map((s) => /** @type {string} */ (s.id)))
}

/** @param {string} file */
function namesIn(file) {
  return new Map(
    rowsIn(file).map((s) => [
      /** @type {string} */ (s.id),
      typeof s.name === 'string' ? s.name : /** @type {string} */ (s.id)
    ])
  )
}

/**
 * The catalog file the build reads, in the same order `catalogIds` looks: the design-inspiration
 * cache by commit first, the image's own copy second, or null when neither can be read.
 * @param {{ libraryCache?: string, catalog?: string }} config
 * @param {{ home?: string }} [env]
 */
function catalogFile(config, env = {}) {
  const home = env.home ?? process.env.DSH_HOME ?? os.homedir()
  const cacheDir = config.libraryCache ?? path.join(home, 'design-library')
  try {
    const commit = readFileSync(path.join(cacheDir, 'current'), 'utf8').trim()
    if (/^[0-9a-f]{6,40}$/.test(commit)) {
      const file = path.join(cacheDir, commit, 'data', 'catalog.json')
      readFileSync(file)
      return file
    }
  } catch {
    // no cache yet
  }
  return config.catalog ?? '/opt/tracy/design-catalog.json'
}

/**
 * The catalog's display names by id (`Apple` for `apple`), for the site's design record; empty
 * when no catalog can be read.
 * @param {{ libraryCache?: string, catalog?: string }} config
 * @param {{ home?: string }} [env]
 * @returns {Map<string, string>}
 */
export function catalogNames(config, env = {}) {
  try {
    return namesIn(catalogFile(config, env))
  } catch {
    return new Map()
  }
}

/**
 * @param {{ libraryCache?: string, catalog?: string }} config
 * @param {{ home?: string }} [env]
 * @returns {Set<string>}
 */
export function catalogIds(config, env = {}) {
  const home = env.home ?? process.env.DSH_HOME ?? os.homedir()
  const cacheDir = config.libraryCache ?? path.join(home, 'design-library')
  try {
    const commit = readFileSync(path.join(cacheDir, 'current'), 'utf8').trim()
    if (/^[0-9a-f]{6,40}$/.test(commit)) return idsIn(path.join(cacheDir, commit, 'data', 'catalog.json'))
  } catch {
    // no cache yet
  }
  try {
    return idsIn(config.catalog ?? '/opt/tracy/design-catalog.json')
  } catch {
    return new Set()
  }
}
