/**
 * Undo file changes of ONE commit (Site changes V2, plan §3.3; drawn in `@tracy/design` ›
 * `Mockups/Site changes V2`, stories `Undo · …`).
 *
 * 🔒 THE COUNT IS THE COMMIT'S, READ FROM THE SERVER. The dialog asks `GET …/moments/:sha/undo-scope`
 * — the same list the undo walks — and never counts with a turn's summed files or the length of the
 * 500-file page. Until that answer is in, the confirm button has no number and stays off.
 *
 * 🔒 AN ANSWER THAT PROVES NOTHING SAYS SO. The press carries a key of its own (`idemKey`), so asking
 * again replays the same operation instead of running the undo twice. A lost reply, a timeout or an
 * `unknown` status is worded "not confirmed yet" — never "nothing was changed" — and the list checks
 * again by itself; `succeeded_noop` says there was nothing to undo.
 *
 * Cancel holds the focus: a stray Return must not undo.
 */
import { type JSX, useCallback, useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'

import type { Translate } from '../team/translate'
import { type ActivityItemV2, readMomentFiles, readUndoScope, SiteApiError, undoMoment } from './api'
import { newIdemKey, opWord, resourceText, type UndoOutcome, undoOutcomeOf } from './activity-v2'

const SCOPE_ASKS = 8
const SCOPE_WAIT_MS = 4000

type Scope = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; files: number; complete: boolean }

const randomBytes = (bytes: Uint8Array): Uint8Array => {
  // `getRandomValues` works off a secure context too (an http stand); `randomUUID` does not.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    return crypto.getRandomValues(bytes)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

export function UndoFilesDialog({
  siteKey,
  item,
  sha,
  onClose,
  onSettled,
  t
}: {
  siteKey: string
  /** The event whose commit is undone: what it does NOT undo is named from its effects. */
  item: ActivityItemV2
  sha: string
  onClose: () => void
  /** Told once the server answered anything but a refusal, so the list reads itself again. */
  onSettled: () => void
  t: Translate
}): JSX.Element {
  const [scope, setScope] = useState<Scope>({ state: 'loading' })
  const [paths, setPaths] = useState<string[] | null>(null)
  const [idemKey, setIdemKey] = useState(() => newIdemKey(randomBytes))
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<UndoOutcome | null>(null)
  const short = sha.slice(0, 7)

  const readScope = useCallback(async () => {
    setScope({ state: 'loading' })
    for (let ask = 0; ask < SCOPE_ASKS; ask++) {
      try {
        const s = await readUndoScope(siteKey, sha)
        setScope({ state: 'ready', files: s.files, complete: s.complete })
        return
      } catch (e) {
        if (!(e instanceof SiteApiError && e.code === 'FLEET_JOB_PENDING')) break
        await new Promise((r) => setTimeout(r, SCOPE_WAIT_MS))
      }
    }
    setScope({ state: 'failed' })
  }, [siteKey, sha])
  useEffect(() => {
    void readScope()
    // The names, best effort: the count above is what the button says, never this list's length.
    readMomentFiles(siteKey, sha)
      .then((a) =>
        setPaths(
          (Array.isArray(a.files) ? a.files : []).filter((f) => f.excluded !== true).map((f) => f.path)
        )
      )
      .catch(() => setPaths(null))
  }, [readScope, siteKey, sha])

  const press = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const answer = await undoMoment(siteKey, { sha, idemKey })
    const out = undoOutcomeOf(answer.httpStatus, answer.body)
    setBusy(false)
    if (out.status === 'succeeded') {
      onSettled()
      onClose()
      return
    }
    // A plain failure ran nothing: the next press is a new press, with a key of its own.
    if (out.status === 'failed' || out.status === 'rate-limited') setIdemKey(newIdemKey(randomBytes))
    setOutcome(out)
  }

  const close = (): void => {
    // Unknown or no-op: the list reads again, and the server settles the operation through its job.
    if (outcome?.status === 'unknown' || outcome?.status === 'succeeded_noop') onSettled()
    onClose()
  }

  const e = item.effects
  const notUndone: string[] = [
    ...e.content.resources.map((r) => resourceText({ ...r, op: r.ops[r.ops.length - 1] ?? null }, t)),
    ...(e.content.operations > 0
      ? [
          t(`event.unnamedActions.${e.content.operations === 1 ? 'one' : 'many'}`, {
            count: e.content.operations
          })
        ]
      : []),
    ...e.settings.resources.map((r) => resourceText({ ...r, op: r.ops[r.ops.length - 1] ?? null }, t)),
    ...(e.settings.operations > 0
      ? [
          t(`event.unnamedActions.${e.settings.operations === 1 ? 'one' : 'many'}`, {
            count: e.settings.operations
          })
        ]
      : []),
    ...e.other.actions.map((a) => `${opWord(a.split(/[._]/).pop(), t)} · ${a}`)
  ]

  if (
    outcome &&
    (outcome.status === 'conflict' || outcome.status === 'not-undoable' || outcome.status === 'forbidden')
  )
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {outcome.status === 'forbidden' ? t('restore.forbiddenTitle') : t('event.undo.refusedTitle')}
            </DialogTitle>
            <DialogDescription>
              {outcome.status === 'conflict'
                ? t('restore.conflictBody')
                : outcome.status === 'not-undoable'
                  ? t('restore.notUndoableBody')
                  : t('restore.forbiddenBody')}
            </DialogDescription>
          </DialogHeader>
          {outcome.status === 'conflict' && outcome.files.length > 0 && (
            <ul className="tv-restore-files" aria-label={t('restore.filesSince')}>
              {outcome.files.map((path) => (
                <li key={path} title={path}>
                  {path}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" autoFocus onClick={onClose}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

  if (outcome && (outcome.status === 'unknown' || outcome.status === 'succeeded_noop'))
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {outcome.status === 'unknown' ? t('event.undo.unknownTitle') : t('event.undo.noopTitle')}
            </DialogTitle>
            <DialogDescription data-undo-outcome={outcome.status}>
              {outcome.status === 'unknown'
                ? t('event.undo.unknownBody')
                : t('event.undo.noopBody', { sha: short })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {outcome.status === 'unknown' && (
              // Same key: the server answers the operation already made, never a second undo.
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void press()}>
                {busy ? t('event.undo.checking') : t('event.undo.checkAgain')}
              </Button>
            )}
            <Button size="sm" autoFocus onClick={close} disabled={busy}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

  const count = scope.state === 'ready' ? scope.files : null
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('event.undo.title')}</DialogTitle>
          <DialogDescription data-undo-count>
            {scope.state === 'loading'
              ? t('event.undo.counting', { sha: short })
              : scope.state === 'failed'
                ? t('event.undo.countFailed', { sha: short })
                : scope.complete
                  ? t(`event.undo.body.${scope.files === 1 ? 'one' : 'many'}`, {
                      count: scope.files,
                      sha: short
                    })
                  : t('event.undo.bodyAtLeast', { count: scope.files, sha: short })}
          </DialogDescription>
        </DialogHeader>
        {paths !== null && paths.length > 0 && (
          <ul className="tv-restore-files" aria-label={t('event.group.files')}>
            {paths.map((path) => (
              <li key={path} title={path}>
                {path}
              </li>
            ))}
          </ul>
        )}
        {paths !== null && paths.length > 0 && count !== null && paths.length < count && (
          // The names listed are fewer than the count (cache files, the 500 cap): say so, so the list
          // never reads as everything the undo touches.
          <p className="m-0 text-muted-foreground text-xs" data-undo-listed>
            {t('moment.filesShowing', { shown: paths.length, count })}
          </p>
        )}
        {notUndone.length > 0 && (
          <div className="tv-undo-not" data-not-undone>
            <p className="tv-undo-not-title">{t('event.undo.notUndone')}</p>
            <ul className="tv-undo-not-list">
              {notUndone.map((x, i) => (
                <li key={`${x}-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="m-0 text-muted-foreground text-sm">{t('event.undo.keeps')}</p>
        {outcome?.status === 'failed' && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {t('event.undo.failed')}
          </p>
        )}
        {outcome?.status === 'rate-limited' && (
          <p className="m-0 text-destructive text-xs" role="alert">
            {t('error.rateLimited')}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </Button>
          {scope.state === 'failed' ? (
            <Button size="sm" onClick={() => void readScope()}>
              {t('action.retry')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void press()} disabled={busy || count === null}>
              <RotateCcw aria-hidden="true" />
              {busy
                ? t('event.undo.working')
                : count === null
                  ? t('event.undo.confirmUncounted')
                  : t(`event.undo.confirm.${count === 1 ? 'one' : 'many'}`, { count })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
