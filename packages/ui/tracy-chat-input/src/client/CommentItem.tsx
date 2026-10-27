/**
 * One comment of the Comments list (redesign A, L1, Akemi 01/10/2026; the approved interactive mock
 * `comments-list-design.html`, TCH `tasks/comments-list-redesign-plan.md`):
 *   - left column: its number on the site, `#12`, alone;
 *   - right column: an 18 px avatar, the author's handle (the e-mail before its at sign; the whole
 *     address is the tooltip) and the short time ("2m"; the full date is the tooltip); the words, two
 *     lines at most, @mentions in terracotta (--primary); the tag (Note · Asked Tracy · Tracy working… · Done
 *     by Tracy); for a comment anchored on a picture, a chat-style chip (a 28 px thumbnail and the file's
 *     name) that opens it full screen; then "N replies" in terracotta. The block it points at is not
 *     shown here: its pin on the page is;
 *   - unread: a terracotta dot at the top right, the handle bold, the words in full colour, the time
 *     terracotta, the number bold; read: handle and words step back to muted;
 *   - selected (its thread card is open on the page): a pale terracotta fill and a pale terracotta bar
 *     on the left;
 *   - on hover (or focus inside it): Resolve (✓) and ⋯ in a FIXED corner at the top right, where the
 *     unread dot sits — the row keeps its size and nothing in it moves (measured in the mock, and held by
 *     `test/e2e/comments-list-redesign.test.mjs`);
 *   - ⋯: Resolve, Ask Tracy to edit, Mark as unread, Copy link, then Delete in red; a resolved comment
 *     offers Reopen instead of Resolve and Ask. Delete is the author's alone (the server refuses anyone
 *     else), so it shows only on their own comments.
 * A comment whose Delete waits out its Undo window is {@link GoneItem}: "Comment deleted", a terracotta
 * Undo and a thin terracotta bar draining over the window.
 *
 * Mode B (`DESIGN.md` §0): plain CSS with the `tv-ci-` prefix (`styles.ts`), Tracy tokens, no reset.
 */
import { ArrowUp, Check, CircleDot, Ellipsis, Link2, Paperclip, RotateCcw, Trash2 } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CLEAR_UNDO_MS } from './comment-clear.mjs'
import { revealOf } from './comment-open.mjs'
import type { viewModel } from './comment-view.mjs'
import { fullDate, shortAge, textParts } from './comment-view.mjs'
import { fallback, type StringKey, type Translate } from './strings'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { Face } from '@tracy/core/team/face'

type Row = ReturnType<typeof viewModel>['rows'][number]
type Picture = NonNullable<Row['image']>

/** What a row can ask for; the view wires each to the Browser tab, the server or the lightbox. */
export interface ItemActions {
  open: (row: Row) => void
  resolve: (row: Row) => void
  reopen: (row: Row) => void
  /** Ask Tracy to edit this comment; absent while it cannot be sent (no Browser tab shown). */
  ask?: (row: Row) => void
  unread: (row: Row) => void
  copyLink: (row: Row) => void
  remove: (row: Row) => void
  undo: (row: Row) => void
  image: (picture: Picture, caption: string) => void
  /** Open this row's ⋯ menu, or close any (null). */
  menu: (id: string | null) => void
}

const TAG: Record<Row['status'], StringKey> = {
  note: 'comments.tag.note',
  asked: 'comments.tag.asked',
  working: 'comments.tag.working',
  done: 'comments.tag.done',
  tracy: 'comments.tag.tracy'
}

function age(t: Translate | undefined, at: number, now: number): string {
  const a = shortAge(at, now)
  return 'count' in a ? fallback(t, a.key, { count: a.count }) : fallback(t, a.key)
}

/** The words, mentions drawn in terracotta (--primary). */
function Words({ text }: { text: string }): JSX.Element {
  return (
    <span className="tv-ci-text">
      {textParts(text).map((part, i) =>
        part.mention ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order.
          <span key={i} className="tv-ci-mention">
            {part.text}
          </span>
        ) : (
          part.text
        )
      )}
    </span>
  )
}

/** The menu's width (styles.ts, .tv-ci-menu), to right-align it under its ⋯. */
const MENU_WIDTH = 184

/**
 * Where the menu stands: under its ⋯, right edges aligned; above it when the window has no room below.
 * Fixed to the window and drawn into the page's body, so neither a page card (which clips to its
 * rounded corners) nor the list's scroll box can cut it.
 */
function menuPlace(anchor: DOMRect, height: number, view: { width: number; height: number }) {
  const left = Math.max(8, Math.min(anchor.right - MENU_WIDTH, view.width - MENU_WIDTH - 8))
  const below = anchor.bottom + 4
  const top =
    below + height > view.height - 8 && anchor.top - 4 - height >= 8 ? anchor.top - 4 - height : below
  return { left, top }
}

/** The ⋯ menu: lucide line icons, Delete last and red. Esc, a click outside or a scroll closes it. */
function Menu({
  row,
  t,
  actions,
  anchor
}: {
  row: Row
  t?: Translate
  actions: ItemActions
  /** The ⋯ it opened from. */
  anchor: HTMLElement | null
}): JSX.Element | null {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (anchor === null || box.current === null) return
    setPlace(
      menuPlace(anchor.getBoundingClientRect(), box.current.offsetHeight, {
        width: window.innerWidth,
        height: window.innerHeight
      })
    )
  }, [anchor])
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const onDown = (event: PointerEvent) => {
      const el = box.current
      if (el === null || !(event.target instanceof Node)) return
      // A press on this row's own ⋯ toggles it; anything else outside the menu closes it.
      if (el.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest(`[data-tracy-more="${row.id}"]`)) return
      actions.menu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') actions.menu(null)
    }
    // Fixed to the window, it would stay behind while the list scrolls: a scroll closes it.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return
      actions.menu(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [row.id])
  const item = (
    key: string,
    word: StringKey,
    Icon: typeof Check,
    run: () => void,
    danger = false
  ): JSX.Element => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className={danger ? 'tv-ci-menu-item tv-ci-menu-danger' : 'tv-ci-menu-item'}
      data-tracy-menu={key}
      onClick={(event) => {
        event.stopPropagation()
        actions.menu(null)
        run()
      }}
    >
      <Icon className="tv-ci-menu-icon" aria-hidden="true" />
      {fallback(t, word)}
    </button>
  )
  const items: JSX.Element[] = row.resolved
    ? [item('reopen', 'comments.reopen', RotateCcw, () => actions.reopen(row))]
    : [
        item('resolve', 'comments.resolve', Check, () => actions.resolve(row)),
        ...(actions.ask !== undefined && row.deleted !== true
          ? [item('ask', 'comments.sendToTracy', ArrowUp, () => actions.ask?.(row))]
          : [])
      ]
  items.push(item('unread', 'comments.markUnread', CircleDot, () => actions.unread(row)))
  items.push(item('link', 'comments.copyLink', Link2, () => actions.copyLink(row)))
  if (typeof document === 'undefined') return null
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: the clicks stop here so the row does not open its thread.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the menu items are buttons; this only keeps the click inside.
    <div
      ref={box}
      className="tv-ci-menu"
      role="menu"
      data-tracy-item-menu={row.id}
      // Measured first (hidden), then placed beside its ⋯.
      style={
        place === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: place.left, top: place.top }
      }
      onClick={(event) => event.stopPropagation()}
    >
      {items}
      {row.mine && row.deleted !== true && (
        <>
          <hr className="tv-ci-menu-sep" />
          {item('delete', 'comments.delete', Trash2, () => actions.remove(row), true)}
        </>
      )}
    </div>,
    document.body
  )
}

/** The chat-style chip of the picture a comment is anchored on; it opens the picture full screen. */
function PictureChip({
  picture,
  caption,
  t,
  actions
}: {
  picture: Picture
  caption: string
  t?: Translate
  actions: ItemActions
}): JSX.Element {
  return (
    <button
      type="button"
      className="tv-ci-att"
      aria-label={fallback(t, 'comments.viewImage')}
      title={picture.name}
      data-tracy-picture={picture.src}
      onClick={(event) => {
        event.stopPropagation()
        actions.image(picture, caption)
      }}
    >
      <img
        className="tv-ci-att-img"
        src={picture.src}
        alt=""
        loading="lazy"
        onError={(event) => {
          // A site picture the preview cannot load (a ticket, gone): the chip keeps its name only.
          event.currentTarget.hidden = true
        }}
      />
      <span className="tv-ci-att-name">{picture.name}</span>
    </button>
  )
}

/** A comment row. */
export function CommentItem({
  row,
  t,
  now,
  frozen = false,
  menuOpen,
  caption,
  actions
}: {
  row: Row
  t?: Translate
  now: number
  /** Delete all's window: drawn in place, dimmed, and nothing reaches it. */
  frozen?: boolean
  menuOpen: boolean
  /** What the full-screen picture is captioned with (its page, as the group names it). */
  caption: string
  actions: ItemActions
}): JSX.Element {
  // A row read from the server while no Browser tab lists (`comment-server.mjs`) has no tab to act
  // through: no corner, no menu. A press still opens it — `tracy-site-tabs` opens the Browser tab on its
  // page and lands on its thread (`comment-open.mjs`, Brian 03/10/2026).
  const live = row.tabId !== ''
  const openable = revealOf(row) !== null
  const still = frozen || !openable
  const when = age(t, row.createdAt, now)
  const more = useRef<HTMLButtonElement>(null)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row holds buttons (Resolve, ⋯, the picture), so it cannot be one itself.
    <div
      className="tv-ci"
      data-comment={row.id}
      data-unread={row.unread ? '' : undefined}
      data-selected={row.selected ? '' : undefined}
      data-resolved={row.resolved ? '' : undefined}
      data-frozen={frozen ? '' : undefined}
      data-menu-open={menuOpen ? '' : undefined}
      // `inert`: no click, focus or key reaches a frozen row (the string form: dsh renders with React 18).
      {...(frozen ? ({ inert: 'true' } as unknown as { inert: boolean }) : {})}
      role={openable ? 'button' : undefined}
      tabIndex={still ? undefined : 0}
      onClick={still ? undefined : () => actions.open(row)}
      onKeyDown={(event) => {
        if (still || event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          actions.open(row)
        }
      }}
    >
      <span className="tv-ci-num">{row.n > 0 ? `#${row.n}` : ''}</span>
      <div className="tv-ci-body">
        <div className="tv-ci-head">
          <Face face={row} size={18} className="tv-ci-avatar" />
          <span className="tv-ci-handle" title={row.email || row.author}>
            {row.handle || row.author}
          </span>
          <span className="tv-ci-age" title={fullDate(row.createdAt, interfaceLocale())}>
            {when}
          </span>
        </div>
        {row.deleted === true ? (
          <span className="tv-ci-text tv-ci-text-deleted">{fallback(t, 'comments.deletedComment')}</span>
        ) : (
          <Words text={row.text} />
        )}
        <span className="tv-ci-tag" data-tag={row.status}>
          {fallback(t, TAG[row.status])}
        </span>
        {row.image !== null && <PictureChip picture={row.image} caption={caption} t={t} actions={actions} />}
        {/* Pictures kept with the comment open full screen the same way; other files are counted. */}
        {row.images.map((image, i) => (
          <PictureChip
            // biome-ignore lint/suspicious/noArrayIndexKey: one comment's files, in the order kept.
            key={`${i}:${image.url}`}
            picture={{ src: image.url, name: image.name || 'image', alt: image.name }}
            caption={caption}
            t={t}
            actions={actions}
          />
        ))}
        {(row.replies > 0 || row.files > row.images.length) && (
          <span className="tv-ci-foot">
            {row.files > row.images.length && (
              <span className="tv-ci-files" data-tracy-files={row.files - row.images.length}>
                <Paperclip className="tv-ci-files-icon" aria-hidden="true" />
                {row.files - row.images.length === 1
                  ? fallback(t, 'comments.files.one')
                  : fallback(t, 'comments.files.other', { count: row.files - row.images.length })}
              </span>
            )}
            {row.replies > 0 && (
              <span className="tv-ci-replies">
                {row.replies === 1
                  ? fallback(t, 'comments.replies.one')
                  : fallback(t, 'comments.replies.other', { count: row.replies })}
              </span>
            )}
          </span>
        )}
      </div>
      <span className="tv-ci-corner">
        {row.unread && <span className="tv-ci-dot" role="img" aria-label={fallback(t, 'comments.unread')} />}
        {live && !frozen && (
          <span className="tv-ci-acts">
            {!row.resolved && (
              <button
                type="button"
                className="tv-ci-act"
                title={fallback(t, 'comments.resolve')}
                aria-label={fallback(t, 'comments.resolve')}
                data-tracy-resolve=""
                onClick={(event) => {
                  event.stopPropagation()
                  actions.resolve(row)
                }}
              >
                <Check className="tv-ci-act-icon" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="tv-ci-act"
              title={fallback(t, 'comments.more')}
              aria-label={fallback(t, 'comments.more')}
              ref={more}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-tracy-more={row.id}
              onClick={(event) => {
                event.stopPropagation()
                actions.menu(menuOpen ? null : row.id)
              }}
            >
              <Ellipsis className="tv-ci-act-icon" aria-hidden="true" />
            </button>
          </span>
        )}
      </span>
      {menuOpen && live && !frozen && <Menu row={row} t={t} actions={actions} anchor={more.current} />}
    </div>
  )
}

/**
 * A comment whose Delete waits out its Undo window: its number and avatar stay, "Comment deleted", a
 * terracotta Undo, and the thin terracotta bar that drains until the window ends (`deleting`, the time
 * it ends). When the time is up the Browser tab drops it and the row is gone.
 */
export function GoneItem({
  row,
  t,
  now,
  actions
}: {
  row: Row
  t?: Translate
  now: number
  actions: ItemActions
}): JSX.Element {
  // One window for every delete (Brian 29/09 22:45): the Browser tab's DELETE_UNDO_MS, Delete all's too.
  const total = CLEAR_UNDO_MS
  const left = Math.max(0, Math.min(total, (row.deleting ?? now) - now))
  return (
    <div className="tv-ci tv-ci-gone" data-comment={row.id} data-gone="" role="status">
      <span className="tv-ci-num">{row.n > 0 ? `#${row.n}` : ''}</span>
      <div className="tv-ci-body">
        <div className="tv-ci-head">
          <Face face={row} size={18} className="tv-ci-avatar" />
          <span className="tv-ci-gone-words">{fallback(t, 'comments.deletedComment')}</span>
          <button
            type="button"
            className="tv-ci-undo"
            data-tracy-undo-delete=""
            onClick={(event) => {
              event.stopPropagation()
              actions.undo(row)
            }}
          >
            {fallback(t, 'comments.undo')}
          </button>
        </div>
        <span className="tv-ci-drain" aria-hidden="true">
          <i style={{ animationDuration: `${total}ms`, animationDelay: `-${total - left}ms` }} />
        </span>
      </div>
    </div>
  )
}
