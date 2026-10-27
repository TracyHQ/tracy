/**
 * What the Design system tab reads besides the site's own design system read: the library (Refero's
 * systems, from the library door), the site's served address and shown name (the page's shared
 * `/api/sites` answer), and how many of the library's cards are in the page (`useReveal`).
 */
import { siteNameFor, siteRowFor } from '@tracy/core/site-key'
import { useEffect, useRef, useState } from 'react'

import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

import { fetchLibrary, type LibrarySystem } from './design-system-library.mjs'

/**
 * The library: Refero's systems from the library door (null while asked). A door that does not answer
 * gives its refusal code (said, with Try again: `retry`); no other list stands in for it (OpenDesign is
 * no longer offered, 12/10/2026).
 */
export function useSystemLibrary(): {
  systems: LibrarySystem[] | null
  error: string | null
  retry: () => void
} {
  const [systems, setSystems] = useState<LibrarySystem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setError(null)
    void (async () => {
      const lib = await fetchLibrary()
      if (!live) return
      if (lib.ok) setSystems(lib.systems)
      else setError(lib.code)
    })()
    return () => {
      live = false
    }
  }, [attempt])
  return { systems, error, retry: () => setAttempt((n) => n + 1) }
}

/**
 * The site's served address (what the live frame opens) and its shown name, from the one shared
 * `/api/sites` answer every plugin on the page reads — never guessed from the key. Null while asked.
 */
export function useSiteRow(siteKey: string | null): { copyUrl: string | null; name: string } | null {
  const [siteRow, setSiteRow] = useState<{ copyUrl: string | null; name: string } | null>(null)
  useEffect(() => {
    let live = true
    setSiteRow(null)
    if (!siteKey) return
    void readSites()
      .then((answer) => {
        if (!live) return
        const rows = ((answer.body as { sites?: unknown[] } | null)?.sites ?? []) as Parameters<
          typeof siteRowFor
        >[0]
        const row = siteRowFor(rows, siteKey)
        setSiteRow({
          copyUrl: typeof row?.copyUrl === 'string' && row.copyUrl !== '' ? row.copyUrl : null,
          name: siteNameFor(rows, siteKey)
        })
      })
      .catch(() => live && setSiteRow({ copyUrl: null, name: siteKey }))
    return () => {
      live = false
    }
  }, [siteKey])
  return siteRow
}

/** Cards added per reveal, and the first screenful: the gallery's own step (`Gallery.tsx`). */
const REVEAL_STEP = 30

/**
 * How many of `total` cards to render: `REVEAL_STEP` at first, thirty more each time the sentinel below
 * the last one comes within a screen, back to the first step when `reset` changes (a new search). The
 * gallery's way (`Gallery.tsx`): the sentinel is observed afresh on every count, so a wide window keeps
 * growing until the sentinel is pushed out of view. A thousand cards are never in the page at once.
 */
export function useReveal(
  total: number,
  reset: unknown
): { count: number; endRef: React.RefObject<HTMLDivElement | null> } {
  const [count, setCount] = useState(REVEAL_STEP)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => setCount(REVEAL_STEP), [reset])
  useEffect(() => {
    const el = endRef.current
    if (!el || count >= total) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + REVEAL_STEP, total))
      },
      { rootMargin: '100% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, total])
  return { count, endRef }
}
