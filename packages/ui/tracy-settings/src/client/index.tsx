/**
 * Tracy's settings surface: one full-shell page carrying every registered section.
 *
 * WHAT THIS REPLACES, AND WHY IT IS A REPLACEMENT RATHER THAN A RESTYLE.
 * `@deepseek-ai/dsh-client-ui-sidebar` declares `sidebar.settings` as `kind: 'single'`, so the
 * slot admits exactly one occupant. dsh fills it with `ui-settings-general`'s `SettingsRoot`,
 * a centered `role="dialog"` panel. There is no styling hook that turns that into a page — the
 * chrome IS the component. So this plugin takes the seat instead, and `cordis.patch.yml`
 * disables `ui-settings-general` in the same breath. Leaving both enabled means two occupants
 * of a single-occupancy slot and a settings screen that differs between boots.
 *
 * WHAT IS NOT LOST BY REPLACING IT. `SettingsRoot` owned only chrome and viewing state. Every
 * actual section — models, plugin inventory, agent presets — registers into `settings.section`,
 * a `kind: 'list'` CHILD slot. Children belong to whoever declares them, so this root declares
 * the same six names and the same kinds, and those registrants keep arriving untouched. Rename
 * one and its contributors vanish with no error: the ledger simply has nobody listening on the
 * old name. That is the three-place identity trap in a different costume.
 *
 * WHAT IS STILL MISSING, SAID OUT LOUD. dsh's client has no router — no pushState, no hash, no
 * react-router anywhere under `packages/client/`. The screenshot this was modelled on
 * (`cowork.tracy.ai/settings/account`) gets its URL from the tracy-infra SPA, which is a
 * different application. Here the active section is component state, so it survives no reload
 * and appears in no address bar. Adding routing is a dsh-wide change, not a setting.
 *
 * The onboarding coordinator is deliberately absent. `settings.onboarding` is re-declared so
 * registrants still bind, but this root does not mount steps; dsh's version drives them off a
 * sessions-derived "blank workspace" fact. Porting that belongs with a reason to have it.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX
} from 'react'
import {
  Bell,
  Cable,
  Globe,
  LifeBuoy,
  Settings as GearGlyph,
  SlidersHorizontal,
  User,
  X,
  type LucideIcon
} from 'lucide-react'
import { ScrollArea } from '@tracy/ui'
import { uiSwitches } from '@tracy/core/ui-switches'
import {
  AccountMenu,
  AppearanceRow,
  MENU_ITEM_SLOT,
  type MenuItemProps,
  SettingsRow,
  type ShortcutKeys,
  type ThemeFace
} from './account-menu'
import { useViewer } from '@tracy/core/seat/viewer'
import { createUpdateSource, desktopBridge, type UpdateSource } from './desktop-updates'
import { HELP_SECTION_ID, HelpAboutSection } from './help-about-section'
import { helpBadgeKey } from './help-about-model'
import { clearStaleLanguageCookie } from './language-cookie'
import { LanguageRow, languageFace } from './language-row'
import { NOTIFICATIONS_SECTION_ID, NotificationsSection } from './notifications-section'
import { CONNECTED_APPS_SECTION_ID, ConnectedAppsSection } from './connected-apps-section'
import {
  createSectionRequests,
  type SectionRequests,
  type SettingsLink,
  takeSettingsLink
} from './settings-link'
import { en, NS } from './strings'
import { type SessionsLike, startTurnWatch, turnNotifications } from './turn-watch'
import { siteKeyHere } from '@tracy/core/site-key'
import { CSS, TAILWIND } from './styles'

/** The shortcut registry's id for "open Settings" (dsh's own id, so a rebinding carries over). */
const SETTINGS_OPEN = 'settings.open'

/**
 * Nav groups, in display order. A section lands in a group by its own `group` option. `help` has no
 * heading: it closes the column with Help & about alone, after a gap (mock-up `pa-b.html`).
 */
const GROUPS: readonly { id: string; label: string | null }[] = [
  { id: 'user', label: 'group.user' },
  { id: 'workspace', label: 'group.workspace' },
  { id: 'preferences', label: 'group.preferences' },
  { id: 'help', label: null }
]

/**
 * Sections the nav does not show, even though they sit in the ledger.
 *
 * `dsh-passwords` (the "Password Gate" card) is the seat door's own account system: lane
 * subusers named `s<hash>`, a "Sign out" that only drops the lane cookie, patch reload and
 * self-update controls that the fleet runs from outside. Every one of those is either an
 * operator's tool or a second, confusing answer to "who am I signed in as" — 03/09: two user
 * systems on screen, and a sign-out that is not a sign-out. The Tracy account section answers
 * that question from the seat book, and its sign-out goes through the Worker. Hiding the row is
 * a nav decision, not a capability change: the card still registers, and an operator reaches it
 * by other means if they must.
 */
const HIDDEN_SECTIONS: ReadonlySet<string> = new Set(['dsh-passwords'])

/**
 * One icon per nav item (02/10/2026). Keyed by section id; a section Tracy does not know
 * yet gets the neutral sliders glyph rather than nothing, so the column stays aligned.
 */
const SECTION_ICONS: Readonly<Record<string, LucideIcon>> = {
  general: GearGlyph,
  'tracy-account': User,
  [NOTIFICATIONS_SECTION_ID]: Bell,
  [CONNECTED_APPS_SECTION_ID]: Cable,
  'tracy-site': Globe,
  [HELP_SECTION_ID]: LifeBuoy
}

/**
 * Nav group by section id, for sections this plugin places itself. Needed because dsh's slot runtime
 * keeps only `key`, `id`, `order`, `label` and `priority` of a registration
 * (vendor/tracy/deepseek-harness/packages/client/ui-slots/src/index.ts, `StoredEntry`): a `group`
 * passed at register time never reaches this projection.
 */
const SECTION_GROUPS: Readonly<Record<string, string>> = {
  [HELP_SECTION_ID]: 'help'
}

/**
 * Resolve a slot label, which may be a plain string or a function.
 *
 * Inlined from `resolveSlotLabel` in `@deepseek-ai/dsh-client-ui-slots` rather than imported:
 * it is two lines with no state, and importing it would add another module id that has to match
 * the externals list of the client bundle exactly.
 *
 * 🔒 Registrants pass a FUNCTION on purpose — `label: () => t('nav')` in the gallery. The shell
 * does not track locale; it re-reads labels when the ledger moves. Reading `options.label` as a
 * string therefore yields `undefined` for every well-behaved registrant.
 *
 * The first version of this file called `ctx.locale.resolve(...)`, an API that does not exist
 * (`locale` has getSnapshot/subscribe/register/bind). The projection threw, the framework
 * swallowed it into an empty list, and the page said "No settings sections are registered"
 * while `ctx.slots.entries('settings.section')` was returning 4.
 * @param label - the registered label.
 * @returns the resolved text, or undefined when unset.
 */
function resolveSlotLabel(label: unknown): string | undefined {
  return typeof label === 'function' ? (label as () => string)() : (label as string | undefined)
}

/**
 * The section a `?settings=<name>` address asked for (`settings-link.ts`), read and stripped once
 * in `apply()`, then spent by the first root that mounts: it opens Settings on that section, and
 * hands its `vendor` (if any) to that section as a prop.
 */
let askedSection: SettingsLink | null = null

/** One entry of the `settings.section` ledger, projected for the nav. */
interface SectionRow {
  readonly id: string
  readonly order: number
  readonly label: string
  readonly group: string
  /** A dot beside the label, with these words for a screen reader; null for none. */
  readonly badge?: string | null
}

/**
 * Where a nav row's dot comes from: words for a screen reader while it shows, null otherwise. Held
 * by this plugin per section id, not passed as a registration option, which dsh would drop (see
 * `SECTION_GROUPS`). A section of another plugin can get one only once dsh keeps extra options.
 */
export interface BadgeSource {
  getSnapshot(): string | null
  subscribe(listener: () => void): () => void
}

/**
 * The nav's live list of sections: the `settings.section` ledger, minus what an operator switched
 * off at /ops › User Interface, with labels in the current language and each row's badge.
 *
 * It follows four things: the ledger, the locale (labels are localized strings), the switches (the
 * door answers after apply() ran) and every badge source — so a dot appears while Settings shows
 * another section (council 09/10 §2.4.7). The snapshot is the same array until something shown
 * changes, as `useSyncExternalStore` needs.
 * @param ctx - client root context (slots, locale).
 * @param ui - the operator's switches (`uiSwitches()`).
 * @param badges - the dot of each section that has one, by section id.
 */
export function createSectionsProjection(
  ctx: any,
  ui: { keepShown(ids: string[]): string[]; subscribe(listener: () => void): () => void },
  badges: ReadonlyMap<string, BadgeSource> = new Map()
): { getSnapshot(): readonly SectionRow[]; subscribe(listener: () => void): () => void } {
  let rows: readonly SectionRow[] = []
  let key = ''
  return {
    getSnapshot() {
      const entries = ctx.slots.entries('settings.section')
      const kept = new Set(ui.keepShown(entries.map((entry: any) => entry.options.id ?? '')))
      const next = entries
        .filter((entry: any) => kept.has(entry.options.id ?? ''))
        .map(
          (entry: any): SectionRow => ({
            id: entry.options.id ?? '',
            order: entry.options.order ?? 0,
            label: resolveSlotLabel(entry.options.label) ?? entry.options.id ?? '',
            group: entry.options.group ?? SECTION_GROUPS[entry.options.id ?? ''] ?? '',
            badge: badges.get(entry.options.id ?? '')?.getSnapshot() ?? null
          })
        )
        .sort((a: SectionRow, b: SectionRow) => a.order - b.order)
      const nextKey = JSON.stringify(next)
      if (nextKey !== key) {
        key = nextKey
        rows = next
      }
      return rows
    },
    subscribe(listener) {
      const offs = [
        ctx.slots.subscribe('settings.section', listener),
        ctx.locale.subscribe(listener),
        ui.subscribe(listener),
        ...[...badges.values()].map((source) => source.subscribe(listener))
      ]
      return () => {
        for (const off of offs) off()
      }
    }
  }
}

interface RootProps {
  /** False when the sidebar is collapsed to its 56px rail. */
  readonly wide: boolean
  /** Localized lookup, injected because the registration carries `locale: NS`. */
  readonly t: (key: string) => string
  /** Render a declared child slot. */
  readonly renderSlot: (
    name: string,
    owner: Record<string, unknown>,
    options?: { only?: string }
  ) => React.ReactNode
  /** Live projection of the `settings.section` ledger. */
  readonly useSections: <T>(select: (rows: readonly SectionRow[]) => T) => T
  /**
   * The `settings.open` command of dsh's shortcut registry, bound to this root while it is mounted:
   * returns the disposer. Absent in a test that mounts the root without dsh.
   */
  readonly settingsShortcut?: { register(open: () => void): () => void }
  /**
   * Requests to open Settings on a section while the page runs (the desktop app's "open Help &
   * about"). Absent in a test that mounts the root without them.
   */
  readonly sectionRequests?: SectionRequests
}

/**
 * Inject the stylesheet once per document.
 *
 * Keyed by id rather than a module-level boolean: the plugin can be disposed and re-applied
 * (locale change, HMR) and a boolean would then claim the sheet is present after the node it
 * described was removed.
 */
function useStylesheet(): void {
  useEffect(() => {
    const id = 'tracy-settings-css'
    if (document.getElementById(id) !== null) return
    const style = document.createElement('style')
    style.id = id
    // Tailwind first, hand-written rules after: source order decides when specificity ties.
    style.textContent = `${TAILWIND}\n${CSS}`
    document.head.append(style)
  }, [])
}

/** What a keyboard can land on, before the checks a selector cannot make (`tabStops` below). */
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]'

/**
 * Whether CSS leaves `el` on screen: no `display: none` on it or on anything up to `root`, and a
 * computed `visibility` of `visible` (that one inherits, so the element's own value is the answer).
 * @param root - the dialog surface.
 * @param el - a control inside it.
 * @returns false when a stylesheet or inline style hides the control.
 */
function shown(root: HTMLElement, el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView
  if (view === null) return true
  if (view.getComputedStyle(el).visibility !== 'visible') return false
  for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return false
    if (node === root) break
  }
  return true
}

/**
 * The radio group `el` belongs to, as a key: Tab treats a named group within one form as a single
 * stop. Anything else, a nameless radio included, is its own stop and has no key.
 * @param el - a control.
 * @returns a key shared by the radios of one group, or null.
 */
function radioGroup(el: HTMLElement): { form: HTMLFormElement | null; name: string } | null {
  if (!el.matches('input[type="radio"][name]')) return null
  const radio = el as HTMLInputElement
  return radio.name === '' ? null : { form: radio.form, name: radio.name }
}

/**
 * The controls Tab reaches inside `root`, in the order the browser visits them: positive `tabindex`
 * values first, ascending, then everything else in document order. Left out: what is disabled as
 * the browser sees it (`:disabled`, which knows a disabled fieldset and its first legend), what is
 * hidden by attribute or by CSS, and every radio of a group but one (the checked one; with none
 * checked, the first, in both directions, as measured in Chrome).
 * @param root - the dialog surface.
 * @returns the stops, and for each radio left out the stop that stands for its group.
 */
function tabStops(root: HTMLElement): { stops: HTMLElement[]; standIn: Map<HTMLElement, HTMLElement> } {
  const reachable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled, input[type="hidden"]') &&
      el.closest('[hidden], [inert]') === null &&
      shown(root, el)
  )
  const groups: { form: HTMLFormElement | null; name: string; radios: HTMLInputElement[] }[] = []
  for (const el of reachable) {
    const key = radioGroup(el)
    if (key === null) continue
    const group = groups.find((g) => g.form === key.form && g.name === key.name)
    if (group === undefined) groups.push({ ...key, radios: [el as HTMLInputElement] })
    else group.radios.push(el as HTMLInputElement)
  }
  const standIn = new Map<HTMLElement, HTMLElement>()
  for (const { radios } of groups) {
    const stop = radios.find((radio) => radio.checked) ?? radios[0]
    for (const radio of radios) if (radio !== stop) standIn.set(radio, stop)
  }
  const stops = reachable.filter((el) => !standIn.has(el))
  // Array.prototype.sort is stable: equal tabindex values keep document order.
  const rank = (el: HTMLElement): number => (el.tabIndex > 0 ? el.tabIndex : Number.POSITIVE_INFINITY)
  stops.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1))
  return { stops, standIn }
}

/**
 * Where Tab continues from when focus sits in a menu portalled out of the dialog: the button inside
 * the dialog that owns that menu (`aria-controls`), or nothing when the menu is not the dialog's.
 * @param root - the dialog surface.
 * @param active - the element holding focus, outside `root`.
 * @returns the owning button, or null.
 */
function menuOwner(root: HTMLElement, active: Element): HTMLElement | null {
  const menu = active.closest('[role="menu"]')
  if (menu === null || menu.id === '') return null
  for (const candidate of root.querySelectorAll<HTMLElement>('[aria-controls]')) {
    if (candidate.getAttribute('aria-controls') === menu.id) return candidate
  }
  return null
}

/**
 * Where in `stops` a Tab press starts looking, given what holds focus.
 * @param stops - the dialog's stops, in tab order.
 * @param from - where focus stands (inside the dialog), or null for nowhere.
 * @param back - true for Shift+Tab.
 * @returns the index of the first stop to try.
 */
function firstToTry(stops: readonly HTMLElement[], from: Element | null, back: boolean): number {
  const wrap = back ? stops.length - 1 : 0
  if (from === null) return wrap
  const at = stops.indexOf(from as HTMLElement)
  if (at !== -1) return (at + (back ? stops.length - 1 : 1)) % stops.length
  // Focus stands on something that is not a stop (`tabindex="-1"`, a plain container): the browser
  // goes on from its place in the document, among the stops that are in document order.
  const follows = (el: HTMLElement): boolean =>
    (from.compareDocumentPosition(el) & from.DOCUMENT_POSITION_FOLLOWING) !== 0
  const precedes = (el: HTMLElement): boolean =>
    (from.compareDocumentPosition(el) & from.DOCUMENT_POSITION_PRECEDING) !== 0
  const ordered = stops.findIndex((el) => el.tabIndex === 0)
  if (ordered === -1) return wrap
  if (!back) {
    const next = stops.findIndex((el, index) => index >= ordered && follows(el))
    return next === -1 ? wrap : next
  }
  for (let index = stops.length - 1; index >= ordered; index--) if (precedes(stops[index])) return index
  // Nothing before it in document order: the positive-tabindex stops come before those, else wrap.
  return ordered > 0 ? ordered - 1 : wrap
}

/**
 * Keep Tab and Shift+Tab inside the dialog by taking every press: the dialog, not the browser,
 * moves focus to the next stop, so no press can land outside it, whatever the sections hold. An
 * earlier version left a press "between two controls" to the browser and judged that from its own
 * list of stops; wherever that list and the browser's tab order disagreed, focus left the dialog
 * (#807). Here a disagreement can only pick another control inside it, and a stop that turns down
 * focus (the browser's final say on what is focusable) is passed over for the next one.
 * @param root - the dialog surface.
 * @param event - the Tab press.
 */
function keepTabInside(root: HTMLElement, event: KeyboardEvent): void {
  event.preventDefault()
  const back = event.shiftKey
  const { stops, standIn } = tabStops(root)
  if (stops.length === 0) return
  const active = document.activeElement
  const inside = active !== null && root.contains(active)
  const held = inside ? active : active === null ? null : menuOwner(root, active)
  const from = held === null ? null : (standIn.get(held as HTMLElement) ?? held)
  const step = back ? stops.length - 1 : 1
  let index = firstToTry(stops, from, back)
  for (let tried = 0; tried < stops.length; tried++, index = (index + step) % stops.length) {
    const stop = stops[index]
    stop.focus()
    if (document.activeElement !== stop) continue
    // What the browser does when Tab lands in a text field: its text is selected.
    if (stop.matches('input, textarea')) (stop as HTMLInputElement).select()
    return
  }
}

/**
 * The settings page: nav column plus the active section.
 * @param props - shell composition face.
 * @returns the full-surface settings element tree.
 */
export function SettingsPage({
  t,
  renderSlot,
  rows,
  activeId,
  onSelect,
  onClose,
  opener,
  asked
}: {
  t: RootProps['t']
  renderSlot: RootProps['renderSlot']
  rows: readonly SectionRow[]
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
  /** What opened the dialog, to hand focus back to; without it, whatever held focus at that moment. */
  opener?: HTMLElement | null
  /** The address's ask: its section gets `vendor` as a prop (the row to bring into view). */
  asked?: SettingsLink | null
}) {
  const titleId = useId()
  const surface = useRef<HTMLDivElement | null>(null)
  // Entries can unmount underneath the requested id, so fall back at render time rather than
  // trusting state that was valid when it was set.
  const active = rows.some((r) => r.id === activeId) ? activeId : rows[0]?.id
  const activeLabel = rows.find((r) => r.id === active)?.label ?? ''

  // `aria-modal` is a promise about focus (#807): it moves in when the dialog opens, onto the open
  // section's nav item (the close button when there is none), and goes back to the opener on close.
  // The opener is read once, at open; one that has left the page by then is not focused.
  const openerAtOpen = useRef(opener)
  useEffect(() => {
    const root = surface.current
    const active = document.activeElement
    const back =
      openerAtOpen.current ?? (active instanceof HTMLElement && active !== document.body ? active : null)
    const first =
      root?.querySelector<HTMLElement>('.ts-nav[aria-current="page"]') ??
      root?.querySelector<HTMLElement>('.ts-close')
    first?.focus()
    return () => {
      if (back?.isConnected === true) back.focus()
    }
  }, [])

  // On a phone the nav is a strip of tabs that scrolls sideways (styles.ts, max-width 640px); focus
  // alone left the open one cut off at the strip's edge (measured 10/10/2026), so bring it in.
  useEffect(() => {
    surface.current
      ?.querySelector<HTMLElement>('.ts-nav[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // A press an inner layer already took (an open menu closes on Escape first) is not ours.
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab' && surface.current !== null) {
        keepTabInside(surface.current, event)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        // Sections that name no group land in `workspace`: that is where dsh's own sections
        // (models, plugins) belong, and they are the ones that will never set the field.
        rows: rows.filter(
          (r) => !HIDDEN_SECTIONS.has(r.id) && (r.group === '' ? 'workspace' : r.group) === group.id
        )
      })).filter((g) => g.rows.length > 0),
    [rows]
  )

  return (
    /*
      Three layers, exactly as dsh's own dialog builds them: a centring overlay, a mask that blurs the
      background, the panel in the middle. Measurements come from `ui-settings-general`'s
      `SettingsRoot.module.css` — see `styles.ts`. The first version was a full-screen page; rejected on
      01/09, because opening Settings from inside dsh and being taken elsewhere moves the user rather than opening a drawer.
    */
    <div className="ts-overlay">
      <div className="ts-mask" />
      <div
        ref={surface}
        className="ts-surface flex min-w-0 bg-background text-foreground"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // dsh's shortcut registry names the open modal by this: `settings.open` runs over it (and
        // keeps it open) where any other modal blocks it.
        data-shortcut-modal="settings"
      >
        <div className="ts-side flex w-[196px] flex-none flex-col border-border border-r bg-sidebar">
          <div className="px-4 pt-3.5 pb-1.5 font-semibold text-sm" id={titleId}>
            {renderSlot('settings.header', {})}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <nav className="ts-navlist flex flex-col gap-0.5 px-2 pb-4">
              {grouped.length === 0 && (
                <p className="px-2 py-3 text-muted-foreground text-xs">{t('empty.none')}</p>
              )}
              {grouped.map((group) => (
                <div
                  key={group.id}
                  className={group.label === null ? 'ts-nav-tail' : 'flex flex-col gap-0.5'}
                >
                  {group.label !== null && (
                    <p className="ts-nav-group m-0 px-2 pt-2.5 pb-1 text-[11px] text-muted-foreground">
                      {t(group.label)}
                    </p>
                  )}
                  {group.rows.map((row) => {
                    const Icon = SECTION_ICONS[row.id] ?? SlidersHorizontal
                    return (
                      /* bg-transparent is not redundant: this bundle ships no preflight (a global
                         reset would leak into dsh's own screens), so dsh's button rules would
                         otherwise paint a grey face on a nav item. */
                      <button
                        key={row.id}
                        type="button"
                        className="ts-nav"
                        aria-current={row.id === active ? 'page' : undefined}
                        onClick={() => {
                          onSelect(row.id)
                        }}
                      >
                        <Icon className="ts-nav-icon" aria-hidden="true" />
                        <span className="truncate">{row.label}</span>
                        {row.badge ? (
                          <span className="ts-nav-badge">
                            <span className="ts-sr">{row.badge}</span>
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>
          </ScrollArea>
        </div>
        <div className="ts-main flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="ts-head flex flex-none items-center justify-between gap-3 pt-3 pr-3 pl-[22px]">
            <h2 className="ts-page-title">{activeLabel}</h2>
            <div className="flex items-center gap-2">
              {renderSlot('settings.action', {})}
              {/* A 26px ghost icon button; the label stays for screen readers, and the
                  settings.close slot still supplies it. */}
              <button type="button" className="ts-close" onClick={onClose} aria-label={t('action.close')}>
                <X aria-hidden="true" />
                <span className="sr-only">{renderSlot('settings.close', {})}</span>
              </button>
            </div>
          </div>
          <div className="ts-content min-h-0 flex-1 overflow-auto px-[22px] pt-1 pb-6">
            {active === undefined ? (
              <p className="text-muted-foreground text-xs">{t('empty.hint')}</p>
            ) : (
              renderSlot(
                'settings.section',
                asked?.vendor && asked.section === active
                  ? { close: onClose, vendor: asked.vendor }
                  : { close: onClose },
                { only: active }
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Whether the operator left `id` on (`/ops` › User Interface), live. */
function useShown(id: string): boolean {
  const ui = uiSwitches()
  return useSyncExternalStore(ui.subscribe, () => ui.isShown(id))
}

/**
 * Slot occupant for `sidebar.settings`: the account menu at the foot of the column, and the
 * Settings dialog while open.
 * @param props - shell composition face.
 * @returns the person's face (the menu's button), plus the settings surface when open.
 */
export function TracySettingsRoot(props: RootProps) {
  const { wide, t, renderSlot, useSections, settingsShortcut, sectionRequests } = props
  // An email's "Manage notifications" opens Settings on its section. The section may register
  // after this root mounts; SettingsPage shows the first row until it does, then switches.
  const [asked] = useState(() => {
    const id = askedSection
    askedSection = null
    return id
  })
  const [open, setOpen] = useState(asked !== null)
  const [activeId, setActiveId] = useState<string | undefined>(asked?.section)
  // The vendor is for the first opening only: once Settings closes, it is spent.
  const [askedOnce, setAskedOnce] = useState(asked)
  const opener = useRef<HTMLElement | null>(null)
  const viewer = useViewer()
  const accountShown = useShown('tracy-account')
  useStylesheet()

  const rows = useSections((rows) => rows)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  /**
   * Open Settings on `sectionId`. A section that is not on the nav (switched off, hidden, not
   * registered) opens Settings on its default instead of a page nobody can reach from the nav.
   */
  const openAt = useCallback((sectionId: string, from: HTMLElement | null) => {
    const reachable = !HIDDEN_SECTIONS.has(sectionId) && rowsRef.current.some((row) => row.id === sectionId)
    opener.current = from
    setActiveId(reachable ? sectionId : undefined)
    setOpen(true)
  }, [])

  // The desktop app asks for a section (Help & about): Settings opens there, or moves there if open.
  // Like an address's `?settings=`, the id is kept even before the section registers (an app opened
  // from a notification): SettingsPage shows the first row until it does, then switches.
  useEffect(
    () =>
      sectionRequests?.register((sectionId) => {
        opener.current = null
        setActiveId(sectionId)
        setOpen(true)
      }),
    [sectionRequests]
  )

  // The shortcut opens Settings where it was last left at its default; pressed again while Settings
  // is open, it keeps it open (it is not a toggle: Escape and the close button close).
  useEffect(
    () =>
      settingsShortcut?.register(() => {
        setOpen((already) => {
          if (!already) opener.current = null
          return true
        })
      }),
    [settingsShortcut]
  )

  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
    setAskedOnce(null)
  }, [])

  return (
    <>
      <AccountMenu
        viewer={viewer}
        wide={wide}
        t={t}
        accountShown={accountShown}
        renderItems={(item: MenuItemProps) => renderSlot(MENU_ITEM_SLOT, { ...item })}
        onOpenSettings={openAt}
      />
      {open && (
        <SettingsPage
          t={t}
          renderSlot={renderSlot}
          rows={rows}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
          opener={opener.current}
          asked={askedOnce}
        />
      )}
    </>
  )
}

/**
 * Services read off the context. Every name here is read somewhere below, and every name read
 * below is here — cordis throws the moment a property outside `inject` is READ, so a missing
 * entry is not a warning, it is the whole plugin failing to load while dsh quietly draws its
 * own surface instead.
 */
/**
 * Settings › General, one row at a time so an operator's switches can drop a row by its
 * registration id (`language`, `transcript-view`, …). The rows carry no id in the DOM, so this is
 * the only place a row can be named; the `:first-child` CSS that used to hide the Permission row
 * by position hid Language instead once `ui-permission` was turned off (24/09).
 */
function GeneralRows({ ctx, renderSlot }: { ctx: any; renderSlot: RootProps['renderSlot'] }): JSX.Element {
  const ui = uiSwitches()
  const key = useSyncExternalStore(
    (listener) => {
      const offLedger = ctx.slots.subscribe('settings.general.item', listener)
      const offUi = ui.subscribe(listener)
      return () => {
        offLedger()
        offUi()
      }
    },
    () =>
      ui
        .keepShown(
          ctx.slots
            .entries('settings.general.item')
            .slice()
            .sort((a: any, b: any) => (a.options.order ?? 0) - (b.options.order ?? 0))
            .map((entry: any) => entry.options.id ?? '')
        )
        .join('\n')
  )
  // The ledger lists every registration, shadowed ones included (same id, lower priority); the
  // renderer picks one winner per id, so an id is rendered once however often it is listed.
  const ids = key === '' ? [] : [...new Set(key.split('\n'))]
  return (
    <div className="ts-general">
      {ids.map((id) => (
        <div key={id} className="ts-general-item">
          {renderSlot('settings.general.item', {}, { only: id })}
        </div>
      ))}
    </div>
  )
}

export const inject = ['slots', 'locale', 'theme', 'shortcuts']

/**
 * Register Tracy's settings surface into the single-occupancy sidebar seat.
 * @param ctx - client root context.
 */
export function apply(ctx: any): void {
  ctx.effect(() => ctx.locale?.register(NS, { en }), 'tracy-settings: dictionaries')
  if (typeof window !== 'undefined') askedSection = takeSettingsLink(window.location, window.history)

  // The desktop app's update state, read here at the plugin level rather than inside the section,
  // so the nav dot moves while another section is open (desktop-updates.ts). A browser has no bridge.
  const updates: UpdateSource = createUpdateSource(
    typeof window === 'undefined' ? null : desktopBridge(window)
  )
  ctx.effect(() => updates.start(), 'tracy-settings: desktop updates')
  // The app asks for Help & about (a notification, Help › What's New…; bridge protocol 3).
  const sectionRequests = createSectionRequests()
  ctx.effect(
    () => updates.onOpenHelp(() => sectionRequests.ask(HELP_SECTION_ID)),
    'tracy-settings: the app opens Help & about'
  )

  // The desktop app's "the agent finished" notification (turn-watch.ts): started here, once per page,
  // only in an app at bridge protocol 2. A nested activation, so Settings never waits on `sessions`.
  const notifyApp =
    typeof window === 'undefined' ? null : (window as { tracyDesktop?: { app?: unknown } }).tracyDesktop?.app
  if (turnNotifications(notifyApp) !== null) {
    ctx.inject?.(['sessions'], (scope: { sessions?: SessionsLike; effect?: typeof ctx.effect }) => {
      const sessions = scope.sessions
      if (sessions === undefined || typeof scope.effect !== 'function') return
      scope.effect(
        () =>
          startTurnWatch({
            app: notifyApp,
            sessions,
            title: siteKeyHere,
            words: (key) => ctx.locale.bind(NS)(key)
          }),
        'tracy-settings: notify when a turn ends'
      )
    })
  }
  const tHelp = (): ((key: string) => string) => ctx.locale.bind(NS)
  const badges = new Map<string, BadgeSource>([
    [
      HELP_SECTION_ID,
      {
        getSnapshot: () => {
          const key = helpBadgeKey(updates.getSnapshot()?.state)
          return key === null ? null : tHelp()(key)
        },
        subscribe: (listener) => updates.subscribe(listener)
      }
    ]
  ])

  // Live projection of the section ledger, in the shape the slot runtime turns into
  // `useSections` (createSectionsProjection says what it follows).
  const sections = createSectionsProjection(ctx, uiSwitches(), badges)
  const settingsShortcut = {
    register: (open: () => void): (() => void) =>
      ctx.shortcuts.register({
        id: SETTINGS_OPEN,
        label: () => ctx.locale.bind(NS)('shortcut.open'),
        aliases: ['settings', 'preferences'],
        // dsh's own Settings command (`ui-settings-general`, disabled in Tracy's bundles), same keys.
        defaults: {
          'desktop:macos': { code: 'Comma', modifiers: ['primary'] },
          'desktop:windows': { code: 'Comma', modifiers: ['primary'] },
          'desktop:linux': { code: 'Comma', modifiers: ['primary'] },
          'web:macos': { code: 'Comma', modifiers: ['primary', 'alt'] },
          'web:windows': { code: 'Comma', modifiers: ['primary', 'alt'] }
        },
        regions: ['page', 'editable', 'terminal'],
        modals: ['settings'],
        resolve: ({ modal }: { modal: string | null }) =>
          modal !== null && modal !== 'settings'
            ? { status: 'blocked', reason: 'modal' }
            : { status: 'handled', run: open }
      })
  }
  const injected = () => ({ settingsShortcut, sectionRequests, hooks: { sections } })

  // The six child names and their kinds are a CONTRACT with every other plugin. They are
  // copied from ui-settings-general deliberately: drop one and its registrants disappear with
  // no error, because nothing is listening on a name that no longer exists.
  ctx.slots.inject('sidebar.settings', () =>
    ctx.slots.register(
      {
        name: 'sidebar.settings',
        locale: NS,
        children: {
          'settings.trigger': { kind: 'single', scope: 'root' },
          'settings.header': { kind: 'single', scope: 'root' },
          'settings.action': { kind: 'list', scope: 'root' },
          'settings.close': { kind: 'single', scope: 'root' },
          'settings.section': { kind: 'list', scope: 'root' },
          'settings.onboarding': { kind: 'list', scope: 'root' },
          // Tracy's own: the rows of the account menu (account-menu.tsx has the contract). Spelled
          // out, not `[MENU_ITEM_SLOT]`: check-plugin-contracts reads this table as text.
          'settings.menu.item': { kind: 'list', scope: 'root' }
        },
        inject: injected
      },
      TracySettingsRoot
    )
  )

  // dsh's shell supplied the trigger and header text from ui-settings-general, which is now
  // disabled — so these two single-occupancy seats would otherwise render empty.
  ctx.slots.inject('settings.trigger', () =>
    ctx.slots.register({ name: 'settings.trigger', locale: NS }, ({ t }: { t: (key: string) => string }) => (
      <>{t('trigger.label')}</>
    ))
  )
  ctx.slots.inject('settings.header', () =>
    ctx.slots.register({ name: 'settings.header', locale: NS }, ({ t }: { t: (key: string) => string }) => (
      <>{t('page.title')}</>
    ))
  )
  /**
   * The `general` section, rebuilt because switching off `ui-settings-general` took it away too.
   *
   * That package does TWO things in one plugin: it holds the `sidebar.settings` seat, and registers the
   * `general` section that declares `settings.general.item` as a child slot. Switching it off to take
   * the shell seat also loses the section — and with it the landing spot of six registrants (`locale`,
   * `ui-theme`, `ui-chat`, `ui-conversation`, `ui-permission-presets`, `ui-agent-preset`). They still load
   * and still call `inject('settings.general.item')`, but nobody declares that name any more, so they go nowhere.
   *
   * `order: 0` keeps General at the top of the nav column, where upstream puts it.
   */
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'general',
        order: 0,
        label: () => ctx.locale.bind(NS)('general.nav'),
        locale: NS,
        children: { 'settings.general.item': { kind: 'list', scope: 'root' } }
      },
      ({ renderSlot }: { renderSlot: RootProps['renderSlot'] }) => (
        <GeneralRows ctx={ctx} renderSlot={renderSlot} />
      )
    )
  )

  // Settings › Notifications (spec #809): the person's Inbox and Email switches per group of kinds.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: NOTIFICATIONS_SECTION_ID,
        group: 'user',
        order: 22,
        label: () => ctx.locale.bind(NS)('notifications.nav'),
        locale: NS
      },
      NotificationsSection
    )
  )

  // Settings › Connected apps: apps connected to the whole account through "Connect Tracy".
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: CONNECTED_APPS_SECTION_ID,
        group: 'user',
        order: 24,
        label: () => ctx.locale.bind(NS)('connectedApps.nav'),
        locale: NS
      },
      ConnectedAppsSection
    )
  )

  // Settings › Help & about: the build, the desktop app's updates, the links to tracy.ai and the
  // community (tasks/todo-desktop-help-about.md), and the rows other plugins add. Last in the nav,
  // in its own heading-less group (SECTION_GROUPS), with its dot from `badges` above.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: HELP_SECTION_ID,
        order: 1000,
        label: () => tHelp()('help.nav'),
        locale: NS,
        // Rows other plugins add after the update rows (Getting started, @tracy/dsh-onboard); the
        // contract is HelpItemProps in @tracy/core/site-tabs. Spelled out: check-plugin-contracts
        // reads this table as text.
        children: { 'settings.help.item': { kind: 'list', scope: 'root' } },
        inject: () => ({ updates })
      },
      HelpAboutSection
    )
  )

  // dsh's Language row (dsh-client-locale, list id `language`, order 0, priority 0) is shadowed at
  // priority -1 by Tracy's compact row; lowest priority renders. Same service, same stored value.
  // An explicit pick is also remembered for the pages tracy-web serves outside dsh (#753).
  const language = languageFace({
    getSnapshot: () => ctx.locale.getSnapshot(),
    subscribe: (listener) => ctx.locale.subscribe(listener),
    setLocale: (id) => ctx.locale.setLocale(id),
    clearPreference: () => ctx.locale.clearPreference()
  })
  // While the language follows the device, a cookie left by an older pick is deleted, so the
  // sign-in pages follow the device too (04/10/2026). Customer pages are never loopback, so
  // the snapshot read here is the stored choice, not a provisional browser value.
  ctx.effect(() => {
    if (!ctx.locale) return
    const heal = (): void => clearStaleLanguageCookie(ctx.locale.getSnapshot().preference)
    heal()
    return ctx.locale.subscribe(heal)
  }, 'tracy-settings: stale language cookie')
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'language',
        order: 0,
        priority: -1,
        locale: NS,
        inject: () => ({ language })
      },
      LanguageRow
    )
  )

  // The account menu's own rows. AI accounts (20, tracy-model-plan) and Community (50,
  // tracy-sidebar) register into the same slot from their plugins.
  let catalog: unknown = null
  let keys: readonly string[] = []
  const shortcut: ShortcutKeys = {
    getSnapshot: () => {
      const next = ctx.shortcuts.catalog.getSnapshot()
      if (next !== catalog) {
        catalog = next
        keys = next.find((entry: any) => entry.id === SETTINGS_OPEN)?.keys ?? []
      }
      return keys
    },
    subscribe: (listener) => ctx.shortcuts.catalog.subscribe(listener)
  }
  ctx.slots.inject(MENU_ITEM_SLOT, () =>
    ctx.slots.register(
      { name: MENU_ITEM_SLOT, id: 'settings', order: 30, locale: NS, inject: () => ({ shortcut }) },
      SettingsRow
    )
  )
  const theme: ThemeFace = {
    getPreference: () => ctx.theme.getTheme().preference,
    subscribe: (listener) => ctx.on('theme/change', listener),
    setPreference: (id) => ctx.theme.setTheme(id)
  }
  ctx.slots.inject(MENU_ITEM_SLOT, () =>
    ctx.slots.register(
      { name: MENU_ITEM_SLOT, id: 'appearance', order: 40, locale: NS, inject: () => ({ theme }) },
      AppearanceRow
    )
  )

  ctx.slots.inject('settings.close', () =>
    ctx.slots.register({ name: 'settings.close', locale: NS }, ({ t }: { t: (key: string) => string }) => (
      <>{t('action.close')}</>
    ))
  )
}
