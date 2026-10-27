/**
 * The Admin attention doors as the screen reads them (`apps/tracy-web/src/ops/attention.js`).
 * Codes and values only; `./strings.ts` words them.
 */
export type Severity = 'broken' | 'missing' | 'hint'

export interface Item {
  check: string
  severity: Severity
  params: Record<string, unknown>
}

export interface Subject {
  key: string
  kind: 'quickstart' | 'demo'
  label: string
  platform: string
  version: string | null
  demo: string | null
  worst: Severity
  items: Item[]
}

export interface Report {
  readAt: string | null
  count: number
  counts: Record<Severity, number>
  offered: number
  subjects: Subject[]
}

export interface Analysis {
  tag: string
  platform: string | null
  version: string | null
  setName: string | null
  setSource: string | null
  asked: {
    id: string
    label: string
    works: boolean
    feeds: string[]
    dead: { consumer: string | null; code: string } | null
  }[]
  parts: { role: string; blocks: number; pages: number; examples: string[]; covered: boolean }[]
  limited: null | 'no-contract' | 'identity-only'
  writable: boolean
}

type Answer<T> = { ok: true; body: T } | { ok: false; status: string }

async function read<T>(path: string, signal?: AbortSignal): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      signal,
      headers: { accept: 'application/json' },
      redirect: 'manual'
    })
    if (!response.ok) return { ok: false, status: String(response.status || 'redirect') }
    return { ok: true, body: (await response.json()) as T }
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message : String(e) }
  }
}

export const fetchReport = (signal?: AbortSignal) => read<Report>('/api/ops/attention', signal)

export const fetchAnalysis = (tag: string, signal?: AbortSignal) =>
  read<Analysis>(`/api/ops/attention/questionnaire?tag=${encodeURIComponent(tag)}`, signal)

/** The rail's number: subjects with something broken or missing, or null when the door refused. */
export async function fetchAttentionCount(signal?: AbortSignal): Promise<number | null> {
  const answer = await fetchReport(signal)
  return answer.ok && typeof answer.body.count === 'number' ? answer.body.count : null
}
