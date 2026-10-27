/**
 * Whether an operator switched a piece off (/ops › User Interface): read from the ids on
 * `<html data-tracy-hide>`, the attribute `ui-switches` writes once its door answers, and followed
 * when it changes. Reading the attribute asks no door of its own.
 */
import { useSyncExternalStore } from 'react'

const ATTRIBUTE = 'data-tracy-hide'

function hiddenIds(): string {
  return typeof document === 'undefined' ? '' : (document.documentElement.getAttribute(ATTRIBUTE) ?? '')
}

function follow(change: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(change)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] })
  return () => observer.disconnect()
}

export function useSwitchOff(id: string): boolean {
  const ids = useSyncExternalStore(follow, hiddenIds, () => '')
  return ids.split(/\s+/).includes(id)
}
