/**
 * Templates — one row per template, its Joomla / WordPress / EmDash releases folded together
 * (Akemi, 10/10/2026). It replaces Design inspiration and Quickstarts in the rail: what customers on
 * this server can pick (Active) and everything else on GitHub (Disabled), in one list.
 *
 * 🔒 LIVE, NOT A REF, like both screens it folds: it reads `/api/ops/quickstarts` and
 * `/api/ops/inspiration` (`templates-model.ts`), so there is no environment picker above it.
 *
 * 🔒 THE OPEN TEMPLATE IS IN THE ADDRESS (`?template=&view=`), and its page replaces the list in
 * place. The list's tab, filters and search live in THIS component, which stays mounted while a
 * template is open, so "← Templates" lands where the person left.
 */
import {
  Badge,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PlatformGlyph,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import { ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw, Search } from 'lucide-react'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatWith, Trans, useLanguage, useT } from '../i18n'
import { fetchInspiration, type Inspiration, type Refusal } from './api'
import { LoadingRows, Panel, RefusalNotice } from './parts'
import type { ReleaseRow } from './Quickstarts'
import { relativeTime } from './relative-time'
import { thrownText } from './response-error'
import { CMS, CMS_LABEL, CMS_SCREEN_LABEL, type Cms } from './route'
import { TemplateDetail } from './TemplateDetail'
import { releaseNames, templateRows, type TemplateRow } from './templates-model'

type StatusTab = 'active' | 'disabled'

interface QuickstartListing {
  readAt: string | null
  canRefresh: boolean
  cannotRefreshReason: string | null
  writable: boolean
  /** The design system issues of the preview, once each: a kind a system causes on most templates. */
  designSystemIssues?: DesignSystemIssue[]
  releases: ReleaseRow[]
}

interface DesignSystemIssue {
  system: string
  label: string
  kind: string
  rule: string
  what: string
  fix: string
  lines: number
  of: number
  examples: string[]
}

/**
 * The preview's design system issues, once each (PR 2, 14/10/2026): a kind a system causes on most templates
 * (Moxie's border role is its text colour, so hard lines on about 30 of 44 previews) is the SYSTEM's to fix and
 * no template's Design system step counts it.
 */
function DesignSystemIssues({ issues }: { issues: DesignSystemIssue[] }): JSX.Element | null {
  const t = useT()
  if (!issues.length) return null
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border px-4 py-3"
      data-ds-system-issues=""
    >
      <h2 className="font-semibold text-sm">{t('cms-templates.dsIssues.title')}</h2>
      <p className="text-muted-foreground text-xs">{t('cms-templates.dsIssues.lead')}</p>
      <ul className="flex flex-col gap-2">
        {issues.map((i) => (
          <li
            key={`${i.system} ${i.kind}`}
            className="flex flex-col gap-0.5 text-sm"
            data-ds-system-issue={i.kind}
          >
            <span>
              <span className="font-medium">{i.label}</span>: {i.what}{' '}
              <span className="font-mono text-muted-foreground text-xs">{i.rule}</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {t('cms-templates.dsIssues.measured', { lines: i.lines, of: i.of })}
            </span>
            <span className="text-xs">{t('cms-templates.dsIssues.fix', { fix: i.fix })}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "9 Oct 2026, 08:25 UTC" in the language on screen: the exact moment, for the hover of the sync pill. */
function exactUtc(iso: string, lang: string): string {
  return `${formatWith(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }, lang)} UTC`
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

export function Templates({
  template,
  view,
  release = null,
  onOpen
}: {
  template: string | null
  view: string | null
  release?: string | null
  onOpen: (template: string | null, view?: string | null) => void
}) {
  const t = useT()
  const { lang } = useLanguage()
  const [quickstarts, setQuickstarts] = useState<QuickstartListing | null>(null)
  const [inspiration, setInspiration] = useState<Inspiration | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const [tab, setTab] = useState<StatusTab>('active')
  const [cms, setCms] = useState<Cms[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [term, setTerm] = useState('')

  // True while a read of the list is out, so a focus and a visibilitychange fired together share it.
  const reading = useRef(false)

  /**
   * 🔒 ONE LIST, READ AGAIN WHEREVER IT MAY HAVE MOVED. The quickstarts + inspiration list feeds the
   * Problems panel, the counts and the tab dots. Besides the reads an action on this page asks for
   * (`reload`), it is read again when a template page opens, when the person returns to the list and
   * when the browser tab comes back, so a change made elsewhere (another tab, the Demos screen,
   * another admin, a demo job the server finished meanwhile) shows without F5. The last list stays
   * drawn while a read is out: state is only replaced by an answer, never cleared. The Demo Site row
   * of an open template reads its demo on the same generation (`readKey`). No timer here; the one
   * poll is the Demo Site row's, while a job is in flight.
   */
  useEffect(() => {
    const ac = new AbortController()
    reading.current = true
    const inspirationRead = fetchInspiration(ac.signal).then((r) => {
      if (ac.signal.aborted) return
      if (!r.ok) {
        if (r.refusal.kind !== 'aborted') setRefusal(r.refusal)
        return
      }
      setRefusal(null)
      setInspiration(r.value)
    })
    const quickstartsRead = fetch('/api/ops/quickstarts', {
      headers: { accept: 'application/json' },
      signal: ac.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('cms-templates.errors.answered', { status: response.status }))
        const body = (await response.json()) as QuickstartListing
        if (!ac.signal.aborted) setQuickstarts(body)
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(thrownText(e))
      })
    void Promise.allSettled([inspirationRead, quickstartsRead]).then(() => {
      if (!ac.signal.aborted) reading.current = false
    })
    return () => {
      ac.abort()
      reading.current = false
    }
  }, [reloadKey])

  // Opening a template, or coming back to the list, reads the list again. A tab change inside the
  // template page (`view`) is not a new read.
  const lastTemplate = useRef(template)
  useEffect(() => {
    if (lastTemplate.current === template) return
    lastTemplate.current = template
    reload()
  }, [template, reload])

  // The browser tab coming back (focus, or visible again) reads the list again, once for both events.
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === 'hidden' || reading.current) return
      reload()
    }
    window.addEventListener('focus', onBack)
    document.addEventListener('visibilitychange', onBack)
    return () => {
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
    }
  }, [reload])

  const rows = useMemo(
    // `t` changes with the language, and the rows' issue and warning lines are words.
    () => (quickstarts && inspiration ? templateRows(quickstarts.releases, inspiration) : []),
    [quickstarts, inspiration, t]
  )

  const sync = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/ops/quickstarts/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        setError(body.reason ?? t('cms-templates.errors.refreshAnswered', { status: response.status }))
      reload()
    } catch (e) {
      setError(thrownText(e))
    } finally {
      setBusy(false)
    }
  }

  const open = template ? rows.find((t) => t.id === template) : undefined
  if (template && quickstarts && inspiration) {
    if (open)
      return (
        <TemplateDetail
          row={open}
          view={view}
          release={release}
          writable={quickstarts.writable}
          onView={(next) => onOpen(template, next)}
          onBack={() => onOpen(null)}
          onChanged={reload}
          readKey={reloadKey}
        />
      )
  }

  const loaded = quickstarts && inspiration
  const inTab = rows.filter((t) => t.active === (tab === 'active'))
  const tabCount = (active: boolean) => rows.filter((t) => t.active === active).length
  const cmsCount = (c: Cms | 'all') =>
    c === 'all' ? inTab.length : inTab.filter((t) => t.releases.some((r) => r.platform === c)).length
  const allCategories = [
    ...new Set(inTab.map((t) => t.category).filter((c): c is string => Boolean(c)))
  ].sort((a, b) => a.localeCompare(b))
  const needle = term.trim().toLowerCase()
  const shown = inTab.filter(
    (t) =>
      (cms.length === 0 || t.releases.some((r) => r.platform !== null && cms.includes(r.platform))) &&
      (categories.length === 0 || (t.category !== null && categories.includes(t.category))) &&
      (needle === '' ||
        `${t.label} ${t.id} ${t.releases.map((r) => r.tag).join(' ')}`.toLowerCase().includes(needle))
  )
  const readAt = quickstarts?.readAt ?? inspiration?.readAt ?? null
  const writable = Boolean(quickstarts?.writable)
  const canSync = Boolean(quickstarts?.canRefresh)

  return (
    <div className="flex flex-col gap-4 px-6 py-6" data-ops-templates="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-semibold text-lg tracking-tight">{CMS_SCREEN_LABEL.templates}</h1>
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="cms-templates.list.lead"
              values={{ host: inspiration ? hostOf(inspiration.origin) : t('cms-templates.list.thisServer') }}
              components={{ host: <span className="font-mono" /> }}
            />
          </p>
        </div>
        <div
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border border-border py-0.5 ps-3 pe-0.5 text-muted-foreground text-xs"
          data-sync=""
        >
          <span
            className="inline-flex items-center gap-1.5"
            title={
              readAt
                ? t('cms-templates.sync.lastRead', { when: exactUtc(readAt, lang) })
                : t('cms-templates.sync.notRead')
            }
          >
            <GithubMark />
            <span className="text-foreground">{t('cms-templates.sync.label')}</span>·{' '}
            {readAt ? relativeTime(readAt) : t('cms-templates.sync.never')}
          </span>
          <button
            type="button"
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full text-foreground hover:bg-muted',
              'focus-visible:outline-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40'
            )}
            onClick={() => void sync()}
            disabled={busy || !canSync || !writable}
            aria-label={t('cms-templates.sync.label')}
            title={canSync ? t('cms-templates.sync.again') : (quickstarts?.cannotRefreshReason ?? '')}
            data-refresh=""
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </button>
        </div>
      </div>
      {quickstarts && !canSync && quickstarts.cannotRefreshReason ? (
        <p className="-mt-2 text-muted-foreground text-xs">{quickstarts.cannotRefreshReason}</p>
      ) : null}
      {quickstarts?.designSystemIssues?.length ? (
        <DesignSystemIssues issues={quickstarts.designSystemIssues} />
      ) : null}
      {refusal ? <RefusalNotice refusal={refusal} onRetry={reload} /> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {template && loaded && !open ? (
        <p className="text-destructive text-sm">{t('cms-templates.list.notFound', { id: template })}</p>
      ) : null}

      <div
        className="flex gap-6 border-border border-b"
        role="tablist"
        aria-label={t('cms-templates.list.tabsLabel')}
      >
        {(
          [
            ['active', t('cms-templates.state.published'), Eye, t('cms-templates.list.publishedHint')],
            ['disabled', t('cms-templates.state.disabled'), EyeOff, t('cms-templates.list.disabledHint')]
          ] as const
        ).map(([id, label, Icon, hint]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            title={hint}
            data-tab={id}
            onClick={() => {
              setTab(id)
              setCategories([])
            }}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 pt-2 pb-2.5 text-sm transition-colors',
              'focus-visible:outline-1 focus-visible:outline-ring',
              tab === id
                ? 'border-foreground font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            {label}
            <span className="rounded-full bg-muted px-1.5 font-normal text-muted-foreground text-xs tabular-nums">
              {loaded ? tabCount(id === 'active') : '…'}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64 min-w-44">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 rounded-lg bg-muted/50 ps-8"
            placeholder={t('cms-templates.list.search')}
            aria-label={t('cms-templates.list.search')}
            data-search=""
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <CmsChip
          pressed={cms.length === 0}
          onClick={() => setCms([])}
          label={t('cms-templates.list.allCms')}
          count={cmsCount('all')}
        />
        {CMS.map((c) => (
          <CmsChip
            key={c}
            cms={c}
            pressed={cms.includes(c)}
            onClick={() => setCms((was) => (was.includes(c) ? was.filter((x) => x !== c) : [...was, c]))}
            label={CMS_LABEL[c]}
            count={cmsCount(c)}
          />
        ))}
        <CategoryPicker options={allCategories} picked={categories} onChange={setCategories} />
      </div>

      {!loaded ? (
        <Panel title={t('cms-templates.list.loadingTitle')}>
          <LoadingRows label={t('cms-templates.list.loadingRows')} />
        </Panel>
      ) : (
        <TemplateTable
          rows={shown}
          tab={tab}
          empty={inTab.length === 0 ? t('cms-templates.list.emptyTab') : t('cms-templates.list.emptyFilters')}
          onOpen={(t) => onOpen(t.id)}
        />
      )}
    </div>
  )
}

/** One CMS filter: its round letter, its name, and how many templates of the tab carry it. */
export function CmsChip({
  cms,
  pressed,
  onClick,
  label,
  count
}: {
  cms?: Cms
  pressed: boolean
  onClick: () => void
  label: string
  count: number | string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-cms={cms ?? 'all'}
      className={cn(
        'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-border text-sm transition-colors',
        'focus-visible:outline-1 focus-visible:outline-ring',
        cms ? 'ps-2 pe-3' : 'px-3',
        pressed ? 'bg-muted font-semibold' : 'bg-background hover:bg-muted/60'
      )}
    >
      {cms ? <PlatformGlyph platform={cms} /> : null}
      {label}
      {count === '' ? null : <span className="font-normal text-muted-foreground tabular-nums">{count}</span>}
    </button>
  )
}

function CategoryPicker({
  options,
  picked,
  onChange
}: {
  options: string[]
  picked: string[]
  onChange: (next: string[]) => void
}) {
  const t = useT()
  const label =
    picked.length === 0
      ? t('cms-templates.categories.all')
      : picked.length === 1
        ? picked[0]
        : t('cms-templates.categories.picked', { count: picked.length })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-muted/50 ps-3 pe-2 text-sm focus-visible:outline-1 focus-visible:outline-ring"
            data-category-filter=""
          />
        }
      >
        {label}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{t('cms-templates.categories.none')}</DropdownMenuItem>
        ) : (
          options.map((c) => (
            <DropdownMenuCheckboxItem
              key={c}
              checked={picked.includes(c)}
              onCheckedChange={() =>
                onChange(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])
              }
            >
              {c}
            </DropdownMenuCheckboxItem>
          ))
        )}
        {picked.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>
              {t('cms-templates.categories.clear')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The card's picture, or a red "No card" box of the very same size, so every row keeps one shape.
 * The box says "No card" (not NO_LISTING): the column header already reads Card, and the longer
 * words do not fit the thumbnail size on one line.
 */
export function CardThumb({ row }: { row: TemplateRow }) {
  const t = useT()
  const hasCard = row.hasListing
  if (row.image)
    return (
      <img
        src={row.image}
        alt=""
        className="h-9 w-14 rounded border border-border object-cover object-top"
        data-thumb=""
      />
    )
  if (!hasCard)
    return (
      <span
        className="flex h-9 w-14 items-center justify-center overflow-hidden whitespace-nowrap rounded bg-destructive/10 text-center font-semibold text-[10px] text-destructive leading-none"
        data-no-card=""
      >
        {t('cms-templates.thumb.noCard')}
      </span>
    )
  return (
    <span className="flex h-9 w-14 items-center justify-center rounded border border-border bg-muted text-[10px] text-muted-foreground">
      {t('cms-templates.thumb.none')}
    </span>
  )
}

/** One chip per release (CMS, its tag when the CMS repeats, and version), as the header of a template page shows them too. */
export function VersionChips({ releases }: { releases: ReleaseRow[] }) {
  const names = releaseNames(releases)
  return (
    <span className="inline-flex flex-wrap gap-1">
      {releases.map((r) => (
        <span
          key={r.tag}
          className="inline-flex items-center whitespace-nowrap rounded-full border border-border px-2 text-xs"
          title={r.tag}
          data-build={r.tag}
        >
          {names.get(r.tag) ?? r.tag}
          {r.version ? ` ${r.version}` : ''}
        </span>
      ))}
    </span>
  )
}

/**
 * A count, green "None" when zero, and every sentence on hover. `focusable` puts the pill in the
 * tab order so a keyboard can open its tooltip; off inside a list row, which is itself the one
 * keyboard stop (`TemplateTable`), and whose detail page lists the same sentences.
 */
export function CountTag({
  list,
  kind,
  tone,
  focusable = true
}: {
  list: string[]
  kind: 'warnings' | 'issues'
  tone: 'amber' | 'red'
  focusable?: boolean
}) {
  const t = useT()
  if (list.length === 0)
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-emerald-600/10 font-semibold text-emerald-700 dark:text-emerald-400"
      >
        {t('cms-templates.count.none')}
      </Badge>
    )
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            {...(focusable ? { tabIndex: 0 } : {})}
            data-count={list.length}
            className={cn(
              'border-transparent font-semibold',
              tone === 'amber'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'bg-destructive/10 text-destructive'
            )}
          />
        }
      >
        {t(`cms-templates.count.${kind}`, { count: list.length })}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="list-disc ps-4">
          {list.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function TemplateTable({
  rows,
  tab,
  empty,
  onOpen
}: {
  rows: TemplateRow[]
  tab: StatusTab
  empty: string
  onOpen: (t: TemplateRow) => void
}) {
  const tt = useT()
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Fixed widths keep the columns close together; the open-arrow column takes what is left,
                so a wide screen does not spread Template, versions and Warnings apart (Akemi, 10/10/2026). */}
            <TableHead className="w-20">{tt('cms-templates.table.card')}</TableHead>
            <TableHead className="w-52">{tt('cms-templates.table.template')}</TableHead>
            <TableHead className="w-80">{tt('cms-templates.table.version')}</TableHead>
            <TableHead className="w-44">
              {tab === 'active' ? tt('cms-templates.table.warnings') : tt('cms-templates.table.issues')}
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-muted-foreground text-sm">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((t) => (
              // 🔒 THE WHOLE ROW IS THE TARGET, AND ONE KEYBOARD STOP (Akemi, 12/10/2026). Measured on
              // dev: the Warnings cell stopped the click, so its pill and its empty space opened
              // nothing, and the row could not be reached by keyboard (only the chevron could). Now
              // a click anywhere bubbles here, Enter on the focused row opens it, and nothing inside
              // the row is a second tab stop; the warnings tooltip still opens on hover.
              <TableRow
                key={t.id}
                className="cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1"
                tabIndex={0}
                aria-label={tt('cms-templates.list.openRow', { label: t.label })}
                onClick={() => onOpen(t)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.target !== e.currentTarget) return
                  e.preventDefault()
                  onOpen(t)
                }}
                data-template={t.id}
              >
                <TableCell>
                  <CardThumb row={t} />
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 font-semibold text-sm">
                    {t.label}
                    {t.designPack ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-muted font-semibold text-muted-foreground"
                      >
                        {tt('cms-templates.state.designPack')}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block font-mono text-muted-foreground text-xs">{t.id}</span>
                </TableCell>
                <TableCell>
                  <VersionChips releases={t.releases} />
                </TableCell>
                <TableCell>
                  {t.designPack ? (
                    // Nothing to count: a design pack is never offered on Design inspiration.
                    <Badge
                      variant="outline"
                      className="border-transparent bg-muted font-semibold text-muted-foreground"
                      data-design-pack=""
                    >
                      {tt('cms-templates.state.designPack')}
                    </Badge>
                  ) : tab === 'active' ? (
                    <CountTag list={t.warnings} kind="warnings" tone="amber" focusable={false} />
                  ) : (
                    <CountTag list={t.issues} kind="issues" tone="red" focusable={false} />
                  )}
                </TableCell>
                <TableCell className="text-end">
                  {/* A sign that the row opens, not a second control: the row is the button. */}
                  <span
                    aria-hidden="true"
                    className="inline-flex size-7 items-center justify-center text-muted-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

/** GitHub's own mark, drawn in the text colour beside "Sync GitHub". */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('size-3.5 flex-none fill-current text-foreground', className)}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
