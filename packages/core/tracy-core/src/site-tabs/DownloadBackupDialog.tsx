/**
 * Download… on a backup (plan todo-backup-export, S4; Owner only): say what the package holds, then
 * follow the server's real states — Preparing (the host packs it under the site's locks), Uploading,
 * Ready with the zip's size and how long it stays — and hand the browser a link fresh from the server
 * on each press (a link lives five minutes; the package a day).
 *
 * 🔒 THE CONFIRM SAYS WHAT LEAVES. The zip is the whole site: its database with the personal data of
 * its users, and possibly its own secrets (salts, `secret`). Said before anything is packed, never
 * after.
 *
 * Closing the dialog does not stop the package: the host goes on. The export id is remembered per
 * site and backup for this page, so opening Download… again follows the same one instead of asking
 * for a second (which the door would refuse while the first is in flight).
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import { Check, Download, TriangleAlert } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Button,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'

import { interfaceLocale } from '../interface-languages/index.mjs'
import type { Translate } from '../team/translate'
import {
  type BackupExport,
  type BackupExportState,
  readBackupExport,
  requestBackupExport,
  requestBackupDownloadCode,
  downloadBackupWithCode,
  SiteApiError
} from './api'
import { downloadRefusalKey, megabytes, settled } from './backup-download'
import type { BackupPoint } from './backup-list'
import { backupName } from './BackupRow'

const DIGITS_ONLY = '^\\d+$'

/** How often the dialog asks how the package is going. */
const POLL_MS = 3000

/** Export ids of this page, per `<siteKey>#<version>`: a reopened dialog follows the same package. */
const following = new Map<string, string>()

type Phase =
  | { kind: 'confirm' }
  | { kind: 'asking' }
  | { kind: 'following'; exportId: string; state: BackupExportState; last: BackupExport | null }
  | { kind: 'refused'; words: string }
  | {
      kind: 'downloadFailed'
      exportId: string
      last: BackupExport | null
      words: string
      retryCode: boolean
      retryDownload: boolean
    }

/** Hand the browser a link: the store answers with `Content-Disposition: attachment`, so the page stays. */
function startDownload(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Counts dialogs opened, to mark each instance on the page. Not `useId()`: React promises it unique
 * only within one root (its docs ask for `identifierPrefix` when a page has several), and each of
 * these dialogs may sit in a root of its own.
 */
let opened = 0

export function DownloadBackupDialog({
  siteKey,
  backup: b,
  time,
  onClose,
  t
}: {
  siteKey: string
  backup: BackupPoint
  time: { absolute: (iso: string) => string }
  onClose: () => void
  t: Translate
}): JSX.Element {
  const slot = `${siteKey}#${b.version}`
  const [instance] = useState(() => String(++opened))
  const [phase, setPhase] = useState<Phase>(() => {
    const known = following.get(slot)
    return known ? { kind: 'following', exportId: known, state: 'queued', last: null } : { kind: 'confirm' }
  })
  const [fetching, setFetching] = useState(false)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [codeInvalid, setCodeInvalid] = useState(false)
  const [codeError, setCodeError] = useState('')
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    []
  )

  const exportId = phase.kind === 'following' || phase.kind === 'downloadFailed' ? phase.exportId : null
  const state = phase.kind === 'following' ? phase.state : null
  // Follow the package until it settles; a read that fails is asked again on the next tick.
  useEffect(() => {
    if (phase.kind !== 'following' || exportId === null || (state !== null && settled(state))) return
    let stop = false
    const tick = async (): Promise<void> => {
      try {
        const now = await readBackupExport(siteKey, b.version, exportId)
        if (stop) return
        if (settled(now.state)) following.delete(slot)
        setPhase({ kind: 'following', exportId, state: now.state, last: now })
      } catch (e) {
        if (stop) return
        // The id is not this site's any more (a deleted row): start over from the confirm.
        if (e instanceof SiteApiError && e.status === 404) {
          following.delete(slot)
          setPhase({ kind: 'confirm' })
        }
      }
    }
    const timer = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [exportId, phase.kind, state, siteKey, b.version, slot])

  const prepare = async (): Promise<void> => {
    setChallengeId(null)
    setCode('')
    setDownloaded(false)
    setCodeInvalid(false)
    setCodeError('')
    setPhase({ kind: 'asking' })
    try {
      const asked = await requestBackupExport(siteKey, b.version)
      following.set(slot, asked.exportId)
      if (alive.current)
        setPhase({ kind: 'following', exportId: asked.exportId, state: asked.state, last: null })
    } catch (e) {
      const words =
        e instanceof SiteApiError ? t(downloadRefusalKey(e.status, e.code)) : t('backup.download.err.failed')
      if (alive.current) setPhase({ kind: 'refused', words })
    }
  }

  const requestCode = async (): Promise<void> => {
    if (exportId === null) return
    const last = phase.kind === 'following' || phase.kind === 'downloadFailed' ? phase.last : null
    setFetching(true)
    setCodeInvalid(false)
    setCodeError('')
    try {
      const challenge = await requestBackupDownloadCode(siteKey, b.version, exportId)
      setChallengeId(challenge.challengeId)
      setCode('')
      setPhase({ kind: 'following', exportId, state: 'ready', last })
    } catch {
      if (alive.current)
        setPhase({
          kind: 'downloadFailed',
          exportId,
          last,
          words: t('backup.download.err.failed'),
          retryCode: true,
          retryDownload: false
        })
    } finally {
      if (alive.current) setFetching(false)
    }
  }

  const download = async (): Promise<void> => {
    if (exportId === null || challengeId === null || !/^\d{6}$/.test(code)) return
    setFetching(true)
    setCodeInvalid(false)
    setCodeError('')
    try {
      const issued = await downloadBackupWithCode(siteKey, b.version, exportId, challengeId, code.trim())
      startDownload(issued.url)
      setDownloaded(true)
    } catch (e) {
      if (
        e instanceof SiteApiError &&
        ['DOWNLOAD_CODE_INVALID', 'DOWNLOAD_CODE_EXPIRED', 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS'].includes(e.code)
      ) {
        setCodeInvalid(true)
        setCodeError(e.code)
      } else {
        setPhase({
          kind: 'downloadFailed',
          exportId,
          last: phase.kind === 'following' ? phase.last : null,
          words: t('backup.download.err.failed'),
          retryCode: false,
          retryDownload: true
        })
      }
    } finally {
      if (alive.current) setFetching(false)
    }
  }

  const retryDownload = async (): Promise<void> => {
    if (exportId === null) return prepare()
    const last = phase.kind === 'downloadFailed' ? phase.last : null
    setFetching(true)
    try {
      const current = await readBackupExport(siteKey, b.version, exportId)
      if (current.state === 'ready') {
        setChallengeId(null)
        setCode('')
        setCodeInvalid(false)
        setCodeError('')
        setPhase({ kind: 'following', exportId, state: 'ready', last: current })
        return
      }
      await prepare()
    } catch (e) {
      if (
        e instanceof SiteApiError &&
        (e.status === 404 || ['EXPORT_NOT_READY', 'EXPORT_EXPIRED'].includes(e.code))
      ) {
        await prepare()
      } else if (alive.current) {
        setPhase({
          kind: 'downloadFailed',
          exportId,
          last,
          words: t('backup.download.err.failed'),
          retryCode: false,
          retryDownload: true
        })
      }
    } finally {
      if (alive.current) setFetching(false)
    }
  }

  const last = phase.kind === 'following' ? phase.last : null
  const size = last?.bytes ? new Intl.NumberFormat(interfaceLocale()).format(megabytes(last.bytes)) : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={t('action.close')}
        className="tracy-site-tabs sm:max-w-md"
        // Opening focuses the dialog itself, not its first button, so nothing opens already marked
        // as focused; Tab still reaches every control (same as Export site as ZIP). Found, not a
        // `ref`: dsh runs React 18, which drops a `ref` given to tracy-ui's DialogContent (a function
        // component that does not forward it), so Base UI fell back to the first button. Keyed by
        // this instance's own mark, so a dialog still closing elsewhere on the page is never the one found.
        initialFocus={() => document.querySelector<HTMLElement>(`[data-download-backup="${instance}"]`)}
        data-download-backup={instance}
      >
        <DialogHeader>
          <DialogTitle>{t('backup.download.title', { name: backupName(b, t) })}</DialogTitle>
          <DialogDescription>{t('backup.download.body')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm">
          {phase.kind === 'downloadFailed' ? (
            <Alert variant="destructive" data-download-failed>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{phase.words}</AlertDescription>
            </Alert>
          ) : (
            <p className="m-0 flex items-start gap-1.5" data-download-privacy>
              <TriangleAlert className="mt-0.5 size-3.5 flex-none text-amber-600" aria-hidden="true" />
              <span>{t('backup.download.privacy')}</span>
            </p>
          )}
          <p className="m-0 text-muted-foreground text-xs">{t('backup.download.scope')}</p>
          <p className="m-0 text-muted-foreground text-xs">{t('backup.download.keep')}</p>
          {phase.kind === 'following' && (
            <p className="m-0 font-medium" role="status" data-download-state={phase.state}>
              {phase.state === 'ready'
                ? t('backup.download.ready', { size: t('backup.download.size', { n: size ?? '?' }) })
                : phase.state === 'failed'
                  ? t('backup.download.failed', { error: last?.error ?? '?' })
                  : phase.state === 'expired'
                    ? t('backup.download.expired')
                    : t(`backup.download.state.${phase.state}`)}
            </p>
          )}
          {phase.kind === 'following' && phase.state === 'ready' && last?.expiresAt && (
            <p className="m-0 text-muted-foreground text-xs" data-download-until>
              {t('backup.download.until', { at: time.absolute(last.expiresAt) })}
            </p>
          )}
          {phase.kind === 'refused' && (
            <p className="m-0 text-destructive text-xs" role="alert" data-download-refused>
              {phase.words}
            </p>
          )}
          {downloaded && (
            <p
              role="status"
              className="m-0 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
              data-download-done
            >
              <Check className="size-4" aria-hidden="true" />
              {t('backup.download.started')}
            </p>
          )}
          {challengeId !== null && !downloaded && phase.kind !== 'downloadFailed' && (
            <div className="grid gap-2" data-download-code>
              <Label htmlFor="backup-download-code">{t('backup.download.code')}</Label>
              <InputOTP
                id="backup-download-code"
                maxLength={6}
                pattern={DIGITS_ONLY}
                inputMode="numeric"
                value={code}
                onChange={setCode}
                aria-invalid={codeInvalid}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={codeInvalid ? 'text-destructive' : 'text-muted-foreground'}>
                  {codeInvalid
                    ? t(
                        codeError === 'DOWNLOAD_CODE_EXPIRED'
                          ? 'backup.download.codeExpired'
                          : codeError === 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS'
                            ? 'backup.download.codeTooManyAttempts'
                            : 'backup.download.codeInvalid'
                      )
                    : t('backup.download.hint')}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  disabled={fetching}
                  onClick={() => void requestCode()}
                >
                  {t('backup.download.resend')}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {phase.kind === 'confirm' || phase.kind === 'asking' ? t('action.cancel') : t('action.close')}
          </Button>
          {downloaded ? (
            <Button type="button" size="sm" disabled data-download-done-button>
              <Check aria-hidden="true" />
              {t('backup.download.downloaded')}
            </Button>
          ) : phase.kind === 'downloadFailed' ? (
            <Button
              type="button"
              size="sm"
              disabled={fetching}
              onClick={() =>
                void (phase.retryCode ? requestCode() : phase.retryDownload ? retryDownload() : prepare())
              }
            >
              {t('action.retry')}
            </Button>
          ) : phase.kind === 'following' && phase.state === 'ready' ? (
            <Button
              type="button"
              size="sm"
              disabled={fetching || (challengeId !== null && !/^\d{6}$/.test(code))}
              onClick={() => void (challengeId === null ? requestCode() : download())}
              data-download-get
            >
              <Download aria-hidden="true" />
              {challengeId === null ? t('backup.download.sendCode') : t('backup.download.download')}
            </Button>
          ) : (
            (phase.kind === 'confirm' ||
              phase.kind === 'asking' ||
              (phase.kind === 'following' && (phase.state === 'failed' || phase.state === 'expired'))) && (
              <Button
                type="button"
                size="sm"
                disabled={phase.kind === 'asking'}
                onClick={() => void prepare()}
                data-download-start
              >
                <Download aria-hidden="true" />
                {t('backup.download.start')}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
