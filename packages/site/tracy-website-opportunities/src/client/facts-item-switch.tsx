/**
 * The small switch of one item of a Business facts band (#537 R16): a review card, a photo or video tile. It is the
 * Team member's switch (`BandSwitch`, small) made optimistic: it flips at once, and flips back when the door refuses,
 * the word turning red with the reason read out. Once the page reads the answer again, the item's own state wins.
 */
import { type JSX, useEffect, useState } from 'react'

import { BandSwitch } from './facts-band-actions.tsx'
import type { Translate } from './strings.ts'

export function ItemSwitch({
  t,
  label,
  on,
  set,
  why,
  bare = false
}: {
  t: Translate
  /** What the switch puts on the site, for its accessible name. */
  label: string
  on: boolean
  /** Saves the choice; answers whether it went through. Null: the switch cannot be pressed. */
  set: ((on: boolean) => Promise<boolean>) | null
  why?: string | null
  bare?: boolean
}): JSX.Element {
  const [shown, setShown] = useState<boolean | null>(null)
  // The saved state came back (or changed elsewhere): it replaces the optimistic one.
  useEffect(() => setShown(null), [on])
  const flip =
    set === null
      ? null
      : async (next: boolean): Promise<boolean> => {
          setShown(next)
          const ok = await set(next)
          if (!ok) setShown(null)
          return ok
        }
  return <BandSwitch t={t} small bare={bare} label={label} view={{ on: shown ?? on, set: flip, why }} />
}
