/**
 * The composer's attachments as compact chips (Akemi, 01/10/2026), in place of dsh's default rail
 * of 64px thumbnails and file cards (ui-attachment `ComposerAttachments.tsx`).
 *
 * Fills the single slot `conversation.input.attachments`, which dsh's input bar renders inside its
 * card with the draft's attachments and the composer's own intake. Every source of a file (a pick,
 * a drop, a paste) goes through that intake into this one view. What dsh's view did and this one
 * keeps: the page-wide drop invitation with its limits line, upload progress and failure with
 * retry, remove, and the original image on click. Labels are dsh's own (`conversation` namespace,
 * passed as `t` because the slot is registered with that locale), so no string is new here.
 *
 * Structural types on purpose, as elsewhere in this package: importing dsh's types would bundle its
 * client into this one.
 */
import { X } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatSize } from './comment-attachments.mjs'
import { fileBadge, uploadState } from './composer-chips.mjs'
import { type AddFiles, installComposerDrop } from './composer-drop'
import { watchChipsLine, watchDraftLine } from './composer-line'

type Translate = (key: string, params?: Record<string, string | number>) => string

interface ImageAttachment {
  kind: 'image'
  id: string
  file: File
  previewUrl: string
}
interface FileAttachment {
  kind: 'file'
  id: string
  file: File
}
type Attachment = ImageAttachment | FileAttachment

export interface ComposerChipsProps {
  attachments: readonly Attachment[]
  canAcceptDrop: boolean
  onAddFiles: AddFiles
  onRemoveAttachment: (id: string) => void
  uploads: Record<string, { status?: string; loaded?: number; total?: number } | undefined>
  onRetryFile: (id: string) => void
  dropLimits?: { readonly count: number; readonly size: string }
  t: Translate
}

function Remove({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="tv-chip-x" aria-label={label} title={label} onClick={onClick}>
      <X aria-hidden="true" />
    </button>
  )
}

function ImageChip({
  item,
  t,
  onOpen,
  onRemove
}: {
  item: ImageAttachment
  t: Translate
  onOpen: () => void
  onRemove: () => void
}): JSX.Element {
  const name = item.file.name || t('image.original')
  return (
    <div className="tv-chip" title={name}>
      <button type="button" className="tv-chip-body" title={t('image.openOriginal')} onClick={onOpen}>
        <img className="tv-chip-thumb" src={item.previewUrl} alt="" />
        <span className="tv-chip-name">{name}</span>
      </button>
      <Remove label={t('image.remove', { name })} onClick={onRemove} />
    </div>
  )
}

function FileChip({
  item,
  upload,
  t,
  onRetry,
  onRemove
}: {
  item: FileAttachment
  upload: ComposerChipsProps['uploads'][string]
  t: Translate
  onRetry: () => void
  onRemove: () => void
}): JSX.Element {
  const name = item.file.name || t('file.label')
  const { state, progress } = uploadState(upload)
  const meta =
    state === 'uploading'
      ? t('file.uploading')
      : state === 'error'
        ? t('file.uploadFailed')
        : formatSize(item.file.size)
  const inner = (
    <>
      <span className="tv-chip-badge" aria-hidden="true">
        {state === 'uploading' ? <span className="tv-chip-spinner" /> : fileBadge(name)}
      </span>
      <span className="tv-chip-name">{name}</span>
      <span className="tv-chip-meta">{meta}</span>
    </>
  )
  return (
    <div className="tv-chip" data-state={state} title={name}>
      {state === 'error' ? (
        <button
          type="button"
          className="tv-chip-body"
          aria-label={t('file.retry', { name })}
          onClick={onRetry}
        >
          {inner}
        </button>
      ) : (
        <span className="tv-chip-body" aria-label={`${t('file.pending')}: ${name}`}>
          {inner}
        </span>
      )}
      <Remove label={t('file.remove', { name })} onClick={onRemove} />
      {state === 'uploading' && (
        <span className="tv-chip-progress" aria-hidden="true">
          <span style={progress === null ? undefined : { width: `${progress * 100}%` }} />
        </span>
      )}
    </div>
  )
}

/** The original image over the page; Escape, the backdrop or the close button put it away. */
function Lightbox({
  item,
  t,
  onClose
}: {
  item: ImageAttachment
  t: Translate
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on the window above.
    <div
      className="tv-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('image.preview')}
      onClick={onClose}
    >
      <img src={item.previewUrl} alt={item.file.name || t('image.original')} />
      <button
        type="button"
        className="tv-lightbox-close"
        aria-label={t('image.closePreview')}
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
    </div>,
    document.body
  )
}

export function ComposerChips(props: ComposerChipsProps): JSX.Element {
  const { attachments, canAcceptDrop, onAddFiles, onRemoveAttachment, uploads, onRetryFile, dropLimits, t } =
    props
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<ImageAttachment | null>(null)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const count = attachments.length

  useEffect(() => installComposerDrop(canAcceptDrop, onAddFiles, setDragging), [canAcceptDrop, onAddFiles])

  // The preview closes when its image leaves the draft (removed, or sent).
  useEffect(() => {
    if (preview !== null && !attachments.some((item) => item.id === preview.id)) setPreview(null)
  }, [attachments, preview])

  // Chips on the input line or in their own row: measured on dsh's card (composer-line.ts).
  useLayoutEffect(() => {
    const card = anchorRef.current?.closest<HTMLElement>('[data-composer-card]')
    const rail = railRef.current
    if (!card || !rail || count === 0) return
    return watchChipsLine(card, rail)
  }, [count])

  // The draft between the controls, or on its own row when the column is too narrow for both.
  useLayoutEffect(() => {
    const card = anchorRef.current?.closest<HTMLElement>('[data-composer-card]')
    if (!card) return
    return watchDraftLine(card)
  }, [])

  const dropTitle = canAcceptDrop ? t('attachment.dropTitle') : t('attachment.dropBlocked')
  const dropDesc = canAcceptDrop && dropLimits ? t('attachment.dropDesc', { ...dropLimits }) : null

  return (
    <>
      <span ref={anchorRef} hidden />
      {dragging &&
        createPortal(
          <div className="tv-drop" role="status" data-blocked={canAcceptDrop ? undefined : ''}>
            <div className="tv-drop-title">{dropTitle}</div>
            {dropDesc !== null && <div className="tv-drop-desc">{dropDesc}</div>}
          </div>,
          document.body
        )}
      {count > 0 && (
        <div ref={railRef} className="tv-att" role="group" aria-label={t('attachment.pending')}>
          {attachments.map((item) =>
            item.kind === 'image' ? (
              <ImageChip
                key={item.id}
                item={item}
                t={t}
                onOpen={() => setPreview(item)}
                onRemove={() => onRemoveAttachment(item.id)}
              />
            ) : (
              <FileChip
                key={item.id}
                item={item}
                upload={uploads[item.id]}
                t={t}
                onRetry={() => onRetryFile(item.id)}
                onRemove={() => onRemoveAttachment(item.id)}
              />
            )
          )}
        </div>
      )}
      {preview !== null && <Lightbox item={preview} t={t} onClose={() => setPreview(null)} />}
    </>
  )
}
