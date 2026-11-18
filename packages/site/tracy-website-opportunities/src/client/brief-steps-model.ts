/**
 * The Site content brief page as a checklist of five steps (#537, option E): which step each item of the brief belongs
 * to, how many of a step's items the site says, and whether the owner has marked a step reviewed. Pure: the ticks
 * themselves are kept by `brief-review-store.ts`.
 *
 * A step is reviewed when the owner marked it AND its content still reads the same: each mark stores a fingerprint of
 * the step's items (id, value, on the site), so an edit or a switch in that step clears its tick on its own, and a
 * new brief revision (another storage key) starts with none.
 */
import type { BriefRow } from './business-brief-model.ts'

export type BriefStepNumber = 1 | 2 | 3 | 4 | 5
export const BRIEF_STEP_NUMBERS: readonly BriefStepNumber[] = Object.freeze([1, 2, 3, 4, 5])

/** The field kinds each step gathers. A kind no step names goes to `DEFAULT_BRIEF_STEP`. */
const STEP_FIELDS: Readonly<Record<BriefStepNumber, readonly string[]>> = {
  1: [
    'siteName',
    'name',
    'branch',
    'address',
    'serviceAreas',
    'website',
    'phone',
    'otherPhones',
    'whatsapp',
    'contactChannels',
    'email',
    'hours'
  ],
  2: ['services', 'offerings', 'cuisine', 'menu', 'prices', 'priceRange'],
  3: ['bio', 'about', 'description', 'story', 'keyMessages', 'facts', 'claims', 'audience'],
  4: ['team', 'people', 'googleRating', 'rating', 'reviews', 'quotes', 'guestQuotes'],
  5: ['socials', 'socialFigures', 'links', 'photos', 'media', 'logo', 'brand', 'colors']
}

/** Where an item of a kind the mapping does not know goes: the story step, which holds the brief's free words. */
export const DEFAULT_BRIEF_STEP: BriefStepNumber = 3

const STEP_OF = new Map<string, BriefStepNumber>(
  BRIEF_STEP_NUMBERS.flatMap((n) => STEP_FIELDS[n].map((field) => [field, n] as const))
)

/** The step an item of this field kind belongs to; never none, so no item is dropped. */
export function briefStepOf(field: string | null): BriefStepNumber {
  return (field === null ? undefined : STEP_OF.get(field)) ?? DEFAULT_BRIEF_STEP
}

export interface BriefStepView {
  n: BriefStepNumber
  /** `brief.steps.<n>`: the step's title. */
  titleKey: string
  items: BriefRow[]
  /** Items the site says (a read-only item counts by its own `onSite`). */
  on: number
  /** What the step's content reads now; a stored mark with another fingerprint is no longer a review. */
  fingerprint: string
}

/** A short stable hash of a string (djb2), so a stored mark stays small. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function stepFingerprint(items: readonly BriefRow[]): string {
  return hash(items.map((r) => `${r.id}\u0001${r.value}\u0001${r.onSite ? 1 : 0}`).join('\u0002'))
}

/** The five steps with their items, each item in the order given (the Profile's order, `orderBriefRows`). */
export function briefSteps(rows: readonly BriefRow[]): BriefStepView[] {
  return BRIEF_STEP_NUMBERS.map((n) => {
    const items = rows.filter((row) => briefStepOf(row.field) === n)
    return {
      n,
      titleKey: `brief.steps.${n}`,
      items,
      on: items.filter((r) => r.onSite).length,
      fingerprint: stepFingerprint(items)
    }
  })
}

/** What the owner marked, by step: the fingerprint each step read when it was marked. */
export type ReviewMarks = Partial<Record<string, string>>

export interface BriefReviewView {
  /** Reviewed, by step number. */
  reviewed: Record<BriefStepNumber, boolean>
  count: number
  total: number
  /** Every step is reviewed: Approve may be pressed. */
  all: boolean
}

/**
 * Which steps are reviewed. An approved brief is locked and reads as all five reviewed, whatever was stored.
 */
export function briefReview(
  steps: readonly BriefStepView[],
  marks: ReviewMarks,
  approved = false
): BriefReviewView {
  const reviewed = {} as Record<BriefStepNumber, boolean>
  for (const step of steps) reviewed[step.n] = approved || marks[String(step.n)] === step.fingerprint
  const count = steps.filter((s) => reviewed[s.n]).length
  return { reviewed, count, total: steps.length, all: count === steps.length }
}

/** The marks once a step is marked reviewed with what it reads now. */
export function markStep(marks: ReviewMarks, step: BriefStepView): ReviewMarks {
  return { ...marks, [String(step.n)]: step.fingerprint }
}

/** Where the page opens: the first step not reviewed yet, else the first. */
export function firstOpenStep(review: BriefReviewView): BriefStepNumber {
  return BRIEF_STEP_NUMBERS.find((n) => !review.reviewed[n]) ?? 1
}

/**
 * Where Mark reviewed moves to: the next step, or on the last one the first step still not reviewed (staying on the
 * last when every step is).
 */
export function stepAfterMark(current: BriefStepNumber, review: BriefReviewView): BriefStepNumber {
  if (current < 5) return (current + 1) as BriefStepNumber
  return BRIEF_STEP_NUMBERS.find((n) => !review.reviewed[n]) ?? current
}

/** The storage key of the marks: one opportunity, one brief revision. */
export function briefReviewKey(opportunityId: string, revisionId: string): string {
  return `tracy-wo-brief-reviewed:${opportunityId}:${revisionId}`
}

/** The marks read back from storage; anything unreadable is no marks. */
export function parseMarks(raw: string | null): ReviewMarks {
  if (raw === null) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const out: ReviewMarks = {}
    for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

/**
 * The line under an item the site leaves out, as string keys: each rule reason said as `brief.leftOff.<code>`; the
 * owner's own choice as `brief.leftOff.owner`. An item the site says keeps its notes as they are (none here).
 */
export function leftOffKeys(row: BriefRow): string[] {
  if (row.onSite || row.readOnly) return []
  if (row.ownerChoice) return ['brief.leftOff.owner']
  const keys = (row.noteKeys ?? []).map((key) => key.replace(/^facts\.reason\./, 'brief.leftOff.'))
  return keys.length > 0 ? keys : ['brief.leftOff.other']
}
