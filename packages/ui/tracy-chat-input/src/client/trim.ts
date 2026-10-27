/**
 * Reclaim the space dsh's shell leaves behind when a site patch disables it.
 *
 * Disabling `ui-sidebar` empties the sidebar, but `ui-layout` still reserves its grid
 * track — a ~280px white gutter beside the conversation. The fix is CSS (see styles.ts),
 * and this decides *when* to apply it.
 *
 * It is a detection, not a setting, on purpose: the same bundle ships to a sidecar whose
 * shell is trimmed and to a dev machine where it is not, and a plugin that guessed wrong
 * would either leave the gutter or hide a sidebar someone still wants. So: look at whether
 * the sidebar column actually holds anything interactive, and only then trim.
 *
 * Fragile by nature — it reads dsh's DOM. Written to fail soft: if the column is not found
 * or still has content, nothing happens and the stock shell renders as before.
 */

const TRIM_CLASS = 'tracy-trim'

/** Class names carry a build hash prefix (`pI_x6G_sidebarCol`); match the readable tail. */
const SIDEBAR_COLUMN = '[class*="sidebarCol"]'
const INTERACTIVE = 'button, a, nav, input, [role="button"]'

function decide(): void {
  const column = document.querySelector(SIDEBAR_COLUMN)
  if (!column) return
  const empty = column.querySelector(INTERACTIVE) === null
  document.documentElement.classList.toggle(TRIM_CLASS, empty)
}

/**
 * Watch until the answer settles. The shell mounts in stages, so a single check on mount
 * can see an empty column that is about to be filled. A short observer covers that without
 * leaving a permanent listener on the page.
 */
export function watchShell(): () => void {
  decide()
  const observer = new MutationObserver(decide)
  observer.observe(document.body, { childList: true, subtree: true })
  const stop = window.setTimeout(() => observer.disconnect(), 5000)
  return () => {
    window.clearTimeout(stop)
    observer.disconnect()
    document.documentElement.classList.remove(TRIM_CLASS)
  }
}
