/**
 * `@tracy/dsh-mode-picker` — Tracy's Mode+Platform picker. Replaces dsh's default agent-preset
 * hero chip on the new-session screen with TWO separate pickers (Storybook mockup Option B, chosen
 * 03/09 over Option C's single grouped dropdown): a Mode pill and a Platform pill, each its
 * own dropdown, each closing on select — the ordinary single-dropdown behaviour, not Option C's
 * "stays open to compare both axes" one. Right-aligned in the hero row by this component's own
 * root, which grows into the room the workspace chip leaves and packs the pills to its right edge —
 * `conversation.hero` is a flex row and this is its last declared child, so nothing in dsh's layout
 * changes. When that room cannot hold the labels, the pills show icons only (`fit.mjs`).
 *
 * Takes the single `conversation.hero.agentPreset` slot the way `@tracy/dsh-sidebar` took
 * `sidebar`: dsh's own occupant, `@deepseek-ai/dsh-client-ui-agent-preset` (row id
 * `ui-agent-preset`), is DISABLED in the bundle. That package also carries two OTHER surfaces —
 * the session-header preset label (`conversation.session.header.actions`) and the Settings
 * "Agent Presets" management page (`settings.section` id `agent-presets`) — cordis disables a
 * whole plugin row, not one registration inside it, so both go dark as a side effect. Neither is
 * rebuilt here: the header label is a small secondary surface nobody has asked for, and the
 * management page (copy/delete/set-default) is for user-authored presets — Tracy's twelve are
 * `trust: system`, not authorable, so that page had nothing to manage for them anyway.
 *
 * DATA: the roster and the select RPC are dsh's own (`ctx.remote.agentPresets.list/select`) —
 * same wire contract the stock chip used, ported by reading its bundled client.js (the surface
 * is closed-source but the browser has to run it, so the shape is observable). Preset ids are
 * `<role>-<platform>` (`designer-wordpress`), and every platform variant of a role carries the
 * SAME description (`config/mode-matrix.json`'s `roles[].hint`, baked in by
 * `scripts/gen-presets.ts`) — so a role's hint text is read off any one of its three roster
 * entries rather than duplicated here.
 *
 * The Platform dropdown's "adds N tool · M skill" line is real, not invented: `__PLATFORM_COUNTS__`
 * is computed from `config/mode-matrix.json` (the SAME source `gen-presets.ts` reads) by
 * `scripts/build-client.mjs` at build time and inlined via esbuild `define` — there is no runtime
 * RPC for it, so it can only ever be as fresh as the last `pnpm build` here.
 *
 * SITE PLATFORM (14/09): a blank session in a site's workspace starts on the site's own CMS —
 * `GET /api/sites` carries `platform`, and `site-platform.mjs` keeps the role and swaps the
 * platform half. NOT BUILT (no invented banner — TCH CLAUDE.md rule #3): the mockup's "this site
 * runs X" warning when a person picks a different platform by hand.
 *
 */
import { Check, ChevronDown, Code2, Palette, PenLine, TrendingUp } from 'lucide-react'
import type { ComponentType, CSSProperties, JSX, ReactNode, RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { mainSessionOf } from '@tracy/core/session'
import { uiSwitches } from '@tracy/core/ui-switches'
import { fitLabels } from './fit.mjs'
import { PlatformLogo, type PlatformId } from './platform-logo'
import { presetForSite, shouldFollowSite, siteKeyFrom, sitePlatformReader } from './site-platform.mjs'
import { en, fallback, NS, type StringKey, type Translate } from './strings'
import { CSS } from './styles'
import { sessionMenu, type SessionMenuServices } from './session-menu'

declare const __PLATFORM_COUNTS__: Record<PlatformId, { tools: number; skills: number }>

type RoleId = 'designer' | 'developer' | 'writer' | 'seo-geo'

const ROLE_IDS: readonly RoleId[] = ['designer', 'developer', 'writer', 'seo-geo']
const PLATFORM_IDS: readonly PlatformId[] = ['wordpress', 'joomla', 'emdash']

/**
 * Escape hatch for a preset id `parsePresetId` can't split — a session started under one of
 * dsh's own shipped presets (`standard`, `cordis`, …) before Tracy's twelve existed. Picking a
 * role/platform on a picker whose OTHER axis is unparseable still needs to produce a real id;
 * these match the bundle's configured `default: designer-wordpress`.
 */
const DEFAULT_ROLE: RoleId = 'designer'
const DEFAULT_PLATFORM: PlatformId = 'wordpress'

const ROLE_ICON: Record<RoleId, ComponentType<{ className?: string }>> = {
  designer: Palette,
  developer: Code2,
  writer: PenLine,
  'seo-geo': TrendingUp
}
const ROLE_LABEL_KEY: Record<RoleId, StringKey> = {
  designer: 'role.designer',
  developer: 'role.developer',
  writer: 'role.writer',
  'seo-geo': 'role.seo-geo'
}
/** Product names, not UI chrome — kept literal (TCH CLAUDE.md: third-party names are data). */
const PLATFORM_LABEL: Record<PlatformId, string> = {
  wordpress: 'WordPress',
  joomla: 'Joomla',
  emdash: 'EmDash'
}

/** `designer-wordpress` → `{ role: 'designer', platform: 'wordpress' }`. */
function parsePresetId(id: string): { role: RoleId | null; platform: PlatformId | null } {
  for (const platform of PLATFORM_IDS) {
    const suffix = `-${platform}`
    if (id.endsWith(suffix)) {
      const role = id.slice(0, -suffix.length)
      return { role: (ROLE_IDS as readonly string[]).includes(role) ? (role as RoleId) : null, platform }
    }
  }
  return { role: null, platform: null }
}

interface RosterPreset {
  id: string
  trust?: string
  name?: string
  description?: string
  isDefault?: boolean
  broken?: unknown
}
interface RemoteOk<T> {
  ok: true
  value: T
}
interface RemoteErr {
  ok: false
  error: { message: string; details?: Record<string, unknown> }
}
type RemoteResult<T> = RemoteOk<T> | RemoteErr

interface SessionLike {
  id: string
  blank?: boolean
  projectionValues?: { agentPreset?: unknown }
  /** How many views retain this session, by view; the main view's is the one on screen. */
  retainedBy?: Readonly<Partial<Record<string, number>>>
}

interface RemoteContext {
  remote: {
    agentPresets: {
      list(): Promise<RemoteResult<{ presets: RosterPreset[] }>>
      select(sessionId: string, presetId: string): Promise<RemoteResult<string>>
    }
  }
}

function presetOf(session: SessionLike): string | undefined {
  const value = session.projectionValues?.agentPreset
  return typeof value === 'string' ? value : undefined
}

interface Snapshot {
  options: { id: string; name: string; description?: string }[]
  current: string
  busy: boolean
  error: string | null
  /**
   * True once the current session has run a turn — dsh refuses to change a session's preset
   * after that point (its own comment: "the host refuses to adopt an existing session under a
   * different preset"). A session can carry real history yet still render the hero/composer
   * chrome (returning to a workspace whose last turn ended), so `locked` has to come from the
   * session object itself, not from which screen is showing.
   */
  locked: boolean
  /**
   * The CMS this site actually runs, from the seat book — `null` while unknown (the creation
   * workspace, a site still being provisioned, a door that did not answer).
   *
   * Known means the OTHER platforms are refused in the dropdown: a person chose the CMS once, at
   * Add site, and a site cannot be two of them. Switching by hand only ever armed the agent with
   * the wrong CMS's tools against this webroot — the failure `followSitePlatform` below exists to
   * prevent, reachable by a pick it deliberately never overrides (24/09/2026).
   */
  sitePlatform: PlatformId | null
}
const INITIAL: Snapshot = {
  options: [],
  current: '',
  busy: false,
  error: null,
  locked: false,
  sitePlatform: null
}

/** Hero-chip controller: which preset the NEXT session gets. Ported from dsh's own (see file doc). */
class SeatController {
  private snapshot: Snapshot = INITIAL
  private listeners = new Set<() => void>()
  private fallback = ''
  private staged: string | undefined
  /** Preset ids dsh can select, kept from `load()` so `sessionChanged` can follow without re-listing. */
  private roster: string[] = []

  constructor(
    private ctx: RemoteContext,
    private currentSession: () => SessionLike | undefined
  ) {}

  getSnapshot = (): Snapshot => this.snapshot
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const fn of this.listeners) fn()
  }

  async load(): Promise<void> {
    const result = await this.ctx.remote.agentPresets.list()
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    const presets = result.value.presets.filter((p) => p.broken === undefined)
    this.fallback = result.value.presets.find((p) => p.isDefault)?.id ?? presets[0]?.id ?? ''
    const session = this.currentSession()
    this.set({
      options: presets.map((p) => ({ id: p.id, name: p.name ?? p.id, description: p.description })),
      current: this.staged ?? (session === undefined ? this.fallback : (presetOf(session) ?? '')),
      locked: session !== undefined && session.blank !== true,
      error: null
    })
    // The roster is kept because the follow no longer runs only here: a session born after the page
    // loaded must be followed too, and by then nobody calls `load()` again (see `sessionChanged`).
    this.roster = presets.map((p) => p.id)
    await this.followSitePlatform(this.roster)
  }

  /**
   * The current session just changed — re-apply the chip, then follow the site's platform for the NEW session.
   *
   * 🔒 `load()` RUNS ONCE, WHEN THE HERO CHIP MOUNTS — and a second session opened in the same page
   * does not make it run again. Fixing only the `followedFor` flag without calling from here leaves the
   * other half of the bug alive: the flag is ready to follow the new session, but nothing ever asks.
   */
  async sessionChanged(): Promise<void> {
    await this.apply()
    if (this.roster.length > 0) await this.followSitePlatform(this.roster)
  }

  /**
   * Once per SESSION, before anyone picks: move the platform half of the preset onto the site's own
   * CMS (`site-platform.mjs` says why). A person's pick is never overridden, and a session that has
   * already run a turn is left alone — dsh refuses to change its preset anyway.
   *
   * 🔒 ONCE PER SESSION, NOT ONCE PER PAGE — a page hosts many, and a set is what remembers them.
   * Until 19/09 this was a bare `followed = true`, and a second chat opened on the same site in the
   * same tab never got the follow: it booted on the bundle default and kept it. Measured on `--site-demojlnam--` (a Joomla site)
   * on 19/09 — three sessions 20 seconds apart in one page: the first switched to
   * `designer-joomla` after 179ms, the second NEVER switched and ran a whole turn of **19 steps ·
   * 127.3 s · 38,913 new tokens** with WordPress tools on a Joomla webroot, the third switched only
   * when the page was reloaded 2 min 27 s later. It failed silently in the most expensive way: no error,
   * no log, just an agent carrying the wrong tool set and a turn six times longer.
   */
  private followed = new Set<string | null>()
  /**
   * Ask the seat book which CMS this site runs, and remember it on the snapshot.
   *
   * Separate from the follow below because the two want different things. The follow runs ONCE per
   * session and declines in several ordinary cases — the person already picked, the session has run a
   * turn, this session was followed before — while the dropdown has to know the site's CMS in every
   * one of them, or it re-offers the platforms the site cannot be.
   *
   * @returns the platform, or `null` when it cannot be known right now.
   */
  private async readSitePlatform(): Promise<string | null> {
    const siteKey = siteKeyFrom(location.pathname, document.cookie, new URL(document.baseURI).pathname)
    if (siteKey === null) return null
    // This runs on EVERY `sessions.list` change — dozens per agent turn — so it reads the page's one
    // shared `/api/sites` answer (`sitePlatformReader`) instead of asking the door each time (#340).
    const platform = await this.readPlatform(siteKey)
    const sitePlatform = (PLATFORM_IDS as readonly string[]).includes(platform ?? '')
      ? (platform as PlatformId)
      : null
    if (sitePlatform !== this.snapshot.sitePlatform) this.set({ sitePlatform })
    return platform
  }
  private readPlatform = sitePlatformReader()

  private async followSitePlatform(roster: string[]): Promise<void> {
    const platform = await this.readSitePlatform()
    const sessionId = this.currentSession()?.id ?? null
    const go = shouldFollowSite({
      followed: this.followed,
      sessionId,
      picked: this.staged !== undefined,
      locked: this.snapshot.locked
    })
    if (!go) return
    if (platform === null) return
    if (this.staged !== undefined || this.snapshot.locked) return
    const target = presetForSite(this.snapshot.current, platform, roster)
    if (target === null) return
    // 🔒 MARKED FOLLOWED ONLY NOW — AFTER the site answered and a target exists.
    //
    // The mark used to be set on the way IN, before the `/api/sites` fetch. Every early return
    // after it — the site key not readable yet, the door not answering, `platform` still null
    // because the site is STILL BEING PROVISIONED — then meant "this session has been followed",
    // permanently and silently, and nothing asks twice: `load()` runs once when the hero chip
    // mounts, and `sessionChanged()` only fires when the session changes. Measured 20/09/2026 on
    // `site-lr1m0l` (Joomla): session 1, opened with the site, took `designer-joomla` in under a
    // second; session 2, opened 13 minutes later in the same page, carries NO `agent-preset/selected`
    // event at all and ran the customer's whole conversation — 8 turns, median 12.5 steps — on the
    // bundle default, `designer-wordpress`, against a Joomla webroot.
    //
    // ⚠ THIS IS THE OTHER HALF OF THE 19/09 FIX, not a regression of it. That round made the flag
    // remember WHICH session (it was a bare boolean); this one makes it remember only what actually
    // happened. Both halves fail the same way — an agent holding the wrong CMS's tools, with no
    // error, no log and nothing on screen — which is why the second half survived the first.
    //
    // Retrying is safe and bounded: this runs on a session change, not on a timer, so a site whose
    // platform is not known yet is simply asked again the next time — which is exactly the case a
    // freshly provisioned site presents.
    this.followed.add(sessionId)
    await this.select(target)
  }

  /** Stage a pick and apply it immediately, matching dsh's own chip. Locked sessions refuse up front. */
  async select(id: string): Promise<string | undefined> {
    if (this.snapshot.busy || this.snapshot.locked) return undefined
    this.staged = id
    this.set({ current: id, error: null })
    await this.apply()
    return this.snapshot.error ?? undefined
  }

  async apply(): Promise<void> {
    const staged = this.staged
    const session = this.currentSession()
    const locked = session !== undefined && session.blank !== true
    if (locked !== this.snapshot.locked) this.set({ locked })
    if (staged === undefined) {
      const current = session === undefined ? this.fallback : (presetOf(session) ?? '')
      if (current !== this.snapshot.current) this.set({ current })
      return
    }
    if (session === undefined) return
    if (session.blank !== true || presetOf(session) === staged) {
      this.staged = undefined
      return
    }
    this.set({ busy: true, error: null })
    const result = await this.ctx.remote.agentPresets.select(session.id, staged)
    this.staged = undefined
    if (!result.ok) {
      const details = result.error.details
      const reason = typeof details?.reason === 'string' ? details.reason : result.error.message
      this.set({ busy: false, error: reason, current: presetOf(session) ?? '' })
      return
    }
    this.set({ busy: false, current: result.value })
  }
}

export interface DropdownItem {
  id: string
  icon: ReactNode
  name: ReactNode
  hint?: ReactNode
  selected: boolean
  /** Shown, dimmed, and not pickable — the row a person may not choose here. */
  disabled?: boolean
}

export interface PickerButtonProps {
  icon: ReactNode
  label: ReactNode
  ariaLabel: string
  disabled?: boolean
  items: readonly DropdownItem[]
  onSelect: (id: string) => void
  /**
   * Open the menu ABOVE the button, from its left edge: the composer's role chip sits at the bottom
   * of the column, where a menu opening downward would run off the screen.
   */
  up?: boolean
  /** The button's class: the hero row's pill (`tv-seat`, the default) or the composer chip. */
  className?: string
}

/**
 * One pill + its own dropdown. Selecting an item closes it — the ordinary single-picker behaviour.
 * Exported for the browser test (`test/e2e/role-menu-check-only.test.mjs`) only.
 */
export function PickerButton({
  icon,
  label,
  ariaLabel,
  disabled,
  items,
  onSelect,
  up = false,
  className = 'tv-seat'
}: PickerButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      if (up) {
        // Above the chip, from its left edge: the chip sits at the left of the composer row.
        setPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left })
        return
      }
      // Anchored by its RIGHT edge, not left: both pickers sit flush against the hero row's
      // right edge (`margin-left: auto` on the wrapper), so a menu opening rightward from the
      // button's left edge would run off-screen on a narrow viewport. Opening leftward from the
      // button's right edge keeps it inside the viewport the same way the trigger already is.
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, up])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return
      if (buttonRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className="tv-mp-picker">
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="tv-seat-text">{label}</span>
        <ChevronDown className="tv-seat-chevron" />
      </button>

      {open && pos ? (
        <div ref={menuRef} className="tv-menu" style={pos} role="menu">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="tv-menu-item"
              // A single choice: the row says so to a screen reader, as the check mark says it on screen.
              role="menuitemradio"
              aria-checked={it.selected}
              // Kept in the list rather than filtered out: seeing the other platforms greyed says
              // "this site is a WordPress site", while a list of one says nothing at all.
              disabled={it.disabled === true}
              onClick={() => {
                setOpen(false)
                if (!it.selected) onSelect(it.id)
              }}
            >
              <span className="tv-menu-item-icon">{it.icon}</span>
              <span className="tv-menu-item-text">
                <span className="tv-menu-item-name">{it.name}</span>
                {it.hint !== undefined ? <span className="tv-menu-item-hint">{it.hint}</span> : null}
              </span>
              {it.selected ? <Check className="tv-menu-item-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  )
}

/**
 * Icons-only pills when the hero row cannot hold their labels (decision: `fit.mjs`). The box is
 * the picker's root, which takes the room the workspace chip leaves; `row` is the pills
 * themselves. `labels` names what the pills say, so a change remeasures their labelled width.
 */
function useFitLabels(labels: string): {
  box: RefObject<HTMLSpanElement | null>
  row: RefObject<HTMLSpanElement | null>
  compact: boolean
} {
  const box = useRef<HTMLSpanElement>(null)
  const row = useRef<HTMLSpanElement>(null)
  const [compact, setCompact] = useState(false)
  const full = useRef(0)

  // The DOM, not React state, says whether the words are showing right now: a measurement taken
  // before a pending re-render lands would otherwise read the icons' width as the labels'.
  const measure = (): void => {
    const b = box.current
    const r = row.current
    if (b === null || r === null) return
    const next = fitLabels({
      compact: b.hasAttribute('data-compact'),
      room: b.clientWidth,
      content: r.offsetWidth,
      full: full.current
    })
    full.current = next.full
    setCompact(next.compact)
  }

  // New labels: forget their width and show them for one layout pass to learn it again.
  useLayoutEffect(() => {
    full.current = 0
    setCompact(false)
  }, [labels])

  useLayoutEffect(() => {
    measure()
  })

  // Re-armed with the labels: the picker renders nothing until its roster arrives, and the locked
  // and pickable forms are different elements, so a mount-time observer would watch nothing.
  useEffect(() => {
    const b = box.current
    const r = row.current
    if (b === null || r === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(b)
    observer.observe(r)
    return () => {
      observer.disconnect()
    }
  }, [labels])

  return { box, row, compact }
}

/**
 * The four roles as menu rows, each with its preset's own description: every platform variant of a
 * role carries the same one (see the file doc), so it is read off any of them.
 */
function roleItems(state: Snapshot, t: Translate | undefined): DropdownItem[] {
  const { role: currentRole } = parsePresetId(state.current)
  return ROLE_IDS.map((r) => {
    const Icon = ROLE_ICON[r]
    return {
      id: r,
      icon: <Icon className="tv-seat-icon" />,
      name: fallback(t, ROLE_LABEL_KEY[r]),
      hint:
        state.options.find((o) => parsePresetId(o.id).role === r)?.description ??
        fallback(t, 'noDescription'),
      selected: r === currentRole
    }
  })
}

interface SeatProps {
  controller: SeatController
  t?: Translate
}

export function Seat({ controller, t }: SeatProps): JSX.Element | null {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const shown = usePresetPickerShown()

  useEffect(() => {
    controller.load()
  }, [controller])

  const ready = state.options.length > 0 && state.current !== ''
  const fit = useFitLabels(
    `${state.current}|${state.locked ? 1 : 0}|${t === undefined ? '' : fallback(t, 'group.mode')}`
  )
  if (!ready || !shown) return null

  const { role: currentRole, platform: currentPlatform } = parsePresetId(state.current)
  const pick = (role: RoleId | null, platform: PlatformId | null) => {
    const id = `${role ?? DEFAULT_ROLE}-${platform ?? DEFAULT_PLATFORM}`
    if (id === state.current) return
    controller.select(id)
  }

  const RoleIcon = currentRole ? ROLE_ICON[currentRole] : null

  const modeItems = roleItems(state, t)

  const platformItems: DropdownItem[] = PLATFORM_IDS.map((p) => {
    const size = __PLATFORM_COUNTS__[p]
    // The site's CMS was chosen once, at Add site, and a site cannot be two of them. While the
    // seat book has answered, the other platforms are shown and refused; while it has not (the
    // creation workspace, a site still being provisioned), all three stay pickable — a picker
    // that guesses would be worse than one that waits.
    const foreign = state.sitePlatform !== null && p !== state.sitePlatform
    return {
      id: p,
      icon: <PlatformLogo platform={p} />,
      name: PLATFORM_LABEL[p],
      hint: foreign
        ? fallback(t, 'platform.siteRuns', {
            platform: PLATFORM_LABEL[state.sitePlatform as PlatformId]
          })
        : size.tools + size.skills === 0
          ? fallback(t, 'platform.nothingYet')
          : fallback(t, 'platform.adds', { tools: String(size.tools), skills: String(size.skills) }),
      selected: p === currentPlatform,
      disabled: foreign
    }
  })

  if (state.locked) {
    return (
      <span
        ref={fit.box}
        className="tv-mode-picker tv-mode-fit"
        data-compact={fit.compact || undefined}
        title={fallback(t, 'lockedHint')}
      >
        <span ref={fit.row} className="tv-mp-row">
          <span className="tv-seat tv-seat-locked">
            {RoleIcon ? <RoleIcon className="tv-seat-icon" /> : null}
            <span className="tv-seat-text">
              {currentRole ? fallback(t, ROLE_LABEL_KEY[currentRole]) : state.current}
            </span>
          </span>
          <span className="tv-seat tv-seat-locked">
            <PlatformLogo platform={currentPlatform} />
            <span className="tv-seat-text">
              {currentPlatform ? PLATFORM_LABEL[currentPlatform] : state.current}
            </span>
          </span>
        </span>
      </span>
    )
  }

  return (
    <span
      ref={fit.box}
      className="tv-mode-picker tv-mode-fit"
      data-compact={fit.compact || undefined}
      title={state.error ?? undefined}
    >
      <span ref={fit.row} className="tv-mp-row">
        <PickerButton
          icon={RoleIcon ? <RoleIcon className="tv-seat-icon" /> : null}
          label={currentRole ? fallback(t, ROLE_LABEL_KEY[currentRole]) : state.current}
          ariaLabel={fallback(t, 'group.mode')}
          disabled={state.busy}
          items={modeItems}
          onSelect={(id) => pick(id as RoleId, currentPlatform)}
        />
        <PickerButton
          icon={<PlatformLogo platform={currentPlatform} />}
          label={currentPlatform ? PLATFORM_LABEL[currentPlatform] : state.current}
          ariaLabel={fallback(t, 'group.platform')}
          disabled={state.busy}
          items={platformItems}
          onSelect={(id) => pick(currentRole, id as PlatformId)}
        />
      </span>
    </span>
  )
}

interface ClientContext {
  inject(dependencies: string[], callback: (scope: ClientContext & SessionMenuServices) => void): void
  effect(fn: () => (() => void) | void, label?: string): void
  locale: { register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown }
  slots: { register(spec: Record<string, unknown>, component: unknown): () => void }
  remote: RemoteContext['remote']
  sessions: {
    list: {
      getSnapshot(): { byId: Record<string, SessionLike> }
      subscribe(fn: () => void): () => void
    }
    /** An open session's client binding; its `modelSelection` projection is what the model chip reads. */
    binding(sessionId: string):
      | {
          session: {
            projections: {
              faceOf(name: 'modelSelection'): {
                getSnapshot(): unknown
                subscribe(fn: () => void): () => void
              }
            }
          }
        }
      | undefined
    /** Defined for a subagent's session, whose model dsh does not let a client pick. */
    subagentAddress(sessionId: string): unknown
  }
}

// `conversation` is not read directly — it's an ORDER dependency. `conversation.hero.agentPreset`
// is a `kind: 'single'` CHILD that `@deepseek-ai/dsh-client-ui-conversation` declares (its own
// `conversation.hero` slot registration carries the children table). Registering into a child
// before its parent has declared it throws `slot "..." is not declared`; injecting `conversation`
// makes cordis wait for that registration first — dsh's own stock chip does the same.
/**
 * The role chip in the composer's control row (start screen Case 2, 01/10/2026): before a
 * site's first message the role sits at the bottom of the chat box, the way a model picker does, and
 * the platform is not offered at all (the site chip at the top left already shows the site's CMS
 * logo, and the platform half follows the site: `followSitePlatform`). Picking a role stages
 * "<role> for <the site's platform>", one preset id, through the same controller as the hero seat.
 *
 * Drawn only where the site start screen replaces dsh's hero row: a site's workspace (never `/new/`),
 * the start-cards switch on (the start block in `@tracy/dsh-chat-input` reads the same switch), and a
 * session with no turn yet. dsh refuses to change a session's preset after its first turn, so the
 * chip goes with the first message; the composer is back to [+] [draft] [send] from then on.
 */
export function RoleChip({ controller, t }: SeatProps): JSX.Element | null {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const ui = uiSwitches()
  const startShown = useSyncExternalStore(ui.subscribe, () => ui.isShown('start-cards'))
  const shown = usePresetPickerShown()
  useEffect(() => {
    if (controller.getSnapshot().options.length === 0) void controller.load()
  }, [controller])
  if (!shown || !startShown || state.locked || pageSiteKey() === null) return null
  if (state.options.length === 0 || state.current === '') return null
  const { role: currentRole, platform: currentPlatform } = parsePresetId(state.current)
  const RoleIcon = currentRole ? ROLE_ICON[currentRole] : null
  return (
    <PickerButton
      up
      className="tv-role-chip"
      icon={RoleIcon ? <RoleIcon className="tv-role-chip-icon" /> : null}
      label={currentRole ? fallback(t, ROLE_LABEL_KEY[currentRole]) : state.current}
      ariaLabel={fallback(t, 'group.mode')}
      disabled={state.busy}
      items={roleItems(state, t)}
      onSelect={(id) => {
        const next = `${id}-${state.sitePlatform ?? currentPlatform ?? DEFAULT_PLATFORM}`
        if (next !== state.current) void controller.select(next)
      }}
    />
  )
}

/**
 * The operator switch over every preset chooser this package draws (/ops › User Interface, id
 * `preset-picker`, off by default): the hero seat and the composer's role chip. Off, a session keeps
 * the preset it was created with — the default, or the one Tracy's own flows pick for it.
 */
function usePresetPickerShown(): boolean {
  const ui = uiSwitches()
  return useSyncExternalStore(ui.subscribe, () => ui.isShown('preset-picker'))
}

/** The site this page is the workspace of, or null (the creation workspace, `/new/`). */
function pageSiteKey(): string | null {
  try {
    return siteKeyFrom(location.pathname, document.cookie, new URL(document.baseURI).pathname)
  } catch {
    return null
  }
}

export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.agentPresets',
  'remote.session',
  'sessions',
  'conversation'
]

export function apply(ctx: ClientContext): void {
  installSessionMenu(ctx)
  ctx.effect(() => {
    const id = 'tracy-mode-picker-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'tracy-mode-picker: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-mode-picker: dictionaries')

  // Which conversation is on screen is `mainSessionOf`: `list.current` left the sessions list in
  // dsh 0.1.6-alpha.2 and reads `undefined` on every snapshot, so this controller saw no session.
  // One controller for the hero seat and the composer's role chip, so both show one choice.
  const controller = new SeatController(ctx, () => {
    const state = ctx.sessions.list.getSnapshot()
    const shown = mainSessionOf(state)
    return shown === undefined ? undefined : state.byId[shown]
  })
  ctx.effect(() => {
    const stop = ctx.sessions.list.subscribe(() => {
      controller.sessionChanged()
    })
    const dispose = ctx.slots.register(
      { name: 'conversation.hero.agentPreset', locale: NS, inject: () => ({ controller }) },
      Seat
    )
    return () => {
      stop()
      dispose()
    }
  }, 'tracy-mode-picker: hero seat')

  // The role chip in the composer row, after dsh's + (`conversation.input.left`, a session list slot
  // the input bar renders in its tools group). The session header no longer carries a mode label
  // (Case 2 header: the site chip and the session menu only, 01/10/2026); until then this
  // package drew Designer and the platform there, read-only, from `projectionValues.agentPreset`.
  ctx.effect(
    () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'tracy-role-chip',
          order: 10,
          locale: NS,
          inject: () => ({ controller })
        },
        RoleChip
      ),
    'tracy-mode-picker: composer role chip'
  )
}

/** Wait for dsh's shared directory and export service before replacing its header cell. */
function installSessionMenu(context: ClientContext): void {
  context.inject(['slots', 'locale', 'sessions', 'modelDirectories', 'sessionLogDownload'], (scope) => {
    scope.effect(
      () =>
        scope.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'session-log-download',
            priority: -10
          },
          sessionMenu(scope)
        ),
      'tracy-mode-picker: header model menu'
    )
  })
}
