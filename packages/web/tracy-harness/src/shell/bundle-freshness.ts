/**
 * Does this tab still run the /ops bundle the server serves?
 *
 * 🔒 WHY (12/10/2026). Every merge into `develop` redeploys `/ops`, but a tab opened before the
 * deploy keeps the old JavaScript until someone reloads it. Akemi's long-open tab ran a bundle from
 * before PR #1255 and sat on "Reading…" on Design Inspiration; a fresh tab of the new bundle could
 * not reproduce it, and a hard reload cured hers. Nothing had told the tab a new version was out.
 *
 * The served `index.html` names its entry script by content hash (`/ops/assets/index-<hash>.js`,
 * Vite's own naming, and `/ops` is answered `no-store`), so comparing that name with the one this
 * tab loaded is the whole check: no version door, no build stamp to keep in step.
 */

/** How often a visible tab asks. Deploys are minutes apart at most; a page read is a few KB. */
export const BUNDLE_CHECK_MS = 5 * 60 * 1000

/** The entry script an `/ops` page names, or null when it names none (no bundle built). */
export function entryScriptOf(html: string): string | null {
  const match = /<script[^>]*\ssrc="(\/ops\/assets\/index-[^"]+\.js)"/.exec(html)
  return match ? match[1] : null
}

/** The entry script THIS tab was started from, or null (the Vite dev server serves `/src/main.tsx`). */
export function loadedEntryScript(doc: Document): string | null {
  for (const script of doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
    const path = new URL(script.src, doc.baseURI).pathname
    if (/^\/ops\/assets\/index-[^/]+\.js$/.test(path)) return path
  }
  return null
}

type WatchWindow = Pick<
  Window,
  'setInterval' | 'clearInterval' | 'addEventListener' | 'removeEventListener'
> & {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
}

/**
 * Ask on an interval, and at once when the tab becomes visible again, whether the served bundle
 * still is `current`. Reports the new entry ONCE through `onStale`, then stops. A failed read or a
 * page with no entry says nothing: an offline moment is not a new version. Returns a stop function.
 */
export function watchBundle({
  win,
  current,
  fetchPage,
  onStale,
  intervalMs = BUNDLE_CHECK_MS
}: {
  win: WatchWindow
  current: string | null
  fetchPage: () => Promise<string>
  onStale: (next: string) => void
  intervalMs?: number
}): () => void {
  if (current === null) return () => {}
  let done = false
  let asking = false
  const check = async () => {
    if (done || asking) return
    asking = true
    try {
      const served = entryScriptOf(await fetchPage())
      if (!done && served !== null && served !== current) {
        stop()
        onStale(served)
      }
    } catch {
      // Offline, signed out, or the server between deploys: ask again on the next tick.
    } finally {
      asking = false
    }
  }
  const onVisible = () => {
    if (win.document.visibilityState === 'visible') void check()
  }
  const timer = win.setInterval(() => void check(), intervalMs)
  win.document.addEventListener('visibilitychange', onVisible)
  win.addEventListener('focus', onVisible)
  function stop() {
    done = true
    win.clearInterval(timer)
    win.document.removeEventListener('visibilitychange', onVisible)
    win.removeEventListener('focus', onVisible)
  }
  return stop
}

/** The served `/ops` page, never from a cache. */
export async function fetchOpsPage(): Promise<string> {
  const response = await fetch('/ops', { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`/ops answered ${String(response.status)}`)
  return await response.text()
}
