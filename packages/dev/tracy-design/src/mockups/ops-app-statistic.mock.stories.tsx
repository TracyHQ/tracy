// Can the team move between users, download requests and observed installs without confusing identity with installation?
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Badge,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  cn
} from '@tracy/ui'
import { ArrowUpDown, ChevronRight, Search, X } from 'lucide-react'

type View = 'Users' | 'Downloads' | 'Installs'
type Entry = {
  id: string
  user: string
  email: string
  version: string
  source: string
  time: number
  linked?: string
  account?: string
}
const people = [
  {
    id: 'mia',
    user: 'Mia Chen',
    email: 'mia@example.com',
    source: 'Blog',
    version: '0.8.4 · 0.8.3',
    time: 12
  },
  { id: 'alex', user: 'Alex Morgan', email: 'alex@example.com', source: 'Email', version: '0.8.4', time: 38 },
  { id: 'sara', user: 'Sara Kim', email: 'sara@example.com', source: 'Blog', version: '0.8.4', time: 5 },
  {
    id: 'dan',
    user: 'Daniel Park',
    email: 'daniel@example.com',
    source: 'Unknown',
    version: '0.8.3',
    time: 2880
  }
]
const installs: Entry[] = [
  { ...people[0], id: 'a18f-82c1', account: 'mia', version: '0.8.4', linked: 'Oct 8, 09:12' },
  { ...people[0], id: 'b22d-73a9', account: 'mia', version: '0.8.3', linked: 'Oct 5, 15:40', time: 180 },
  { ...people[1], id: 'c41e-65b2', account: 'alex', linked: 'Oct 7, 11:26' },
  { ...people[2], id: 'd13a-98f4', account: 'sara', linked: 'Oct 10, 08:15' },
  { ...people[3], id: 'e71c-18d5', account: 'dan', linked: 'Oct 4, 14:08' },
  { id: 'f92b-41e7', user: '', email: '', version: '0.8.4', source: 'Unknown', time: 43 },
  { id: 'a36d-29f8', user: '', email: '', version: '0.8.4', source: 'Unknown', time: 90 }
]
const downloads: Entry[] = [
  { id: 'DL-106', user: '', email: '', version: '0.8.4', source: 'Blog', time: 8 },
  { ...people[0], id: 'DL-105', account: 'mia', version: '0.8.4', linked: 'a18f-82c1', time: 2880 },
  { ...people[1], id: 'DL-104', account: 'alex', linked: 'c41e-65b2', time: 4320 },
  { id: 'DL-103', user: '', email: '', version: '0.8.4', source: 'Unknown', time: 5760 },
  { ...people[0], id: 'DL-102', account: 'mia', version: '0.8.3', linked: 'b22d-73a9', time: 7200 },
  { ...people[2], id: 'DL-101', account: 'sara', time: 180 }
]
const age = (minutes: number) =>
  minutes < 60
    ? `${minutes}m ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ago`
      : `${Math.floor(minutes / 1440)}d ago`

function AppStatisticMock({
  initialView = 'Users',
  initialAccount = 'All',
  initialSelection = null
}: {
  initialView?: View
  initialAccount?: string
  initialSelection?: string | null
}) {
  const [view, setView] = useState<View>(initialView)
  const [account, setAccount] = useState(initialAccount)
  const [selected, setSelected] = useState<string | null>(initialSelection)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  const [sort, setSort] = useState('Time')
  const [descending, setDescending] = useState(false)
  const [period, setPeriod] = useState('7')
  const [pageSize, setPageSize] = useState('50')
  const [version, setVersion] = useState('All')
  const [acquisition, setAcquisition] = useState('All')
  const [attention, setAttention] = useState(false)
  const filterCount = Number(version !== 'All') + Number(acquisition !== 'All') + Number(attention)
  const go = (next: View, user: string | null = null, detail: string | null = null) => {
    setView(next)
    setScope(user)
    setSelected(detail)
    setAccount('All')
    setQuery('')
  }
  const source: Entry[] = view === 'Users' ? people : view === 'Downloads' ? downloads : installs
  const rows = source
    .filter(
      (r) =>
        (!scope || (view === 'Users' ? r.id : r.account) === scope) &&
        (account === 'All' || (account === 'Linked' ? !!r.user : !r.user)) &&
        r.time < Number(period) * 1440 &&
        (version === 'All' || r.version.includes(version)) &&
        (acquisition === 'All' || r.source === acquisition) &&
        (!attention || (view === 'Users' ? r.id : r.account) === 'mia') &&
        `${r.id} ${r.user} ${r.email} ${r.version}`.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      const delta =
        sort === 'Time' || sort === 'Last seen'
          ? a.time - b.time
          : (sort === 'User' ? a.user : sort === 'Version' ? a.version : a.id).localeCompare(
              sort === 'User' ? b.user : sort === 'Version' ? b.version : b.id
            )
      return descending ? -delta : delta
    })
  const entry = source.find((r) => r.id === selected)
  const columns =
    view === 'Users'
      ? ['User', 'Downloads', 'Installs', 'Versions', 'Source', 'Last seen', 'Notes']
      : view === 'Downloads'
        ? ['Download', 'Time', 'User', 'Version', 'Platform', 'Source', 'Install']
        : ['Install', 'User', 'Version', 'Channel', 'Platform', 'Linked at', 'Last seen']
  const jump = (label: string, next: View, user: string | null, detail: string | null = null) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto px-0 text-xs"
      onClick={(e) => {
        e.stopPropagation()
        go(next, user, detail)
      }}
    >
      {label}
    </Button>
  )
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
        <span>
          <strong>tracy</strong>
          <span className="mx-3 text-muted-foreground">/ Operations /</span>App Statistic
        </span>
        <Badge variant="outline">Mockup · sample data</Badge>
      </header>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">App Statistic</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              aria-label="Search"
              placeholder="Search users, downloads, installs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72"
            />
            <select
              aria-label="Date"
              className="rounded-md border border-input bg-background px-3 py-2"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value)
                setSelected(null)
              }}
            >
              <option value="1">Date: Last 24 hours</option>
              <option value="7">Date: Last 7 days</option>
              <option value="30">Date: Last 30 days</option>
              <option value="36500">Date: All time</option>
            </select>

            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                Filter{filterCount ? ` · ${filterCount}` : ''}
              </PopoverTrigger>
              <PopoverContent align="end" className="space-y-4">
                <div className="font-medium">Filter records</div>
                <label className="block space-y-1 text-xs">
                  <span>Version</span>
                  <select
                    aria-label="Version filter"
                    className="w-full rounded-md border border-input bg-background p-2"
                    value={version}
                    onChange={(e) => {
                      setVersion(e.target.value)
                      setSelected(null)
                    }}
                  >
                    <option>All</option>
                    <option>0.8.4</option>
                    <option>0.8.3</option>
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span>Source</span>
                  <select
                    aria-label="Source filter"
                    className="w-full rounded-md border border-input bg-background p-2"
                    value={acquisition}
                    onChange={(e) => {
                      setAcquisition(e.target.value)
                      setSelected(null)
                    }}
                  >
                    <option>All</option>
                    <option>Blog</option>
                    <option>Email</option>
                    <option>Unknown</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={attention}
                    onChange={(e) => {
                      setAttention(e.target.checked)
                      setSelected(null)
                    }}
                  />
                  Needs attention
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVersion('All')
                    setAcquisition('All')
                    setAttention(false)
                    setAccount('All')
                    setScope(null)
                    setSelected(null)
                  }}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Desktop · Sample snapshot: October 10, 2026 · Download tracking and attribution are proposed. Date
          applies to download time or last app contact.
        </p>
        <Tabs value={view} onValueChange={(v) => go(v as View)}>
          <TabsList>
            <TabsTrigger value="Users">Users · 4</TabsTrigger>
            <TabsTrigger value="Downloads">Downloads · 6</TabsTrigger>
            <TabsTrigger value="Installs">Installs · 7</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button variant="outline" size="sm" onClick={() => go('Users')}>
            Signed-in users · 4
          </Button>
          {view !== 'Users' && (
            <select
              aria-label="Account"
              value={account}
              onChange={(e) => {
                setAccount(e.target.value)
                setSelected(null)
              }}
              className="rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="All">Account: All</option>
              <option value="Linked">Account: Linked</option>
              <option value="Not linked">Account: Not linked</option>
            </select>
          )}
          {view !== 'Users' && (
            <span className="text-muted-foreground">Account link, not current sign-in status</span>
          )}
          {scope && (
            <Button variant="secondary" size="sm" onClick={() => setScope(null)}>
              User: {people.find((p) => p.id === scope)?.user}
              <X className="size-3" />
            </Button>
          )}
          <span className="ml-auto text-muted-foreground">
            {rows.length} {view.toLowerCase()}
            {view === 'Downloads' ? ' · Requests, not completed transfers' : ''}
          </span>
        </div>
        <div className={cn('grid items-start gap-4', entry && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
          <div className="min-w-0 overflow-hidden rounded-lg border border-border">
            <Table className="min-w-[850px] text-xs" aria-label={view}>
              <TableHeader className="bg-muted/50">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-9">
                    <span className="sr-only">Details</span>
                  </TableHead>
                  {columns.map((c) => (
                    <TableHead key={c}>
                      {['User', 'Time', 'Last seen', 'Version', 'Download', 'Install'].includes(c) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-0 text-xs"
                          onClick={() => {
                            setSort(c)
                            setDescending(sort === c ? !descending : false)
                          }}
                        >
                          {c}
                          <ArrowUpDown className="size-3" />
                        </Button>
                      ) : (
                        c
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelected(selected === r.id ? null : r.id)}
                    className={cn('border-border cursor-pointer', selected === r.id && 'bg-muted/60')}
                  >
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-6" aria-label={`Details ${r.id}`}>
                        <ChevronRight className={cn('size-3', selected === r.id && 'rotate-90')} />
                      </Button>
                    </TableCell>
                    {view === 'Users' ? (
                      <>
                        <TableCell className="font-medium">
                          {r.user}
                          <div className="font-normal text-muted-foreground">{r.email}</div>
                        </TableCell>
                        <TableCell>
                          {jump(
                            `${downloads.filter((d) => d.account === r.id).length} downloads`,
                            'Downloads',
                            r.id
                          )}
                        </TableCell>
                        <TableCell>
                          {jump(
                            `${installs.filter((i) => i.account === r.id).length} installs`,
                            'Installs',
                            r.id
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{r.version}</TableCell>
                        <TableCell>{r.source}</TableCell>
                        <TableCell>{age(r.time)}</TableCell>
                        <TableCell className={r.id === 'mia' ? 'text-destructive' : 'text-muted-foreground'}>
                          {r.id === 'mia' ? 'Site import failed' : '—'}
                        </TableCell>
                      </>
                    ) : view === 'Downloads' ? (
                      <>
                        <TableCell className="font-mono">{r.id}</TableCell>
                        <TableCell>{age(r.time)}</TableCell>
                        <TableCell>
                          {r.account ? (
                            jump(r.user, 'Users', null, r.account)
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>{r.version}</TableCell>
                        <TableCell>macOS · ARM64</TableCell>
                        <TableCell>{r.source}</TableCell>
                        <TableCell>
                          {r.linked ? (
                            jump('Linked →', 'Installs', null, r.linked)
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-mono">{r.id}</TableCell>
                        <TableCell>
                          {r.account ? (
                            jump(r.user, 'Users', null, r.account)
                          ) : (
                            <span className="text-muted-foreground">Not linked</span>
                          )}
                        </TableCell>
                        <TableCell>{r.version}</TableCell>
                        <TableCell>Stable</TableCell>
                        <TableCell>macOS · ARM64</TableCell>
                        <TableCell>{r.linked || '—'}</TableCell>
                        <TableCell>{age(r.time)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No matching records
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
              <span>{rows.length} records</span>
              <div className="flex items-center gap-3">
                <select
                  aria-label="Items per page"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  className="bg-background"
                >
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
                <span>Page 1 of 1</span>
                <Button size="sm" variant="outline" disabled>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Next
                </Button>
              </div>
            </div>
          </div>
          {entry && (
            <aside
              aria-label="Record details"
              className="space-y-5 rounded-lg border border-border bg-card p-5 text-xs text-card-foreground lg:sticky lg:top-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-sm font-semibold">{view === 'Users' ? entry.user : entry.id}</h2>
                  <p className="mt-1 text-muted-foreground">{entry.email || 'Identity unknown'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Close details"
                  onClick={() => setSelected(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {view === 'Users' ? (
                <>
                  <div>
                    <h3 className="mb-2 font-medium">App installs</h3>
                    {installs
                      .filter((i) => i.account === entry.id)
                      .map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between border-b border-border py-2"
                        >
                          {jump(i.id, 'Installs', null, i.id)}
                          <span>{i.version}</span>
                        </div>
                      ))}
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium">Downloads</h3>
                    {jump('View download requests →', 'Downloads', entry.id)}
                    <p className="mt-1 text-muted-foreground">Illustrative attribution; not yet tracked.</p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium">Account activity</h3>
                    <p>{entry.id === 'mia' ? 'Site import failed · 18m ago' : 'Desktop account linked'}</p>
                    <p className="mt-2 text-muted-foreground">
                      Account activity may come from web or desktop.
                    </p>
                  </div>
                </>
              ) : view === 'Downloads' ? (
                <>
                  <div>
                    <h3 className="mb-2 font-medium">Download request</h3>
                    <p>{entry.version} · macOS · Stable</p>
                    <p className="mt-2 text-muted-foreground">
                      Source: {entry.source} · {age(entry.time)}
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium">Related account</h3>
                    {entry.account ? (
                      jump(entry.user + ' →', 'Users', null, entry.account)
                    ) : (
                      <p>No verified account linked.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium">Related install</h3>
                    {entry.linked ? (
                      jump(entry.linked + ' →', 'Installs', null, entry.linked)
                    ) : (
                      <p>Unknown. This does not mean the app was not installed.</p>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    Completion of the download is unknown. Automatic updates are excluded from this view.
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 font-medium">Observed app</h3>
                    <p>{entry.version} · Stable · macOS</p>
                    <p className="mt-2 text-muted-foreground">Last server contact: {age(entry.time)}</p>
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium">Account link</h3>
                    {entry.account ? (
                      <>
                        {jump(entry.user + ' →', 'Users', null, entry.account)}
                        <p className="mt-2">Linked at {entry.linked}</p>
                      </>
                    ) : (
                      <>
                        <p>Not linked</p>
                        <p className="mt-2 text-muted-foreground">
                          Name and email unknown. This is not a Free account classification.
                        </p>
                      </>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    App observed by the server. Installation completion and current sign-in status are
                    unknown.
                  </p>
                </>
              )}
            </aside>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Sample data only. One install is an app instance, not necessarily one person or physical device.
        </p>
      </div>
    </main>
  )
}
const meta = {
  title: 'Mockups/Ops App Statistic',
  component: AppStatisticMock,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof AppStatisticMock>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const UserDetails: Story = { args: { initialSelection: 'mia' } }
export const Downloads: Story = { args: { initialView: 'Downloads', initialSelection: 'DL-106' } }
export const UnlinkedInstall: Story = {
  args: { initialView: 'Installs', initialAccount: 'Not linked', initialSelection: 'f92b-41e7' }
}
export const LinkedInstall: Story = {
  args: { initialView: 'Installs', initialAccount: 'Linked', initialSelection: 'a18f-82c1' }
}
export const NavigateViews: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: '2 downloads' })[0])
    await expect(canvas.getByRole('table', { name: 'Downloads' })).toBeVisible()
    await expect(canvas.queryByText('DL-106')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('tab', { name: 'Installs · 7' }))
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Account' }), 'Not linked')
    await expect(canvas.queryByText('Mia Chen')).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Details f92b-41e7' }))
    await expect(
      canvas.getByText('Name and email unknown. This is not a Free account classification.')
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Signed-in users · 4' }))
    await expect(canvas.getByRole('table', { name: 'Users' })).toBeVisible()
  }
}
