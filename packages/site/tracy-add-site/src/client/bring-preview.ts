import { focusUnasked, isNarrowFrame, openUnasked, revealTab, type SidebarRight } from '@tracy/core/tab-link'

/**
 * Bring a site's preview into dsh's right column: the Browser tab already on the site, or a new one.
 *
 * `unasked` is the page's own load (the first conversation it binds to, with no `?tab=` in the
 * address): nobody asked for the preview, so on a narrow frame it is put in the column behind the
 * toggle and the conversation keeps the screen (dev acceptance 12/10/2026 at 360px). A wide frame
 * still opens it beside the chat. Anything else is a press (a site row, a session switch, the
 * `tracy:show-site` event) and is revealed. A `?tab=` address is `@tracy/dsh-tab-link`'s, which
 * opens the column itself.
 * @param options.right - `ctx.sidebarRight`, or undefined when it cannot be read.
 * @param options.already - the Browser tab already on the site's host, or null.
 * @param options.open - opens a new preview tab.
 * @param options.unasked - true on the page's own load.
 * @param options.narrow - whether the frame is narrow; read at call time by default.
 */
export function bringPreview({
  right,
  already,
  open,
  unasked,
  narrow = isNarrowFrame()
}: {
  right: SidebarRight | undefined
  already: string | null
  open: () => void
  unasked: boolean
  narrow?: boolean
}): void {
  if (already !== null) {
    // A preview already on the site keeps its page; with no column to read it is left as it is.
    if (right === undefined) return
    if (unasked) focusUnasked(right, already, narrow)
    else revealTab(right, already)
    return
  }
  if (unasked) openUnasked(right, open, narrow)
  else open()
}
