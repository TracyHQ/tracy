/**
 * What is on screen, kept in the address — one behaviour for both surfaces, because it is one piece
 * of code: the public page at `cowork.tracy.ai/design-inspiration`, and this tab inside a lane.
 *
 * 🔒 IT READS ON MOUNT AND WRITES ONLY ON A PRESS. That asymmetry is what makes it safe on a lane,
 * where the address belongs to dsh and several tabs may be mounted at once: a tab nobody is looking
 * at receives no press, so it can never overwrite the address of the tab in sight.
 *
 * `replaceState`, never a navigation: on the page a reload would throw away the domain the visitor
 * typed, and on a lane it would throw away the session. Every other parameter — dsh's own,
 * `?tab=`/`?site=` from `tracy-tab-link`, `?domain=` on the page — is carried through untouched by
 * `searchWithView`.
 */
import { useState } from 'react'

import type { Selection } from './Filter'
import { searchWithView, viewFromSearch } from './view-url.mjs'

export interface ViewAddress {
  /** The picker's choice, as the address gave it. */
  selection: Selection
  /** The inspiration whose preview is open, as the address gave it. */
  openId: string | null
  chooseFilter: (next: Selection, preview?: string | null) => void
  choosePreview: (id: string | null) => void
}

export function useViewAddress(): ViewAddress {
  const [selection, setSelection] = useState<Selection>(() => {
    const view = viewFromSearch(location.search)
    return { ticked: new Set(view.cat), picked: new Set(view.brand), platforms: new Set(view.platform ?? []) }
  })
  const [openId, setOpenId] = useState<string | null>(() => viewFromSearch(location.search).open)

  const write = (next: Selection, nextOpen: string | null): void => {
    const search = searchWithView(location.search, {
      cat: [...next.ticked],
      brand: [...next.picked],
      platform: [...next.platforms],
      open: nextOpen
    })
    history.replaceState(null, '', `${location.pathname}${search}${location.hash}`)
  }

  return {
    selection,
    openId,
    chooseFilter: (next, preview = openId) => {
      setSelection(next)
      setOpenId(preview)
      write(next, preview)
    },
    choosePreview: (id) => {
      setOpenId(id)
      write(selection, id)
    }
  }
}
