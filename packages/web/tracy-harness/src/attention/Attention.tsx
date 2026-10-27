/**
 * `/ops/attention` — what an administrator must do or check so that quickstart, demo, content
 * contract, design system, Design inspiration and questionnaire fit together
 * (tasks/todo-admin-attention.md; drawing approved by Brian 04/10/2026, ported from the mockup).
 *
 * 🔒 THE SERVER DECIDES, THE SCREEN WORDS. `GET /api/ops/attention` computes every item from this
 * deployment's own data and answers codes; `./strings.ts` maps them to dictionary keys. Nothing here
 * re-judges a release — the filters below only choose which of the server's items to show.
 *
 * Layout (Brian, 04/10): the CMS is chosen once beside the title (like Quickstarts); a left column
 * of issue areas (like User Interface); each area filters Needs attention / Hints / All. The
 * Quickstart area is every item, one row per quickstart; the other areas are the same items
 * narrowed to their kind, one card per check.
 */
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem
} from '@tracy/ui'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Info,
  RefreshCw,
  Siren,
  X
} from 'lucide-react'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import {
  type Analysis,
  fetchAnalysis,
  fetchReport,
  type Item,
  type Report,
  type Severity,
  type Subject
} from './api'
import { useT } from '../i18n/index.ts'
import {
  AREAS,
  type AreaId,
  analysisText,
  areaBlurb,
  areaLabel,
  CMS_LABEL,
  feedsText,
  fixOf,
  roleName,
  seeInLabel,
  severityLabel,
  titleOf,
  whyOf
} from './strings'

type Show = 'attention' | 'hints' | 'all'
type CmsId = 'all' | 'joomla' | 'wordpress' | 'emdash'
type AreaDef = (typeof AREAS)[number]

const SEVERITY_STYLE: Record<Severity, { icon: typeof Siren; chip: string }> = {
  broken: { icon: Siren, chip: 'border-destructive/50 text-destructive' },
  missing: { icon: CircleAlert, chip: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  hint: { icon: Info, chip: 'border-border text-muted-foreground' }
}

/** In-app navigation: the shell re-reads the address on `popstate` (`App.tsx`). */
function navigate(href: string) {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const quickstartHref = (s: Subject) =>
  `/ops/cms/quickstarts?${new URLSearchParams({ cms: s.platform, tag: s.key }).toString()}`
const demosHref = (s: Subject) => `/ops/cms/demos?${new URLSearchParams({ cms: s.platform }).toString()}`
const hrefFor = (check: string, s: Subject) =>
  fixOf(check) === 'demo' || s.kind === 'demo' ? demosHref(s) : quickstartHref(s)

function SeverityChip({ severity, children }: { severity: Severity; children?: ReactNode }) {
  const t = useT()
  const s = SEVERITY_STYLE[severity]
  const Icon = s.icon
  return (
    <Badge
      variant="outline"
      data-severity={severity}
      className={cn(
        'h-auto max-w-full gap-1 whitespace-normal text-left font-normal [&_svg]:size-3 [&_svg]:flex-none',
        s.chip
      )}
    >
      <Icon />
      {children ?? severityLabel(severity, t)}
    </Badge>
  )
}

function FixLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      data-attention-link
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'h-7 flex-none gap-1 px-2 text-xs no-underline'
      )}
      onClick={(e) => {
        e.stopPropagation()
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        navigate(href)
      }}
    >
      {label}
      <ArrowUpRight className="size-3.5" />
    </a>
  )
}

const keep = (show: Show) => (i: Item) =>
  show === 'attention' ? i.severity !== 'hint' : show === 'hints' ? i.severity === 'hint' : true

function cmsFromLocation(): CmsId {
  const asked = new URLSearchParams(window.location.search).get('cms')
  return asked === 'joomla' || asked === 'wordpress' || asked === 'emdash' ? asked : 'all'
}
function areaFromLocation(): AreaId {
  const asked = new URLSearchParams(window.location.search).get('area')
  return AREAS.some((a) => a.id === asked) ? (asked as AreaId) : 'quickstarts'
}
function setQuery(key: string, value: string | null) {
  const url = new URL(window.location.href)
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  window.history.replaceState(window.history.state, '', url)
}

export function Attention({ onCount }: { onCount?: (count: number | null) => void }) {
  const t = useT()
  const [report, setReport] = useState<Report | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const error = failure === null ? null : t('attention.loadFailed', { status: failure })
  const [loading, setLoading] = useState(false)
  const [area, setArea] = useState<AreaId>(areaFromLocation)
  const [cms, setCms] = useState<CmsId>(cmsFromLocation)
  const [show, setShow] = useState<Show>('attention')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const answer = await fetchReport()
    setLoading(false)
    if (!answer.ok) {
      setFailure(answer.status)
      onCount?.(null)
      return
    }
    setFailure(null)
    setReport(answer.body)
    onCount?.(answer.body.count)
  }, [onCount])
  useEffect(() => {
    void load()
  }, [load])

  const inCms = useMemo(
    () => (report?.subjects ?? []).filter((s) => cms === 'all' || s.platform === cms),
    [report, cms]
  )
  /** What an area holds under the chosen CMS and filter: subjects, each with only its matching items. */
  const scoped = (a: AreaDef, which: Show) =>
    inCms
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => (a.checks === null || a.checks.includes(i.check)) && keep(which)(i))
      }))
      .filter((s) => s.items.length > 0)
  const current = AREAS.find((a) => a.id === area) ?? AREAS[0]
  const visible = scoped(current, show)
  /** The number beside an area: quickstarts needing attention there, or its hints when it has only hints. */
  const countOf = (a: AreaDef) => {
    const n = scoped(a, 'attention').length
    return n > 0 ? { n, hint: false } : { n: scoped(a, 'hints').length, hint: true }
  }
  const cmsCount = (id: CmsId) =>
    (report?.subjects ?? []).filter((s) => (id === 'all' || s.platform === id) && s.worst !== 'hint').length
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-attention-screen>
      <div className="flex flex-none flex-wrap items-start justify-between gap-3 px-8 pt-7 pb-4">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="font-semibold text-xl tracking-tight">{t('attention.title')}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{t('attention.intro')}</p>
          </div>
          <div
            className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-[3px]"
            role="group"
            aria-label={t('attention.col.cms')}
          >
            {(['all', 'joomla', 'wordpress', 'emdash'] as const).map((id) => (
              <button
                key={id}
                type="button"
                data-attention-cms={id}
                data-count={report ? cmsCount(id) : undefined}
                onClick={() => {
                  setCms(id)
                  setQuery('cms', id === 'all' ? null : id)
                }}
                aria-pressed={id === cms}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                  id === cms
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {id === 'all' ? t('attention.cms.all') : CMS_LABEL[id]}
                {report ? ` · ${cmsCount(id)}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {report
            ? t('attention.checkedAt', { count: report.offered })
            : loading
              ? t('attention.loading')
              : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t('attention.reload')}
            title={t('attention.reload')}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {error ? <p className="px-8 pb-3 text-destructive text-sm">{error}</p> : null}

      {!report ? (
        error ? null : (
          <div className="flex flex-col gap-3 px-8 pb-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )
      ) : report.subjects.length === 0 ? (
        <div className="px-8 pb-8">
          <Card className="items-center gap-2 py-12 text-center" data-attention-empty>
            <p className="font-medium text-sm">{t('attention.empty.title')}</p>
            <p className="text-muted-foreground text-sm">{t('attention.empty.body')}</p>
          </Card>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-8 pb-8 lg:flex-row">
          <nav className="flex flex-none flex-row flex-wrap gap-1 lg:w-52 lg:flex-col">
            {AREAS.map((a) => {
              const { n, hint } = countOf(a)
              return (
                <button
                  key={a.id}
                  type="button"
                  data-attention-area={a.id}
                  data-count={n}
                  data-count-kind={hint ? 'hint' : 'attention'}
                  onClick={() => {
                    setArea(a.id)
                    setQuery('area', a.id === 'quickstarts' ? null : a.id)
                  }}
                  aria-current={a.id === area ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm',
                    a.id === area
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-foreground/80 hover:bg-muted/60'
                  )}
                >
                  {areaLabel(a.id, t)}
                  {n > 0 && (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        hint ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'
                      )}
                      title={hint ? t('attention.areaCount.hint') : t('attention.areaCount.attention')}
                    >
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-medium text-base">{areaLabel(current.id, t)}</h2>
                <p className="mt-0.5 text-muted-foreground text-sm">{areaBlurb(current.id, t)}</p>
              </div>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[show]}
                onValueChange={(v: string[]) => v[0] && setShow(v[0] as Show)}
                aria-label={t('attention.show.label')}
              >
                <ToggleGroupItem value="attention" className="px-3" data-attention-show="attention">
                  {t('attention.show.attention')} ({scoped(current, 'attention').length})
                </ToggleGroupItem>
                <ToggleGroupItem value="hints" className="px-3" data-attention-show="hints">
                  {t('attention.show.hints')} ({scoped(current, 'hints').length})
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="px-3" data-attention-show="all">
                  {t('attention.show.all')} ({scoped(current, 'all').length})
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {visible.length === 0 ? (
              <Card className="items-center gap-1 py-10 text-center" data-attention-none>
                <p className="font-medium text-sm">{t('attention.none.title')}</p>
                <p className="text-muted-foreground text-sm">
                  {show === 'attention' ? t('attention.none.attention') : t('attention.none.hints')}
                </p>
              </Card>
            ) : current.checks === null ? (
              <QuickstartTable subjects={visible} open={open} toggle={toggle} />
            ) : (
              <ByCheck checks={current.checks} subjects={visible} open={open} toggle={toggle} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** One item's reason line, worded from its code. */
function ItemWhy({ item, subject }: { item: Item; subject: Subject }) {
  const t = useT()
  const why = whyOf(item, subject, t)
  return why ? <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">{why}</span> : null
}

/** Quickstarts — one row per quickstart, its chips, and the reasons when opened. */
function QuickstartTable({
  subjects,
  open,
  toggle
}: {
  subjects: Subject[]
  open: Set<string>
  toggle: (key: string) => void
}) {
  const t = useT()
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="w-[30%]">{t('attention.col.quickstart')}</TableHead>
            <TableHead className="w-24">{t('attention.col.cms')}</TableHead>
            <TableHead className="w-[16%]">{t('attention.col.demo')}</TableHead>
            <TableHead>{t('attention.col.problems')}</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((s) => {
            const isOpen = open.has(s.key)
            return (
              <Fragment key={s.key}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => toggle(s.key)}
                  data-attention-subject={s.key}
                  aria-expanded={isOpen}
                >
                  <TableCell className="text-muted-foreground">
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{s.label}</span>
                      <span className="font-mono text-muted-foreground text-xs [overflow-wrap:anywhere]">
                        {s.key}
                        {s.version ? <span className="whitespace-nowrap"> · {s.version}</span> : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{CMS_LABEL[s.platform] ?? s.platform}</TableCell>
                  <TableCell className="whitespace-normal break-all font-mono text-muted-foreground text-xs">
                    {s.demo ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {s.items.map((i) => (
                        <SeverityChip key={i.check} severity={i.severity}>
                          {titleOf(i.check, t)}
                        </SeverityChip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <FixLink href={hrefFor(s.items[0].check, s)} label={t('attention.details')} />
                  </TableCell>
                </TableRow>
                {isOpen &&
                  s.items.map((i) => (
                    <TableRow
                      key={`${s.key}:${i.check}`}
                      className="bg-muted/30 hover:bg-muted/30"
                      data-check={i.check}
                      data-severity={i.severity}
                      data-attention-of={s.key}
                    >
                      <TableCell />
                      <TableCell colSpan={5} className="whitespace-normal">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <SeverityChip severity={i.severity} />
                            <div className="flex min-w-0 flex-col">
                              <span className="text-sm">{titleOf(i.check, t)}</span>
                              <ItemWhy item={i} subject={s} />
                            </div>
                          </div>
                          <FixLink href={hrefFor(i.check, s)} label={seeInLabel(i.check, t)} />
                        </div>
                        {i.check === 'standard-questions' && s.kind === 'quickstart' ? (
                          <QuestionnaireAnalysis subject={s} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}

/** Demos, Design inspiration, Contracts, Questionnaires — one card per check, the quickstarts in it. */
function ByCheck({
  checks,
  subjects,
  open,
  toggle
}: {
  checks: string[]
  subjects: Subject[]
  open: Set<string>
  toggle: (key: string) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {checks.map((check) => {
        const rows = subjects.flatMap((s) =>
          s.items.filter((i) => i.check === check).map((item) => ({ subject: s, item }))
        )
        if (rows.length === 0) return null
        const isOpen = open.has(check) !== rows.length <= 6
        const expandable = check === 'standard-questions'
        return (
          <Card key={check} className="gap-0 py-0" data-attention-check-card={check}>
            <button
              type="button"
              className="flex items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => toggle(check)}
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2">
                <SeverityChip severity={rows[0].item.severity} />
                <span className="font-medium text-sm">{titleOf(check, t)}</span>
                <span className="text-muted-foreground text-sm tabular-nums">{rows.length}</span>
              </span>
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            {isOpen && (
              <div className="border-t">
                {rows.map(({ subject, item }) => {
                  const key = `${check}:${subject.key}`
                  const expanded = expandable && open.has(key)
                  return (
                    <div
                      key={subject.key}
                      className="border-b px-4 py-2 last:border-0"
                      data-check={check}
                      data-severity={item.severity}
                      data-attention-subject={subject.key}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={!expandable}
                          onClick={() => toggle(key)}
                          aria-expanded={expandable ? expanded : undefined}
                          className="flex min-w-0 items-start gap-1.5 text-left disabled:cursor-default"
                        >
                          {expandable &&
                            (expanded ? (
                              <ChevronDown className="mt-0.5 size-4 flex-none text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 size-4 flex-none text-muted-foreground" />
                            ))}
                          <div className="flex min-w-0 flex-col">
                            <span className="text-sm">
                              <span>{subject.label}</span>{' '}
                              <span className="text-muted-foreground text-xs">
                                {CMS_LABEL[subject.platform] ?? subject.platform} · {subject.key}
                              </span>
                            </span>
                            <ItemWhy item={item} subject={subject} />
                          </div>
                        </button>
                        <FixLink href={hrefFor(check, subject)} label={seeInLabel(check, t)} />
                      </div>
                      {expanded ? <QuestionnaireAnalysis subject={subject} /> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/**
 * Why the questionnaire in use does not fit this quickstart — loaded when opened (decision #10),
 * four parts in the order an administrator reads them: what the template holds, what the set asks,
 * what is wrong, what to do.
 */
function QuestionnaireAnalysis({ subject }: { subject: Subject }) {
  const t = useT()
  const [a, setA] = useState<Analysis | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    void fetchAnalysis(subject.key, ac.signal).then((answer) => {
      if (ac.signal.aborted) return
      if (answer.ok) setA(answer.body)
      else setFailure(answer.status)
    })
    return () => ac.abort()
  }, [subject.key])

  if (failure !== null)
    return (
      <p className="mt-2 text-destructive text-xs" data-attention-analysis="error">
        {t('attention.analysis.failed', { status: failure })}
      </p>
    )
  if (!a)
    return (
      <p className="mt-2 text-muted-foreground text-xs" data-attention-analysis="loading">
        {t('attention.analysis.loading')}
      </p>
    )

  const words = analysisText(a, subject.key, t)

  return (
    <div
      className="mt-2 flex flex-col gap-4 rounded-lg border bg-background p-4 text-sm"
      data-attention-analysis="ready"
      data-limited={a.limited ?? 'none'}
    >
      <section>
        <h4 className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t('attention.analysis.partsTitle')}
        </h4>
        {words.limited ? (
          <p className="text-muted-foreground" data-attention-limited={a.limited ?? undefined}>
            {words.limited}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {a.parts.map((p) => (
              <li
                key={p.role}
                title={p.examples.join(' · ')}
                data-attention-part={p.role}
                data-covered={p.covered ? 'true' : 'false'}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
                  p.covered
                    ? 'text-muted-foreground'
                    : 'border-amber-500/50 text-amber-700 dark:text-amber-400'
                )}
              >
                {p.covered ? <Check className="size-3" /> : <X className="size-3" />}
                {roleName(p.role, t)}
                <span className="tabular-nums opacity-70">
                  {p.blocks > 0
                    ? t('attention.analysis.blocks', { count: p.blocks })
                    : t('attention.analysis.pages', { count: p.pages })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t('attention.analysis.askedTitle', { setName: a.setName ?? '—', count: a.asked.length })}
        </h4>
        <ul className="flex flex-col gap-1">
          {a.asked.map((q) => {
            const fills = feedsText(q.feeds, t)
            return (
              <li
                key={q.id}
                className="flex items-start gap-2"
                data-attention-question={q.id}
                data-works={q.works ? 'true' : 'false'}
              >
                {q.works ? (
                  <Check className="mt-0.5 size-3.5 flex-none text-emerald-600" />
                ) : (
                  <X className="mt-0.5 size-3.5 flex-none text-destructive" />
                )}
                <span>
                  {q.label}
                  <span className="text-muted-foreground text-xs">
                    {' '}
                    —{' '}
                    {q.works
                      ? fills
                        ? t('attention.analysis.feedsInto', { what: fills })
                        : t('attention.analysis.agentReads')
                      : t('attention.analysis.noEffect')}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {words.problems.length > 0 ? (
        <section>
          <h4 className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t('attention.analysis.problemsTitle')}
          </h4>
          <ul className="flex list-disc flex-col gap-1 ps-5" data-attention-problems={words.problems.length}>
            {words.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4 className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t('attention.analysis.suggestionsTitle')}
        </h4>
        <ol className="flex list-decimal flex-col gap-1 ps-5">
          {words.suggestions.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FixLink href={quickstartHref(subject)} label={t('attention.analysis.viewInQuickstart')} />
        </div>
      </section>
    </div>
  )
}
