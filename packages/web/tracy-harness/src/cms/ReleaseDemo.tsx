/**
 * The demo of one release on this server, drawn in the template page's Design Inspiration tab
 * beside Status and Content contract (it was the "Demo on this server" line of the removed
 * Releases tab, moved as it was).
 *
 * The press is the Quickstarts list's own (`installDemo`, with the badge, onto the machine the demo
 * is on or the default one). Choosing or moving the machine stays on the Demos screen, so no server
 * picker is drawn here.
 *
 * 🔒 THE SERVER'S JOB IS THE ONE TRUTH OF "BUSY", AND ITS END REFRESHES THE PAGE. While the
 * release's latest demo job is in flight the press is off and reads "Installing…": the poll's
 * answer when this row follows the job, else the row's own latest job (`inFlightJobOf`). A job
 * this row did not start — another tab, a reload, the CMS chip switched away and back, which
 * remounts this row — is followed again from the row, never forgotten. When the job settles the
 * page is told (`onChanged`), so the problems, their counts, the tab dots and the header Publish
 * are read again from the one list they all come from (Akemi, 11/10/2026: the "Demo is out of
 * date" problem stayed until F5).
 *
 * 🔒 READ ON THE PAGE'S OWN TRIGGER. `readKey` is the page's read generation (`Templates.tsx`):
 * each time the page reads its list again (an action, the person coming back to the browser tab),
 * this row reads its demo again too, so the row and the Problems panel are never out of step. A
 * read already out answers for a new generation: no second request.
 */
import { Button } from '@tracy/ui'
import { Check, ExternalLink, Globe, Rocket } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { useT } from '../i18n'
import {
  DemoAction,
  DemoLoadError,
  type DemoRow,
  DemoState,
  fetchDemos,
  inFlightJobOf,
  installDemo,
  removeDemo,
  useDemoJob
} from './Demos'
import { staleCopyInTheWay } from './demo-failure-guides'
import { FailedNotes, FailedStatus } from './ReleaseDemoFailed'

export function ReleaseDemo({
  tag,
  releaseVersion,
  onBehind,
  onChanged,
  readKey = 0,
  waitReason = null
}: {
  tag: string
  releaseVersion: string | null
  /** Told whether the live demo runs another version than the release (the same test as DemoAction's Update). */
  onBehind?: (behind: boolean) => void
  /** Told when a demo job of this release settles: what the page reads about the release changed. */
  onChanged?: () => void
  /** The page's read generation: a new value reads the demo again, with the page's list. */
  readKey?: number
  /**
   * Why the road holds the demo back (its step waits for the content contract, which may make a
   * new version; Akemi, 11/10/2026). Install demo and Retry install are then off with this as
   * their tooltip; a live demo's Update stays on.
   */
  waitReason?: string | null
}) {
  const t = useT()
  // undefined = still reading; null = this server lists no demo row for the release.
  const [demo, setDemo] = useState<DemoRow | null | undefined>(undefined)
  const [writable, setWritable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A read of the demo list that failed: said in words, beside the last state known, never instead.
  const [loadFailed, setLoadFailed] = useState<{ status: number | null } | null>(null)

  // The jobs this row already follows, so a read of the row does not start a second poll of one.
  const followed = useRef(new Set<string>())
  const changed = useRef(onChanged)
  changed.current = onChanged

  const load = async () => {
    try {
      const d = await fetchDemos()
      setLoadFailed(null)
      setWritable(d.writable)
      const row = d.demos.find((r) => r.tag === tag) ?? null
      setDemo(row)
      const running = row ? inFlightJobOf(row) : undefined
      if (running && !followed.current.has(running.jobId)) {
        followed.current.add(running.jobId)
        follow(tag, running.jobId, running.kind, running)
      }
    } catch (e) {
      // A server with no demo host still shows the rest of the card; a read that fails after one
      // that worked keeps what that one said.
      setDemo((known) => (known === undefined ? null : known))
      setLoadFailed({ status: e instanceof DemoLoadError ? e.status : null })
    }
  }
  // True while a read of the demo list is out, so a new read generation shares it.
  const reading = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one read per release and page read generation; the component is keyed by tag.
  useEffect(() => {
    if (reading.current) return
    reading.current = true
    void load().finally(() => {
      reading.current = false
    })
  }, [readKey])
  const { following, follow } = useDemoJob(() => {
    void load()
    changed.current?.()
  })

  const deployed = demo?.deployed
  const behind = Boolean(deployed?.live && releaseVersion && deployed.version !== releaseVersion)
  // biome-ignore lint/correctness/useExhaustiveDependencies: tells the page only when the answer changes.
  useEffect(() => {
    if (demo !== undefined) onBehind?.(behind)
  }, [demo, behind])

  const press = async () => {
    setError(null)
    const started = await installDemo(tag, undefined, true, true)
    if ('error' in started) {
      setError(started.error)
      return
    }
    if (started.warning) setError(started.warning)
    followed.current.add(started.jobId)
    follow(tag, started.jobId)
    await load()
  }

  // Remove, the Demos screen's own press: the same DELETE door, followed as a removal.
  const remove = async () => {
    setError(null)
    const started = await removeDemo(tag)
    if ('error' in started) {
      setError(started.error)
      return
    }
    followed.current.add(started.jobId)
    follow(tag, started.jobId, 'remove')
    await load()
  }

  if (demo === undefined)
    return <span className="text-muted-foreground text-xs">{t('cms-demos.release.reading')}</span>
  // The poll's answer once there is one; until then the row's own latest job, if still in flight.
  const job = following[tag] ?? (demo ? inFlightJobOf(demo) : undefined)
  // A live demo with no job running reads as URL, current version, latest version and one press.
  const live = deployed?.live && !(job && !job.live) ? deployed : null
  const inFlight = Boolean(job && !job.live && !job.removed && job.state !== 'failed' && !job.error)
  // The last job failed and nothing runs now: the row says so in two words, the rest goes under it.
  const failed = Boolean(demo && !live && deployed?.state === 'failed' && !inFlight)
  // 🔒 REMOVE ONLY WHERE THE FAILURE ASKS FOR IT (11/10/2026). A provision that died on a copy an
  // older attempt left in the label's directory is passed by Remove, then Install demo; the guide
  // under the row says so (`demo-failure-guides.ts`), so the press it names is drawn beside it.
  const offerRemove = failed && staleCopyInTheWay(deployed?.reason)
  // An update that stopped while fetching the new release: nothing came down, so the row still
  // shows the live demo, and says under it why the new version is not there (25/10/2026).
  const updateStopped = Boolean(live && deployed?.kind === 'prefetch' && deployed.state === 'failed')
  const loadNote = loadFailed ? (
    <span className="text-destructive text-xs" data-demo-load-failed={loadFailed.status ?? ''}>
      {loadFailed.status
        ? t('cms-demos.release.loadFailedStatus', { status: loadFailed.status })
        : t('cms-demos.release.loadFailed')}{' '}
      <button
        type="button"
        className="rounded-sm border border-transparent underline underline-offset-2 outline-none hover:no-underline focus-visible:border-ring"
        data-demo-retry-load=""
        onClick={() => void load()}
      >
        {t('cms-demos.release.retry')}
      </button>
    </span>
  ) : null
  const errorNote = error ? <span className="text-destructive text-xs">{error}</span> : null
  if (!demo)
    return (
      <div className="flex flex-col gap-1.5" data-release-demo={tag}>
        {error || loadFailed ? null : (
          <span className="text-muted-foreground text-sm">{t('cms-demos.release.none')}</span>
        )}
        {loadNote}
        {errorNote}
      </div>
    )

  // 🔒 ONE ROW LAYOUT FOR EVERY STATE (Akemi, 11/10/2026). Live, failed, installing and not
  // installed all read as four columns: what the demo is (its URL, or its state), the version it
  // runs or tried, the release's latest version, and the press at the right, same size and spot.
  const version = (v: string | null | undefined) =>
    v ? (
      <span className="font-mono text-sm">{v}</span>
    ) : (
      <span className="text-muted-foreground text-sm">{t('cms-demos.release.noVersion')}</span>
    )
  let first: { label: string; cell: ReactNode }
  if (live) {
    const host = live.address.replace(/^https?:\/\//, '').replace(/\/$/, '')
    first = {
      label: t('cms-demos.release.url'),
      cell: (
        <a
          href={live.address}
          title={live.address}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm border border-transparent text-sm underline-offset-2 outline-none hover:underline focus-visible:border-ring"
        >
          <Globe className="size-3.5 flex-none text-muted-foreground" />
          <span className="truncate">{host}</span>
          <ExternalLink className="size-3 flex-none text-muted-foreground" />
        </a>
      )
    }
  } else
    first = {
      label: t('cms-demos.release.status'),
      cell: failed ? (
        <FailedStatus />
      ) : (
        // The shared one-line state, at the row's own text size.
        <span className="min-w-0 [&>span]:text-sm">
          <DemoState row={demo} job={job} />
        </span>
      )
    }
  const second = failed
    ? { label: t('cms-demos.release.triedVersion'), cell: version(deployed?.version) }
    : {
        label: t('cms-demos.release.currentVersion'),
        cell: version(deployed?.live ? deployed.version : null)
      }
  // Up to date is a state, not a press: nothing to update, so the button cannot be pressed.
  const action =
    live && !behind ? (
      <Button size="sm" variant="outline" disabled>
        <Check className="size-3.5" />
        {t('cms-demos.release.upToDate')}
      </Button>
    ) : !live && !inFlight && waitReason ? (
      // A disabled button takes no pointer, so the reason hangs on its wrapper.
      <span data-road-control="demo-install" title={waitReason} data-demo-waiting="">
        <Button size="sm" disabled>
          <Rocket size={14} />
          {failed ? t('cms-demos.action.retryInstall') : t('cms-demos.action.installDemo')}
        </Button>
      </span>
    ) : (
      // Go there on the Road to live focuses this press (`data-road-control`).
      <span data-road-control="demo-install">
        <DemoAction
          row={demo}
          job={job}
          writable={writable}
          releaseVersion={releaseVersion}
          onPress={press}
          onRemove={offerRemove || job?.kind === 'remove' ? remove : undefined}
        />
      </span>
    )
  const label = (text: string) => <span className="text-muted-foreground text-xs">{text}</span>

  return (
    <div
      className="flex flex-col gap-1.5"
      data-release-demo={tag}
      data-release-demo-state={live ? 'live' : failed ? 'failed' : inFlight ? 'installing' : 'idle'}
    >
      <div className="grid grid-cols-[minmax(0,2fr)_auto_auto_auto] items-end gap-x-8 gap-y-1">
        {label(first.label)}
        {label(second.label)}
        {label(t('cms-demos.release.latestVersion'))}
        <span />
        <span className="flex min-h-7 min-w-0 items-center">{first.cell}</span>
        <span className="flex min-h-7 items-center">{second.cell}</span>
        <span className="flex min-h-7 items-center">{version(releaseVersion)}</span>
        <span className="flex justify-end">{action}</span>
      </div>
      {failed ? <FailedNotes row={demo} /> : null}
      {updateStopped ? (
        <>
          <span className="text-destructive text-xs" data-demo-update-stopped="">
            {deployed?.version
              ? t('cms-demos.release.updateStopped', { version: deployed.version })
              : t('cms-demos.release.updateStoppedCurrent')}
          </span>
          <FailedNotes row={demo} />
        </>
      ) : null}
      {loadNote}
      {errorNote}
    </div>
  )
}
