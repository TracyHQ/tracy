// The share stage (ADR 0044, decision 4, item 4): a link shared from a page shows that page's top picture, or the brand
// logo when the page has none. The picture a T4 template prints as `og:image` comes from the page's menu item (`og_img`
// in its params) and only while the template's global switch `system_opengraph` is on, which is off on most releases.
// So this stage turns the switch on in the template styles and writes `og_img` on the menu item that opens each kept page.
// The picture of a page is read from the lines the picture stage reports: only a picture written to the site can be named,
// never one it refused, failed to upload or skipped. A page with no menu item, or with neither a picture nor a logo, is
// reported skipped with the reason. Each written line names its read, so the site check can read it back.
import { menuRows, rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

export const SHARE_OWNER = 'share'
const each = (value) => (Array.isArray(value) ? value : [])
const WIDE = '1440'
/** The logo keys of a T4 site profile in the order a share card prefers them: the one made for a light ground first. */
const LOGO_KEYS = ['site_logo', 'site_logo_dark', 'site_logo_2']
const SWITCH = 'system_opengraph'

const skipped = (reason) => ({ status: 'skipped', reason })
const failed = (reason) => ({ status: 'failed', reason })

/** The block or body a frame belongs to: `block-162.picture-1` is in `block-162`. */
const blockOf = (frame) => String(frame).split('.')[0]

/** The pictures written to the site by block, in the order the picture stage reported them: `Map<block, site path>`. */
export function shownPictures({ pictureLines, kit }) {
  const shown = new Map()
  const add = (frame, path) => {
    const block = blockOf(frame)
    if (typeof path === 'string' && path && !shown.has(block)) shown.set(block, path)
  }
  for (const line of each(pictureLines)) {
    if (line.status !== 'written') continue
    if (line.part === 'picture') add(line.slot, line.ordered)
    // A setting (the body background) shows in every frame the kit lists for it, not only in the one that was ordered.
    if (line.part === 'body-background') {
      const slot = each(kit?.site?.settingSlots).find((s) => s?.id === line.slot)
      for (const frame of each(slot?.frames).length ? slot.frames : [line.frame]) add(frame, line.ordered)
    }
  }
  return shown
}

/** The top picture of a page: the first block, from the top of the page, that shows a picture. */
export function topPicture(page, shown) {
  const blocks = page?.blocks?.[WIDE] ?? Object.values(page?.blocks ?? {})[0]
  for (const block of each(blocks)) if (block !== 'header' && shown.has(block)) return shown.get(block)
  return null
}

/** The brand logo written to the site, as a site path, or null when the brand stage wrote none to a site profile. */
export function writtenLogo(brandLines) {
  const found = new Map()
  for (const line of each(brandLines)) {
    if (line.part !== 'brand-logo' || line.status !== 'written' || typeof line.ordered !== 'string') continue
    const key = each(line.readFrom?.path).at(-1)
    if (LOGO_KEYS.includes(key) && !found.has(key)) found.set(key, line.ordered)
  }
  const key = LOGO_KEYS.find((k) => found.has(k))
  return key ? found.get(key) : null
}

/** A row's params as an object; a column that is not JSON counts as empty. */
function paramsOf(value) {
  try {
    const read = typeof value === 'string' ? JSON.parse(value) : value
    return read && typeof read === 'object' && !Array.isArray(read) ? read : {}
  } catch {
    return {}
  }
}

/** The template styles of the site's template (a row of another template or of the admin is left alone). */
async function styleRows(call, kit) {
  const name = kit?.template?.name
  const answer = await call('content.list', { kind: 'templateStyle', limit: 100, include_body: true })
  return each(answer?.items).filter(
    (row) =>
      Number(row.client_id ?? 0) === 0 && (typeof name !== 'string' || !row.template || row.template === name)
  )
}

/** Turn the template's Open Graph switch on in every style that has it off. One line a style. */
async function switchOn({ call, kit, lines }) {
  let rows
  try {
    rows = await styleRows(call, kit)
  } catch (error) {
    lines.set('share-switch', failed(`the template styles could not be read: ${error.message}`))
    return false
  }
  if (!rows.length) {
    lines.set('share-switch', skipped('the site has no template style of this template to switch on'))
    return false
  }
  let every = true
  for (const row of rows) {
    const slot = `share-switch:templateStyle-${row.id}`
    try {
      await call('content.update', {
        kind: 'templateStyle',
        id: Number(row.id),
        fields: { params: JSON.stringify({ ...paramsOf(row.params), [SWITCH]: '1' }) }
      })
      lines.set(slot, {
        status: 'written',
        ordered: '1',
        readFrom: readRow('templateStyle', Number(row.id), 'params', [SWITCH])
      })
    } catch (error) {
      lines.set(slot, failed(error.message))
      every = false
    }
  }
  return every
}

/** Put `og_img` on every menu item that opens the page; the others of the item's settings stay as read. */
async function writeImage({ call, opening, path, reason = null }) {
  let written = null
  let refusal = null
  for (const row of opening) {
    try {
      await call('content.update', {
        kind: 'menuItem',
        id: Number(row.id),
        fields: { params: JSON.stringify({ ...paramsOf(row.params), og_img: path }) }
      })
      written ??= Number(row.id)
    } catch (error) {
      refusal = error.message
    }
  }
  if (refusal !== null || written === null) return failed(refusal ?? 'no menu item took the write')
  return {
    status: 'written',
    reason,
    ordered: path,
    readFrom: readRow('menuItem', written, 'params', ['og_img'])
  }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, pageIds: string[], menutype?: string | null,
 *   pictureLines: object[], brandLines: object[], isCancelled?: () => Promise<boolean> }} input
 *   `pageIds`: the pages the plan keeps; the lines are the picture stage's and the brand stage's own report lines
 * @returns {Promise<{ lines: object[], cancelled: boolean }>} report lines: `<page>:share-image`, `share-switch:<style>`
 */
export async function runShareStage({
  door,
  siteKey,
  kit,
  pageIds,
  menutype = null,
  pictureLines,
  brandLines,
  isCancelled = async () => false
}) {
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const pages = each(pageIds).filter((id) => kitPages.has(id))
  const results = new Map()
  const finish = (cancelled) => ({
    cancelled,
    lines: [...results].map(([slot, r]) => ({
      slot,
      key: null,
      owner: SHARE_OWNER,
      readBack: null,
      part: slot.startsWith('share-switch') ? 'share-switch' : 'share-image',
      ...r
    }))
  })
  if (!pages.length) return finish(false)

  const call = doorCall(door, siteKey)
  const applyId = `share-${Date.now().toString(36)}`
  const write = (action, params) => call(action, { apply_id: applyId, ...params })
  const shown = shownPictures({ pictureLines, kit })
  const logo = writtenLogo(brandLines)
  const plans = pages.map((id) => {
    const picture = topPicture(kitPages.get(id), shown)
    return { id, path: picture ?? logo, from: picture ? 'picture' : 'logo' }
  })
  const wanted = plans.filter((p) => p.path)
  for (const p of plans.filter((x) => !x.path))
    results.set(
      `${p.id}:share-image`,
      skipped('the page shows no picture written to the site, and the brand wrote no logo to use instead')
    )
  if (!wanted.length) return finish(false)

  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    for (const p of wanted)
      results.set(`${p.id}:share-image`, failed(`the menu could not be read: ${error.message}`))
    return finish(false)
  }
  if (await isCancelled()) return finish(true)
  // The switch first: a menu picture on a template that prints no Open Graph tags would read back and still not show.
  await switchOn({ call: write, kit, lines: results })
  for (const p of wanted) {
    const opening = rowsOpening(kitPages.get(p.id), rows, menutype)
    results.set(
      `${p.id}:share-image`,
      opening.length
        ? await writeImage({
            call: write,
            opening,
            path: p.path,
            reason: p.from === 'logo' ? 'the page shows no picture of its own, so the logo is shared' : null
          })
        : skipped('no published menu item opens this page, and a share picture lives in its menu item')
    )
  }
  return finish(false)
}
