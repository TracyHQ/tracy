// The place, picture, icon and page rules of `checkWriteOrder` (ticket #597), read from the order alone. Pure.
import { SEO_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT } from './write-order-pages.mjs'
import { titleKey } from './seo-limits.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const STATES = new Set(['show', 'hidden', 'fallback'])
const PICTURE_SOURCES = new Set(['own', 'generated', 'initials', 'none'])
const prefixOf = (id) => String(id).replace(/\.[^.]+$/, '')
const length = (text) => [...String(text)].length

/** Every place's state is known, and `hidden` lists exactly the places and lists not shown. */
export function stateProblems(places, order, report) {
  const listed = new Set(list(order?.hidden).map((h) => h.at))
  const notShown = new Set()
  const shown = new Set()
  for (const { place } of places) {
    if (!STATES.has(place.state))
      report('state_unknown', place.at, `${place.state} is not show, hidden or fallback`)
    else if (place.state !== 'show' && !listed.has(place.at))
      report('hidden_unlisted', place.at, `a ${place.state} place is listed in hidden`)
    ;(place.state === 'show' ? shown : notShown).add(place.at)
    for (const g of list(place.lists)) if (g.state !== 'show' && isText(g.at)) notShown.add(g.at)
  }
  // An empty picture frame of a shown place is listed hidden too (`hideEmptyPictures`).
  for (const p of list(order?.pictures)) if (p.state === 'hidden') notShown.add(p.frame)
  for (const h of list(order?.hidden))
    if (!notShown.has(h.at))
      report(
        shown.has(h.at) ? 'hidden_shown' : 'hidden_unknown',
        h.at,
        'hidden lists only places the order does not show'
      )
}

export function pictureProblems(order, report) {
  const pictures = list(order?.pictures)
  const byFrame = new Map(pictures.map((p) => [p.frame, p]))
  for (const p of pictures) {
    if (!PICTURE_SOURCES.has(p.source))
      report('picture_source', p.frame, `${p.source} is not own, generated, initials or none`)
    if (p.stock === true || p.generate?.stock === true)
      report('stock_picture', p.frame, 'a stock picture is never used')
    if (p.sameAs !== undefined) {
      const base = byFrame.get(p.sameAs)
      if (p.sameAs === p.frame) report('same_as_self', p.frame, 'a picture is never the same as itself')
      else if (!base) report('same_as_missing', p.frame, `${p.sameAs} is no frame`)
      else if (base.sameAs !== undefined)
        report('same_as_chain', p.frame, `${p.sameAs} is itself the same as another`)
    }
    if (p.source === 'own' && !p.file && !p.ref)
      report('picture_without_file', p.frame, 'an own picture names its file')
    if (p.source === 'generated' && !p.file && !p.generate)
      report('picture_without_file', p.frame, 'a generated picture names its file or how it is drawn')
    if (p.source === 'initials' && !p.substitute?.initials)
      report('picture_without_file', p.frame, 'an initials picture names the letters it shows')
    if (p.source === 'initials' && p.substitute?.personId !== p.person)
      report('initials_person', p.frame, 'an initials picture shows the initials of its own person')
    if (p.person && p.source === 'none')
      report(
        'person_picture_empty',
        p.frame,
        'the frame of a named person shows their photo or their initials'
      )
    if (p.source === 'none' && p.reason !== 'logo_from_brand_step' && p.state !== 'hidden')
      report('picture_empty_shown', p.frame, 'an empty picture frame is hidden, so the demo picture goes')
  }
}

export function iconProblems(order, entries, report) {
  for (const i of list(order?.icons)) {
    if (
      i.hidesLink !== undefined &&
      (prefixOf(i.hidesLink) !== prefixOf(i.id) || entries.get(i.hidesLink)?.icon !== i.id)
    )
      report('hides_link_foreign', i.id, 'a network icon hides only the link of its own row or item')
    if (i.case !== 'social' || i.source !== 'none' || !isText(i.link)) continue
    const link = entries.get(i.hidesLink)
    if (!link || link.action !== 'hide')
      report('network_link_shown', i.id, 'a hidden network icon hides its link')
  }
}

/** Every page's title, description and share image. */
export function pageProblems(order, report) {
  const limits = {
    title: order?.seo?.title ?? SEO_TITLE_LIMIT,
    description: order?.seo?.description ?? SEO_DESCRIPTION_LIMIT
  }
  const pictures = new Map(list(order?.pictures).map((p) => [p.frame, p]))
  const anyImage =
    list(order?.pictures).some((p) => p.source === 'own' || p.source === 'generated') ||
    order?.look?.logo?.kind === 'own'
  const titles = new Map()
  for (const page of list(order?.pages)) {
    const { title, description, shareImage } = page.seo ?? {}
    if (!isText(title)) report('seo_title_empty', page.id, 'every page has a title')
    else {
      const key = titleKey(title)
      if (titles.has(key))
        report('seo_title_not_unique', page.id, `page ${titles.get(key)} has the same title`)
      else titles.set(key, page.id)
      if (length(title) > limits.title)
        report('seo_title_over_limit', page.id, `${length(title)} characters for ${limits.title}`)
      if (/^(.+) \| \1$/.test(title)) report('seo_title_repeated', page.id, 'a title never repeats one name')
      if (title === page.id && (isText(page.name) ? page.name.trim() : null) !== title)
        report('seo_page_id', page.id, 'a page id is never a title')
    }
    if (!isText(description)) report('seo_description_empty', page.id, 'every page has a description')
    else if (length(description) > limits.description)
      report(
        'seo_description_over_limit',
        page.id,
        `${length(description)} characters for ${limits.description}`
      )
    if (
      shareImage?.frame !== undefined &&
      pictures.get(shareImage.frame)?.source !== 'own' &&
      pictures.get(shareImage.frame)?.source !== 'generated'
    )
      report('share_image_none', page.id, 'a share image is a picture the order shows')
    if (!shareImage && anyImage)
      report('share_image_missing', page.id, 'a page shares a picture when the order has one')
  }
}
