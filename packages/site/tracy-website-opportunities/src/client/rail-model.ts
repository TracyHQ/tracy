/**
 * The "On this page" rail of Details (layout B, spec #512): Details is one long page with every section stacked, and
 * a slim rail lists the sections in order with one status line under each. The rail reads the same inputs as the
 * stepper (`stepper-model.ts`) plus a few counts, so a section never reads Ready while its step is not done.
 * Pure: no DOM, no fetch, no clock read. Dates are formatted with the locale it is given.
 */
import type { DemoState } from '@tracy/wo-views/demo-state'

import { type ResearchState, briefControlView } from './research-gate-model.ts'
import { type SourceInput, sourceRow } from './status.ts'

export type SectionId = 'profile' | 'sources' | 'brief' | 'media' | 'demo'
/** The order of the sections on the page and in the rail. */
export const SECTION_IDS: readonly SectionId[] = Object.freeze([
  'profile',
  'sources',
  'brief',
  'media',
  'demo'
])

/** How the status line reads: settled with content, still moving, or plain (nothing yet, or waiting). */
export type RailTone = 'ok' | 'run' | 'mute'

/** One string of the status line; several are joined with a comma. */
export interface RailText {
  key: string
  params?: Record<string, string | number>
}

export interface RailEntry {
  id: SectionId
  /** `details.section.<id>`: Profile, Sources, Business brief, Photos & video, Demo site. */
  titleKey: string
  status: RailText[]
  tone: RailTone
  /** The section waits for an earlier step: drawn muted, with a lock line in place of its content. */
  locked: boolean
}

export interface RailInput {
  /** This card's own research (`researchOf`). */
  research: { state: ResearchState; done: boolean }
  /** The research job of the card (`row.job`). */
  researchJob?: { state?: string | null } | null
  /** Profile rows that hold a value, and how many rows research fills. */
  profile: { filled: number; total: number }
  /** Source rows: how many gave data, how many are settled (not waiting), and how many there are. */
  sources: { found: number; settled: number; total: number }
  /** The latest Content brief job (`body.briefJob`). */
  briefJob?: unknown
  /** The latest brief (`body.brief`); null before the first one. */
  brief?: { id?: string; n?: number; createdAt?: string | null } | null
  /** Photos and videos collected so far. */
  media: { photos: number; videos: number }
  /** The demo state machine's state (`demoStateOf`). */
  demo: DemoState
  locale?: string
}

const MOVING = new Set(['queued', 'running'])
const BUILDING = new Set<DemoState>(['queued', 'building'])

const counted = (base: string, count: number): RailText => ({
  key: `${base}.${count === 1 ? 'one' : 'other'}`,
  params: { count }
})

function shortDate(iso: string | null | undefined, locale: string): string | null {
  if (typeof iso !== 'string' || iso === '') return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at)
  } catch {
    return null
  }
}

/** Whether this card's research is running now (its own state, or its job queued or running). */
export function researchRunning(input: Pick<RailInput, 'research' | 'researchJob'>): boolean {
  return input.research.state === 'running' || MOVING.has(input.researchJob?.state ?? '')
}

export function railView(input: RailInput): RailEntry[] {
  const locale = input.locale ?? 'en'
  const running = !input.research.done && researchRunning(input)
  const done = input.research.done
  const hasBrief = typeof input.brief?.id === 'string' && input.brief.id !== ''
  const entry = (id: SectionId, status: RailText[], tone: RailTone, locked = false): RailEntry => ({
    id,
    titleKey: `details.section.${id}`,
    status,
    tone,
    locked
  })

  const profile = done
    ? entry(
        'profile',
        [counted('rail.profile.fields', input.profile.filled)],
        input.profile.filled > 0 ? 'ok' : 'mute'
      )
    : running
      ? entry(
          'profile',
          [
            {
              key: 'rail.profile.partial',
              params: { count: input.profile.filled, total: input.profile.total }
            }
          ],
          'run'
        )
      : entry('profile', [{ key: 'rail.profile.waiting' }], 'mute')

  const { found, settled, total } = input.sources
  const sources = running
    ? entry('sources', [{ key: 'rail.sources.running', params: { count: settled, total } }], 'run')
    : done && total > 0
      ? entry(
          'sources',
          [{ key: 'rail.sources.found', params: { count: found, total } }],
          found > 0 ? 'ok' : 'mute'
        )
      : entry('sources', [{ key: 'rail.sources.none' }], 'mute')

  const job = briefControlView({
    research: { state: done ? 'done' : 'not_started' },
    brief: input.brief,
    briefJob: input.briefJob
  })
  const briefDate = shortDate(input.brief?.createdAt, locale)
  const brief = !done
    ? entry('brief', [{ key: 'rail.brief.locked' }], 'mute', true)
    : job.mode === 'running'
      ? entry('brief', [{ key: 'rail.brief.running' }], 'run')
      : hasBrief
        ? entry(
            'brief',
            [
              briefDate === null
                ? { key: 'rail.brief.number', params: { n: input.brief?.n ?? 1 } }
                : { key: 'rail.brief.made', params: { n: input.brief?.n ?? 1, date: briefDate } }
            ],
            'ok'
          )
        : entry('brief', [{ key: 'rail.brief.none' }], 'mute')

  const { photos, videos } = input.media
  const media =
    running && photos + videos > 0
      ? entry('media', [{ key: 'rail.media.soFar', params: { count: photos + videos } }], 'run')
      : photos + videos > 0
        ? entry(
            'media',
            [
              counted('rail.media.photos', photos),
              ...(videos > 0 ? [counted('rail.media.videos', videos)] : [])
            ],
            'ok'
          )
        : entry('media', [{ key: 'rail.media.none' }], 'mute', !done && !running)

  const demo =
    input.demo === 'ready'
      ? entry('demo', [{ key: 'rail.demo.ready' }], 'ok')
      : BUILDING.has(input.demo)
        ? entry('demo', [{ key: 'rail.demo.building' }], 'run')
        : entry('demo', [{ key: 'rail.demo.none' }], 'mute', !hasBrief && input.demo === 'none')

  return [profile, sources, brief, media, demo]
}

/**
 * The section in view: the last one whose top has passed the reading line (just under the sticky header), the first
 * while none has. `tops` are the sections' tops relative to that line, in page order.
 */
export function activeSection(tops: ReadonlyArray<{ id: SectionId; top: number }>, atEnd = false): SectionId {
  if (tops.length === 0) return SECTION_IDS[0]
  // Scrolled to the very end: the last section is the one being read, even when it is too short to reach the line.
  if (atEnd) return tops[tops.length - 1].id
  let on = tops[0].id
  for (const s of tops) if (s.top <= 0) on = s.id
  return on
}

/** The Sources counts of the rail from the source rows (`status.ts`): gave data, settled, all. */
export function sourceCounts(sources: readonly SourceInput[]): RailInput['sources'] {
  const tones = sources.map((s) => sourceRow(s).tone)
  return {
    found: tones.filter((tone) => tone === 'ok' || tone === 'partial').length,
    settled: tones.filter((tone) => tone !== 'waiting').length,
    total: tones.length
  }
}
