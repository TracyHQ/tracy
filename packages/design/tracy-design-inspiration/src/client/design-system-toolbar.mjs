/**
 * Opening a site's Design system tab from a page event (plan `tasks/ke-hoach-nut-design-system.md`).
 *
 * The site start screen's Design system row (`tracy-chat-input` `design-system-card.mjs`) sends
 * `tracy:design-system-toolbar-press`; this module turns it into opening the site's design-system
 * tab. The event keeps the name it had when the toolbar button sent it.
 *
 * The site browser toolbar no longer carries a Design system button (Akemi, 12/10/2026): the row on
 * the start screen is the way in. The `dsh-better-sidebar` fork draws its button only from a state
 * said on `tracy:design-system-toolbar-state`, and nothing says one any more, so it draws none.
 */

export const DS_TOOLBAR_PRESS_EVENT = 'tracy:design-system-toolbar-press'
/** The operator's switch for the Design system tab and its doors (`catalogue.json`). */
export const DS_TOOLBAR_SWITCH = 'toolbar-design-system'

/**
 * Wire the tab opener for this page's site. Returns the disposer.
 * @param {{
 *   siteKey: string | null,
 *   target: EventTarget,
 *   isShown: () => boolean,
 *   open: (siteKey: string, sessionId: string) => void
 * }} deps
 */
export function watchDesignSystemToolbar({ siteKey, target, isShown, open }) {
  if (!siteKey) return () => {}
  /** @param {Event} event */
  const onPress = (event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    if (!d || d.siteKey !== siteKey) return
    let shown = false
    try {
      shown = isShown()
    } catch {
      shown = false
    }
    if (shown) open(siteKey, typeof d.sessionId === 'string' ? d.sessionId : '')
  }
  target.addEventListener(DS_TOOLBAR_PRESS_EVENT, onPress)
  return () => target.removeEventListener(DS_TOOLBAR_PRESS_EVENT, onPress)
}
