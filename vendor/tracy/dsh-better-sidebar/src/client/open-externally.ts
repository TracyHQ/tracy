// Tracy: open a page in the system browser, on purpose (TCH tasks/todo-desktop-window-shell.md).
//
// In the Tracy desktop app the window routes every link it is asked to open: a page of the site on
// screen lands in this side card's Browser tab. The Browser tab's own "Open externally" and
// "Open in browser" buttons mean the opposite — the person wants the real browser — and a URL alone
// cannot say so, so they ask the app's bridge (`tracyDesktop.links.openExternal`, exposed by the
// app's preload to its own top frame only). Anywhere else, `window.open` as upstream does.

interface DesktopLinks {
  openExternal?: (url: string) => void
}

export function openExternally(url: string): void {
  const links = (globalThis as { tracyDesktop?: { links?: DesktopLinks } }).tracyDesktop?.links
  if (typeof links?.openExternal === 'function') {
    links.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}
