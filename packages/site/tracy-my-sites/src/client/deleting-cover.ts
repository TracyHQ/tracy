/**
 * The cover that holds the page while the site it stands in is being deleted.
 *
 * WHY IT EXISTS. The delete's first step tells the dsh to forget the site's sessions, so the page
 * loses its workspace while the request is still running: dsh unmounts the conversation (and this
 * tab with its dialog) and paints its "Choose workspace" hero, and the left column reads "No
 * sessions yet". Measured 29/09 on cowork.tracy.site: that screen stood from ~2.5 s after the
 * click until the DELETE answered at 4.3 s, and a site with more to tear down keeps it up longer.
 * To a customer it reads as being thrown out of their site. The cover goes up before the request
 * and stays until `window.location.replace` takes the page away.
 *
 * 🔒 MOUNTED ON document.body, NOT THROUGH REACT — the same reason as tracy-brand's boot cover
 * (`packages/brand/tracy-brand/src/client/boot-cover.tsx`): this tab lives inside dsh's layout,
 * whose layers open stacking contexts, and the tab itself is unmounted by the very change the cover
 * hides. A node React does not own survives both. Same look as the boot cover on purpose: the
 * person sees one Tracy "please wait" screen, whichever door led to it.
 *
 * The mark is handed in rather than imported here, so this file stays a plain function of its
 * inputs and a test can drive it with a fake document.
 */

/** SVG needs its own namespace; createElement would build an unknown HTML tag that never paints. */
const SVG_NS = 'http://www.w3.org/2000/svg'

const CSS = `
.tms-deleting-cover {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  background: var(--dsw-alias-bg-base, var(--background));
  font-family: inherit; text-align: center; padding: 24px;
}
@keyframes tms-deleting-spin { to { transform: rotate(360deg) } }
.tms-deleting-cover > svg {
  width: 56px; height: 56px; margin-bottom: 12px; transform-origin: 50% 50%;
  animation: tms-deleting-spin 9s linear infinite;
}
.tms-deleting-cover > .tms-deleting-title { font-size: 15px; font-weight: 500; color: var(--foreground); }
.tms-deleting-cover > .tms-deleting-detail { font-size: 13px; color: var(--muted-foreground); }
@media (prefers-reduced-motion: reduce) { .tms-deleting-cover > svg { animation: none } }
`

/** The part of `document` the cover touches; narrowed so a test can hand in a fake. */
export interface CoverDocument {
  head: { append(node: unknown): void }
  body: { append(node: unknown): void }
  createElement(tag: string): CoverElement
  createElementNS(ns: string, tag: string): CoverElement
}

interface CoverElement {
  className: string
  textContent: string | null
  setAttribute(name: string, value: string): void
  append(...nodes: unknown[]): void
  remove(): void
}

/**
 * Put the cover up.
 * @param doc - the document to cover (`document` in the page).
 * @param content - the two lines it shows, already translated, and the mark's outline and colour.
 * @returns a function that takes the cover down again; calling it twice is harmless.
 */
export function mountDeletingCover(
  doc: CoverDocument,
  content: { title: string; detail: string; mark: { path: string; color: string } }
): () => void {
  const style = doc.createElement('style')
  style.textContent = CSS
  const cover = doc.createElement('div')
  cover.className = 'tms-deleting-cover'
  cover.setAttribute('role', 'status')
  cover.setAttribute('aria-busy', 'true')

  const spinner = doc.createElementNS(SVG_NS, 'svg')
  spinner.setAttribute('viewBox', '0 0 800 800')
  spinner.setAttribute('aria-hidden', 'true')
  const outline = doc.createElementNS(SVG_NS, 'path')
  outline.setAttribute('d', content.mark.path)
  outline.setAttribute('fill', content.mark.color)
  spinner.append(outline)

  const title = doc.createElement('div')
  title.className = 'tms-deleting-title'
  title.textContent = content.title
  const detail = doc.createElement('div')
  detail.className = 'tms-deleting-detail'
  detail.textContent = content.detail

  cover.append(spinner, title, detail)
  doc.head.append(style)
  doc.body.append(cover)

  let up = true
  return () => {
    if (!up) return
    up = false
    cover.remove()
    style.remove()
  }
}
