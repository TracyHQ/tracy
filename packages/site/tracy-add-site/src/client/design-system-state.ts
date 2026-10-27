/**
 * The Design system pick's state in the Add site form: the library (read once per page), whether the template build in
 * sight can wear a system (asked again whenever the template or the platform changes), and the pick itself.
 *
 * A "no" from the support door clears the pick: the form never carries a system to a site that cannot wear it. The
 * doors and the rules behind them are `design-system-pick.mjs`.
 */
import { type RefObject, useEffect, useRef, useState } from 'react'

import {
  type DesignSystemPick,
  type LibraryRow,
  quickstartTagOf,
  readLibrary,
  readSupport
} from './design-system-pick.mjs'

export type DesignSystemSupport = 'loading' | 'yes' | 'no'

export interface DesignSystemState {
  /** `loading`, the `ok` rows, or null when the library door did not answer. */
  library: LibraryRow[] | null | 'loading'
  support: DesignSystemSupport
  pick: DesignSystemPick | null
  setPick: (pick: DesignSystemPick | null) => void
  retryLibrary: () => void
  /** The pick Create site may send: only one the template in sight is known to wear. */
  sendable: DesignSystemPick | null
}

export function useDesignSystem({
  enabled,
  card,
  platform,
  kept
}: {
  /** The card is on screen (the create branch, with a template that builds on the platform in sight). */
  enabled: boolean
  card: unknown
  platform: string | undefined
  kept: DesignSystemPick | null | undefined
}): DesignSystemState {
  const [library, setLibrary] = useState<DesignSystemState['library']>('loading')
  const [libraryTry, setLibraryTry] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let live = true
    setLibrary('loading')
    void readLibrary().then((rows) => {
      if (live) setLibrary(rows)
    })
    return () => {
      live = false
    }
  }, [enabled, libraryTry])

  const [pick, setPick] = useState<DesignSystemPick | null>(kept ?? null)
  const [supportAnswer, setSupportAnswer] = useState<{
    tag: string | undefined
    platform: string | undefined
    value: DesignSystemSupport
  } | null>(null)
  const tag = quickstartTagOf(card, platform)
  // A previous template's answer cannot decide the next template's wizard page.
  const support: DesignSystemSupport =
    enabled && supportAnswer !== null && supportAnswer.tag === tag && supportAnswer.platform === platform
      ? supportAnswer.value
      : 'loading'
  useEffect(() => {
    if (!enabled) return
    let live = true
    setSupportAnswer(null)
    void readSupport({ quickstart: tag, platform }).then((ok) => {
      if (!live) return
      setSupportAnswer({ tag, platform, value: ok ? 'yes' : 'no' })
      if (!ok) setPick(null)
    })
    return () => {
      live = false
    }
  }, [enabled, tag, platform])

  return {
    library,
    support,
    pick,
    setPick,
    retryLibrary: () => setLibraryTry((n) => n + 1),
    sendable: enabled && support === 'yes' ? pick : null
  }
}

/**
 * The Design system card's field in the form: its state (`useDesignSystem`), and the page it opens (`sheetUp`, named
 * from when it was a sheet). The page is up only while the card offers a library to pick from; closed, the wizard puts
 * the form's scroll back and gives focus to the card (`backToForm` in `wizard.tsx`).
 */
export function useDesignSystemField({
  shown,
  card,
  platform,
  kept
}: {
  /** The card is on screen (`useDesignSystem`'s `enabled`). */
  shown: boolean
  card: unknown
  platform: string | undefined
  kept: DesignSystemPick | null | undefined
}): {
  ds: DesignSystemState
  sheetUp: boolean
  openSheet: () => void
  closeSheet: () => void
  cardRef: RefObject<HTMLButtonElement | null>
} {
  const ds = useDesignSystem({ enabled: shown, card, platform, kept })
  const [open, setOpen] = useState(false)
  const cardRef = useRef<HTMLButtonElement>(null)
  return {
    ds,
    sheetUp: open && shown && ds.support === 'yes' && Array.isArray(ds.library),
    openSheet: () => setOpen(true),
    closeSheet: () => setOpen(false),
    cardRef
  }
}
