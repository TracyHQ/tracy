/**
 * The bar a Viewer sees right above the chat box on a site, on the start screen and through the
 * whole session (ADR 0028, Q13): what the seat may do, and one outline button that asks every Owner
 * of the site for edit access (`POST /api/sites/:key/edit-access-request`, `seat-role.mjs`). Once the
 * door accepted, the bar says so and the button goes, in both places (`asked`, one store per page);
 * a refusal is said under the sentence by its code, and the button stays so the person can try again.
 *
 * Narrow (a chat column under ~540px): the button goes on its own line under the sentence, lined up
 * with the text after the eye, so the sentence keeps the full width instead of wrapping into a
 * column of short lines beside the button.
 *
 * `place` says which of the two it is: `start` inside the start block, `session` its own occupant of
 * the dock, which styles.ts hides while the start block's own bar is on screen.
 */
import { Eye } from 'lucide-react'
import type { JSX } from 'react'
import { useRef, useState, useSyncExternalStore } from 'react'
import { askForEditAccess, askOutcomeLine, type createAskedSites } from './seat-role.mjs'
import { fallback, type Translate } from './strings'

export interface ViewerBarProps {
  siteKey: string
  t?: Translate
  /** The page's record of sites already asked for (`createAskedSites`). */
  asked: ReturnType<typeof createAskedSites>
  place: 'start' | 'session'
  /**
   * The door said the seat already edits (`ALREADY_EDITOR`): read the role again, so the page
   * switches to the editing screen without a reload (`createSeatRole().refresh`, #1036).
   */
  onAlreadyEditor?: () => unknown
}

export function ViewerBar({ siteKey, t, asked, place, onAlreadyEditor }: ViewerBarProps): JSX.Element {
  const [pressed, setState] = useState<'idle' | 'sending'>('idle')
  const askedHere = () => asked.has(siteKey)
  const sent = useSyncExternalStore(asked.subscribe, askedHere, askedHere)
  const state = sent ? 'sent' : pressed
  const [error, setError] = useState<string | null>(null)
  // Two presses inside one frame both read `idle`: the ref keeps the second from asking again.
  const busy = useRef(false)
  const ask = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setState('sending')
    setError(null)
    const outcome = await askForEditAccess({ siteKey, fetch: (input, init) => globalThis.fetch(input, init) })
    busy.current = false
    const line = askOutcomeLine(outcome)
    if (outcome.kind === 'sent') {
      setState('idle')
      asked.mark(siteKey)
      return
    }
    setState('idle')
    setError(fallback(t, line.key, line.params))
    if (line.key === 'viewer.ask.alreadyEditor') onAlreadyEditor?.()
  }
  return (
    <div className="tv-viewer-bar" data-viewer-bar={state} data-viewer-bar-place={place}>
      {/* The body is what lays out: the bar is the container its width is measured on (styles.ts). */}
      <div className="tv-viewer-bar-body">
        <Eye className="tv-viewer-bar-icon" aria-hidden="true" />
        <div className="tv-viewer-bar-text">
          {state === 'sent' ? (
            <p className="tv-viewer-bar-line" role="status">
              {fallback(t, 'viewer.ask.sent')}
            </p>
          ) : (
            <p className="tv-viewer-bar-line">{fallback(t, 'viewer.bar')}</p>
          )}
          {error !== null && (
            <p className="tv-viewer-bar-error" role="alert">
              {error}
            </p>
          )}
        </div>
        {state !== 'sent' && (
          <button
            type="button"
            className="tv-viewer-bar-button"
            disabled={state === 'sending'}
            onClick={() => void ask()}
          >
            {fallback(t, 'viewer.ask')}
          </button>
        )}
      </div>
    </div>
  )
}
