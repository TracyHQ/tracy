// The production App Statistic screen on illustrative API records, never observations of real users.

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppStatistic } from '../../../../../web/tracy-harness/src/beta/AppStatistic'
import type {
  AppStatisticDetail,
  AppStatisticPayload,
  AppStatisticRow,
  AppStatisticView
} from '../../../../../web/tracy-harness/src/beta/app-statistic-api'

const USER = '11111111-1111-4111-8111-111111111111'
const INSTALL = '22222222-2222-4222-8222-222222222222'
const ANONYMOUS = '33333333-3333-4333-8333-333333333333'
const DOWNLOAD = '44444444-4444-4444-8444-444444444444'
const QUICKSTART = '55555555-5555-4555-8555-555555555555'
const ORPHAN_QUICKSTART = '66666666-6666-4666-8666-666666666666'
const TEMPLATE_PERSON = '77777777-7777-4777-8777-777777777777'
type FixtureMode = 'activity' | 'normal' | 'people' | 'empty' | 'error' | 'paging' | 'races' | 'session'
function records() {
  const now = Date.now()
  const at = (minutes: number) => new Date(now - minutes * 60000).toISOString()
  const common = {
    source: null,
    versions: ['0.8.4'],
    installs: 0,
    quickstarts: 0,
    firstSeen: at(120),
    lastSeen: at(12),
    attention: 0
  }
  const users: AppStatisticRow[] = [
    {
      ...common,
      id: USER,
      userId: USER,
      email: 'mia@example.com',
      name: 'Mia Chen',
      installs: 1,
      lastAppContact: common.lastSeen,
      lastOpened: at(5),
      daysUsed: 3,
      quickstarts: 1,
      attention: 1,
      source: { medium: 'blog', source: 'Newsletter' }
    }
  ]
  const installs: AppStatisticRow[] = [
    {
      ...common,
      id: INSTALL,
      installId: INSTALL,
      userId: USER,
      email: 'mia@example.com',
      version: '0.8.4',
      channel: 'stable',
      platform: 'macos',
      arch: 'arm64',
      osVersion: '15.6',
      linkedAt: at(90),
      account: 'linked',
      attention: 1
    },
    {
      ...common,
      id: ANONYMOUS,
      installId: ANONYMOUS,
      userId: null,
      email: null,
      version: '0.8.4',
      channel: 'stable',
      platform: 'macos',
      arch: 'arm64',
      linkedAt: null,
      account: 'unlinked'
    }
  ]
  const downloads: AppStatisticRow[] = [
    {
      ...common,
      id: DOWNLOAD,
      userId: null,
      email: null,
      requestedAt: at(5),
      firstSeen: at(5),
      lastSeen: at(5),
      version: '0.8.4',
      channel: 'stable',
      platform: 'macos',
      arch: 'arm64',
      file: 'Tracy-0.8.4-arm64.dmg',
      downloads: 1
    }
  ]
  const quickstarts: AppStatisticRow[] = [
    {
      ...common,
      id: QUICKSTART,
      userId: USER,
      email: 'mia@example.com',
      name: 'Mia Chen',
      versions: [],
      quickstarts: 1,
      requestedAt: at(8),
      firstSeen: at(8),
      lastSeen: at(8),
      template: 'ja-kinetic',
      cms: 'j6',
      templateUrl: 'https://www.joomlart.com/joomla/templates/ja-kinetic',
      releaseUrl: 'https://github.com/JoomlArt-Products/ja-products/releases/tag/quickstart/ja-kinetic/j6',
      referrer: 'https://www.joomlart.com/joomla/templates/ja-kinetic',
      source: { medium: 'blog', source: 'Newsletter' },
      attention: 1
    },
    {
      ...common,
      id: ORPHAN_QUICKSTART,
      userId: null,
      email: null,
      versions: [],
      quickstarts: 1,
      requestedAt: at(40),
      firstSeen: at(40),
      lastSeen: at(40),
      template: 'ja-purity',
      cms: 'wp',
      templateUrl: null,
      releaseUrl: 'https://github.com/JoomlArt-Products/ja-products/releases/tag/quickstart/ja-purity/wp',
      referrer: null
    }
  ]
  return { users, downloads, installs, quickstarts, at }
}
function anonymousDownload(row: AppStatisticRow) {
  return {
    id: row.id,
    source: row.source,
    versions: row.versions,
    downloads: 1,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    requestedAt: row.requestedAt,
    version: row.version,
    channel: row.channel,
    platform: row.platform,
    arch: row.arch,
    file: row.file
  }
}
function fixture(mode: FixtureMode) {
  const base = records()
  if (mode !== 'activity')
    for (const row of base.users) {
      row.lastOpened = null
      row.daysUsed = 0
    }
  let requests = 0
  if (mode === 'people') {
    base.users.push({
      ...base.users[0],
      id: TEMPLATE_PERSON,
      userId: TEMPLATE_PERSON,
      name: 'Alex Rivera',
      email: 'alex@example.com',
      installs: 0,
      versions: [],
      lastAppContact: null,
      lastOpened: null,
      daysUsed: 0,
      firstSeen: base.at(2),
      lastSeen: base.at(2),
      attention: 0,
      source: null
    })
    base.quickstarts.push({
      ...base.quickstarts[0],
      id: '88888888-8888-4888-8888-888888888888',
      userId: TEMPLATE_PERSON,
      name: 'Alex Rivera',
      email: 'alex@example.com',
      requestedAt: base.at(2),
      firstSeen: base.at(2),
      lastSeen: base.at(2),
      attention: 0,
      source: null
    })
  }
  if (mode === 'paging')
    for (let index = 0; index < 64; index++)
      base.installs.push({
        ...base.installs[1],
        id: `install-${index}`,
        installId: `install-${index}`,
        lastSeen: base.at(index + 30)
      })
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://example.invalid')
    if (mode === 'session' && ++requests > 1) return new Response(null, { status: 302 })
    if (mode === 'error') return new Response(null, { status: 503 })
    if (mode === 'races' && url.searchParams.get('q') === 'mia')
      await new Promise((resolve) => setTimeout(resolve, 800))
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const detailPath = /^\/api\/ops\/app-statistic\/(users|downloads|installs|quickstarts)\/([^/]+)$/.exec(
      url.pathname
    )
    if (detailPath) {
      const view = detailPath[1] as AppStatisticView
      const row = base[view].find((item) => item.id === decodeURIComponent(detailPath[2]))
      if (!row) return new Response(null, { status: 404 })
      if (view === 'downloads')
        return Response.json({ readAt: new Date().toISOString(), view, row: anonymousDownload(row) })
      const body: AppStatisticDetail = {
        readAt: new Date().toISOString(),
        view,
        row,
        installs:
          view === 'users'
            ? base.installs.filter((item) => item.userId === row.id)
            : view === 'installs'
              ? [row]
              : [],
        quickstarts:
          view === 'users'
            ? base.quickstarts.filter((item) => item.userId === row.id)
            : view === 'quickstarts'
              ? row.userId
                ? base.quickstarts.filter((item) => item.userId === row.userId)
                : [row]
              : [],
        activity: row.userId
          ? [{ id: 'event-1', kind: 'site.import', at: base.at(60), siteKey: 'example.com', data: {} }]
          : [],
        issues: row.attention
          ? [
              {
                siteKey: 'example.com',
                at: base.at(18),
                step: 'Import site',
                reason: 'The source site did not respond.'
              }
            ]
          : [],
        truncated: { installs: false, activity: false, issues: false }
      }
      return Response.json(body)
    }
    const view = (url.searchParams.get('view') || 'users') as AppStatisticView
    const days = url.searchParams.get('days') || '7'
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const account = view === 'downloads' ? 'all' : url.searchParams.get('account')
    const scoped = (rows: AppStatisticRow[]) =>
      rows.filter((row) => {
        const time = view === 'downloads' || view === 'quickstarts' ? row.requestedAt : row.lastSeen
        return (
          (days === 'all' || !time || Date.parse(time) > Date.now() - Number(days) * 86400000) &&
          (view === 'downloads' ||
            !url.searchParams.get('user') ||
            row.userId === url.searchParams.get('user')) &&
          (!url.searchParams.get('template') || row.template === url.searchParams.get('template')) &&
          (!url.searchParams.get('version') || row.versions.includes(url.searchParams.get('version')!)) &&
          (!url.searchParams.get('channel') || row.channel === url.searchParams.get('channel')) &&
          (!url.searchParams.get('source') ||
            (url.searchParams.get('source') === 'unknown'
              ? !row.source
              : row.source?.source === url.searchParams.get('source') ||
                row.source?.medium === url.searchParams.get('source'))) &&
          (!q ||
            `${row.id} ${row.email || ''} ${row.version || ''} ${row.template || ''}`
              .toLowerCase()
              .includes(q)) &&
          (account !== 'linked' || !!row.userId) &&
          (account !== 'unlinked' || !row.userId) &&
          (view === 'downloads' ||
            url.searchParams.get('attention') !== 'needs-attention' ||
            row.attention > 0)
        )
      })
    const allRows = mode === 'empty' ? [] : scoped(base[view])
    const sort = url.searchParams.get('sort') || (view === 'users' ? 'lastAppContact' : 'time')
    allRows.sort((a, b) => {
      const left =
        sort === 'daysUsed'
          ? (a.daysUsed ?? 0)
          : sort === 'lastOpened'
            ? a.lastOpened
            : sort === 'lastAppContact' && view === 'users'
              ? a.lastAppContact
              : sort === 'user'
                ? a.email || ''
                : sort === 'version'
                  ? a.version || a.versions[0] || ''
                  : a.lastSeen || ''
      const right =
        sort === 'daysUsed'
          ? (b.daysUsed ?? 0)
          : sort === 'lastOpened'
            ? b.lastOpened
            : sort === 'lastAppContact' && view === 'users'
              ? b.lastAppContact
              : sort === 'user'
                ? b.email || ''
                : sort === 'version'
                  ? b.version || b.versions[0] || ''
                  : b.lastSeen || ''
      if (left == null || right == null)
        return left == null && right == null ? a.id.localeCompare(b.id) : left == null ? 1 : -1
      return (
        (typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right))) *
          (url.searchParams.get('direction') === 'asc' ? 1 : -1) || a.id.localeCompare(b.id)
      )
    })
    const pageSize = Number(url.searchParams.get('pageSize') || 50)
    const pages = Math.max(1, Math.ceil(allRows.length / pageSize))
    const page = Math.min(pages, Number(url.searchParams.get('page') || 1))
    const body: AppStatisticPayload = {
      readAt: new Date().toISOString(),
      view,
      days,
      page,
      pageSize,
      pages,
      total: allRows.length,
      rows: allRows.slice((page - 1) * pageSize, page * pageSize),
      activityAvailable: mode === 'activity' && allRows.some((row) => !!row.lastOpened),
      activityMinimumVersion: '0.6.1',
      summary: {
        activeAppUsers: mode === 'activity' ? allRows.filter((row) => (row.daysUsed ?? 0) > 0).length : 0,
        ...(view === 'downloads'
          ? { downloads: allRows.length }
          : { users: new Set(allRows.map((row) => row.userId).filter(Boolean)).size }),
        installs: allRows.reduce((total, row) => total + (view === 'installs' ? 1 : row.installs), 0),
        quickstarts: allRows.reduce((total, row) => total + (row.quickstarts ?? 0), 0),
        linkedInstalls:
          view === 'installs'
            ? allRows.filter((row) => !!row.userId).length
            : allRows.reduce((total, row) => total + row.installs, 0),
        unlinkedInstalls: view === 'installs' ? allRows.filter((row) => !row.userId).length : 0
      },
      options: {
        versions: ['0.8.4'],
        channels: ['stable'],
        sources: ['unknown', 'Newsletter'],
        templates: ['ja-kinetic', 'ja-purity']
      },
      dateField: view === 'downloads' || view === 'quickstarts' ? 'requestedAt' : 'lastSeen',
      analytics: {
        previous: null,
        previousDaily: [],
        daily: [],
        range: {
          start: null,
          end: new Date().toISOString(),
          previousStart: null,
          previousEnd: null,
          timeZone: 'Asia/Ho_Chi_Minh',
          partialEnd: true
        },
        dateField: view === 'downloads' || view === 'quickstarts' ? 'requestedAt' : 'lastSeen'
      }
    }
    if (view === 'downloads') {
      const { activeAppUsers, downloads } = body.summary
      return Response.json({
        ...body,
        rows: body.rows.map(anonymousDownload),
        summary: { activeAppUsers, downloads }
      })
    }
    return Response.json(body)
  }) as typeof fetch
}
function Screen({
  mode = 'normal',
  initialView = 'users',
  initialSelection = null
}: {
  mode?: FixtureMode
  initialView?: AppStatisticView
  initialSelection?: string | null
}) {
  const fetchImpl = useMemo(() => fixture(mode), [mode])
  return <AppStatistic fetchImpl={fetchImpl} initialView={initialView} initialSelection={initialSelection} />
}
const meta = {
  title: 'Screens/App/Desktop App Statistics',
  component: Screen,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Screen>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = {}
export const PeopleStatusAndContact: Story = {
  args: { mode: 'people' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Mia Chen')
    const table = canvasElement.querySelector<HTMLTableElement>('[data-signal-table="app-records"]')
    await expect(table).not.toBeNull()
    const people = within(table!)
    for (const label of [
      'Person',
      'App status',
      'App version',
      'Came from',
      'Template packages',
      'Site problems'
    ])
      await expect(people.getByRole('columnheader', { name: new RegExp(`^${label}`) })).toBeVisible()
    await expect(people.getByRole('columnheader', { name: /^Last app connection/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    )
    const rows = people.getAllByRole('row').slice(1)
    await expect(rows).toHaveLength(2)
    await expect(within(rows[0]).getByText('Mia Chen')).toBeVisible()
    await expect(within(rows[0]).getByText('Signed in to app')).toBeVisible()
    await expect(rows[0].querySelector('time')).toHaveTextContent(/\d+ min ago/)
    await expect(rows[0].querySelector('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    await expect(rows[0].querySelector('time')).toHaveAttribute('title', /UTC\+7$/)
    await expect(within(rows[1]).getByText('Alex Rivera')).toBeVisible()
    await expect(within(rows[1]).getByText('Template requests only')).toBeVisible()
    await expect(within(rows[1]).getByText('No app connection')).toBeVisible()
    await expect(
      people.queryByRole('columnheader', { name: /^Latest matching activity/ })
    ).not.toBeInTheDocument()
    await userEvent.hover(within(rows[0]).getByRole('button', { name: 'Person details' }))
    const portal = within(document.body)
    await userEvent.click(await portal.findByRole('button', { name: `Details ${USER}` }))
    await expect(await canvas.findByRole('complementary', { name: 'Record details' })).toBeVisible()
  }
}
export const UserDetails: Story = { args: { initialSelection: USER } }
export const Downloads: Story = {
  args: { initialView: 'downloads', initialSelection: DOWNLOAD },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('App download request')).toBeVisible()
    for (const label of ['Person', 'Related app copy', 'Known account'])
      await expect(
        canvas.queryByRole('columnheader', { name: new RegExp(`^${label}`) })
      ).not.toBeInTheDocument()
    await expect(canvas.queryByText('People requesting app downloads')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('heading', { name: 'Account activity' })).not.toBeInTheDocument()
  }
}
export const UnlinkedInstall: Story = {
  args: { initialView: 'installs', initialSelection: ANONYMOUS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No verified account linked. Name and email are unknown.')
    ).toBeVisible()
    await expect(
      canvas.getByText(
        'Linked means an account was associated with this install, not that it is online. Updates keep the same Install ID. Installation completion is unknown.'
      )
    ).toBeVisible()
  }
}
export const LinkedInstall: Story = { args: { initialView: 'installs', initialSelection: INSTALL } }
export const Empty: Story = {
  args: { mode: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('No matching records')).toBeVisible()
  }
}
export const Error: Story = {
  args: { mode: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('alert')).toHaveTextContent(
      'Could not read app statistics (503)'
    )
  }
}
export const NavigateViews: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '1 installs' }))
    await expect(await canvas.findByRole('table', { name: 'Installs' })).toBeVisible()
    await waitFor(() => expect(canvas.queryByText(ANONYMOUS.slice(0, 8))).not.toBeInTheDocument())
    await userEvent.click(canvas.getByRole('button', { name: 'User: mia@example.com' }))
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Account' }), 'unlinked')
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(1))
    await userEvent.click(canvas.getByRole('button', { name: `Details ${ANONYMOUS}` }))
    await expect(
      await canvas.findByText('No verified account linked. Name and email are unknown.')
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: 'Downloads' }))
    await userEvent.click(await canvas.findByRole('button', { name: `Details ${DOWNLOAD}` }))
    await expect(
      await canvas.findByText('Unknown. This does not mean the app was not installed.')
    ).toBeVisible()
    await expect(
      canvas.getByText('Download completion is unknown. Automatic updates are excluded.')
    ).toBeVisible()
  }
}
export const Paging: Story = {
  args: { mode: 'paging', initialView: 'installs' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(50))
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(16))
    await expect(canvas.getByText('Page 2 of 2')).toBeVisible()
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Items per page' }), '100')
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(66))
    await expect(canvas.getByText('Page 1 of 1')).toBeVisible()
  }
}
export const FilterRaces: Story = {
  args: { mode: 'races', initialView: 'installs' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('textbox', { name: 'Search app statistics' })
    await userEvent.click(await canvas.findByRole('button', { name: `Details ${INSTALL}` }))
    await expect(await canvas.findByRole('complementary', { name: 'Record details' })).toBeVisible()
    await userEvent.type(search, 'mia')
    await expect(canvas.queryByRole('complementary', { name: 'Record details' })).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await userEvent.clear(search)
    await userEvent.type(search, 'no-result')
    await expect(await canvas.findByText('No matching records')).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 900))
    await expect(canvas.getByText('No matching records')).toBeVisible()
    await expect(canvas.queryByText('mia@example.com')).not.toBeInTheDocument()
  }
}

export const AccountSourceNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Mia Chen')
    await userEvent.click(canvas.getByRole('button', { name: /^Filter$/ }))
    const screen = within(document.body)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Source filter' }), 'Newsletter')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(await canvas.findByRole('button', { name: '1 installs' }))
    await expect(await canvas.findByRole('button', { name: `Details ${INSTALL}` })).toBeVisible()
  }
}

export const SessionExpired: Story = {
  args: { mode: 'session' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Mia Chen')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Sign-in is required to refresh app statistics.'
    )
    await expect(canvas.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login?next=%2Fops%2Fapp-statistic'
    )
    await expect(canvas.queryByText('Mia Chen')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/Unexpected token/)).not.toBeInTheDocument()
  }
}

export const Quickstarts: Story = {
  args: { initialView: 'quickstarts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('table', { name: 'JA QS Download' })).toBeVisible()
    await expect(canvas.getByRole('tab', { name: 'JA QS Download' })).toHaveAttribute('aria-selected', 'true')
    await expect(
      await canvas.findByText(/Quickstart zip requests admitted by Tracy, not completed downloads\./)
    ).toBeVisible()
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(2))
    await expect(canvas.getByRole('columnheader', { name: 'Referrer' })).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'www.joomlart.com/joomla/templates/ja-kinetic' })
    ).toHaveAttribute('href', 'https://www.joomlart.com/joomla/templates/ja-kinetic')
    await expect(canvas.getByRole('link', { name: 'ja-kinetic' })).toHaveAttribute(
      'href',
      'https://www.joomlart.com/joomla/templates/ja-kinetic'
    )
    // A WordPress quickstart gets no guessed joomlart.com page; its release link still shows.
    await expect(canvas.queryByRole('link', { name: 'ja-purity' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('link', { name: 'GitHub' })).toHaveLength(2)
    await expect(canvas.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /^Filter$/ }))
    const screen = within(document.body)
    await expect(screen.queryByRole('combobox', { name: 'Version filter' })).not.toBeInTheDocument()
    await expect(screen.queryByRole('combobox', { name: 'Account filter' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Template filter' }), 'ja-purity')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(1))
    await userEvent.click(canvas.getByRole('button', { name: `Details ${ORPHAN_QUICKSTART}` }))
    await expect(
      await canvas.findByText(
        'The account that made this request no longer exists. Name and email are unknown.'
      )
    ).toBeVisible()
    await expect(canvas.getByText(/^No referring page recorded\./)).toBeVisible()
    await expect(canvas.getByText('No joomlart.com page link for this CMS.')).toBeVisible()
  }
}

// At 1440 px with the ops rail, the table gets ~650 px beside the panel: CMS and Release step
// aside (the panel repeats both) so Referrer and Account source stay inside the frame.
export const QuickstartsWithDetail: Story = {
  args: { initialView: 'quickstarts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = await canvas.findByRole('table', { name: 'JA QS Download' })
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(2))
    await expect(canvas.getByRole('columnheader', { name: 'CMS' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: `Details ${QUICKSTART}` }))
    await expect(await canvas.findByText('JA QS Download detail')).toBeVisible()
    await expect(canvas.queryByRole('columnheader', { name: 'CMS' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('columnheader', { name: 'Release' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('columnheader', { name: 'Referrer' })).toBeVisible()
    await expect(canvas.getByRole('columnheader', { name: 'Account source' })).toBeVisible()
    const referrer = within(table).getByRole('link', { name: 'www.joomlart.com/joomla/templates/ja-kinetic' })
    await expect(referrer).toHaveAttribute('title', 'https://www.joomlart.com/joomla/templates/ja-kinetic')
    await userEvent.click(canvas.getByRole('button', { name: `Details ${QUICKSTART}` }))
    await expect(await canvas.findByRole('columnheader', { name: 'CMS' })).toBeVisible()
  }
}

export const UserQuickstarts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('columnheader', { name: 'JA QS Download' })).toBeVisible()
    await userEvent.click(await canvas.findByRole('button', { name: '1 JA QS Download' }))
    await expect(await canvas.findByRole('table', { name: 'JA QS Download' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'User: mia@example.com' })).toBeVisible()
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /^Details / })).toHaveLength(1))
    await userEvent.click(canvas.getByRole('button', { name: `Details ${QUICKSTART}` }))
    await expect(await canvas.findByText('Quickstart requests by this account')).toBeVisible()
  }
}

export const ForegroundAppActivity: Story = {
  args: { mode: 'activity' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Mia Chen')
    const table = within(canvasElement.querySelector<HTMLTableElement>('[data-signal-table="app-records"]')!)
    const opened = table.getByRole('columnheader', { name: /^Last opened/ })
    const days = table.getByRole('columnheader', { name: /^Days used/ })
    await expect(opened).toBeVisible()
    await expect(days).toBeVisible()
    await userEvent.click(within(opened).getByRole('button'))
    await expect(opened).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(within(days).getByRole('button'))
    await expect(days).toHaveAttribute('aria-sort', 'ascending')
    await expect(canvas.queryByText(/No data yet, needs app version/)).not.toBeInTheDocument()
  }
}
