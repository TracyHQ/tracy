// The accounting of the places of what the build writes besides the blocks (ticket #585 on #597's mapping keys,
// `buildPlacesOf` of `universe.mjs`). Each is written, declared not written (a page type the kit declares unbuilt), or
// skipped, `by` the write step (with the code its plan gives, or the reason its plan shows) or by the marker plan (a
// page it did not place). A place is written or skipped only by what the write plan shows the write step did with it
// (`accounting-build-evidence.mjs`); a place its plan shows nothing for is `key_not_read`, so a key the write step
// stops reading is seen. Pure.
import {
  blockOps,
  categoryFiled,
  controlWritten,
  createOp,
  escapeUsed,
  evidenceOf,
  frameUse,
  hasRule,
  menuItemOp,
  menuItemsUse
} from './accounting-build-evidence.mjs'
import { ACCOUNT } from './universe.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const sameFields = (a, b) => JSON.stringify(list(a)) === JSON.stringify(list(b))

/** The code the write step gives when its plan reads none of these keys (#597 readers come later). */
export const KEY_NOT_READ = 'key_not_read'

const skippedBy = (by, code, why) => ({ account: ACCOUNT.skipped, by, code, why })
const writer = (code, why) => skippedBy('writer', code, why)
const written = (why) => ({ account: ACCOUNT.written, by: 'writer', code: 'written', why })

/** A hide of a block with `scope`, `from`, `element` or `order`, by the rule it leaves on the block's copies. */
function hidePlace(place, ev, notRead) {
  const ops = blockOps(ev, place.block)
  if (!ops.length) return notRead('the write plan holds no copy of ' + place.block)
  if (place.keys.includes('scope') || place.keys.includes('from')) {
    if (ops.some((o) => hasRule(o, 'hides.from_first_item')))
      return written('the control is taken from the first item (hides.from_first_item)')
    if (controlWritten(ev, ops, place.control))
      return writer('control_written', 'the control is written: nothing is taken out')
  }
  if (place.keys.includes('element')) {
    if (ops.some((o) => hasRule(o, 'hides.rows.remove')))
      return written('the element is taken out (hides.rows.remove)')
    if (controlWritten(ev, ops, place.control))
      return writer('control_written', 'the control is written: nothing is taken out')
  }
  if (place.keys.includes('order'))
    return written(
      'the rows are packed: the plan fills the first places in order, a gap would stop it (omit_row_gap)'
    )
  return notRead('the write plan shows nothing of ' + place.keys.join(', '))
}

/**
 * @param {object} place a place of `buildPlacesOf`
 * @param {{writePlan: object, order: object, gaps: object[], unbuilt: Map<string, object>}} ctx
 * @returns {{account: string, by: string, code: string, why: string}}
 */
export function accountBuildPlace(place, { writePlan, order, gaps, unbuilt, mapping = null }) {
  const ev = evidenceOf({ writePlan, order, mapping })
  const unproven = list(writePlan?.unproven)
  const ops = list(writePlan?.ops)
  const has = (code, test = () => true) => unproven.some((u) => u.code === code && test(u))
  const notRead = (why) => writer(KEY_NOT_READ, why)
  if (place.pageType && unbuilt.has(place.pageType)) {
    const code = unbuilt.get(place.pageType).code
    return { account: ACCOUNT.declared, by: 'kit', code, why: `page type declared unbuilt: ${code}` }
  }
  if (place.kind.startsWith('pages.')) {
    const placed = list(order?.pages).some((p) => p.pageType === place.pageType)
    if (!placed) {
      const gap = gaps.find((g) => list(g.blocks).some((b) => b.startsWith(`${place.pageType}/`)))
      return gap
        ? writer(
            gap.cause && gap.cause !== gap.code ? `${gap.code}:${gap.cause}` : gap.code,
            `write step gap took the page out: ${gap.cause ?? gap.record}`
          )
        : skippedBy('marker_plan', 'page_not_placed', 'the marker plan placed no page of this type')
    }
  }
  switch (place.kind) {
    case 'pages.menuItem':
      if (has('menu_item_link_not_declared', (u) => u.pageType === place.pageType))
        return writer(
          'menu_item_link_not_declared',
          'the write plan builds the link without the declared menu item'
        )
      return menuItemOp(ev, place.pageType, false)
        ? written('menu item made as declared (link, template style, params)')
        : notRead('the write plan makes no menu item of this page type')
    case 'pages.ownItem':
      if (menuItemOp(ev, place.pageType, true))
        return written('own menu item made: the plan has no list page')
      return ev.underTypes.has(place.pageType)
        ? writer(
            'page_reached_under_list',
            'the page is reached under its list page; its own item is read only without one'
          )
        : notRead('the write plan makes no own menu item of this page type')
    case 'pages.under':
    case 'pages.under.detailPositions':
      if (has('detail_position_not_printed', (u) => String(u.page).startsWith(place.pageType)))
        return writer(
          'detail_position_not_printed',
          'a copy at a detail position is not reached under its list page'
        )
      if (ev.underTypes.has(place.pageType))
        return written(
          place.kind === 'pages.under'
            ? 'reached under its list page at the declared address'
            : 'the blocks outside the detail positions are written or skipped typed (underNotWritten)'
        )
      return menuItemOp(ev, place.pageType, true)
        ? writer('list_page_not_in_plan', 'the plan has no list page: the page takes its own menu item')
        : notRead('the write plan reaches no page of this type under a list page')
    case 'pages.record':
      return createOp(ev, place.declared?.kind, place.pageType)
        ? written('the page record is created as declared')
        : notRead('the write plan creates no record of this page type')
    case 'pages.record.category':
      if (place.declared?.kind !== 'contact' && has('article_category_not_declared'))
        return writer('article_category_not_declared', 'the created articles carry no category')
      return categoryFiled(ev, place.pageType)
        ? written('the category is created and the records are filed in it')
        : notRead('the write plan files no record of this page type in a category')
    case 'escapes.places': {
      const entry = list(mapping?.escapes?.places)[place.path?.[2]]
      if (entry && escapeUsed(ev, entry))
        return written('a value the build writes takes this entry (escapeEntryAt)')
      if (entry?.escaped === 'not-written')
        return writer('escape_place_not_written', 'the kit says the build never writes here, and it does not')
      return writer(
        'escape_entry_not_used',
        'no value the build writes takes this entry: none at its places, or two entries match'
      )
    }
    case 'look.accent':
      if (has('accent_door_missing'))
        return writer('accent_door_missing', 'the write plan has no door for the declared accent module')
      return ops.some((o) => o.kind === 'look.accent')
        ? { account: ACCOUNT.written, by: 'writer', code: 'written', why: 'look.accent operation' }
        : notRead('no accent operation')
    case 'createdFrames': {
      const kind = place.recordKind
      if (ops.some((o) => o.recordKind === kind && o.unproven === 'created_record_frame'))
        return writer(
          'created_record_frame',
          'the created record is written into an empty value, not its frame'
        )
      const use = frameUse(ev, list(mapping?.createdFrames)[place.path?.[1]] ?? {}, place.entity)
      if (use === 'framed') return written('a created record writes its pieces into this frame')
      return use === 'no_piece_in_frame'
        ? writer(
            'no_piece_in_frame',
            'the created records write this value whole or not at all: no frame is needed'
          )
        : writer('no_record_created', 'the write plan creates no record from this entity')
    }
    case 'seo.featuredView.article': {
      if (has('featured_article_needed'))
        return writer('featured_article_needed', 'the write plan does not mark a created post featured')
      if (has('featured_article_none'))
        return writer('featured_article_none', 'no post in the plan: none is made featured')
      const a = mapping?.seo?.featuredView?.article
      const set = a?.set ?? {}
      return ops.some(
        (o) => o.kind === 'article.create' && o.pageType === a?.pageType && o.base?.[set.column] === set.value
      )
        ? written('the created posts are written featured')
        : notRead('the write plan writes no created post featured')
    }
    case 'placements.keyedRow':
      return blockOps(ev, place.block).some((o) => hasRule(o, 'key_at'))
        ? written('the row keyed to the page type is written (key_at)')
        : notRead('the write plan writes no row keyed to a page type in ' + place.block)
    case 'placements.holds.copies': {
      const held = list(mapping?.placements?.[place.block]?.holds?.blocks)
      return held.some((b) => blockOps(ev, b).some((o) => hasRule(o, 'resets.container')))
        ? written('the held blocks are copied into the container position (resets.container)')
        : notRead('the write plan copies no held block of ' + place.block)
    }
    case 'placements.menu.items': {
      const use = menuItemsUse(ev, place.block)
      if (use?.written) return written('the menu items the block draws are made')
      return use
        ? writer(use.reason, 'the write order leaves the menu block to its fallback, so it lists nothing')
        : notRead('the write plan makes no item of the menu ' + place.block + ' draws')
    }
    case 'hides':
      if (
        place.keys.includes('scope') &&
        has('control_shared_by_items', (u) => sameFields(u.fields, place.control))
      )
        return writer('control_shared_by_items', 'the write plan does not choose the item whose words win')
      return hidePlace(place, ev, notRead)
    default:
      return notRead(`the write plan does not read ${place.kind}`)
  }
}
