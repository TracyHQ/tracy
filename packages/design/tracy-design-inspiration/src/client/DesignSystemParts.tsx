/**
 * The font line of the Design system tab (Akemi, 12/10/2026, U10 A), said in the preview popup and the try-on popup,
 * and the system's picture the try-on popup falls back to (`SystemPicture`).
 * The cards and the head are `DesignSystemGrid.tsx`; the try-on popup is `TryOnDialog.tsx`. Kept apart from
 * `DesignSystemTab.tsx`, which holds the state and the door presses.
 */
import type { JSX } from 'react'

import { fontPartsOf, type LibrarySystem } from './design-system-library.mjs'
import type { Key, Translate } from './strings'

/** "Fonts: Inter stands in for Airbnb Cereal" — nothing when the system names no font. */
export function FontLine({
  fonts,
  t
}: {
  fonts: LibrarySystem['fonts'] | undefined
  t: Translate
}): JSX.Element | null {
  const parts = fontPartsOf(fonts)
  if (parts.length === 0) return null
  const list = parts.map((p) => t(p.key as Key, p.params)).join(', ')
  return (
    <p className="m-0 text-muted-foreground text-xs" data-font-line="">
      {t('ds.fonts', { list })}
    </p>
  )
}

/** A system's picture: its screenshot, else a plain block. */
export function SystemPicture({ image, height }: { image: string | null; height: string }): JSX.Element {
  if (image)
    return (
      <div className={`${height} overflow-hidden bg-muted`}>
        <img src={image} alt="" className="block h-full w-full object-cover object-top" />
      </div>
    )
  return <div className={`${height} bg-muted`} />
}
