// A showcase block the template repeats on several pages is kept on one of them (spec TracyHQ/tracy#189, COO decision
// 30/10/2026). Measured on a local brief build (a coaching club on a Joomla T4 template): one decorative block, six photos
// and a "years running" figure, showed the same pictures and the same figure on the home, About, Team and lessons pages,
// so every page the visitor opened ended on the same strip.
//
// 🔒 A SHOWCASE BLOCK SHOWN ON SEVERAL KEPT PAGES STAYS ON ONE: the home page when it is shown there, else the kept page
// whose role fits it best (a gallery page for a photo block, then About, then the story page), else the first kept page in
// the plan's order. The plan names every other kept page it is taken off, with why; each engine narrows the block's page
// assignment to the page it stays on and never unpublishes it.
//
// A block is a showcase when its slots show pictures of the business or figures (a gallery, a photo strip, a figure band)
// and nothing that makes it a working part of the site: no person, offering, review, contact fact, social link, form,
// identity (name, logo, tagline) or menu label. A heading, an intro line and one button may sit with it. A block the
// content map declares as a call-to-action band, a layout band part or a link column is never one, and neither is a block
// the template shows on every page or on all pages but some (its frame: a footer strip, a masthead). Every other block
// shown on several kept pages is recorded as repeated on purpose (`repeat: 'everywhere'`), so the final check can tell a
// repeat the plan chose from one it missed. Rules by slot role, group kind and assignment mode only; pure and
// deterministic.

/** Slot roles whose content is a picture of the business or a figure: what a showcase shows. */
const SHOWCASE_ROLES = new Set([
  'business.gallery_image',
  'stat.value',
  'stat.label',
  'stat.context',
  'stat.proof_image'
])
/** Item kinds of a showcase list. */
const SHOWCASE_GROUPS = new Set(['gallery', 'stat_item'])
/** Roles that may sit beside a showcase: its heading, its intro line, its alt texts and one button. */
const COMPANION_ROLES = new Set([
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.navigation_url',
  'contact.cta_label',
  'contact.cta_url'
])

/** Why a page loses a repeated showcase block, as the plan says it. */
export const REPEATED_BLOCK_REASONS = Object.freeze({
  'repeated-showcase':
    'the same showcase block (photos, figures) was shown on several pages; it stays on the page it fits best',
  'repeated-on-purpose': 'a working block of the template that is shown on several pages by design'
})

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a block's own slots make it a showcase. */
function isShowcase(entity, slots) {
  const own = slots.filter((s) => s?.entity === entity)
  const shows = own.some(
    (s) => SHOWCASE_ROLES.has(String(s.role ?? '')) || SHOWCASE_GROUPS.has(String(s.group?.kind ?? ''))
  )
  if (!shows) return false
  return own.every(
    (s) => !s.role || SHOWCASE_ROLES.has(String(s.role)) || COMPANION_ROLES.has(String(s.role))
  )
}

/** The blocks the content map declares as working bands: call-to-action bands, layout band parts, link columns. */
function declaredBands(contentMap) {
  const out = new Set()
  for (const band of list(contentMap?.ctaBands)) if (band?.entity) out.add(band.entity)
  for (const band of list(contentMap?.layoutBands))
    for (const part of list(band?.parts)) if (part?.entity) out.add(part.entity)
  for (const group of list(contentMap?.navigationGroups)) if (group?.container) out.add(group.container)
  return out
}

/** How well a kept page's role fits a showcase block: lower is better. */
function fitOf(role, hasPictures) {
  if (role === 'home') return 0
  if (role === 'gallery' && hasPictures) return 1
  if (role === 'about') return 2
  if (role === 'history') return 3
  return 9
}

/**
 * The blocks the content map shows on more than one kept page, each with the plan's decision.
 * @param {object} input
 * @param {Array<{id: string, role?: string, decision?: string, keep?: boolean}>} input.pages - the site plan's page rows
 * @param {{entities?: any[], pages?: any[], slots?: any[], ctaBands?: any[], layoutBands?: any[], navigationGroups?: any[]} | null} input.contentMap
 * @returns {Array<{entity: string, repeat: 'once' | 'everywhere', pages: string[], keepOn?: {id: string, entity: string},
 *   takenOffFrom?: Array<{id: string, entity: string}>, reason: string, why: string}>}
 */
export function planRepeatedBlocks({ pages, contentMap }) {
  const entities = list(contentMap?.entities)
  const slots = list(contentMap?.slots)
  const pathOf = new Map(
    entities
      .filter((e) => e?.kind === 'menuItem' && typeof e.identity?.path === 'string')
      .map((e) => [e.key, e.identity.path])
  )
  const kept = list(pages).filter((row) => row && (row.decision === 'keep' || row.keep === true))
  const order = new Map(kept.map((row, index) => [row.id, index]))
  const roleOf = new Map(kept.map((row) => [row.id, String(row.role ?? '')]))
  /** @type {Map<string, {modes: Set<string>, on: Array<{id: string, entity: string}>}>} */
  const shown = new Map()
  for (const page of list(contentMap?.pages)) {
    const id = pathOf.get(page?.entity)
    if (id === undefined || !order.has(id)) continue
    for (const module of list(page.assignedModules)) {
      if (!module?.entity) continue
      const entry = shown.get(module.entity) ?? { modes: new Set(), on: [] }
      entry.modes.add(String(module.assignmentMode ?? ''))
      if (!entry.on.some((p) => p.id === id)) entry.on.push({ id, entity: page.entity })
      shown.set(module.entity, entry)
    }
  }
  const bands = declaredBands(contentMap)
  const out = []
  for (const [entity, { modes, on }] of shown) {
    if (on.length < 2) continue
    const ordered = [...on].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const chosen = [...modes].every((m) => m === 'include')
    if (!chosen || bands.has(entity) || !isShowcase(entity, slots)) {
      out.push({
        entity,
        repeat: 'everywhere',
        pages: ordered.map((p) => p.id),
        reason: 'repeated-on-purpose',
        why: REPEATED_BLOCK_REASONS['repeated-on-purpose']
      })
      continue
    }
    const pictures = slots.some((s) => s?.entity === entity && s.role === 'business.gallery_image')
    const best = [...ordered].sort(
      (a, b) =>
        fitOf(roleOf.get(a.id), pictures) - fitOf(roleOf.get(b.id), pictures) ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    )[0]
    out.push({
      entity,
      repeat: 'once',
      pages: ordered.map((p) => p.id),
      keepOn: best,
      takenOffFrom: ordered.filter((p) => p.id !== best.id),
      reason: 'repeated-showcase',
      why: REPEATED_BLOCK_REASONS['repeated-showcase']
    })
  }
  return out.sort((a, b) => a.entity.localeCompare(b.entity))
}
