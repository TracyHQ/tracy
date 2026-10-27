// Can teammates scan one compact row per PR, sort their work, and expand only the details they need?
import { Fragment, useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import {
  Badge,
  Button,
  Input,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn
} from '@tracy/ui'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Circle,
  AlertCircle,
  Search,
  ExternalLink,
  X
} from 'lucide-react'
import {
  tableRows,
  columns,
  sortedRows,
  relativeTime,
  exactTime,
  progressOf,
  type SortKey
} from '../fixtures/ops-ci/table'

function CiMock({
  initial,
  mode = 'loaded',
  initialFilter = 'All PRs',
  viewer = null,
  members = ['Lee', 'David', 'Hano']
}: {
  initial?: number
  mode?: 'loaded' | 'empty' | 'unavailable' | 'stale'
  initialFilter?: string
  viewer?: string | null
  members?: string[]
}) {
  const [expanded, setExpanded] = useState<number | null>(initial ?? null)
  const [filter, setFilter] = useState(initialFilter)
  const [person, setPerson] = useState(viewer ?? 'All')
  const memberTabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    memberTabs.current
      ?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [person])
  useEffect(() => {
    setPerson(viewer ?? 'All')
  }, [viewer])
  const people = [
    ...new Set([...members, ...tableRows.map((row) => row.author), ...(viewer ? [viewer] : [])])
  ]
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('queue')
  const [descending, setDescending] = useState(false)
  const available = mode === 'empty' || mode === 'unavailable' ? [] : tableRows
  const authored = available.filter((row) => person === 'All' || row.author === person)
  const rows = sortedRows(
    authored.filter(
      (p) =>
        (filter === 'All PRs' ||
          (filter === 'Merge queue'
            ? p.queue !== null
            : filter === 'Needs attention'
              ? ['Needs a fix', 'Waiting for review'].includes(p.state)
              : filter === 'Ready to merge'
                ? p.state === 'Ready to merge'
                : p.merged)) &&
        `${p.id} ${p.title} ${p.author} ${p.commit}`.toLowerCase().includes(query.toLowerCase())
    ),
    sort,
    descending
  )
  const p = rows.find((row) => row.id === expanded)
  const toggle = (id: number) => setExpanded((current) => (current === id ? null : id))
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
        <span>
          <strong>tracy</strong>
          <span className="mx-3 text-muted-foreground">/ Operations /</span>CI
        </span>
        <Badge variant="outline">Mockup · sample data</Badge>
      </header>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pull requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One row per change. Expand a PR for checks, errors and what happens next.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {mode === 'stale' ? 'Last update: 18 min ago' : 'Sample snapshot · 8 Oct 2026, 10:30 UTC'}
          </span>
        </div>
        {(mode === 'stale' || mode === 'unavailable') && (
          <div
            role="status"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm"
          >
            {mode === 'stale'
              ? 'Updates delayed. Queue positions, statuses and times are from the last snapshot.'
              : 'CI status unavailable. We cannot confirm check results, queue order or merges.'}
          </div>
        )}
        <Tabs value={person} onValueChange={(value) => setPerson(String(value))} className="min-w-0 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1" aria-label="Filter PRs">
              {['All PRs', 'Merge queue', 'Ready to merge', 'Needs attention', 'Merged'].map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'secondary' : 'ghost'}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                  <span className="text-muted-foreground">
                    {mode === 'unavailable'
                      ? '—'
                      : authored.filter(
                          (p) =>
                            f === 'All PRs' ||
                            (f === 'Merge queue'
                              ? p.queue !== null
                              : f === 'Ready to merge'
                                ? p.state === 'Ready to merge'
                                : f === 'Needs attention'
                                  ? ['Needs a fix', 'Waiting for review'].includes(p.state)
                                  : p.merged)
                        ).length}
                  </span>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
                <Input
                  className="h-8 w-56 pl-8"
                  aria-label="Search PRs"
                  placeholder="PR, brief, author or commit…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 border-b border-border">
            <div
              className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1"
              aria-label="Scroll member tabs"
              ref={memberTabs}
            >
              <TabsList
                variant="line"
                aria-label="Filter by member"
                className="h-10 min-w-max justify-start gap-1"
              >
                {['All', ...people].map((name) => (
                  <TabsTrigger
                    key={name}
                    value={name}
                    className="h-9 flex-none px-3 data-active:text-primary after:bg-primary"
                    onFocus={(event) =>
                      event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    }
                  >
                    {name}
                    {name === viewer && <span className="text-xs text-muted-foreground">(you)</span>}
                    <span className="text-xs text-muted-foreground">
                      {mode === 'unavailable'
                        ? '—'
                        : available.filter((row) => name === 'All' || row.author === name).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {viewer && (
              <span className="hidden shrink-0 pb-1 text-xs text-muted-foreground sm:block">
                Signed in as {viewer}
              </span>
            )}
          </div>
          <TabsContent value={person} className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {rows.length} PRs shown · Sorted by {columns.find((c) => c.key === sort)?.label},{' '}
                {descending ? 'descending' : 'ascending'}
                {sort === 'build' && ' · Failed → Building → Queued → Ready → Not started'}
              </span>
              <span>Queue position stays the same when you sort or filter.</span>
            </div>
            <div className={cn('grid items-start gap-4', p && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
              <div className="min-w-0 overflow-hidden rounded-lg border border-border">
                <Table className="min-w-[1220px] text-xs" aria-label="Pull requests">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-9">
                        <span className="sr-only">Details</span>
                      </TableHead>
                      {columns.map((c) => (
                        <TableHead
                          key={c.key}
                          aria-sort={sort === c.key ? (descending ? 'descending' : 'ascending') : 'none'}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-0 text-xs"
                            title={c.hint}
                            aria-label={`Sort by ${c.label}`}
                            onClick={() => {
                              setSort(c.key)
                              setDescending(
                                sort === c.key ? !descending : c.key === 'committedAt' || c.key === 'mergedAt'
                              )
                            }}
                          >
                            {c.label}
                            {sort === c.key ? (
                              descending ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ArrowUp className="size-3" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TableHead>
                      ))}
                      <TableHead className="text-xs">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="py-14 text-center text-muted-foreground">
                          {mode === 'unavailable' ? 'Status unavailable' : 'No PRs to show'}
                          {mode !== 'unavailable' && (
                            <p className="mt-1">
                              {mode === 'empty'
                                ? 'New pull requests will appear here.'
                                : 'Try another filter or search.'}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((p) => {
                      const open = expanded === p.id
                      const progress = progressOf(p)
                      return (
                        <Fragment key={p.id}>
                          <TableRow
                            data-pr={p.id}
                            onClick={(event) => {
                              if (
                                (event.target as HTMLElement).closest('button, a, input, select') ||
                                window.getSelection()?.toString()
                              )
                                return
                              setExpanded(p.id)
                            }}
                            className={cn(
                              'cursor-pointer border-border',
                              progress && 'border-b-0',
                              open && 'bg-muted/40'
                            )}
                          >
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`${open ? 'Collapse' : 'Expand'} PR ${p.id}`}
                                aria-expanded={open}
                                aria-controls={open ? `pr-details-${p.id}` : undefined}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggle(p.id)
                                }}
                              >
                                {open ? (
                                  <ChevronDown className="size-3.5" />
                                ) : (
                                  <ChevronRight className="size-3.5" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">#{p.id}</TableCell>
                            <TableCell className="sticky left-0 z-10 max-w-[270px] bg-background">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggle(p.id)
                                }}
                                aria-expanded={open}
                                aria-controls={open ? `pr-details-${p.id}` : undefined}
                                className="flex max-w-[270px] items-center gap-2 text-left text-sm font-medium hover:underline focus-visible:outline-ring"
                                title={p.title}
                              >
                                <span className="min-w-0 truncate">{p.title}</span>
                                <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground">
                                  {p.commit}
                                </span>
                              </button>
                            </TableCell>
                            <TableCell>{p.author}</TableCell>
                            <TableCell>
                              <time
                                dateTime={new Date(p.committedAt).toISOString()}
                                title={exactTime(p.committedAt)}
                              >
                                {relativeTime(p.committedAt)}
                              </time>
                            </TableCell>
                            <TableCell>
                              {p.mergedAt ? (
                                <time
                                  dateTime={new Date(p.mergedAt).toISOString()}
                                  title={exactTime(p.mergedAt)}
                                >
                                  {relativeTime(p.mergedAt)}
                                </time>
                              ) : (
                                <span className="text-muted-foreground">Not merged</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {p.queue ? (
                                <Badge variant="outline" className="border-primary/30 text-primary">
                                  #{p.queue} {p.queue === 1 ? '· Next' : '· Waiting'}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">
                                  {p.state === 'Ready to merge' ? 'Not queued' : '—'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={p.state === 'Needs a fix' ? 'destructive' : 'secondary'}
                                className="whitespace-nowrap"
                              >
                                {p.state}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  'flex items-center gap-1.5',
                                  p.build === 'Failed' && 'text-destructive',
                                  p.build === 'Building' && 'text-primary'
                                )}
                              >
                                {p.build === 'Ready' ? (
                                  <CheckCircle2 className="size-3.5" />
                                ) : p.build === 'Failed' ? (
                                  <AlertCircle className="size-3.5" />
                                ) : p.build === 'Building' ? (
                                  <Clock3 className="size-3.5" />
                                ) : (
                                  <Circle className="size-3.5" />
                                )}
                                {p.build}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">{p.target}</TableCell>
                            <TableCell
                              className="max-w-[220px] truncate text-muted-foreground"
                              title={p.note}
                            >
                              {p.note}
                            </TableCell>
                          </TableRow>
                          {progress && (
                            <TableRow className="border-0 hover:bg-transparent">
                              <TableCell colSpan={11} className="h-[2px] p-0">
                                <Progress
                                  value={progress.value}
                                  aria-label={`Merge progress for PR ${p.id}`}
                                  aria-valuetext={progress.label}
                                  title={progress.label}
                                  className={cn(
                                    'gap-0 [&_[data-slot=progress-track]]:h-[2px] [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-border [&_[data-slot=progress-indicator]]:motion-reduce:transition-none',
                                    progress.tone === 'done' &&
                                      '[&_[data-slot=progress-indicator]]:bg-success',
                                    progress.tone === 'failed' &&
                                      '[&_[data-slot=progress-indicator]]:bg-destructive',
                                    progress.tone === 'running' &&
                                      mode !== 'stale' &&
                                      '[&_[data-slot=progress-indicator]]:motion-safe:animate-pulse'
                                  )}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {p && (
                <div
                  id={`pr-details-${p.id}`}
                  role="region"
                  aria-label={`Details for PR ${p.id}`}
                  className="space-y-5 rounded-lg border border-border bg-card p-5 text-xs text-card-foreground lg:sticky lg:top-4"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">
                        PR #{p.id} · {p.author}
                      </span>
                      <a
                        href={`https://github.com/TracyHQ/tch/pull/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-ring"
                      >
                        View in GH <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Close PR details"
                      onClick={() => setExpanded(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">{p.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{p.detail}</p>
                    <h3 className="mt-4 font-semibold">What happens next</h3>
                    <p className="mt-1 text-sm">{p.next}</p>
                    <p className="mt-2 text-muted-foreground">
                      {mode === 'stale' ? 'Timing unavailable while updates are delayed.' : p.timing}
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-3 font-semibold">Checks on commit {p.commit}</h3>
                    <ol className="space-y-2">
                      {p.checks.map((check, index) => (
                        <li key={check} className="flex justify-between gap-3">
                          <span>{check}</span>
                          <span
                            className={cn(
                              'text-muted-foreground',
                              p.state === 'Needs a fix' && index === p.step && 'text-destructive'
                            )}
                          >
                            {index < p.step
                              ? 'Passed'
                              : index === p.step && p.state === 'Needs a fix'
                                ? 'Failed'
                                : index === p.step && p.state === 'Testing'
                                  ? 'Running · 6 min'
                                  : 'Not started'}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-muted-foreground">
                      Checks may run in parallel. Ready means checks passed; review and merge may still be
                      pending.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {p.build === 'Failed' ? 'What went wrong' : 'Latest result'}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{p.outcome}</p>
                    <div className="mt-3 flex gap-2">
                      <span className="font-medium">Deployment</span>
                      <span>{p.deploy}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {p.merged
                        ? 'Dev only. Production has not changed.'
                        : 'Merge and deployment are separate steps.'}
                    </p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-muted-foreground">
                        Technical details & timestamps
                      </summary>
                      <p className="mt-2 break-words font-mono text-muted-foreground">{p.technical}</p>
                      <p className="mt-2">Commit: {exactTime(p.committedAt)}</p>
                      <p>Merge: {p.mergedAt ? exactTime(p.mergedAt) : 'Not merged'}</p>
                    </details>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Row lines show milestones: checks → review → merge. Green full line = merged, not deployed.
              Progress is by stage, not time. Sample data and queue order; no confirmed merge time.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
const meta = {
  title: 'Mockups/Ops CI',
  component: CiMock,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof CiMock>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = { args: { viewer: 'Lee' } }
export const NeedsAFix: Story = { args: { initial: 104 } }
export const WaitingForReview: Story = { args: { initial: 102 } }
export const MergedAwaitingDeploy: Story = { args: { initial: 101 } }
export const Draft: Story = { args: { initial: 100 } }
export const WaitingForMachine: Story = { args: { initial: 99 } }
export const Empty: Story = { args: { mode: 'empty' } }
export const Unavailable: Story = { args: { mode: 'unavailable' } }
export const Stale: Story = { args: { mode: 'stale' } }
export const ReadyToMerge: Story = { args: { initialFilter: 'Merge queue' } }
export const BrowseByPerson: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('tab', { name: /^Lee/ }))
    await expect(canvas.queryByText('Ask the right questions when creating a site')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /^Merged/ }))
    await userEvent.click(canvas.getByRole('button', { name: 'Expand PR 101' }))
    await expect(canvas.getByRole('region', { name: 'Details for PR 101' })).toBeVisible()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search PRs' }), 'no match')
    await expect(canvas.getByText('No PRs to show')).toBeVisible()
    await expect(canvas.queryByRole('region')).not.toBeInTheDocument()
  }
}
export const SortAndExpand: Story = {
  play: async ({ canvas, userEvent }) => {
    const ids = () =>
      Array.from(canvas.getByRole('table').querySelectorAll('tr[data-pr]')).map((row) =>
        row.getAttribute('data-pr')
      )
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Commit' }))
    await expect(ids()[0]).toBe('100')
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Commit' }))
    await expect(ids()[0]).toBe('98')
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Merge' }))
    await expect(ids().slice(0, 2)).toEqual(['101', '98'])
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Merge' }))
    await expect(ids().slice(0, 2)).toEqual(['98', '101'])
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Build' }))
    await expect(ids().slice(0, 3)).toEqual(['104', '103', '99'])
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Author' }))
    await expect(ids().slice(0, 3)).toEqual(['100', '103', '107'])
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Brief' }))
    await expect(ids()[0]).toBe('103')
    await userEvent.click(canvas.getByRole('button', { name: 'Expand PR 104' }))
    await expect(
      within(canvas.getByRole('region', { name: 'Details for PR 104' })).getByText(
        'French text is missing for the new backup button.'
      )
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Expand PR 103' }))
    await expect(canvas.queryByRole('region', { name: 'Details for PR 104' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('region', { name: 'Details for PR 103' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close PR details' }))
    await expect(canvas.queryByRole('region')).not.toBeInTheDocument()
  }
}

export const RowClickAndProgress: Story = {
  play: async ({ canvas, userEvent }) => {
    const table = canvas.getByRole('table')
    const row = (id: number) => within(table.querySelector(`tr[data-pr="${id}"]`) as HTMLElement)
    await userEvent.click(row(103).getByText('David'))
    await expect(canvas.getByRole('region', { name: 'Details for PR 103' })).toBeVisible()
    await userEvent.click(row(104).getByText('Missing French translation'))
    await expect(canvas.getByRole('region', { name: 'Details for PR 104' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse PR 104' }))
    await expect(canvas.queryByRole('region')).not.toBeInTheDocument()
    await expect(
      canvas.queryByRole('progressbar', { name: 'Merge progress for PR 100' })
    ).not.toBeInTheDocument()
    await expect(
      canvas.queryByRole('progressbar', { name: 'Merge progress for PR 99' })
    ).not.toBeInTheDocument()
    await expect(canvas.getByRole('progressbar', { name: 'Merge progress for PR 103' })).toHaveAttribute(
      'aria-valuenow',
      '40'
    )
    await expect(canvas.getByRole('progressbar', { name: 'Merge progress for PR 108' })).toHaveAttribute(
      'aria-valuenow',
      '80'
    )
    await expect(canvas.getByRole('progressbar', { name: 'Merge progress for PR 101' })).toHaveAttribute(
      'aria-valuenow',
      '100'
    )
  }
}

export const SignedInMember: Story = {
  args: { viewer: 'David' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('tab', { name: /^David/ })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.queryByText('Make site backups easier to find')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('tab', { name: /^All/ }))
    await expect(canvas.getByText('Make site backups easier to find')).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: /^Hano/ }))
    await expect(canvas.queryByText('Ask the right questions when creating a site')).not.toBeInTheDocument()
  }
}
export const NotSignedIn: Story = {
  args: { viewer: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByText('Make site backups easier to find')).toBeVisible()
    await expect(canvas.getByText('Ask the right questions when creating a site')).toBeVisible()
  }
}
export const ManyMembers: Story = {
  args: {
    viewer: 'Samira',
    members: [
      'Lee',
      'David',
      'Hano',
      'Akemi',
      'Lucas',
      'Alex',
      'Ben',
      'Chloe',
      'Daniel',
      'Emma',
      'Felix',
      'Grace',
      'Hugo',
      'Isabel',
      'James',
      'Kai',
      'Lina',
      'Maya',
      'Nora',
      'Oliver',
      'Samira'
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('tab', { name: /^Samira/ })).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByText('No PRs to show')).toBeVisible()
  }
}
