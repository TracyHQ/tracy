import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
/**
 * The way to the Tracy community on Discord, in two places (Akemi, 05/10/2026):
 *
 * - `CommunityMenuRow` — the Community row of the account menu (`settings.menu.item`, order 50,
 *   declared by tracy-settings). Always there; it is the permanent home of the link. It sat in the
 *   rail above Settings until the face replaced the gear (Lee, 09/10/2026).
 * - `HelpButton` — a floating "Need help?" pill above the composer (`conversation.input.dock`), for
 *   the moment a customer hits a bug or wants to give feedback. The customer can hide it; hidden,
 *   the menu row is still there, and the face that opens the menu flashes once to show where.
 *
 * Each has its own operator switch (`community-link`, `help-button` in @tracy/core/ui-switches).
 * Hiding the pill is per browser (localStorage), not per account: nothing on the server to keep.
 */
import { ArrowUpRight, X } from 'lucide-react'
import {
  ACCOUNT_TRIGGER_ATTR,
  type MenuItemProps,
  PopoverItem,
  PopoverSeparator
} from '@tracy/core/site-tabs'
import { uiSwitches } from '@tracy/core/ui-switches'
import type { SidebarKey } from './strings'

/** The invite link Akemi gave on 05/10/2026. One place, both pieces read it. */
export const COMMUNITY_URL = 'https://discord.gg/BM9TMRcEBb'

/** localStorage key: '1' once the customer hid the floating pill. */
const HIDDEN_KEY = 'tracy.help-button.hidden'
/** How long the "hidden" note stays before it fades out. */
const NOTE_MS = 3600
/**
 * Where the pill floats depends on where the composer sits (measured 05/10/2026):
 * - at the foot of the column (a conversation, or a site's start screen): the dock's anchor is
 *   104 to 178px above the column bottom, and the pill goes just above the composer;
 * - centred (a blank workspace): the anchor is ~560px up, beside the headline, so the pill drops
 *   to the column's bottom corner instead.
 * Anything closer than this to the column bottom counts as "at the foot".
 */
const FOOT_ZONE_PX = 280
/** Gap between the pill and the composer above which it floats, or the column corner. */
const GAP_PX = 12
const CORNER_PX = 24
/**
 * How often the column's position is re-read. Opening or closing the left column MOVES the
 * conversation column without resizing it (measured on dev 05/10/2026: 760px wide both ways, its
 * right edge 816 vs 1040), so no ResizeObserver fires and the pill was left 240px inside the column.
 * A cheap re-read catches every move; the style only changes when a coordinate does.
 */
const FOLLOW_MS = 250
/**
 * dsh draws its own round "scroll to bottom" chevron (`toBottom` in ui-chat) in the same corner
 * above the composer, 34px wide, only while the reader is not at the end of the chat. It sits on
 * the pill (screenshot 06/10/2026: the chevron covered "help"), so while both show, the pill steps
 * left of it by this gap. Keep PILL_HEIGHT_PX equal to `.tch-help-pill` height in styles.ts.
 */
const CHEVRON_GAP_PX = 8
const PILL_HEIGHT_PX = 36

type Translate = (key: SidebarKey) => string

function useShown(id: string): boolean {
  const ui = uiSwitches()
  return useSyncExternalStore(ui.subscribe, () => ui.isShown(id))
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    // Storage blocked (private window, site data off): the pill shows, and hiding lasts this page.
    return false
  }
}

function writeHidden(): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, '1')
  } catch {
    // Same as above: hidden for this page only.
  }
}

/** Discord's mark. lucide ships no brand icons, so the glyph is inline (Simple Icons, CC0). */
function DiscordMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  )
}

/**
 * The Community row of the account menu, under a separator of its own (so the separator goes when
 * the operator switches the row off). It leaves Tracy, so it opens a new tab — in the desktop app
 * the window-open handler hands that to the system browser — and the arrow at its end says so.
 */
export function CommunityMenuRow({ t, close }: MenuItemProps & { t: Translate }) {
  const shown = useShown('community-link')
  if (!shown) return null
  return (
    <>
      <PopoverSeparator />
      <PopoverItem
        itemId="community"
        icon={<DiscordMark className="size-4" />}
        end={<ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
        onClick={() => {
          window.open(COMMUNITY_URL, '_blank', 'noopener,noreferrer')
          close()
        }}
      >
        <span className="flex-1 truncate">{t('community.label')}</span>
      </PopoverItem>
    </>
  )
}

/**
 * Points the customer at the face after the pill is hidden: Community is in its menu. One flash.
 * None when the operator switched the Community row off: the face would point at nothing.
 */
function flashCommunityHome(): void {
  if (!uiSwitches().isShown('community-link')) return
  const face = document.querySelector(`[${ACCOUNT_TRIGGER_ATTR}]`)
  if (!face) return
  face.classList.remove('tsb-community-flash')
  // Restart the animation when the class is put back.
  void (face as HTMLElement).offsetWidth
  face.classList.add('tsb-community-flash')
}

/**
 * Fixed coordinates for the pill, from the dock anchor and the conversation column around it.
 * dsh's CSS-module names are hashed per build, so the column is found by the readable tail of the
 * class (DESIGN.md §3), with the anchor's parent as the fallback.
 *
 * The same pass measures dsh's scroll-to-bottom chevron: while it overlaps the pill's band, the
 * pill is shifted left of it with a `transform` that styles.ts eases, so it steps aside instead of
 * being covered. Only a chevron appearing or leaving slides the pill; every other change (first
 * placement, the chat settling, the column moving) carries `transition: none`.
 *
 * The dock's style is written here, directly, and nowhere else (the dock has no `style` prop). A
 * React state update would land in a later task, after the browser may already have painted the
 * chevron's first frame and started its fade; on a slow machine that is several frames, and the
 * chevron fades in over a pill that has not moved yet (issue #1010, measured under CPU throttling).
 * Written from the observer that sees the chevron mount, the slide starts on the chevron's frame.
 */
function usePlacement(
  anchor: { current: HTMLDivElement | null },
  dockRef: { current: HTMLDivElement | null },
  active: boolean
): void {
  useLayoutEffect(() => {
    const node = anchor.current
    const dock = dockRef.current
    if (!active || !node || !dock) return
    const column =
      node.closest<HTMLElement>('[class*="scrollBody"]') ??
      node.closest<HTMLElement>('[class*="composerSeat"]') ??
      node.parentElement
    if (!column) {
      dock.style.visibility = 'hidden'
      return
    }
    let last = ''
    let chevronShown = false
    // The chevron mounts and unmounts as a direct child of the chat frame, and the frame itself can
    // mount after the pill (a session opening) or be replaced (another session). One observer on
    // the column sees all three in the same task they happen; a pass runs only for a change in the
    // frame's own children, or while no frame is on the page, so a streaming answer deep inside the
    // chat costs nothing here.
    let frame: Element | null = null
    const frameObserver = new MutationObserver((records) => {
      if (!frame?.isConnected || records.some((record) => record.target === frame)) place()
    })
    frameObserver.observe(column, { childList: true, subtree: true })
    const place = () => {
      frame = column.querySelector('[data-chat-flow]')?.closest('[class*="frame"]') ?? null
      const spot = node.getBoundingClientRect()
      const box = column.getBoundingClientRect()
      const width = document.documentElement.clientWidth
      const height = document.documentElement.clientHeight
      const atFoot = box.bottom - spot.top < FOOT_ZONE_PX
      const right = Math.round(Math.max(width - box.right + CORNER_PX - 8, 8))
      const bottom = Math.round(
        atFoot ? height - spot.top + GAP_PX : Math.max(height - box.bottom + CORNER_PX, 8)
      )
      // How far the pill must move left to clear the chevron: only when the two share a band.
      let shift = 0
      const chevron = column.querySelector('button[class*="toBottom"]')
      if (chevron) {
        const rect = chevron.getBoundingClientRect()
        const pillBottom = height - bottom
        const sharesBand = rect.bottom > pillBottom - PILL_HEIGHT_PX && rect.top < pillBottom
        if (sharesBand) shift = Math.max(0, Math.round(width - right - rect.left + CHEVRON_GAP_PX))
      }
      // Slide only for a chevron that really came or went. dsh publishes the composer height a
      // frame after mounting, which moves `shift` while the chat settles; that must snap, or a
      // pill opening beside a chevron that was already there would drift into place. Whether the
      // chevron is on the page is recorded on every pass, even one that leaves the pill where it
      // is (a chevron outside the pill's band), so a later move into the band is not taken for it
      // arriving.
      const came = (chevron !== null) !== chevronShown
      chevronShown = chevron !== null
      const key = `${right}:${bottom}:${shift}`
      if (key === last) return
      const slide = last !== '' && came
      last = key
      dock.style.right = `${right}px`
      dock.style.bottom = `${bottom}px`
      dock.style.transform = `translateX(${-shift}px)`
      dock.style.transition = slide ? '' : 'none'
      dock.style.visibility = ''
    }
    place()
    // The composer grows with its text and the column with the side card, so both are watched.
    const observer = new ResizeObserver(place)
    observer.observe(column)
    const seat = node.closest('[class*="composerSeat"]')
    if (seat) observer.observe(seat)
    window.addEventListener('resize', place)
    const follow = window.setInterval(place, FOLLOW_MS)
    return () => {
      observer.disconnect()
      frameObserver.disconnect()
      window.removeEventListener('resize', place)
      window.clearInterval(follow)
    }
  }, [anchor, dockRef, active])
}

/**
 * The floating pill. The slot renders a zero-height anchor at the foot of the dock; the pill
 * itself is fixed to the conversation column (usePlacement), so it takes no room from the dock.
 */
export function HelpButton({ t }: { t: Translate }) {
  const shown = useShown('help-button')
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  usePlacement(anchor, dock, shown && (!hidden || note))

  // Close on Escape or on a press anywhere outside the pill and its panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPress = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [open])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(false), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [note])

  if (!shown || (hidden && !note)) return null

  const hide = () => {
    writeHidden()
    setOpen(false)
    setHidden(true)
    setNote(true)
    flashCommunityHome()
  }

  return (
    <div className="tch-help" ref={anchor}>
      {/* No `style` prop: usePlacement owns the dock's style (see there). */}
      <div className="tch-help-dock" ref={dock}>
        {note ? (
          <div className="tch-help-note" role="status">
            {t('help.hidden')}
          </div>
        ) : (
          <>
            {open ? (
              <div className="tch-help-panel" role="dialog" aria-label={t('help.button')}>
                <div className="tch-help-head">
                  <span>{t('help.button')}</span>
                  <button
                    type="button"
                    className="tch-help-close"
                    aria-label={t('help.close')}
                    onClick={() => setOpen(false)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <p className="tch-help-body">{t('help.body')}</p>
                <a
                  className="tch-help-go"
                  href={COMMUNITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <DiscordMark className="tch-help-go-icon" />
                  {t('help.open')}
                </a>
                <button type="button" className="tch-help-hide" onClick={hide}>
                  {t('help.hide')}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="tch-help-pill"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {/* The question mark is drawn by CSS (styles.ts), so it is not a string to translate. */}
              <span className="tch-help-mark" aria-hidden="true" />
              {t('help.button')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
