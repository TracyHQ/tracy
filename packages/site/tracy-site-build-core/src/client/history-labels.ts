/**
 * How the Build tab's Changes view names one row of the site's history.
 *
 * A backup is named the way Site changes names it ("Initial backup", "Backup 3"), never by its tag
 * number (`v3`). v1 is the site as built, whatever its tag message says: sites set up before
 * 03/10/2026 carry "Initial release" there, and the tag is data that stays. The point Tracy takes
 * just before a restore is said in the reader's language, not in the script's English.
 */
import type { BackupsRow } from '../../../../core/tracy-core/src/site-tabs/api'
import type { Translate } from './strings'

/** The tag message `webroot-backup.sh` writes for that point (`backup-list.ts` reads the same). */
const BEFORE_RESTORE = /Before restore to Backup (\d+)/

export function historyLabels(row: BackupsRow, t: Translate): { title: string; badge: string } {
  if (row.kind !== 'backup') return { title: row.title, badge: t(`workspace.kind.${row.kind}`) }
  if (row.version === 1)
    return { title: t('workspace.backup.initialTitle'), badge: t('workspace.backup.initial') }
  const before = row.auto === 'pre-restore' ? BEFORE_RESTORE.exec(row.title) : null
  return {
    title: before ? t('workspace.backup.beforeRestore', { m: Number(before[1]) }) : row.title,
    badge: t('workspace.kind.backup', { n: row.version })
  }
}
