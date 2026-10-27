/**
 * A demo picture shown large, for the Templates page's Demo Card: its desktop shot and, when the
 * page has one, its mobile shot beside it, with the page's label and path as the caption.
 *
 * Built on the shared `Dialog` of `@tracy/ui`, so Esc, a click outside, the close button and focus
 * return to the opener all come from there rather than from a modal written by hand.
 */
import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from '@tracy/ui'
import { useRef } from 'react'

import { useT } from '../i18n'
import type { Card, Layout } from './DesignInspiration'

/** What the lightbox shows; `null` keeps it closed. */
export interface LightboxShot {
  /** The desktop picture's stored file name, if any. */
  desktop?: string
  /** The mobile picture's stored file name, if any. */
  mobile?: string
  /** The page's label (or the file name when the picture belongs to no page). */
  label: string
  /** The page's path on the demo, when the picture belongs to a page. */
  path?: string
}

/** What a page's lightbox shows: both its shots, its label and path. */
export const pageShot = (l: Layout): LightboxShot => ({
  desktop: l.shots?.desktop,
  mobile: l.shots?.mobile,
  label: l.label || l.key,
  path: l.path
})

/** A picture that is not a page's: shown with the page that wears it, if one does. */
export const fileShot = (card: Card, file: string): LightboxShot => {
  const owner = card.layouts.find((l) => l.shots?.desktop === file)
  return owner ? pageShot(owner) : { desktop: file, label: file }
}

/**
 * A stored picture's address. `w` asks the door for a 16:10 WebP thumbnail of that width (only the
 * `THUMB_WIDTHS` of `apps/tracy-web/src/lib/shot-thumb.js`); without it the door sends the original,
 * which is what a large view needs, since the thumbnail crops a mobile shot to 16:10.
 */
export const shotSrc = (template: string | null, file: string, w?: 360 | 720 | 960) =>
  template && file
    ? `/api/templates/${template}/shots/${encodeURIComponent(file)}${w ? `?w=${String(w)}` : ''}`
    : null

export function ShotLightbox({
  shot,
  template,
  onClose
}: {
  shot: LightboxShot | null
  template: string | null
  onClose: () => void
}) {
  const t = useT()
  // The dialog is opened from code, not from a DialogTrigger, so it does not know its opener: keep
  // the element that had focus when it opened and hand focus back to it on close.
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (shot !== null && !wasOpen.current)
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  wasOpen.current = shot !== null
  const desktop = shot?.desktop ? shotSrc(template, shot.desktop) : null
  const mobile = shot?.mobile ? shotSrc(template, shot.mobile) : null
  return (
    <Dialog open={shot !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        closeLabel={t('cms-demos.lightbox.close')}
        finalFocus={() => opener.current ?? true}
        className="gap-3 sm:max-w-[min(72rem,calc(100%-2rem))]"
      >
        <div className="flex flex-col gap-0.5 pr-8">
          <DialogTitle>{shot?.label ?? ''}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {shot?.path || shot?.desktop || shot?.mobile || ''}
          </DialogDescription>
        </div>
        {/* Shots are full pages, often many screens tall: shown at full width and scrolled together. */}
        <div className="flex max-h-[78vh] min-h-0 items-start gap-4 overflow-y-auto" data-lightbox-body="">
          {desktop ? (
            <img
              src={desktop}
              alt={t('cms-demos.lightbox.desktopAlt', { label: shot?.label ?? '' })}
              className="h-auto min-w-0 flex-[3] rounded-lg border border-border"
            />
          ) : null}
          {mobile ? (
            <img
              src={mobile}
              alt={t('cms-demos.lightbox.mobileAlt', { label: shot?.label ?? '' })}
              className={cn(
                'h-auto min-w-0 rounded-lg border border-border',
                desktop ? 'flex-1' : 'mx-auto w-80'
              )}
            />
          ) : null}
          {!desktop && !mobile ? (
            <p className="text-muted-foreground text-sm">{t('cms-demos.lightbox.empty')}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
