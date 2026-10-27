/**
 * The template's large picture in the Add site form, wearing the picked design system (#1311): once a
 * system is picked, the picture becomes the template's own home page wearing it (the preview door,
 * `GET /api/design-system/preview`, the same page the sheet's popup shows), laid out at desktop width
 * and scaled into the card, so the customer sees what they are about to get before Create site. No
 * pick, a preview still on its way, or one the door cannot give: the template's own picture.
 *
 * Loaded only once a system is picked; the page sits in `<iframe sandbox="" srcDoc>` as in the popup:
 * nothing in it can script or reach the form.
 */
import { cn } from '@tracy/ui'
import { type JSX, useEffect, useRef, useState } from 'react'

import type { DesignSystemPick } from './design-system-pick.mjs'
import { readPreview } from './design-system-pick.mjs'
import { PREVIEW_SANDBOX } from './design-system-stage'
import type { Translate } from './strings'

/** The width the worn page is laid out at before it is scaled into the card: a desktop. */
export const WORN_LAYOUT_WIDTH = 1280

type Preview = { at: 'loading' } | { at: 'ready'; html: string } | { at: 'unavailable' } | { at: 'failed' }

export interface WornPictureProps {
  t: Translate
  template: string
  /** The template's own picture (the card's `home` desktop shot), shown with no pick and while a preview comes. */
  image: string | null
  pick: DesignSystemPick | null
  quickstart: string | undefined
  platform: string | undefined
  className?: string
}

export function WornPicture({
  t,
  template,
  image,
  pick,
  quickstart,
  platform,
  className
}: WornPictureProps): JSX.Element | null {
  const [preview, setPreview] = useState<Preview>({ at: 'loading' })
  const [width, setWidth] = useState<number | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const id = pick?.id ?? null

  // the worn page, asked for only once a system is picked; a new pick asks again
  useEffect(() => {
    if (!id) return
    let live = true
    setPreview({ at: 'loading' })
    void readPreview({ quickstart, platform, id }).then((p) => {
      if (live) setPreview(p as Preview)
    })
    return () => {
      live = false
    }
  }, [quickstart, platform, id])

  // how far the desktop page shrinks to fit the card
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const worn = id !== null && preview.at === 'ready' ? preview.html : null
  const scale = width ? width / WORN_LAYOUT_WIDTH : null
  return (
    <div
      ref={box}
      className={cn('relative aspect-[16/9] w-full overflow-hidden bg-muted', className)}
      data-start-picture={worn ? 'worn' : 'template'}
      data-start-worn={worn ? id : undefined}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className={cn(
            'absolute inset-0 block h-full w-full object-cover object-top transition-opacity duration-150',
            worn ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : null}
      {worn && scale ? (
        <iframe
          key={`${id}-${worn.length}`}
          title={t('ds_preview_frame', { name: pick?.name ?? '', template })}
          srcDoc={worn}
          sandbox={PREVIEW_SANDBOX}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 block origin-top-left border-0 bg-background"
          style={{
            width: WORN_LAYOUT_WIDTH,
            height: WORN_LAYOUT_WIDTH * (9 / 16),
            transform: `scale(${scale})`
          }}
          data-start-worn-frame={id ?? undefined}
        />
      ) : null}
    </div>
  )
}
