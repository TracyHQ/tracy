/**
 * The Comments tab's model — pure, so node tests hold it.
 *
 * Stage 6 of "Comment → edit" (contract `tasks/evidence/comment-people/contract.md` §H2; stories
 * CommentsTabPeopleOnly · CommentsTabRowOpensCard · PageCommentBox · CommentsTabPeopleOnlyEmpty ·
 * SendNChecklist in `packages/dev/tracy-design/src/mockups/browser-comment.mock.stories.tsx`): comments
 * are people talking to people. A Send to Tracy is a chat message, never a comment, and Tracy answers
 * in the chat — so a comment has no status word, no number on screen, no Tracy line. It is open or
 * resolved, and the tab is an overview and a way to the comment's thread card on the page.
 *
 * The Browser tab (the side card, `dsh-better-sidebar`) keeps the comments; the chat column shows
 * them. Between the two, on `window`:
 *
 *   in   `tracy:comment-list` {sessionId, tabId, siteKey, host, active, url,
 *                              comments:[{id, url, text, createdAt, resolvedAt?, element|null,
 *                                         author?: {accountId, email, name?, initial, color?},
 *                                         replyTo?: <parent id>, replyCount?, sentToTracy?,
 *                                         status?, removed?, n?, can?,
 *                                         attachments?: [{id, name, size, type, url}]}],
 *                              attachments?: {enabled, maxBytes, maxFiles},
 *                              limits?: {maxChars}}
 *        — round 5 (acceptance e2e v3 TH-2): `limits.maxChars`, the comment door's length limit from its
 *        list root (4,000 — {@link DEFAULT_MAX_CHARS} — when the list does not say); a root deleted
 *        while replies stand under it comes as `removed: true` (or the server's `deletedRoot: true`)
 *        with its `replyCount`, and is a "Comment deleted" row (TH-4).
 *        — stage 6 files (`attachments-contract.md` §C–§D): the GET door's `attachments` block as the
 *        Browser tab forwards it (no block = no store), and each
 *        comment's stored files (the row shows a paperclip and their count).
 *        — `resolvedBy` may ride along; the tab does not show it (Brian 23:45: the thread card does).
 *        — one Browser tab's list, every time it changes. `status`, `n` and `can` are read only for
 *        what they still say: `status: 'resolved'` (or a `resolvedAt` with no status) is resolved,
 *        anything else open; `draft` is no comment yet. `replyCount` is the thread's replies (else the
 *        replies listed are counted); `sentToTracy` whether any Send to Tracy ever carried it (it only
 *        counted "Send N" until round 3; nothing reads it now, and nothing shows on a row). `author.color`
 *        and `author.initial`: the person's face as the server decided it (`personFace`), drawn as sent.
 *   out  `tracy:comment-act` {tabId, sessionId, kind, ids?, text?} — `sessionId` (round 6): the
 *        conversation on screen; the fork acts only when `tabId` AND `sessionId` are its own. `resolve` (ids) · `reveal` (the first
 *        id: the fork scrolls to it and opens its thread card) · `clear` (ids: every open comment of
 *        the page, anyone's, after the Undo window) · `send` (ids: comments to hand Tracy as ONE chat
 *        message; every Ask Tracy to edit starts from a saved comment) · `list`.
 *
 *   in   `tracy:comment-act-failed` {tabId, sessionId, kind: 'clear', ids, text: '', code?, next?} — e2e v7
 *        INTH-1: the door refused a Delete all (no seat, another site…; threads already gone are not a
 *        refusal). Its rows come back and the head row says "Could not delete. Try again."
 *        (`comment-clear.mjs`).
 *   out  `tracy:comment-unread` {count, open} and in `tracy:comment-unread-state` — the site's open
 *        threads ({@link badgeCount}) and this person's unread ones ({@link unreadBadge}) for the
 *        toolbar's "Comments N" and its dot (`comment-unread.mjs`).
 *
 * Every tab of a site lists the same server comments; a comment is drawn once, from the tab shown.
 */
import { addressFace, NEUTRAL_FACE_COLOUR } from '@tracy/core/team/address-face'

import { readAttachmentsConfig } from './comment-attachments.mjs'
import { serverListOf } from './comment-server.mjs'
import { chipLabel, imageAnchor } from './comment-turn.mjs'

/** Where an image anchor is named, kept here too for the callers that read it from this model. */
export { imageAnchor, imageChipWords } from './comment-turn.mjs'

export const LIST_EVENT = 'tracy:comment-list'
export const ACT_EVENT = 'tracy:comment-act'
export const ACT_FAILED_EVENT = 'tracy:comment-act-failed'

/**
 * The comment door's length limit when the list does not say (`apps/tracy-web` `comments.js`
 * `MAX_TEXT`, read by clients as `limits.maxChars`).
 */
export const DEFAULT_MAX_CHARS = 4000

/**
 * @typedef {{ url?: string, selector?: string, label?: string, text?: string, tag?: string,
 *   image?: { src?: string, alt?: string } | null, marks?: string[], kind?: string }} RawElement
 * @typedef {{ accountId?: string, email?: string, name?: string, initial?: string, color?: string,
 *   avatarUrl?: string | null }} RawAuthor
 * @typedef {{ id: string, url: string, text: string, resolved: boolean, createdAt: number,
 *   resolvedAt?: number, element: RawElement | null, author?: RawAuthor, replyTo?: string,
 *   replyCount?: number, sentToTracy: boolean, removed?: true, hidden?: true, files: number,
 *   images: Thumb[], mine?: true, pageTitle?: string, n?: number, deleting?: number,
 *   lastSend?: { at: number, answeredAt?: number }, resolvedByTracy?: true }} ListComment
 *   `n`: its number on the site (the server's sequence, never reused: "#12").
 *   `deleting`: its Delete waits out the Undo window until this time (ms): drawn "Comment deleted ·
 *   Undo", counted nowhere. `lastSend`: its latest send to Tracy and when a site write of Tracy's cited
 *   it (`answeredAt`, TCH `045-site-comment-read.sql`) — the row's "Asked Tracy" / "Done by Tracy".
 *   `resolvedByTracy`: resolved, and Tracy resolved it on proof of a write (ADR 0025): the server's
 *   `resolvedByTracy`, or its `resolvedBy` marked `tracy: true` as the Browser tab passes it on.
 *   `pageTitle`: the CMS title of the page it is on, when its locate answer names the page as its
 *   record (`page "Pricing"`; the server's rows carry `locate`, a Browser tab's list does not).
 *   `files`: how many files are stored with it. `images`: the stored files that are pictures, with the
 *   address the list gives for each (the Comments tab shows them as small thumbnails). `mine`: the list says the viewer may edit it (`can.edit`),
 *   so its author is the viewer. `removed`: its words are gone (deleted, or the server's tombstone of a
 *   root with replies); `hidden`: taken off the view for Delete all's Undo window.
 * @typedef {{ name: string, url: string }} Thumb
 * @typedef {{ enabled: boolean, maxBytes: number, maxFiles: number }} AttachmentsConfig
 * @typedef {{ sessionId: string, tabId: string, siteKey: string, host: string, active: boolean,
 *   url: string, comments: ListComment[], attachments: AttachmentsConfig, maxChars: number, heard: number,
 *   thread: string | null }} TabList
 *   `thread`: the comment whose thread card is open on the page (the row is drawn selected).
 * @typedef {{ status: 'loading' | 'failed' | 'ready', list: TabList | null }} ServerState
 *   The site's comments as the server lists them (`comment-server.mjs`): `list` is a list with no tab
 *   (`tabId` ''), present once the door answered.
 * @typedef {{ ready: boolean, marks: ReadonlyMap<string, number | null> }} Reads
 *   This person's read marks (`comment-reads.mjs`): thread id → what they saw when they last opened it
 *   (`seenN`, the largest number of the other people's messages in it, {@link seenOf}), or null for
 *   "Mark as unread". `ready` once the server answered; until then nothing reads as unread.
 * @typedef {{ tabs: Map<string, TabList>, onScreen?: string, server?: ServerState, reads?: Reads,
 *   viewer?: string, working?: ReadonlySet<string> }} ListsSnapshot
 *   `reads`: this person's read marks; `viewer`: their e-mail, lower case (`/auth/me`) — their own words
 *   are never unread to them; `working`: comments a turn this page watches is working on now
 *   (`comment-working.mjs`, "Tracy working…").
 *   `tabs`: keyed by {@link tabKey} (conversation + tab id).
 *   `onScreen`: the conversation dsh's main view shows (`focus`); absent until the page knows it.
 *   `server`: the server's list ({@link sourceTabs}); absent where the page reads none (`/new/`).
 * @typedef {'heading' | 'text' | 'image' | 'link' | 'menu' | 'section' | 'other' | 'page'} Kind
 * @typedef {'note' | 'asked' | 'working' | 'done' | 'tracy'} Status
 * @typedef {{ src: string, name: string, alt: string }} Picture
 * @typedef {{ id: string, tabId: string, sessionId: string, text: string, resolved: boolean, createdAt: number,
 *   resolvedAt?: number, kind: Kind, chip: string, path: string, url: string, author: string,
 *   initial: string, color: string, avatarUrl: string | null, replies: number, sentToTracy: boolean,
 *   onPage: boolean,
 *   lastActivity: number, files: number, images: Thumb[], onImage?: true, deleted?: true,
 *   pageTitle: string, n: number, handle: string, email: string, status: Status, unread: boolean,
 *   selected: boolean, deleting?: number, mine: boolean, image: Picture | null }} Row
 *   `n`: its number on the site, 0 when the list does not say. `handle`: the part of the author's
 *   e-mail before its at sign (else their name); `email`: the whole address, for the tooltip.
 *   `status`: its tag ({@link statusOf}); `unread`: {@link unreadOf}; `selected`: its thread card is
 *   open on the page. `deleting`: its Delete waits out the Undo window until this time (ms).
 *   `mine`: the viewer wrote it (only the author may delete). `image`: the picture it is anchored on.
 *   `pageTitle`: the CMS title of its page ({@link pageTitles}), '' when none is known.
 *   `onImage`: the comment is anchored on an image; `chip` then holds its alt or file ({@link imageAnchor})
 *   and the view puts "Image ·" before it.
 *   `deleted`: a root deleted while replies stand under it (TH-4) — no words, "Comment deleted".
 *   `path`: the path of the page it is on (UI fine-tune 30/09: the meta line reads `<name> · <time> ·
 *   <path>`, or `Current page` when `onPage`; never the site's name, never a line of its own).
 *   `onPage`: on the page the shown Browser tab is at ("Delete all" acts on these).
 *   `lastActivity`: the latest of the comment's own time and its listed replies' (ms) — the order.
 */

/** @param {unknown} v */
const isText = (v) => typeof v === 'string' && v.trim() !== ''
/**
 * A time as ms: a number, or an ISO string as the server writes it. NaN when neither.
 * @param {unknown} v
 */
const msOf = (v) =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Date.parse(v) : Number.NaN
/** @param {unknown} v */
const isTime = (v) => Number.isFinite(msOf(v))

/**
 * The colour of a face the server named none for: a comment written here a moment ago, before the
 * server's answer brings its author, or a server older than the face contract. Core's own grey
 * (`@tracy/core/team/address-face`, re-exported by `@tracy/core/team/face`), never a second copy.
 */
export { NEUTRAL_FACE_COLOUR }

/** A colour the server may send: a plain hex, nothing a style could be smuggled through. */
const HEX = /^#[0-9a-f]{6}$/i

/** @param {unknown} author @returns {string} the name, else the part of the email before its at sign, else '' */
function nameOf(author) {
  const a = author !== null && typeof author === 'object' ? /** @type {RawAuthor} */ (author) : {}
  if (isText(a.name)) return /** @type {string} */ (a.name).trim()
  if (isText(a.email)) return /** @type {string} */ (a.email).trim().split('@')[0]
  return ''
}

/** @param {RawAuthor} a @returns {string | null} the server's colour for this person, when it sent a valid one */
const serverColour = (a) => (typeof a.color === 'string' && HEX.test(a.color) ? a.color : null)

/**
 * The name and face a row shows for its author: `name`, else the part of the email before its at
 * sign; the server's `initial`, `color` and `avatarUrl` (`personFace`, keyed by account), drawn as
 * sent. Nothing is hashed here: with no `color` from the server the face is the neutral grey
 * ({@link NEUTRAL_FACE_COLOUR}), and with no `initial` the letter `addressFace` gives the name (the
 * server's own rule); no `avatarUrl`, no photo. Never "You" — every row, the person's own included,
 * carries the real name (Brian 29/09 13:20). Empty for a list with no author: an empty name is
 * better than an invented one.
 * @param {unknown} author
 * @returns {{ name: string, initial: string, color: string, avatarUrl: string | null }}
 */
export function authorOf(author) {
  const a = author !== null && typeof author === 'object' ? /** @type {RawAuthor} */ (author) : {}
  const name = nameOf(a)
  const initial = isText(a.initial)
    ? /** @type {string} */ (a.initial).trim()
    : name === ''
      ? ''
      : addressFace(name).initial
  const avatarUrl = isText(a.avatarUrl) ? /** @type {string} */ (a.avatarUrl).trim() : null
  return { name, initial, color: serverColour(a) ?? NEUTRAL_FACE_COLOUR, avatarUrl }
}

/**
 * The colour a chat chip paints its author. First the colour the TURN carries (`sent`): the server's
 * for that account (`personFace`), written into the turn when it was sent — the same the Comments tab
 * and the Team tab show, on any site, namesakes apart. A turn sent before turns carried it (UI
 * fine-tune round 2, e2e L3): the colour the Comments tab shows for that name — the server's, keyed by
 * ACCOUNT — when exactly one person of the lists heard is named so (as the turn and the rows name
 * them, `Name (e-mail part)` for namesakes). Else — another site, a name two people share, an author
 * the server sent no colour for — the neutral grey: nothing here hashes a name into a colour.
 * @param {ListsSnapshot} snapshot
 * @param {string} name - the chip's author, as the turn names them.
 * @param {string} [sent] - the colour the turn carries for them (the head's `author-color`), if any.
 * @returns {string}
 */
export function chipColor(snapshot, name, sent) {
  if (typeof sent === 'string' && HEX.test(sent)) return sent
  const want = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().toLowerCase() : ''
  const comments = [...snapshot.tabs.values()].flatMap((tab) => tab.comments)
  const names = rowNames(comments)
  /** @type {Set<string>} */
  const found = new Set()
  for (const c of comments) {
    if (c.author === undefined) continue
    if (names(c.author).replace(/\s+/g, ' ').trim().toLowerCase() === want)
      found.add(serverColour(c.author) ?? NEUTRAL_FACE_COLOUR)
  }
  return found.size === 1 ? /** @type {string} */ ([...found][0]) : NEUTRAL_FACE_COLOUR
}

/**
 * One comment of a list, checked; null when it is not one (no id, no words, or a draft).
 * @param {unknown} value
 * @returns {ListComment | null}
 */
function readComment(value) {
  if (value === null || typeof value !== 'object') return null
  const c = /** @type {Record<string, any>} */ (value)
  // TH-4: the server marks a deleted root kept for its replies `deletedRoot`; the fork says `removed`.
  const removed = c.removed === true || c.deletedRoot === true
  if (!isText(c.id) || (!removed && !isText(c.text)) || c.status === 'draft') return null
  const element =
    c.element !== null && typeof c.element === 'object' ? /** @type {RawElement} */ (c.element) : null
  const resolved = c.status === 'resolved' || (c.status === undefined && isTime(c.resolvedAt))
  return {
    id: c.id,
    url: typeof c.url === 'string' ? c.url : '',
    text: removed ? '' : c.text,
    resolved,
    createdAt: isTime(c.createdAt) ? msOf(c.createdAt) : 0,
    ...(isTime(c.resolvedAt) ? { resolvedAt: msOf(c.resolvedAt) } : {}),
    element,
    ...(c.author !== null && typeof c.author === 'object' ? { author: c.author } : {}),
    ...(isText(c.replyTo) ? { replyTo: c.replyTo } : {}),
    ...(Number.isSafeInteger(c.replyCount) && c.replyCount >= 0 ? { replyCount: c.replyCount } : {}),
    sentToTracy: c.sentToTracy === true,
    ...(c.can !== null && typeof c.can === 'object' && c.can.edit === true
      ? { mine: /** @type {const} */ (true) }
      : {}),
    ...(removed ? { removed: /** @type {const} */ (true) } : {}),
    ...(pageTitleOf(c.locate) !== '' ? { pageTitle: pageTitleOf(c.locate) } : {}),
    files: !removed && Array.isArray(c.attachments) ? c.attachments.length : 0,
    images:
      removed || !Array.isArray(c.attachments) ? [] : c.attachments.map(thumbOf).filter((t) => t !== null),
    ...(Number.isSafeInteger(c.n) && c.n > 0 ? { n: c.n } : {}),
    ...(isTime(c.deleting) ? { deleting: msOf(c.deleting) } : {}),
    ...(resolved && (c.resolvedByTracy === true || c.resolvedBy?.tracy === true)
      ? { resolvedByTracy: /** @type {const} */ (true) }
      : {}),
    ...lastSendOf(c)
  }
}

/**
 * A comment's latest send to Tracy: the Browser tab's `lastSend`, else the last of the server's `sends`
 * (oldest first). `answeredAt` only when a write of Tracy's cited it.
 * @param {Record<string, any>} c
 * @returns {{ lastSend?: { at: number, answeredAt?: number } }}
 */
function lastSendOf(c) {
  const raw =
    c.lastSend !== null && typeof c.lastSend === 'object'
      ? c.lastSend
      : Array.isArray(c.sends) && c.sends.length > 0
        ? c.sends[c.sends.length - 1]
        : null
  if (raw === null || typeof raw !== 'object' || !isTime(raw.at)) return {}
  return {
    lastSend: isTime(raw.answeredAt)
      ? { at: msOf(raw.at), answeredAt: msOf(raw.answeredAt) }
      : { at: msOf(raw.at) }
  }
}

/** A locate record that IS a page of the site (`page "Pricing"`), its title in the second group. */
const PAGE_RECORD = /^(?:page|article|post) "(.+)"$/is

/**
 * The CMS title of the page a comment is on, from its locate answer: the record its last level names,
 * when that record is a page, an article or a post (`page "Pricing"` → `Pricing`). '' for anything
 * else — a menu item, a shared part, no sure answer.
 * @param {unknown} locate
 * @returns {string}
 */
function pageTitleOf(locate) {
  if (locate === null || typeof locate !== 'object') return ''
  const l = /** @type {{ status?: unknown, levels?: unknown }} */ (locate)
  if (l.status !== 'resolved' || !Array.isArray(l.levels)) return ''
  const last = /** @type {{ label?: unknown } | undefined} */ (l.levels.at(-1))
  const m = typeof last?.label === 'string' ? PAGE_RECORD.exec(last.label.trim()) : null
  return m === null ? '' : m[1].replace(/\s+/g, ' ').trim()
}

/**
 * A stored file the row may show as a thumbnail: a picture (`type` image/*) whose address is the
 * comment door's own (a same-origin path) or plain http(s) — nothing a `javascript:` or `data:` source
 * could ride in on. Null for anything else; the row still counts it among `files`.
 * @param {unknown} value
 * @returns {Thumb | null}
 */
function thumbOf(value) {
  if (value === null || typeof value !== 'object') return null
  const a = /** @type {Record<string, unknown>} */ (value)
  if (typeof a.type !== 'string' || !a.type.toLowerCase().startsWith('image/')) return null
  if (typeof a.url !== 'string' || !/^(\/(?!\/)|https?:\/\/)/i.test(a.url)) return null
  return { name: typeof a.name === 'string' ? a.name : '', url: a.url }
}

/**
 * A `tracy:comment-list` detail, checked; null when it is not one.
 * @param {unknown} detail
 * @returns {Omit<TabList, 'heard'> | null}
 */
export function readCommentList(detail) {
  if (detail === null || typeof detail !== 'object') return null
  const d = /** @type {Record<string, any>} */ (detail)
  if (!isText(d.tabId) || !Array.isArray(d.comments)) return null
  return {
    sessionId: typeof d.sessionId === 'string' ? d.sessionId : '',
    tabId: d.tabId,
    siteKey: typeof d.siteKey === 'string' ? d.siteKey : '',
    host: typeof d.host === 'string' ? d.host : '',
    active: d.active === true,
    url: typeof d.url === 'string' ? d.url : '',
    comments: d.comments.map(readComment).filter((c) => c !== null),
    attachments: readAttachmentsConfig(d.attachments),
    maxChars:
      d.limits !== null &&
      typeof d.limits === 'object' &&
      Number.isSafeInteger(d.limits.maxChars) &&
      d.limits.maxChars > 0
        ? d.limits.maxChars
        : DEFAULT_MAX_CHARS,
    thread: isText(d.thread) ? d.thread : null
  }
}

/**
 * A comment the view hides while a Clear all waits out its Undo window (`comment-clear.mjs`).
 * @param {ListComment} c
 * @returns {ListComment}
 */
const hiddenOf = (c) => ({
  ...c,
  text: '',
  removed: /** @type {const} */ (true),
  hidden: /** @type {const} */ (true)
})

/**
 * Where a tab's list is filed (round 6): by conversation AND tab id — a tab id is only unique inside
 * one conversation (two conversations can both have a `tab3`), so filing by `tabId` alone let one
 * conversation's list overwrite the other's.
 * @param {{ sessionId: string, tabId: string }} list
 * @returns {string}
 */
export function tabKey(list) {
  return `${list.sessionId}\u0000${list.tabId}`
}

/**
 * The latest list of every Browser tab heard, as an observable store (for `useSyncExternalStore`).
 *
 * Clear all · Undo (Brian 29/09 ~18:00, `comment-clear.mjs`): `hide(ids)` takes comments off every
 * snapshot at once, whatever the tabs list next (their polls still carry them: nothing reached the
 * server yet); `show(ids)` is Undo; `settle(ids)` is "the clear went to the tabs" — each id stays off
 * until no tab lists it live any more, so the rows neither flash back before the fork's next list
 * nor stay hidden after a refused clear puts them back.
 * `focus(sessionId)` says which conversation is on screen (SEND-v4-new-1): from then on the tab shown,
 * the rows and every act belong to a Browser tab of THAT conversation ({@link tabsOnScreen}).
 * `serve(answer)` files the server's read of the site's comments (`comment-server.mjs`), which the
 * rows come from while no Browser tab of the conversation on screen lists ({@link sourceTabs}).
 * `setReads` / `markRead` file this person's read marks (`comment-reads.mjs`), `setViewer` who they are,
 * `setWorking` the comments a watched turn works on (`comment-working.mjs`): what the rows say about
 * read and "Tracy working…" ({@link rowsOf}).
 * @returns {{ accept(detail: unknown): void, getSnapshot(): ListsSnapshot, subscribe(fn: () => void): () => void,
 *   focus(sessionId: string | undefined): void,
 *   setReads(marks: Iterable<[string, number | null]>): void, markRead(id: string, seen: number | null | undefined): void,
 *   setViewer(email: string | null | undefined): void, setWorking(ids: Iterable<string>): void,
 *   serve(answer: { status: 'loading' } | { status: 'failed' } | { status: 'ready', siteKey: string, body: unknown }): void,
 *   hide(ids: Iterable<string>): void, show(ids: Iterable<string>): void, settle(ids: Iterable<string>): void }}
 */
export function createCommentLists() {
  /** @type {ListsSnapshot} */
  let heardSnapshot = { tabs: new Map() }
  /** @type {ListsSnapshot} */
  let snapshot = heardSnapshot
  /** @type {string | undefined} */
  let onScreen
  /** @type {ServerState | undefined} */
  let server
  /** @type {Reads} */
  let reads = { ready: false, marks: new Map() }
  /** @type {string | undefined} */
  let viewer
  /** @type {ReadonlySet<string>} */
  let working = new Set()
  let heard = 0
  /** Hidden ids → whether their clear already went to the tabs (`settle`). */
  /** @type {Map<string, boolean>} */
  const hidden = new Map()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const listedLive = (/** @type {string} */ id) => {
    for (const tab of heardSnapshot.tabs.values())
      if (tab.comments.some((c) => c.id === id && !c.removed)) return true
    return false
  }
  const publish = () => {
    for (const [id, sent] of hidden) if (sent && !listedLive(id)) hidden.delete(id)
    /** @param {TabList} tab */
    const masked = (tab) => ({
      ...tab,
      comments: tab.comments.map((c) => (hidden.has(c.id) && !c.removed ? hiddenOf(c) : c))
    })
    /** @type {ListsSnapshot} */
    let next
    if (hidden.size === 0) next = heardSnapshot
    else {
      const tabs = new Map()
      for (const [key, tab] of heardSnapshot.tabs) tabs.set(key, masked(tab))
      next = { tabs }
    }
    if (onScreen !== undefined) next = { ...next, onScreen }
    next = { ...next, reads, working, ...(viewer !== undefined ? { viewer } : {}) }
    if (server !== undefined)
      next = {
        ...next,
        server: hidden.size === 0 || server.list === null ? server : { ...server, list: masked(server.list) }
      }
    snapshot = next
    for (const fn of listeners) fn()
  }
  return {
    accept(detail) {
      const list = readCommentList(detail)
      if (!list) return
      heard += 1
      const tabs = new Map(heardSnapshot.tabs)
      // One Browser tab of a conversation is active at a time: a list that says it is makes the
      // conversation's others say not (the fork also says `active: false` once as a tab leaves).
      if (list.active)
        for (const [key, other] of tabs)
          if (other.active && other.sessionId === list.sessionId) tabs.set(key, { ...other, active: false })
      tabs.set(tabKey(list), { ...list, heard })
      heardSnapshot = { tabs }
      publish()
    },
    getSnapshot: () => snapshot,
    serve(answer) {
      if (answer.status !== 'ready') {
        // A read that failed or is under way keeps the list already read (`comment-server.mjs`).
        if (server?.list) return
        server = { status: answer.status, list: null }
        publish()
        return
      }
      const raw = serverListOf(answer.body, answer.siteKey)
      const list = raw === null ? null : readCommentList({ ...raw, tabId: SERVER_TAB })
      if (list === null) return
      // No tab: its rows act through nothing (`tabId` ''), and it is no conversation's.
      server = { status: 'ready', list: { ...list, tabId: '', sessionId: '', heard: 0 } }
      publish()
    },
    focus(sessionId) {
      const next = typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined
      if (next === onScreen) return
      onScreen = next
      publish()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    setReads(marks) {
      reads = { ready: true, marks: new Map(marks) }
      publish()
    },
    markRead(id, seen) {
      const marks = new Map(reads.marks)
      if (seen === undefined) marks.delete(id)
      else marks.set(id, seen)
      reads = { ready: reads.ready, marks }
      publish()
    },
    setViewer(email) {
      const next = typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : undefined
      if (next === viewer) return
      viewer = next
      publish()
    },
    setWorking(ids) {
      const next = new Set(ids)
      if (next.size === working.size && [...next].every((id) => working.has(id))) return
      working = next
      publish()
    },
    hide(ids) {
      for (const id of ids) hidden.set(id, false)
      publish()
    },
    show(ids) {
      for (const id of ids) hidden.delete(id)
      publish()
    },
    settle(ids) {
      for (const id of ids) if (hidden.has(id)) hidden.set(id, true)
      publish()
    }
  }
}

/**
 * The Browser tabs of the conversation on screen (SEND-v4-new-1, e2e v4): a conversation left in the
 * same page keeps its Browser view mounted, hidden, and it goes on sending lists — so "active, heard
 * last" alone picked a background tab, and the Comments tab and Send all went into two conversations.
 * Tabs of the on-screen session; with none, a tab that names no session (a view with no scope — it is
 * unknown, not known to be another's); with neither, none. Before the page knows which conversation is
 * on screen, every tab, as before.
 * @param {ListsSnapshot} snapshot
 * @returns {TabList[]}
 */
export function tabsOnScreen(snapshot) {
  const all = [...snapshot.tabs.values()]
  if (snapshot.onScreen === undefined) return all
  const mine = all.filter((tab) => tab.sessionId === snapshot.onScreen)
  return mine.length > 0 ? mine : all.filter((tab) => tab.sessionId === '')
}

/** The tab id a server list is read under, before {@link createCommentLists} files it with none. */
const SERVER_TAB = 'tracy:server'

/**
 * Where the rows come from — ONE source at a time, never merged (Akemi 01/10/2026): the Browser tabs of
 * the conversation on screen ({@link tabsOnScreen}) while any lists, since they are live and every act
 * goes through them; else the server's read of the site's comments (`comment-server.mjs`), so the tab
 * and its count are right with no Browser tab open; else none.
 * @param {ListsSnapshot} snapshot
 * @returns {{ source: 'tab' | 'server' | 'none', tabs: TabList[] }}
 */
export function sourceTabs(snapshot) {
  const live = tabsOnScreen(snapshot)
  if (live.length > 0) return { source: 'tab', tabs: live }
  const list = snapshot.server?.list ?? null
  return list === null ? { source: 'none', tabs: [] } : { source: 'server', tabs: [list] }
}

/**
 * The conversation an act is for (round 6): the one on screen, followed live — or, before the page
 * knows it, the tab's own. Every act carries it beside `tabId`, and the fork acts only when BOTH match
 * its own conversation (`tabId` alone can repeat across two conversations).
 * @param {ListsSnapshot} snapshot
 * @param {TabList} tab
 * @returns {string}
 */
export function actSession(snapshot, tab) {
  return snapshot.onScreen ?? tab.sessionId
}

/**
 * The tab the view is about: among the conversation on screen's ({@link tabsOnScreen}), the active
 * one, else the one heard last; null before any list, or when the conversation on screen has none.
 * @param {ListsSnapshot} snapshot
 * @returns {TabList | null}
 */
export function shownTab(snapshot) {
  /** @type {TabList | null} */
  let best = null
  for (const tab of tabsOnScreen(snapshot)) {
    if (
      best === null ||
      (tab.active && !best.active) ||
      (tab.active === best.active && tab.heard > best.heard)
    )
      best = tab
  }
  return best
}

/** Heading tags: the chip's "T". */
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
/** Tags that hold a region rather than words. */
const SECTIONS = new Set([
  'section',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'article',
  'div',
  'figure',
  'form'
])
/** The kinds a list may name itself (H3). */
const LIST_KINDS = new Set(['text', 'image', 'link', 'menu', 'section', 'other'])

/**
 * Which icon a comment's chip leads with. The list's own `kind` when it names one of H3's kinds;
 * else read from the raw element: an image, a menu item (a link with a `menuItem` mark), a link, a
 * heading, words, a region. `page` for a comment about the whole page.
 * @param {RawElement | null} element
 * @returns {Kind}
 */
export function elementKind(element) {
  if (element === null || element === undefined) return 'page'
  if (typeof element.kind === 'string' && LIST_KINDS.has(element.kind))
    return /** @type {Kind} */ (element.kind)
  if (element.image && typeof element.image === 'object') return 'image'
  const tag = typeof element.tag === 'string' ? element.tag.toLowerCase() : ''
  if (tag === 'img' || tag === 'picture') return 'image'
  if (tag === 'a') return (element.marks ?? []).some((m) => m.startsWith('menuItem:')) ? 'menu' : 'link'
  if (HEADINGS.has(tag)) return 'heading'
  if (SECTIONS.has(tag) && !isText(element.text)) return 'section'
  if (isText(element.text)) return 'text'
  return SECTIONS.has(tag) ? 'section' : 'other'
}

/** @param {string} url @returns {string} the path of an address ("/" when it has none), or '' */
function pathOf(url) {
  try {
    return new URL(url).pathname || '/'
  } catch {
    return ''
  }
}

/** @param {string} url @returns {string} the page an address is on: origin and path, no trailing slash. */
function pageOf(url) {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return url
  }
}

/**
 * @param {ListComment} c
 * @param {TabList} tab - the list it came from.
 * @param {TabList | null} shown - the tab the view is about.
 * @param {number} replies
 * @param {(author: unknown) => string} names - how rows name a person ({@link rowNames}).
 * @param {string} sessionId - the conversation the row's acts are for ({@link actSession}).
 * @param {Map<string, string>} titles - the pages' CMS titles ({@link pageTitles}).
 * @param {{ status: Status, unread: boolean, selected: boolean, mine: boolean }} facts - what the row
 *   says beyond the comment itself ({@link rowsOf}).
 * @returns {Omit<Row, 'lastActivity'>}
 */
function rowOf(c, tab, shown, replies, names, sessionId, titles, facts) {
  const who = authorOf(c.author)
  const email = typeof c.author?.email === 'string' ? c.author.email.trim() : ''
  const url = c.url || tab.url
  const onPage = shown !== null && pageOf(url) === pageOf(shown.url)
  const image = imageAnchor(c.element)
  return {
    id: c.id,
    tabId: tab.tabId,
    sessionId,
    text: c.text,
    resolved: c.resolved,
    createdAt: c.createdAt,
    ...(c.resolvedAt !== undefined ? { resolvedAt: c.resolvedAt } : {}),
    kind: elementKind(c.element),
    // The words the chat's chips use: the words pointed at, else the element's name; a comment
    // about the whole page names its page (the view says "Whole page · /").
    // An image names its alt or file, after "Image ·" (`onImage`).
    chip:
      c.element === null
        ? pathOf(url)
        : (image ?? chipLabel({ name: c.element.label, text: c.element.text }, { many: true })),
    ...(image !== null ? { onImage: /** @type {const} */ (true) } : {}),
    path: pathOf(url),
    url,
    pageTitle: titles.get(pageOf(url)) ?? '',
    author: names(c.author),
    initial: who.initial,
    color: who.color,
    avatarUrl: who.avatarUrl,
    replies,
    sentToTracy: c.sentToTracy,
    onPage,
    files: c.files,
    images: c.images ?? [],
    ...(c.removed ? { deleted: /** @type {const} */ (true) } : {}),
    n: c.n ?? 0,
    handle: handleOf(c.author),
    email,
    ...facts,
    ...(c.deleting !== undefined ? { deleting: c.deleting } : {}),
    image: c.removed ? null : pictureOf(c.element)
  }
}

/**
 * The name a row shows (Comments list redesign A, Akemi 01/10/2026): the part of the author's e-mail
 * before its at sign — what the team types after "@" — else their display name; the tooltip carries the
 * whole address. '' for a list with no author.
 * @param {unknown} author
 * @returns {string}
 */
export function handleOf(author) {
  const a = author !== null && typeof author === 'object' ? /** @type {RawAuthor} */ (author) : {}
  if (isText(a.email)) return /** @type {string} */ (a.email).trim().split('@')[0]
  return nameOf(a)
}

/**
 * The picture a comment is anchored on, for its attachment chip and full-screen view: the element's
 * own image address (http(s) or a same-origin path — never `data:` or `javascript:`), named by the
 * file at the end of that address, else its alt. Null for any other element.
 * @param {RawElement | null} element
 * @returns {Picture | null}
 */
export function pictureOf(element) {
  const image = element?.image
  if (image === null || image === undefined || typeof image !== 'object') return null
  const src = typeof image.src === 'string' ? image.src.trim() : ''
  if (!/^(\/(?!\/)|https?:\/\/)/i.test(src)) return null
  const alt = typeof image.alt === 'string' ? image.alt.replace(/\s+/g, ' ').trim() : ''
  let file = ''
  try {
    const last = new URL(src, 'https://site.invalid/').pathname.split('/').filter(Boolean).at(-1) ?? ''
    file = decodeURIComponent(last)
  } catch {
    file = ''
  }
  return { src, name: file || alt || 'image', alt }
}

/**
 * The tag under a comment's words (Comments list redesign A): `working` while a turn this page watches
 * works on it (`comment-working.mjs`); else, from its latest send, `done` when a site write of Tracy's
 * cited it and `asked` when none did yet; `asked` when the list only says it was sent; `note` when it
 * never went to Tracy. A write that never passed the Apply door (an EmDash site's own tools) cites no
 * number, so such a comment stays `asked` — never a guess. A comment Tracy resolved on that proof
 * (ADR 0025) is `tracy`: "Tracy marked this done", where the resolved list names who resolved it.
 * A reply written after Tracy's write reopened the thread (the server reopens on any reply): that write
 * no longer answers it, so the comment is a `note` again until its next send — never "Done by Tracy"
 * under Open (e2e E4.4b, 04/10/2026).
 * @param {ListComment} c
 * @param {ReadonlySet<string> | undefined} working
 * @param {readonly ListComment[]} [replies] - the thread's replies ({@link threadReplies}).
 * @returns {Status}
 */
export function statusOf(c, working, replies = []) {
  if (working?.has(c.id)) return 'working'
  if (c.resolved && c.resolvedByTracy === true) return 'tracy'
  if (c.lastSend !== undefined) {
    const answeredAt = c.lastSend.answeredAt
    if (answeredAt === undefined) return 'asked'
    const reopened = !c.resolved && replies.some((r) => !r.removed && r.createdAt > answeredAt)
    return reopened ? 'note' : 'done'
  }
  return c.sentToTracy ? 'asked' : 'note'
}

/**
 * The replies under `rootId` at ANY depth, from one list (TCH `comment-notify.js` `rootOf`: a thread is
 * its root's, whatever a reply answers). Walks through a removed middle reply, so a live reply under it
 * still belongs to the thread.
 * @param {readonly ListComment[]} comments
 * @param {string} rootId
 * @returns {ListComment[]}
 */
function threadReplies(comments, rootId) {
  /** @type {ListComment[]} */
  const found = []
  const ids = new Set([rootId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of comments)
      if (c.replyTo !== undefined && ids.has(c.replyTo) && !ids.has(c.id)) {
        ids.add(c.id)
        found.push(c)
        grew = true
      }
  }
  return found
}

/**
 * The messages of a thread that can make it unread for this person: the comment itself and its live
 * replies (any depth, none waiting out a Delete's Undo window), minus their own words — the viewer's
 * e-mail decides, else the list's `mine`.
 * @param {ListComment} c
 * @param {readonly ListComment[]} replies
 * @param {string | undefined} viewer
 * @returns {ListComment[]}
 */
function othersIn(c, replies, viewer) {
  const mineOf = (/** @type {ListComment} */ x) => {
    const email = typeof x.author?.email === 'string' ? x.author.email.trim().toLowerCase() : ''
    return viewer !== undefined && email !== '' ? email === viewer : x.mine === true
  }
  return [c, ...replies.filter((r) => !r.removed && r.deleting === undefined)].filter((x) => !mineOf(x))
}

/**
 * Whether a thread is unread for this person (Comments list redesign A; read marks by number, Lee
 * 04/10/2026): never before their read marks are known (`reads.ready`); always when they chose "Mark as
 * unread" (a null mark); else when someone ELSE wrote in it — the comment itself or a live reply at any
 * depth — a message numbered above what they saw when they last opened it (`seenN`, {@link seenOf}), or
 * at all when they never did. Their own words never make it unread. By number, not by time: the number
 * is what the tab drew, where a time was the server's when the mark arrived and swallowed a reply
 * written in between.
 * @param {ListComment} c
 * @param {readonly ListComment[]} replies - its listed replies, any depth.
 * @param {ListsSnapshot} snapshot
 * @returns {boolean}
 */
export function unreadOf(c, replies, snapshot) {
  const reads = snapshot.reads
  if (reads === undefined || !reads.ready) return false
  const mark = reads.marks.get(c.id)
  if (mark === null) return true
  const others = othersIn(c, replies, snapshot.viewer)
  if (others.length === 0) return false
  return mark === undefined || others.some((x) => (x.n ?? 0) > mark)
}

/**
 * What this person sees of thread `id` right now — the mark `/read` files (`comment-reads.mjs`): the
 * largest number of the other people's messages in it ({@link othersIn}) on the lists the rows are drawn
 * from ({@link sourceTabs}); 0 when it holds none. Exactly what {@link unreadOf} compares with, so a
 * thread marked with it reads as read at once, and a reply the tab has not heard yet stays above it.
 * @param {ListsSnapshot} snapshot
 * @param {string} id - the thread's comment.
 * @returns {number}
 */
export function seenOf(snapshot, id) {
  let seen = 0
  for (const tab of sourceTabs(snapshot).tabs) {
    const c = tab.comments.find((x) => x.id === id)
    if (c === undefined) continue
    for (const x of othersIn(c, threadReplies(tab.comments, id), snapshot.viewer))
      seen = Math.max(seen, x.n ?? 0)
  }
  return seen
}

/**
 * How rows name people (TH-6, acceptance e2e v3): the display name, and when two DIFFERENT people of the
 * lists heard share it, `Name (e-mail local part)` — the way the turn to Tracy names them
 * (`comment-turn.mjs` `namesFor`). A person is their account, else their e-mail, else their name.
 * @param {readonly ListComment[]} comments - every comment heard, replies included (they meet in a thread).
 * @returns {(author: unknown) => string}
 */
function rowNames(comments) {
  /** @param {RawAuthor} a */
  const who = (a) =>
    isText(a.accountId)
      ? `a:${a.accountId}`
      : isText(a.email)
        ? `e:${String(a.email).trim().toLowerCase()}`
        : `n:${nameOf(a)}`
  /** @type {Map<string, Set<string>>} */
  const people = new Map()
  for (const c of comments) {
    const a = c.author !== null && typeof c.author === 'object' ? /** @type {RawAuthor} */ (c.author) : {}
    const name = nameOf(a).toLowerCase()
    if (name === '') continue
    people.set(name, (people.get(name) ?? new Set()).add(who(a)))
  }
  return (author) => {
    const a = author !== null && typeof author === 'object' ? /** @type {RawAuthor} */ (author) : {}
    const name = nameOf(a)
    const local = isText(a.email) ? String(a.email).trim().split('@')[0] : ''
    return (people.get(name.toLowerCase())?.size ?? 0) > 1 && local !== '' && local !== name
      ? `${name} (${local})`
      : name
  }
}

/**
 * The CMS title of each page (by {@link pageOf}), from the locate answers of its comments — the
 * server's list carries them, a Browser tab's does not, so it is read from every list heard. Only a
 * title every such comment of the page agrees on: two records on one page (a blog listing whose cards
 * are other posts) name none.
 * @param {readonly TabList[]} tabs
 * @returns {Map<string, string>}
 */
function pageTitles(tabs) {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map()
  for (const tab of tabs)
    for (const c of tab.comments) {
      if (c.pageTitle === undefined) continue
      const key = pageOf(c.url || tab.url)
      seen.set(key, (seen.get(key) ?? new Set()).add(c.pageTitle))
    }
  /** @type {Map<string, string>} */
  const titles = new Map()
  for (const [key, names] of seen) if (names.size === 1) titles.set(key, [...names][0])
  return titles
}

/** The separators a page's document title puts before the site's name (`Pricing — Kinetic`). */
const TITLE_SEPARATORS = [' — ', ' | ', ' - ']

/**
 * What a page group is called (Comments tab layout B, Akemi 01/10/2026): the page's CMS title when its
 * comments' locate answers name it; else its document title without the site's name (the part after
 * the LAST separator, only when something is left before it); the root path is Home (`home`: the view
 * says it in the reader's language); else its path.
 * @param {{ path: string, record?: string, title?: string }} page
 * @returns {{ name: string, home: boolean }}
 */
export function pageLabel(page) {
  const record = typeof page.record === 'string' ? page.record.replace(/\s+/g, ' ').trim() : ''
  if (record !== '') return { name: record, home: false }
  const title = typeof page.title === 'string' ? page.title.replace(/\s+/g, ' ').trim() : ''
  if (title !== '') {
    for (const sep of TITLE_SEPARATORS) {
      const at = title.lastIndexOf(sep)
      const head = at < 0 ? '' : title.slice(0, at).trim()
      if (head !== '') return { name: head, home: false }
    }
    return { name: title, home: false }
  }
  if (page.path === '/') return { name: '', home: true }
  return { name: page.path, home: false }
}

/**
 * Every comment row of every tab of the conversation on screen ({@link tabsOnScreen}) — top-level comments only, each once (the shown tab's copy
 * first), none removed or hidden. A reply is never a row: it lives in its parent's thread card, and
 * the row says how many there are.
 * @param {ListsSnapshot} snapshot
 * @returns {Row[]}
 */
export function rowsOf(snapshot) {
  const shown = shownTab(snapshot)
  // A row's tab is the one its Reveal / Resolve acts on: only the conversation on screen's. With none,
  // the server's list (no tab: its rows act on nothing).
  const tabs = sourceTabs(snapshot).tabs.sort((a, b) => Number(b === shown) - Number(a === shown))
  const seen = new Set()
  const names = rowNames(tabs.flatMap((tab) => tab.comments))
  const titles = pageTitles([...tabs, ...(snapshot.server?.list ? [snapshot.server.list] : [])])
  /** @type {Row[]} */
  const rows = []
  for (const tab of tabs)
    for (const c of tab.comments) {
      if (c.hidden || c.replyTo !== undefined || seen.has(c.id)) continue
      const listed = tab.comments.filter((r) => r.replyTo === c.id && !r.removed && r.deleting === undefined)
      const replies = c.replyCount ?? listed.length
      // TH-4: a root whose words are gone is a row only while replies stand under it.
      if (c.removed && replies === 0) continue
      seen.add(c.id)
      // The thread's last activity (Brian 23:25): the comment's own time or its latest reply's.
      const lastActivity = Math.max(c.createdAt, ...listed.map((r) => r.createdAt))
      const thread = threadReplies(tab.comments, c.id)
      const facts = {
        status: statusOf(c, snapshot.working, thread),
        unread: c.deleting === undefined && unreadOf(c, thread, snapshot),
        selected: tab.thread === c.id,
        mine: c.mine === true
      }
      rows.push({
        ...rowOf(c, tab, shown, replies, names, actSession(snapshot, tab), titles, facts),
        lastActivity
      })
    }
  return rows
}

/**
 * The Comments tab's sub-filter (UI fine-tune 30/09, rule 3): `page` = the page the Browser tab shows
 * (`Current page`, the default), `all` = every page of the site (`All pages`).
 * @typedef {'page' | 'all'} PageFilter
 */
export const PAGE_FILTERS = Object.freeze(/** @type {const} */ (['page', 'all']))

/** @param {string} person @returns {string} the storage key of one person's filter on this browser. */
const filterKey = (person) => `tracy:comments-filter:${person}`
/** @param {unknown} person @returns {string} a person as the filter memory knows them: their e-mail, lower case. */
const personOf = (person) => (typeof person === 'string' ? person.trim().toLowerCase() : '')

/**
 * The filter this person last chose on this browser (U12, U13): `all` only when they chose it, else the
 * default `page` — a clean browser, another seat, no storage, storage that throws (a private window,
 * blocked site data) or a value this code did not write. Nobody known (no e-mail): the default.
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage - `localStorage`
 * @param {string | null | undefined} person - the signed-in seat's e-mail
 * @returns {PageFilter}
 */
export function readPageFilter(storage, person) {
  const who = personOf(person)
  if (who === '' || storage == null) return 'page'
  try {
    return storage.getItem(filterKey(who)) === 'all' ? 'all' : 'page'
  } catch {
    return 'page'
  }
}

/**
 * Remember the filter this person chose (never throws; nothing is kept for nobody).
 * @param {Pick<Storage, 'setItem'> | null | undefined} storage
 * @param {string | null | undefined} person
 * @param {PageFilter} filter
 */
export function writePageFilter(storage, person, filter) {
  const who = personOf(person)
  if (who === '' || storage == null) return
  try {
    storage.setItem(filterKey(who), filter === 'all' ? 'all' : 'page')
  } catch {
    // Storage refused: the choice lasts until the page reloads.
  }
}

/**
 * The status filter (Comments list redesign A, Akemi 01/10/2026): `open` (the default) or `resolved` —
 * no "All". It replaces the "Show N resolved comments" toggle and is never remembered across a reload.
 * @typedef {'open' | 'resolved'} StatusFilter
 */
export const STATUS_FILTERS = Object.freeze(/** @type {const} */ (['open', 'resolved']))

/**
 * Everything the tab draws from the lists heard, for one choice of the page filter and of the status
 * filter (Comments list redesign A, Akemi 01/10/2026).
 * @param {ListsSnapshot} snapshot
 * @param {{ filter?: PageFilter, status?: StatusFilter }} [view]
 *   `filter` — `page` (default) or `all`; `status` — `open` (default) or `resolved`.
 * @returns {{ shown: TabList | null, sessionId: string, filter: PageFilter, status: StatusFilter,
 *   rows: Row[], open: Row[], resolved: Row[], visible: Row[], sendAll: Row[], counts: { page: number, all: number },
 *   openCounts: { page: number, all: number }, unread: { page: number, all: number } | null,
 *   statusCounts: { open: number, resolved: number }, elsewhere: number, badge: number, empty: boolean,
 *   source: 'tab' | 'server' | 'none', loading: boolean, failed: boolean, attachments: AttachmentsConfig,
 *   maxChars: number, thread: string | null, current: { path: string, url: string, title: string } | null }}
 *   `rows` — what is drawn: the page filter's rows of the chosen status, NEWEST FIRST by the thread's
 *   last activity (Brian 29/09 23:25), a comment whose Delete waits out its Undo window included in its
 *   place (`deleting`);
 *   `open` / `resolved` — the page filter's rows of each status, none `deleting`;
 *   `visible` — what "Delete all" deletes: the rows drawn, none `deleting`;
 *   `sendAll` — what "Ask Tracy to edit all" offers: the page filter's open rows (empty in Resolved);
 *   `counts` — the chosen status's comments of the page shown and of the whole site: totals only;
 *   `openCounts` — the OPEN threads, all authors, on the page shown and on the whole site, whatever the
 *   status filter ({@link openCountsOf}): the page filter's two grey pills (Lee 04/10/2026);
 *   `unread` — this person's unread OPEN threads (`unreadOf`) on the page shown and on the whole site,
 *   whatever the status filter: the red dot on each pill and its "N unread" (Lee 04/10/2026). Null
 *   until their read marks are in (`reads.ready`), so no dot shows that the marks would then take back;
 *   `statusCounts` — the page filter's open and resolved comments: the status filter's two plain counts;
 *   `elsewhere` — open comments on other pages;
 *   `badge` — every open comment of the site, all authors ({@link badgeCount}), = `openCounts.all`;
 *   `empty` — the site has no comment at all (empty state E1), known, never while the server's read is
 *   under way or failed;
 *   `source`, `loading`, `failed` — as {@link sourceTabs} says and the server's read stands;
 *   `thread` — the comment whose card is open on the page;
 *   `current` — the page the Browser tab shows (its path, address and CMS title), its group always drawn.
 */
export function viewModel(snapshot, view = {}) {
  const shown = shownTab(snapshot)
  // No Browser tab shown, no current page (Akemi 01/10/2026): the tab shows All pages, whatever the
  // person last chose — the choice itself is kept for when a tab shows a page again.
  const filter = view.filter === 'all' || shown === null ? 'all' : 'page'
  const status = view.status === 'resolved' ? 'resolved' : 'open'
  const all = rowsOf(snapshot)
  const { source } = sourceTabs(snapshot)
  const server = source === 'none' ? snapshot.server?.status : undefined
  const newest = (/** @type {Row} */ a, /** @type {Row} */ b) => b.lastActivity - a.lastActivity
  const inFilter = all.filter((r) => filter === 'all' || r.onPage).sort(newest)
  const live = (/** @type {Row} */ r) => r.deleting === undefined
  const open = inFilter.filter((r) => !r.resolved && live(r))
  const resolved = inFilter.filter((r) => r.resolved && live(r))
  const rows = inFilter.filter((r) => r.resolved === (status === 'resolved'))
  const ofStatus = all.filter((r) => live(r) && r.resolved === (status === 'resolved'))
  const counts = { page: ofStatus.filter((r) => r.onPage).length, all: ofStatus.length }
  const openCounts = openCountsOf(all)
  const unreadAll = unreadOpenOf(all)
  const unread =
    snapshot.reads?.ready === true
      ? { page: unreadAll.filter((r) => r.onPage).length, all: unreadAll.length }
      : null
  const loading = server === 'loading'
  const failed = server === 'failed'
  const titles = new Map(all.map((r) => [r.path, r.pageTitle]))
  const currentPath = shown === null ? '' : pathOf(shown.url)
  return {
    shown,
    sessionId: shown === null ? '' : actSession(snapshot, shown),
    filter,
    status,
    rows,
    open,
    resolved,
    visible: rows.filter(live),
    sendAll: status === 'open' ? open : [],
    counts,
    openCounts,
    unread,
    statusCounts: { open: open.length, resolved: resolved.length },
    elsewhere: openCounts.all - openCounts.page,
    badge: openCounts.all,
    empty: all.length === 0 && !loading && !failed,
    source,
    loading,
    failed,
    attachments: shown?.attachments ?? readAttachmentsConfig(null),
    maxChars: shown?.maxChars ?? DEFAULT_MAX_CHARS,
    thread: shown?.thread ?? null,
    current:
      shown === null || currentPath === ''
        ? null
        : { path: currentPath, url: shown.url, title: titles.get(currentPath) ?? '' }
  }
}

/**
 * The "Send all" checklist's count: it ticks THREADS (one row each) and counts threads (UI fine-tune
 * round 2, rule 7, Brian 30/09 — reversing bug 3's "count messages"), so with everything ticked it
 * reads the head's N ("5 of 5 comments"); each thread's replies still go with it.
 * @param {{ sendAll: Row[] }} vm
 * @param {ReadonlySet<string>} unticked - the rows left unticked.
 * @returns {{ count: number, total: number }}
 */
export function checklistCount(vm, unticked) {
  return { count: vm.sendAll.filter((r) => !unticked.has(r.id)).length, total: vm.sendAll.length }
}

/**
 * Who is sending from this page (round 3: the `(now)` line of words typed in a thread card), as the
 * turn names people: the signed-in seat's e-mail (`/auth/me`) with the name its own comments carry,
 * else the part of the e-mail before its at sign. With no e-mail (a surface where `/auth/me` does not
 * answer), the author of a comment the list says the viewer may edit. Null when neither says.
 * @param {ListsSnapshot} snapshot
 * @param {string | null | undefined} email
 * @returns {{ name: string, email: string } | null}
 */
export function senderOf(snapshot, email) {
  const all = [...snapshot.tabs.values()].flatMap((tab) => tab.comments)
  const want = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (want !== '') {
    for (const c of all) {
      const a = /** @type {RawAuthor} */ (c.author ?? {})
      if (typeof a.email === 'string' && a.email.trim().toLowerCase() === want && isText(a.name))
        return { name: /** @type {string} */ (a.name).trim(), email: want }
    }
    return { name: want.split('@')[0], email: want }
  }
  const mine = all.find((c) => c.mine === true && c.author !== undefined)
  if (mine === undefined) return null
  const a = /** @type {RawAuthor} */ (mine.author)
  const name = nameOf(a)
  return name === '' ? null : { name, email: typeof a.email === 'string' ? a.email.trim().toLowerCase() : '' }
}

/**
 * The words a listed comment holds now, from any tab; undefined when no tab lists it. A root deleted
 * while replies stand under it (TH-4) is listed with no words: '' (e2e v4 thread, V4-2 — read as "not
 * listed", words typed in its card went to Tracy under the deleted root's author).
 * @param {ListsSnapshot} snapshot
 * @param {string} id
 * @returns {string | undefined}
 */
export function storedTextOf(snapshot, id) {
  let removed = false
  for (const tab of snapshot.tabs.values()) {
    const c = tab.comments.find((x) => x.id === id)
    if (c === undefined) continue
    if (!c.removed) return c.text
    removed = true
  }
  return removed ? '' : undefined
}

/**
 * The toolbar (Comments list redesign A, Akemi 01/10/2026): the status filter always, while the site has
 * a comment; "Delete all" while the view draws a comment it can delete; "Ask Tracy to edit all" only in
 * Open, while there is an open comment. Rows read from the server (no Browser tab lists,
 * `source: 'server'`) have no tab to act through: both buttons are disabled.
 * @param {{ sendAll: Row[], visible: Row[], empty: boolean, status: StatusFilter, source?: 'tab' | 'server' | 'none' }} vm
 * @returns {{ shown: boolean, deleteAll: { shown: boolean, disabled: boolean },
 *   sendAll: { shown: boolean, count: number, disabled: boolean } }}
 */
export function headActions(vm) {
  const count = vm.sendAll.length
  const actless = vm.source === 'server'
  return {
    shown: !vm.empty,
    deleteAll: { shown: vm.visible.length > 0, disabled: actless },
    sendAll: { shown: vm.status === 'open' && count > 0, count, disabled: actless }
  }
}

/**
 * The open threads of `rows` on the page the Browser tab shows (`page`) and on the whole site (`all`),
 * all authors, WHATEVER the status filter: the page filter's two pills (Lee 04/10/2026). A thread whose
 * Delete waits out its Undo window is not counted. Not `viewModel().counts`, which counts the chosen
 * status (Resolved chosen, it counts resolved threads).
 * @param {readonly Row[]} rows - every row ({@link rowsOf}).
 * @returns {{ page: number, all: number }}
 */
export function openCountsOf(rows) {
  const open = rows.filter((r) => !r.resolved && r.deleting === undefined)
  return { page: open.filter((r) => r.onPage).length, all: open.length }
}

/**
 * The Comments badge outside the tab (Lee 04/10/2026): the Comments tab's pill, the start screen's
 * Comments card and the Browser toolbar's "Comments N" (told to the fork by `comment-unread.mjs`), both
 * numbers from ONE snapshot. `open` is the number drawn, in grey: every open thread of the site, all
 * authors ({@link openCountsOf} `all`, the All pages pill), known without the read marks. `unread` is
 * the red dot: this person's unread open threads of the site ({@link unreadBadge}), null until their
 * read marks are in; the dot shows only above 0.
 * @param {ListsSnapshot} snapshot
 * @returns {{ open: number, unread: number | null }}
 */
export function commentBadge(snapshot) {
  const rows = rowsOf(snapshot)
  return {
    open: openCountsOf(rows).all,
    unread: snapshot.reads?.ready === true ? unreadOpenOf(rows).length : null
  }
}

/**
 * Every OPEN comment of the site, all authors: the number the Comments badge draws in grey ({@link
 * commentBadge} `open`; Lee 04/10/2026).
 * @param {ListsSnapshot} snapshot
 * @returns {number}
 */
export function badgeCount(snapshot) {
  return commentBadge(snapshot).open
}

/**
 * The rows of `rows` that are open, unread for this person ({@link unreadOf}) and not waiting out a
 * Delete's Undo window.
 * @param {readonly Row[]} rows
 * @returns {Row[]}
 */
function unreadOpenOf(rows) {
  return rows.filter((r) => r.deleting === undefined && !r.resolved && r.unread)
}

/**
 * The red dot on the Comments badge (Lee 04/10/2026; the Comments tab's pill, the start screen's
 * Comments card, the Browser toolbar's "Comments N"): this person's UNREAD open threads on the whole
 * site — the same number as the All pages pill's dot (`viewModel().unread.all`), said as "N unread" in
 * the badge's tooltip and name. Null until their read marks are in (`reads.ready`), so no dot shows that
 * the marks would then take back; the callers draw no dot at null or 0.
 * @param {ListsSnapshot} snapshot
 * @returns {number | null}
 */
export function unreadBadge(snapshot) {
  return commentBadge(snapshot).unread
}

/**
 * The rows of one list, by page (Comments list redesign A, L1): the page the Browser tab shows first —
 * ALWAYS, even with no row of the chosen status there ("No open comments on this page") — then the
 * others in the order their newest row came (the rows arrive newest first), each page's rows kept in
 * their order. A page is its path; a row with no path is filed under its address. Each carries the
 * address to open it at (`url`), its CMS title (`title`, '' when none is known; {@link pageLabel} names
 * it) and `count`, its rows minus any whose Delete waits out its window.
 * @param {readonly Row[]} rows
 * @param {{ path: string, url: string, title: string } | null} [current] - the page the Browser tab shows.
 * @returns {{ path: string, url: string, title: string, onPage: boolean, rows: Row[], count: number }[]}
 */
export function pageGroups(rows, current = null) {
  /** @type {Map<string, { path: string, url: string, title: string, onPage: boolean, rows: Row[], count: number }>} */
  const groups = new Map()
  if (current !== null)
    groups.set('\u0000here', {
      path: current.path,
      url: current.url,
      title: current.title,
      onPage: true,
      rows: [],
      count: 0
    })
  for (const r of rows) {
    const key = r.onPage ? '\u0000here' : r.path || r.url
    const group = groups.get(key) ?? {
      path: r.path || r.url,
      url: r.url,
      title: r.pageTitle,
      onPage: r.onPage,
      rows: [],
      count: 0
    }
    if (group.title === '' && r.pageTitle !== '') group.title = r.pageTitle
    group.rows.push(r)
    if (r.deleting === undefined) group.count += 1
    groups.set(key, group)
  }
  const all = [...groups.values()]
  return [...all.filter((g) => g.onPage), ...all.filter((g) => !g.onPage)]
}

/**
 * The open comments already sent to Tracy with nothing new since, as `GET /api/sites/:key/comments/sent`
 * answers (`apps/tracy-web` `comments.js` `sentAndWaiting`, ADR 0025): comment id → when that send went
 * (ms). Anything malformed is dropped; an answer that is not a list is no comment.
 * @param {unknown} body - `{sent: [{id, at}]}`.
 * @returns {Map<string, number>}
 */
export function readSentList(body) {
  const list = /** @type {{ sent?: unknown } | null} */ (body)?.sent
  /** @type {Map<string, number>} */
  const sent = new Map()
  if (!Array.isArray(list)) return sent
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const { id, at } = /** @type {{ id?: unknown, at?: unknown }} */ (item)
    const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN
    if (typeof id === 'string' && id !== '' && Number.isFinite(ms)) sent.set(id, ms)
  }
  return sent
}

/**
 * How "Ask Tracy to edit all" opens (ADR 0025, Brian 03–04/10/2026): ticked, the open comments never
 * sent to Tracy or written to (a reply, an edit) since their latest send; UNticked — still tickable —
 * the ones the server says are sent and waiting, each with when it went ("Sent 23:43"). A send whose
 * turn failed does not count (the server's rule). Nothing known from the server: all ticked.
 * @param {{ sendAll: Row[] }} vm
 * @param {ReadonlyMap<string, number>} sent - {@link readSentList}.
 * @returns {{ unticked: Set<string>, sentAt: Map<string, number> }}
 */
export function checklistDefaults(vm, sent) {
  /** @type {Map<string, number>} */
  const sentAt = new Map()
  for (const r of vm.sendAll) {
    const at = sent.get(r.id)
    if (at !== undefined) sentAt.set(r.id, at)
  }
  return { unticked: new Set(sentAt.keys()), sentAt }
}

/**
 * The `reveal` act for comment `id` — through the Browser tab that lists it, in the conversation it
 * acts for — or null when no Browser tab lists it (only the server read does, or nothing does): the
 * chat report's line then reveals nothing.
 * @param {ListsSnapshot} snapshot
 * @param {string} id
 * @returns {{ tabId: string, sessionId: string, kind: 'reveal', ids: string[] } | null}
 */
export function revealDetail(snapshot, id) {
  const row = rowsOf(snapshot).find((r) => r.id === id)
  return row === undefined || row.tabId === '' || row.tabId === SERVER_TAB
    ? null
    : { tabId: row.tabId, sessionId: row.sessionId, kind: 'reveal', ids: [id] }
}

/**
 * "Send all (N) to Tracy" from the checklist: the ticked comments, still listed and open, in one `send`.
 * @param {{ shown: TabList | null, sessionId: string, open: Row[] }} vm
 * @param {readonly string[]} ids
 * @returns {{ tabId: string, sessionId: string, kind: 'send', ids: string[] } | null}
 */
export function sendAct(vm, ids) {
  if (vm.shown === null) return null
  const wanted = new Set(ids)
  const kept = vm.open.filter((r) => wanted.has(r.id)).map((r) => r.id)
  return kept.length === 0
    ? null
    : { tabId: vm.shown.tabId, sessionId: vm.sessionId, kind: 'send', ids: kept }
}

/**
 * "Delete all" (Brian 21:10; Comments list redesign A): EXACTLY what the tab shows — the page filter's
 * comments of the chosen status (Open or Resolved; never the other one, U26); All pages = the whole
 * site. Everyone's, a soft delete, not a resolve; their replies go with them. The ids are named, so the
 * Browser tab clears those threads and nothing else (`/clear {threads}`). Null with nothing on screen.
 * @param {ListsSnapshot} snapshot
 * @param {{ filter?: PageFilter, status?: StatusFilter }} [view]
 * @returns {{ tabId: string, sessionId: string, kind: 'clear', ids: string[] } | null}
 */
export function clearAct(snapshot, view = {}) {
  const vm = viewModel(snapshot, view)
  const ids = vm.visible.map((r) => r.id)
  return vm.shown === null || ids.length === 0
    ? null
    : { tabId: vm.shown.tabId, sessionId: vm.sessionId, kind: 'clear', ids }
}

/**
 * Whether a keydown belongs to an input method (Telex, VNI, pinyin, kana): `isComposing`, keyCode 229
 * from engines that do not set it, or the Enter Safari delivers right after `compositionend`
 * (`recentlyComposing`: the box saw a composition end within the last few ms). The same three signals
 * as dsh's `isComposingEvent` (`ui-conversation` `input/editor/keymap.ts`).
 * @param {{ isComposing?: boolean, keyCode?: number, recentlyComposing?: boolean }} event
 */
const composing = (event) =>
  event.isComposing === true || event.keyCode === 229 || event.recentlyComposing === true

/**
 * What a key does inside the "Send all" checklist: Enter sends the ticked comments — from anywhere in
 * the checklist, a focused checkbox included (Space stays the checkbox's own toggle) — and so do
 * ⌘+Enter and Ctrl+Enter (round 5, acceptance INPUT-new-4: the keys of dsh's composer); Esc closes
 * it. Shift/Alt+Enter and Ctrl+⌘+Enter do nothing, nor does anything while an input method composes
 * ({@link composing}), a held-down Enter (`repeat`: one send per press), or Enter on a focused button
 * (that button's own).
 * @param {{ key: string, metaKey: boolean, ctrlKey: boolean, shiftKey: boolean, altKey: boolean,
 *   isComposing: boolean, onButton: boolean, keyCode?: number, repeat?: boolean,
 *   recentlyComposing?: boolean }} event
 * @returns {'send' | 'close' | null}
 */
export function checklistKey(event) {
  if (event.key === 'Escape') return 'close'
  if (event.key !== 'Enter' || composing(event) || event.repeat === true || event.onButton) return null
  return event.shiftKey || event.altKey || (event.metaKey && event.ctrlKey) ? null : 'send'
}

/**
 * A row's time, short (Comments list redesign A): "now", "2m", "3h", "1d", "5w", "2y" — as a string key
 * of the `tracy-chat-input` namespace and its count; the full date and time are its tooltip
 * ({@link fullDate}).
 * @param {number} at
 * @param {number} now
 * @returns {{ key: 'comments.age.now' } | { key: 'comments.age.minutes' | 'comments.age.hours' |
 *   'comments.age.days' | 'comments.age.weeks' | 'comments.age.years', count: number }}
 */
export function shortAge(at, now) {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return { key: 'comments.age.now' }
  if (minutes < 60) return { key: 'comments.age.minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'comments.age.hours', count: hours }
  const days = Math.floor(hours / 24)
  if (days < 7) return { key: 'comments.age.days', count: days }
  if (days < 365) return { key: 'comments.age.weeks', count: Math.floor(days / 7) }
  return { key: 'comments.age.years', count: Math.floor(days / 365) }
}

/**
 * A time as its tooltip reads it: the date and the time of day, in the reader's own locale.
 * @param {number} at
 * @param {string} [locale]
 * @returns {string}
 */
export function fullDate(at, locale) {
  try {
    return new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return new Date(at).toISOString()
  }
}

/**
 * A comment's words cut where a mention stands (`@lee`, `@octopal`): each mention at the start or after
 * a space, up to the first character that is not a letter, digit, dot, dash or underscore — so an
 * e-mail address (`a@b.co`) is never one. The row draws the mentions in the link colour.
 * @param {string} text
 * @returns {{ text: string, mention: boolean }[]}
 */
export function textParts(text) {
  /** @type {{ text: string, mention: boolean }[]} */
  const parts = []
  const re = /(^|\s)(@[\p{L}\p{N}._-]*[\p{L}\p{N}_])/gu
  let at = 0
  for (const m of text.matchAll(re)) {
    const start = /** @type {number} */ (m.index) + m[1].length
    if (start > at) parts.push({ text: text.slice(at, start), mention: false })
    parts.push({ text: m[2], mention: true })
    at = start + m[2].length
  }
  if (at < text.length) parts.push({ text: text.slice(at), mention: false })
  return parts
}

/**
 * An author as a row draws it (e2e v4 thread, V4-7): the display name, and the part in brackets that
 * tells two people with one display name apart (`Sam Tester (e2e3-thread-a)`, {@link authorOf}). The row
 * cuts the name and keeps the bracketed part whole — cut as one string, the part that tells them apart
 * was the part lost ("Sam Tester (e2e3-thr…").
 * @param {string} author
 * @returns {{ name: string, tag: string }}
 */
export function authorParts(author) {
  const m = /^(.*\S)\s+(\([^()]+\))$/.exec(typeof author === 'string' ? author.trim() : '')
  return m === null
    ? { name: typeof author === 'string' ? author.trim() : '', tag: '' }
    : { name: m[1], tag: m[2] }
}

/**
 * The `uiConversation.views` definition that lets comments open a blank conversation (plan "comment
 * review", stand E2E M2; decision 29/09: comments existing = the session is not blank for our
 * purposes, the hero may go).
 *
 * WHY. dsh draws no view and no tab strip while a session is blank: `DefaultConversationViews.tsx:35`
 * and `ConversationHeader.tsx:16` both test `session.blank && conversationPhase(…) === 'blank'`, and
 * `conversationPhase` (untouched) turns `active` as soon as the conversation snapshot's
 * `activeTargets` is not empty. That set is `assembler.activityTargets()` (`assembler.ts:444`):
 * every ACTIVATED target that has a registered view definition whose `isActive(snapshot)` is true.
 * So the view gets a definition — an empty builder (it reads no events; the list comes from the
 * Browser tab) — whose `isActive` says whether the shown Browser tab has a comment, and the plugin
 * activates the target for a session whose Browser tab lists comments.
 *
 * `isActive` reads the comment lists, not the target's own snapshot: that snapshot is built from the
 * session's events, which say nothing about comments. dsh re-reads `isActive` only when it publishes
 * the conversation snapshot, so the caller registers the definition again whenever the answer flips
 * (`index.tsx`): a registry change rebuilds every binding and publishes.
 * @param {string} target - the view id (`tracy-comments`).
 * @param {() => boolean} hasComments
 * @returns {{ target: string, create(): { empty: null, replace(): null, apply(): null }, isActive(): boolean }}
 */
export function commentsViewDefinition(target, hasComments) {
  return {
    target,
    create: () => ({ empty: null, replace: () => null, apply: () => null }),
    isActive: () => hasComments()
  }
}

/**
 * Whether the tab the view shows holds at least one comment (open or resolved).
 * @param {ListsSnapshot} snapshot
 * @returns {boolean}
 */
export function shownHasComments(snapshot) {
  return (shownTab(snapshot)?.comments.length ?? 0) > 0
}
