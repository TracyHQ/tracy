// Pictures printed with no file (ticket #597, gate run 7): an `img` whose `src` is empty, or names only the site root
// (`/`, the base address itself), shows a broken picture; a browser reads an empty `src` as the page's own address.
// A built site printed the footer logo so when the plan had a text logo. Each such element is an `empty_picture`
// finding of the pages check, with the page and the element's place (its parent's tag and class), never its words.
import { elementsOf } from './html-read.mjs'

/** Whether a picture address names no file: empty, or the site root alone. */
export function isEmptyPictureSrc(src, page, base) {
  const value = String(src ?? '').trim()
  if (value === '' || value === '/' || value === '#') return true
  try {
    const url = new URL(value, page.abs ?? base)
    const root = new URL('./', base)
    return url.origin === root.origin && url.pathname === root.pathname && !url.search
  } catch {
    return false
  }
}

/** Every `img` with an empty or root `src` on the pages read: `empty_picture` findings. */
export function emptyPictureFindings(pages, base) {
  const out = []
  for (const page of pages) {
    if (!page.tree) continue
    for (const el of elementsOf(page.tree)) {
      if (el.name !== 'img' || !Object.hasOwn(el.attrs, 'src')) continue
      if (!isEmptyPictureSrc(el.attrs.src, page, base)) continue
      const holder = el.parent
      out.push({
        kind: 'empty_picture',
        page: page.path,
        place: { parent: holder?.name ?? null, class: holder?.attrs?.class ?? null, src: el.attrs.src }
      })
    }
  }
  return out
}
