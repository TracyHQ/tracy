/**
 * React side of `@tracy/core/interface-languages`: re-render when the interface language changes.
 *
 * dsh's locale plugin rewrites `<html lang>` on every switch, so watching that one attribute is a
 * way to follow Settings › Language that needs no handle on dsh's locale service. A component that
 * builds a string from `t()` once and hands it to something that keeps it (a tab title through
 * `updateTab`, a document title) calls this so the string is rebuilt in the new language; without it
 * an open tab keeps the language it was opened in (spec #730, ticket #740).
 */
import { useSyncExternalStore } from 'react'

/** @param {() => void} listener */
function subscribe(listener) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  return () => observer.disconnect()
}

/** @returns {string} */
function snapshot() {
  return typeof document === 'undefined' ? '' : document.documentElement.lang
}

/**
 * The interface language tag (`<html lang>`), re-rendering the caller when it changes.
 * @returns {string} the tag, '' outside a browser.
 */
export function useInterfaceLocale() {
  return useSyncExternalStore(subscribe, snapshot, () => '')
}
