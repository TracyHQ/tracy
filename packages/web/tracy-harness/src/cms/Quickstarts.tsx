/**
 * Quickstarts — every release on `joomlart-products` as this server last read it, and one release with
 * the questionnaires it can be asked with (ADR 0017).
 *
 * WHY THIS SCREEN IS NOT PART OF THE SNAPSHOT. The other screens describe a TREE at a commit, and
 * carry the ref that produced them. A release list is in no tree: it is what GitHub has right now,
 * read a few minutes ago. So this one carries "read at" instead of a ref, and a Refresh press —
 * and it draws the last reading when GitHub cannot be reached, because an empty list here would
 * read as "there are no quickstarts", which is the one thing it must never say by accident.
 *
 * THREE STATE COLUMNS, THREE OWNERS (Lee, 15/09): what KIND of release it is (the tag says), how
 * GitHub holds it (published, pre-release, draft), and whether Tracy can read it (ready, no file,
 * a refused file). One "status" column hid which of the three a row was answering.
 */
import {
  Badge,
  Button,
  buttonVariants,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn
} from '@tracy/ui'
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CMS_LABEL, type Cms } from './App'
import { CreateSetting } from './CreateSetting'
import {
  DemoAction,
  type DemoRow,
  type DemoServer,
  DemoState,
  fetchDemos,
  installDemo,
  useDemoJob
} from './Demos'
import {
  DesignInspirationBadge,
  DesignInspirationCell,
  DesignInspirationPanel,
  type InspirationCell
} from './DesignInspiration'
import type { RoadStep } from './problem-guides'
import { thrownText } from './response-error'
import { Trans, tr, useT } from '../i18n'

export type Tracy = 'ready' | 'no-setting' | 'invalid'
export type GithubState = 'published' | 'prerelease' | 'draft'

export interface ReleaseRow {
  tag: string
  name: string
  label: string | null
  kind: 'quickstart' | 'design-pack'
  github: GithubState
  tracy: Tracy
  reason: string | null
  choosable: boolean
  platform: Cms | null
  platformFromTag: boolean
  version: string | null
  cms: string | null
  /** The template this release's install file names, normalised. Not the id its pictures live under. */
  template: string | null
  /**
   * The id this release's card and pictures live under on the server (`cardIdOf`): the customer
   * card's, which may differ from `template` (`tracy-base/wp7` names "tracy-base" and is on `tracy`).
   */
  cardTemplate?: string | null
  publishedAt: string | null
  /** Where this release stands on Design inspiration, decided by the server for the whole page. */
  inspiration: InspirationCell
  /**
   * Whether this release is bound to a content contract (the publish door's NO_CONTRACT reads the
   * same status). Optional: a server older than 10/10/2026 does not send it.
   */
  contract?: {
    state: 'exact' | 'lower' | 'none' | 'not-applicable'
    profile: string | null
    version: string | null
  }
  /** Why its saved card would stay off Design inspiration once published (NOT_SHOWABLE), else null. */
  notShowable?: string | null
  /**
   * Whether this release's card is the one customers see for its template (`cardSources` on the
   * server, the rule `GET /api/templates` follows). Optional: an older server does not send it.
   */
  cardSource?: boolean
  /**
   * The road to live (`apps/tracy-web/src/lib/road-to-live.js`): the seven steps of this release,
   * each `{ step, state, code, params, blockedBy? }`; null for a design pack. The Templates page
   * reads every count, dot and Publish rule from it.
   */
  road?: RoadStep[] | null
}

interface Listing {
  readAt: string | null
  canRefresh: boolean
  cannotRefreshReason: string | null
  writable: boolean
  counts: Record<string, number>
  releases: ReleaseRow[]
}

/** The file a release carries for Tracy: a file name, shown verbatim in every language. */
const SETTING_FILE = 'tracy_setting.json'

/** Dictionary keys, resolved at render so the label follows the language on screen. */
const TRACY_LABEL: Record<Tracy, string> = {
  ready: 'cms-quickstarts.tracy.ready',
  'no-setting': 'cms-quickstarts.tracy.noSetting',
  invalid: 'cms-quickstarts.tracy.invalid'
}
const GITHUB_LABEL: Record<GithubState, string> = {
  published: 'cms-quickstarts.github.published',
  prerelease: 'cms-quickstarts.github.prerelease',
  draft: 'cms-quickstarts.github.draft'
}

export function TracyBadge({ state, label }: { state: Tracy; label?: string }) {
  const t = useT()
  const tone: Record<Tracy, string> = {
    ready: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    'no-setting': 'border-border bg-muted text-muted-foreground',
    invalid: 'border-destructive/40 bg-destructive/10 text-destructive'
  }
  return (
    <Badge variant="outline" className={cn('font-normal', tone[state])}>
      {label ?? t(TRACY_LABEL[state])}
    </Badge>
  )
}

export function GithubBadge({ state }: { state: GithubState }) {
  const t = useT()
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal',
        state === 'draft'
          ? 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {t(GITHUB_LABEL[state])}
    </Badge>
  )
}

export const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')}Z` : '—')

export function Quickstarts({
  cms,
  setCms,
  tag: openTag,
  onOpen,
  inspirationHref
}: {
  cms: Cms | 'all'
  setCms: (cms: Cms | 'all') => void
  /** Which quickstart is open — from the ADDRESS, so a link carries it. */
  tag: string | null
  /** No longer read: the question-set editor it named was removed (10/10/2026). */
  set?: string | null
  onOpen: (tag: string | null) => void
  /** Where the Design inspiration screen is, with this address's env and CMS. */
  inspirationHref: string
}) {
  const t = useT()
  const [listing, setListing] = useState<Listing | null>(null)
  /** The public demo of each installable release, by tag — a live reading like the list itself. */
  const [demos, setDemos] = useState<{
    writable: boolean
    byTag: Record<string, DemoRow>
    servers: DemoServer[]
    defaultServer: string | null
  } | null>(null)
  /** The machine each release's demo goes on next — a person's pick over where it already is. */
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<'all' | 'ready' | 'missing'>('all')
  const [term, setTerm] = useState('')
  /** Which row is PEEKING — the chevron's inline look at the customer's form, nothing more. */

  const load = async () => {
    setError(null)
    try {
      const response = await fetch('/api/ops/quickstarts', { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(tr('cms-quickstarts.error.door', { status: response.status }))
      setListing(await response.json())
    } catch (e) {
      setError(thrownText(e))
    }
    // Demos are a second door: a server with no demo host still lists its quickstarts in full.
    try {
      const d = await fetchDemos()
      setDemos({
        writable: d.writable,
        byTag: Object.fromEntries(d.demos.map((row) => [row.tag, row])),
        servers: d.servers ?? [],
        defaultServer: d.defaultServer ?? null
      })
    } catch {
      setDemos(null)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const { following, follow } = useDemoJob(() => void load())

  const serverFor = (tag: string) =>
    picks[tag] ?? demos?.byTag[tag]?.deployed?.host ?? demos?.defaultServer ?? undefined

  const pressDemo = async (tag: string) => {
    setError(null)
    // The Quickstarts screen installs WITH the badge — the with/without press lives on the Demos
    // screen, where the row is the demo rather than the release. The server is chosen here too,
    // since this is where a person decides which release gets a demo (Brian, 22/09).
    const multi = (demos?.servers.length ?? 0) > 1
    const started = await installDemo(tag, undefined, true, true, multi ? serverFor(tag) : undefined)
    if ('error' in started) {
      setError(started.error)
      return
    }
    if (started.warning) setError(started.warning)
    setPicks(({ [tag]: _done, ...rest }) => rest)
    follow(tag, started.jobId)
    void load()
  }

  const refresh = async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/ops/quickstarts/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        setError(body.reason ?? tr('cms-quickstarts.error.refresh', { status: response.status }))
      await load()
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(() => {
    const all = listing?.releases ?? []
    const needle = term.trim().toLowerCase()
    return all.filter((r) => {
      if (cms !== 'all' && r.platform !== cms) return false
      if (show === 'ready' && r.tracy !== 'ready') return false
      if (show === 'missing' && r.tracy === 'ready') return false
      if (needle && !`${r.tag} ${r.name} ${r.label ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [listing, cms, show, term])

  const inCms = (listing?.releases ?? []).filter((r) => cms === 'all' || r.platform === cms)
  const counts = {
    ready: inCms.filter((r) => r.tracy === 'ready').length,
    missing: inCms.filter((r) => r.tracy !== 'ready').length
  }

  if (openTag)
    return (
      <QuickstartDetail tag={openTag} writable={Boolean(listing?.writable)} onBack={() => onOpen(null)} />
    )

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-semibold text-lg tracking-tight">{t('cms-quickstarts.list.title')}</h1>
          {/* The CMS is chosen once, beside the title, and everything below follows it. */}
          <div
            className="flex flex-none gap-1 rounded-lg bg-muted p-[3px]"
            role="group"
            aria-label={t('cms-quickstarts.list.cmsGroup')}
          >
            {(['all', 'joomla', 'wordpress', 'emdash'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setCms(id)}
                aria-pressed={id === cms}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                  id === cms
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {id === 'all' ? t('cms-quickstarts.list.all') : CMS_LABEL[id]}
                {listing ? ` · ${listing.counts[id] ?? 0}` : ''}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-0.5 max-w-3xl text-muted-foreground text-sm">
          <Trans
            i18nKey="cms-quickstarts.list.intro"
            values={{ repo: 'JoomlArt-Products/joomlart-products', file: SETTING_FILE }}
            components={{ code: <span className="font-mono" /> }}
          />
        </p>
      </div>

      {/* Which cards customers see — and the design-system library switch — live on their own
          screen since 04/10/2026; this list keeps each release's state in its column. */}
      <p className="text-muted-foreground text-xs">
        {t('cms-quickstarts.list.inspirationLead')}{' '}
        <a href={inspirationHref} className="text-foreground underline underline-offset-2">
          {t('cms-quickstarts.list.openInspiration')}
        </a>
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          <Trans
            i18nKey="cms-quickstarts.list.read"
            values={{ when: when(listing?.readAt ?? null) }}
            components={{ code: <span className="font-mono text-foreground/80" /> }}
          />
        </span>
        {listing && !listing.canRefresh ? (
          <span className="text-destructive">{listing.cannotRefreshReason}</span>
        ) : null}
        {error ? <span className="text-destructive">{error}</span> : null}
        <Button
          size="sm"
          variant="outline"
          className="ms-auto"
          onClick={() => void refresh()}
          disabled={busy || !listing?.canRefresh || !listing?.writable}
          title={
            listing?.canRefresh
              ? t('cms-quickstarts.list.refreshTitle')
              : (listing?.cannotRefreshReason ?? '')
          }
        >
          <RefreshCw size={14} />
          {busy ? t('cms-quickstarts.list.reading') : t('cms-quickstarts.list.refresh')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h2 className="font-medium text-sm">
            {cms === 'all'
              ? t('cms-quickstarts.list.releases')
              : t('cms-quickstarts.list.cmsReleases', { cms: CMS_LABEL[cms] })}{' '}
            · {rows.length}
          </h2>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <div
              className="flex flex-none gap-1 rounded-lg bg-muted p-[3px]"
              role="group"
              aria-label={t('cms-quickstarts.list.showGroup')}
            >
              {(
                [
                  ['all', t('cms-quickstarts.list.all')],
                  ['ready', t('cms-quickstarts.list.ready', { n: counts.ready })],
                  ['missing', t('cms-quickstarts.list.needsFile', { n: counts.missing })]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setShow(id)}
                  aria-pressed={id === show}
                  className={cn(
                    'rounded-md px-3 py-1 font-medium text-sm transition-colors',
                    id === show ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-[14rem] pl-7"
                placeholder={t('cms-quickstarts.list.search')}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                aria-label={t('cms-quickstarts.list.searchLabel')}
              />
            </div>
          </div>
        </div>
        {/* 🔒 EVERY COLUMN IS AS WIDE AS ITS CONTENT, and what the frame has left over is shared by all
            of them (the browser's own table layout), not handed to one. Too narrow a frame scrolls
            sideways instead of cutting text. What keeps a column honest is that nothing in it can
            run long: before 30/09 a CLI dump under one failed demo made Demo 2 358 px and the table
            3 727 px in a 1 021 px frame. Anything that can run long is capped where it is drawn. */}
        <div className="overflow-x-auto border-border border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cms-quickstarts.col.quickstart')}</TableHead>
                {/* One CMS picked above → every row would say the same word. */}
                {cms === 'all' ? <TableHead>{t('cms-quickstarts.col.cms')}</TableHead> : null}
                <TableHead>{t('cms-quickstarts.col.status')}</TableHead>
                <TableHead>{t('cms-quickstarts.col.demo')}</TableHead>
                <TableHead>{t('cms-quickstarts.col.onTracy')}</TableHead>
                <TableHead>{t('cms-quickstarts.col.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <Fragment key={r.tag}>
                  <TableRow className="cursor-pointer" onClick={() => onOpen(r.tag)} data-tag={r.tag}>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        {r.label ?? r.name}
                        {/* Most rows are quickstarts; only the exception is named. */}
                        {r.kind === 'design-pack' ? (
                          <Badge variant="outline" className="font-normal">
                            {t('cms-quickstarts.row.designPack')}
                          </Badge>
                        ) : null}
                      </span>
                      <span
                        className="block font-mono text-[11px] text-muted-foreground"
                        title={t('cms-quickstarts.row.tagTip', {
                          tag: r.tag,
                          version: r.version ?? '—',
                          when: when(r.publishedAt)
                        })}
                      >
                        {r.tag} · {r.version ?? '—'} · {r.publishedAt ? r.publishedAt.slice(0, 10) : '—'}
                      </span>
                    </TableCell>
                    {cms === 'all' ? (
                      <TableCell className="text-xs">
                        {r.platform === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : r.platformFromTag ? (
                          <span className="text-muted-foreground" title={t('cms-quickstarts.row.guessed')}>
                            {CMS_LABEL[r.platform]}?
                          </span>
                        ) : (
                          CMS_LABEL[r.platform]
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {/* GitHub's state over Tracy's: two readings of one release, one column. */}
                      <div className="flex flex-col items-start gap-1">
                        <GithubBadge state={r.github} />
                        <div className="flex flex-wrap items-center gap-2">
                          <TracyBadge state={r.tracy} />
                          {/* The only place a missing file can be created from the list. A design
                              pack needs none, and an invalid one needs a look, not a second file. */}
                          {r.tracy === 'no-setting' && r.kind === 'quickstart' ? (
                            <CreateSetting
                              tag={r.tag}
                              writable={Boolean(listing?.writable)}
                              onWritten={() => void load()}
                            />
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {demos?.byTag[r.tag] ? (
                        // The state over its controls, not beside them: side by side the three made
                        // Demo 656 px on their own (measured 30/09), more than half the frame.
                        <div className="flex flex-col items-start gap-1.5">
                          <DemoState row={demos.byTag[r.tag]} job={following[r.tag]} />
                          <DemoAction
                            row={demos.byTag[r.tag]}
                            job={following[r.tag]}
                            writable={demos.writable}
                            releaseVersion={r.version}
                            servers={demos.servers}
                            server={serverFor(r.tag)}
                            onServerChange={(next) => setPicks((was) => ({ ...was, [r.tag]: next }))}
                            onPress={() => pressDemo(r.tag)}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DesignInspirationBadge cell={r.inspiration} compact />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DesignInspirationCell
                        release={r}
                        cell={r.inspiration}
                        writable={Boolean(listing?.writable)}
                        onChanged={() => void load()}
                      />
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
          <Trans
            i18nKey="cms-quickstarts.list.footer"
            values={{ file: SETTING_FILE }}
            components={{ code: <span className="font-mono" /> }}
          />
        </p>
      </div>
    </div>
  )
}

type Tab = 'setting' | 'inspiration'

/**
 * One quickstart, on the page: what it declares, and its Design inspiration card.
 *
 * Two tabs rather than one long page, because they answer two questions with two owners — what a
 * build INSTALLS is the release's business, what customers are SHOWN is this server's.
 */
function QuickstartDetail({ tag, writable, onBack }: { tag: string; writable: boolean; onBack: () => void }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('setting')
  const [detail, setDetail] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // The quickstart on screen. `load` is handed to the panels below as `onChanged`, and a write
  // they sent under another quickstart calls the `load` of THAT render when it answers — so it
  // reads the ref, never the `tag` it was created with, and only the newest read is applied.
  const shownTag = useRef(tag)
  const loads = useRef(0)
  const load = async () => {
    const asked = shownTag.current
    loads.current += 1
    const mine = loads.current
    const current = () => loads.current === mine && shownTag.current === asked
    setError(null)
    try {
      const response = await fetch(`/api/ops/quickstart?tag=${encodeURIComponent(asked)}`, {
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(tr('cms-quickstarts.error.door', { status: response.status }))
      const body = await response.json()
      if (current()) setDetail(body)
    } catch (e) {
      if (current()) setError(thrownText(e))
    }
  }
  useEffect(() => {
    if (shownTag.current !== tag) {
      // Another quickstart: the card of the last one is not its own.
      shownTag.current = tag
      setDetail(null)
    }
    void load()
  }, [tag])

  if (error) return <p className="px-6 py-4 text-destructive text-sm">{error}</p>
  if (!detail)
    return <p className="py-2 text-muted-foreground text-sm">{t('cms-quickstarts.list.reading')}</p>

  const install = detail.setting?.install ?? {}
  // The release's Design inspiration card, in whichever of its two shapes it arrived: its own file
  // (`tracy_design_inspiration.json`), or the `card` block a release cut before 16/09 still carries.
  const card = detail.inspiration ?? detail.setting?.card ?? null
  const gh = `https://github.com/JoomlArt-Products/joomlart-products/releases/tag/${encodeURIComponent(tag)}`
  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ms-2">
          <ArrowLeft size={14} />
          {t('cms-quickstarts.list.title')}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-lg tracking-tight">{detail.setting?.label ?? detail.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <span className="font-mono">{tag}</span>
            <Badge variant="outline" className="font-normal">
              {detail.kind === 'design-pack'
                ? t('cms-quickstarts.row.designPack')
                : t('cms-quickstarts.detail.kindQuickstart')}
            </Badge>
            <GithubBadge state={detail.github} />
            <TracyBadge state={detail.tracy} />
            {detail.setting ? (
              <span>
                {t('cms-quickstarts.detail.cmsLine', {
                  platform: detail.platform ? CMS_LABEL[detail.platform as Cms] : '',
                  cms: detail.setting.cms,
                  version: detail.setting.version
                })}
              </span>
            ) : null}
            <span>{t('cms-quickstarts.detail.published', { when: when(detail.publishedAt) })}</span>
          </p>
        </div>
        <a
          href={gh}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLink size={14} />
          {t('cms-quickstarts.detail.openGithub')}
        </a>
      </div>

      {detail.reason ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">{detail.reason}</p>
          {/* The same press as the list's, where the missing file is actually being read about. */}
          {detail.tracy === 'no-setting' && detail.kind === 'quickstart' ? (
            <CreateSetting tag={tag} writable={writable} variant="outline" onWritten={load} />
          ) : null}
        </div>
      ) : null}

      {detail.setting ? (
        <div
          className="flex flex-none gap-1 self-start rounded-lg bg-muted p-[3px]"
          role="group"
          aria-label={t('cms-quickstarts.detail.viewGroup')}
        >
          {(
            [
              ['setting', t('cms-quickstarts.detail.tabSetting')],
              ['inspiration', t('cms-quickstarts.detail.tabInspiration')]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={id === tab}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                id === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {detail.setting && tab === 'setting' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="font-medium text-sm">
              <span className="font-mono">{SETTING_FILE}</span>
              <span className="ms-2 font-normal text-muted-foreground text-xs">
                {t('cms-quickstarts.detail.readFrom')}
              </span>
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                [
                  t('cms-quickstarts.field.platform'),
                  detail.platform ? CMS_LABEL[detail.platform as Cms] : '—'
                ],
                [t('cms-quickstarts.field.cmsVersion'), detail.setting.cms],
                [t('cms-quickstarts.field.quickstartVersion'), detail.setting.version],
                [t('cms-quickstarts.field.template'), detail.setting.template ?? '—'],
                [t('cms-quickstarts.field.languages'), (detail.setting.languages ?? []).join(', ') || '—'],
                // The card is `tracy_design_inspiration.json` since 16/09; three releases cut
                // before that still carry it inside the setting, and both count as a card until
                // they are cut again — unless Unpublish left the hidden mark on the release.
                [
                  t('cms-quickstarts.field.card'),
                  card && !detail.inspirationHidden
                    ? t('cms-quickstarts.field.cardYes', { category: card.category ?? '—' })
                    : t('cms-quickstarts.field.cardNo')
                ]
              ].map(([k, v]) => (
                <div key={String(k)} className="flex flex-col gap-0.5 border-border border-b py-1.5">
                  <dt className="font-medium text-muted-foreground">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="font-medium text-sm">
              {t('cms-quickstarts.files.title')}
              <span className="ms-2 font-normal text-muted-foreground text-xs">
                {t('cms-quickstarts.files.checked')}
              </span>
            </h3>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cms-quickstarts.files.part')}</TableHead>
                  <TableHead>{t('cms-quickstarts.files.file')}</TableHead>
                  <TableHead>{t('cms-quickstarts.files.sha')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(install).map(([part, file]: [string, any]) => (
                  <TableRow key={part}>
                    <TableCell className="font-mono text-xs">{part}</TableCell>
                    <TableCell className="font-mono text-xs">{file.file}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground" title={file.sha256}>
                      {String(file.sha256).slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {detail.setting && tab === 'inspiration' ? (
        <DesignInspirationPanel
          tag={tag}
          cell={detail.inspirationState ?? null}
          writable={writable}
          onChanged={load}
        />
      ) : null}

      {tab === 'setting' && detail.sites?.length > 0 ? (
        <div>
          <h3 className="font-medium text-sm">
            {t('cms-quickstarts.sites.title', { n: detail.sites.length })}
          </h3>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>{t('cms-quickstarts.sites.site')}</TableHead>
                <TableHead>{t('cms-quickstarts.sites.host')}</TableHead>
                <TableHead>{t('cms-quickstarts.sites.versionUsed')}</TableHead>
                <TableHead>{t('cms-quickstarts.sites.created')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.sites.map((s: any) => (
                <TableRow key={s.label}>
                  <TableCell className="font-mono text-xs">{s.label}</TableCell>
                  <TableCell className="text-xs">{s.host}</TableCell>
                  <TableCell className="font-mono text-xs">{s.version ?? '—'}</TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {when(s.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
