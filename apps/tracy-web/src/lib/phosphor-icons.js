/**
 * Phosphor Icons (`@phosphor-icons/core`, MIT, licence in the package's own `LICENSE`): the icon set a brief build draws
 * an item icon from (spec TracyHQ/tracy#189). 1512 icons in six weights; the catalog names each icon with its tags and
 * categories, which the decor plan shortlists from (`website-opportunities/domain/icon-choice.mjs`).
 *
 * Read from the installed package, never copied into the repo: an icon's SVG is read once and kept in memory.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { icons } from '@phosphor-icons/core'

/** The six weights, from the thinnest line to the solid and two-tone forms. */
export const PHOSPHOR_WEIGHTS = Object.freeze(['thin', 'light', 'regular', 'bold', 'fill', 'duotone'])

/** Every icon as the decor plan reads it: name, tags, categories. */
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

/** The catalog (name, tags, categories of every icon). */
export function phosphorCatalog() {
  return CATALOG
}

/** Whether the set has an icon of this name. @param {string} name */
export const hasPhosphorIcon = (name) => NAMES.has(name)

/** @type {Map<string, Promise<string>>} */
const svgs = new Map()

/**
 * An icon's SVG (viewBox 0 0 256 256, `fill="currentColor"`), in one weight.
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
    got = readFile(fileURLToPath(import.meta.resolve(`@phosphor-icons/core/${w}/${file}`)), 'utf8')
    got.catch(() => svgs.delete(key))
    svgs.set(key, got)
  }
  return got
}
