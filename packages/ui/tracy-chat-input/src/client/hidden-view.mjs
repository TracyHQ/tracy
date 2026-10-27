/**
 * Leaving a conversation view an operator hid (/ops › User Interface › DSH).
 *
 * dsh remembers the last view per session (`ui-conversation` `setView`), so a customer who was on
 * Trajectory when an operator switched its tab off would come back to a view with no tab to leave
 * by. The tab strip carries `data-view` on each tab (dsh fork 0.1.7-rc.2-tracy.9); this decides
 * which tab to press, and `index.tsx` presses it.
 */

/**
 * Conversation view id → the switch that governs its tab. A view not listed here is not Tracy's to hide.
 * @type {Readonly<Record<string, string>>}
 */
const SWITCH_OF_VIEW = { trajectory: 'dsh-trajectory-tab' }

/**
 * @param {readonly { view: string, selected: boolean }[]} tabs The strip's tabs, in order.
 * @param {(switchId: string) => boolean} isShown The operator's switches.
 * @returns {string | null} The view to select instead, or null when nothing needs to move.
 */
export function viewToLeaveFor(tabs, isShown) {
  const selected = tabs.find((tab) => tab.selected)
  const governing = selected ? SWITCH_OF_VIEW[selected.view] : undefined
  if (governing === undefined || isShown(governing)) return null
  const visible = tabs.filter((tab) => {
    const id = SWITCH_OF_VIEW[tab.view]
    return id === undefined || isShown(id)
  })
  return (visible.find((tab) => tab.view === 'chat') ?? visible[0])?.view ?? null
}
