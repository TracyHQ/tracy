/**
 * A comment's picture full screen (Comments list redesign A, Akemi 01/10/2026): a dark backdrop over
 * the whole page, the picture as large as fits, its caption under it, and ✕ at the top right. It closes
 * on ✕, on Esc and on a click on the backdrop (never on the picture), and gives the focus back to what
 * had it. Drawn into `document.body`, so no box of dsh's page clips or stacks over it.
 */
import { X } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { fallback, type Translate } from './strings'

export interface LightboxPicture {
  src: string
  alt: string
  caption: string
}

export function CommentLightbox({
  picture,
  t,
  onClose
}: {
  picture: LightboxPicture
  t?: Translate
  onClose: () => void
}): JSX.Element | null {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    close.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Esc is the picture's alone: the Browser tab's own Esc (leave Edit) must not hear it too.
      event.stopPropagation()
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus({ preventScroll: true })
    }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes it (a window listener above); the click is the backdrop's.
    <div
      className="tv-lb"
      role="dialog"
      aria-modal="true"
      aria-label={fallback(t, 'comments.viewImage')}
      data-tracy-lightbox=""
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        ref={close}
        type="button"
        className="tv-lb-close"
        aria-label={fallback(t, 'comments.closeImage')}
        data-tracy-lightbox-close=""
        onClick={onClose}
      >
        <X className="tv-lb-close-icon" aria-hidden="true" />
      </button>
      <figure className="tv-lb-figure">
        <img className="tv-lb-img" src={picture.src} alt={picture.alt} />
        {picture.caption !== '' && <figcaption className="tv-lb-caption">{picture.caption}</figcaption>}
      </figure>
    </div>,
    document.body
  )
}
