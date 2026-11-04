// The share stage (ADR 0044, decision 4, item 4): a link shared from a page shows that page's top picture, or the brand
// logo when the page has none. T4 prints `og:image` on content and contact pages from the page's `og_img` (the menu item's
// params, or an article's attribs), but only when `system_opengraph` is on in the template's `etc/global.json` file (its
// template style's copy of the switch is read for other components only, measured on T4 of JA Boxing). That file is locked
// by the contract and no door writes it, so a page's own picture may not print: this stage still writes it, where T4 reads
// it, and also writes the one share image `template.siteSettings` holds, which the plugin prints on any page whose head has
// no `og:image`. That image is the home page's top picture: a logo is too small for a social network to show on most sites.
// The picture of a page is read from the lines the picture stage reports: only a picture written to the site can be named,
// never one it refused, failed to upload or skipped. A page with neither a place nor a picture is reported skipped with the
// reason. Each written line names its read, so the site check can read it back. What the last report says the site holds is
// not written again, and the page's picture is still worked out from the whole site.
import { NO_LAST } from './no-last-report.js'
import { articleOfPage, menuRows, paramsOf, rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

export const SHARE_OWNER = 'share'
const each = (value) => (Array.isArray(value) ? value : [])
const WIDE = '1440'
/** The logo keys of a T4 site profile in the order a share card prefers them: the one made for a light ground first. */
const LOGO_KEYS = ['site_logo', 'site_logo_dark', 'site_logo_2']
const slashless = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')
const SITE_LINE = 'site:share-image'
const SWITCH_WORDS =
  'T4 prints it only when system_opengraph is on in the template etc/global.json, which no door writes; until then the site share image shows'

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

/** The picture a page shares: its top block's, or for an article page the first written picture of its article. */
export function pagePicture(page, kit, shown) {
  const article = articleOfPage(page, kit)
  return topPicture(page, shown) ?? (article === null ? null : (shown.get(`article-${article}`) ?? null))
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

/** The one share image of the site, which the plugin prints on a page with no `og:image` of its own. */
async function writeSiteImage({ call, kit, path, results }) {
  const template = kit?.template?.name
  if (typeof template !== 'string' || !template) {
    results.set(SITE_LINE, skipped('the kit names no template to hold the site share image'))
    return
  }
  try {
    await call('template.siteSettings', { operation: 'set', template, fields: { other_shareImage: path } })
    results.set(SITE_LINE, {
      status: 'written',
      ordered: path,
      readFrom: {
        action: 'template.siteSettings',
        params: { template, operation: 'read' },
        path: ['settings', 'other_shareImage']
      }
    })
  } catch (error) {
    results.set(SITE_LINE, failed(error.message))
  }
}

/** Put `og_img` on the article a page prints; its other settings stay as read. */
async function writeArticleImage({ call, id, path, reason }) {
  try {
    const answer = await call('content.get', { kind: 'article', id })
    await call('content.update', {
      kind: 'article',
      id,
      fields: { attribs: JSON.stringify({ ...paramsOf(answer?.item?.attribs), og_img: path }) }
    })
    return {
      status: 'written',
      reason,
      ordered: path,
      readFrom: readRow('article', id, 'attribs', ['og_img'])
    }
  } catch (error) {
    return failed(error.message)
  }
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
 *   pictureLines: object[], brandLines: object[], isCancelled?: () => Promise<boolean>, last?: object }} input
 *   `pageIds`: the pages the plan keeps; the lines are the picture stage's and the brand stage's own report lines
 * @returns {Promise<{ lines: object[], cancelled: boolean }>} report lines: `<page>:share-image`, `site:share-image`
 */
export async function runShareStage({
  door,
  siteKey,
  kit,
  pageIds,
  menutype = null,
  pictureLines,
  brandLines,
  isCancelled = async () => false,
  last = NO_LAST
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
      part: 'share-image',
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
    const picture = pagePicture(kitPages.get(id), kit, shown)
    return { id, path: picture ?? logo, from: picture ? 'picture' : 'logo' }
  })
  const wanted = plans.filter((p) => p.path)
  for (const p of plans.filter((x) => !x.path))
    results.set(
      `${p.id}:share-image`,
      skipped('the page shows no picture written to the site, and the brand wrote no logo to use instead')
    )
  if (!wanted.length) return finish(false)

  const reasonOf = (p) =>
    p.from === 'logo'
      ? `the page shows no picture of its own, so the logo is shared. ${SWITCH_WORDS}`
      : SWITCH_WORDS
  const fresh = wanted.filter((p) => !last.same(`${p.id}:share-image`, p.path))
  for (const p of wanted.filter((x) => !fresh.includes(x)))
    results.set(`${p.id}:share-image`, {
      status: 'written',
      reason: reasonOf(p),
      ordered: p.path,
      readFrom: last.line(`${p.id}:share-image`).readFrom
    })
  if (await isCancelled()) return finish(true)
  const home = plans.find((p) => slashless(kitPages.get(p.id)?.path) === '')
  const siteImage = home?.path ?? logo
  if (last.same(SITE_LINE, siteImage))
    results.set(SITE_LINE, {
      status: 'written',
      ordered: siteImage,
      readFrom: last.line(SITE_LINE).readFrom
    })
  else if (siteImage) await writeSiteImage({ call: write, kit, path: siteImage, results })
  if (!fresh.length) return finish(false)

  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    for (const p of fresh)
      results.set(`${p.id}:share-image`, failed(`the menu could not be read: ${error.message}`))
    return finish(false)
  }
  if (await isCancelled()) return finish(true)
  for (const p of fresh) {
    const page = kitPages.get(p.id)
    const opening = rowsOpening(page, rows, menutype)
    const article = opening.length ? null : articleOfPage(page, kit)
    const reason = reasonOf(p)
    let result
    if (opening.length) result = await writeImage({ call: write, opening, path: p.path, reason })
    else if (article !== null)
      result = await writeArticleImage({ call: write, id: article, path: p.path, reason })
    else
      result = skipped(
        'no published menu item or article opens this page, so a share picture has no place to live'
      )
    results.set(`${p.id}:share-image`, result)
  }
  return finish(false)
}
