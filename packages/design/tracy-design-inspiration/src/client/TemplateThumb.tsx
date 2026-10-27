/**
 * A template card's picture on the grid: the home page of its live demo, over a poster of that same
 * page at that same width.
 *
 * 🔒 ONE RULE FOR WHAT A CARD SHOWS BEFORE THE DEMO LOADS (#523). The frame is the demo at 1440×900
 * (`DemoThumb`); the poster under it is `cardPoster` — the home layout's desktop shot when the card
 * has a demo, else `card.image` — so the fade-in does not swap a phone layout for a desktop one.
 * Kept apart from `Gallery.tsx` so the test can render exactly what the grid renders
 * (`test/card-thumbnail.test.mjs`).
 */
import type { JSX } from 'react'

import type { TemplateCard } from './api'
import { DemoThumb } from './DemoThumb'
import { cardPoster, cardThumb, homeLayout, previewSrc } from './templates.mjs'

export function TemplateThumb({
  template,
  title,
  active
}: {
  template: TemplateCard
  title: string
  /** Mount the live demo — true only while the pointer rests on the card (`DemoThumb`). */
  active: boolean
}): JSX.Element {
  return (
    <DemoThumb
      src={previewSrc(template.demo.url, homeLayout(template.layouts), template.defaultTheme)}
      probe={template.demo.probe ?? null}
      poster={cardThumb(cardPoster(template))}
      title={title}
      active={active}
    />
  )
}
