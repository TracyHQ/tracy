/**
 * The Comments tab of the chat column — a `conversation.view` tab beside Chat, the way dsh shows
 * Trajectory — and the row that takes the composer's seat while it is on screen.
 *
 * Comments list redesign A + L1 (Akemi 01/10/2026; the approved interactive mock
 * `comments-list-design.html`, TCH `tasks/comments-list-redesign-plan.md`), which supersedes the earlier
 * layouts where they differ:
 *   - the tab strip is dsh's; under it `Current page | All pages`, each with a grey count pill of the open
 *     threads there and a red dot while some are unread (Lee 04/10/2026, {@link FilterBar});
 *   - the toolbar: the status filter `Open | Resolved` (Akemi 02/10/2026, replacing an "Open ⌄" menu),
 *     the page filter's control with the counts of the page filter's comments ({@link StatusFilterBar});
 *     then at the right "Delete all" (quiet text and a trash icon; on hover a button shape, red words on
 *     a light grey fill) and the terracotta "Ask Tracy to edit all", which opens the checklist (hidden in
 *     Resolved and when empty); in a narrow tab the two actions wrap onto a line under the filter.
 *     No "OPEN" label. Ten pixels under it, so a stuck page header never touches it;
 *   - the rows by page, each page a rounded framed card: its header (chevron in All pages, the page's
 *     CMS title — "/" reads Home —, its path muted, "Current" with a small terracotta dot on the page the
 *     preview shows, and a plain muted count) is sticky while the list scrolls, flush with the list's
 *     top, and the card's border stays whole; its comments inside, hairlines between them (`CommentItem`);
 *     the page the preview shows is always drawn, with "No open comments on this page." when it has none;
 *   - empty (the site has no comment): a centred block — icon tile, "No comments yet", one line, Start
 *     commenting; loading: a skeleton; a failed read: a centred block with Try again;
 *   - the bottom row (in the composer's seat): how to comment, and Start commenting.
 * A click on a row asks the Browser tab to `reveal` it (the page scrolls to it and its thread card opens
 * at its pin) and marks it read; a thread card opened any other way (its pin, a link) is read too
 * ({@link markOpenedThreads}).
 *
 * Mode B (`DESIGN.md` §0): this draws inside dsh's page, so plain CSS with the `tv-cv-` / `tv-ci-` /
 * `tv-lb-` prefixes (`styles.ts`), Tracy tokens with fallbacks, no reset and no Tailwind.
 *
 * The comments live in the Browser tab (the side card); this view only reads its lists
 * (`tracy:comment-list`) and asks it to act (`tracy:comment-act`) — `comment-view.mjs` holds both
 * shapes and every rule that decides what is drawn. Read marks are this person's, on the server
 * (`comment-reads.mjs`).
 */
import { ArrowUp, ChevronRight, CircleAlert, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CommentItem, GoneItem, type ItemActions } from './CommentItem'
import { CommentLightbox, type LightboxPicture } from './CommentLightbox'
import { CLEAR_UNDO_MS, createPendingClear, createPendingResolve, type Timers } from './comment-clear.mjs'
import { COMMENT_OPEN_EVENT, revealOf } from './comment-open.mjs'
import { createCommentReads } from './comment-reads.mjs'
import { createServerComments } from './comment-server.mjs'
import {
  ACT_EVENT,
  checklistDefaults,
  checklistCount,
  checklistKey,
  commentBadge,
  createCommentLists,
  headActions,
  imageChipWords,
  LIST_EVENT,
  type PageFilter,
  pageGroups,
  pageLabel,
  readPageFilter,
  readSentList,
  rowsOf,
  shownTab,
  authorParts,
  sendAct,
  type StatusFilter,
  viewModel,
  writePageFilter
} from './comment-view.mjs'
import { fallback, type Translate } from './strings'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { Face } from '@tracy/core/team/face'

type Lists = ReturnType<typeof createCommentLists>
type Model = ReturnType<typeof viewModel>
type Row = Model['rows'][number]
type Group = ReturnType<typeof pageGroups>[number]

/** The `conversation.view` id of this view. */
export const COMMENTS_VIEW = 'tracy-comments'

/** How long "Ask Tracy to edit all" waits for the server's sent list before it opens all ticked (ms). */
export const SENT_WAIT_MS = 2_000

/** A tiny observable value, for the view state the view and its composer share. */
function cell<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      for (const fn of listeners) fn()
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
  }
}

/**
 * Everything the Comments tab keeps for one page: the lists heard, this person's read marks, the Clear
 * all waiting out its Undo window, the "Ask Tracy to edit all" checklist (the ids left unticked, or null
 * while it is closed), the open ⋯ menu, the picture shown full screen, and which sessions have the view
 * on screen (the composer takes over only there). One per plugin load.
 */
export function createCommentsState(
  options: {
    act?: (detail: {
      tabId: string
      sessionId: string
      kind: 'clear' | 'hide' | 'show'
      ids: string[]
    }) => void
    /** Where a Resolve goes once its Undo window ends; `act` on the page. */
    resolveAct?: (detail: { tabId: string; sessionId: string; kind: 'resolve'; ids: string[] }) => void
    timers?: Timers
    /** Where the page filter is remembered per person (`localStorage` on the page; null keeps nothing). */
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null
    /** Where a Delete all hears its refusal (`comment-clear.mjs`); `window` on the page. */
    target?: EventTarget | null
    /** Take the site's preview (the Browser tab) to a page. */
    openPage?: (url: string) => void
    /** Put the site's preview in Edit mode, where a click on a block comments on it: "Start commenting". */
    startCommenting?: () => void
    /**
     * The site whose comments are read from the server while no Browser tab lists them
     * (`comment-server.mjs`), and whose read marks are this person's (`comment-reads.mjs`), and the fetch
     * that reads them; absent where the page has no site (`/new/`).
     */
    server?: { siteKey: string; fetch: (input: string, init?: RequestInit) => Promise<Response> }
  } = {}
) {
  const lists = createCommentLists()
  const server =
    options.server === undefined
      ? null
      : createServerComments({ lists, siteKey: options.server.siteKey, fetch: options.server.fetch })
  const reads =
    options.server === undefined
      ? null
      : createCommentReads({ lists, siteKey: options.server.siteKey, fetch: options.server.fetch })
  if (reads !== null) markOpenedThreads(lists, (id) => void reads.read(id))
  const storage = options.storage !== undefined ? options.storage : pageStorage()
  const filter = cell<PageFilter>('page')
  const viewer = cell<string | null>(null)
  return {
    lists,
    /** Read the site's comments and this person's read marks from the server again (no-op with no site). */
    reload(): Promise<void> {
      return Promise.all([server?.load(), reads?.load()]).then(() => undefined)
    },
    /** This person opened a thread: it is read (no-op with no site). */
    markRead(id: string): void {
      void reads?.read(id)
    },
    /** "Mark as unread" (no-op with no site). */
    markUnread(id: string): void {
      void reads?.unread(id)
    },
    /**
     * The page filter `Current page | All pages` (UI fine-tune 30/09, U10–U13): `page` until the person
     * is known, then the one they last chose on this browser (`readPageFilter`).
     */
    filter,
    /** The status filter Open / Resolved (redesign A): Open on every load, never remembered. */
    status: cell<StatusFilter>('open'),
    /** The signed-in seat's e-mail (`/auth/me`), whose filter is remembered and whose words are never unread. */
    viewer,
    setViewer(email: string | null) {
      viewer.set(email)
      lists.setViewer(email)
      filter.set(readPageFilter(storage, email))
    },
    setFilter(next: PageFilter) {
      filter.set(next)
      writePageFilter(storage, viewer.get(), next)
    },
    /** Resolve · Undo (U33): resolves waiting out their "Resolved. Undo" line (`comment-clear.mjs`). */
    resolving: createPendingResolve({
      act: options.resolveAct ?? act,
      ...(options.timers ? { timers: options.timers } : {})
    }),
    /** Clear all · Undo: the clear waiting out its window, and the notice it shows (`comment-clear.mjs`). */
    clearing: createPendingClear({
      lists,
      act: options.act ?? act,
      target: options.target !== undefined ? options.target : typeof window === 'undefined' ? null : window,
      ...(options.timers ? { timers: options.timers } : {})
    }),
    /** The "Ask Tracy to edit all" checklist: the comments unticked, or null while it is closed. */
    checklist: cell<ReadonlySet<string> | null>(null),
    /**
     * ADR 0025: the comments the checklist opened unticked because they were already sent and nothing
     * was written since — comment id → when that send went (ms), the row's "Sent 23:43".
     */
    sent: cell<ReadonlyMap<string, number>>(new Map()),
    /**
     * Open "Ask Tracy to edit all" (ADR 0025, Brian 03–04/10/2026): ask the server which open comments
     * are sent and waiting (`/comments/sent`), and open with those unticked, every other one ticked. With
     * no site, or no answer within {@link SENT_WAIT_MS}, every comment opens ticked, as before.
     */
    async openChecklist(vm: { sendAll: Row[] }): Promise<void> {
      let sent = new Map<string, number>()
      if (options.server !== undefined) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), SENT_WAIT_MS)
        try {
          const res = await options.server.fetch(
            `/api/sites/${encodeURIComponent(options.server.siteKey)}/comments/sent`,
            { headers: { accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal }
          )
          if (res.ok) sent = readSentList(await res.json())
        } catch {
          // No answer: every comment ticked.
        } finally {
          clearTimeout(timer)
        }
      }
      const { unticked, sentAt } = checklistDefaults(vm, sent)
      this.sent.set(sentAt)
      this.checklist.set(unticked)
    },
    /** The comment whose ⋯ menu is open, or null. */
    menu: cell<string | null>(null),
    /** The picture shown full screen, or null. */
    picture: cell<LightboxPicture | null>(null),
    /** Sessions whose chat column shows the Comments view right now. */
    open: cell<ReadonlySet<string>>(new Set()),
    /**
     * The person asked for the view — from the Browser toolbar, or by acting in it (Delete all,
     * {@link deleteAll}): its definition then says active at 0 comments too.
     */
    wanted: cell(false),
    /** Take the preview to a page; absent where nothing can. */
    openPage: options.openPage,
    /** "Start commenting"; absent where nothing can switch the preview's mode. */
    startCommenting: options.startCommenting
  }
}
export type CommentsState = ReturnType<typeof createCommentsState>

/**
 * What the Comments view's definition answers (`commentsViewDefinition`, `index.tsx`): active once the
 * person asked for the view, or while the shown Browser tab lists a comment. In a conversation with
 * no message yet this is what keeps the view on screen at all — dsh shows a blank session's hero
 * otherwise, tab strip gone.
 */
export function commentsViewActive(state: CommentsState): boolean {
  // Only an asked-for view (start card, toolbar button, Delete all) makes a blank session active: a
  // listed comment alone used to, and a blank session on a site with comments lost its start screen.
  return state.wanted.get()
}

/**
 * Delete all, pressed in the Comments view: the checklist closes, and the rows start their Undo
 * window (`comment-clear.mjs`). e2e v8 V8-2 (30/09): the press takes the rows off the lists at once,
 * so in a conversation with no message "the shown tab has a comment" went false 36–46 ms later and
 * dsh put the session back on its blank screen — "N deleted · Undo (10)" never seen, no place for a
 * refusal's line, and no "No comments yet" after. Acting in the view is asking for it: `wanted` holds
 * it open during the window, after it and on a refusal, as a conversation with messages does. Set
 * BEFORE the rows leave, so the definition never reads a gap.
 */
export function deleteAll(
  state: CommentsState,
  view: Parameters<CommentsState['clearing']['start']>[0]
): number {
  state.checklist.set(null)
  state.wanted.set(true)
  return state.clearing.start(view)
}

/**
 * A thread card opened on the page — from its row here, its pin on the site, or a link's `comment=` — is
 * a thread read, whether or not the Comments list is on screen. Watched on the lists themselves, for
 * the life of the plugin, and not in the view: a view effect ran only while the list was mounted, and
 * only at the moment the card opened, so a card opened by a link before this person's read marks were
 * in (no row is unread until they are, `unreadOf`) or while the list was off screen stayed unread.
 * Each opening is handled once: it waits for the marks and for its row, then marks it if unread, and
 * nothing marks it again until another card opens — "Mark as unread" on the open thread holds.
 */
function markOpenedThreads(lists: Lists, markRead: (id: string) => void): void {
  let seen: string | null = null
  let pending: string | null = null
  const check = () => {
    const snapshot = lists.getSnapshot()
    const thread = shownTab(snapshot)?.thread ?? null
    if (thread !== seen) {
      seen = thread
      pending = thread
    }
    if (pending === null || snapshot.reads?.ready !== true) return
    const id = pending
    const row = rowsOf(snapshot).find((r) => r.id === id)
    if (row === undefined) return
    pending = null
    if (row.unread) markRead(id)
  }
  lists.subscribe(check)
  check()
}

/** The page's `localStorage`, or null where reading it throws (a private window, blocked site data). */
function pageStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Ask the Browser tab to act. */
function act(detail: {
  tabId: string
  /** The conversation on screen (round 6); absent only on `list`, which every tab answers. */
  sessionId?: string
  kind: string
  ids?: string[]
  text?: string
  page?: boolean
  files?: File[]
}): void {
  window.dispatchEvent(new CustomEvent(ACT_EVENT, { detail }))
}

/** Listen for the Browser tab's lists, and ask for them once (it answers `list` with every tab's). */
export function listenForCommentLists(lists: Lists): () => void {
  const onList = (event: Event) => lists.accept((event as CustomEvent).detail)
  window.addEventListener(LIST_EVENT, onList)
  act({ tabId: '', kind: 'list' })
  return () => window.removeEventListener(LIST_EVENT, onList)
}

/** The ticking clock the ages read, one tick every 30 s while a view is on screen. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useCell<T>(c: { get: () => T; subscribe: (fn: () => void) => () => void }): T {
  return useSyncExternalStore(c.subscribe, c.get, c.get)
}

/**
 * The checklist "Ask Tracy to edit all (N)" opens (story SendNChecklist): every open comment the tab lists,
 * ALL ticked; the person unticks what is only talk between people, then "Send to
 * Tracy ↵" (Enter, ⌘+Enter or Ctrl+Enter — round 5, like every box) gives the ticked ones to Tracy as
 * ONE chat message; Cancel (or Esc) closes it. Send is disabled with nothing ticked. Its rows scroll
 * inside it and it opens with its buttons in view (round 5, E10).
 */
function SendChecklist({
  vm,
  unticked,
  state,
  t
}: {
  vm: Model
  unticked: ReadonlySet<string>
  state: CommentsState
  t?: Translate
}): JSX.Element {
  const rows = vm.sendAll
  const ticked = rows.filter((r) => !unticked.has(r.id))
  const sent = useCell(state.sent)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    // Round 5 (E10): its buttons in view, whatever the column's height (the view scrolls to them).
    box.current?.querySelector('.tv-cv-checklist-foot')?.scrollIntoView?.({ block: 'nearest' })
  }, [])
  const close = () => state.checklist.set(null)
  const send = () => {
    const detail = sendAct(
      vm,
      ticked.map((r) => r.id)
    )
    if (detail === null) return
    act(detail)
    close()
  }
  const toggle = (id: string) => {
    const next = new Set(unticked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    state.checklist.set(next)
  }
  return (
    <div
      ref={box}
      className="tv-cv-checklist"
      role="dialog"
      aria-label={fallback(t, 'comments.sendToTracy')}
      data-tracy-checklist=""
      onKeyDown={(event) => {
        const what = checklistKey({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          isComposing: event.nativeEvent.isComposing,
          keyCode: event.nativeEvent.keyCode,
          repeat: event.repeat,
          onButton: event.target instanceof HTMLElement && event.target.closest('button') !== null
        })
        if (what === null) return
        event.preventDefault()
        if (what === 'close') close()
        else send()
      }}
    >
      <span className="tv-cv-checklist-title">{fallback(t, 'comments.sendToTracy')}</span>
      <span className="tv-cv-checklist-hint">{fallback(t, 'comments.checklist.hint')}</span>
      <div className="tv-cv-checklist-rows">
        {rows.map((r) => {
          const on = !unticked.has(r.id)
          return (
            <label key={`${r.tabId}:${r.id}`} className="tv-cv-checklist-row" data-off={on ? undefined : ''}>
              <input
                type="checkbox"
                className="tv-cv-check"
                checked={on}
                aria-label={fallback(t, 'comments.checklist.tick', { name: r.author })}
                onChange={() => toggle(r.id)}
              />
              <span className="tv-cv-checklist-body">
                <span className="tv-cv-checklist-who">
                  <Face face={r} size={18} className="tv-cv-avatar" />
                  <AuthorName author={r.author} />
                  <span className="tv-cv-checklist-chip">
                    {r.kind === 'page' ? `${fallback(t, 'comments.wholePage')} · ${r.chip}` : chipWords(r, t)}
                  </span>
                  {sent.has(r.id) && <SentAt at={sent.get(r.id) as number} t={t} />}
                </span>
                <span className="tv-cv-checklist-text" data-deleted={r.deleted === true ? '' : undefined}>
                  {r.deleted === true ? fallback(t, 'comments.deletedComment') : r.text.split('\n')[0]}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      <div className="tv-cv-checklist-foot">
        <span className="tv-cv-checklist-count">
          {fallback(t, 'comments.checklist.ticked', checklistCount(vm, unticked))}
        </span>
        <span className="tv-cv-checklist-actions">
          <button type="button" className="tv-cv-ghost" onClick={close}>
            {fallback(t, 'comments.cancel')}
          </button>
          <button
            type="button"
            className="tv-cv-primary tv-cv-tall"
            disabled={ticked.length === 0}
            title={fallback(t, 'comments.checklist.sendTip')}
            onClick={send}
          >
            {fallback(t, 'comments.sendToTracy')}
            <kbd className="tv-cv-key">↵</kbd>
          </button>
        </span>
      </div>
    </div>
  )
}

/**
 * An author's name in the checklist: the display name, cut first, then the bracketed part that tells a
 * namesake apart, kept whole (e2e v4 thread, V4-7; `authorParts`).
 */
function AuthorName({ author, title }: { author: string; title?: string }): JSX.Element {
  const { name, tag } = authorParts(author)
  return (
    <span className="tv-cv-name" title={title}>
      <span className="tv-cv-name-main">{name}</span>
      {tag !== '' && <span className="tv-cv-name-tag">{tag}</span>}
    </span>
  )
}

/** A checklist row already sent and waiting (ADR 0025): "Sent 23:43", the full date as its tooltip. */
function SentAt({ at, t }: { at: number; t?: Translate }): JSX.Element {
  const when = new Date(at)
  const time = when.toLocaleTimeString(interfaceLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  return (
    <span
      className="tv-cv-checklist-sent"
      data-sent-at={when.toISOString()}
      title={when.toLocaleString(interfaceLocale())}
    >
      {fallback(t, 'comments.checklist.sent', { time })}
    </span>
  )
}

/** A checklist row's chip words: an image says its kind first, `Image · "<alt>"`; else its chip as it is. */
function chipWords(row: Row, t?: Translate): string {
  if (row.onImage !== true) return row.chip
  return imageChipWords(fallback(t, 'comments.image'), row.chip)
}

/** A page group's name: its CMS or document title, Home for the root, else its path (`pageLabel`). */
function groupName(group: Group, t?: Translate): string {
  const label = pageLabel({ path: group.path, record: group.title })
  return label.home ? fallback(t, 'comments.homePage') : label.name
}

/**
 * One page of the list, a rounded framed card (L1): its header — in All pages a button that folds the
 * card (a chevron, `aria-expanded`); in Current page a plain head — the page's name, its path muted, a
 * small terracotta dot and "Current" on the page the preview shows, and its count, plain and muted. The
 * header sticks to the top of the list while it scrolls; the card's border stays whole around it.
 */
function PageCard({
  group,
  t,
  fold,
  status,
  children
}: {
  group: Group
  t?: Translate
  /** All pages: whether the card is open, and how it opens or folds; Current page: absent. */
  fold?: { open: boolean; toggle: () => void }
  status: StatusFilter
  children: JSX.Element[]
}): JSX.Element {
  const name = groupName(group, t)
  const open = fold === undefined || fold.open
  const inner = (
    <>
      {fold !== undefined && <ChevronRight className="tv-cv-chevron" aria-hidden="true" />}
      <span className="tv-cv-page-name" title={name}>
        {name}
      </span>
      {name !== group.path && (
        <span className="tv-cv-page-path" title={group.path}>
          {group.path}
        </span>
      )}
      {group.onPage && <span className="tv-cv-here">{fallback(t, 'comments.here')}</span>}
      <span className="tv-cv-page-count">{group.count}</span>
    </>
  )
  return (
    <section
      className="tv-cv-card"
      data-tracy-page-group={group.path}
      data-open={open ? '' : undefined}
      data-current={group.onPage ? '' : undefined}
    >
      {fold === undefined ? (
        <div className="tv-cv-card-head">{inner}</div>
      ) : (
        <button type="button" className="tv-cv-card-head" aria-expanded={fold.open} onClick={fold.toggle}>
          {inner}
        </button>
      )}
      {open && (
        <div className="tv-cv-card-items">
          {children.length > 0 ? (
            children
          ) : (
            <p className="tv-cv-none" data-tracy-none-here="">
              {fallback(t, status === 'open' ? 'comments.noneHere.open' : 'comments.noneHere.resolved')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * The status filter (Akemi 02/10/2026, replacing the "Open ⌄" menu): `Open | Resolved`, always on screen,
 * the page filter's control and classes ({@link FilterSide}); each side counts the page filter's comments
 * of that status (`statusCounts`), a comment waiting out its Delete's Undo window counted nowhere. Its
 * counts are TOTALS, so they are plain muted numbers, no pill: terracotta stays in the page filter's
 * unread pills above, where it asks for attention (Akemi 02/10/2026). Open on every load; no "All".
 */
function StatusFilterBar({ vm, state, t }: { vm: Model; state: CommentsState; t?: Translate }): JSX.Element {
  return (
    <div
      className="tv-cv-filter tv-cv-status-filter"
      role="group"
      aria-label={fallback(t, 'comments.statusFilter')}
      data-tracy-status-filter={vm.status}
    >
      {(['open', 'resolved'] as const).map((s) => (
        <FilterSide
          key={s}
          pressed={vm.status === s}
          count={vm.statusCounts[s]}
          plain
          long={fallback(t, s === 'open' ? 'comments.group.open' : 'comments.group.resolved')}
          data={{ 'data-tracy-status': s }}
          onPick={() => {
            state.status.set(s)
            state.menu.set(null)
            state.checklist.set(null)
          }}
        />
      ))}
    </div>
  )
}

interface ViewProps {
  sessionId?: string
  t?: Translate
}

/** The `conversation.view` entry: the list itself. */
export function makeCommentsView(state: CommentsState) {
  return function CommentsView({ sessionId, t }: ViewProps): JSX.Element {
    const snapshot = useSyncExternalStore(
      state.lists.subscribe,
      state.lists.getSnapshot,
      state.lists.getSnapshot
    )
    const checklist = useCell(state.checklist)
    const menu = useCell(state.menu)
    const picture = useCell(state.picture)
    const now = useNow()

    // On screen: the composer below becomes the bottom row for this session (index.tsx).
    useEffect(() => {
      if (sessionId === undefined) return
      state.open.set(new Set([...state.open.get(), sessionId]))
      return () => {
        const next = new Set(state.open.get())
        next.delete(sessionId)
        state.open.set(next)
      }
    }, [sessionId])

    // The server's read and this person's read marks are refreshed each time the view comes on screen.
    useEffect(() => {
      void state.reload()
    }, [])

    const filter = useCell(state.filter)
    const status = useCell(state.status)
    const resolving = useCell(state.resolving)
    const view = { filter, status }
    const vm = viewModel(snapshot, view)

    const cleared = useCell(state.clearing)
    // e2e v7 INTH-1: a Delete all the door refused — the rows are back, and a line says so.
    const clearFailed = useSyncExternalStore(
      state.clearing.subscribe,
      state.clearing.failed,
      state.clearing.failed
    )
    // Rule 6 (UI fine-tune round 2): during Delete all's window the rows stay where they stood, drawn from
    // the tab as it was at the press, dimmed and inert; the counts (filter, badge) already dropped.
    const held = cleared === null ? null : state.clearing.held()
    const drawn = held ?? vm
    const head = headActions(drawn)
    const actions: ItemActions = {
      open: (r) => {
        state.menu.set(null)
        // A row the server read names no tab: `tracy-site-tabs` opens one on its page (`comment-open.mjs`).
        const press = revealOf(r)
        if (press?.type === 'act') act(press.detail)
        else if (press?.type === 'open')
          window.dispatchEvent(new CustomEvent(COMMENT_OPEN_EVENT, { detail: press.detail }))
        if (r.unread) state.markRead(r.id)
      },
      resolve: (r) => {
        const detail = { tabId: r.tabId, sessionId: r.sessionId, kind: 'resolve' as const, ids: [r.id] }
        // U33: in Open the comment would vanish from sight, so it waits as "Resolved. Undo".
        state.resolving.start(detail)
      },
      reopen: (r) => act({ tabId: r.tabId, sessionId: r.sessionId, kind: 'reopen', ids: [r.id] }),
      ...(held === null && vm.shown !== null
        ? {
            ask: (r: Row) => {
              const detail = sendAct(vm, [r.id])
              if (detail !== null) act(detail)
            }
          }
        : {}),
      unread: (r) => state.markUnread(r.id),
      copyLink: (r) => act({ tabId: r.tabId, sessionId: r.sessionId, kind: 'link', ids: [r.id] }),
      remove: (r) => act({ tabId: r.tabId, sessionId: r.sessionId, kind: 'remove', ids: [r.id] }),
      undo: (r) => act({ tabId: r.tabId, sessionId: r.sessionId, kind: 'undo' }),
      image: (p, caption) => state.picture.set({ src: p.src, alt: p.alt, caption }),
      menu: (id) => state.menu.set(id)
    }
    const item = (r: Row, caption: string) =>
      held === null && resolving.has(r.id) ? (
        <ResolvedUndo key={`${r.tabId}:${r.id}`} id={r.id} state={state} t={t} />
      ) : r.deleting !== undefined && held === null ? (
        <GoneItem key={`${r.tabId}:${r.id}`} row={r} t={t} now={now} actions={actions} />
      ) : (
        <CommentItem
          key={`${r.tabId}:${r.id}`}
          row={r}
          t={t}
          now={now}
          frozen={held !== null}
          menuOpen={menu === r.id}
          caption={caption}
          actions={actions}
        />
      )
    // In All pages a card folds: the current page's opens by default (with no page shown, the first
    // one), the others start folded; what the person opens or folds lasts as long as the view.
    const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(() => new Map())
    const groups = pageGroups(drawn.rows, drawn.current)
    const anyHere = groups.some((g) => g.onPage)
    const cards = groups.map((g, i) => {
      const key = `${g.onPage ? 'here' : 'page'}:${g.path}`
      const open = folds.get(key) ?? (g.onPage || (!anyHere && i === 0))
      const fold =
        drawn.filter === 'all'
          ? { open, toggle: () => setFolds((was) => new Map(was).set(key, !open)) }
          : undefined
      const caption = `${groupName(g, t)} ${g.path}`
      return (
        <PageCard key={key} group={g} t={t} status={drawn.status} {...(fold !== undefined ? { fold } : {})}>
          {g.rows.map((r) => item(r, caption))}
        </PageCard>
      )
    })

    // No Browser tab lists, and the server has not answered yet, or could not: say that — never
    // "No comments yet", which would be a claim about the site (Akemi 01/10/2026).
    if (vm.loading && held === null)
      return (
        <div className="tv-cv" data-tracy-comments="">
          <div
            className="tv-cv-list"
            role="status"
            aria-label={fallback(t, 'comments.loading')}
            data-tracy-comments-loading=""
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="tv-cv-skeleton" aria-hidden="true">
                <i style={{ width: '30%' }} />
                <i style={{ width: '90%' }} />
                <i style={{ width: '60%' }} />
              </div>
            ))}
          </div>
        </div>
      )
    if (vm.failed && held === null)
      return (
        <div className="tv-cv" data-tracy-comments="">
          <div className="tv-cv-empty" role="alert" data-tracy-comments-failed="">
            <span className="tv-cv-empty-icon" aria-hidden="true">
              <CircleAlert className="tv-cv-icon" />
            </span>
            <p className="tv-cv-empty-title">{fallback(t, 'comments.loadFailedTitle')}</p>
            <p className="tv-cv-empty-line">{fallback(t, 'comments.loadFailedLine')}</p>
            <button type="button" className="tv-cv-outline tv-cv-start" onClick={() => void state.reload()}>
              {fallback(t, 'comments.retry')}
            </button>
          </div>
        </div>
      )
    if (vm.empty && held === null)
      // A site with no comment at all (empty state E1): the centred block alone.
      return (
        <div className="tv-cv" data-tracy-comments="">
          <EmptyBlock title={fallback(t, 'comments.emptyTitle')} state={state} t={t} />
        </div>
      )
    return (
      <div className="tv-cv" data-tracy-comments="">
        <FilterBar vm={vm} state={state} t={t} />
        {head.shown && (
          <div className="tv-cv-bar" data-tracy-toolbar="">
            <StatusFilterBar vm={vm} state={state} t={t} />
            {/* The actions keep to the right; in a narrow tab they wrap whole onto a line of their own. */}
            <span className="tv-cv-bar-actions">
              {(head.deleteAll.shown || cleared !== null) && (
                <button
                  type="button"
                  className="tv-cv-del"
                  disabled={cleared === null && head.deleteAll.disabled}
                  title={fallback(t, cleared === null ? 'comments.deleteAllTip' : 'comments.undo')}
                  aria-label={
                    cleared === null
                      ? fallback(t, 'comments.deleteAll')
                      : `${fallback(t, 'comments.undo')} · ${fallback(t, 'comments.group.deleted', { count: cleared.count })}`
                  }
                  data-tracy-undo={cleared === null ? undefined : ''}
                  onClick={() => {
                    if (cleared !== null) {
                      state.clearing.undo()
                      return
                    }
                    deleteAll(state, view)
                  }}
                >
                  {cleared === null ? (
                    <Trash2 className="tv-cv-small-icon" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="tv-cv-small-icon" aria-hidden="true" />
                  )}
                  {/* One width whatever it reads: both wordings share one grid cell, so nothing beside it moves. */}
                  <span className="tv-cv-swap" aria-hidden="true">
                    <span>{fallback(t, cleared === null ? 'comments.deleteAll' : 'comments.undo')}</span>
                    <span className="tv-cv-sizer">{fallback(t, 'comments.deleteAll')}</span>
                    <span className="tv-cv-sizer">{fallback(t, 'comments.undo')}</span>
                  </span>
                </button>
              )}
              {head.sendAll.shown && (
                <button
                  type="button"
                  className="tv-cv-primary tv-cv-small tv-cv-send-all"
                  disabled={cleared !== null || head.sendAll.disabled}
                  title={fallback(t, 'comments.sendAllTip')}
                  aria-expanded={checklist !== null}
                  onClick={() => {
                    if (checklist !== null) state.checklist.set(null)
                    else void state.openChecklist(vm)
                  }}
                >
                  <ArrowUp className="tv-cv-icon" aria-hidden="true" />
                  <span className="tv-cv-send-long">{fallback(t, 'comments.sendAllNone')}</span>
                  <span className="tv-cv-send-short">{fallback(t, 'comments.sendAllShortNone')}</span>
                </button>
              )}
            </span>
            {/* Delete all's window (rule 6): the thin terracotta bar drains under the toolbar until it ends. */}
            {cleared !== null && (
              <span className="tv-cv-bar-drain" aria-hidden="true">
                <i
                  style={{
                    animationDuration: `${CLEAR_UNDO_MS}ms`,
                    animationDelay: `-${CLEAR_UNDO_MS - cleared.left * 1000}ms`
                  }}
                />
              </span>
            )}
            {checklist !== null && head.sendAll.shown && !head.sendAll.disabled && cleared === null && (
              <SendChecklist vm={vm} unticked={checklist} state={state} t={t} />
            )}
          </div>
        )}
        {/* INTH-1: never silent. Its own line under the toolbar, whole. */}
        {clearFailed && cleared === null && (
          <p className="tv-cv-head-error" role="alert" data-tracy-clear-failed="">
            {fallback(t, 'comments.deleteFailed')}
          </p>
        )}
        <div className="tv-cv-list" data-tracy-comment-list="">
          {cards.length > 0 ? (
            cards
          ) : (
            <p className="tv-cv-none" data-tracy-none="">
              {fallback(t, drawn.status === 'open' ? 'comments.none.open' : 'comments.none.resolved')}
            </p>
          )}
        </div>
        {picture !== null && (
          <CommentLightbox picture={picture} t={t} onClose={() => state.picture.set(null)} />
        )}
      </div>
    )
  }
}

/**
 * What a Comments count carries for its red dot (Lee 04/10/2026): the "N unread" words when the dot
 * shows — this person has unread open threads there — else null. Unknown (`unread` null: the read marks
 * not in yet) is no dot and no words, never "0 unread".
 */
export function unreadWords(unread: number | null | undefined, t?: Translate): string | null {
  return typeof unread === 'number' && unread > 0
    ? fallback(t, 'comments.unread.title', { count: unread })
    : null
}

/**
 * The accessible name of a control carrying a Comments count with its red dot: its own words, the open
 * count and the unread words ("Comments 3, 1 unread"). The dot is CSS (`::after`), which says nothing to a
 * screen reader, so the control names it; with no dot the control keeps the name its content gives it.
 */
export function countName(words: string, open: number, unread: string): string {
  return `${words} ${open}, ${unread}`
}

/**
 * The page filter at the top of the tab (UI fine-tune 30/09, U10; redesign A): `Current page | All pages`,
 * each with a round grey count pill of the OPEN threads there, all authors, whatever the status filter
 * (`vm.openCounts`, Lee 04/10/2026; All pages is the number on the Comments tab), and a red dot on the
 * pill while this person has unread open threads in that scope (`vm.unread`), its tooltip "N unread".
 * No pill at 0 (a "0" reads as a signal); no dot before the read marks are in. The choice is remembered
 * per person on this browser.
 */
function FilterBar({ vm, state, t }: { vm: Model; state: CommentsState; t?: Translate }): JSX.Element {
  const side = (
    value: PageFilter,
    key: 'comments.filter.page' | 'comments.filter.all',
    short: 'comments.filter.pageShort' | 'comments.filter.allShort',
    count: number,
    unread: number | null
  ) => (
    <FilterSide
      pressed={vm.filter === value}
      count={count}
      unread={unreadWords(unread, t)}
      long={fallback(t, key)}
      short={fallback(t, short)}
      onPick={() => state.setFilter(value)}
    />
  )
  return (
    <div
      className="tv-cv-filter"
      role="group"
      aria-label={fallback(t, 'comments.filter')}
      data-tracy-filter=""
    >
      {side(
        'page',
        'comments.filter.page',
        'comments.filter.pageShort',
        vm.openCounts.page,
        vm.unread?.page ?? null
      )}
      {side(
        'all',
        'comments.filter.all',
        'comments.filter.allShort',
        vm.openCounts.all,
        vm.unread?.all ?? null
      )}
    </div>
  )
}

/**
 * One side of a two-sided filter (the page filter, the status filter): a toggle button with its words and
 * its count, the chosen side filled. The count is a round grey pill, drawn only above 0 and not at all
 * while it is null; `unread` (the "N unread" words) puts a red dot on it, its tooltip, and the button's
 * name. `plain` draws the count as a muted number instead, always. `short` is what a narrow page filter
 * reads instead of `long`.
 */
function FilterSide({
  pressed,
  count,
  unread = null,
  plain = false,
  long,
  short,
  data,
  onPick
}: {
  pressed: boolean
  count: number | null
  unread?: string | null
  plain?: boolean
  long: string
  short?: string
  data?: Record<`data-${string}`, string>
  onPick: () => void
}): JSX.Element {
  const pill = !plain && count !== null && count > 0
  const dot = pill && unread !== null
  return (
    <button
      type="button"
      className="tv-cv-filter-side"
      aria-pressed={pressed}
      aria-label={dot ? countName(long, count, unread) : undefined}
      onClick={onPick}
      {...data}
    >
      {/* A narrow tab reads "Page | All": the words shorten before a counter could be cut. */}
      <span className="tv-cv-filter-long">{long}</span>
      {short !== undefined && <span className="tv-cv-filter-short">{short}</span>}
      {plain ? (
        <span className="tv-cv-filter-num">{count ?? 0}</span>
      ) : (
        pill && (
          <span className="tv-cv-pill" data-dot={dot ? '' : undefined} title={dot ? unread : undefined}>
            {count}
          </span>
        )
      )}
    </button>
  )
}

/**
 * "Resolved. Undo" (UI fine-tune 30/09, U33): a comment resolved while the Resolved group is hidden folds
 * into this one line IN ITS PLACE for about 5 s; Undo puts the row back and nothing is sent.
 */
function ResolvedUndo({ id, state, t }: { id: string; state: CommentsState; t?: Translate }): JSX.Element {
  return (
    <p className="tv-cv-notice tv-cv-resolved-undo" role="status" data-tracy-resolved-undo={id}>
      <span>{fallback(t, 'comments.resolvedUndo')}</span>
      <button type="button" className="tv-cv-undo" onClick={() => state.resolving.undo(id)}>
        {fallback(t, 'comments.undo')}
      </button>
    </p>
  )
}

/**
 * The "Start commenting" button (layout B and empty state E1, Akemi 01/10/2026): the site's preview in
 * Edit mode, where a click on any block comments on it. Disabled where nothing can switch the preview.
 */
function StartCommenting({
  state,
  t,
  primary = false
}: {
  state: CommentsState
  t?: Translate
  primary?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      className={primary ? 'tv-cv-primary tv-cv-start' : 'tv-cv-outline tv-cv-start'}
      data-tracy-start-commenting=""
      disabled={state.startCommenting === undefined}
      onClick={() => state.startCommenting?.()}
    >
      {fallback(t, 'comments.startCommenting')}
    </button>
  )
}

/**
 * A view with no comment (empty state E1, Akemi 01/10/2026): centred in the tab, a small rounded tile
 * with a speech bubble, the title, one line on how to comment, and "Start commenting".
 */
function EmptyBlock({
  title,
  state,
  t
}: {
  title: string
  state: CommentsState
  t?: Translate
}): JSX.Element {
  return (
    <div className="tv-cv-empty" data-tracy-empty="">
      <span className="tv-cv-empty-icon" aria-hidden="true">
        <MessageSquare className="tv-cv-icon" />
      </span>
      <p className="tv-cv-empty-title">{title}</p>
      <p className="tv-cv-empty-line">{fallback(t, 'comments.emptyLine')}</p>
      <StartCommenting state={state} t={t} primary />
    </div>
  )
}

/**
 * The row under the list while the Comments view is on screen (layout B, Akemi 01/10/2026): it takes
 * the composer's seat — a muted line on how to comment, and "Start commenting". Not drawn while the site
 * has no comment (the empty block says the same) or the list is not read yet.
 */
export function makeCommentsFooter(state: CommentsState) {
  return function CommentsFooter({ t }: { t?: Translate }): JSX.Element | null {
    const snapshot = useSyncExternalStore(
      state.lists.subscribe,
      state.lists.getSnapshot,
      state.lists.getSnapshot
    )
    const filter = useCell(state.filter)
    const status = useCell(state.status)
    const cleared = useCell(state.clearing)
    const vm = viewModel(snapshot, { filter, status })
    if (cleared === null && (vm.empty || vm.loading || vm.failed)) return null
    return (
      <div className="tv-cv-footer" data-tracy-comments-footer="">
        <p className="tv-cv-footer-line">
          <MessageSquare className="tv-cv-small-icon" aria-hidden="true" />
          <span className="tv-cv-footer-words">{fallback(t, 'comments.footerHint')}</span>
        </p>
        <StartCommenting state={state} t={t} />
      </div>
    )
  }
}

/**
 * The count on the Comments tab (Lee 04/10/2026): every open thread of the site, all authors, in a round
 * grey pill (`data-tracy-count`, the All pages pill's number), drawn only above 0 and without waiting for
 * the read marks; and a red dot on it (`data-tracy-unread`, the number of this person's unread open
 * threads) while that number is above 0 — none while the marks are not in. Both from one snapshot
 * (`commentBadge`). With the dot the tab also carries `title` "N unread" and an `aria-label` naming the
 * view, the open count and the unread words ({@link countName}), since CSS dots and pills are not read
 * out reliably. dsh's tab strip draws a view's label as plain text and
 * re-reads it only when a view registers or the language changes (ui-conversation `refreshViews`), so
 * a count in the label would stay stale; the badge is a `data-tracy-count` attribute on that tab
 * instead, which `styles.ts` draws as a pill. The tab is found under dsh's `[data-conversation-tabs]`
 * anchor by its label.
 */
export function watchCommentsBadge(state: CommentsState, label: () => string, t?: Translate): () => void {
  // Painted in a microtask, not an animation frame: a hidden page (the person on another tab, a
  // headless render) runs no frame, and a Delete all or its end would leave the count stale there.
  let queued = false
  let stopped = false
  const put = (tab: HTMLElement, name: string, want: string | null) => {
    if (tab.getAttribute(name) === want) return
    if (want === null) tab.removeAttribute(name)
    else tab.setAttribute(name, want)
  }
  const paint = () => {
    queued = false
    if (stopped) return
    const { open, unread } = commentBadge(state.lists.getSnapshot())
    const words = unreadWords(unread, t)
    for (const tab of document.querySelectorAll<HTMLElement>('[data-conversation-tabs] [role="tab"]')) {
      const view = label()
      const mine = tab.textContent === view
      // Only above 0 (section 7: a "0" reads as a signal); at 0 the attribute goes and the pill with it.
      const count = mine && open > 0
      const dot = count && words !== null
      put(tab, 'data-tracy-count', count ? String(open) : null)
      // The tooltip and the name are ours only while the dot is: a tab that never carried the dot
      // keeps whatever dsh gave it.
      if (!dot && !tab.hasAttribute('data-tracy-unread')) continue
      put(tab, 'data-tracy-unread', dot ? String(unread) : null)
      put(tab, 'title', dot ? words : null)
      put(tab, 'aria-label', dot ? countName(view, open, words) : null)
    }
  }
  const soon = () => {
    if (queued) return
    queued = true
    queueMicrotask(paint)
  }
  const stopLists = state.lists.subscribe(soon)
  const observer = new MutationObserver(soon)
  observer.observe(document.body, { childList: true, subtree: true })
  soon()
  return () => {
    stopped = true
    stopLists()
    observer.disconnect()
  }
}
