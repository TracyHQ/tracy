/** The real session-scoped composer actions supplied by dsh's input dock. */
import { useEffect } from 'react'
interface InputActions {
  setDraft(text: string): void
  submit(): void
}
let active: InputActions | undefined
export function TourComposerBridge({ inputActions }: { inputActions?: InputActions }) {
  useEffect(() => {
    active = inputActions
    return () => {
      if (active === inputActions) active = undefined
    }
  }, [inputActions])
  return null
}
export function sendTourPrompt(text: string): boolean {
  if (active === undefined) return false
  const input = active
  input.setDraft(text)
  // Let the resident editor paint the draft before its normal Send action consumes it.
  window.requestAnimationFrame(() => input.submit())
  return true
}
