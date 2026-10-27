/**
 * The cover that holds the shell until it has something true to show.
 *
 * WHY IT EXISTS. dsh's own splash (HARNESS / "Loading plugins…") is dismissed the moment the
 * PLUGINS have loaded — vendor/.../client/web/src/boot.ts hands the mount to the UI renderer and
 * the boot page removes itself. The data has not arrived at that point, so the shell paints
 * empty: no tabs, no workspace, no chips. Seconds later the answers land and the real UI appears.
 * Measured by Akemi on a fresh account 05/09, and shorter but still visible on an account that
 * already holds sites.
 *
 * The splash answers "is the code here". A person is asking "can I use this yet". This cover
 * answers the second question, and changes nothing else.
 *
 * 🔒 WHY NOT EXTEND dsh's SPLASH. It lives in vendor/, where LAW #5 ships every change as a
 * -tracy.N release dragging the version train behind it — an expensive trade for a visual
 * problem, and one that reopens on each dsh bump. shell.overlay is a root-scope list slot dsh
 * documents for precisely this: "a surface of your own that floats over the whole app".
 */
import { useEffect } from 'react'
import { TRACY_MARK_COLOR, TRACY_MARK_PATH } from '@tracy/ui/brand'
import { networkSettles } from '../shared/network-settles.mjs'

/**
 * Ceiling. 🔒 A COVER WITHOUT A DEADLINE IS WORSE THAN THE FLASH IT HIDES — an unreachable seat
 * book or a page that never goes quiet would leave a person at a spinner forever, a stutter
 * traded for a hang. An empty shell they can click is the better failure.
 */
const DEADLINE_MS = 8000

/**
 * Floor. A cover that flashes past in 150ms is itself a stutter, so it stays for at least this
 * long even when everything resolves at once.
 */
const FLOOR_MS = 600

/** Hold for at least ms. @param ms - the floor. @returns a promise resolving after it. */
function atLeast(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The shell is worth showing once the asking has stopped, and never sooner than the floor.
 * @returns a promise that resolves when the cover may lift.
 */
async function shellIsReady(): Promise<void> {
  await Promise.all([networkSettles(window), atLeast(FLOOR_MS)])
}

/** SVG needs its own namespace; createElement would build an unknown HTML tag that never paints. */
const SVG_NS = 'http://www.w3.org/2000/svg'

const CSS = `
.tracy-boot-cover {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-base, #1b1b1c);
}
@keyframes tracy-boot-spin { to { transform: rotate(360deg) } }
.tracy-boot-cover > svg { width: 56px; height: 56px; transform-origin: 50% 50%; animation: tracy-boot-spin 9s linear infinite; }
/* Someone who asked their system to stop animations gets a still mark. The cover still covers;
   it simply does not turn. A media query rather than a JS check, so it cannot be forgotten. */
@media (prefers-reduced-motion: reduce) { .tracy-boot-cover > svg { animation: none } }
`

/**
 * Mount the cover on the document itself and take it down when the shell is ready.
 *
 * 🔒 IT IS NOT RENDERED THROUGH THIS COMPONENT'S TREE, AND THAT IS THE WHOLE POINT.
 * `shell.overlay` renders inside ui-layout's `.overlayLayer`, which carries `z-index: 20` and so
 * opens a stacking context: any z-index set within it is resolved INSIDE that context, and the
 * cover ends up competing at level 20 — where the details column wins. Measured 05/09: the cover
 * hid the sidebar and the conversation while the right-hand panel sat on top of it fully drawn,
 * which is worse than no cover at all. It hides the part that is ready and exposes the part still
 * building.
 *
 * Appending to `document.body` leaves that context entirely. React never owns these nodes, so no
 * react-dom portal — and therefore no new dependency on a package this plugin does not carry.
 *
 * The mark is built as raw SVG rather than <TracyMark>, for the same reason: no React inside a
 * node React does not manage. Its outline comes from TRACY_MARK_PATH, the one the component draws
 * too. 🔒 IT USED TO BE A HAND-WRITTEN EIGHT-SPOKE STAND-IN, and it shipped: Akemi saw it turning
 * on production 05/09 and knew at a glance it was not her logo. A shape drawn twice is a shape
 * that will differ, so this one is imported, never redrawn.
 * @returns nothing; this component renders no elements of its own.
 */
export function BootCover(): null {
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = CSS
    const cover = document.createElement('div')
    cover.className = 'tracy-boot-cover'
    cover.setAttribute('role', 'status')
    cover.setAttribute('aria-busy', 'true')
    const spinner = document.createElementNS(SVG_NS, 'svg')
    spinner.setAttribute('viewBox', '0 0 800 800')
    spinner.setAttribute('aria-hidden', 'true')
    const outline = document.createElementNS(SVG_NS, 'path')
    outline.setAttribute('d', TRACY_MARK_PATH)
    outline.setAttribute('fill', TRACY_MARK_COLOR)
    spinner.append(outline)
    cover.append(spinner)
    document.head.append(style)
    document.body.append(cover)

    let alive = true
    const done = (): void => {
      if (!alive) return
      alive = false
      cover.remove()
      style.remove()
    }
    const timer = setTimeout(done, DEADLINE_MS)
    void shellIsReady().then(done)
    return () => {
      clearTimeout(timer)
      done()
    }
  }, [])

  return null
}
