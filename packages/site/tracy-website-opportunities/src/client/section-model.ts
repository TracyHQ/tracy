/**
 * The sections of Details (layout C, spec #512): two columns of cards, each with its title and one status line beside
 * it, and three of them (Profile, Business brief, Photos & video) open as a sub-page of their own with a pager
 * in that order. The status lines read the same inputs as the stepper (`stepper-model.ts`) plus a few counts, so a
 * section never reads Ready while its step is not done.
 * Pure: no DOM, no fetch, no clock read. Dates are formatted with the locale it is given.
 */
import type { DemoState } from '@tracy/wo-views/demo-state'

import { type ResearchState, briefControlView } from './research-gate-model.ts'
import { type SourceInput, sourceRow } from './status.ts'

export type SectionId = 'profile' | 'sources' | 'brief' | 'media' | 'demo'
/** The order of the sections on a narrow page, one column. */
export const SECTION_IDS: readonly SectionId[] = Object.freeze([
  'profile',
  'sources',
  'brief',
  'media',
  'demo'
])

/** How the status line reads: settled with content, still moving, or plain (nothing yet, or waiting). */
export type SectionTone = 'ok' | 'run' | 'mute'

/** One string of the status line; several are joined with a comma. */
export interface SectionText {
  key: string
  params?: Record<string, string | number>
}

export interface SectionMeta {
  id: SectionId
  /** `details.section.<id>`: Profile, Sources, Business brief, Photos & video, Demo site. */
  titleKey: string
  status: SectionText[]
  tone: SectionTone
  /** The section waits for an earlier step: drawn muted, with a lock line in place of its content. */
  locked: boolean
}

export interface SectionMetaInput {
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

const counted = (base: string, count: number): SectionText => ({
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
export function researchRunning(input: Pick<SectionMetaInput, 'research' | 'researchJob'>): boolean {
  return input.research.state === 'running' || MOVING.has(input.researchJob?.state ?? '')
}

export function sectionMetas(input: SectionMetaInput): SectionMeta[] {
  const locale = input.locale ?? 'en'
  // A step that runs shows its progress in the Progress band only (#537): its card holds nothing partial, and a run
  // pressed again resets the card until it finishes.
  const running = researchRunning(input)
  const done = input.research.done && !running
  const hasBrief = typeof input.brief?.id === 'string' && input.brief.id !== ''
  const entry = (id: SectionId, status: SectionText[], tone: SectionTone, locked = false): SectionMeta => ({
    id,
    titleKey: `details.section.${id}`,
    status,
    tone,
    locked
  })

  const profile = done
    ? entry(
        'profile',
        [counted('section.meta.profile.fields', input.profile.filled)],
        input.profile.filled > 0 ? 'ok' : 'mute'
      )
    : entry('profile', [{ key: 'section.meta.profile.waiting' }], 'mute')

  const { found, total } = input.sources
  const sources =
    done && total > 0
      ? entry(
          'sources',
          [{ key: 'section.meta.sources.found', params: { count: found, total } }],
          found > 0 ? 'ok' : 'mute'
        )
      : entry('sources', [{ key: 'section.meta.sources.none' }], 'mute')

  const job = briefControlView({
    research: { state: done ? 'done' : 'not_started' },
    brief: input.brief,
    briefJob: input.briefJob
  })
  const briefDate = shortDate(input.brief?.createdAt, locale)
  const brief = !done
    ? entry('brief', [{ key: 'section.meta.brief.locked' }], 'mute', true)
    : job.mode === 'running' || job.mode === 'failed'
      ? entry('brief', [{ key: 'section.meta.brief.none' }], 'mute')
      : hasBrief
        ? entry(
            'brief',
            [
              briefDate === null
                ? { key: 'section.meta.brief.number', params: { n: input.brief?.n ?? 1 } }
                : { key: 'section.meta.brief.made', params: { n: input.brief?.n ?? 1, date: briefDate } }
            ],
            'ok'
          )
        : entry('brief', [{ key: 'section.meta.brief.none' }], 'mute')

  const { photos, videos } = input.media
  const media = running
    ? entry('media', [{ key: 'section.meta.media.none' }], 'mute')
    : photos + videos > 0
      ? entry(
          'media',
          [
            counted('section.meta.media.photos', photos),
            ...(videos > 0 ? [counted('section.meta.media.videos', videos)] : [])
          ],
          'ok'
        )
      : entry('media', [{ key: 'section.meta.media.none' }], 'mute', !done && !running)

  const demo =
    input.demo === 'ready'
      ? entry('demo', [{ key: 'section.meta.demo.ready' }], 'ok')
      : BUILDING.has(input.demo)
        ? entry('demo', [{ key: 'section.meta.demo.none' }], 'mute')
        : entry('demo', [{ key: 'section.meta.demo.none' }], 'mute', !hasBrief && input.demo === 'none')

  return [profile, sources, brief, media, demo]
}

/** The Sources counts from the source rows (`status.ts`): gave data, settled, all. */
export function sourceCounts(sources: readonly SourceInput[]): SectionMetaInput['sources'] {
  const tones = sources.map((s) => sourceRow(s).tone)
  return {
    found: tones.filter((tone) => tone === 'ok' || tone === 'partial').length,
    settled: tones.filter((tone) => tone !== 'waiting').length,
    total: tones.length
  }
}

/**
 * A section that opens as a sub-page of its own (`wo-section`); the Demo site stays on Details, and Sources is the
 * table on Details alone (#537: a business never has many sources).
 */
export type SubSection = Exclude<SectionId, 'demo' | 'sources'>
/**
 * The sections that open as a sub-page. Photos & video belong to the Profile (#537): `media` stays a valid
 * `wo-section` and opens the Profile sub-page scrolled to its Photos & video part, so the pager never walks it. An
 * old address with `wo-section=sources` is no section: it opens the overview.
 */
export const SUB_SECTIONS: readonly SubSection[] = Object.freeze(['profile', 'brief', 'media'])
export const isSubSection = (v: unknown): v is SubSection =>
  typeof v === 'string' && (SUB_SECTIONS as readonly string[]).includes(v)

/** The sub-page a section opens: `media` opens the Profile. */
export const pageOf = (section: SubSection): SubSection => (section === 'media' ? 'profile' : section)
