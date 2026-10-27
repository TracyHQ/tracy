/**
 * A menu that places itself: portalled to `document.body`, positioned from the trigger's own
 * rectangle, flipped above when there is no room below, and clamped to the viewport.
 *
 * WHY NOT `DropdownMenu` FROM `@tracy/ui`. Measured on the fijitrips lane, 04/09: the base UI
 * menu mounts and reports itself open (`aria-expanded="true"`, one `[role=menu]` in the document)
 * but never finishes its first measurement — the positioner keeps its pre-layout style
 * (`position: fixed; top: 0; left: 0; opacity: 0`, no `--anchor-width`, `transform: none`), so
 * nothing is ever drawn where a person can see it. On the bench the same component positions
 * correctly, so this is dsh's page, not the component. A base UI DIALOG is fine there — it needs
 * no anchor — which is what narrows the fault to the anchor-positioning path.
 *
 * WHY NOT SIMPLY `absolute` INSIDE THE ROW EITHER. That was the first fix, and Lee caught what it
 * costs: a row near the bottom of the list opens a menu the pane's own scroll container clips, so
 * half the items are unreachable. Only leaving the scroll container fixes that, which means a
 * portal — and a portal means placing it by hand.
 *
 * The maths is small on purpose: one `getBoundingClientRect` on open, a flip when the menu does
 * not fit below, a clamp so it never leaves the viewport, and a recompute while the page scrolls
 * or resizes. No Floating UI, nothing to fail silently.
 *
 * 🔒 A PORTAL LANDS OUTSIDE THE PLUGIN'S ROOT, where the plugin's scoped reset does not reach —
 * and mode B ships no preflight, so an unscoped `<button>` gets the UA's grey face. The panel
 * therefore carries the plugin's root class itself (`scopeClass`).
 *
 * THE KEYBOARD IS THE WAI-ARIA MENU PATTERN (the account menu, 09/10/2026): opening moves focus to
 * the checked row, else the first (ArrowUp on the button: the last); ArrowUp/ArrowDown wrap, Home/End jump; a
 * `PopoverSubmenu` row opens its side panel on ArrowRight/Enter/Space and ArrowLeft/Escape come
 * back to it; Escape at the top closes and refocuses the button; Tab closes without choosing and
 * continues from the button. Every rule only applies while focus is on a ROW (`menuitem*`), so a
 * panel holding a form or a list with its own keyboard (Design inspiration's filter and prompt)
 * keeps every key. dsh's own `Menu` has a submenu too, but activates on Tab and has no radio rows,
 * and changing it means a dsh fork bump.
 */
import {
  createContext,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight } from 'lucide-react'
// The helper alone, not the library's entry: a plugin that bundles only this menu (the desktop
// first-run screen, through Settings' Language row) would otherwise carry every component.
import { cn } from '@tracy/ui/cn'

/**
 * Every open menu on the page, oldest first. One press of Escape closes one layer, so only the menu
 * opened last answers it. The list hangs on the DOCUMENT, under a registry symbol, not on this
 * module: each plugin bundles its own copy of this file (Settings, My Sites, Site changes, Design
 * inspiration), and a module-level list would let two menus from two bundles each believe it is
 * the only one open (#807).
 */
const OPEN_MENUS = Symbol.for('tracy.site-tabs.open-menus')

function openMenusOf(doc: Document): symbol[] {
  const holder = doc as unknown as Record<symbol, symbol[] | undefined>
  let list = holder[OPEN_MENUS]
  if (list === undefined) {
    list = []
    holder[OPEN_MENUS] = list
  }
  return list
}

/** Distance kept from the trigger, and from the edge of the viewport. */
const GAP = 4
const MARGIN = 8

/**
 * How long the pointer may rest on another row before an open side panel goes away: the way from
 * Appearance to its side panel is diagonal and crosses the row below it.
 */
const SUBMENU_GRACE_MS = 250

/**
 * Push a layer on the document's stack of open menus and answer Escape while it is the top one:
 * `onEscape` runs, the press is consumed. Returns the cleanup.
 */
function holdEscape(onEscape: () => void): () => void {
  const self = Symbol('menu')
  const openMenus = openMenusOf(document)
  openMenus.push(self)
  // The press that closes the menu is the menu's own: it is consumed here, on the way down, so a
  // dialog listening on the same document (Settings does) closes on the NEXT press, not this one
  // (#807). A press something else already consumed is left alone.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (openMenus[openMenus.length - 1] !== self) return
    event.preventDefault()
    event.stopPropagation()
    onEscape()
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    const at = openMenus.indexOf(self)
    if (at !== -1) openMenus.splice(at, 1)
  }
}

/** What the arrow keys walk: the rows of one panel, as the WAI-ARIA menu pattern names them. */
const MENU_ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

/**
 * The rows of `panel` a keyboard can land on, in document order: its own (not those of a menu
 * nested inside it), and not disabled.
 */
function itemsOf(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(MENU_ITEM)].filter(
    (item) =>
      item.closest('[role="menu"]') === panel &&
      !item.matches(':disabled') &&
      item.getAttribute('aria-disabled') !== 'true'
  )
}

/**
 * Focus the first or last row of `panel`; false when it has none (a form, a list of its own).
 * `first` lands on the checked row when the panel is a choice (a filter, Appearance's themes), as
 * the WAI-ARIA menu pattern does for radio rows: opening shows where you are, not the top.
 */
function focusEdge(panel: HTMLElement | null, edge: 'first' | 'last'): boolean {
  if (!panel) return false
  const items = itemsOf(panel)
  const item =
    edge === 'first'
      ? (items.find((row) => row.getAttribute('aria-checked') === 'true') ?? items[0])
      : items[items.length - 1]
  item?.focus()
  return item !== undefined
}

/**
 * ArrowUp/ArrowDown (wrapping), Home and End among the rows of `panel`, when focus is on one of
 * them. Anything else, and any key typed into something that is not a row, is left alone.
 * @returns true when the press was used.
 */
function moveAmongItems(panel: HTMLElement, event: ReactKeyboardEvent): boolean {
  const items = itemsOf(panel)
  const at = items.indexOf(event.target as HTMLElement)
  if (at === -1) return false
  const to =
    event.key === 'ArrowDown'
      ? (at + 1) % items.length
      : event.key === 'ArrowUp'
        ? (at - 1 + items.length) % items.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : -1
  if (to === -1) return false
  event.preventDefault()
  items[to].focus()
  return true
}

/** What a {@link PopoverSubmenu} reads from the menu it sits in. */
interface MenuFrame {
  /** The menu's id: its side panels carry it, so a press in one is a press inside the menu. */
  readonly id: string
  readonly scopeClass: string
  /** The id of the submenu open beside the menu, or null. */
  readonly openSub: string | null
  readonly setOpenSub: (id: string | null) => void
  readonly panel: { readonly current: HTMLDivElement | null }
}

const MenuFrameContext = createContext<MenuFrame | null>(null)

export interface PopoverProps {
  /** What opens the panel; it receives the props that make it a real menu button. */
  trigger: (props: {
    onClick: () => void
    /** ArrowDown/ArrowUp on the closed button open the menu on its first/last row. */
    onKeyDown: (event: ReactKeyboardEvent) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string
  }) => ReactNode
  /**
   * The rows. As a function it receives `close`, for a row that must shut the menu in the same
   * action as something else (a row that opens a dialog), or for content that stops the panel's
   * close-on-click.
   */
  children: ReactNode | ((menu: { close: () => void }) => ReactNode)
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end'
  /** The plugin root's class, so the panel keeps the plugin's own reset once portalled. */
  scopeClass?: string
  className?: string
  /** The wrapper around the trigger: it is the flex item a caller's row lays out. */
  anchorClassName?: string
  /**
   * Open on mount. For a menu raised by a button that is not this component's (the Browser
   * toolbar's More, drawn by the dsh-better-sidebar fork): the caller lays the trigger over it.
   */
  defaultOpen?: boolean
  /** Told every time the panel opens or closes, the first render included. */
  onOpenChange?: (open: boolean) => void
}

interface Placement {
  top: number
  left: number
  /** Below the trigger, or flipped above it — the panel reports it for the caller's animation. */
  side: 'top' | 'bottom'
}

export function Popover({
  trigger,
  children,
  align = 'start',
  scopeClass = 'tracy-site-tabs',
  className,
  anchorClassName,
  defaultOpen = false,
  onOpenChange
}: PopoverProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  // The latest callback, so a caller passing a new function every render does not re-run the effect.
  const openChange = useRef(onOpenChange)
  openChange.current = onOpenChange
  useEffect(() => {
    openChange.current?.(open)
  }, [open])
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)
  const anchor = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  /** Which row takes focus once the panel is in the document: set by whatever opened it. */
  const focusOnOpen = useRef<'first' | 'last'>('first')
  const id = useId()

  const close = useCallback(() => setOpen(false), [])
  /**
   * A row was chosen while focus was in the menu (a keyboard choice; a click focuses the row too):
   * once the panel is gone, focus goes back to the menu button instead of falling to the page.
   */
  const returnFocus = useRef(false)
  /** The side panel's pending close while the pointer crosses another row; see SUBMENU_GRACE_MS. */
  const subClose = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepSub = useCallback(() => {
    if (subClose.current === null) return
    clearTimeout(subClose.current)
    subClose.current = null
  }, [])

  /** The menu button, when the trigger took the menu-button props and is still on the page. */
  const button = useCallback((): HTMLElement | null => {
    for (const candidate of anchor.current?.querySelectorAll<HTMLElement>('[aria-controls]') ?? []) {
      if (candidate.getAttribute('aria-controls') === id && candidate.isConnected) return candidate
    }
    return null
  }, [id])

  const place = useCallback(() => {
    const trig = anchor.current
    const box = panel.current
    if (!trig || !box) return
    const t = trig.getBoundingClientRect()
    const width = box.offsetWidth
    const height = box.offsetHeight
    const room = { below: window.innerHeight - t.bottom, above: t.top }
    // Below unless it does not fit and there is more room above: a menu that flips for a few
    // pixels is more disorienting than one that sits slightly low.
    const side: Placement['side'] =
      room.below >= height + GAP + MARGIN || room.below >= room.above ? 'bottom' : 'top'
    const top =
      side === 'bottom'
        ? Math.min(t.bottom + GAP, window.innerHeight - height - MARGIN)
        : Math.max(t.top - height - GAP, MARGIN)
    const wanted = align === 'end' ? t.right - width : t.left
    const left = Math.min(Math.max(wanted, MARGIN), Math.max(window.innerWidth - width - MARGIN, MARGIN))
    setPlacement({ top: Math.max(top, MARGIN), left, side })
  }, [align])

  // Before paint: a first frame at (0,0) is a visible jump on a slow pane.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // The WAI-ARIA menu button: opening moves focus onto a row. A panel with no rows (a form, a list
  // with its own keyboard) keeps focus where it was.
  useEffect(() => {
    if (open) focusEdge(panel.current, focusOnOpen.current)
  }, [open])

  useEffect(() => {
    if (!open) {
      setPlacement(null)
      setOpenSub(null)
      keepSub()
      if (!returnFocus.current) return
      returnFocus.current = false
      // A frame later, after whatever the row opened has taken focus (Settings focuses its dialog):
      // only focus that fell to the page with the chosen row comes back to the button.
      let timer: ReturnType<typeof setTimeout> | undefined
      const frame = window.requestAnimationFrame(() => {
        timer = setTimeout(() => {
          const active = document.activeElement
          if (active === null || active === document.body) button()?.focus()
        }, 0)
      })
      return () => {
        window.cancelAnimationFrame(frame)
        clearTimeout(timer)
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (anchor.current?.contains(event.target) === true) return
      if (panel.current?.contains(event.target) === true) return
      // A side panel of this menu is portalled on its own, outside `panel`.
      const element =
        event.target.nodeType === Node.ELEMENT_NODE ? (event.target as Element) : event.target.parentElement
      if (element?.closest('[data-popover-of]')?.getAttribute('data-popover-of') === id) return
      setOpen(false)
    }
    // Focus goes back to the menu button before the panel (and whatever row held focus) leaves the
    // document. Only a trigger that took the menu-button props, and is still on the page.
    const release = holdEscape(() => {
      button()?.focus()
      setOpen(false)
    })
    // `true`: the pane scrolls, not the window, so the event has to be caught on the way down.
    // And if the trigger is no longer in the document — the side card switched panes under us,
    // which is what the live-site Browser tab did a few seconds after boot — the panel closes
    // rather than hanging at the top-left corner with nothing to anchor to (measured 05/09).
    const onMove = (): void => {
      if (anchor.current && !anchor.current.isConnected) {
        setOpen(false)
        return
      }
      place()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      release()
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place, id, button, keepSub])

  useEffect(() => keepSub, [keepSub])

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const box = panel.current
    if (!box) return
    if (moveAmongItems(box, event)) return
    // Tab leaves the menu without choosing a row. Focus steps back onto the menu button and the
    // press goes on, so the browser (or a dialog that walks Tab itself) continues from there.
    // Only from a row: a form inside a panel keeps its own Tab. Rows of a side panel count too:
    // their presses reach here through the portal.
    if (event.key === 'Tab' && (event.target as Element).matches(MENU_ITEM)) {
      button()?.focus()
      setOpen(false)
    }
  }

  const panelNode = (
    <div
      ref={panel}
      id={id}
      role="menu"
      data-side={placement?.side ?? 'bottom'}
      className={cn(
        scopeClass,
        'fixed z-[2147483000] max-h-[min(70vh,32rem)] min-w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md',
        // Hidden until placed, never absent: the panel has to be in the document to be measured.
        placement === null && 'pointer-events-none opacity-0',
        className
      )}
      style={{ top: placement?.top ?? 0, left: placement?.left ?? 0 }}
      onClick={() => {
        // Rows of a side panel click through here too: React bubbles through the portal.
        const active = document.activeElement
        returnFocus.current =
          active instanceof Element &&
          (panel.current?.contains(active) === true ||
            active.closest('[data-popover-of]')?.getAttribute('data-popover-of') === id)
        setOpen(false)
      }}
      onKeyDown={onPanelKeyDown}
      onPointerOver={(event) => {
        const target = event.target as Element
        // Into a side panel of this menu (React bubbles through its portal): it stays.
        if (target.closest('[data-popover-of]')?.getAttribute('data-popover-of') === id) {
          keepSub()
          return
        }
        // Resting on another row of this panel puts away the side panel that was open, after a
        // moment, so a diagonal way into the side panel may cross a row.
        const row = target.closest(MENU_ITEM)
        if (row === null || row.closest('[role="menu"]') !== panel.current) return
        // A submenu row decides for itself (its pointerenter opens it). React runs that enter before
        // this over in the same batch, so closing here would undo it (measured in Chrome 09/10).
        if (row.getAttribute('aria-haspopup') === 'menu') {
          keepSub()
          return
        }
        if (openSub === null || subClose.current !== null) return
        subClose.current = setTimeout(() => {
          subClose.current = null
          setOpenSub(null)
        }, SUBMENU_GRACE_MS)
      }}
    >
      <MenuFrameContext.Provider value={{ id, scopeClass, openSub, setOpenSub, panel }}>
        {typeof children === 'function' ? children({ close }) : children}
      </MenuFrameContext.Provider>
    </div>
  )

  return (
    <div ref={anchor} className={cn('relative', anchorClassName)}>
      {trigger({
        onClick: () => {
          focusOnOpen.current = 'first'
          setOpen((v) => !v)
        },
        onKeyDown: (event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          const edge = event.key === 'ArrowDown' ? 'first' : 'last'
          if (open) {
            focusEdge(panel.current, edge)
            return
          }
          focusOnOpen.current = edge
          setOpen(true)
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id
      })}
      {open && typeof document !== 'undefined' && createPortal(panelNode, document.body)}
    </div>
  )
}

/**
 * A row of a {@link Popover} that opens a second menu beside it (Appearance › Light / Dark /
 * System). ArrowRight, Enter, Space or a click open it on its first row; the pointer resting on the
 * row opens it too. ArrowLeft or Escape inside it go back to this row; choosing one of its rows
 * runs that row and closes the whole menu.
 *
 * The side panel is portalled like the menu (a panel inside the menu would be clipped by the
 * menu's own scroll) and placed beside the menu's edge, on the right when it fits, else the left;
 * where neither fits (a phone width) it opens under its row rather than over it.
 */
export function PopoverSubmenu({
  label,
  icon,
  itemId,
  children
}: {
  label: ReactNode
  /** Stable name of the row for tests and switches (`data-menu-item`); never shown. */
  itemId?: string
  /** A 16px mark left of the label, as on {@link PopoverItem}. */
  icon?: ReactNode
  /** The side panel's rows: {@link PopoverItem}s, radio rows (`selected`) for a choice. */
  children: ReactNode
}): JSX.Element {
  const frame = useContext(MenuFrameContext)
  if (frame === null) throw new Error('PopoverSubmenu must sit inside a Popover')
  const subId = useId()
  const row = useRef<HTMLButtonElement | null>(null)
  const side = useRef<HTMLDivElement | null>(null)
  const focusOnOpen = useRef(false)
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null)
  const open = frame.openSub === subId
  const { setOpenSub } = frame

  const show = (withFocus: boolean): void => {
    focusOnOpen.current = withFocus
    if (open) {
      if (withFocus) focusEdge(side.current, 'first')
      return
    }
    setOpenSub(subId)
  }
  const back = useCallback((): void => {
    row.current?.focus()
    setOpenSub(null)
  }, [setOpenSub])

  const place = useCallback(() => {
    const at = row.current
    const box = side.current
    const menu = frame.panel.current
    if (!at || !box || !menu) return
    const r = at.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const width = box.offsetWidth
    const height = box.offsetHeight
    const fitTop = (wanted: number): number =>
      Math.min(Math.max(wanted, MARGIN), Math.max(window.innerHeight - height - MARGIN, MARGIN))
    const right = m.right + GAP
    const left = m.left - width - GAP
    // Beside the menu, its first row level with this row (the panel's padding, 4px, and border,
    // 1px, sit above it): on the right when it fits, else on the left.
    if (right + width + MARGIN <= window.innerWidth) return setSpot({ top: fitTop(r.top - 5), left: right })
    if (left >= MARGIN) return setSpot({ top: fitTop(r.top - 5), left })
    // Neither side fits (a phone width, the menu as wide as the screen allows): a panel clamped
    // into the viewport would land over this very row. Under the row instead, or over it when
    // there is no room below, left-aligned with it and kept on screen.
    const below = r.bottom + GAP
    const top = below + height + MARGIN <= window.innerHeight ? below : fitTop(r.top - GAP - height)
    setSpot({
      top,
      left: Math.min(Math.max(r.left, MARGIN), Math.max(window.innerWidth - width - MARGIN, MARGIN))
    })
  }, [frame.panel])

  useLayoutEffect(() => {
    if (open) place()
    else setSpot(null)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    if (focusOnOpen.current) focusEdge(side.current, 'first')
    const release = holdEscape(back)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      release()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, back, place])

  return (
    <>
      <button
        ref={row}
        type="button"
        role="menuitem"
        data-menu-item={itemId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={subId}
        className={cn(ROW, 'cursor-pointer hover:bg-foreground/10', open && 'bg-foreground/10')}
        onClick={(event) => {
          // The menu closes on any click inside it; opening the side panel is not a choice.
          event.stopPropagation()
          show(true)
        }}
        onPointerEnter={() => show(false)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          show(true)
        }}
      >
        {icon !== undefined && <RowIcon>{icon}</RowIcon>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={side}
            id={subId}
            role="menu"
            data-popover-of={frame.id}
            className={cn(
              frame.scopeClass,
              'fixed z-[2147483001] min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md',
              spot === null && 'pointer-events-none opacity-0'
            )}
            style={{ top: spot?.top ?? 0, left: spot?.left ?? 0 }}
            onKeyDown={(event) => {
              const box = side.current
              if (!box) return
              if (moveAmongItems(box, event)) {
                event.stopPropagation()
                return
              }
              if (event.key === 'ArrowLeft' && itemsOf(box).includes(event.target as HTMLElement)) {
                event.preventDefault()
                event.stopPropagation()
                back()
              }
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

/** The classes every row shares, so a submenu row lines up with the plain rows around it. */
const ROW = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm'

/** The 16px column left of a row's label. */
function RowIcon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/** One row of a {@link Popover}. A disabled row keeps its place and says why, if given a hint. */
export function PopoverItem({
  children,
  onClick,
  disabled = false,
  danger = false,
  selected,
  hint,
  icon,
  end,
  itemId
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  /**
   * A choice among several (a filter): the chosen row shows a check mark in a column left of its
   * content, the same lucide Check the composer's role menu shows. Every other row keeps that column
   * empty so the labels line up. No tint and no bold: a tint is what hover paints, so a tinted choice
   * read as the hovered row (Akemi, 01/10).
   */
  selected?: boolean
  hint?: string
  /** A 16px mark in a column left of the label; rows of one menu either all have one or none do. */
  icon?: ReactNode
  /** Anything pinned to the right edge (a shortcut, a stack of marks, a chevron); after `hint`. */
  end?: ReactNode
  /** Stable name of the row for tests and switches (`data-menu-item`); never shown. */
  itemId?: string
}): JSX.Element {
  return (
    <button
      type="button"
      data-menu-item={itemId}
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        ROW,
        // Tinted with the text colour, not bg-accent: in dark the menu's own surface IS bg-accent
        // (oklch 0.269), so that hover painted the menu's colour on itself and no row answered the
        // pointer (Akemi, 29/09, the My Sites "…" menu).
        disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-foreground/10',
        danger && !disabled && 'text-destructive hover:bg-destructive/10'
      )}
    >
      {selected !== undefined && (
        <Check className={cn('size-3.5 shrink-0', !selected && 'invisible')} aria-hidden="true" />
      )}
      {icon !== undefined && <RowIcon>{icon}</RowIcon>}
      {children}
      {hint !== undefined && <span className="ml-auto text-muted-foreground text-xs">{hint}</span>}
      {end !== undefined && (
        <span className={cn('flex shrink-0 items-center', hint === undefined && 'ml-auto')}>{end}</span>
      )}
    </button>
  )
}

/** A heading over a group of rows. */
export function PopoverLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-2 py-1.5 text-muted-foreground text-xs">{children}</div>
}

/** A hairline between groups. */
export function PopoverSeparator(): JSX.Element {
  return <div className="-mx-1 my-1 h-px bg-border" />
}
