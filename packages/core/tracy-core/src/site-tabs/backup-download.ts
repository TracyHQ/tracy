/**
 * Download… on a backup (plan todo-backup-export, S4): who is offered it, what each refusal of the
 * door says, and when the dialog's poll stops. Pure, so `test/backup-download.test.mjs` pins it.
 */
import type { BackupExportState, BackupMay } from './api'
import type { BackupPoint } from './backup-list'

/**
 * Whether the row offers Download…: only when the server said this seat may (`may.export`, an
 * Owner — absent from an older server, so not offered) and only on a point the host can pack:
 * WordPress/Joomla (`full`) or EmDash (`content` with its app snapshot present).
 */
export const downloadable = (
  b: Pick<BackupPoint, 'capability' | 'applicationAvailable'>,
  may: BackupMay | null
): boolean =>
  may?.export === true &&
  (b.capability === 'full' || (b.capability === 'content' && b.applicationAvailable === true))

/** The strings key for a refusal of `POST /backups/:version/export`. */
export function downloadRefusalKey(status: number, code: string): string {
  if (code === 'EXPORT_IN_PROGRESS') return 'backup.download.err.busy'
  if (status === 429) return 'backup.download.err.limit'
  if (code === 'FORBIDDEN_EXPORT') return 'backup.download.err.forbidden'
  return 'backup.download.err.failed'
}

/** The states after which nothing changes by itself: the poll stops. */
export const settled = (state: BackupExportState): boolean =>
  state === 'ready' || state === 'failed' || state === 'expired'

/** A package's size in MB (2^20), one decimal, never shown as 0 for one that exists. */
export const megabytes = (bytes: number): number => Math.max(0.1, Math.round((bytes / 1048576) * 10) / 10)
