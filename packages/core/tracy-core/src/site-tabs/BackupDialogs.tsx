/**
 * The two backup dialogs of Site changes (ADR 0024), ported from `@tracy/design` › `Mockups/Site
 * changes backup` (Brian 02/10):
 *
 *   Create a backup     a title, notes drafted from Site changes' own words, and the line that says
 *                       what is kept (files AND the database; EmDash: database and media, template
 *                       code not). The title is optional: left blank, the backup is named by its
 *                       date and time.
 *   Restore everything  (EmDash: Restore content) names what is deleted, says a "Before restore"
 *                       backup is taken first, and stays shut until the word "Restore" is typed (any
 *                       case; Brian 03/10, as My Sites' delete — the site address was slow to type and
 *                       could not be copied). The word goes to the server too (`confirm`), which
 *                       checks it again. Cancel holds the focus; the destructive button never does.
 *
 * 🔒 AN ANSWER THAT PROVES NOTHING SAYS SO. Restore everything carries a key of its own (`idemKey`):
 * a lost reply or `unknown` status reads "not confirmed yet" (the words the files undo uses), and
 * asking again replays the same operation. Every refusal the door names gets its own sentence.
 */
import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { Archive, Database, TriangleAlert } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Label,
  Textarea
} from '@tracy/ui'

import { interfaceLocale } from '../interface-languages/index.mjs'
import type { Translate } from '../team/translate'
import { type BackupMade, createBackup, restoreEverything, SiteApiError } from './api'
import { newIdemKey } from './activity-v2'
import { backupCreateOutcomeOf, type BackupPoint } from './backup-list'
import { backupName } from './BackupRow'
import { type DialogFrame, OwnDialog } from './dialog-frame'

const randomBytes = (bytes: Uint8Array): Uint8Array => {
  // `getRandomValues` works off a secure context too (an http stand); `randomUUID` does not.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    return crypto.getRandomValues(bytes)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/** The title a backup gets unless the person writes one: its date and time, as the viewer reads them. */
export const stampTitle = (now: Date): string =>
  now.toLocaleString(interfaceLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

/**
 * The title to store from what the person left in the field: without a leading "Backup {n} · " (the
 * list puts the number in front of every title, so it would read twice), and the date and time when
 * nothing is left.
 */
export function storedTitle(typed: string, prefix: string, now: Date): string {
  return titleWithoutNumber(typed, prefix) || stampTitle(now)
}

/** The typed title without any leading "Backup {n} · "; empty when nothing else is left. */
function titleWithoutNumber(typed: string, prefix: string): string {
  let text = typed.trim()
  const head = prefix.trim()
  while (head !== '' && text.startsWith(head)) text = text.slice(head.length).trim()
  return text
}

export function CreateBackupDialog({
  siteKey,
  siteName = siteKey,
  nextNumber,
  since,
  changes,
  draft,
  draftPending,
  onClose,
  onMade,
  onPending,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`siteNameFor`); the key while it is not known. */
  siteName?: string
  /** The number the host will most likely give; shown, never sent. */
  nextNumber: number | null
  /** "Backup 3", or "the start" before the first backup. */
  since: string
  /** How many changes the drafted notes come from. */
  changes: number
  draft: string
  draftPending: boolean
  onClose: () => void
  onMade: (made: BackupMade) => void
  /** Told when the press was answered without a result: the list then watches for the backup. */
  onPending?: () => void
  t: Translate
}): JSX.Element {
  // The title is a field from the start (Brian 03/10, second take): the date and time in it, "Backup
  // {n} ·" before it as a fixed prefix. Untouched, it follows the clock and the time at the press is
  // stored; typed, the typed words are (a leading "Backup {n} · " stripped, empty = the time).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])
  /** What the person typed in the title; `null` until they type. */
  const [typed, setTyped] = useState<string | null>(null)
  // "Backup {n} · " in the viewer's words: what the list puts in front of the stored title.
  const prefix = nextNumber === null ? '' : t('backup.name', { n: nextNumber, title: '' })
  const [notes, setNotes] = useState(draft)
  const [touched, setTouched] = useState(false)
  // Untouched notes ARE the draft, whatever it becomes — nothing new since the newest backup included:
  // keeping the last non-empty draft saved notes from a picture that was not the site's (REG-018).
  if (!touched && notes !== draft) setNotes(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // An answer without a result (#1403 item 9): still being made, or not confirmed either way.
  const [waiting, setWaiting] = useState<'pending' | 'unconfirmed' | null>(null)

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // The door asks for a title; a blank one is the backup's date and time (ADR §4).
      const made = await createBackup(siteKey, {
        title: typed === null ? stampTitle(new Date()) : storedTitle(typed, prefix, new Date()),
        notes: notes.trim()
      })
      onMade(made)
      onClose()
    } catch (e) {
      const outcome = backupCreateOutcomeOf(
        e instanceof SiteApiError ? { status: e.status, code: e.code } : null
      )
      if (outcome === 'pending' || outcome === 'unconfirmed') {
        setWaiting(outcome)
        onPending?.()
      } else setError(outcome === 'rate-limited' ? t('error.rateLimited') : t('backup.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (waiting !== null)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {waiting === 'pending' ? t('backup.pendingTitle') : t('event.undo.unknownTitle')}
            </DialogTitle>
            <DialogDescription data-backup-outcome={waiting}>
              {waiting === 'pending' ? t('backup.pendingBody') : t('backup.unconfirmedBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" size="sm" autoFocus onClick={onClose}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      {/* Never taller than the window (Brian 03/10: long notes pushed the footer off screen): the
          header and the footer stay, the body between them scrolls. */}
      <DialogContent
        closeLabel={t('action.close')}
        className="tracy-site-tabs max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            {nextNumber === null
              ? t('backup.createTitleNoNumber', { site: siteName })
              : t('backup.createTitle', { n: nextNumber, site: siteName })}
          </DialogTitle>
        </DialogHeader>
        {/* `-mx-1 px-1`: room for the fields' focus rings inside the scrolling body. */}
        <div className="-mx-1 grid min-h-0 content-start gap-3 overflow-y-auto px-1" data-create-body>
          <div className="grid gap-1.5">
            <Label htmlFor="tracy-backup-title">{t('backup.nameLabel')}</Label>
            {/* "Backup {n} ·" is not part of the field: it cannot be edited, so the list never reads
                it twice. While the backups load it says so, and the field is usable meanwhile. */}
            <InputGroup className="bg-transparent dark:bg-transparent">
              <InputGroupAddon align="inline-start">
                <InputGroupText
                  className={nextNumber === null ? 'text-muted-foreground' : undefined}
                  data-title-prefix={nextNumber === null ? 'pending' : 'number'}
                >
                  {nextNumber === null ? t('backup.titlePending') : prefix.trim()}
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="tracy-backup-title"
                value={typed ?? stampTitle(now)}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={120}
                autoComplete="off"
                data-title-input
              />
            </InputGroup>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tracy-backup-notes">{t('backup.notesTitle')}</Label>
            <Textarea
              id="tracy-backup-notes"
              rows={7}
              // The shared Textarea grows with its words (`field-sizing-content`); here it stops at
              // ten lines and never takes more than 40% of the window, then scrolls itself.
              className="max-h-[min(13.625rem,40vh)] overflow-y-auto"
              value={notes}
              placeholder={draftPending ? t('backup.notesLoading') : undefined}
              onChange={(e) => {
                setTouched(true)
                setNotes(e.target.value)
              }}
              data-draft
            />
            <p className="m-0 text-muted-foreground text-xs">
              {draftPending ? t('backup.notesLoading') : t('backup.notesHint', { count: changes, since })}
            </p>
          </div>
          {error !== null && (
            <p className="m-0 text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
            <Archive aria-hidden="true" />
            {busy ? t('backup.creating') : t('backup.createConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What a Restore everything press came back with. */
export type EverythingOutcome =
  | { status: 'succeeded' }
  | { status: 'succeeded_noop' }
  | { status: 'unknown' }
  | { status: 'refused'; code: string; reason: string | null }
  | { status: 'rate-limited' }
  | { status: 'failed' }

/**
 * The answer of `POST /restore` `mode: everything` as one outcome (B2 contract): every code the
 * door names becomes a refusal with its own words; `unknown`/pending/no answer is never "nothing
 * was changed".
 */
export function everythingOutcomeOf(httpStatus: number | null, body: unknown): EverythingOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as {
    ok?: unknown
    code?: unknown
    status?: unknown
    reason?: unknown
  }
  if (httpStatus === null) return { status: 'unknown' }
  if (httpStatus >= 200 && httpStatus < 300 && httpStatus !== 202 && b.ok === true) {
    if (b.status === 'succeeded_noop') return { status: 'succeeded_noop' }
    if (b.status === 'unknown' || b.status === 'pending') return { status: 'unknown' }
    return { status: 'succeeded' }
  }
  if (httpStatus === 202 || b.status === 'unknown' || b.status === 'pending') return { status: 'unknown' }
  if (httpStatus === 429) return { status: 'rate-limited' }
  const code = typeof b.code === 'string' ? b.code : null
  const reason = typeof b.reason === 'string' ? b.reason : null
  if (
    code === 'CONFIRM_REQUIRED' ||
    code === 'CONFIRM_MISMATCH' ||
    code === 'BACKUP_UNKNOWN' ||
    code === 'BACKUP_NOT_FULL' ||
    code === 'RESTORE_REFUSED' ||
    code === 'FORBIDDEN_WRITE' ||
    code === 'INVALID_VERSION'
  )
    return { status: 'refused', code, reason }
  if (b.status === 'failed') return { status: 'failed' }
  if (b.reason === 'timeout' || httpStatus >= 500) return { status: 'unknown' }
  return { status: 'failed' }
}

/** The sentence of a refusal, by the door's code. */
export function refusalWords(code: string, t: Translate): string {
  switch (code) {
    case 'BACKUP_UNKNOWN':
    case 'INVALID_VERSION':
      return t('backup.err.unknown')
    case 'BACKUP_NOT_FULL':
      return t('backup.err.notFull')
    case 'FORBIDDEN_WRITE':
      return t('backup.err.forbidden')
    default:
      return t('backup.err.refused')
  }
}

/** The word typed to confirm Restore everything — English in every language, as My Sites' "Delete". */
const RESTORE_WORD = 'restore'

const LOST = ['posts', 'orders', 'forms', 'users', 'comments', 'settings'] as const

export function RestoreEverythingDialog({
  siteKey,
  siteName = siteKey,
  backup: b,
  time,
  onClose,
  onSettled,
  Frame = OwnDialog,
  choice,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`siteNameFor`); the key while it is not known. */
  siteName?: string
  backup: BackupPoint
  time: { absolute: (iso: string) => string }
  onClose: () => void
  /** Told once the server answered anything but a refusal, so the list and the backups read again. */
  onSettled: () => void
  /** The dialog it draws in: its own, or the one Restore… holds open (`dialog-frame.tsx`). */
  Frame?: DialogFrame
  /** What Restore… asks or says about the scope, under the title. */
  choice?: ReactNode
  t: Translate
}): JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [idemKey, setIdemKey] = useState(() => newIdemKey(randomBytes))
  const [outcome, setOutcome] = useState<EverythingOutcome | null>(null)
  const emdash = b.capability === 'content'
  const when = b.at === null ? '' : time.absolute(new Date(b.at * 1000).toISOString())
  const name = backupName(b, t)
  const matches = typed.trim().toLowerCase() === RESTORE_WORD

  const press = async (): Promise<void> => {
    if (busy || !matches) return
    setBusy(true)
    const answer = await restoreEverything(siteKey, {
      version: b.version,
      confirm: RESTORE_WORD,
      idemKey
    })
    const out = everythingOutcomeOf(answer.httpStatus, answer.body)
    setBusy(false)
    if (out.status === 'succeeded') {
      onSettled()
      onClose()
      return
    }
    // A refusal ran nothing: the next press is a new press, with a key of its own.
    if (out.status === 'refused' || out.status === 'failed' || out.status === 'rate-limited')
      setIdemKey(newIdemKey(randomBytes))
    setOutcome(out)
  }

  const close = (): void => {
    if (outcome?.status === 'unknown' || outcome?.status === 'succeeded_noop') onSettled()
    onClose()
  }

  if (outcome?.status === 'unknown' || outcome?.status === 'succeeded_noop')
    return (
      <Frame onOpenChange={(o) => !o && close()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {outcome.status === 'unknown' ? t('event.undo.unknownTitle') : t('restore.noopTitle')}
            </DialogTitle>
            <DialogDescription data-everything-outcome={outcome.status}>
              {outcome.status === 'unknown' ? t('restore.unconfirmed') : t('backup.noopBody', { name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {outcome.status === 'unknown' && (
              // Same key: the server answers the operation already made, never a second restore.
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void press()}>
                {busy ? t('event.undo.checking') : t('event.undo.checkAgain')}
              </Button>
            )}
            <Button size="sm" autoFocus onClick={close} disabled={busy}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Frame>
    )

  return (
    <Frame onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {emdash
              ? t('backup.contentTitle', { site: siteName, name })
              : t('backup.everythingTitle', { site: siteName, name })}
          </DialogTitle>
          <DialogDescription>
            {emdash ? t('backup.contentBody', { when }) : t('backup.everythingBody', { when })}
          </DialogDescription>
        </DialogHeader>
        {choice}
        <div className="tv-backup-lost" data-lost role="alert">
          <p className="tv-backup-lost-title">
            <TriangleAlert className="tv-activity-note-icon" aria-hidden="true" />
            {t('backup.lostTitle', { when })}
          </p>
          <ul className="tv-backup-lost-list">
            {LOST.map((x) => (
              <li key={x}>{t(`backup.lost.${x}`)}</li>
            ))}
          </ul>
        </div>
        <p className="tv-backup-before" data-before-first>
          <Archive className="tv-backup-mark" aria-hidden="true" />
          {t('backup.beforeFirst')}
        </p>
        {emdash && (
          <p className="m-0 text-muted-foreground text-sm">
            {t('backup.emdashOffline')} {t('backup.templateKept')}
          </p>
        )}
        <div className="grid gap-2 pt-1">
          <Label htmlFor="tracy-restore-confirm" className="font-normal text-muted-foreground">
            {t('backup.typeRestore')}
          </Label>
          <Input
            id="tracy-restore-confirm"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            placeholder="Restore"
            onChange={(e) => setTyped(e.target.value)}
            data-confirm-word
          />
        </div>
        {outcome?.status === 'refused' && (
          <p
            className="m-0 text-destructive text-xs"
            role="alert"
            data-refusal={outcome.code}
            data-reason={outcome.reason ?? undefined}
          >
            {refusalWords(outcome.code, t)}
          </p>
        )}
        {outcome?.status === 'failed' && (
          <p className="m-0 text-destructive text-xs" role="alert" data-refusal="failed">
            {t('backup.everythingFailed')}
          </p>
        )}
        {outcome?.status === 'rate-limited' && (
          <p className="m-0 text-destructive text-xs" role="alert" data-refusal="rate-limited">
            {t('error.rateLimited')}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || !matches}
            onClick={() => void press()}
            data-confirm-everything
          >
            <Database aria-hidden="true" />
            {busy
              ? t('restore.working')
              : emdash
                ? t('backup.contentConfirm')
                : t('backup.everythingConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Frame>
  )
}
