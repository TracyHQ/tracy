import { openTabWithMeta } from '@tracy/core/tab-link'

/**
 * Land the creation tab, in whatever state the handoff has reached.
 *
 * The tab is opened in three steps — "preparing" the moment the press is accepted, then the form,
 * or the failure — and each is an open of the SAME tab kind. dsh's native right column keeps one tab
 * per kind in a pane, so the second open FOCUSES the first one's tab and navigates it; the side card
 * refreshes only `path` and `url` on a navigation (`native/tab-adapter.tsx`), never `meta`. Since "a
 * blank session is handed back, not replaced", every press in the creation workspace lands both
 * opens in the same session, and without a patch the tab sat on "Preparing your Joomla assistant…"
 * for ever (measured 14/09, local stack, on the old side card — same rule, same failure).
 *
 * So the open is followed by `updateTab` on the tab the open LANDED on (`openTabWithMeta`) — the
 * active tab of that kind, whatever id dsh minted for it — and ONLY when the target is the session
 * on screen: `updateTab` has no scope, and a targeted open of an inactive session must not rewrite
 * the pending tab the press left behind in the old one. A creation tab already open from the `+`
 * list, or for another card, is patched the same way (#381).
 *
 * @param {import('@tracy/core/tab-link').TabOpener} sidebar `ctx.betterSidebar`
 * @param {import('@tracy/core/tab-link').SidebarRight | undefined} right `ctx.sidebarRight`
 * @param {{ type: string, title?: string, meta?: unknown }} seed
 * @param {{ sessionId: string }} [scope] the session the tab lands in; absent = the active one
 */
export function landBuildTab(sidebar, right, seed, scope) {
  openTabWithMeta(sidebar, right, seed, scope)
}
