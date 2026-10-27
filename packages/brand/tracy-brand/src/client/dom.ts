/**
 * The parts of the coat that live outside slots and tokens: the tab title, the favicon, and the
 * stylesheets a chosen web font needs. Everything here runs inside `ctx.effect` and undoes itself.
 */
import { FAVICON } from './generated'
import { brandTitle, siteKeyFromPath } from '../shared/theme.mjs'

/**
 * Keep the browser title on Tracy's product name, led by the site this page works on.
 *
 * dsh writes `document.title` from a React effect on every session change, with a product name
 * baked in at build time (`DSH_CLIENT_TITLE`), so a one-off write would be undone on the next
 * session switch. Observing `<title>` and rewriting the product part only is one microtask behind
 * dsh's write — before paint — and leaves the session part untouched. `brandTitle` is idempotent,
 * so the rewrite never re-triggers itself. The site is read from the address on every write: one
 * page serves one site for its whole life, and the address is where that site is named.
 */
export function installTitle(): () => void {
  const fix = (): void => {
    const branded = brandTitle(document.title, siteKeyFromPath(location.pathname))
    if (branded !== document.title) document.title = branded
  }
  const titleEl =
    document.querySelector('title') ?? document.head.appendChild(document.createElement('title'))
  const observer = new MutationObserver(fix)
  observer.observe(titleEl, { childList: true, characterData: true, subtree: true })
  fix()
  return () => observer.disconnect()
}

/** Replace dsh's whale favicon with Tracy's, and put it back when the plugin goes. */
export function installFavicon(): () => void {
  const previous = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
  for (const link of previous) link.remove()
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = FAVICON
  link.dataset.tracyBrand = '1'
  document.head.appendChild(link)
  return () => {
    link.remove()
    for (const old of previous) document.head.appendChild(old)
  }
}

/** Mount the row stylesheet once. */
export function installStyles(css: string): () => void {
  const existing = document.querySelector('style[data-tracy-brand="1"]')
  if (existing) return () => {}
  const el = document.createElement('style')
  el.dataset.tracyBrand = '1'
  el.textContent = css
  document.head.appendChild(el)
  return () => el.remove()
}

/**
 * Keep exactly the font stylesheets the current choice needs. Called again on every change;
 * links already present stay (no re-download), links no longer needed go.
 */
export function syncFontLinks(urls: readonly string[]): void {
  const wanted = new Set(urls)
  const present = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-tracy-font]'))
  for (const link of present) {
    if (wanted.has(link.href)) wanted.delete(link.href)
    else link.remove()
  }
  for (const url of wanted) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.dataset.tracyFont = '1'
    document.head.appendChild(link)
  }
}
