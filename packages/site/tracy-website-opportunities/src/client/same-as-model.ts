/**
 * The account's other cards of the same place (#537 R23): approved facts are final, so a change is made on a new card
 * of the same place, and the server names the others in `sameAs` (`[{id, createdAt, stage}]`, newest first) on the
 * list rows and on Details. Pure: the line's words and its date; the link is drawn by `same-as-line.tsx`.
 */
import type { Translate } from './strings.ts'

export interface SameAsCard {
  id: string
  createdAt: string | null
  /** The step that card reached, as the list's stage filter names it: research, demo, outreach or cancelled. */
  stage: string | null
}

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** `sameAs` as the server sent it; anything without an id is dropped. */
export function sameAsOf(raw: unknown): SameAsCard[] {
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const id = text(rec(item).id)
    return id === null ? [] : [{ id, createdAt: text(rec(item).createdAt), stage: text(rec(item).stage) }]
  })
}

/** The words of a stage, from the labels the list and the Inspector already use. */
const STAGE_KEYS: Record<string, string> = {
  research: 'v3.research',
  demo: 'inspector.demo',
  outreach: 'v3.demoReady',
  cancelled: 'status.cancelled'
}

/** "Also added on 9 Nov (Research)" for the newest other card, with "+2 more" when there are others; null for none. */
export function sameAsLine(
  t: Translate,
  cards: readonly SameAsCard[],
  locale: string
): { text: string; more: string | null; first: SameAsCard } | null {
  const first = cards[0]
  if (first === undefined) return null
  const ms = first.createdAt === null ? Number.NaN : Date.parse(first.createdAt)
  const date = Number.isFinite(ms)
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms)
    : ''
  const key = first.stage === null ? undefined : STAGE_KEYS[first.stage]
  const stage = key === undefined ? t('v3.research') : t(key)
  return {
    text: t('sameAs.line', { date, stage }),
    more: cards.length > 1 ? t('sameAs.more', { count: cards.length - 1 }) : null,
    first
  }
}
