/**
 * One card picture, used by the library grid and by the three chat cards alike: the inspiration's own
 * fixture, laid out at 1280px, wearing the site's words, scaled to the card (spec §4f decision 3).
 * Before the site is read it is the fixture as the author drew it. Loaded as text and mounted through
 * `srcDoc`: a `src` on a `sandbox=""` iframe leaves without the seat cookie (see `fetchFixture`).
 */
import { type JSX, useEffect, useMemo, useRef, useState } from 'react'

import { fetchFixture, fetchSlots, type SitePreview } from './api'
import { fixtureDoc, nudgePaint, type Slot } from './fixture'
import { useFitScale } from './useFitScale'

/** The fixture and its slots, fetched together and cached by `api.ts`; null until both are here. */
export function useFixtureFiles(id: string, wanted = true): { html: string; slots: Slot[] } | null {
  const [files, setFiles] = useState<{ id: string; html: string; slots: Slot[] } | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    Promise.all([fetchFixture(id), fetchSlots(id)])
      .then(([html, slots]) => {
        if (live) setFiles({ id, html, slots })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, wanted])
  return files && files.id === id ? files : null
}

export function FixtureThumb({
  id,
  title,
  site,
  height = 'h-40',
  near = true
}: {
  id: string
  title: string
  site: SitePreview | null
  /** Tailwind height class of the window onto the 1280px page. */
  height?: string
  /** Mount the iframe only while the card is near the viewport (the grid caps live documents). */
  near?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useFitScale(ref, 1280)
  const files = useFixtureFiles(id, near)
  const home = site?.pages.find((p) => p.type === 'home') ?? null
  const doc = useMemo(
    () => (files ? (site ? fixtureDoc(files.html, files.slots, site, home) : files.html) : null),
    [files, site, home]
  )
  return (
    <div ref={ref} className={`relative ${height} overflow-hidden bg-muted`}>
      {doc !== null && near ? (
        <iframe
          title={title}
          srcDoc={doc}
          sandbox=""
          onLoad={(e) => nudgePaint(e.currentTarget)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-[900px] w-[1280px] origin-top-left border-0"
          style={{ transform: `scale(${scale})` }}
        />
      ) : null}
    </div>
  )
}
