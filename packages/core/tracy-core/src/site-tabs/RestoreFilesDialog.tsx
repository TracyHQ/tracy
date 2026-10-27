/**
 * Restore files… of a backup (ADR 0024 sub-decision 2, the light verb): the site's FILES go back to
 * the backup's commit (`POST /restore` `mode: reset`). Content and settings in the database stay as
 * they are; Restore everything is the other dialog (`BackupDialogs.tsx`).
 *
 * Cancel holds the focus. A dialog that opens with the dangerous button focused turns a stray
 * Return into a restore.
 *
 * 🔒 AN ANSWER THAT PROVES NOTHING SAYS SO. The press carries a key of its own (`idemKey`): a lost
 * reply, a timeout or an `unknown` status reads "not confirmed yet" — never "nothing was changed" —
 * and Check again replays the same operation instead of restoring twice. `succeeded_noop` says the
 * files were already as they were at the backup.
 *
 * There is no "the live site is safe" line: a site on Tracy IS the site (Lee, 04/09), so a restore
 * changes what visitors see, and pretending otherwise would be the one sentence a person acts on.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tracy/ui'

import type { Translate } from '../team/translate'
import { restoreMoment } from './api'
import { newIdemKey, undoOutcomeOf } from './activity-v2'
import type { BackupPoint } from './backup-list'
import { type DialogFrame, OwnDialog } from './dialog-frame'

const randomBytes = (bytes: Uint8Array): Uint8Array => {
  // `getRandomValues` works off a secure context too (an http stand); `randomUUID` does not.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    return crypto.getRandomValues(bytes)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

export function RestoreFilesDialog({
  siteKey,
  siteName = siteKey,
  backup,
  name,
  onClose,
  onDone,
  Frame = OwnDialog,
  choice,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`siteNameFor`); the key while it is not known. */
  siteName?: string
  backup: Pick<BackupPoint, 'sha'>
  /** How the backup is named on screen ("Backup 4 · …", `backupName`). */
  name: string
  onClose: () => void
  /** Told once the server answered anything but a refusal, so the list and the backups read again. */
  onDone: () => void
  /** The dialog it draws in: its own, or the one Restore… holds open (`dialog-frame.tsx`). */
  Frame?: DialogFrame
  /** What Restore… asks or says about the scope, under the title. */
  choice?: ReactNode
  t: Translate
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The door's refusal by role (`FORBIDDEN_WRITE`): said in the dialog, which stays.
  const [forbidden, setForbidden] = useState(false)
  // The server ran it and nothing was different (`succeeded_noop`): said, never a silent close.
  const [noop, setNoop] = useState(false)
  // A key naming this press: asking again after an unconfirmed answer replays it, never runs twice.
  const [idemKey, setIdemKey] = useState(() => newIdemKey(randomBytes))
  // An answer that proved nothing (`unknown`, a timeout, no answer): the lists re-read on close.
  const [unconfirmed, setUnconfirmed] = useState(false)
  const close = (): void => {
    if (unconfirmed) onDone()
    onClose()
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setForbidden(false)
    try {
      const answer = await restoreMoment(siteKey, { sha: backup.sha, mode: 'reset', idemKey })
      const out = undoOutcomeOf(answer.httpStatus, answer.body)
      switch (out.status) {
        case 'succeeded':
          onDone()
          onClose()
          return
        // Nothing changed, so nothing to re-read — and re-reading would unmount this answer.
        case 'succeeded_noop':
          setNoop(true)
          return
        case 'forbidden':
          setIdemKey(newIdemKey(randomBytes))
          setForbidden(true)
          return
        case 'unknown':
          // Never "Nothing was changed": the host may well have finished (plan §3.3).
          setUnconfirmed(true)
          setError(t('restore.unconfirmed'))
          return
        case 'rate-limited':
          setIdemKey(newIdemKey(randomBytes))
          setError(t('error.rateLimited'))
          return
        default:
          // A refusal before anything ran: the next press is a new press.
          setIdemKey(newIdemKey(randomBytes))
          setError(t('restore.failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (noop)
    return (
      <Frame onOpenChange={(o) => !o && onClose()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('restore.noopTitle')}</DialogTitle>
            <DialogDescription data-restore-outcome="succeeded_noop">
              {t('restore.noopBody', { name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" autoFocus onClick={onClose}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Frame>
    )

  return (
    <Frame onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('restore.titleBackup', { site: siteName, name })}</DialogTitle>
          <DialogDescription>{t('restore.bodyBackup')}</DialogDescription>
        </DialogHeader>
        {choice}
        <p className="m-0 text-muted-foreground text-sm">{t('restore.keeps')}</p>
        {forbidden && (
          <p className="m-0 text-destructive text-xs" role="alert" data-refusal="FORBIDDEN_WRITE">
            {t('backup.forbidden.files')}
          </p>
        )}
        {error !== null && (
          <p
            className={unconfirmed ? 'tv-restore-unconfirmed' : 'm-0 text-destructive text-xs'}
            role="alert"
            data-restore-outcome={unconfirmed ? 'unknown' : undefined}
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus onClick={close} disabled={busy}>
            {unconfirmed ? t('action.close') : t('action.cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void submit()} disabled={busy || forbidden}>
            <RotateCcw aria-hidden="true" />
            {busy
              ? t('restore.working')
              : unconfirmed
                ? t('event.undo.checkAgain')
                : t('restore.confirmBackup')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Frame>
  )
}
