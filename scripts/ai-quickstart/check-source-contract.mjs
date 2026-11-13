/**
 * The parts of the AI quickstart contract check (gate `ai-quickstart-contract`, ticket #584) that read the source
 * contract the block store was drafted from (`blockStore.draftedBy.kit`, under
 * `packages/cms/tracy-joomla-quickstart/contracts/`): the library positions and the demo's network icons.
 *
 * Library positions.
 * The mapping file names the template position the Tracy library blocks are published in (`library.position`, with
 * per page type exceptions in `library.pageTypes`). A position the template does not have publishes a block nowhere,
 * with no error. The positions are those the source contract records: every `position` of its template kit (the
 * kit's blocks and their modules) and of the module identities of its content map.
 *
 * Network icons. A store field that keeps a network icon as a class of the template's icon font (`iconOf: "network"`,
 * `storage: "class-name"`) is written from `networkIconClasses`; a network the demo draws in such a place (its
 * `fa-<network>` class in the content map sample) that the table lacks would leave a build without the class for it.
 *
 * Inline markup. A text field's `inline` says how a build writes the value (`write`), which follows from how its
 * places store it (`inlineWriteOfSlot`), and where its accent span sits (`at`), which follows from the demo values:
 * each place's span position is one the field declares, and each declared position is one a place has.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { SOCIAL_NETWORKS } from '../../packages/wo/website-opportunities/domain/icon-social.mjs'
import {
  inlineWriteOfSlot,
  spanAtOfSample
} from '../../packages/wo/website-opportunities/domain/ai-quickstart-inline.mjs'

const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'

/** Every string `position` value in a parsed JSON document. */
function positionsIn(value, found) {
  if (Array.isArray(value)) for (const v of value) positionsIn(v, found)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value))
      if (k === 'position' && typeof v === 'string' && v.trim()) found.add(v)
      else positionsIn(v, found)
  return found
}

/** The template positions the source contract `<slug>/<cms>/<version>` records, or null when it is not in the tree. */
export function templatePositions(contract, rootDir) {
  const dir = path.join(rootDir, CONTRACTS, String(contract))
  const files = ['template-kit.json', 'content-map.json'].map((f) => path.join(dir, f))
  if (typeof contract !== 'string' || !files.every((f) => existsSync(f))) return null
  const found = new Set()
  for (const f of files) positionsIn(JSON.parse(readFileSync(f, 'utf8')), found)
  return found
}

/** The problems of the library positions of a mapping file, against the contract its block store was drafted from. */
export function libraryPositionProblems(mapping, blockStore, rootDir) {
  const library = mapping?.library
  if (!library || typeof library !== 'object') return []
  const contract = blockStore?.draftedBy?.kit
  const positions = templatePositions(contract, rootDir)
  if (!positions)
    return [
      {
        file: 'block-store.json',
        at: 'draftedBy.kit',
        message: `names no source contract under ${CONTRACTS}/ to read the template positions from`
      }
    ]
  const out = []
  const known = [...positions].sort().join(', ')
  const check = (at, position) => {
    if (typeof position === 'string' && !positions.has(position))
      out.push({
        file: 'mapping.json',
        at,
        message: `"${position}" is no position of the template (the source contract records ${known})`
      })
  }
  check('library.position', library.position)
  for (const [type, position] of Object.entries(library.pageTypes ?? {}))
    check(`library.pageTypes[${type}]`, position)
  return out
}

/** The network an icon font class token names (`fa-facebook`), or null; the old bird (`fa-twitter`) names x. */
function networkOfClass(token) {
  const name = /^fa-([a-z]+)$/.exec(token)?.[1]
  if (!name) return null
  const network = name === 'twitter' ? 'x' : name
  return SOCIAL_NETWORKS.some((n) => n.network === network) ? network : null
}

/** Every store field of a block, in its blocks, items and child lists. */
function fieldsOf(block) {
  const out = [...(block.fields ?? []), ...(block.itemFields ?? [])]
  const walk = (lists) => {
    for (const l of lists ?? []) {
      out.push(...(l.fields ?? []))
      walk(l.lists)
    }
  }
  walk(block.lists)
  walk(block.itemLists)
  return out
}

/** The problems of `networkIconClasses` against the networks the demo draws in the store's class name icon places. */
export function demoNetworkProblems(mapping, blockStore, rootDir) {
  const contract = blockStore?.draftedBy?.kit
  const file = path.join(rootDir, CONTRACTS, String(contract), 'content-map.json')
  if (typeof contract !== 'string' || !existsSync(file)) return []
  const samples = new Map(JSON.parse(readFileSync(file, 'utf8')).slots.map((s) => [s.key, s.sample]))
  const classes = mapping?.networkIconClasses?.classes ?? {}
  const out = []
  const seen = new Set()
  for (const block of blockStore.blocks ?? [])
    for (const f of fieldsOf(block)) {
      if (f?.iconOf !== 'network' || f.storage !== 'class-name') continue
      for (const place of [f.slot ?? f.slots].flat(4)) {
        const key = typeof place === 'string' ? place.split('@')[0] : null
        for (const token of String(samples.get(key) ?? '').match(/fa-[a-z]+/g) ?? []) {
          const network = networkOfClass(token)
          if (!network || Object.hasOwn(classes, network) || seen.has(network)) continue
          seen.add(network)
          out.push({
            file: 'mapping.json',
            at: 'networkIconClasses.classes',
            message: `the demo draws ${network} (${token}, ${key}, ${block.id}.${f.name}): give its icon class`
          })
        }
      }
    }
  return out
}

/** The problems of the `inline` of the store's text fields against the source contract's content map. */
export function inlineSourceProblems(blockStore, rootDir) {
  const contract = blockStore?.draftedBy?.kit
  const file = path.join(rootDir, CONTRACTS, String(contract), 'content-map.json')
  if (typeof contract !== 'string' || !existsSync(file)) return []
  const slots = new Map(JSON.parse(readFileSync(file, 'utf8')).slots.map((s) => [s.key, s]))
  const out = []
  const problem = (at, message) => out.push({ file: 'block-store.json', at, message })
  for (const block of blockStore.blocks ?? [])
    for (const f of fieldsOf(block)) {
      const inline = f?.inline
      if (!inline || typeof inline !== 'object') continue
      const at = `blocks[${block.id}].${f.name}.inline`
      const places = [f.slot ?? f.slots]
        .flat(4)
        .filter((p) => typeof p === 'string' && !p.includes('@') && slots.has(p))
      // A place stored as plain words beside HTML ones (a masthead row titled Typography) takes the others' form.
      const forms = new Set(places.map((p) => inlineWriteOfSlot(slots.get(p))).filter(Boolean))
      if (forms.size !== 1 || !forms.has(inline.write))
        problem(
          `${at}.write`,
          `its places store the value as ${[...forms].join(', ') || 'nothing known'}, not ${JSON.stringify(inline.write)}`
        )
      const demo = new Set(places.map((p) => spanAtOfSample(slots.get(p).sample)).filter(Boolean))
      const declared = new Set(
        (Array.isArray(inline.emphasis) ? inline.emphasis : [])
          .filter((e) => e?.tag === 'span')
          .map((e) => e.at)
      )
      const missing = [...demo].filter((a) => !declared.has(a))
      const extra = [...declared].filter((a) => !demo.has(a))
      if (missing.length || extra.length)
        problem(
          `${at}.emphasis`,
          `the demo values put the accent span at ${[...demo].join(', ') || 'no place'}, the field declares ${[...declared].join(', ') || 'none'}`
        )
    }
  return out
}
