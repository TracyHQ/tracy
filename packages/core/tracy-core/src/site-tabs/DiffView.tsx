/**
 * One file's diff, in a tab, drawn by the SIDE CARD'S OWN renderer.
 *
 * The side card already knows how to draw a unified diff — that is what its git panel opens — but
 * its diff TAB asks dsh's git service, which can only see a repository inside the lane. A site's
 * webroot git lives on the fleet host and is never mounted into the container, so that tab can
 * never show these changes. Only the renderer is reusable, and from `0.17.1-tracy.25` the sidebar
 * hands it over on its service (`betterSidebar.DiffView`) rather than making a plugin bundle a
 * second copy of the whole side card.
 *
 * The text comes from `webroot-git.sh --op file-diff` through cowork-web, so what is drawn here is
 * what git says on the host — including work nobody has recorded yet.
 */
import { type JSX, useCallback, useEffect, useState } from 'react'
import { Button, useTabLoading } from '@tracy/ui'

import type { Translate } from '../team/translate'
import { readFileDiff, SiteApiError } from './api'
import { Note, type PickableSite, TabHeader } from './pieces'

/** What the host lends us. Absent on an older side card, and the fallback below covers that. */
export type DiffRenderer = (props: { diff: string; expandAll?: boolean }) => JSX.Element | null

type Load =
  | { state: 'loading' }
  | { state: 'failed'; code: string }
  | { state: 'ready'; diff: string; truncated: boolean }
  | { state: 'blocked' }

/**
 * Enough of a diff to read when the host lends no renderer: the lines, coloured. No hunk folding,
 * no side-by-side — this is the floor, not a second implementation competing with the first.
 */
function PlainDiff({ diff }: { diff: string }): JSX.Element {
  return (
    <pre className="m-0 overflow-x-auto px-3 py-2 font-mono text-[12px] leading-5">
      {diff.split('\n').map((line, i) => (
        <div
          key={`${i}-${line}`}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'text-green-600 dark:text-green-400'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'text-red-600 dark:text-red-400'
                : line.startsWith('@@')
                  ? 'text-muted-foreground'
                  : undefined
          }
        >
          {line === '' ? ' ' : line}
        </div>
      ))}
    </pre>
  )
}

export function FileDiffView({
  siteKey,
  path,
  sha,
  role,
  sites,
  onPick,
  render,
  t
}: {
  siteKey: string
  path: string
  /** The moment to show the file IN (a Site changes row); absent: since the latest backup. */
  sha?: string
  role: string | null
  sites: PickableSite[]
  onPick: (siteKey: string) => void
  /** The side card's renderer, when this version of it has one. */
  render?: DiffRenderer
  t: Translate
}): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  const read = useCallback(async () => {
    setLoad({ state: 'loading' })
    try {
      const answer = await readFileDiff(siteKey, path, sha)
      setLoad(
        answer.blocked === true
          ? { state: 'blocked' }
          : { state: 'ready', diff: answer.diff, truncated: answer.truncated }
      )
    } catch (e) {
      setLoad({ state: 'failed', code: e instanceof SiteApiError ? e.code : 'FAILED' })
    }
  }, [siteKey, path, sha])
  useEffect(() => {
    void read()
  }, [read])

  const header = (
    <>
      <TabHeader siteKey={siteKey} role={role} sites={sites} onPick={onPick} hint={path} t={t} />
      {sha !== undefined && (
        <p className="tv-diff-scope">
          <span className="tv-diff-scope-badge">{t('diff.thisMoment')}</span>
          <code title={sha}>{sha.slice(0, 7)}</code>
        </p>
      )}
    </>
  )

  // The tab's shared loading bar runs meanwhile; under the header, nothing (Akemi, 30/09).
  useTabLoading(load.state === 'loading')
  if (load.state === 'loading') return header
  if (load.state === 'failed')
    return (
      <>
        {header}
        <div className="px-3 py-4 text-muted-foreground text-sm">
          <p className="m-0">{load.code === 'NOT_SIGNED_IN' ? t('state.signedOut') : t('diff.failed')}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void read()}>
            {t('action.retry')}
          </Button>
        </div>
      </>
    )
  // A configuration file: the server names it but never reads it out (plan todo-site-changes Q1).
  if (load.state === 'blocked')
    return (
      <>
        {header}
        <div className="tv-diff-blocked" role="note">
          <p className="tv-diff-blocked-title">{t('diff.blocked')}</p>
          <p className="tv-diff-blocked-hint">{t('diff.blockedHint')}</p>
        </div>
      </>
    )
  if (load.diff.trim() === '')
    return (
      <>
        {header}
        <Note>{t('diff.empty')}</Note>
      </>
    )

  const Rendered = render
  return (
    <>
      {header}
      {load.truncated && (
        <p className="m-0 border-border border-b px-3 py-2 text-muted-foreground text-xs">
          {t('diff.truncated')}
        </p>
      )}
      {/* `expandAll`: this tab IS one file, chosen on purpose. The renderer's default keeps
          non-source files folded, which would answer a press on `.htaccess` with a row saying
          `.htaccess` (0.17.1-tracy.26). */}
      {Rendered ? <Rendered diff={load.diff} expandAll /> : <PlainDiff diff={load.diff} />}
    </>
  )
}
