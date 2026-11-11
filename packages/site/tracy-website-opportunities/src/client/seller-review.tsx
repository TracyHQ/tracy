/**
 * The seller's own steps on Details (#537):
 *   - the approval action in the header of the Profile and Business brief sub-pages: Approve and continue,
 *     enabled as soon as the page can be approved;
 *   - Add more: one photo or video added to the Profile's Photos & video.
 * Each press goes through the door the caller passes and answers a refusal code (or null), shown in words here.
 */
import { type JSX, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

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

/** What the header of a Profile or Business brief sub-page offers: Approve while it is pending. */
export interface ApprovalView {
  kind: 'profile' | 'brief'
  /** Already approved: the line that says when (the button is gone). */
  approvedLine: string | null
  /** Approval is possible now (research done / brief current); false: no button. */
  pending: boolean
  /** Approves; answers the refusal code, or null when it went through. */
  onApprove: () => Promise<string | null>
}

/**
 * Approve and continue at the right end of the sub-page title row (`sub-page-header.tsx`), with its one note
 * before it: the refusal, or when it was approved.
 */
export function ApprovalActions({ t, view }: { t: Translate; view: ApprovalView }): JSX.Element {
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
  const approvable = view.pending && view.approvedLine === null
  return (
    <div className="tracy-wo-approve" data-kind={view.kind}>
      {refused !== null ? (
        <p className="tracy-wo-error tracy-wo-small" role="alert">
          {gateText(t, refused)}
        </p>
      ) : view.approvedLine !== null ? (
        <p className="tracy-wo-muted tracy-wo-small">{view.approvedLine}</p>
      ) : null}
      {approvable ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => void press()}>
          {busy ? <Spinner label={t('approve.saving')} /> : null}
          {t(busy ? 'approve.saving' : 'approve.continue')}
        </Button>
      ) : null}
    </div>
  )
}

/** Add more: one photo or video added to the Profile's Photos & video. */
export function AddMedia({
  t,
  onUpload,
  act = false
}: {
  t: Translate
  /** Uploads the file; answers the refusal code, or null when it was added. */
  onUpload: (file: File) => Promise<string | null>
  /** Drawn as a text action in the Photos & video header of Business facts (#537): the formats as its title. */
  act?: boolean
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
  if (act)
    return (
      <span className="tracy-wo-add-act" data-failed={error === null ? undefined : ''}>
        {field}
        <button
          type="button"
          className="tracy-wo-facts-act"
          disabled={busy}
          title={error === null ? t('media.addHint') : codeText(t, 'media.error', error)}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner label={t('media.adding')} /> : <Plus aria-hidden="true" />}
          {t(busy ? 'media.adding' : 'media.add')}
        </button>
        {error !== null ? (
          <span className="tracy-wo-facts-sw-failed" role="alert">
            {codeText(t, 'media.error', error)}
          </span>
        ) : null}
      </span>
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
