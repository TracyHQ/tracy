/**
 * A template card's picture: the demo site itself, live, scaled into the card — the way a
 * design-system card shows its fixture — with the stored screenshot underneath as the poster.
 *
 * WHY LIVE (Lee, 20/09). The 152 fixture cards are crisp at any pixel density because they are
 * documents scaled by CSS; the template cards were 1440-px PNGs shot at 1× and shrunk 2.5× by the
 * browser, and they looked it. Every demo is Tracy's own (`<label>.tracy.site` / `.tracy.ai`), so
 * the card can frame it exactly as the preview dialog already does.
 *
 * 🔒 THE FRAME IS MOUNTED ONLY WHEN THE SERVER SAYS THE DEMO MAY BE FRAMED. A cross-origin iframe
 * that the demo refuses (`frame-ancestors`, `X-Frame-Options`) fires `load` and paints Chrome's
 * error page — indistinguishable, from here, from a demo. So the card first asks `probe`
 * (`GET …/demo-frame?origin=<this page>`, `apps/tracy-web/src/lib/frame-allowed.js`) and mounts
 * on `framable: true`; otherwise the poster is the picture, as before.
 *
 * 🔒 AND ONLY WHILE `active` — THE POINTER RESTS ON THE CARD, NOT WHILE IT IS MERELY ON SCREEN.
 * Measured 29/09 on cowork.tracy.site/design-inspiration (1200×631): with every visible card live,
 * the grid ran 12 demo sites at once, each a full Joomla/WordPress page with its own scripts —
 * 104 MB over the first 10 s, frame rate down to 42 fps, 206 console errors from the demos, and a
 * tab that stuttered on every scroll. At rest the card is its poster; `Gallery.tsx` sets `active`
 * after a short hover, so at most one demo runs, and unsets it on leave. The probe's answer stays
 * with the card, so a second hover mounts at once. The preview dialog still frames the demo in full.
 *
 * `sandbox="allow-scripts"` without `allow-same-origin`: the theme's JS runs, the frame is an
 * opaque origin with no cookie, no form, no popup, no navigation of the top page. 1440×900, the
 * size the posters are shot at, so poster and live line up and the fade-in does not jump.
 */
import { type JSX, useEffect, useRef, useState } from 'react'

import { Skeleton } from '@tracy/ui'

import { useFitScale } from './useFitScale'

/** The demo's width the card scales from — the desktop viewport the posters are shot at. */
export const DEMO_WIDTH = 1440
const DEMO_HEIGHT = 900

/** Ask the probe once per `src`, only while asked to. Null until answered; false on any refusal or error. */
function useFramable(probe: string | null, ask: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ probe: string; framable: boolean } | null>(null)
  useEffect(() => {
    if (!ask || probe === null || answer?.probe === probe) return
    const ac = new AbortController()
    fetch(`${probe}?origin=${encodeURIComponent(window.location.origin)}`, {
      signal: ac.signal,
      credentials: 'omit'
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { framable?: unknown } | null
        if (!ac.signal.aborted) setAnswer({ probe, framable: res.ok && body?.framable === true })
      })
      .catch(() => {
        if (!ac.signal.aborted) setAnswer({ probe, framable: false })
      })
    return () => ac.abort()
  }, [ask, probe, answer])
  return answer?.probe === probe ? answer.framable : null
}

export function DemoThumb({
  src,
  probe,
  poster,
  title,
  height = 'h-40',
  active = true
}: {
  /** The demo page to frame — `previewSrc()` of the card's demo; empty means no live demo. */
  src: string
  /** The `demo-frame` door for this template, absolute; null when the list named none. */
  probe: string | null
  /** The stored screenshot, or null when this surface has none to show. */
  poster: string | null
  title: string
  /** Tailwind height class of the window onto the 1440px page. */
  height?: string
  /** Ask the probe and mount the iframe only while true — the grid's hover, see the header. */
  active?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useFitScale(ref, DEMO_WIDTH)
  const framable = useFramable(src === '' ? null : probe, active)
  const [loaded, setLoaded] = useState(false)
  // The poster's own arrival: until then the card pulses instead of sitting as a flat grey box (the
  // shots door answers a cold `?w=` in 0.35-0.97 s, measured 30/09). Keyed by address so a new
  // poster pulses again; a cached one is `complete` before React attaches `onLoad`, hence the ref.
  const [posterShown, setPosterShown] = useState<string | null>(null)
  // A poster that failed to load (F-S5-014, #811): the picture is taken away and the skeleton
  // stops, which leaves the card's own ground — what a card with no poster shows. Keyed by address
  // like `posterShown`, so a new poster is asked for again.
  const [posterFailed, setPosterFailed] = useState<string | null>(null)
  const picture = poster !== null && posterFailed !== poster ? poster : null
  const live = active && src !== '' && framable === true
  // A remounted frame starts blank: fade it in again from the poster, not from white.
  useEffect(() => {
    if (!live) setLoaded(false)
  }, [live])
  return (
    <div ref={ref} className={`relative ${height} overflow-hidden bg-muted`}>
      {picture !== null && posterShown !== picture ? (
        <Skeleton data-poster-loading="" className="absolute inset-0 rounded-none" />
      ) : null}
      {picture !== null ? (
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setPosterShown(picture)
          }}
          src={picture}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setPosterShown(picture)}
          onError={() => setPosterFailed(picture)}
          className="absolute inset-0 block h-full w-full object-cover object-top"
        />
      ) : null}
      {live ? (
        <iframe
          title={title}
          src={src}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          tabIndex={-1}
          aria-hidden
          className={`pointer-events-none absolute top-0 left-0 border-0 bg-background transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={{
            width: DEMO_WIDTH,
            height: DEMO_HEIGHT,
            transformOrigin: 'top left',
            transform: `scale(${scale})`
          }}
        />
      ) : null}
    </div>
  )
}
