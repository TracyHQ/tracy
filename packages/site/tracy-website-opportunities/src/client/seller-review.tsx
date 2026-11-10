/**
 * The seller's own steps on Details (#537):
 *   - the approval actions in the header of the Profile and Business brief sub-pages: Back, and Approve ... and
 *     continue, enabled once the page has been scrolled to its end (at once when it fits without scrolling);
 *   - Add source: an inline form for one more link of the business, with its errors in place;
 *   - Add more: one photo or video added to the Profile's Photos & video.
 * Each press goes through the door the caller passes and answers a refusal code (or null), shown in words here.
 */
import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input, Spinner } from '@tracy/ui'

import { en, type Translate } from './strings.ts'

const known = (key: string): boolean => Object.prototype.hasOwnProperty.call(en, key)

/** The words of a refusal of a gate (`gate.<code>`), or the plain fallback. */
export function gateText(t: Translate, code: string | null): string | null {
  if (code === null) return null
  const key = `gate.${code}`
  return t(known(key) ? key : 'gate.other')
}

/** The words of a refusal under a prefix (`source.add.error.<code>`), or that prefix's fallback. */
const codeText = (t: Translate, prefix: string, code: string): string =>
  t(known(`${prefix}.${code}`) ? `${prefix}.${code}` : `${prefix}.other`)

/**
 * True once the end marker has been seen inside the page's scroll box: scrolled to the end, or the content fits
 * without scrolling. Without IntersectionObserver (an old browser) it is true at once, never a dead button.
 */
export function useReachedEnd(): [(el: HTMLDivElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [reached, setReached] = useState(false)
  useEffect(() => {
    if (el === null || reached) return
    if (typeof IntersectionObserver === 'undefined') return setReached(true)
    const root = el.closest<HTMLElement>('.tracy-wo-tab')
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setReached(true)
      },
      { root, threshold: 0 }
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [el, reached])
  return [setEl, reached]
}

/** What the header of a Profile or Business brief sub-page offers: Back, and Approve while it is pending. */
export interface ApprovalView {
  kind: 'profile' | 'brief'
  /** Already approved: the line that says when (the button is gone). */
  approvedLine: string | null
  /** Approval is possible now (research done / brief current); false: only Back shows. */
  pending: boolean
  onBack: () => void
  /** Approves; answers the refusal code, or null when it went through. */
  onApprove: () => Promise<string | null>
}

/** Back and Approve ... and continue in the sub-page header, with the scroll hint under them while it is off. */
export function ApprovalActions({
  t,
  view,
  reached
}: {
  t: Translate
  view: ApprovalView
  /** The content has been scrolled to its end (or fits). */
  reached: boolean
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const press = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setRefused(null)
    const code = await view.onApprove()
    setBusy(false)
    if (code !== null) setRefused(code)
  }
  const label = t(view.kind === 'profile' ? 'approve.profile' : 'approve.brief')
  const approvable = view.pending && view.approvedLine === null
  return (
    <div className="tracy-wo-approve" data-kind={view.kind}>
      <div className="tracy-wo-approve-acts">
        <Button type="button" size="sm" variant="outline" onClick={view.onBack}>
          {t('approve.back')}
        </Button>
        {approvable ? (
          <Button type="button" size="sm" disabled={!reached || busy} onClick={() => void press()}>
            {busy ? <Spinner label={t('approve.saving')} /> : null}
            {busy ? t('approve.saving') : label}
          </Button>
        ) : null}
      </div>
      {refused !== null ? (
        <p className="tracy-wo-error tracy-wo-small" role="alert">
          {gateText(t, refused)}
        </p>
      ) : view.approvedLine !== null ? (
        <p className="tracy-wo-muted tracy-wo-small">{view.approvedLine}</p>
      ) : approvable && !reached ? (
        <p className="tracy-wo-muted tracy-wo-small">{t('approve.scrollHint')}</p>
      ) : null}
    </div>
  )
}

/** Add source: a button that opens an inline form for one more link of the business. */
export function AddSource({
  t,
  researched,
  onAdd
}: {
  t: Translate
  /** Research has run: adding a source asks for it again (said under the field). */
  researched: boolean
  /** Adds the link; answers the refusal code, or null when it was added. */
  onAdd: (url: string) => Promise<string | null>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useId()
  const close = (): void => {
    setOpen(false)
    setUrl('')
    setError(null)
  }
  const submit = async (): Promise<void> => {
    if (busy) return
    const typed = url.trim()
    if (typed === '') return setError('INVALID_URL')
    setBusy(true)
    setError(null)
    const code = await onAdd(typed)
    setBusy(false)
    if (code === null) close()
    else setError(code)
  }
  if (!open)
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="tracy-wo-add-source"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        {t('source.add')}
      </Button>
    )
  return (
    <form
      className="tracy-wo-add-source-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="tracy-wo-label" htmlFor={field}>
        {t('source.add.label')}
      </label>
      <div className="tracy-wo-add-source-row">
        <Input
          id={field}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={t('source.add.placeholder')}
          value={url}
          aria-invalid={error !== null ? true : undefined}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error !== null) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Spinner label={t('source.add.saving')} /> : null}
          {t(busy ? 'source.add.saving' : 'source.add.submit')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          {t('source.add.cancel')}
        </Button>
      </div>
      {error !== null ? (
        <p className="tracy-wo-error tracy-wo-small" role="alert">
          {codeText(t, 'source.add.error', error)}
        </p>
      ) : researched ? (
        <p className="tracy-wo-muted tracy-wo-small">{t('source.add.afterResearch')}</p>
      ) : null}
    </form>
  )
}

/** Add more: one photo or video added to the Profile's Photos & video. */
export function AddMedia({
  t,
  onUpload,
  tile = false
}: {
  t: Translate
  /** Uploads the file; answers the refusal code, or null when it was added. */
  onUpload: (file: File) => Promise<string | null>
  /** Drawn as the first tile of the Business facts grid (#537): a large press, no hint line. */
  tile?: boolean
}): JSX.Element {
  const input = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picked = async (file: File | undefined): Promise<void> => {
    if (file === undefined || busy) return
    setBusy(true)
    setError(null)
    const code = await onUpload(file)
    setBusy(false)
    if (code !== null) setError(code)
    if (input.current) input.current.value = ''
  }
  const field = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm"
      hidden
      onChange={(e) => void picked(e.target.files?.[0])}
    />
  )
  if (tile)
    return (
      <div className="tracy-wo-add-tile">
        {field}
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Spinner label={t('media.adding')} /> : <Plus aria-hidden="true" />}
          <span>{t(busy ? 'media.adding' : 'media.add')}</span>
        </button>
        {error !== null ? (
          <span className="tracy-wo-error tracy-wo-small" role="alert">
            {codeText(t, 'media.error', error)}
          </span>
        ) : null}
      </div>
    )
  return (
    <div className="tracy-wo-add-media">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm"
        hidden
        onChange={(e) => void picked(e.target.files?.[0])}
      />
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Spinner label={t('media.adding')} /> : <Plus aria-hidden="true" />}
        {t(busy ? 'media.adding' : 'media.add')}
      </Button>
      {error !== null ? (
        <span className="tracy-wo-error tracy-wo-small" role="alert">
          {codeText(t, 'media.error', error)}
        </span>
      ) : (
        <span className="tracy-wo-muted tracy-wo-small">{t('media.addHint')}</span>
      )}
    </div>
  )
}
