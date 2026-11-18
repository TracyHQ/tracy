/**
 * Approved is final (#537 R23): once the owner approved the Business facts, the page only reads them. Every band
 * reads `FactsLocked`; while it is true no Edit, no On the site switch, no Add more, no Add, no Remove and no upload
 * is drawn (items kept off the site still read dimmed). The page shows one notice instead: when the facts were
 * approved, and Add this business again, which makes a new card of the same place (`api.ts addAgain`).
 */
import { createContext, type JSX, useContext, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import { gateText } from './seller-review.tsx'
import type { Translate } from './strings.ts'

/** True on a Business facts page whose facts are approved: the bands draw no control that writes. */
export const FactsLocked = createContext(false)

export const useFactsLocked = (): boolean => useContext(FactsLocked)

/** The locked notice's input: the approved line, and Add this business again (a refusal code, or null once done). */
export interface FactsLockView {
  line: string
  addAgain: () => Promise<string | null>
}

/** "Business facts approved 9 Nov. To change them, add this business again as a new card." with its one button. */
export function FactsLockedNotice({ t, view }: { t: Translate; view: FactsLockView }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  // A second press before the first answer is dropped: a double click must never make two cards.
  const flight = useRef(false)
  const press = async (): Promise<void> => {
    if (flight.current) return
    flight.current = true
    setBusy(true)
    setRefused(null)
    const code = await view.addAgain()
    flight.current = false
    setBusy(false)
    if (code !== null) setRefused(code)
  }
  return (
    <div className="tracy-wo-facts-locked" role="note">
      <Lock aria-hidden="true" className="tracy-wo-icon" />
      <p>{view.line}</p>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void press()}>
        {busy ? <Spinner label={t('facts.addAgain')} /> : null}
        {t('facts.addAgain')}
      </Button>
      {refused === null ? null : (
        <p className="tracy-wo-error tracy-wo-small" role="alert">
          {gateText(t, refused)}
        </p>
      )}
    </div>
  )
}
