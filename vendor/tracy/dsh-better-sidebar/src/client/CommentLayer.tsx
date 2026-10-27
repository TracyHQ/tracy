/**
 * Edit mode in Tracy's browser tab — what it draws (Tracy, 27/09/2026; people-only comments since
 * 29/09/2026).
 *
 * A port of the stories in TCH `packages/dev/tracy-design/src/mockups/browser-comment.mock.stories.tsx`
 * (the ONLY source of truth, "Browser comment") to plain CSS on dsh's `--dsw-*` tokens: this runs inside
 * the dsh page, where Tailwind and a second reset are forbidden (TCH RULE #4).
 *
 * The split with the page: the OUTLINE — dashed while pointing, solid once picked, a thin line round
 * each open comment — is drawn by the page itself (`@tracy/cms-preview`, inside the cross-origin
 * frame). The bubbles, the popover, the thread card and the hint are drawn here, in a layer laid over
 * the stage's visible area, placed with the boxes the page reports (multiplied by the tab's zoom).
 *
 * Stage 6 (TCH `tasks/todo-comment-people.md` rules 1–12; stories PopoverTwoButtonsEmpty ·
 * PopoverTwoButtonsTyped · PopoverEditPending · ThreadCardSendToChat · CommentsTabRowOpensCard ·
 * ToolbarCommentsButton[Zero|Compact] · Refresh*):
 *   - The popover (`CommentPopover`, 340 px): a header "Comment" + ✕; the text box ("Describe what
 *     should change…"); "Note for team" (outline, a click only) and "Ask Tracy to edit ↵" (primary, its key
 *     small and muted), both disabled while empty. Enter (and ⌘/Ctrl+Enter) sends to Tracy, Shift+Enter
 *     is a new line — dsh's chat composer rule (`comment-keys.ts`, Brian 30/09); the text box grows with
 *     its words up to {@link TEXT_MAX_HEIGHT}, then scrolls inside. A comment reopened for editing: "Save ↵" (Enter saves), "Ask Tracy to edit" (a
 *     click only) and a small red "Delete". No "+ Add another".
 *   - The two actions' names (Akemi 01/10/2026, option D1; Brian had approved "Add comment" and "Send to
 *     Tracy" in rule 10): the people action is "Note for team", the agent action "Ask Tracy to edit" —
 *     the name says Tracy will CHANGE the site, not only read the words. Keys and which one is primary
 *     are unchanged.
 *   - Pins (`AvatarPin`): the AUTHOR's bubble — the initial in a 26 px round badge filled in the
 *     author's colour inside a 2 px white ring with a 1 px dark edge (seen on white and on dark pages),
 *     its bottom-left corner pointing at the block's top-left; a 38 px hit area around it. No number,
 *     no status; hover or focus shows "<name> · <n> comment(s)" (Akemi 01/10/2026, review §8).
 *   - A grey pin (01/10/2026, edit-mode review "bug 3"): a comment whose block the page cannot
 *     find any more (`mode.ghosts`: gone, or rewritten since the comment) keeps its pin in a neutral
 *     grey (`GHOST_PIN_COLOUR`, not its author's colour) where the block was last seen — else at the
 *     frame's top corner, where a box with no element waits — with no outline on the page; its tooltip
 *     and its thread card's head say why in one line (`ghostNote`).
 *   - The thread card (`ThreadCard`, 340 px, beside its block), three layers (Akemi 01/10/2026): a head
 *     ("On <element>", Resolve ✓ or a green "Resolved" pill with Reopen, ✕); the messages in time order,
 *     each with its author's bubble, name, time and a ⋮ shown on hover or focus (Edit, Copy link,
 *     a divider, then a red Delete last; Edit and Delete only on one's own); a composer: "Reply…" with the paperclip inside it, "Reply" (a
 *     click only) and "Ask Tracy to edit ↵" (Enter). ✕, Esc or a click outside closes it.
 *   - Files (TCH attachments contract; stories PopoverTwoButtons… · ThreadCardSendToChat): a paperclip at
 *     the foot's left of each box (the dsh composer's own icon) opens a file picker; files can also be
 *     dropped on the box or pasted into its text. They show as chips under the text (a thumbnail for an
 *     image, name + size otherwise, ✕ to remove), and a refused one is said in the box. A thread card
 *     shows each message's kept files: lazy thumbnails, name + size, a click opens it in a new tab. No
 *     paperclip when the server keeps no files (`attachments.enabled` false).
 *   - The toolbar: ONE ghost button "Comments" (`CommentsButton`) with a grey count of the site's open
 *     comments and a terracotta dot while this person has unread ones (the Comments tab badge, told by
 *     the chat column; Akemi 02/10/2026, Lee 04/10/2026), the count shown only above 0 (Akemi 01/10/2026);
 *     a click opens the chat column's Comments tab. Refresh carries Tracy's
 *     progress (`RefreshButton`, `refresh-progress.ts`); nothing about a turn is drawn on the page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { LuCheck, LuCopy, LuLink2, LuMessageSquare, LuMousePointer2, LuMousePointerClick, LuPencil, LuRotateCcw, LuSearchX, LuTrash2, LuX, LuZoomIn } from 'react-icons/lu'
import { LuEllipsisVertical } from 'react-icons/lu'
import { IconPaperclipOutlineRegular, IconRefreshOutlineRegular, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { COMPOSITION_TAIL_MS, enterGesture } from './comment-keys.ts'
import { aimedAtBox, avatarPinPlacement, boxMaxHeight, boxPlacement, boxStand, compactPopoverWidth, hiddenName, isCompactFrame, pinnable, pinTipPlace, popoverPlacement, threadGoing, threadListMaxHeight, AIMED_MS, AVATAR_PIN_SIZE, GHOST_PIN_COLOUR, PIN_FAN_PX, type BoxTrail, type CommentFailureCode, type GhostReason, type ShownRect } from './comment-model.ts'
import { DEFAULT_ZOOM, ZOOM_LEVELS, scaleRect, type StageScroll } from './browser-mode.ts'
import { DELETE_UNDO_MS, DISCARD_AGAIN_MS, type AttachmentBox, type CommentMode } from './comment-controller.ts'
import { boxLimits, fileBadge, formatBytes, formatLimit, isImageType, type CommentAttachment, type DraftAttachment, type DraftRefusal, type RefusedFile } from './comment-attachments.ts'
import { authorLabels, bubbleFace, isMine, threadPlace, threadRunContinues, type Comment, type CommentAuthor } from './comment-store.ts'
import { Face, type PersonFace } from './face.tsx'
import { charCount, type SaveError } from './comment-errors.ts'
import { CommentPath } from './CommentPath.tsx'
import { useSeatViewer } from './seat-viewer.ts'
import { MentionList, useMentionPicker } from './CommentMentionPicker.tsx'
import { CommentVoice } from './CommentVoice.tsx'
import { mentionParts } from './comment-mentions.ts'
import type { RefreshLook } from './refresh-progress.ts'
import { relativeTime, t, type CopyKey } from './locales.ts'
import { PREVIEW_CHANNEL, PREVIEW_PICK, PREVIEW_VERSION, isPreviewMessage, type PreviewPickRect, type PreviewPickTarget } from './preview-protocol.generated.ts'
import css from './sidebar.module.css'

const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ')

const FAILURE_COPY: Record<CommentFailureCode, CopyKey> = {
  'no-session': 'editFailedNoSession',
  'site-mismatch': 'editFailedSiteMismatch',
  'subagent-readonly': 'editFailedReadonly',
  rejected: 'editFailedRejected',
  timeout: 'editFailedTimeout',
  'no-listener': 'editFailedNoListener',
  'too-long': 'editFailedTooLong',
  'attachment-too-large': 'editFailedAttachmentTooLarge',
  'attachment-failed': 'editFailedAttachmentFailed',
  unknown: 'editFailedUnknown',
}

// ── The mode bar ────────────────────────────────────────────────────────────────────────────

/**
 * The zoom control, inside the address field (toolbar option A, zoom Z1, 01/10/2026): at 100 % a
 * magnifier icon, at any other level a small chip with the value ("75%"); either opens dsh's Menu of
 * the levels. The caller hides it under a 360 px frame (`hidesZoomChip`).
 */
export function ZoomButton(props: { zoom: number; onZoom: (zoom: number) => void }): ReactElement {
  const { zoom, onZoom } = props
  const [open, setOpen] = useState(false)
  const value = `${String(zoom)}%`
  const atDefault = zoom === DEFAULT_ZOOM
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={ZOOM_LEVELS.map(level => ({ id: String(level), label: `${String(level)}%` }))}
      selectedId={String(zoom)}
      onSelect={(id) => {
        setOpen(false)
        onZoom(Number(id))
      }}
      portal
      compact
      align="end"
      anchor={(
        <button
          type="button"
          className={atDefault ? css.iconButton : css.zoomChip}
          aria-label={t('browserZoom')}
          aria-haspopup="menu"
          aria-expanded={open}
          title={`${t('browserZoom')} ${value}`}
          data-zoom={String(zoom)}
          onClick={() => { setOpen(was => !was) }}
        >
          {atDefault ? <LuZoomIn size={15} aria-hidden /> : value}
        </button>
      )}
    />
  )
}

/**
 * Interactive | Edit (only where the picker can run — `modes.visible`) and, after Edit, `children`
 * (the Comments button). Option A (01/10/2026): one quiet segmented control, the selected segment a
 * raised surface with a thin border; the zoom moved into the address field (`ZoomButton`).
 */
export function ModeBar(props: {
  modes: CommentMode['modes'] | null
  compact?: boolean
  children?: ReactNode
}): ReactElement | null {
  const { modes, compact = false, children } = props
  if (modes === null || !modes.visible) return null
  return (
    <div className={css.modeBar}>
      {/* Round 5 (acceptance v3 J38): a press here keeps the focus in the page — a WordPress mobile menu
          opened in Interactive closes as soon as the page loses it, so pressing Edit closed the menu
          before its items could be picked. The click still switches; the keyboard still reaches both. */}
      <div className={css.modeSegments} role="group" aria-label={t('browserMode')} onMouseDown={(event) => { event.preventDefault() }}>
        <button
          type="button"
          className={cx(css.modeSegment, !modes.edit && css.modeSegmentOn, compact && css.modeSegmentIcon)}
          aria-label={t('modeInteractive')}
          aria-pressed={!modes.edit}
          title={t('modeInteractiveTitle')}
          onClick={modes.selectInteractive}
        >
          <LuMousePointer2 size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={cx(css.modeSegment, modes.edit && !modes.unavailable && css.modeSegmentOn, modes.unavailable && css.modeSegmentUnavailable, compact && css.modeSegmentIcon)}
          aria-label={t('editButton')}
          aria-pressed={modes.edit}
          title={modes.unavailable ? t('editUnavailable') : t('editTitle')}
          onClick={modes.selectEdit}
        >
          {modes.unavailable ? <LuSearchX size={13} aria-hidden /> : <LuPencil size={13} aria-hidden />}
          {!compact && <span>{t('editButton')}</span>}
        </button>
      </div>
      {children}
    </div>
  )
}

/**
 * "Comments" (rule 9, stories ToolbarCommentsButton · …Zero · …Compact): a plain ghost button carrying
 * the chat column's Comments badge (Lee 04/10/2026): `open` is the site's OPEN threads, all authors —
 * the number the Comments tab and its All pages pill show — and `unread` this person's unread open
 * threads. tracy-chat-input holds the read marks and says both (`tracy:comment-unread`, `comment-store.ts`
 * `readCommentsBadge`), so nothing is counted here. A grey badge shows `open` ONLY when above 0 (Akemi
 * 01/10/2026, toolbar option A: no "0"); null draws nothing either. A terracotta dot sits on its corner
 * while `unread` is above 0, the badge's tooltip and the button's name saying "N unread"; `unread` null
 * (the read marks not in yet, or an older chat input that says no `open`) is no dot and no words. A
 * click opens the chat column's Comments tab. No ▾, no menu. Compact: the icon with the badge on its
 * corner; the word in the tooltip and `aria-label`.
 */
export function CommentsButton(props: { open: number | null; unread: number | null; compact: boolean; onOpen: () => void }): ReactElement {
  const { compact, onOpen } = props
  const open = props.open ?? 0
  const unread = open > 0 && props.unread !== null && props.unread > 0 ? t('commentsUnread', { count: props.unread }) : null
  const name = t('commentsButtonCount', { count: open })
  return (
    <button
      type="button"
      className={cx(css.commentsButton, compact && css.commentsButtonIcon)}
      aria-label={unread === null ? name : `${name}, ${unread}`}
      title={t('commentsButton')}
      onClick={onOpen}
    >
      <LuMessageSquare size={14} aria-hidden />
      {!compact && <span>{t('commentsButton')}</span>}
      {open > 0 && (
        <span
          className={cx(css.commentsCount, compact && css.commentsCountCorner)}
          data-dot={unread === null ? undefined : ''}
          title={unread ?? undefined}
        >
          {String(open)}
        </span>
      )}
    </button>
  )
}

/** How long the copy button's tooltip says "Link copied" (story ToolbarCopyLinkCopied: about 1.5 s). */
export const COPY_FEEDBACK_MS = 1_500

/**
 * "Copy link to this page in this mode", in Go's slot beside the address. After a click its OWN
 * tooltip reads "Link copied" with a tick for {@link COPY_FEEDBACK_MS}.
 */
export function CopyLinkButton(props: { onCopy: () => Promise<boolean> }): ReactElement {
  const { onCopy } = props
  const [said, setSaid] = useState<'copied' | 'failed' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  return (
    <span className={css.copyLink}>
      <button
        type="button"
        className={css.iconButton}
        aria-label={t('browserCopyLink')}
        title={said === null ? t('browserCopyLink') : undefined}
        onClick={() => {
          void onCopy().then((copied) => {
            setSaid(copied ? 'copied' : 'failed')
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
              timer.current = null
              setSaid(null)
            }, COPY_FEEDBACK_MS)
          })
        }}
      >
        {said === 'copied' ? <LuCheck size={14} aria-hidden /> : <LuCopy size={14} aria-hidden />}
      </button>
      {said !== null && (
        <span role="status" className={css.copyLinkTip}>
          {t(said === 'copied' ? 'browserLinkCopied' : 'browserLinkCopyFailed')}
        </span>
      )}
    </span>
  )
}

const REFRESH_CHIP: Record<RefreshLook, CopyKey | null> = {
  idle: null,
  working: 'refreshWorking',
  'working-long': null,
  updated: 'refreshUpdated',
  ready: 'refreshReady',
}

/**
 * Refresh as the one place a turn's progress shows (rule 5; stories RefreshWorking · RefreshWorkingLong
 * · RefreshNewVersionUpdated · RefreshNewVersionReady · …Compact): spinning while Tracy works (chip for
 * the first 3 s), still with "New version updated" for 3 s once the page reloaded itself, terracotta
 * with "New version ready" until clicked. The chip is dark, under the button, its arrow on its centre.
 */
export function RefreshButton(props: { look: RefreshLook; onClick: () => void }): ReactElement {
  const { look, onClick } = props
  const chip = REFRESH_CHIP[look]
  const spin = look === 'working' || look === 'working-long'
  const label = chip !== null ? `${t('refresh')}: ${t(chip)}` : spin ? `${t('refresh')}: ${t('refreshWorking')}` : t('refresh')
  return (
    <span className={css.refreshWrap}>
      <button
        type="button"
        className={cx(css.iconButton, look === 'ready' && css.refreshReady)}
        aria-label={label}
        title={chip === null && !spin ? t('refresh') : undefined}
        data-refresh={look}
        onClick={onClick}
      >
        <IconRefreshOutlineRegular size={14} className={spin ? css.commentSpin : undefined} />
      </button>
      {chip !== null && (
        <span role="status" className={css.refreshChip}>{t(chip)}</span>
      )}
    </span>
  )
}

// ── Authors ─────────────────────────────────────────────────────────────────────────────────

/**
 * An author's bubble is the face the SERVER gave them (`comment-store.ts` `bubbleFace`: its `initial`
 * on its `color`, TCH `lib/person-face.js`); a comment not answered for yet wears the viewer's face
 * (`mode.viewerFace`). The page hashes no colour of its own.
 */
function bubbleOf(mode: CommentMode): (author: CommentAuthor | undefined) => PersonFace {
  return author => bubbleFace(author, mode.viewerFace)
}

function nameOf(author: CommentAuthor | undefined): string {
  const name = author?.name?.trim()
  if (name !== undefined && name !== '') return name
  return author?.email.split('@')[0] ?? t('commentYou')
}

/**
 * How the layer names people (round 5, acceptance v3 TH-6): `<name> (<email before @>)` when two
 * accounts among the site's comments share a name (`authorLabels`), the name otherwise; "You" for a
 * comment the server has not answered for yet.
 */
function namesOf(mode: CommentMode): (author: CommentAuthor | undefined) => string {
  const label = authorLabels(mode.comments)
  return author => (author === undefined ? nameOf(author) : label(author))
}

/** What a failed save's box says (round 5, TH-2), in its own box. */
function SaveErrorLine(props: { mode: CommentMode; box: AttachmentBox }): ReactElement | null {
  const error = props.mode.saveError
  if (error === null || error.box !== props.box) return null
  return <div className={css.commentError} role="status" data-save-error="">{saveErrorCopy(error)}</div>
}

function saveErrorCopy(error: SaveError): string {
  return t(error.key, error.params)
}

/** The count near the limit (round 5, TH-2): shown from 90 % of `maxChars`, red past it. */
function CharCount(props: { text: string; max: number }): ReactElement | null {
  const count = charCount(props.text, props.max)
  if (!count.shown) return null
  return (
    <>
      <div className={cx(css.commentCount, count.over && css.commentCountOver)} data-char-count="" data-over={count.over ? '' : undefined} aria-live="polite">
        {t('commentCharCount', { count: count.length, max: count.max })}
      </div>
      {/* Round 11 (L2): over the limit, why; the Comments tab's page box says the same sentence. */}
      {count.over && <div className={css.commentError} role="status" data-too-long="">{t('commentErrTooLong', { max: count.max })}</div>}
    </>
  )
}

// ── The popover ─────────────────────────────────────────────────────────────────────────────

/** The popover's width (the stories' `w-[340px]`). */
export const POPOVER_WIDTH_PEOPLE = 340

/** An estimate of the popover's height before it has painted once. */
const POPOVER_ESTIMATE = 150

/** The key the Enter button shows, small and muted after its label — the same on every system. */
const ENTER_HINT = '↵'

/** The tooltip of the button Enter presses: "Ask Tracy to edit (Enter)", "Save (Enter)". */
function enterTitle(label: string): string {
  return `${label} (Enter)`
}

/**
 * A comment box's keys: the dsh chat composer's Enter rule (`comment-keys.ts`, Brian 30/09/2026) —
 * Enter and ⌘/Ctrl+Enter press the box's ↵ button, Shift+Enter is a new line, an input method's Enter
 * (its composition-closing one included) never sends and is left to the browser, a held-down Enter presses once,
 * and an empty box or a disabled button ignores Enter.
 * @param action - what ↵ does in this box.
 * @param disabled - whether ↵ cannot be pressed now.
 * @returns the text box's handlers.
 */
function useEnterKeys(action: () => void, disabled: boolean): {
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
} {
  const composing = useRef(false)
  const tail = useRef(0)
  return {
    onKeyDown: (event) => {
      const native = event.nativeEvent as KeyboardEvent
      const gesture = enterGesture(
        {
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          altGraph: typeof native.getModifierState === 'function' && native.getModifierState('AltGraph'),
          repeat: event.repeat,
          isComposing: native.isComposing === true,
          // oxlint-disable-next-line typescript/no-deprecated -- keyCode 229 is the legacy composition signal
          keyCode: event.keyCode,
        },
        { composing: composing.current || Date.now() < tail.current, empty: event.currentTarget.value.trim() === '', disabled },
      )
      if (gesture === 'pass') return
      event.preventDefault()
      if (gesture === 'press') action()
    },
    onCompositionStart: () => { composing.current = true },
    onCompositionEnd: () => {
      composing.current = false
      tail.current = Date.now() + COMPOSITION_TAIL_MS
    },
  }
}

/** The tallest a comment box's text grows (about nine lines) before it scrolls inside. */
export const TEXT_MAX_HEIGHT = 200

/**
 * A text box that grows with its words up to {@link TEXT_MAX_HEIGHT}, then scrolls inside, and shrinks
 * back as words go (Brian 30/09/2026). Measured before the box itself is measured (declare it first),
 * so the popover's flip and clamp see its new height in the same render.
 * @param field - the text box.
 * @param value - its words: measured again whenever they change.
 * @param width - the box's width, which re-wraps the words.
 */
/** @param voice - the microphone's row in the field: its padding changes the height the words need. */
function useAutoGrow(field: { current: HTMLTextAreaElement | null }, value: string, width: number, voice = false): void {
  useLayoutEffect(() => {
    const el = field.current
    if (el === null) return
    el.style.height = 'auto'
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight)
    // Not laid out (hidden, or no layout at all): the rows and the CSS minimum stand.
    if (!(full > 0)) return
    el.style.height = `${String(Math.min(full, TEXT_MAX_HEIGHT))}px`
    el.style.overflowY = full > TEXT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [field, value, width, voice])
}

/** The key hint after a button's label. */
function KeyHint(props: { keys: string }): ReactElement {
  return <span className={css.commentKeyHint} aria-hidden>{props.keys}</span>
}

/** How long a box flashes when a click outside cannot close it (words typed). */
export const FLASH_MS = 500

/** A box's flash: true for {@link FLASH_MS} after each bump of `flash`, which also puts the focus back in `field`. */
function useFlash(flash: number, field: { current: HTMLTextAreaElement | null }): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (flash === 0) return
    setOn(true)
    field.current?.focus()
    const timer = setTimeout(() => { setOn(false) }, FLASH_MS)
    return () => { clearTimeout(timer) }
  }, [flash, field])
  return on
}

/**
 * "Press Esc again to discard" under a box's text field (Akemi 01/10/2026, review §8, rule 14): shown
 * when the controller refused to drop typed words (`refused`, its `mode.flash`, bumped by a first Esc,
 * ✕, Interactive or navigation); gone when typing resumes, when the box closes (unmount), or when
 * {@link DISCARD_AGAIN_MS} runs out — after that the next Esc only refuses again, so the line would lie.
 * A click outside is not an attempt and never shows it. A count already above 0 when the box opens is
 * an old refusal, not this box's.
 */
function useDiscardNote(refused: number, text: string): boolean {
  const [on, setOn] = useState(false)
  const seen = useRef(refused)
  useEffect(() => {
    if (refused === seen.current) return
    seen.current = refused
    setOn(true)
    const timer = setTimeout(() => { setOn(false) }, DISCARD_AGAIN_MS)
    return () => { clearTimeout(timer) }
  }, [refused])
  const typed = useRef(text)
  useEffect(() => {
    if (text === typed.current) return
    typed.current = text
    setOn(false)
  }, [text])
  return on
}

/** The discard note's line: a polite live region kept in the box, empty until the note shows. */
function DiscardNote(props: { on: boolean }): ReactElement {
  return (
    <div className={cx(css.commentDiscardNote, !props.on && css.commentDiscardNoteIdle)} aria-live="polite" data-discard-note={props.on ? 'on' : undefined}>
      {props.on ? t('commentEscAgain') : null}
    </div>
  )
}

/** One line of a line-based wheel (`deltaMode` 1), in CSS pixels. */
const WHEEL_LINE_PX = 16

/** Whether `from`, or a box between it and `stop`, can still scroll by (dx, dy) itself. */
function canScrollBy(from: EventTarget | null, stop: Element, dx: number, dy: number): boolean {
  for (let node = from instanceof Element ? from : null; node !== null; node = node.parentElement) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node)
      if (dy !== 0 && /auto|scroll/.test(style.overflowY)) {
        if (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true
        if (dy < 0 && node.scrollTop > 0) return true
      }
      if (dx !== 0 && /auto|scroll/.test(style.overflowX)) {
        if (dx > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1) return true
        if (dx < 0 && node.scrollLeft > 0) return true
      }
    }
    if (node === stop) break
  }
  return false
}

/**
 * The wheel over a box scrolls the PAGE (round 4, item 8; acceptance v2 V2-8): the box sits over the
 * cross-origin frame, so its wheel never reached the page and the person had to move the pointer off
 * the box to scroll. A box (or list) under the pointer that can still scroll that way scrolls first —
 * the usual overscroll — and at its end the page takes the wheel, in the page's pixels (the tab's zoom
 * taken out). A pinch (ctrl + wheel) is left to the browser.
 * Round 10 (acceptance v5 B04, PICK-new-9): a pin too, and the step names whose box it was — `id` of a
 * thread card's or a pin's comment, null for the popover — so a page naming `wheel` scrolls the box
 * the element sits in (a nested list) instead of the page.
 * @param box - the popover, the thread card or a pin.
 * @param wheelPage - `CommentMode.wheelPage`.
 * @param zoom - the tab's zoom in percent.
 * @param open - what is open in the box: the listener is attached again when it changes.
 * @param id - the comment the box belongs to; null for the popover (the open pick).
 */
function useWheelToPage(box: { current: HTMLElement | null }, wheelPage: (dx: number, dy: number, id?: string | null) => void, zoom: number, open: string | null, id: string | null = null): void {
  const latest = useRef({ wheelPage, zoom, id })
  latest.current = { wheelPage, zoom, id }
  useEffect(() => {
    const el = box.current
    if (el === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey) return
      const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      if ((dx === 0 && dy === 0) || canScrollBy(event.target, el, dx, dy)) return
      event.preventDefault()
      const scale = latest.current.zoom > 0 ? latest.current.zoom / 100 : 1
      latest.current.wheelPage(dx / scale, dy / scale, latest.current.id)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [box, open])
}

// ── Files in a box ──────────────────────────────────────────────────────────────────────────

/** What a drop or a paste carries as files (never folders' entries, never text). */
function filesOf(list: FileList | readonly File[] | null | undefined): File[] {
  return list === null || list === undefined ? [] : Array.from(list as ArrayLike<File>)
}

const carriesFiles = (transfer: DataTransfer | null | undefined): boolean => Array.from(transfer?.types ?? []).includes('Files')

/** The drag handlers a comment box spreads on itself. */
type BoxDragProps = { onDragEnter: (event: ReactDragEvent) => void; onDragOver: (event: ReactDragEvent) => void; onDragLeave: (event: ReactDragEvent) => void; onDrop: (event: ReactDragEvent) => void }

/**
 * Drop files on a box: the whole box takes them (the text box included) and its text area turns into a
 * drop zone (`DropZone`) while files are dragged over it. Nothing when the server keeps no files.
 *
 * Round 11 (acceptance v5 V5-2): a file drag over a box ends at the box, whether it takes files or
 * not. dsh's chat box listens for drops on the whole document (`ui-attachment` drop-events.ts) and
 * takes every one that reaches it, prevented or not — the same file landed in the comment box AND in
 * the chat, and went to Tracy with the next chat message. A drag with no file (words, a link) passes.
 */
function useBoxDrop(mode: CommentMode, box: AttachmentBox): { over: boolean; props: BoxDragProps } {
  // A counter: entering a child of the box leaves the box itself first.
  const depth = useRef(0)
  const [over, setOver] = useState(false)
  const takes = mode.attachments.enabled
  /** A file drag: never past this box. Returns whether it is one. */
  const keep = (event: ReactDragEvent): boolean => {
    if (!carriesFiles(event.dataTransfer)) return false
    event.stopPropagation()
    return true
  }
  return {
    over: takes && over,
    props: {
      onDragEnter: (event) => {
        if (!keep(event) || !takes) return
        depth.current += 1
        setOver(true)
      },
      onDragOver: (event) => {
        if (!keep(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = takes ? 'copy' : 'none'
      },
      onDragLeave: (event) => {
        if (!keep(event) || !takes) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      },
      onDrop: (event) => {
        if (!keep(event)) return
        // Never opened in place by the browser, taken here or not.
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const files = filesOf(event.dataTransfer?.files)
        if (takes && files.length > 0) mode.addFiles(box, files)
      },
    },
  }
}

/** Paste into a box's text: images become files; words stay words. */
function onPasteFiles(mode: CommentMode, box: AttachmentBox): ((event: ReactClipboardEvent) => void) | undefined {
  if (!mode.attachments.enabled) return undefined
  return (event) => {
    const images = filesOf(event.clipboardData?.files).filter(f => isImageType(f.type))
    if (images.length === 0) return
    event.preventDefault()
    mode.addFiles(box, images)
  }
}

/** The paperclip (dsh composer's icon) and its hidden file picker (many files). */
function AttachButton(props: { mode: CommentMode; box: AttachmentBox }): ReactElement | null {
  const { mode, box } = props
  const input = useRef<HTMLInputElement | null>(null)
  if (!mode.attachments.enabled) return null
  return (
    <>
      <button type="button" className={css.commentAttach} aria-label={t('attachButton')} title={t('attachTitle')} data-attach="" onClick={() => { input.current?.click() }}>
        <IconPaperclipOutlineRegular size={14} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = filesOf(event.currentTarget.files)
          // The same file picked again must fire `change` again.
          event.currentTarget.value = ''
          if (files.length > 0) mode.addFiles(box, files)
        }}
      />
    </>
  )
}

/** A picked image's thumbnail, from an object URL held while the chip stands. */
function FileThumb(props: { file: File }): ReactElement | null {
  const { file } = props
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => { URL.revokeObjectURL(url) }
  }, [file])
  return src === null ? <span className={css.attachThumb} /> : <img className={css.attachThumb} src={src} alt="" />
}

/** A file chip's 22 px type square: `PDF`, `ZIP`… (the chat composer's badge). */
function TypeBadge(props: { name: string }): ReactElement {
  return <span className={css.attachBadge} aria-hidden>{fileBadge(props.name)}</span>
}

/** The inline ✕ at a chip's end. */
function ChipRemove(props: { name: string; onClick: () => void }): ReactElement {
  const label = t('attachRemove', { name: props.name })
  return (
    <button type="button" className={css.attachRemove} aria-label={label} title={label} onClick={props.onClick}>
      <LuX size={14} aria-hidden />
    </button>
  )
}

/**
 * The box's files under its text, as the chat composer draws them (Akemi 01/10, edit-mode review
 * "attachments"): one 30 px chip per file, wrapping in a row. An image: a 22 px thumbnail and its name;
 * any other file: a type badge, its name and its size; ✕ inline at the end. A file the box refused
 * (`draftError.files`) stands after them with a red line and the short reason in place of its size.
 */
function DraftChips(props: { mode: CommentMode; box: AttachmentBox; draft: readonly DraftAttachment[] }): ReactElement | null {
  const { mode, box, draft } = props
  const refused = mode.draftError?.box === box ? mode.draftError.files : []
  if (draft.length === 0 && refused.length === 0) return null
  return (
    <div className={css.attachChips}>
      {draft.map((d) => {
        const name = d.kind === 'file' ? d.file.name : d.attachment.name
        const size = d.kind === 'file' ? d.file.size : d.attachment.size
        const image = isImageType(d.kind === 'file' ? d.file.type : d.attachment.type)
        return (
          <span key={d.key} className={css.attachChip} data-attach-chip={d.key} title={`${name} · ${formatBytes(size)}`}>
            <span className={css.attachChipBody}>
              {image
                ? (d.kind === 'file' ? <FileThumb file={d.file} /> : <img className={css.attachThumb} src={d.attachment.url} alt="" loading="lazy" />)
                : <TypeBadge name={name} />}
              <span className={css.attachName}>{name}</span>
              {!image && <span className={css.attachMeta}>{formatBytes(size)}</span>}
            </span>
            <ChipRemove name={name} onClick={() => { mode.removeDraft(box, d.key) }} />
          </span>
        )
      })}
      {refused.map((f) => {
        const why = refusedReason(f)
        return (
          <span key={f.key} className={css.attachChip} data-attach-chip={f.key} data-state="error" title={`${f.name} · ${why}`}>
            <span className={css.attachChipBody}>
              <TypeBadge name={f.name} />
              <span className={css.attachName}>{f.name}</span>
              <span className={css.attachMeta}>{why}</span>
            </span>
            <ChipRemove name={f.name} onClick={() => { mode.removeRefused(box, f.key) }} />
          </span>
        )
      })}
    </div>
  )
}

/** A refused chip's short reason: "Over 20 MB", "Max 20 files" (the box's real caps, `formatLimit`). */
function refusedReason(f: RefusedFile): string {
  return f.code === 'too-large' ? t('attachChipTooLarge', { limit: formatLimit(f.limit) }) : t('attachChipTooMany', { limit: f.limit })
}

function refusalCopy(refusal: DraftRefusal): string {
  return refusal.code === 'too-large'
    ? t('attachTooLarge', { name: refusal.name, limit: formatLimit(refusal.limit) })
    : t('attachTooMany', { limit: refusal.limit })
}

/**
 * Why a box did not take a file, for screen readers: the red chips say it on screen, this live line
 * says the latest refusal in a whole sentence (visually hidden).
 */
function DraftError(props: { mode: CommentMode; box: AttachmentBox }): ReactElement | null {
  const error = props.mode.draftError
  if (error === null || error.box !== props.box) return null
  return <div className={css.visuallyHidden} role="status" aria-live="polite" data-attach-error="">{refusalCopy(error.refusal)}</div>
}

/**
 * Over a box's text while files are dragged over the box (Akemi 01/10): a dashed neutral zone saying
 * what it takes and the box's real cap per file (`boxLimits` of the list's `attachments`, the same
 * numbers `addFiles` checks). No ring around the box.
 */
function DropZone(props: { mode: CommentMode }): ReactElement {
  const { maxBytes } = boxLimits(props.mode.attachments)
  return (
    <span className={css.commentDropZone} data-drop-zone="" aria-hidden>
      <span className={css.commentDropTitle}>{t('commentDropTitle')}</span>
      <span className={css.commentDropDesc}>{t('commentDropDesc', { limit: formatLimit(maxBytes) })}</span>
    </span>
  )
}

/**
 * A message's words with each @mention drawn in the brand colour, the way the chat column's Comments
 * list draws them (Akemi, 05/10/2026: the thread card printed "@octopal @anhvp.ecom" as plain text).
 */
function MentionText(props: { text: string }): ReactElement {
  return (
    <>
      {mentionParts(props.text).map((part, i) =>
        part.mention
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order.
          ? <span key={i} className={css.threadMention} data-mention="">{part.text}</span>
          : part.text)}
    </>
  )
}

/**
 * A message's kept files in the thread card, in the same 30 px chips (no ✕): each opens its own door
 * (cookie-carried, no public link) — an image in a new tab, any other file downloads in place.
 */
function MessageFiles(props: { files: readonly CommentAttachment[] }): ReactElement | null {
  const { files } = props
  if (files.length === 0) return null
  return (
    <span className={css.attachChips}>
      {files.map(a => (
        <a
          key={a.id}
          className={cx(css.attachChip, css.attachLink)}
          href={a.url}
          // An image opens in a new tab; any other file downloads in place (round 5, acceptance v3 A07: a
          // new tab for a file the server sends as an attachment stayed blank).
          {...(isImageType(a.type) ? { target: '_blank', rel: 'noopener noreferrer' } : { download: a.name })}
          aria-label={t('attachOpen', { name: a.name })}
          title={`${a.name} · ${formatBytes(a.size)}`}
          data-attachment={a.id}
        >
          <span className={css.attachChipBody}>
            {isImageType(a.type)
              ? <img className={css.attachThumb} src={a.url} alt={a.name} loading="lazy" />
              : <TypeBadge name={a.name} />}
            <span className={css.attachName}>{a.name}</span>
            {!isImageType(a.type) && <span className={css.attachMeta}>{formatBytes(a.size)}</span>}
          </span>
        </a>
      ))}
    </span>
  )
}

/**
 * Round 11 (acceptance v5 V5-3): the box's comment was deleted by someone else while words or files
 * waited in it. The box stays with them and says so in one plain line.
 */
function LostLine(): ReactElement {
  return <div className={css.commentLost} role="status" data-lost="">{t('commentLostKept')}</div>
}

/**
 * The foot of a lost box (V5-3): Discard at the left; "Add as new comment" (on the same element) and
 * "Ask Tracy to edit". Enter keeps the box's own meaning: the card's goes to Tracy, the edit popover's keeps words.
 */
function LostFoot(props: { mode: CommentMode; box: AttachmentBox; enter: 'add' | 'send'; blocked: boolean; compact: boolean; attach?: boolean; viewer?: boolean }): ReactElement {
  // `viewer` (a Viewer seat, `seat-viewer.ts`): no "Ask Tracy to edit"; callers pass it with enter 'add'.
  const { mode, box, enter, blocked, compact, attach = true, viewer = false } = props
  const addLabel = t('commentLostAdd')
  const sendLabel = t('editSend')
  return (
    <div className={css.commentFoot} data-lost-foot="">
      {/* The thread card keeps its paperclip inside the reply field. */}
      {attach && <AttachButton mode={mode} box={box} />}
      <button type="button" className={css.commentDelete} onClick={mode.discardLost}>
        {t('commentLostDiscard')}
      </button>
      <span className={css.commentFootEnd}>
        <button type="button" className={css.commentSecondary} disabled={blocked} title={enter === 'add' ? enterTitle(addLabel) : addLabel} onClick={mode.addLost}>
          {addLabel}
          {enter === 'add' && !compact && <KeyHint keys={ENTER_HINT} />}
        </button>
        {!viewer && (
          <button type="button" className={css.commentSend} disabled={blocked || mode.sending} title={enter === 'send' ? enterTitle(sendLabel) : sendLabel} onClick={mode.sendLost}>
            {sendLabel}
            {enter === 'send' && !compact && <KeyHint keys={ENTER_HINT} />}
          </button>
        )}
      </span>
    </div>
  )
}

/**
 * "<name> (hidden now)" at the head of a box whose element hid (round 8). Only the NAME shortens with an
 * ellipsis; the suffix always shows whole (verify6 L2: "NewsletterDigest email template (hi…" lost the
 * part that says why the outline is gone). The copy key keeps the words' order per language.
 */
function HiddenNote(props: { name: string; className: string | undefined }): ReactElement {
  const MARK = '\u0000'
  const whole = t('commentHiddenNow', { name: props.name })
  const [before = '', after = ''] = t('commentHiddenNow', { name: MARK }).split(MARK)
  return (
    <span className={cx(props.className, css.hiddenNoteRow)} data-hidden-note="" title={whole}>
      {before !== '' && <span className={css.hiddenNoteFixed}>{before}</span>}
      <span className={css.hiddenNoteName} data-hidden-note-name="">{props.name}</span>
      {after !== '' && <span className={css.hiddenNoteFixed} data-hidden-note-suffix="">{after}</span>}
    </span>
  )
}

/**
 * The comment popover (rule 2): header "Comment" + ✕; the text box; a new pick has "Note for team"
 * (click) and "Ask Tracy to edit ↵" (Enter), a reopened comment "Save ↵" (Enter) and "Ask Tracy to edit"
 * (click) with a small "Delete" at the foot's left.
 *
 * A Viewer seat (TCH ADR 0028, `seat-viewer.ts`) may comment but cannot have Tracy edit: no "Ask Tracy
 * to edit" anywhere in the box, and its one remaining action ("Note for team", or "Save" in a reopened
 * comment) is the primary button and takes Enter.
 */
export function CommentPopover(props: {
  mode: CommentMode
  /** The box it stands by, in the layer's pixels (already zoomed). */
  rect: PreviewPickRect
  frame: { width: number; height: number }
  compact?: boolean
  /** Bumped by a click outside while words are typed: the box flashes and keeps the focus. */
  flash?: number
  /** The tab's zoom in percent (the wheel over the box scrolls the page in its own pixels). */
  zoom?: number
  /** Round 8: the element is hidden now — its name for the head ("Newsletter (hidden now)"), else null. */
  note?: string | null
  /** How many earlier pins stand on the edited comment's pin spot (the box keeps clear of it). */
  pinFan?: number
}): ReactElement {
  const { mode, rect, frame, compact = false, flash = 0, zoom = 100, note = null, pinFan = 0 } = props
  const box = useRef<HTMLDivElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const flashing = useFlash(flash, textarea)
  const discardNote = useDiscardNote(mode.flash, mode.text)
  useWheelToPage(box, mode.wheelPage, zoom, 'popover')
  const drop = useBoxDrop(mode, 'popover')
  const boxWidth = compact ? compactPopoverWidth(frame.width) : POPOVER_WIDTH_PEOPLE
  // Declared before the auto-grow so it follows the microphone's row in and out of the field.
  const [voice, setVoice] = useState(false)
  useAutoGrow(textarea, mode.text, boxWidth, voice)
  const [height, setHeight] = useState(POPOVER_ESTIMATE)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measured after every render; the 2 px threshold ends it
  useLayoutEffect(() => {
    const measured = box.current?.offsetHeight
    if (measured !== undefined && measured > 0 && Math.abs(measured - height) > 2) setHeight(measured)
  })
  const edit = mode.foot === 'edit' ? mode.editing : null
  const focusKey = mode.picked !== null ? `pick:${String(mode.picked.id)}` : edit !== null ? `edit:${edit.id}` : null
  useEffect(() => { textarea.current?.focus() }, [focusKey])
  // Beside the block when the frame has room (right, else left), else under or over it, never on its
  // pin (Akemi 01/10, edit-mode review §3). A box waiting at the frame's corner stays there.
  const place = rect === CORNER ? popoverPlacement(rect, frame, height, boxWidth, 'box') : boxPlacement(rect, frame, height, boxWidth, edit !== null, pinFan)
  const empty = mode.text.trim() === ''
  // Over the limit nothing is kept or sent (round 5, TH-2): every button waits, and so does Enter.
  const over = charCount(mode.text, mode.maxChars).over
  // Enter presses Ask Tracy to edit in a new pick and Save in a reopened comment; the other is a click.
  const enterSaves = edit !== null
  const lost = edit !== null && mode.lost === 'edit'
  const viewer = useSeatViewer()
  // A Viewer's Enter presses the people action (Note for team / Save), never Ask Tracy to edit.
  const enterPeople = enterSaves || viewer
  const enterAction = lost ? mode.addLost : enterSaves ? mode.save : viewer ? mode.addComment : mode.sendToTracy
  const keys = useEnterKeys(enterAction, over || (enterPeople ? false : mode.sending))
  // Tracy's microphone listening (`CommentVoice.tsx`, in the text field, `voice` above): its row runs along
  // the field's bottom; the paperclip, Delete and the button Enter does not press step aside.
  const people = enterSaves ? mode.save : mode.addComment
  const peopleLabel = t(enterSaves ? 'editSave' : 'commentAdd')
  const sendLabel = t('editSend')
  // `@` lists the site's people under the box (TCH #809 C1).
  const mention = useMentionPicker({ text: mode.text, setText: mode.setText, field: textarea, people: mode.mention.people, load: mode.mention.load, picked: (p) => { mode.mention.pick('popover', p) } })
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t('commentTitle')}
      className={cx(css.commentPopover, flashing && css.commentFlash)}
      style={{ left: place.left, top: place.top, width: place.width }}
      data-foot={mode.foot ?? undefined}
      data-side={'side' in place ? place.side : undefined}
      data-comment-box=""
      data-voice-composer=""
      data-drop={drop.over ? 'on' : undefined}
      {...drop.props}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // The box takes this Esc whole: nothing behind it (the pointing layer, dsh) acts on it too (IN4-3).
          event.preventDefault()
          event.stopPropagation()
          mode.escape('parent', event.nativeEvent)
        }
      }}
    >
      <div className={css.commentHead}>
        <span className={css.commentHeadTitle}>{t('commentTitle')}</span>
        {note !== null && <HiddenNote name={note} className={css.commentHiddenNote} />}
        <button type="button" aria-label={t('editClose')} title={t('commentCloseTitle')} className={css.commentClose} onClick={mode.close}>
          <LuX size={14} aria-hidden />
        </button>
      </div>
      {edit === null && mode.picked !== null && <CommentPath mode={mode} target={mode.picked.target} />}
      <div className={cx(css.commentField, drop.over && css.commentFieldDrop)}>
        <textarea
          ref={textarea}
          className={cx(css.commentTextarea, !empty && css.commentTextareaFilled)}
          placeholder={t('editPlaceholder')}
          rows={3}
          value={mode.text}
          onChange={(event) => {
            mode.setText(event.target.value)
            mention.onType(event.target.value, event.target.selectionStart)
          }}
          {...keys}
          onKeyDown={(event) => { if (!mention.onKey(event)) keys.onKeyDown(event) }}
          {...mention.field}
          onPaste={onPasteFiles(mode, 'popover')}
        />
        <span className={cx(css.commentVoice, voice && css.commentVoiceOn)} data-comment-voice="">
          <CommentVoice text={mode.text} setText={mode.setText} field={textarea} submit={enterAction} locked={mode.sending} onActiveChange={setVoice} />
        </span>
        {drop.over && <DropZone mode={mode} />}
      </div>
      <MentionList picker={mention} id="tracy-mention-popover" />
      <DiscardNote on={discardNote} />
      <CharCount text={mode.text} max={mode.maxChars} />
      {lost && <LostLine />}
      <DraftChips mode={mode} box="popover" draft={mode.draft} />
      <DraftError mode={mode} box="popover" />
      <SaveErrorLine mode={mode} box="popover" />
      {mode.notice !== null && <div className={css.commentError} role="status">{t(FAILURE_COPY[mode.notice])}</div>}
      {lost ? <LostFoot mode={mode} box="popover" enter="add" blocked={empty || over} compact={compact} viewer={viewer} /> : (
      <div className={css.commentFoot}>
        {!voice && <AttachButton mode={mode} box="popover" />}
        {!voice && edit !== null && isMine(edit) && (
          <button type="button" className={css.commentDelete} onClick={() => { mode.deleteComment(edit.id) }}>
            {t('commentDelete')}
          </button>
        )}
        <span className={css.commentFootEnd}>
          {(!voice || enterPeople) && (
          <button type="button" className={viewer ? css.commentSend : css.commentSecondary} disabled={empty || over} title={enterPeople ? enterTitle(peopleLabel) : peopleLabel} onClick={people}>
            {peopleLabel}
            {enterPeople && !compact && <KeyHint keys={ENTER_HINT} />}
          </button>
          )}
          {!viewer && (!voice || !enterPeople) && (
            <button type="button" className={css.commentSend} disabled={empty || over || mode.sending} title={enterSaves ? sendLabel : enterTitle(sendLabel)} onClick={mode.sendToTracy}>
              {sendLabel}
              {!enterSaves && !compact && <KeyHint keys={ENTER_HINT} />}
            </button>
          )}
        </span>
      </div>
      )}
    </div>
  )
}

// ── The pins ────────────────────────────────────────────────────────────────────────────────

// The bubble's size, place, fan step and tooltip side live in comment-model.ts (the boxes' placement keeps clear of it).
export { AVATAR_PIN_SIZE, PIN_FAN_PX, avatarPinPlacement, pinTipPlace }

/** The one line a grey pin and its thread card show: why the block is not outlined. */
export function ghostNote(reason: GhostReason): string {
  return t(reason === 'missing' ? 'commentGhostMissing' : 'commentGhostChanged')
}

/** "<name> · 1 comment" / "<name> · <n> comments": a pin's tooltip. */
export function pinTip(name: string, count: number): string {
  return count === 1 ? t('commentPinTipOne', { name }) : t('commentPinTipMany', { name, count: String(count) })
}

/** Whether the browser draws a focus ring here (keyboard focus); an engine without the selector says yes. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * The one owner of which pin shows its tooltip (dev 01/10/2026: a pin's tooltip stayed over the
 * neighbouring logo while another pin's card was open). The last pin a pointer or keyboard focus
 * reached holds it until that same pin is left or blurred; nothing shows while any box (a card or a
 * popover) is open, and the holder shows again once the box closes with the pointer still on it.
 */
function useTipOwner(boxOpen: boolean): { shows: (id: string) => boolean; report: (id: string) => (on: boolean) => void } {
  const [holder, setHolder] = useState<string | null>(null)
  return {
    shows: (id) => !boxOpen && holder === id,
    report: (id) => (on) => { setHolder(prev => on ? id : prev === id ? null : prev) },
  }
}

/**
 * One open comment's pin: its author's bubble; a click opens its thread card. It stands in its block's
 * left gutter, its square corner pointing right at the block (P1, Akemi 01/10/2026), or inside the
 * block's top-left corner, pointing at it, when the gutter is too narrow (`data-spot`). While its card is
 * open it wears the active ring (`active`). {@link pinTip} shows where it covers least of the block
 * ({@link pinTipPlace}) only while `tip` is set: the overlay owns which one pin, if any, shows it
 * ({@link useTipOwner}); the pin only reports a pointer or keyboard focus arriving and going (`onTip`). The 38 px hit area (`::before`) paints under every bubble, so in a fan
 * a neighbour's hit area never takes a click meant for a bubble you can see.
 */
function AvatarPin(props: { comment: Comment; rect: PreviewPickRect; frameWidth: number; dim: boolean; active?: boolean; who: string; count: number; face: PersonFace; fan?: number; ghost?: GhostReason | null; tip?: boolean; onTip?: (on: boolean) => void; onOpen: () => void; wheelPage: CommentMode['wheelPage']; zoom: number }): ReactElement {
  const { comment, rect, frameWidth, dim, active = false, who, count, fan = 0, ghost = null, tip: tipShown = false, onTip, onOpen, wheelPage, zoom } = props
  // A grey pin (its block lost) wears the neutral grey with the letter, never its author's colour or photo.
  const face = ghost !== null ? { ...props.face, color: GHOST_PIN_COLOUR, avatarUrl: null } : props.face
  const place = avatarPinPlacement(rect, frameWidth, fan)
  const tipAt = pinTipPlace(place, frameWidth)
  const tip = pinTip(who, count)
  const note = ghost === null ? null : ghostNote(ghost)
  const pin = useRef<HTMLButtonElement | null>(null)
  // The wheel over a pin scrolls the page too (round 10, acceptance v5 PICK-new-9: it did nothing).
  useWheelToPage(pin, wheelPage, zoom, comment.id, comment.id)
  return (
    <button
      ref={pin}
      type="button"
      // A resolved comment has a pin only while it is revealed with its card open: faded, as done.
      className={cx(css.commentAvatarPin, active && css.commentPinActive, (dim || comment.status === 'resolved') && css.commentPinDim)}
      style={{ left: place.left, top: place.top, background: face.color }}
      aria-label={t('commentPinLabel', { name: who })}
      aria-description={note === null ? tip : `${tip}. ${note}`}
      aria-expanded={active}
      onClick={onOpen}
      onPointerEnter={() => onTip?.(true)}
      onPointerLeave={() => onTip?.(false)}
      // Focus from a click is not :focus-visible and shows nothing; Tab is, and shows it until blur.
      onFocus={(event) => { if (focusVisible(event.currentTarget)) onTip?.(true) }}
      onBlur={() => onTip?.(false)}
      data-comment-pin={comment.id}
      data-spot={place.spot}
      data-active={active ? '' : undefined}
      data-ghost={ghost ?? undefined}
    >
      <Face face={face} size={AVATAR_PIN_SIZE} fill data-pin-initial="" />
      <span className={cx(css.commentPinTip, note !== null && css.commentPinTipGhost)} data-pin-tip="" data-shown={tipShown ? '' : undefined} data-side={tipAt.side} data-align={tipAt.align} aria-hidden>
        {tip}
        {note !== null && <span className={css.commentPinTipNote} data-pin-tip-note="">{note}</span>}
      </span>
    </button>
  )
}

// ── The thread card ─────────────────────────────────────────────────────────────────────────

/**
 * A message's ⋮: Edit, Copy link, a divider, then Delete last (Akemi 01/10/2026, review §8); Edit and
 * Delete only on one's own, Copy link on every one. Delete is red with the trash icon — the same word,
 * look and Undo as the Comments tab's Delete all (Brian 29/09 22:45).
 */
function MessageMenu(props: { mode: CommentMode; message: Comment }): ReactElement {
  const { mode, message } = props
  const [open, setOpen] = useState(false)
  // F14: Copy link says whether it copied, in the toolbar copy button's own bubble.
  const [said, setSaid] = useState<'copied' | 'failed' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  const own = isMine(message) && message.removed !== true
  const items: MenuEntry[] = [
    ...(own ? [{ id: 'edit', icon: <LuPencil size={12} aria-hidden />, label: t('commentEdit') }] : []),
    { id: 'link', icon: <LuLink2 size={12} aria-hidden />, label: t('commentCopyLink') },
    ...(own
      ? [
          { type: 'separator' as const, id: 'before-delete' },
          { id: 'delete', icon: <LuTrash2 size={12} aria-hidden data-icon="trash" />, label: t('commentDelete'), danger: true },
        ]
      : []),
  ]
  const menu = (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={items}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'edit') mode.editMessage(message.id)
        else if (id === 'delete') mode.deleteComment(message.id)
        else if (id === 'link') {
          void mode.copyLink(message.id).then((copied) => {
            setSaid(copied ? 'copied' : 'failed')
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
              timer.current = null
              setSaid(null)
            }, COPY_FEEDBACK_MS)
          })
        }
      }}
      portal
      compact
      align="end"
      anchor={(
        <button
          type="button"
          className={css.threadMore}
          aria-label={t('commentMore')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => { setOpen(was => !was) }}
        >
          <LuEllipsisVertical size={14} aria-hidden />
        </button>
      )}
    />
  )
  return (
    <>
      {menu}
      {said !== null && <span role="status" className={css.copyLinkTip}>{t(said === 'copied' ? 'browserLinkCopied' : 'browserLinkCopyFailed')}</span>}
    </>
  )
}

/** The air above a revealed reply when the card opens at it (round 6). */
const FOCUS_AIR_PX = 8

/**
 * Where a thread card's list stands to show its newest message: the list's end, unless that message is
 * taller than the list — then the message's top, so its face and author line are in view and the rest
 * scrolls under them. Measured on dev 09/10/2026: a one-message card "On body" (an element taller than
 * the frame, so the card is capped to THREAD_CARD_MIN) aimed at the end and hid the author line above
 * the list's top edge.
 */
function newestTop(list: HTMLElement): number {
  const messages = list.querySelectorAll<HTMLElement>('[data-message]')
  const newest = messages[messages.length - 1]
  if (newest === undefined || newest.offsetHeight <= list.clientHeight) return list.scrollHeight
  return Math.max(0, newest.offsetTop - list.offsetTop)
}

/** How often an open thread card redraws its messages' ages (F15). */
export const AGE_TICK_MS = 30_000

/**
 * The thread card of a people comment (rule 4, stories ThreadCardSendToChat · CommentsTabRowOpensCard;
 * redesigned in three layers by Akemi 01/10/2026, mockup "edit-mode-review"): the head
 * ({@link ThreadHead}); the messages in order, each with its author's 24 px bubble, name, time and a ⋮
 * shown on hover or focus — a person's consecutive messages are one run (Akemi 01/10/2026,
 * {@link threadRunContinues}): only its first shows the bubble, name and time, the rest their words with
 * their time as a tooltip; the list is capped ({@link threadListMaxHeight}) and scrolls inside the card;
 * "A reply reopens it." under a resolved thread; the composer — "Reply…" with
 * the paperclip inside, "Reply" (a click) and "Ask Tracy to edit ↵" (Enter), both disabled while empty.
 * ✕, Esc or a click outside closes it.
 */
export function ThreadCard(props: { mode: CommentMode; rect: PreviewPickRect | null; frame: { width: number; height: number }; compact?: boolean; flash?: number; zoom?: number; onOutside?: () => void; note?: string | null; pinFan?: number; ghost?: GhostReason | null }): ReactElement | null {
  const { mode, rect, frame, compact = false, flash = 0, zoom = 100, note = null, pinFan = 0, ghost = null } = props
  const root = mode.thread
  const box = useRef<HTMLDivElement | null>(null)
  const reply = useRef<HTMLTextAreaElement | null>(null)
  const flashing = useFlash(flash, reply)
  const discardNote = useDiscardNote(mode.flash, mode.replyText)
  useWheelToPage(box, mode.wheelPage, zoom, root?.id ?? null, root?.id ?? null)
  const drop = useBoxDrop(mode, 'reply')
  const onOutside = useRef(props.onOutside ?? mode.closeThread)
  onOutside.current = props.onOutside ?? mode.closeThread
  const cardWidth = compact ? compactPopoverWidth(frame.width) : POPOVER_WIDTH_PEOPLE
  // Tracy's microphone listening in the Reply box (`CommentVoice.tsx`), as in the popover.
  const [voice, setVoice] = useState(false)
  useAutoGrow(reply, mode.replyText, cardWidth, voice)
  const tooLong = charCount(mode.replyText, mode.maxChars).over
  const lost = mode.lost === 'thread'
  // Its only message deleted, Undo pending: the card reads "Deleted · Undo" and offers nothing else.
  const going = threadGoing(mode)
  // A Viewer seat (`seat-viewer.ts`) cannot have Tracy edit: Reply is their one action, primary, on Enter.
  const viewer = useSeatViewer()
  const enterAction = lost ? (viewer ? mode.addLost : mode.sendLost) : viewer ? mode.reply : mode.sendThread
  const keys = useEnterKeys(enterAction, viewer ? tooLong : mode.sending || tooLong)
  // `@` lists the site's people under the reply box (TCH #809 C1).
  const mention = useMentionPicker({ text: mode.replyText, setText: mode.setReplyText, field: reply, people: mode.mention.people, load: mode.mention.load, picked: (p) => { mode.mention.pick('reply', p) } })
  // Round 5 (acceptance v3 TH-5): the messages scroll inside the card, opened at the newest; a message
  // arriving while the list sits at its end keeps it there. Round 6 (acceptance v4 thread): a revealed
  // reply (`threadFocus`, a link's `&comment=<reply>`) opens the card AT it instead, and this person's
  // own "Reply" brings the list down to show it even when it was scrolled up.
  const list = useRef<HTMLDivElement | null>(null)
  const atEnd = useRef(true)
  const count = mode.threadMessages.length
  const focus = mode.threadFocus
  // Round 11 (acceptance v5 V5-1): the list's aim — the newest message, or a revealed reply — holds
  // through every change of the list's size until the person scrolls it. A card opened from a link, or
  // from a tab row while the page still scrolls to its element, is drawn uncapped first and capped
  // beside its element only once the page reports where that is; a browser keeps `scrollTop` where the
  // tall list clamped it, so the card stood mid-thread with the newest (or the linked) reply out of view.
  const aim = useRef<{ to: string | null; held: boolean; top: number; size: string }>({ to: null, held: true, top: 0, size: '' })
  const sizeOf = (el: HTMLElement): string => `${String(el.clientHeight)}:${String(el.scrollHeight)}`
  const aimNow = (el: HTMLElement): void => {
    const to = aim.current.to
    const at = to === null ? undefined : [...el.querySelectorAll<HTMLElement>('[data-message]')].find(n => n.getAttribute('data-message') === to)
    if (at === undefined) {
      el.scrollTop = newestTop(el)
      atEnd.current = true
    } else {
      // Both offsets are from the card (the positioned box): the message's place inside the list, a little air above.
      el.scrollTop = Math.max(0, at.offsetTop - el.offsetTop - FOCUS_AIR_PX)
      atEnd.current = false
    }
    aim.current.top = el.scrollTop
    aim.current.size = sizeOf(el)
  }
  /** Aim again when the list's size moved since the last aim, while the person has not scrolled it. */
  const keepAim = (): void => {
    const el = list.current
    if (el !== null && aim.current.held && sizeOf(el) !== aim.current.size) aimNow(el)
  }
  const keepAimRef = useRef(keepAim)
  keepAimRef.current = keepAim
  useLayoutEffect(() => {
    const el = list.current
    if (el === null) return
    aim.current.to = focus
    aim.current.held = true
    aimNow(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new thread or a new reveal only
  }, [root?.id, focus])
  useLayoutEffect(() => {
    const el = list.current
    if (el !== null && atEnd.current) el.scrollTop = newestTop(el)
  }, [count])
  const repliesSeen = useRef(mode.ownReplies)
  useLayoutEffect(() => {
    if (mode.ownReplies === repliesSeen.current) return
    repliesSeen.current = mode.ownReplies
    const el = list.current
    if (el === null) return
    // This person's own reply: the newest is the aim now.
    aim.current.to = null
    aim.current.held = true
    aimNow(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the count of own replies
  }, [mode.ownReplies])
  // After every render (the card capped beside its element, a message added, its place settled)…
  useLayoutEffect(() => { keepAim() })
  // …and a size change no render causes (a thumbnail loading, a font arriving).
  const openThreadId = root?.id ?? null
  useEffect(() => {
    const el = list.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { keepAimRef.current() })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [openThreadId])
  const [height, setHeight] = useState(POPOVER_ESTIMATE)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measured after every render; the 2 px threshold ends it
  useLayoutEffect(() => {
    const measured = box.current?.offsetHeight
    if (measured !== undefined && measured > 0 && Math.abs(measured - height) > 2) setHeight(measured)
  })
  const { closeThread } = mode
  // F15: the ages ("6 min ago") move on while the card stays open.
  const [, setTick] = useState(0)
  const openId = root?.id ?? null
  useEffect(() => {
    if (openId === null) return
    const timer = setInterval(() => { setTick(n => n + 1) }, AGE_TICK_MS)
    return () => { clearInterval(timer) }
  }, [openId])
  // A click outside closes it; a click in its own ⋮ menu (portaled) does not.
  useEffect(() => {
    if (root === null) return
    const onDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (box.current?.contains(target) === true) return
      if (target instanceof Element && target.closest('[role="menu"]') !== null) return
      // The click shield over the frame answers its own clicks (the same rule, once).
      if (target instanceof Element && target.closest('[data-comment-shield]') !== null) return
      onOutside.current()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        mode.escape('parent', event)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the open thread
  }, [root?.id, closeThread])
  if (root === null) return null
  // A whole-page comment (or one the page cannot find): the card opens at the frame's top corner.
  const anchor = rect ?? { x: 8 + 6, y: 8 + 6 - 10 - 6, width: 0, height: 0 }
  // Round 6: a long card is capped to the room beside its element, so it never covers what it is about;
  // beside the element (Akemi 01/10, §3) that room is the frame's height.
  const maxHeight = boxMaxHeight(rect, frame, cardWidth, true, pinFan)
  const cardHeight = maxHeight === undefined ? height : Math.min(height, maxHeight)
  const place = rect === null ? popoverPlacement(anchor, frame, cardHeight, cardWidth, 'box') : boxPlacement(rect, frame, cardHeight, cardWidth, true, pinFan)
  const empty = mode.replyText.trim() === ''
  const over = charCount(mode.replyText, mode.maxChars).over
  const resolved = root.status === 'resolved'
  const who = namesOf(mode)
  const faceOf = bubbleOf(mode)
  const follows = threadRunContinues(mode.threadMessages, mode.deleted?.id ?? null)
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t('commentThread')}
      className={cx(css.commentPopover, css.threadCard, flashing && css.commentFlash)}
      style={maxHeight === undefined ? { left: place.left, top: place.top, width: place.width } : { left: place.left, top: place.top, width: place.width, maxHeight }}
      data-thread={root.id}
      data-side={'side' in place ? place.side : undefined}
      data-comment-box=""
      data-drop={drop.over ? 'on' : undefined}
      {...drop.props}
    >
      <ThreadHead mode={mode} root={root} note={note} lost={lost || going} resolvedBy={who(root.resolvedBy)} ghost={ghost} />
      <div
        ref={list}
        className={css.threadList}
        data-thread-list=""
        style={{ maxHeight: threadListMaxHeight(frame) }}
        onScroll={(event) => {
          const el = event.currentTarget
          // A scroll the list did not cause by changing size (a scrollbar drag, keys) is the person's.
          if (aim.current.held && sizeOf(el) === aim.current.size && Math.abs(el.scrollTop - aim.current.top) > 1) aim.current.held = false
          // Standing at the newest message's top (taller than the list) still counts as the end.
          atEnd.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8 || Math.abs(el.scrollTop - newestTop(el)) <= 1
        }}
        onWheel={() => { aim.current.held = false }}
        onTouchMove={() => { aim.current.held = false }}
      >
      {mode.threadMessages.map((m, i) => (mode.deleted?.id === m.id
        // In place of what was clicked (Brian 23:05): the message's spot says it for the Undo window. The
        // Comments list's treatment (Akemi 01/10/2026): a terracotta Undo and the thin terracotta bar that
        // drains over the window are the countdown; no number.
        ? (
            <div key={m.id} className={cx(css.threadMessage, css.threadDeleted)} data-message={m.id} data-deleted="" role="status">
              {t('commentDeleted')}
              <span className={css.commentNoticeDot} aria-hidden>·</span>
              <button type="button" className={css.commentUndo} onClick={mode.undoDelete}>{t('commentUndo')}</button>
              <span className={css.commentCountdown} style={{ animationDuration: `${String(DELETE_UNDO_MS)}ms` }} aria-hidden />
            </div>
          )
        : follows[i] === true
        // The same person again within the run: only the words, the time as a tooltip, the ⋮ kept.
        ? (
            <div key={m.id} className={cx(css.threadMessage, css.threadFollow, m.id === focus && css.threadFocus)} data-message={m.id} data-follow="" data-focus={m.id === focus ? '' : undefined}>
              <div className={css.threadMessageBody} title={relativeTime(new Date(m.createdAt).toISOString())}>
                <div className={css.threadText}><MentionText text={m.text} /></div>
                <MessageFiles files={m.attachments ?? []} />
              </div>
              {!lost && <span className={css.threadMoreSlot} data-more-slot=""><MessageMenu mode={mode} message={m} /></span>}
            </div>
          )
        : (
        <div key={m.id} className={cx(css.threadMessage, m.id === focus && css.threadFocus)} data-message={m.id} data-focus={m.id === focus ? '' : undefined}>
          {/* The author's 24 px face, the pin's (Akemi 01/10, thread card redesign). */}
          <Face face={faceOf(m.author)} size={24} className={css.threadAvatar} data-avatar="" />
          <div className={css.threadMessageBody}>
            <div className={css.threadMessageHead}>
              <span className={css.threadAuthor} title={who(m.author)}>{who(m.author)}</span>
              <span className={css.threadAge}>{relativeTime(new Date(m.createdAt).toISOString())}</span>
              {m.removed !== true && !lost && <span className={css.threadMoreSlot} data-more-slot=""><MessageMenu mode={mode} message={m} /></span>}
            </div>
            {m.removed === true
              // Round 5 (TH-4): a first message deleted under live replies is the thread's muted top.
              ? <div className={cx(css.threadText, css.threadTombstone)} data-tombstone="">{t(i === 0 ? 'commentRootDeleted' : 'commentRemoved')}</div>
              : <div className={css.threadText}><MentionText text={m.text} /></div>}
            {m.removed !== true && <MessageFiles files={m.attachments ?? []} />}
          </div>
        </div>
          )))}
      </div>
      {/* "Resolved by X" is the head pill's tooltip now; under the messages only what a reply does. */}
      {resolved && !lost && !going && <div className={css.threadReopenNote} data-reopen-note="">{t('commentReplyReopens')}</div>}
      {!going && (
      <div className={css.threadCompose} data-thread-compose="" data-voice-composer="">
        {lost && <LostLine />}
        <div className={cx(css.commentField, css.threadField, mode.attachments.enabled && css.threadFieldClip, drop.over && css.commentFieldDrop)}>
          <textarea
            ref={reply}
            className={cx(css.commentTextarea, css.threadReply, !empty && css.commentTextareaFilled)}
            placeholder={t('commentReplyPlaceholder')}
            rows={1}
            value={mode.replyText}
            onChange={(event) => {
              mode.setReplyText(event.target.value)
              mention.onType(event.target.value, event.target.selectionStart)
            }}
            {...keys}
            onKeyDown={(event) => { if (!mention.onKey(event)) keys.onKeyDown(event) }}
            {...mention.field}
            onPaste={onPasteFiles(mode, 'reply')}
          />
          {/* The paperclip inside the field, at its right (the chat composer's place for it). */}
          {!drop.over && !voice && <AttachButton mode={mode} box="reply" />}
          <span className={cx(css.commentVoice, voice && css.commentVoiceOn)} data-comment-voice="">
            <CommentVoice text={mode.replyText} setText={mode.setReplyText} field={reply} submit={enterAction} locked={mode.sending} onActiveChange={setVoice} />
          </span>
          {drop.over && <DropZone mode={mode} />}
        </div>
        <MentionList picker={mention} id="tracy-mention-reply" />
        <DiscardNote on={discardNote} />
        <CharCount text={mode.replyText} max={mode.maxChars} />
        <DraftChips mode={mode} box="reply" draft={mode.replyDraft} />
        <DraftError mode={mode} box="reply" />
        <SaveErrorLine mode={mode} box="reply" />
        {mode.notice !== null && <div className={css.commentError} role="status">{t(FAILURE_COPY[mode.notice])}</div>}
        {lost ? <LostFoot mode={mode} box="reply" enter={viewer ? 'add' : 'send'} blocked={empty || over} compact={compact} attach={false} viewer={viewer} /> : (
        <div className={css.commentFoot}>
          <span className={css.commentFootEnd}>
            {(!voice || viewer) && (
            <button type="button" className={viewer ? css.commentSend : cx(css.commentSecondary, css.threadGhost)} disabled={empty || over} title={viewer ? enterTitle(t('commentReply')) : t('commentReply')} onClick={mode.reply}>
              {t('commentReply')}
              {viewer && !compact && <KeyHint keys={ENTER_HINT} />}
            </button>
            )}
            {!viewer && (
              <button type="button" className={css.commentSend} disabled={empty || over || mode.sending} title={enterTitle(t('editSend'))} onClick={mode.sendThread}>
                {t('editSend')}
                {!compact && <KeyHint keys={ENTER_HINT} />}
              </button>
            )}
          </span>
        </div>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * The thread card's head (Akemi 01/10/2026, thread card redesign, layer 1), over a divider: "On <the
 * element>" at the left — the Comments tab row chip's words ({@link threadPlace}), cut with an ellipsis;
 * "<name> (hidden now)" instead while the element is hidden. At the right, an open thread has Resolve (a
 * ✓ icon); a resolved one a green "Resolved" pill ("Resolved by X" as its tooltip; "Tracy marked this done" when Tracy
 * resolved it, the Comments list's own words, TCH ADR 0025) and Reopen (an icon);
 * then ✕, which closes the card as Esc does. A lost box (its comment deleted elsewhere) acts on nothing.
 */
function ThreadHead(props: { mode: CommentMode; root: Comment; note: string | null; lost: boolean; resolvedBy: string; ghost?: GhostReason | null }): ReactElement {
  const { mode, root, note, lost, resolvedBy, ghost = null } = props
  const resolved = root.status === 'resolved'
  const where = threadPlace(root, t('commentPathImage'))
  const MARK = '\u0000'
  const [before = '', after = ''] = t('commentThreadOn', { place: MARK }).split(MARK)
  const whole = where === null ? t('commentThreadOnPage') : t('commentThreadOn', { place: where })
  return (
    <>
    <div className={css.threadHead} data-thread-head="" data-has-note={ghost !== null ? '' : undefined}>
      {note !== null
        ? <HiddenNote name={note} className={css.threadOn} />
        : (
            <span className={css.threadOn} title={whole} data-thread-on="">
              {where === null ? whole : <>{before}<span className={css.threadOnName}>{where}</span>{after}</>}
            </span>
          )}
      {resolved && (
        <span className={css.threadResolvedPill} title={root.resolvedByTracy === true ? t('commentDoneByTracy') : t('commentResolvedBy', { name: resolvedBy })} data-resolved-pill="">
          <LuCheck size={12} aria-hidden />
          {t('commentResolvedPill')}
        </span>
      )}
      {!lost && (resolved
        ? (
            <button type="button" className={css.threadHeadIcon} aria-label={t('commentReopen')} title={t('commentReopen')} data-reopen="" onClick={() => { mode.reopen(root.id) }}>
              <LuRotateCcw size={14} aria-hidden />
            </button>
          )
        : (
            <button type="button" className={cx(css.threadHeadIcon, css.threadResolve)} aria-label={t('commentResolve')} title={t('commentResolve')} data-resolve="" onClick={() => { mode.resolve([root.id]) }}>
              <LuCheck size={15} aria-hidden />
            </button>
          ))}
      <button type="button" className={css.threadHeadIcon} aria-label={t('editClose')} title={t('commentCloseTitle')} data-thread-close="" onClick={() => { mode.escape('parent') }}>
        <LuX size={14} aria-hidden />
      </button>
    </div>
    {/* The grey pin's line (Akemi 01/10/2026): part of the head, over its divider. */}
    {ghost !== null && <div className={css.threadGhostNote} role="note" data-ghost-note={ghost}>{ghostNote(ghost)}</div>}
    </>
  )
}

// ── The layer ───────────────────────────────────────────────────────────────────────────────

const NOMINAL_FRAME = { width: 1024, height: 768 }

/** How long "Interactive: click links normally" stays after an Esc leaves Edit; pairs with `.commentHintLeaving` (2s). */
export const EXIT_NOTE_MS = 2_000

/**
 * Lockstep (runtime 14): the page posts the boxes of each scroll step, then `pick-step {step}`, and
 * lands the step only once told `pick-drawn {step}` — sent here from a layout effect, i.e. after the
 * render that placed those boxes has committed. A busy tab then slows the page's scroll instead of
 * drawing its popover, pins and card behind it (measured under heavy load: up to 105 px without it).
 * Only the page frame of this stage is answered, on its own origin; the answer carries a number only.
 * @param root - the layer, whose stage holds the page frame.
 */
function useLockstepAnswer(root: { current: HTMLDivElement | null }): void {
  const [step, setStep] = useState<{ n: number; to: Window; origin: string } | null>(null)
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (!isPreviewMessage(event.data, PREVIEW_PICK.step)) return
      const frame = root.current?.parentElement?.querySelector('iframe')
      const to = frame?.contentWindow ?? null
      if (to === null || event.source !== to || event.origin === 'null' || event.origin === '') return
      const n = (event.data as { step?: unknown }).step
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return
      setStep({ n, to, origin: event.origin })
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [root])
  useLayoutEffect(() => {
    if (step === null) return
    try {
      step.to.postMessage({ channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.drawn, step: step.n }, step.origin)
    } catch {
      // The frame navigated away: the page lands the step after its wait.
    }
  }, [step])
}

/**
 * Where a box's element was last reported shown, in page pixels, for as long as `key` names the same
 * box in the same document (round 8, `boxStand`); null when it has not been seen under this key.
 * @param key - the box and the document (`<doc>:pick:<id>`, `<doc>:edit:<id>`, `<doc>:thread:<id>`), or null.
 * @param rect - what the page reports now.
 */
function useSeen(key: string | null, rect: ShownRect | undefined): PreviewPickRect | null {
  const seen = useRef<{ key: string | null; rect: PreviewPickRect | null }>({ key: null, rect: null })
  if (seen.current.key !== key) seen.current = { key, rect: null }
  if (key !== null && rect !== undefined && rect.hidden !== 'clipped') seen.current.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  return seen.current.rect
}

/** Where a box waits when its element has no place on the page: the frame's top corner. */
const CORNER: PreviewPickRect = { x: 14, y: 4, width: 0, height: 0 }

/**
 * The card of a grey pin that has no place (its block never seen in this tab): it stands by the pin at
 * the frame's corner as by a block the pin's size, so it never covers the pin.
 */
const GHOST_CORNER_BOX: PreviewPickRect = { x: CORNER.x, y: CORNER.y, width: AVATAR_PIN_SIZE, height: AVATAR_PIN_SIZE }

/**
 * The layer over the frame. Sized by the frame's box; in Interactive it draws nothing but a notice.
 * @param props.zoom - the tab's zoom in percent: the page's boxes are multiplied by it.
 * @param props.scroll - how far the stage is scrolled (above 100 % only).
 * @param props.onFrameWidth - told the frame's width on mount and on every resize.
 */
export function CommentOverlay(props: { mode: CommentMode; zoom: number; scroll?: StageScroll; onFrameWidth?: (width: number) => void }): ReactElement | null {
  const { mode, zoom, scroll, onFrameWidth } = props
  // A Viewer seat's pointing hint leaves out "ask Tracy to edit" (`seat-viewer.ts`).
  const viewer = useSeatViewer()
  const root = useRef<HTMLDivElement | null>(null)
  useLockstepAnswer(root)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const reportWidth = useRef(onFrameWidth)
  reportWidth.current = onFrameWidth
  useLayoutEffect(() => {
    const el = root.current
    if (el === null) return
    const measure = (): void => {
      setFrame({ width: el.clientWidth, height: el.clientHeight })
      reportWidth.current?.(el.clientWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])
  const on = mode.modes.edit
  const { escape } = mode
  const pointing = on && mode.picked === null && mode.foot === null && mode.thread === null
  // Esc while pointing (the keyboard is in this page): back to Interactive, unless something already took it.
  useEffect(() => {
    if (!pointing) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) escape('parent', event)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [pointing, escape])
  // An Esc that left Edit: "Interactive: click links normally" where the hint stood, for EXIT_NOTE_MS.
  const leftByEsc = mode.modes.leftByEsc ?? 0
  const [exitNote, setExitNote] = useState(false)
  useEffect(() => {
    if (leftByEsc === 0) return
    setExitNote(true)
    const timer = window.setTimeout(() => { setExitNote(false) }, EXIT_NOTE_MS)
    return () => { window.clearTimeout(timer) }
  }, [leftByEsc])
  // Back in Edit before it ran out: the hint takes the spot at once.
  useEffect(() => { if (on) setExitNote(false) }, [on])
  const box = frame.width > 0 && frame.height > 0 ? frame : NOMINAL_FRAME
  const place = (rect: PreviewPickRect): PreviewPickRect => scaleRect(rect, zoom, box.width, scroll)
  const compact = isCompactFrame(frame.width)
  const editingId = mode.editing?.id ?? null
  const editRoot = mode.editing === null ? null : (mode.editing.replyTo ?? mode.editing.id)
  // Round 8 (`boxStand`): a box stands by its element while the page shows it; hidden after it was
  // seen in this document, it stays where it last stood (its head names the element); hidden and never
  // seen here, it waits at the frame's top corner with its words, and comes back when the element does.
  const popoverKey = mode.foot === 'new' && mode.picked !== null
    ? `${String(mode.doc)}:pick:${String(mode.picked.id)}`
    : mode.foot === 'edit' && editRoot !== null ? `${String(mode.doc)}:edit:${editRoot}` : null
  // A comment whose block the page lost (the grey pin): its boxes stand by the pin, where the block was
  // last seen, and say why instead of naming a hidden element.
  const ghostFor = (id: string | null | undefined) => (id === null || id === undefined || mode.rects.has(id) ? undefined : mode.ghosts.get(id))
  const ghostShown = (id: string | null | undefined): ShownRect | undefined => ghostFor(id)?.rect ?? undefined
  const popoverShown: ShownRect | undefined = mode.foot === 'new' && mode.picked !== null
    ? { ...mode.picked.target.rect, ...(mode.picked.target.hidden === undefined ? {} : { hidden: mode.picked.target.hidden }) }
    : popoverKey !== null && editRoot !== null ? (mode.rects.get(editRoot) ?? ghostShown(editRoot)) : undefined
  const popoverStand = boxStand(popoverShown, useSeen(popoverKey, popoverShown))
  const popoverRect: PreviewPickRect | null = popoverKey === null ? null : popoverStand.rect === null ? CORNER : place(popoverStand.rect)
  const editGhost = mode.foot === 'edit' ? ghostFor(editRoot) : undefined
  const popoverElement: PreviewPickTarget | null = mode.foot === 'new' && mode.picked !== null ? mode.picked.target : (mode.editing?.element ?? null)
  const threadGhost = mode.thread === null ? undefined : ghostFor(mode.thread.id)
  const shownRect = mode.thread === null ? undefined : (mode.rects.get(mode.thread.id) ?? threadGhost?.rect ?? undefined)
  const threadSeen = useSeen(mode.thread === null ? null : `${String(mode.doc)}:thread:${mode.thread.id}`, shownRect)
  const threadStand = boxStand(shownRect, threadSeen)
  // Round 11 (V5-3): a card whose comment was deleted elsewhere stays where it was last seen; so does one
  // whose only message's Delete waits for Undo (its pin left the page at once, Akemi 01/10/2026).
  const threadRect = threadStand.rect ?? (mode.lost === 'thread' || threadGoing(mode) ? threadSeen : null)
  const noteOf = (gone: boolean, element: PreviewPickTarget | null | undefined): string | null =>
    gone && mode.lost === null && element !== null && element !== undefined ? hiddenName(element) : null
  // Brian 23:08: while a box is open, the first click outside it — on the page or a pin — only
  // closes it; with words typed in it (`unsaved`: an untouched edit popover has none), it flashes and
  // keeps the focus instead. That click is not an attempt (round 7, IN4-2): the controller hears it and
  // the next Esc / ✕ / Interactive / navigation only flashes again; a second of those within 3 s drops
  // the words (round 4). The controller bumps `mode.flash` for the attempts it refused.
  const cardOpen = mode.thread !== null && mode.foot === null
  const boxOpen = popoverRect !== null || cardOpen
  const tips = useTipOwner(boxOpen)
  const [flash, setFlash] = useState(0)
  // Round 8 (`aimedAtBox`): where the open box stood lately, so a click the page reports there — the box
  // moved from under the pointer on its way to it — is not a click outside.
  const trail = useRef<BoxTrail[]>([])
  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[data-comment-box]') ?? null
    if (el === null) {
      trail.current = []
      return
    }
    const now = Date.now()
    const at: BoxTrail = {
      left: Number.parseFloat(el.style.left) || 0,
      top: Number.parseFloat(el.style.top) || 0,
      width: Number.parseFloat(el.style.width) || el.offsetWidth,
      height: el.offsetHeight > 0 ? el.offsetHeight : POPOVER_ESTIMATE,
      at: now,
    }
    const last = trail.current.at(-1)
    if (last !== undefined && last.left === at.left && last.top === at.top && last.width === at.width && last.height === at.height) return
    trail.current = [...trail.current.filter((one, i, all) => now - (all[i + 1]?.at ?? now) <= AIMED_MS), at]
  })
  const focusBox = (): void => {
    root.current?.querySelector<HTMLTextAreaElement>('[data-comment-box] textarea')?.focus()
  }
  // Runtime 15 (`refocus`): the page frame took the focus while a box is open; it goes back to the box.
  useEffect(() => {
    if (!boxOpen) return
    const onMessage = (event: MessageEvent): void => {
      if (!isPreviewMessage(event.data, PREVIEW_PICK.refocus)) return
      const frame = root.current?.parentElement?.querySelector('iframe')
      if (frame?.contentWindow === undefined || frame.contentWindow === null || event.source !== frame.contentWindow) return
      root.current?.querySelector<HTMLTextAreaElement>('[data-comment-box] textarea')?.focus()
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [boxOpen])
  const outside = (): void => {
    if (mode.unsaved) {
      mode.clickedOutside()
      setFlash(n => n + 1)
    } else if (popoverRect !== null) mode.close()
    else mode.closeThread()
  }
  // A file dragged into the Browser tab while a box is open: dropped outside the box it is caught and
  // ignored (the browser would otherwise open it in place of the page). The tab's own listeners cover
  // the toolbar and the layer; over the page frame — whose events never reach this document — a
  // catcher stands for the length of the drag. Only the box takes files (its own `onDrop`).
  const [dragging, setDragging] = useState(false)
  const filesOn = mode.attachments.enabled
  useEffect(() => {
    const layer = root.current
    if (!boxOpen || layer === null) {
      setDragging(false)
      return
    }
    const tab = layer.closest('[data-browser-tab]') ?? layer
    const inBox = (event: Event): boolean => event.target instanceof Element && event.target.closest('[data-comment-box]') !== null
    const guard = (event: DragEvent): void => {
      if (!carriesFiles(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer !== null && !(filesOn && inBox(event))) event.dataTransfer.dropEffect = 'none'
    }
    const onEnter = (event: DragEvent): void => { if (carriesFiles(event.dataTransfer)) setDragging(true) }
    const onLeave = (event: DragEvent): void => {
      const next = event.relatedTarget
      if (!(next instanceof Node) || !tab.contains(next)) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      guard(event)
      setDragging(false)
    }
    const onEnd = (): void => { setDragging(false) }
    tab.addEventListener('dragenter', onEnter as EventListener)
    tab.addEventListener('dragover', guard as EventListener)
    tab.addEventListener('dragleave', onLeave as EventListener)
    tab.addEventListener('drop', onDrop as EventListener)
    window.addEventListener('dragend', onEnd)
    return () => {
      tab.removeEventListener('dragenter', onEnter as EventListener)
      tab.removeEventListener('dragover', guard as EventListener)
      tab.removeEventListener('dragleave', onLeave as EventListener)
      tab.removeEventListener('drop', onDrop as EventListener)
      window.removeEventListener('dragend', onEnd)
    }
  }, [boxOpen, filesOn])

  // Runtime 10: the page holds its own clicks and reports them (`pick-outside`); the same rule applies.
  const outsideRef = useRef(outside)
  outsideRef.current = outside
  const { onPageOutside } = mode
  const placeRef = useRef(place)
  placeRef.current = place
  useEffect(() => onPageOutside((at) => {
    const point = placeRef.current({ x: at.x, y: at.y, width: 0, height: 0 })
    if (aimedAtBox(point, trail.current, Date.now())) focusBox()
    else outsideRef.current()
  }), [onPageOutside])
  const who = namesOf(mode)
  // Every bubble wears the face the server gave its author (TCH team-badge-count, 04/10/2026: namesakes keep
  // their own server colours; nothing moves one); the Comments tab reads the same face.
  const faceOf = bubbleOf(mode)
  // Pins on one spot fan out (round 5, SEND-new-1): how many earlier pins stand where this one would.
  // Counted once here, so a comment's box steers clear of its pin where the pin really stands.
  const spots = new Map<string, number>()
  const pins: { c: Comment; placed: PreviewPickRect; fan: number; ghost: GhostReason | null }[] = []
  for (const c of on ? mode.pageComments : []) {
    const rect = mode.rects.get(c.id)
    const ghost = ghostFor(c.id)
    // Round 5: no pin on a block out of sight in a nested box, or whose corner a page bar covers.
    if (ghost === undefined && (rect === undefined || !pinnable(rect))) continue
    // A grey pin stands where its block was last seen, else at the frame's top corner.
    const placed = rect !== undefined ? place(rect) : ghost?.rect != null ? place(ghost.rect) : CORNER
    // F9: a block whose top edge is out of view has no pin (it would stick to the frame's edge).
    if (placed.y < 0 || placed.y >= box.height) continue
    const at = avatarPinPlacement(placed, frame.width)
    const spot = `${String(Math.round(at.left))}:${String(Math.round(at.top))}`
    const fan = spots.get(spot) ?? 0
    spots.set(spot, fan + 1)
    pins.push({ c, placed, fan, ghost: ghost?.reason ?? null })
  }
  const fanOf = (id: string | null | undefined): number => pins.find(p => p.c.id === id)?.fan ?? 0
  const openId = cardOpen ? (mode.thread?.id ?? null) : null
  return (
    <div ref={root} className={css.commentOverlay}>
      {/* Painted farthest-first (P1): in a fan the pin nearest the block, the oldest, lies on top, and the
          open thread's pin over all, so its active ring shows whole. Order in the DOM only; no z-index,
          so every hit area still paints under every bubble. */}
      {pins.toSorted((x, y) => Number(x.c.id === openId) - Number(y.c.id === openId) || y.fan - x.fan).map(({ c, placed, fan, ghost }) => {
        return (
          <AvatarPin
            key={c.id}
            comment={c}
            rect={placed}
            who={who(c.author)}
            count={(c.removed === true ? 0 : 1) + mode.comments.filter(r => r.replyTo === c.id && r.removed !== true).length}
            face={faceOf(c.author)}
            fan={fan}
            ghost={ghost}
            frameWidth={frame.width}
            dim={editingId !== null && c.id !== editRoot}
            active={c.id === openId}
            tip={tips.shows(c.id)}
            onTip={tips.report(c.id)}
            onOpen={() => { if (boxOpen) outside(); else mode.openThread(c.id) }}
            wheelPage={mode.wheelPage}
            zoom={zoom}
          />
        )
      })}
      {/* Only for a page that cannot hold its clicks (runtime 9 and older): over the frame and the pins,
          under the box, so the page never sees that first click — at the cost of the wheel. */}
      {boxOpen && !mode.holdable && (
        <div
          className={css.commentShield}
          data-comment-shield=""
          aria-hidden
          onPointerDown={(event) => {
            event.preventDefault()
            outside()
          }}
        />
      )}
      {/* Over the frame during a file drag with a box open: the drop lands here and is ignored. */}
      {boxOpen && dragging && <div className={css.commentDropCatch} data-comment-dropcatch="" aria-hidden />}
      {popoverRect !== null && <CommentPopover mode={mode} rect={popoverRect} frame={box} compact={compact} flash={flash + mode.flash} zoom={zoom} note={editGhost !== undefined ? null : noteOf(popoverStand.gone, popoverElement)} pinFan={fanOf(editRoot)} />}
      {cardOpen && <ThreadCard mode={mode} rect={threadRect !== null ? place(threadRect) : threadGhost !== undefined ? GHOST_CORNER_BOX : null} frame={box} compact={compact} flash={flash + mode.flash} zoom={zoom} onOutside={outside} note={threadGhost !== undefined ? null : noteOf(threadStand.gone, mode.thread?.element)} pinFan={fanOf(mode.thread?.id)} ghost={threadGhost?.reason ?? null} />}
      {pointing && !mode.modes.unavailable && (
        // F13: in a compact frame the "· Esc to stop" tail goes and the rest may wrap.
        <div className={cx(css.commentHint, compact && css.commentHintCompact)}>
          <LuMousePointerClick size={13} aria-hidden />
          {t(viewer ? 'editHintViewer' : 'editHint')}
          {!compact && <span className={css.commentHintExit}>· {t('editHintExit')}</span>}
        </div>
      )}
      {!on && exitNote && (
        // Same spot and look as the hint; fades out at the end of EXIT_NOTE_MS (no fade with reduced motion).
        <div className={cx(css.commentHint, css.commentHintLeaving, compact && css.commentHintCompact)} role="status" aria-live="polite" data-comment-exit-note="">
          {t('editExitNote')}
        </div>
      )}
      {pointing && mode.modes.unavailable && (
        // TCH e2e v7 ADDR-9 (finding 4): Edit cannot pick on this page; a click there navigates, so say it.
        <div className={css.commentUnavailable} role="status" data-comment-unavailable="">
          <span>{t('editUnavailablePage')}</span>
          <button type="button" className={css.commentUnavailableReload} onClick={mode.modes.reload}>{t('editReloadPage')}</button>
        </div>
      )}
      {/* A send that failed with no popover or card to say it in. */}
      {mode.notice !== null && popoverRect === null && mode.thread === null && (
        <div className={css.commentNotice} role="status" data-comment-notice="">
          {t(FAILURE_COPY[mode.notice])}
        </div>
      )}
      {mode.notice === null && mode.serverError !== null && (
        <div className={css.commentNotice} role="status" data-comment-notice="server">
          {mode.serverError.key === 'commentErrUnknown' ? t('editNotSaved') : saveErrorCopy(mode.serverError)}
        </div>
      )}
      {mode.notice === null && mode.serverNotice !== null && (
        <div className={css.commentNotice} role="status" data-comment-notice="server">
          {(() => {
            const head = t(mode.serverNoticeKind === 'send' ? 'editNotSent' : 'editNotSaved')
            return mode.serverNotice === '' ? head : `${head} ${mode.serverNotice}`
          })()}
        </div>
      )}
    </div>
  )
}
