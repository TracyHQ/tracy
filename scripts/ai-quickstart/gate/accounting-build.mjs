// The accounting of the places of what the build writes besides the blocks (ticket #585 on #597's mapping keys,
// `buildPlacesOf` of `universe.mjs`). Each is written, declared not written (a page type the kit declares unbuilt), or
// skipped, `by` the write step (with the code its plan gives, or `key_not_read` when its plan reads the key and says
// nothing) or by the marker plan (a page it did not place). Pure.
import { ACCOUNT } from './universe.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const sameFields = (a, b) => JSON.stringify(list(a)) === JSON.stringify(list(b))

/** The code the write step gives when its plan reads none of these keys (#597 readers come later). */
export const KEY_NOT_READ = 'key_not_read'

const skippedBy = (by, code, why) => ({ account: ACCOUNT.skipped, by, code, why })
const writer = (code, why) => skippedBy('writer', code, why)

/**
 * @param {object} place a place of `buildPlacesOf`
 * @param {{writePlan: object, order: object, gaps: object[], unbuilt: Map<string, object>}} ctx
 * @returns {{account: string, by: string, code: string, why: string}}
 */
export function accountBuildPlace(place, { writePlan, order, gaps, unbuilt }) {
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
      return has('menu_item_link_not_declared', (u) => u.pageType === place.pageType)
        ? writer(
            'menu_item_link_not_declared',
            'the write plan builds the link without the declared menu item'
          )
        : notRead('the write plan makes the menu item by its own rule')
    case 'pages.under':
      return has('detail_position_not_printed', (u) => String(u.page).startsWith(place.pageType))
        ? writer('detail_position_not_printed', 'the article is not reached under its list page')
        : notRead('the write plan does not read the list page address')
    case 'pages.record':
    case 'pages.record.category':
      return place.declared?.kind !== 'contact' &&
        has('article_category_not_declared') &&
        place.kind === 'pages.record.category'
        ? writer('article_category_not_declared', 'the created articles carry no category')
        : notRead('the write plan does not read the record declaration')
    case 'pages.under.detailPositions':
      return has('detail_position_not_printed', (u) => String(u.page).startsWith(place.pageType))
        ? writer(
            'detail_position_not_printed',
            'a copy at a detail position is not assigned to the list page'
          )
        : notRead('the write plan does not read the detail positions')
    case 'escapes.places':
      return notRead('the write plan does not read how this place prints (escapeOf)')
    case 'pages.ownItem':
      return notRead('used only by a plan with no list page; the write plan does not read it')
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
      return ops.some((o) => o.recordKind === kind && o.kind === `${kind}.create`)
        ? notRead('a created record holds no HTML piece of this frame')
        : writer('no_record_created', `the write plan creates no ${kind} record`)
    }
    case 'seo.featuredView.article':
      return has('featured_article_needed')
        ? writer('featured_article_needed', 'the write plan does not mark a created post featured')
        : notRead('no featured view page')
    case 'hides':
      if (
        place.keys.includes('scope') &&
        has('control_shared_by_items', (u) => sameFields(u.fields, place.control))
      )
        return writer('control_shared_by_items', 'the write plan does not choose the item whose words win')
      return notRead(`the write plan does not read ${place.keys.join(', ')}`)
    default:
      return notRead(`the write plan does not read ${place.kind}`)
  }
}
