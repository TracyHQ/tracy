/**
 * The Inbox grouped by what the reader has to do (layout "option I", Akemi 03/10).
 *
 * Three sections, always in this order, each newest first:
 *   1. `answer`   — a join request or an invitation whose action is still open (Review, Accept/Decline).
 *   2. `comments` — mentions, replies, resolved and reopened comments (a deleted one too, rule R3).
 *   3. `team`     — every other team row, settled requests and invitations included.
 * A section with no row is not returned, so the screen never draws an empty header. With the
 * Unread filter only unread rows count, and the sections that end up empty disappear the same way.
 *
 * Which rows go somewhere is the section's call ({@link targetIn}): Team updates are news, so a
 * press only marks them read; answers and comments keep the place their row points at.
 * Needs your answer shows at most {@link ANSWER_CAP} cards until the reader expands it ({@link capItems}).
 *
 * Pure and dependency-free apart from `rows.ts`, so `test/sections.test.mjs` pins it in Node.
 */
import { describe, type InboxNotification, outcomeOf, type RowView } from './rows.ts'

export type SectionId = 'answer' | 'comments' | 'team'

/** The colour family of a row: one CSS variable pair per family in `styles.ts`. */
export type Category = 'comment' | 'request' | 'in' | 'out' | 'role'

export interface SectionItem {
  row: InboxNotification
  view: RowView
  category: Category
  /** False for an open invitation: only its Accept / Decline buttons act ({@link pressableIn}). */
  pressable: boolean
}

export interface Section {
  id: SectionId
  items: SectionItem[]
}

const ORDER: readonly SectionId[] = ['answer', 'comments', 'team']

const IN = new Set(['team.approved', 'team.invite_accepted', 'team.joined'])
const OUT = new Set([
  'team.left',
  'team.removed',
  'team.site_deleted',
  'team.declined',
  'team.invite_declined',
  'team.invite_cancelled'
])

/**
 * The colour family of one notification.
 * @param n - the notification; `data.decision` decides a `team.join_answered` row.
 */
export function categoryOf(n: InboxNotification): Category {
  if (n.kind.startsWith('comment.')) return 'comment'
  // An answered invitation or join request takes its outcome's colour, not the request tile
  // (Akemi 04/10/2026).
  if (
    (n.kind === 'team.invited' || n.kind === 'team.join_request' || n.kind === 'team.edit_access_request') &&
    n.settledAt
  ) {
    const outcome = outcomeOf(n.data?.outcome)
    if (outcome === 'accepted' || outcome === 'approved') return 'in'
    if (outcome === 'declined') return 'out'
  }
  if (n.kind === 'team.join_request' || n.kind === 'team.invited' || n.kind === 'team.edit_access_request')
    return 'request'
  // A change to the site the whole team should notice (T12 restore, T14 new address): amber, like a role change.
  if (n.kind === 'team.role_changed' || n.kind === 'team.site_restored' || n.kind === 'team.site_renamed')
    return 'role'
  if (n.kind === 'team.join_answered' || n.kind === 'team.edit_access_answered')
    return n.data?.decision === 'declined' ? 'out' : 'in'
  if (n.kind === 'team.edit_access_approved') return 'in'
  if (n.kind === 'team.edit_access_declined') return 'out'
  if (IN.has(n.kind)) return 'in'
  if (OUT.has(n.kind)) return 'out'
  return 'request'
}

/**
 * The section one drawable row belongs to.
 * @param n - the notification.
 * @param view - its row, from {@link describe}; its `action` says whether an answer is still open.
 */
export function sectionOf(n: InboxNotification, view: RowView): SectionId {
  if (view.action !== null) return 'answer'
  if (n.kind.startsWith('comment.')) return 'comments'
  return 'team'
}

/**
 * Where a press on a row of this section goes: nowhere for Team updates (news, not tasks; a press
 * only marks the row read), the row's own target for answers (Review opens Team on the requester)
 * and comments (the comment's deep link). One Team row has somewhere to go: a restore (T12) is a
 * row of the site's Site changes ledger, lit there as new, so its `changes` target is kept
 * (`rows.ts`, plan `tasks/todo-site-changes-badge-count.md` §4).
 * @param section - the section the row sits in.
 * @param view - its row, from {@link describe}.
 */
export function targetIn(section: SectionId, view: RowView): RowView['target'] {
  if (!pressableIn(section, view)) return null
  if (section !== 'team') return view.target
  return view.target?.kind === 'changes' ? view.target : null
}

/**
 * Whether pressing a row's body does anything. An open invitation is answered only by its Accept /
 * Decline buttons: its body used to open Team on a site the reader has no seat on yet ("Could not
 * read this site's team") and mark the invitation read without answering it (measured 04/10).
 * @param section - the section the row sits in.
 * @param view - its row, from {@link describe}.
 */
export function pressableIn(section: SectionId, view: RowView): boolean {
  return !(section === 'answer' && view.action === 'answer')
}

/** Cards Needs your answer shows before "Show all (N)", so it never pushes the list down too far. */
export const ANSWER_CAP = 3

/**
 * The rows of one section to draw, and how many a collapsed section leaves out.
 * @param items - the section's rows, already in order (newest first).
 * @param expanded - the reader pressed "Show all".
 * @param cap - the most rows a collapsed section draws.
 * @returns `shown` to draw; `hidden` is the count left out when collapsed (0 when expanded or under
 *   the cap); `cappable` says whether the section has more rows than the cap at all, so the screen
 *   knows to offer "Show all" or "Show fewer".
 */
export function capItems<T>(
  items: readonly T[],
  expanded: boolean,
  cap: number = ANSWER_CAP
): { shown: T[]; hidden: number; cappable: boolean } {
  const cappable = items.length > cap
  if (!cappable || expanded) return { shown: [...items], hidden: 0, cappable }
  return { shown: items.slice(0, cap), hidden: items.length - cap, cappable }
}

/** Newest first; an unreadable date sorts last. */
const time = (n: InboxNotification): number => {
  const t = Date.parse(n.createdAt)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/**
 * The non-empty sections, in their fixed order.
 * @param rows - the notifications on screen, any order.
 * @param options.unreadOnly - the Unread filter: rows not read yet, plus every row still waiting on the reader.
 * @param options.keep - ids still shown as unread although they were read on this screen, so a row
 *   pressed in the Unread filter leaves with the next read of the list, not under the pointer.
 */
export function buildSections(
  rows: readonly InboxNotification[],
  options: { unreadOnly?: boolean; keep?: ReadonlySet<string> } = {}
): Section[] {
  const buckets: Record<SectionId, SectionItem[]> = { answer: [], comments: [], team: [] }
  for (const row of rows) {
    const view = describe(row)
    if (view === null) continue
    const section = sectionOf(row, view)
    // Unread keeps what still waits on the reader (Needs your answer) whatever its read state:
    // pressing Review marks a request read, and it must not vanish while unanswered (04/10).
    if (
      options.unreadOnly === true &&
      row.readAt !== null &&
      section !== 'answer' &&
      options.keep?.has(row.id) !== true
    )
      continue
    buckets[section].push({
      row,
      view: { ...view, target: targetIn(section, view) },
      category: categoryOf(row),
      pressable: pressableIn(section, view)
    })
  }
  return ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
    id,
    items: [...buckets[id]].sort((a, b) => time(b.row) - time(a.row))
  }))
}
