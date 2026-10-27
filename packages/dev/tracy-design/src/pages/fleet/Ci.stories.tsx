// The real staff CI screen on illustrative API responses; no fixture is a GitHub observation.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within, userEvent, waitFor } from 'storybook/test'
import { useMemo } from 'react'
import { Ci } from '../../../../../web/tracy-harness/src/Ci'
import type { CiPayload, CiRow } from '../../../../../web/tracy-harness/src/ci-api'

const states = ['Ready to merge', 'Testing', 'Needs a fix', 'Merged', 'Draft']
function payload(viewer: string | null = null): CiPayload {
  const now = Date.now()
  const rows: CiRow[] = states.map((state, index) => ({
    id: 108 - index,
    unread: false,
    readAt: new Date(now).toISOString(),
    title: [
      'Make site backups easier to find',
      'Improve the site creation flow',
      'Keep translated labels complete',
      'Show the latest site update',
      'Improve mobile navigation'
    ][index],
    url: `https://github.com/TracyHQ/tch/pull/${108 - index}`,
    authorId: index % 2 ? '2' : '1',
    author: index % 2 ? 'David' : 'Lee',
    login: index % 2 ? 'david' : 'lee',
    commit: 'b108e3f8abcdef0123456789',
    committedAt: new Date(now - (index + 1) * 60000).toISOString(),
    mergedAt: state === 'Merged' ? new Date(now - 180000).toISOString() : null,
    target: 'develop',
    state,
    build: ['Ready', 'Building', 'Failed', 'Ready', 'Not started'][index],
    next: [
      'Waiting for its turn in the merge queue.',
      'Wait for the running checks to finish.',
      'The author needs to fix the failed check, then run checks again.',
      'Merged. Deployment is checked separately.',
      'The author is still working on this PR.'
    ][index],
    merged: state === 'Merged',
    queue: index === 0 ? 1 : null,
    queuedAt: index === 0 ? new Date(now - 60000).toISOString() : null,
    queueState: index === 0 ? 'QUEUED' : null,
    estimateSeconds: null,
    queueEnabled: true,
    mergeState: 'CLEAN',
    review: null,
    checksComplete: true,
    checks:
      index === 4
        ? []
        : [
            {
              id: '1',
              name: 'build check (checks)',
              workflow: 'Tracy CI',
              status: index === 1 ? 'IN_PROGRESS' : 'COMPLETED',
              conclusion: index === 1 ? null : index === 2 ? 'FAILURE' : 'SUCCESS',
              url: 'https://github.com/TracyHQ/tch/actions/runs/10',
              startedAt: new Date(now - 60000).toISOString(),
              completedAt: null,
              summary: index === 2 ? 'French text is missing for the new backup label.' : null,
              steps:
                index === 1
                  ? [
                      {
                        name: 'Run regression checks',
                        number: 4,
                        status: 'IN_PROGRESS',
                        conclusion: null,
                        startedAt: new Date(now - 60000).toISOString(),
                        completedAt: null
                      }
                    ]
                  : []
            }
          ],
    progress:
      index === 4
        ? null
        : {
            value: [85, 35, 40, 100][index],
            label: state,
            tone: ['waiting', 'running', 'failed', 'done'][index]
          },
    deployment: {
      label: index === 3 ? 'Updating dev' : 'Not deployed',
      stage: index === 3 ? 'Deploying' : null,
      checks: []
    },
    note: [
      'Queue #1',
      'Running regression checks',
      'Missing French translation',
      'Updating dev',
      'Author still working'
    ][index],
    detail: index === 0 ? 'Checks passed on the latest commit.' : 'Latest check results from GitHub.',
    outcome:
      index === 2
        ? 'French text is missing for the new backup label.'
        : 'Check the status and next action above.'
  }))
  for (const row of rows) {
    const active = row.build === 'Building'
    const started = row.build !== 'Not started'
    row.execution = {
      jobs: !started
        ? []
        : Array.from({ length: active ? 2 : 1 }, (_, jobIndex) => ({
            id: String(jobIndex + 1),
            name: jobIndex ? 'Application tests' : 'Quality and safety checks',
            workflow: 'Tracy CI',
            runId: 10,
            runAttempt: 1,
            status: active ? 'IN_PROGRESS' : 'COMPLETED',
            conclusion: active ? null : row.build === 'Failed' ? 'FAILURE' : 'SUCCESS',
            url: 'https://github.com/TracyHQ/tch/actions/runs/10/job/1',
            summary: null,
            startedAt: new Date(now - 180000).toISOString(),
            completedAt: active ? null : new Date(now - 60000).toISOString(),
            runner: {
              id: jobIndex + 57,
              name: `aws-dev-check-0${jobIndex + 1}`,
              status: 'online',
              busy: active
            },
            labels: ['self-hosted', 'tracy-check'],
            measuredAt: new Date(now).toISOString(),
            steps: [
              {
                name: jobIndex ? 'Test site creation' : 'Run regression checks',
                number: 6,
                status: active ? 'IN_PROGRESS' : 'COMPLETED',
                conclusion: active ? null : row.build === 'Failed' ? 'FAILURE' : 'SUCCESS',
                startedAt: new Date(now - 120000).toISOString(),
                completedAt: active ? null : new Date(now - 60000).toISOString()
              }
            ]
          })),
      complete: true,
      error: null,
      runnerError: null,
      runnersMeasuredAt: new Date(now).toISOString()
    }
  }
  return {
    rows,
    members: [
      { id: '1', name: 'Lee', login: 'lee' },
      { id: '2', name: 'David', login: 'david' }
    ],
    viewer: { authorId: viewer, linked: Boolean(viewer) },
    repo: 'TracyHQ/tch',
    measuredAt: new Date(now).toISOString(),
    truncated: false,
    recentMergedLimit: 30,
    stale: false,
    error: null,
    configured: true
  }
}
function doors(data: CiPayload): typeof fetch {
  return async (input, init) => {
    const path = new URL(String(input), 'http://ci.test').pathname
    if (path === '/api/ops/ci/read' && init?.method === 'PUT') {
      const { numbers } = JSON.parse(String(init.body)) as { numbers: number[] }
      const readAt = new Date().toISOString()
      const states = numbers.map((id) => ({ id, unread: false, readAt }))
      for (const row of data.rows) if (numbers.includes(row.id)) Object.assign(row, { unread: false, readAt })
      return new Response(JSON.stringify({ states }), { headers: { 'content-type': 'application/json' } })
    }
    const id = Number(path.split('/').at(-1))
    return new Response(
      JSON.stringify(
        path === '/api/ops/ci'
          ? data
          : { row: data.rows.find((row) => row.id === id), measuredAt: data.measuredAt }
      ),
      { headers: { 'content-type': 'application/json' } }
    )
  }
}
const meta = { title: 'Ops / CI', component: Ci, parameters: { layout: 'fullscreen' } } satisfies Meta<
  typeof Ci
>
export default meta
type Story = StoryObj<typeof meta>
export const AllMembers: Story = {
  args: { fetchImpl: doors(payload()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'All PRs 5' }))
    const brief = await canvas.findByText('Make site backups easier to find')
    const row = brief.closest('tr')!
    await userEvent.click(within(row).getByText('Lee'))
    await expect(canvas.findByText('View in GH')).resolves.toBeVisible()
    await expect(canvas.getByText('Checks on commit b108e3f8')).toBeVisible()
  }
}
export const SignedInMember: Story = {
  args: { fetchImpl: doors(payload('1')) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Needs attention 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(canvas.getByRole('heading', { name: /^CI$/ })).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'Search PRs' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '5. Merged / Building image 0' })).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'Issues to review' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Copy to send to Agent' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Copy all issues to Agent' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'All PRs 3' }))
    await canvas.findByText('Make site backups easier to find')
    await expect(canvas.queryByText('Improve the site creation flow')).not.toBeInTheDocument()
  }
}
export const Empty: Story = { args: { fetchImpl: doors({ ...payload(), rows: [] }) } }
export const Unconfigured: Story = {
  args: {
    fetchImpl: doors({
      ...payload(),
      rows: [],
      measuredAt: null,
      configured: false,
      error: 'CI GitHub access is not configured.'
    })
  }
}
export const Stale: Story = {
  args: { fetchImpl: doors({ ...payload(), stale: true, error: 'GitHub CI data could not be refreshed.' }) }
}
export const ManyMembers: Story = {
  args: {
    fetchImpl: doors({
      ...payload('1'),
      members: Array.from({ length: 24 }, (_, i) => ({
        id: String(i + 1),
        name: i === 0 ? 'Lee' : `Member ${i + 1}`,
        login: null
      }))
    })
  }
}

export const NoMergeQueue: Story = {
  args: {
    fetchImpl: doors({
      ...payload(),
      rows: payload().rows.map((row) => ({
        ...row,
        queue: null,
        queueEnabled: false,
        queueState: null,
        queuedAt: null
      }))
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '2. Waiting to run 0' }))
    await expect(canvas.getByText('No PRs currently have CI jobs waiting to run.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '4. Awaiting merge 1' }))
    await expect(canvas.getByText('Make site backups easier to find')).toBeVisible()
  }
}

export const ParallelJobs: Story = {
  args: { fetchImpl: doors(payload()), initial: 107 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'All PRs 5' }))
    await canvas.findByRole('region', { name: 'Details for PR 107' })
    await expect(canvas.getByRole('button', { name: 'Sort by Build' })).toBeVisible()
    const resize = canvas.getByRole('separator', { name: 'Resize Brief column' })
    resize.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(resize).toHaveAttribute('aria-valuenow', '300')
    await expect(canvas.getByText('2 jobs running', { exact: true })).toBeVisible()
    await expect(canvas.getByText('2 runners', { exact: true })).toBeVisible()
    await expect(canvas.getByText('Runner: aws-dev-check-01 · Online · busy')).toBeVisible()
  }
}
function unavailableExecution(runnersOnly = false) {
  const data = payload()
  for (const row of data.rows)
    if (row.execution) {
      row.execution.runnerError = 'Runner availability could not be read.'
      row.execution.runnersMeasuredAt = null
      row.execution.jobs = row.execution.jobs.map((job) => ({
        ...job,
        runner: job.runner ? { ...job.runner, status: 'unknown', busy: null } : null
      }))
      if (!runnersOnly) {
        row.execution.jobs = []
        row.execution.complete = false
        row.execution.error = 'Job details could not be read from GitHub.'
      }
    }
  data.runnerStatus = { measuredAt: null, error: 'Runner availability could not be read.' }
  return data
}
export const RunnerAvailabilityUnknown: Story = {
  args: { fetchImpl: doors(unavailableExecution(true)), initial: 107 }
}
export const JobDetailsUnavailable: Story = {
  args: { fetchImpl: doors(unavailableExecution()), initial: 107 }
}
export const WaitingForRunner: Story = {
  args: {
    fetchImpl: doors({
      ...payload(),
      rows: payload().rows.map((row) =>
        row.id !== 107
          ? row
          : {
              ...row,
              build: 'Queued',
              state: 'Waiting to start',
              execution: {
                ...row.execution!,
                jobs: row.execution!.jobs.map((job) => ({
                  ...job,
                  status: 'QUEUED',
                  startedAt: null,
                  completedAt: null,
                  runner: null,
                  steps: []
                }))
              }
            }
      )
    }),
    initial: 107
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '2. Waiting to run 1' }))
    await canvas.findByText('2 jobs waiting', { exact: true })
    await expect(canvas.getByText('Not assigned', { exact: true })).toBeVisible()
  }
}

function failureStory(name: string, conclusion: string, merged = false): Story {
  const data = payload()
  const row = data.rows[2]
  row.merged = merged
  row.state = merged ? 'Merged' : 'Needs a fix'
  row.mergedAt = merged ? new Date().toISOString() : null
  row.checks = [{ ...row.checks[0], name, conclusion, status: 'COMPLETED', steps: [] }]
  return { args: { fetchImpl: doors(data), initial: row.id } }
}
export const AuthorReviewNeeded = failureStory('Regression', 'FAILURE')
export const CiReviewNeeded = failureStory('Build check', 'STARTUP_FAILURE')
export const FailureCauseUnknown = failureStory('Build check', 'TIMED_OUT')
export const MergedWithFailedChecks = failureStory('Regression', 'FAILURE', true)

function makeLiveDoor(): typeof fetch {
  const baseline = payload('1')
  const added: CiRow = {
    ...baseline.rows[2],
    id: 109,
    unread: true,
    readAt: null,
    title: 'A newly opened PR',
    url: 'https://github.com/TracyHQ/tch/pull/109',
    committedAt: new Date().toISOString()
  }
  const updated = { ...baseline, rows: [added, ...baseline.rows] }
  let listReads = 0
  return async (input, init) => {
    if (new URL(String(input), 'http://ci.test').pathname === '/api/ops/ci') listReads++
    return doors(listReads < 2 ? baseline : { ...updated, measuredAt: new Date().toISOString() })(input, init)
  }
}
function LiveUpdatesPreview() {
  const fetchImpl = useMemo(makeLiveDoor, [])
  return <Ci fetchImpl={fetchImpl} />
}
export const LiveUpdates: Story = {
  render: () => <LiveUpdatesPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Needs attention 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await canvas.findByText('1 unread · Read status is saved for your account', {}, { timeout: 40000 })
    await expect(
      within(canvas.getByRole('table', { name: 'Pull requests' })).getByText('New', { exact: true })
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Mark all as read' }))
    await expect(canvas.queryByText('New', { exact: true })).not.toBeInTheDocument()
  }
}

// A complete scoped history fixture exercises the real screen's paging and query parameters.
function historyDoor(): typeof fetch {
  const data = payload(),
    baseline = data.rows[0],
    now = Date.now()
  const rows: CiRow[] = Array.from({ length: 156 }, (_, i) => ({
    ...baseline,
    id: 1200 - i,
    title: `History change ${i + 1}`,
    target: ['develop', 'staging', 'main'][i % 3],
    updatedAt: new Date(now - i * 7 * 60000).toISOString(),
    createdAt: new Date(now - (i + 1) * 86400000).toISOString(),
    authorId: i % 2 ? '2' : '1',
    author: i % 2 ? 'David' : 'Lee'
  }))
  return async (input) => {
    const url = new URL(String(input), 'http://ci.test')
    const params = url.searchParams,
      branch = params.get('branch'),
      field = params.get('dateField') ?? 'updated',
      range = params.get('range') ?? '24h'
    const days = ({ '24h': 1, '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[range]
    const from = params.get('from') ? Date.parse(params.get('from')!) : days ? now - days * 86400000 : null
    const to = params.get('to') ? Date.parse(params.get('to')!) : null
    const filtered = rows.filter((row) => {
      if (branch && branch !== 'All' && row.target !== branch) return false
      const event = field === 'created' ? row.createdAt : field === 'merged' ? row.mergedAt : row.updatedAt
      const time = Date.parse(event ?? '')
      return (
        (from === null && to === null) ||
        (Number.isFinite(time) && (from === null || time >= from) && (to === null || time < to))
      )
    })
    return new Response(
      JSON.stringify(
        url.pathname === '/api/ops/ci'
          ? { ...data, rows: filtered, recentMergedLimit: null }
          : { row: rows.find((row) => row.id === Number(url.pathname.split('/').at(-1))) }
      ),
      { headers: { 'content-type': 'application/json' } }
    )
  }
}
export const HistoryAndPaging: Story = {
  args: { fetchImpl: historyDoor() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('1–50 of 156 PRs')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }))
    await expect(await canvas.findByText('51–100 of 156 PRs')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await expect(await canvas.findByText('51–100 of 156 PRs')).toBeVisible()
    await userEvent.selectOptions(canvas.getByLabelText('Page'), '4')
    await expect(await canvas.findByText('151–156 of 156 PRs')).toBeVisible()
    await userEvent.selectOptions(canvas.getByLabelText('Branch'), 'develop')
    await expect(await canvas.findByText('1–50 of 52 PRs')).toBeVisible()
    await userEvent.selectOptions(canvas.getByLabelText('Items per page'), '25')
    await expect(await canvas.findByText('1–25 of 52 PRs')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^Filter/ }))
    const body = within(document.body)
    await userEvent.selectOptions(await body.findByLabelText('Date field'), 'created')
    await userEvent.click(body.getByRole('button', { name: 'Apply' }))
    await expect(await canvas.findByText('1–1 of 1 PRs')).toBeVisible()
  }
}

// The same fixture keeps read records across refreshes, like the account-backed API.
export const ReadUnread: Story = {
  args: {
    fetchImpl: (() => {
      const data = payload()
      const baseline = data.rows[0]
      data.rows = Array.from({ length: 65 }, (_, i) => ({
        ...baseline,
        id: 2000 + i,
        title: `Unread change ${i + 1}`,
        unread: true,
        readAt: null
      }))
      return doors(data)
    })()
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('65 unread · Read status is saved for your account')
    await userEvent.click(canvas.getByRole('button', { name: 'Mark all as read' }))
    await canvas.findByText('0 unread · Read status is saved for your account')
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }))
    await expect(await canvas.findByText('51–65 of 65 PRs')).toBeVisible()
    await expect(canvas.queryByText('New', { exact: true })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await canvas.findByText('0 unread · Read status is saved for your account')
  }
}

export const AutoRead: Story = {
  args: {
    fetchImpl: (() => {
      const data = payload()
      data.rows = data.rows.slice(0, 2).map((row) => ({ ...row, unread: true, readAt: null }))
      return doors(data)
    })()
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('2 unread · Read status is saved for your account')
    const row = canvasElement.querySelector<HTMLElement>('tr[data-pr="108"]')!
    await expect(row).toHaveAttribute('data-read-state', 'unread')
    row.querySelector<HTMLButtonElement>('button')!.focus()
    await waitFor(() => expect(row).toHaveAttribute('data-read-state', 'read'), { timeout: 4000 })
    await expect(within(row).queryByText('New', { exact: true })).not.toBeInTheDocument()
    await expect(row.querySelector('td')).toHaveStyle({ fontWeight: '400' })
  }
}
