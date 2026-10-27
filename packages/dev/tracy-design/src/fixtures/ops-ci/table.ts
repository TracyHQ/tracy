// All timestamps, hashes and queue positions are illustrative, frozen at this snapshot.
import { changes, mergeQueue } from './changes'
export const snapshot = Date.parse('2026-10-08T10:30:00Z')
const commitTimes: Record<number, string> = {
  108: '10:22',
  107: '10:14',
  106: '10:05',
  105: '09:50',
  104: '10:26',
  103: '10:12',
  102: '09:45',
  101: '09:30',
  100: '10:28',
  99: '09:20'
}
export const buildOrder = ['Failed', 'Building', 'Queued', 'Ready', 'Not started']
export const tableRows = changes.map((p) => ({
  ...p,
  commit: p.id === 103 ? 'c7a4b21' : `b${p.id}e3f8`,
  committedAt: Date.parse(`2026-10-08T${commitTimes[p.id]}:00Z`),
  mergedAt: p.merged ? Date.parse('2026-10-08T10:18:00Z') : null,
  queue: mergeQueue.find((q) => q.id === p.id)?.position ?? null,
  build:
    p.state === 'Needs a fix'
      ? 'Failed'
      : p.state === 'Testing'
        ? 'Building'
        : p.state === 'Waiting to start'
          ? 'Queued'
          : p.state === 'Draft'
            ? 'Not started'
            : 'Ready',
  deploy: p.merged ? 'Updating dev' : 'Not deployed',
  note:
    p.state === 'Needs a fix'
      ? 'Missing French translation'
      : p.state === 'Testing'
        ? 'Regression checks · 6 min'
        : p.state === 'Waiting for review'
          ? 'Needs reviewer approval'
          : p.merged
            ? 'Dev update in progress'
            : p.state === 'Draft'
              ? 'Author still working'
              : p.state === 'Waiting to start'
                ? 'Waiting for a machine'
                : p.id === 105
                  ? 'Ready; not in queue'
                  : p.id === 108
                    ? 'First in line; waiting to start'
                    : `Waiting behind PR #${p.id + 1}`
}))
tableRows.push({
  ...tableRows.find((p) => p.id === 101)!,
  id: 98,
  author: 'Hano',
  title: 'Keep the sign-in button visible',
  commit: 'a98c4e1',
  committedAt: Date.parse('2026-10-08T08:20:00Z'),
  mergedAt: Date.parse('2026-10-08T09:45:00Z'),
  deploy: 'Live on dev',
  note: 'Available on dev',
  detail: 'Merged 45 minutes ago. Available on dev.',
  next: 'The change is available on dev. Production has not changed.',
  outcome: 'Merged into develop at 09:45 UTC on 8 Oct 2026.',
  technical: 'Illustrative merge and successful dev deployment',
  timing: 'Merged 45 minutes ago'
})
export type PrRow = (typeof tableRows)[number]
export type SortKey =
  | 'id'
  | 'title'
  | 'author'
  | 'committedAt'
  | 'mergedAt'
  | 'queue'
  | 'state'
  | 'build'
  | 'target'
export const columns: { key: SortKey; label: string; hint: string }[] = [
  { key: 'id', label: 'PR', hint: 'PR number' },
  { key: 'title', label: 'Brief', hint: 'Change name' },
  { key: 'author', label: 'Author', hint: 'Author name' },
  { key: 'committedAt', label: 'Commit', hint: 'Latest commit time' },
  { key: 'mergedAt', label: 'Merge', hint: 'Merge time; unmerged PRs stay last' },
  { key: 'queue', label: 'Queue', hint: 'Queue position within the target branch; unqueued PRs stay last' },
  { key: 'state', label: 'Status', hint: 'PR status' },
  { key: 'build', label: 'Build', hint: 'Failed → Building → Queued → Ready → Not started' },
  { key: 'target', label: 'Target', hint: 'Target branch' }
]
export function sortedRows(rows: PrRow[], key: SortKey, descending: boolean) {
  return [...rows].sort((a, b) => {
    const x = a[key],
      y = b[key]
    if (x === null || y === null) return x === y ? a.id - b.id : x === null ? 1 : -1
    const delta =
      key === 'build'
        ? buildOrder.indexOf(a.build) - buildOrder.indexOf(b.build)
        : key === 'queue' && a.target !== b.target
          ? a.target.localeCompare(b.target)
          : typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'en')
    return (descending ? -delta : delta) || a.id - b.id
  })
}
export function relativeTime(time: number) {
  return `${Math.round((snapshot - time) / 60000)} min ago`
}
export function exactTime(time: number) {
  return new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

// Equal visual milestones, not elapsed-time percentages or a merge-time prediction.
export function progressOf(pr: PrRow) {
  if (pr.merged) return { value: 100, label: 'Merged', tone: 'done' }
  if (pr.state === 'Draft' || pr.state === 'Waiting to start') return null
  if (pr.state === 'Needs a fix')
    return { value: 30, label: 'Checks stopped: a fix is needed', tone: 'failed' }
  if (pr.state === 'Testing') return { value: 40, label: 'Checks in progress', tone: 'running' }
  if (pr.state === 'Waiting for review')
    return { value: 60, label: 'Checks passed: waiting for review', tone: 'waiting' }
  return {
    value: 80,
    label: pr.queue ? `Ready to merge: queue position ${pr.queue}` : 'Ready to merge: not queued yet',
    tone: 'waiting'
  }
}
