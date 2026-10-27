/**
 * The files of one moment (one commit), as an opened Site changes event lists them: read from the
 * host the first time the row opens (one job per opened row, not per row), grouped by zone when the
 * host names zones, cut after 4, then "+ N more". Its pure half is `moment-list.ts`
 * (`fileGroups`, `splitExcluded`).
 */
import { type JSX, useCallback, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { cn, useTabLoading } from '@tracy/ui'

import type { Translate } from '../team/translate'
import { type MomentFile, readMomentFiles, ZONE_ORDER } from './api'
import { fileGroups, splitExcluded } from './moment-list'

/** Files shown before "+ N more". */
const FIRST_FILES = 4

// Utilities whose `dark:` follows dsh's own switch.
const STATUS_CLASS: Record<string, string> = {
  added: 'text-green-600 dark:text-green-400',
  modified: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-red-600 dark:text-red-400'
}
const STATUS_LETTER: Record<string, string> = { added: 'A', modified: 'M', deleted: 'D' }

type Files =
  | { state: 'idle' | 'loading' | 'failed' }
  | { state: 'ready'; files: MomentFile[]; truncated: boolean }

/**
 * The host lists at most 500 files of one moment (`truncated`): the list then says how many of the
 * moment's `count` it holds, so the first 500 never read as all of them (dev round 02/10: 500 of 1277).
 */
export function MomentFiles({
  siteKey,
  sha,
  count,
  onOpenFile,
  t
}: {
  siteKey: string
  sha: string
  count: number
  onOpenFile?: (path: string, sha: string) => void
  t: Translate
}): JSX.Element | null {
  const [files, setFiles] = useState<Files>({ state: 'idle' })
  const [all, setAll] = useState(false)
  const read = useCallback(async () => {
    setFiles({ state: 'loading' })
    try {
      const answer = await readMomentFiles(siteKey, sha)
      setFiles({
        state: 'ready',
        files: Array.isArray(answer.files) ? answer.files : [],
        truncated: answer.truncated === true
      })
    } catch {
      setFiles({ state: 'failed' })
    }
  }, [siteKey, sha])
  useEffect(() => {
    if (files.state === 'idle') void read()
  }, [files.state, read])
  useTabLoading(files.state === 'loading')

  if (files.state === 'failed')
    return (
      <p className="tv-moment-lead">
        {t('moment.filesFailed')}{' '}
        <button type="button" className="tv-moment-link" onClick={() => void read()}>
          {t('action.retry')}
        </button>
      </p>
    )
  if (files.state !== 'ready') return null
  // Files the host flags `excluded` (a CMS cache in a moment older than the exclude list) are not
  // Tracy's work: one quiet count under the list, never a line each (Q4).
  const { shown: listed, excluded } = splitExcluded(files.files)
  const limit = all ? listed.length : FIRST_FILES
  let left = limit
  const groups = fileGroups(listed, ZONE_ORDER)
    .map(({ zone, files: inZone }) => {
      const shown = inZone.slice(0, Math.max(0, left))
      left -= shown.length
      return { zone, files: shown }
    })
    .filter((g) => g.files.length > 0)
  const hidden = listed.length - Math.min(limit, listed.length)
  return (
    <div>
      {groups.map(({ zone, files: inZone }) => (
        <div key={zone ?? 'all'}>
          {zone !== null && (
            <div className="tv-moment-zone">
              {zone === 'core' && <TriangleAlert className="size-3 text-amber-500" aria-hidden="true" />}
              {t(`zone.${zone}`)}
            </div>
          )}
          {inZone.map((f) => {
            const clickable = onOpenFile !== undefined && f.status !== 'deleted'
            return (
              <button
                type="button"
                key={f.path}
                disabled={!clickable}
                onClick={() => onOpenFile?.(f.path, sha)}
                title={f.status === 'deleted' ? t('changes.deletedNoDiff') : f.path}
                className="tv-moment-file"
                data-clickable={clickable || undefined}
              >
                <span className={cn('tv-file-letter', STATUS_CLASS[f.status])}>
                  {STATUS_LETTER[f.status] ?? '·'}
                </span>
                <span className="tv-file-path">{f.path}</span>
                <span className="tv-file-lines">
                  {f.additions ? <span className={STATUS_CLASS.added}>+{f.additions}</span> : null}{' '}
                  {f.deletions ? <span className={STATUS_CLASS.deleted}>−{f.deletions}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className="tv-moment-more" onClick={() => setAll(true)}>
          {t('moment.moreFiles', { count: hidden })}
        </button>
      )}
      {excluded > 0 && (
        <p className="tv-moment-lead tv-activity-gap" title={t('moment.excludedHint')}>
          {excluded === 1 ? t('moment.excludedOne') : t('moment.excluded', { count: excluded })}
        </p>
      )}
      {files.truncated && (
        <p className="tv-moment-lead tv-activity-gap">
          {count > files.files.length
            ? t('moment.filesShowing', { shown: files.files.length, count })
            : t('moment.filesNotListed')}
        </p>
      )}
    </div>
  )
}
