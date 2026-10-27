import type { MouseEvent } from 'react'

import type { PlaceRow, RowActions } from './types.ts'

/** Controls inside a row or card keep their own job; a click anywhere else toggles the selection. */
const OWN_JOB =
  'a, button, input, select, label, textarea, [role="checkbox"], [role="tooltip"], [data-slot="tooltip-content"]'

export function rowClickToggles(e: MouseEvent<HTMLElement>): boolean {
  return !(e.target instanceof Element && e.target.closest(OWN_JOB))
}

/** What a click on a row's empty space does: `toggle` its selection (default), or `open` it. */
export type RowClick = 'toggle' | 'open'

/** `open` falls back to toggling when the consumer gave no `onOpen`. */
export function rowClickHandler(mode: RowClick | undefined, row: PlaceRow, actions: RowActions): () => void {
  const open = actions.onOpen
  if (mode === 'open' && open) return () => open(row)
  return () => actions.onToggle(row.key)
}
