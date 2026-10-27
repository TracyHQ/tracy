/**
 * Keeps `/ops/wo`'s screen state and its address in step (rules in `wo-address.ts`).
 * Filters and typing replace the entry (debounced); a call to the returned `push()` before a state
 * change makes that change a new entry, so Back returns to the previous view, WO or place.
 */
import { useCallback, useEffect, useRef } from 'react'
import { parseWoAddress, type WoAddress, woSearchFor } from './wo-address.ts'

/** The shell's history writer (`shell/navigation-guard.ts`); false when it refused. */
export type WoNavigate = (href: string, replace: boolean) => boolean

const REPLACE_DELAY_MS = 300

export function useWoAddress(
  address: WoAddress,
  apply: (next: WoAddress) => void,
  { entry, navigate }: { entry?: object; navigate?: WoNavigate }
): () => void {
  const pushNext = useRef(false)
  const applyRef = useRef(apply)
  applyRef.current = apply
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const href = `${window.location.pathname}${woSearchFor(address, window.location.search)}`

  useEffect(() => {
    const here = `${window.location.pathname}${window.location.search}`
    if (href === here) {
      pushNext.current = false
      return
    }
    const write = () => {
      const replace = !pushNext.current
      pushNext.current = false
      const nav = navigateRef.current
      if (nav) nav(href, replace)
      else if (replace) window.history.replaceState(window.history.state, '', href)
      else window.history.pushState({}, '', href)
    }
    if (pushNext.current) {
      write()
      return
    }
    const timer = setTimeout(write, REPLACE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [href])

  // The shell hands a new `entry` on Back/Forward and on a rail click: re-read the address then.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    applyRef.current(parseWoAddress(window.location.search, window.location.hash))
  }, [entry])

  // Without the shell (the screen mounted alone), follow Back/Forward directly.
  const standalone = !navigate
  useEffect(() => {
    if (!standalone) return
    const onPop = () => applyRef.current(parseWoAddress(window.location.search, window.location.hash))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [standalone])

  return useCallback(() => {
    pushNext.current = true
    // A push that changed nothing must not turn the next filter change into a new entry.
    setTimeout(() => {
      pushNext.current = false
    }, 0)
  }, [])
}
