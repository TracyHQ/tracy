// The site part (lib/site, written to site.json) joined into the kit: `site` at the top level, its errors, each
// page's main title source (`pages[].h1`), what each list holds (`lists[].holds`) and what each link does
// (`links[].action`), and the sentences the CMS prints in each block (`blocks[].fixedText`). Logo frames are named by the site part too (`logoFrameIds`, applied when frames are built).
import { createHash } from 'node:crypto'

import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'
import { linkAction, listHolds } from './site/helpers.mjs'

const ITEM_KINDS = /^(article|contact|user|userProfile)$/ // an entity with a page of its own in a collection

/**
 * @param {object} kit template-kit.json, changed in place
 * @param {{site: object, mainHeadings: object[], errors: object[]}|null} doc site.json, or null when it is missing
 * @param {object} map the content map
 * @param {object|null} [words] words-links.json: the DOM verdict on each piece of template words
 */
export function mergeSite(kit, doc, map, words = null) {
  if (!doc) {
    kit.site = null
    kit.errors.push({ kind: 'missing', field: 'site', reason: 'the site part did not run (no site.json)' })
  } else {
    kit.site = doc.site
    // A page the kit left out (a template showcase page) is not the kit's to fix.
    const kept = new Set(kit.pages.map((p) => p.id))
    const leftOut = (e) => {
      const m = /^pages\[([^\]]+)\]/.exec(String(e.field ?? ''))
      return !!m && !kept.has(m[1])
    }
    kit.errors.push(...(doc.errors ?? []).filter((e) => !leftOut(e)))
  }
  const idx = indexMap(map)
  const kindOf = new Map((map.entities ?? []).map((e) => [e.key, e.kind]))
  const heading = new Map((doc?.mainHeadings ?? []).map((h) => [h.pageId, h]))
  const itemPaths = new Set()
  const contactPaths = new Set()
  for (const p of kit.pages) {
    const owner = ownerOfPath(idx, p.path)?.owner
    if (ITEM_KINDS.test(kindOf.get(owner) ?? '')) itemPaths.add(p.path)
    if (kindOf.get(owner) === 'contact') contactPaths.add(p.path)
    const h = heading.get(p.id)
    if (h) {
      const { pageId: _pageId, path: _path, ...rest } = h
      p.h1 = rest
    } else p.h1 = doc ? { via: null, reason: 'the site part did not read this page' } : null
  }
  for (const f of doc?.site?.forms ?? [])
    if (f.kind === 'contact')
      for (const p of kit.pages)
        if (`body-${p.id.replace(/^page-/, '')}` === f.block) contactPaths.add(p.path)
  const roleOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.role ?? null]))
  const fixedOf = (id) =>
    (doc?.site?.fixedTexts ?? []).filter((f) => f.block === id).map(({ block: _b, at: _a, ...f }) => f)
  const namedOf = (id) =>
    (doc?.site?.nameSlots ?? []).filter((n) => n.source && n.block === id).map((n) => n.text ?? n.sample)
  for (const b of kit.blocks) {
    // A line the CMS prints (or a piece of one: a link inside it) is said once, with its source; a line printing
    // the site name is a name slot, not fixed text.
    const cms = fixedOf(b.id)
    const said = [...cms.map((c) => c.text), ...namedOf(b.id)].map(normText).filter(Boolean)
    // Template words no language string prints: measured in the DOM (measure-words-links.mjs).
    const plain = (b.fixedText ?? [])
      .filter((t) => !said.some((x) => x.includes(normText(t.text))))
      .map((t) => {
        const m = words?.words?.[b.id]?.[t.text]
        return m
          ? {
              ...t,
              source: { kind: 'template' },
              canHide: m.canHide,
              reason: m.reason,
              measuredBy: 'dom',
              evidence: m.evidence
            }
          : { ...t, source: { kind: 'template' }, canHide: null }
      })
    b.fixedText = [...plain, ...cms]
    for (const t of b.fixedText)
      if (t.canHide == null && !t.source?.constant)
        kit.errors.push({
          kind: 'missing',
          field: `blocks[${b.id}].fixedText[${t.text.slice(0, 40)}].canHide`,
          reason:
            words?.words?.[b.id]?.[t.text]?.reason ??
            'the words were not measured (no words-links.json entry)'
        })
    const blockRoles = [...b.lists.flatMap((l) => l.rowSlots ?? []), ...(b.frames ?? [])]
      .map((s) => s.role)
      .filter(Boolean)
    const inRow = new Set(b.lists.flatMap((l) => (l.rowSlots ?? []).map((s) => s.id)))
    for (const l of b.lists) l.holds = listHolds(l, { blockRoles, rowLinks: l.maxEvidence?.rowLinks ?? [] })
    for (const link of b.links)
      link.action = linkAction(
        {
          label: link.label,
          target: link.target,
          role: roleOf.get(link.id) ?? null,
          icon: link.icon ?? null
        },
        { itemPaths, contactPaths, inRow: inRow.has(link.id) }
      )
  }
  // Every piece of fixed text gets its id, the code a planner names to hide it.
  for (const b of kit.blocks) {
    const perConstant = new Map()
    for (const t of b.fixedText ?? [])
      if (t.source?.constant)
        perConstant.set(t.source.constant, (perConstant.get(t.source.constant) ?? 0) + 1)
    for (const t of b.fixedText ?? [])
      t.id = fixedTextId(b.id, t, { shared: (perConstant.get(t.source?.constant) ?? 0) > 1 })
  }
  kit.checks = {
    ...kit.checks,
    fixedTextIdsInvalid: fixedTextChecks({ blocks: kit.blocks, errors: kit.errors })
  }
  return kit
}

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The stable id of a piece of fixed text: its block and what it is, never its place in the list. A CMS line is named
 * by its language constant (the words around a placeholder change from page to page), plus a hash of its words when
 * the block shows two lines of that constant; template words by their text.
 * @param {string} blockId
 * @param {{text: string, source?: {constant?: string}}} t
 * @param {{shared?: boolean}} [o]
 */
export function fixedTextId(blockId, t, { shared = false } = {}) {
  const constant = t.source?.constant
  const words = normText(t.text)
  const hash = createHash('sha256').update(words).digest('hex').slice(0, 6)
  // Two lines of one constant in a block (two short lines of one value) are told apart by their words.
  if (constant) return `${blockId}.fixed-${slug(constant)}${shared ? `-${hash}` : ''}`
  const head = slug(words).slice(0, 32).replace(/-+$/, '')
  return `${blockId}.fixed-${head ? `${head}-` : ''}${hash}`
}

/** Self-check: every fixed text has an id and no two share one. Returns how many break it. */
export function fixedTextChecks({ blocks, errors }) {
  const seen = new Map()
  let wrong = 0
  for (const b of blocks)
    for (const t of b.fixedText ?? []) {
      if (!t.id) {
        wrong++
        errors.push({
          kind: 'fixed-text-id',
          field: `blocks[${b.id}].fixedText[${String(t.text).slice(0, 40)}].id`,
          reason: 'the fixed text has no id: a planner cannot name it'
        })
      } else if (seen.has(t.id)) {
        wrong++
        errors.push({
          kind: 'fixed-text-id',
          field: `blocks[${b.id}].fixedText[${t.id}].id`,
          reason: `two fixed texts share the id ${t.id} (${seen.get(t.id)} and ${String(t.text).slice(0, 40)})`
        })
      } else seen.set(t.id, String(t.text).slice(0, 40))
    }
  return wrong
}
