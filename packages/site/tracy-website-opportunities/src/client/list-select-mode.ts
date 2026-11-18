/**
 * Selection mode of My opportunities (#537, header C). Outside the mode no checkbox and no bulk action shows; the
 * "..." menu's Select enters it, Done or Escape leaves it and clears what was picked.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** The bar's leading checkbox: every row shown picked, some, or none. */
export function pickState(shownIds: readonly string[], picked: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const n = shownIds.filter((id) => picked.has(id)).length
  if (n === 0) return 'none'
  return n === shownIds.length ? 'all' : 'some'
}

/**
 * On and off, with Escape leaving the mode. `onLeave` clears the selection; `escapeBlocked` keeps Escape for an open
 * dialog (Delete asks first, and its Escape closes the dialog, not the mode).
 */
export function useSelectMode(onLeave: () => void, escapeBlocked: boolean) {
  const [on, setOn] = useState(false)
  const leaveRef = useRef(onLeave)
  leaveRef.current = onLeave
  const leave = useCallback(() => {
    setOn(false)
    leaveRef.current()
  }, [])
  const enter = useCallback(() => setOn(true), [])
  useEffect(() => {
    if (!on || escapeBlocked) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) leave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [on, escapeBlocked, leave])
  return { on, enter, leave }
}
