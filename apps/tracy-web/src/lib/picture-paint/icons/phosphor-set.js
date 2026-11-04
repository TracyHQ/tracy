// Shared: the picture step and the write step's painted frames draw with it, so it is in lib/ (module-graph.test.mjs).
// Phosphor Icons (`@phosphor-icons/core`, MIT, copyright Phosphor Icons; the licence text is kept beside this file in
// PHOSPHOR-LICENSE.txt and ships inside the package): the icon library of the picture step (ADR 0043 section 3, #345).
// 1512 icons in six weights; the catalog names each icon with its tags and categories, which the shortlist reads. The
// icon files are read from the installed package, never copied into the repo; an icon's SVG is read once and kept.
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { icons } from '@phosphor-icons/core'

// The installed package's own version, read from its package.json (the package does not export that file).
function installedVersion() {
  let dir = path.dirname(fileURLToPath(import.meta.resolve('@phosphor-icons/core')))
  for (let i = 0; i < 4; i += 1, dir = path.dirname(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
      if (pkg.name === '@phosphor-icons/core') return pkg.version
    } catch {
      // not the package folder: look one up
    }
  }
  return 'unknown'
}

/** The icon set and its version, recorded with every icon so the write step can draw it again from the name alone. */
export const PHOSPHOR_SET = `@phosphor-icons/core@${installedVersion()}`

/** The six weights, from the thinnest line to the solid and two-tone forms. */
export const PHOSPHOR_WEIGHTS = Object.freeze(['thin', 'light', 'regular', 'bold', 'fill', 'duotone'])

/** Every icon as the shortlist reads it: name, tags (without the package's own "*new*" style markers), categories. */
const CATALOG = Object.freeze(
  icons.map((i) =>
    Object.freeze({
      name: i.name,
      tags: Object.freeze(
        (i.tags ?? []).filter((t) => !/^\*.*\*$/.test(t)).map((t) => String(t).toLowerCase())
      ),
      categories: Object.freeze([...(i.categories ?? [])])
    })
  )
)
const NAMES = new Set(CATALOG.map((i) => i.name))

/** The catalog: name, tags and categories of every icon in the set. */
export const phosphorCatalog = () => CATALOG

/** The icon names, the library the picture check (P10) is given. */
export const phosphorNames = () => NAMES

/** Whether the set has an icon of this name. @param {string} name */
export const hasPhosphorIcon = (name) => NAMES.has(name)

/** @type {Map<string, Promise<string>>} */
const svgs = new Map()

/**
 * An icon's SVG (viewBox 0 0 256 256, `currentColor`), in one weight.
 * @param {string} name
 * @param {string} [weight]
 * @returns {Promise<string>}
 */
export function phosphorSvg(name, weight = 'regular') {
  if (!NAMES.has(name)) return Promise.reject(new Error(`no icon named ${name} in the icon set`))
  const w = PHOSPHOR_WEIGHTS.includes(weight) ? weight : 'regular'
  const key = `${w}/${name}`
  let got = svgs.get(key)
  if (!got) {
    const file = w === 'regular' ? `${name}.svg` : `${name}-${w}.svg`
    got = readFile(fileURLToPath(import.meta.resolve(`@phosphor-icons/core/assets/${w}/${file}`)), 'utf8')
    got.catch(() => svgs.delete(key))
    svgs.set(key, got)
  }
  return got
}
