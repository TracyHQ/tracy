/**
 * The `@` picker of the comment boxes (TCH spec #809 case C1, picker U6 approved by Akemi 03/10/2026):
 * typing `@` in a comment, a reply or an edit lists the people holding a seat on the site — avatar,
 * name, email, role, and the line "Only people with a seat on this site". Picking one writes `@handle `
 * into the words and remembers that person's account id for this box; the save sends the ids whose
 * `@handle` the words still carry (`mentions` on POST/PATCH), and the server notifies them.
 *
 * 🔒 A typed `@name` nobody picked stays plain text and names nobody: only a pick puts an id in the
 * box's list, and the list is dropped with the box's words.
 *
 * The roster is `GET /api/sites/:key/comments/people` (TCH `apps/tracy-web/src/sites/comments.js`),
 * read through `CommentApi.people`. A mention keeps today's look: the chat column's Comments list
 * draws any `@handle` in the link colour (TCH `tracy-chat-input` `textParts`), so a handle is made
 * only of what that pattern takes — letters, digits, `.`, `_`, `-`, ending on a letter, digit or `_`.
 *
 * Pure: no React, no fetch; the controller and the layer call these.
 */
import type { CommentAuthor } from './comment-store.ts'
import { fallbackInitial } from './face.tsx'

/** One person of the roster. */
export interface MentionPerson extends CommentAuthor {
  /** The seat's role on the site: owner, admin, developer or editor. */
  role: string
  /** The viewer themself: never offered (a mention of oneself tells nobody). */
  you?: boolean
}

/** The `@` being typed: where it starts in the words, and what follows it up to the caret. */
export interface MentionQuery {
  start: number
  end: number
  query: string
}

/** The most rows the picker shows at once. */
export const MENTION_ROWS = 6

/** Role names stay English in every language (TCH `docs/references/i18n.md` §5: seat roles are product words). */
const ROLE_NAMES: Record<string, string> = { owner: 'Owner', admin: 'Admin', developer: 'Developer', editor: 'Editor' }

/** A role as the picker shows it; an unknown one as sent. */
export function roleName(role: string): string {
  return ROLE_NAMES[role] ?? role
}

/** The roster out of the door's answer; rows of another shape are left out. */
export function readPeople(answer: unknown): MentionPerson[] | null {
  const list = answer !== null && typeof answer === 'object' ? (answer as { people?: unknown }).people : null
  if (!Array.isArray(list)) return null
  return list.flatMap((r: unknown) => {
    if (r === null || typeof r !== 'object') return []
    const p = r as Record<string, unknown>
    if (typeof p.accountId !== 'string' || typeof p.email !== 'string' || typeof p.role !== 'string') return []
    const person: MentionPerson = {
      accountId: p.accountId,
      email: p.email,
      // The server's letter; a row sent without one gets the letter the server would give.
      initial: typeof p.initial === 'string' && p.initial !== '' ? p.initial : fallbackInitial({ name: typeof p.name === 'string' ? p.name : null, email: p.email }),
      role: p.role,
    }
    if (typeof p.name === 'string' && p.name.trim() !== '') person.name = p.name.trim()
    // The face as the server draws it everywhere else (`personFace`): the picker hashes nothing.
    if (typeof p.color === 'string' && p.color !== '') person.color = p.color
    if (typeof p.avatarUrl === 'string' && p.avatarUrl !== '') person.avatarUrl = p.avatarUrl
    if (p.you === true) person.you = true
    return [person]
  })
}

/** Only what a mention token may hold (the Comments list's pattern), trimmed at the ends. */
function tokenOf(words: string): string {
  return words.replace(/[^\p{L}\p{N}._-]/gu, '').replace(/^[._-]+|[.-]+$/gu, '')
}

/**
 * The `@handle` a pick writes: the first word of the display name, else the address before `@`
 * (`@Akemi`, `@vincent`). Never empty.
 */
export function handleOf(person: Pick<MentionPerson, 'name' | 'email'>): string {
  const first = tokenOf((person.name ?? '').trim().split(/\s+/)[0] ?? '')
  if (first !== '') return first
  const local = tokenOf(person.email.split('@')[0] ?? '')
  return local !== '' ? local : 'someone'
}

/**
 * The `@` the caret stands in, or null: an `@` at the start or after white space, followed by what a
 * handle may hold, up to the caret. `a@b.co` is never one (an address, not a mention).
 */
export function mentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([\p{L}\p{N}._-]{0,40})$/u.exec(before)
  if (m === null) return null
  const start = m.index + (m[1] ?? '').length
  return { start, end: caret, query: m[2] ?? '' }
}

/** Lower case, accents folded: "Đặng" finds "dang". */
function fold(words: string): string {
  return words.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

/**
 * The people the picker offers for `query`: never the viewer, matched at the start of any word of
 * the name or of the address, in roster order, at most {@link MENTION_ROWS}.
 */
export function matchPeople(people: readonly MentionPerson[], query: string): MentionPerson[] {
  const q = fold(query)
  return people
    .filter((p) => p.you !== true)
    .filter((p) => {
      if (q === '') return true
      const words = [...fold(p.name ?? '').split(/\s+/), fold(p.email), fold(p.email.split('@')[0] ?? '')]
      return words.some((w) => w.startsWith(q))
    })
    .slice(0, MENTION_ROWS)
}

/** The words after a pick: `@handle ` in place of the `@query`, and where the caret goes. */
export function insertMention(text: string, at: MentionQuery, person: Pick<MentionPerson, 'name' | 'email'>): { text: string; caret: number } {
  const token = `@${handleOf(person)}`
  const rest = text.slice(at.end)
  const glue = rest.startsWith(' ') ? '' : ' '
  const next = `${text.slice(0, at.start)}${token}${glue}${rest}`
  return { text: next, caret: at.start + token.length + 1 }
}

/** One run of a comment's words: a mention (`@octopal`) or the plain text between them. */
export interface MentionPart {
  text: string
  mention: boolean
}

/**
 * A comment's words cut where a mention stands, for the thread card to draw mentions in the brand
 * colour. The rule is the chat column Comments list's (TCH `tracy-chat-input` `textParts`): a mention
 * starts at the beginning or after a space and runs over letters, digits, dot, dash and underscore,
 * ending on a letter, digit or underscore, so an e-mail address (`a@b.co`) is never one. Keep the two
 * in step; the list lives in a Tracy plugin this fork cannot import.
 */
export function mentionParts(text: string): MentionPart[] {
  const parts: MentionPart[] = []
  let at = 0
  for (const m of text.matchAll(/(^|\s)(@[\p{L}\p{N}._-]*[\p{L}\p{N}_])/gu)) {
    const lead = m[1] ?? ''
    const mention = m[2] ?? ''
    const start = (m.index ?? 0) + lead.length
    if (start > at) parts.push({ text: text.slice(at, start), mention: false })
    parts.push({ text: mention, mention: true })
    at = start + mention.length
  }
  if (at < text.length) parts.push({ text: text.slice(at), mention: false })
  return parts
}

/** Whether `text` carries `@handle` as a whole mention token. */
function carries(text: string, handle: string): boolean {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)@${escaped}(?![\\p{L}\\p{N}_]|[.-][\\p{L}\\p{N}_])`, 'u').test(text)
}

/**
 * The ids a save names: each picked person whose `@handle` the words still carry, in pick order.
 * `picks` maps an account id to the handle written for it.
 */
export function mentionIds(text: string, picks: ReadonlyMap<string, string>): string[] {
  return [...picks].filter(([, handle]) => carries(text, handle)).map(([id]) => id)
}

/**
 * The picks an edit box starts with: the comment's stored mentions, each with the handle its person
 * has in the roster, so a save keeps those the words still name.
 */
export function picksOf(mentions: readonly string[] | undefined, people: readonly MentionPerson[] | null): Map<string, string> {
  const picks = new Map<string, string>()
  for (const id of mentions ?? []) {
    const person = people?.find((p) => p.accountId === id)
    if (person !== undefined) picks.set(id, handleOf(person))
  }
  return picks
}
