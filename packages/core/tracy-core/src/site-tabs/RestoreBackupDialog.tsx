/**
 * Restore… on a backup (Brian 03/10): ONE button on the row, ONE dialog, and the scope is chosen in
 * it — Everything (selected first) or Files only. Each scope keeps the dialog it always had:
 * Everything is the heavy one (owner/admin, type the site's name, a "Before restore" backup first,
 * `BackupDialogs.tsx`), Files only puts the files back (`RestoreFilesDialog.tsx`). Here they share one
 * window (`dialog-frame.tsx`), so switching scope swaps the content and nothing blinks.
 *
 * 🔒 FILES ONLY SAYS WHAT IT BREAKS. The webroot repo tracks `wp-content/uploads` and Joomla's
 * `images/`, and Restore files resets the tree to the backup (`webroot-git.sh` `read-tree -u
 * --reset`): images uploaded since are removed while the posts that use them stay in the database.
 *
 * When only one scope can be pressed (a point without its database, a role that may not restore
 * everything) there is no choice, but the dialog still says which scope it is and why.
 */
import { type JSX, useCallback, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Dialog } from '@tracy/ui'

import type { Translate } from '../team/translate'
import { type BackupPoint, restoreScopes } from './backup-list'
import type { RestoreScope } from './BackupRow'
import { RestoreEverythingDialog } from './BackupDialogs'
import { type DialogFrame } from './dialog-frame'
import { RestoreFilesDialog } from './RestoreFilesDialog'

const REASON_KEY = {
  'files-only': 'backup.noEverything.files-only',
  'db-missing': 'backup.noEverything.db-missing',
  'role-everything': 'backup.err.forbidden',
  'role-files': 'backup.forbidden.files'
} as const

/** The scope, chosen when both can be pressed, else stated with why the other is not offered. */
export function ScopeChoice({
  scope,
  scopes,
  onScope,
  t
}: {
  scope: RestoreScope
  scopes: ReturnType<typeof restoreScopes>
  onScope: (scope: RestoreScope) => void
  t: Translate
}): JSX.Element {
  const label = (s: RestoreScope): string =>
    t(s === 'files' ? 'restore.scopeFiles' : 'restore.scopeEverything')
  const warning = (
    <span className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs" data-scope-warning>
      <TriangleAlert className="mt-0.5 size-3.5 flex-none text-amber-600" aria-hidden="true" />
      {t('restore.scopeFilesWarning')}
    </span>
  )
  if (!(scopes.everything && scopes.files))
    return (
      <div className="grid gap-1 rounded-md border border-border p-2.5 text-sm" data-scope-only={scope}>
        <span>
          <span className="text-muted-foreground">{t('restore.scopeLabel')}: </span>
          <span className="font-medium">{label(scope)}</span>
        </span>
        {scope === 'files' && warning}
        {scopes.reason !== null && (
          <span className="text-muted-foreground text-xs" data-scope-why>
            {t(REASON_KEY[scopes.reason])}
          </span>
        )}
      </div>
    )
  return (
    <div role="radiogroup" aria-label={t('restore.scopeLabel')} className="grid gap-2" data-scope-choice>
      {(['everything', 'files'] as const).map((s) => (
        <label
          key={s}
          className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary"
          data-scope-option={s}
        >
          <input
            type="radio"
            name="tracy-restore-scope"
            value={s}
            checked={scope === s}
            onChange={() => onScope(s)}
            className="mt-0.5"
          />
          <span className="grid">
            <span className="font-medium">{label(s)}</span>
            {s === 'files' && warning}
          </span>
        </label>
      ))}
    </div>
  )
}

export function RestoreBackupDialog({
  siteKey,
  siteName = siteKey,
  backup,
  name,
  scopes,
  time,
  onClose,
  onDone,
  t
}: {
  siteKey: string
  /** The name the site is shown by (`siteNameFor`); the key while it is not known. */
  siteName?: string
  backup: BackupPoint
  /** How the backup is named on screen (`backupName`). */
  name: string
  scopes: ReturnType<typeof restoreScopes>
  time: { absolute: (iso: string) => string }
  onClose: () => void
  /** Told once the server answered anything but a refusal, so the list and the backups read again. */
  onDone: () => void
  t: Translate
}): JSX.Element {
  const [scope, setScope] = useState<RestoreScope>(
    scopes.everything || scopes.content ? 'everything' : 'files'
  )
  // The content in the window decides what a close means (a restore under way holds it open).
  const closing = useRef<(open: boolean) => void>(() => onClose())
  const Inside: DialogFrame = useCallback(({ onOpenChange, children }) => {
    closing.current = onOpenChange
    return <>{children}</>
  }, [])
  // EmDash: its one Restore content… has no choice step.
  const choice = scopes.content ? undefined : (
    <ScopeChoice scope={scope} scopes={scopes} onScope={setScope} t={t} />
  )
  return (
    <Dialog open onOpenChange={(open) => closing.current(open)}>
      {scope === 'files' ? (
        <RestoreFilesDialog
          siteKey={siteKey}
          siteName={siteName}
          backup={backup}
          name={name}
          onClose={onClose}
          onDone={onDone}
          Frame={Inside}
          choice={choice}
          t={t}
        />
      ) : (
        <RestoreEverythingDialog
          siteKey={siteKey}
          siteName={siteName}
          backup={backup}
          time={time}
          onClose={onClose}
          onSettled={onDone}
          Frame={Inside}
          choice={choice}
          t={t}
        />
      )}
    </Dialog>
  )
}
