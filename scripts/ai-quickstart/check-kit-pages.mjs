/**
 * The records of the blank site a mapping file's pages name (ticket #597): every `{entity:<key>}` of a page link and
 * every `templateStyle` entity key must be an entity of the folder's blank site contract, the site the build starts
 * from. Part of `check.mjs`; the shape of `pages` is checked by the WO domain (`ai-quickstart-mapping-build.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const MAP = path.join('blank-site-contract', 'content-map.json')

/** The page items of a mapping file: [at, menu item]. */
const itemsOf = (pages) =>
  Object.entries(pages ?? {}).flatMap(([type, p]) =>
    [
      ['menuItem', p?.menuItem],
      ['ownItem', p?.ownItem]
    ]
      .filter(([, item]) => item)
      .map(([key, item]) => [`pages.${type}.${key}`, item])
  )

export function kitPageProblems(dir, mapping) {
  const file = path.join(dir, MAP)
  if (!mapping?.pages || !existsSync(file)) return []
  const kept = new Set(JSON.parse(readFileSync(file, 'utf8')).entities.map((e) => e.key))
  const problems = []
  const add = (at, message) => problems.push({ file: 'mapping.json', at, message })
  for (const [at, item] of itemsOf(mapping.pages)) {
    for (const [, ref] of String(item.link).matchAll(/\{entity:([^}]*)\}/g))
      if (!kept.has(ref)) add(`${at}.link`, `${ref} is no entity of the blank site contract`)
    if (typeof item.templateStyle === 'string' && !kept.has(item.templateStyle))
      add(`${at}.templateStyle`, `${item.templateStyle} is no template style of the blank site contract`)
  }
  return problems
}
