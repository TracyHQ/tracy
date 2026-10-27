/**
 * The notice a delete leaves when it did not end in a confirmed, complete delete (#801): which
 * parts of the site were not confirmed gone, the door's reason for each, and what to do next.
 *
 * 🔒 MOUNTED ON document.body WITH ITS OWN ROOT, NOT RENDERED BY THE TAB — the same reason as
 * `deleting-cover.ts`: deleting the site this page stands in makes dsh forget the workspace while
 * the request still runs, so the tab (and any state it holds) can be gone before the answer
 * arrives; and deleting the last site listed swaps the table for the empty sentence. The site's
 * row is already off the book by then, so this notice is the only place the person can read what
 * was left behind. It stays until they acknowledge it.
 *
 * It offers no second delete: with the row gone the door would answer 404, and after an unknown
 * result a blind repeat is the one thing not to invite.
 */
import type { JSX } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'

import type { CleanupPart, CleanupState, DeleteOutcome } from './delete-response'
import type { Translate } from './strings'

/** A delete that needs telling: every outcome except the complete one. */
export type DeleteNoticeOutcome = Exclude<DeleteOutcome, { kind: 'complete' }>

const PART_LABEL: Record<CleanupPart, string> = {
  host: 'delete.partHost',
  repo: 'delete.partRepo',
  sessions: 'delete.partSessions',
  seats: 'delete.partSeats'
}

const STATE_LABEL: Record<CleanupState, string> = {
  failed: 'delete.stateFailed',
  unknown: 'delete.stateUnknown'
}

/** The deleting cover's layer (`deleting-cover.ts`); the notice's page cover takes its place. */
const COVER_LAYER = 2147483000

export function DeleteResultDialog({
  siteKey,
  siteName,
  outcome,
  aboveCover = false,
  onAcknowledge,
  t
}: {
  siteKey: string
  /** The name the site was shown by when the delete was asked for. */
  siteName: string
  outcome: DeleteNoticeOutcome
  /** Lift the popup over the page cover `showDeleteResult` draws. */
  aboveCover?: boolean
  onAcknowledge: () => void
  t: Translate
}): JSX.Element {
  const partial = outcome.kind === 'partial'
  return (
    // No dismissal by a press outside: the notice is read once, and a stray press must not lose it.
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onAcknowledge()
      }}
    >
      <DialogContent
        closeLabel={t('action.close')}
        // A column whose middle scrolls: however long the reasons run, the title, the Close and
        // the acknowledge button stay on screen.
        className="tracy-mysites flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md"
        data-tracy-delete-result={outcome.kind}
        style={aboveCover ? { zIndex: COVER_LAYER + 1 } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="wrap-anywhere pr-8 leading-snug">
            {t(partial ? 'delete.partialTitle' : 'delete.unknownTitle', { site: siteName })}
          </DialogTitle>
          <DialogDescription>{t(partial ? 'delete.partialBody' : 'delete.unknownBody')}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 min-w-0 gap-4 overflow-y-auto">
          {partial && (
            <ul className="m-0 grid min-w-0 list-none gap-3 p-0 text-sm">
              {outcome.issues.map((issue) => (
                <li key={issue.part} className="grid min-w-0 gap-0.5">
                  <span className="font-medium">{t(PART_LABEL[issue.part])}</span>
                  <span className="text-destructive text-xs">{t(STATE_LABEL[issue.state])}</span>
                  {/* The door's reason is shown as the text it is. A part the door did not report on
                    has no reason to show: the state line already says nothing was reported. */}
                  {issue.state === 'failed' && (
                    <span className="wrap-anywhere min-w-0 text-muted-foreground text-xs">
                      {issue.reason === null
                        ? t('delete.reasonUnknown')
                        : t('delete.reason', { reason: issue.reason })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="wrap-anywhere m-0 min-w-0 text-muted-foreground text-xs">
            {t('delete.resultSiteKey', { key: siteKey })}
          </p>
          <p className="m-0 min-w-0 text-sm">{t(partial ? 'delete.partialNext' : 'delete.unknownNext')}</p>
        </div>
        <DialogFooter>
          <Button size="sm" autoFocus onClick={onAcknowledge}>
            {t('delete.resultAcknowledge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Show the notice and wait for the person to acknowledge it.
 * @param doc - the page's document.
 * @param notice - what to tell. `cover` draws an opaque page cover under the notice: the page it
 *   would otherwise sit on has lost its workspace, and is about to be left (`after-delete.ts`).
 * @returns a promise that settles once, when the notice is acknowledged. Without `cover` nothing
 *   is left in the document; with it the cover stays until the page navigates away.
 */
export function showDeleteResult(
  doc: Document,
  notice: { siteKey: string; siteName: string; outcome: DeleteNoticeOutcome; cover: boolean; t: Translate }
): Promise<void> {
  const host = doc.createElement('div')
  host.className = 'tms-delete-result-host'
  if (notice.cover) {
    host.style.cssText = `position:fixed;inset:0;z-index:${COVER_LAYER};background:var(--dsw-alias-bg-base, var(--background))`
  }
  doc.body.append(host)
  const root = createRoot(host)
  return new Promise((resolve) => {
    let shown = true
    const acknowledge = (): void => {
      if (!shown) return
      shown = false
      root.unmount()
      if (!notice.cover) host.remove()
      resolve()
    }
    root.render(
      <DeleteResultDialog
        siteKey={notice.siteKey}
        siteName={notice.siteName}
        outcome={notice.outcome}
        aboveCover={notice.cover}
        onAcknowledge={acknowledge}
        t={notice.t}
      />
    )
  })
}
