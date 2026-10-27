/**
 * A press on the model menu's empty or static parts keeps the menu open (Akemi 14/10/2026).
 *
 * Measured on the local cluster: in the Model pane, clicking the group heading ("Tracy AI") closed
 * the whole menu and dropped focus to <body>. dsh's ModelSelect closes on blur when focus leaves both
 * its trigger and the portaled card, and it keeps focus only for a mousedown on a button (its root
 * onMouseDown calls preventDefault there). A mousedown on the heading, a non-focusable div, takes
 * the default action: the focused row blurs, focus goes to <body> (relatedTarget null), and the blur
 * handler closes the menu. The card's padding and the gaps between rows did the same.
 *
 * The fix is the same move dsh makes for buttons, extended to the card's non-interactive parts: a
 * capture-phase mousedown inside the model card whose target is not a control is default-prevented,
 * so focus stays on the row that had it and the menu stays open. The click still happens (it does
 * nothing on a heading), and dsh's outside-click check still sees the press as inside the card.
 * Controls (rows, the search field, a retry button) keep their default, so typing, selecting and
 * dsh's own handling are untouched.
 *
 * The card is recognised by its trigger, not by its rows: the model seat's trigger names the open
 * card in aria-controls. A row-based hook (as MODEL_MENU_CSS uses) misses the panes without rows,
 * such as "No models available.", where a press closed the menu the same way (measured locally).
 */
const SEAT = '[data-slot="conversation.input.model"]'
/** Anything that takes focus or text input on its own; a press there keeps its default action. */
const CONTROL =
  'button, input, textarea, select, a[href], label, [tabindex], [contenteditable]:not([contenteditable="false"])'

/**
 * Install the page-wide listener.
 * @returns cleanup for exactly this listener.
 */
export function keepModelMenuFocus(): () => void {
  const onDown = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    // The card is portaled to <body>, so a control found above the target is one of its own.
    if (target.closest(CONTROL) !== null) return
    const card = target.closest('body > [id]')
    if (card === null) return
    const trigger = document.querySelector(`${SEAT} [aria-controls="${CSS.escape(card.id)}"]`)
    if (trigger === null) return
    event.preventDefault()
  }
  document.addEventListener('mousedown', onDown, true)
  return () => document.removeEventListener('mousedown', onDown, true)
}
