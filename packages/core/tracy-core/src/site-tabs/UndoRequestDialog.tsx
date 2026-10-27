/**
 * "Undo this request?" — the confirm step of a Chat row's one undo button (door d3 of
 * `plan-verified.html`, approved by Akemi 06/10/2026). It says in words what goes back: the request
 * (quoted), who asked and when, a "Puts back:" list, the later requests a Go back sweeps along, and
 * that there is no Redo. Commit ids only under Technical details.
 *
 * The press is the engine's (`undoTurn`, `@tracy/core/turn-undo`), with a key of its own so a
 * retried request cannot run twice, and one undo per chat at a time (`book.begin`), shared with the
 * chat card's fence. Cancel holds the focus: a stray Return must not undo.
 */
import { type JSX, useRef, useState } from 'react'
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
import {
  type Card,
  laterTurns,
  outcomeKey,
  putsBackOf,
  type Say,
  type Turn,
  type TurnsAnswer,
  type TurnsBook,
  undoTurn
} from '../turn-undo/index.mjs'

type Ready = Extract<Card, { kind: 'ready' }>

/** A random key for one press, so a retried request cannot run the same undo twice (as the chat card). */
function pressKey(): string | undefined {
  try {
    return globalThis.crypto?.randomUUID?.()
  } catch {
    return undefined
  }
}

export function UndoRequestDialog({
  siteKey,
  sessionId,
  card,
  answer,
  book,
  request,
  who,
  when,
  onClose,
  onSettled,
  t
}: {
  siteKey: string
  sessionId: string
  card: Ready
  answer: TurnsAnswer
  book: TurnsBook
  /** The request as the row's title says it (`requestTitleOf`), or null when none was kept. */
  request: string | null
  /** Who asked, as the row's By says it. */
  who: string
  /** When, as the row's hover says it; null when unknown. */
  when: string | null
  onClose: () => void
  /** The server answered anything at all: the list reads again; `changed` → the previews reload. */
  onSettled: (changed: boolean) => void
  t: Translate
}): JSX.Element {
  const say: Say = (key, params) => t(key, params)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ key: string; params?: Record<string, string | number> } | null>(null)
  const pressing = useRef(false)
  const turn = card.turn
  const goBack = card.action === 'goBack'
  const later: Turn[] = goBack ? laterTurns(answer, turn.turn) : []
  const putsBack = putsBackOf(turn, say)
  // Every commit the press puts back, newest request first: this turn's and the later ones swept along.
  const swept = [...later].reverse().concat(turn)

  const press = async (): Promise<void> => {
    if (pressing.current || !book.begin(siteKey, sessionId)) return
    pressing.current = true
    setBusy(true)
    try {
      const outcome = await undoTurn({
        siteKey,
        sessionId,
        turnId: turn.turnId,
        scope: goBack ? 'from-here' : 'turn',
        idemKey: pressKey()
      })
      const key = outcomeKey(outcome)
      if (key === null) {
        onSettled(outcome.kind !== 'refused')
        onClose()
        return
      }
      setNote({ key, params: outcome.kind === 'refused' ? { code: outcome.code } : {} })
      // Partly undone or no clear answer: the site may have moved, so the list and previews follow.
      onSettled(outcome.kind !== 'refused')
    } finally {
      pressing.current = false
      book.end(siteKey, sessionId)
      setBusy(false)
    }
  }

  if (note !== null)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(goBack ? 'undo.confirmGoBackTitle' : 'undo.confirmTitle')}</DialogTitle>
            <DialogDescription data-undo-request-note={note.key}>
              {t(note.key, note.params)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" autoFocus onClick={onClose}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent closeLabel={t('action.close')} className="tracy-site-tabs sm:max-w-md" data-undo-request>
        <DialogHeader>
          <DialogTitle>{t(goBack ? 'undo.confirmGoBackTitle' : 'undo.confirmTitle')}</DialogTitle>
          <DialogDescription data-undo-request-who>
            {[request === null ? null : t('event.requestTitle', { text: request }), who, when]
              .filter((x): x is string => x !== null && x !== '')
              .join(' · ')}
          </DialogDescription>
        </DialogHeader>
        {putsBack.length > 0 && (
          <div className="tv-undo-list" data-puts-back>
            <p className="tv-undo-not-title">{t('undo.putsBackTitle')}</p>
            <ul className="tv-undo-not-list">
              {putsBack.map((x, i) => (
                <li key={`${x}-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {later.length > 0 && (
          <div className="tv-undo-list" data-also-later>
            <p className="tv-undo-not-title">
              {t(later.length === 1 ? 'undo.alsoLater.one' : 'undo.alsoLater.other', { count: later.length })}
            </p>
            <ul className="tv-undo-not-list">
              {later.map((x) => (
                <li key={x.turnId}>
                  {x.title === null ? t('undo.askThis') : t('event.requestTitle', { text: oneLine(x.title) })}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="m-0 text-muted-foreground text-sm" data-undo-scope>
          {t('undo.scope')}
        </p>
        <details>
          <summary className="tv-activity-summary">{t('event.technical')}</summary>
          <dl className="tv-activity-tech">
            {swept.flatMap((x) => [
              <div key={`turn-${x.turnId}`} className="contents">
                <dt>{t('event.tech.turn')}</dt>
                <dd title={x.turnId}>{x.turnId}</dd>
              </div>,
              ...x.files.commits.map((sha) => (
                <div key={`commit-${sha}`} className="contents">
                  <dt>{t('event.tech.commit')}</dt>
                  <dd title={sha}>{sha}</dd>
                </div>
              ))
            ])}
          </dl>
        </details>
        <DialogFooter>
          <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </Button>
          <Button size="sm" onClick={() => void press()} disabled={busy} data-undo-request-confirm>
            <RotateCcw aria-hidden="true" />
            {busy ? t('undo.undoing') : t(goBack ? 'undo.goBackConfirm' : 'undo.undo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A later request in one line, cut like a row's title. */
function oneLine(text: string): string {
  const first = text.trim().split(/\r?\n/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
}
