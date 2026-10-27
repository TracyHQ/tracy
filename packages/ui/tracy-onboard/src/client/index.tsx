/**
 * `@tracy/dsh-onboard` — the Getting started screen, on the web and in the desktop app
 * (tasks/todo-desktop-onboard-v2.md §C, tasks/todo-web-onboard.md, ADR 0030): signed in, pick your
 * AI account and connect it in place, appearance & language, and in the app notifications.
 *
 * It mounts in dsh's `shell.overlay` list (declared by `@deepseek-ai/dsh-client-ui-layout`
 * `src/client/index.ts:178`, drawn above the whole frame by `AppFrame.tsx:387,426`), the seat dsh's
 * own desktop introduction uses (`ui-settings-account/src/client/index.ts:253`).
 *
 * Automatic first run uses the ACCOUNT on both web and desktop (`GET /api/onboarding`, completedAt
 * null): the spotlight tour replaces automatic setup. Before the tour, an account that has not seen
 * it gets the "Welcome to Tracy" popup (`Welcome.tsx`, the `welcome` mark of `/api/seen-hints`);
 * its call to action opens Add site and completes the first run, × and Escape hand over to the tour. The original setup stays behind
 * Getting started. Its desktop-only device scan and notification steps are unchanged.
 * Reopened from the account menu's "Getting started" row and Settings › Help & about's "Getting
 * started" row (both surfaces) and, in the app, from Help › "Getting started with Tracy Cowork"
 * (`app.onboarding.onOpen`). The menu row carries a progress ring and `n/N` (`checklist.ts`,
 * `Ring.tsx`) and goes by itself when every step is done or after "Hide from account menu" (the
 * account's `menuHiddenAt`, cleared again by "Show in account menu"); the Help & about row stays,
 * whatever the progress or the flag. The operator's `onboarding` switch (`/ops` › User Interface)
 * hides the screen and both rows (CLAUDE.md §8).
 */
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { viewerStore } from '@tracy/core/seat/viewer'
import { type HelpItemProps, type MenuItemProps, PopoverItem } from '@tracy/core/site-tabs'
import { uiSwitches } from '@tracy/core/ui-switches'
import {
  copyText,
  pageAccountStatus,
  publishStatus,
  seatPlanApi,
  startConnect
} from '@tracy/dsh-model-plan/connect'
import { type LanguageFace, languageFace } from '@tracy/dsh-settings/language-row'
import type { ThemeChoice } from './AppearanceStep.tsx'
import { onboardApp, openExternal } from './bridge.ts'
import { type StatusCopy, useChecklist } from './checklist.ts'
import { deviceLanguages } from './language-note.ts'
import { Onboard, type OnboardDeps } from './Onboard.tsx'
import { readOffer } from './offer.ts'
import { Ring } from './Ring.tsx'
import { Tour } from './Tour.tsx'
import { openAddSite, type WelcomeStore, welcomeStore } from './welcome-flow.ts'
import { Welcome, type WelcomeExit } from './Welcome.tsx'
import { TourComposerBridge } from './tour-composer.tsx'
import { en, NS } from './strings.ts'
import { STYLES } from './styles.ts'
import { accountStore, desktopSurface, type OnboardStore, webSurface } from './surface.ts'
import type { T } from './text.tsx'

/** The cell id in `shell.overlay`. */
export const OVERLAY_ID = 'tracy-onboard'

/** The account menu row's id (`settings.menu.item`, contract in `@tracy/core/site-tabs` `menu-item.ts`). */
export const MENU_ITEM_ID = 'tracy-onboard.getting-started'

/** The operator's switch for the screen and its menu row (`@tracy/core/ui-switches` catalogue). */
export const SWITCH_ID = 'onboarding'

/** The part of `@tracy/core/ui-switches` this plugin reads. */
interface Switches {
  readonly ready: Promise<void>
  isShown(id: string): boolean
  subscribe(listener: () => void): () => void
}

interface Slots {
  inject(name: string, fn: () => (() => void) | void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The part of dsh's locale service (`@deepseek-ai/dsh-client-locale`) this screen uses. */
interface LocaleRuntime extends Partial<LanguageFace> {
  register(ns: string, dictionaries: Record<string, Record<string, string>>): (() => void) | void
  /** The translate function of a namespace (the Language row speaks `tracy-settings`). */
  bind?(ns: string): T
}

/** The namespace of Settings' words, which the Language row speaks (`@tracy/dsh-settings`). */
const SETTINGS_NS = 'tracy-settings'

/** The part of dsh's theme service (`@deepseek-ai/dsh-client-ui-theme`) this screen uses. */
interface ThemeRuntime {
  getTheme(): { preference: string }
  setTheme(id: string): void
}

export const inject = ['slots', 'locale', 'theme']

const asChoice = (value: unknown): ThemeChoice => (value === 'dark' || value === 'light' ? value : 'system')

/**
 * The overlay cell, the account menu row, and what opens them: on load, the store once (shown when
 * it says never closed, the operator's switch on); later, each `open()` — the menu row, the app's
 * Help menu — even when it was closed. Closing records `close({outcome, picked})` every time and
 * keeps the panel gone until the next `open()`.
 * @param status - the page's status copy the row counts the AI-account step from.
 */
export function onboardOverlay(
  store: OnboardStore,
  deps: OnboardDeps,
  switches: Switches = uiSwitches(),
  status: StatusCopy = pageAccountStatus(),
  firstRun: OnboardStore = store,
  welcome: WelcomeStore = welcomeStore(),
  /** Where the Welcome popup's call to action leads (Add site). */
  buildFirstSite: () => void = () => openAddSite(window, document.baseURI)
): {
  Overlay: (props: { t: T }) => JSX.Element | null
  /** Open the panel (a no-op while it is open, or while the operator's switch is off). */
  open: () => void
  /** The account menu's "Getting started" row. */
  MenuRow: (props: MenuItemProps & { t: T }) => JSX.Element | null
  /** Settings › Help & about's "Getting started" row: there whatever the progress or the menu flag. */
  HelpRow: (props: HelpItemProps & { t: T }) => JSX.Element | null
} {
  /** null = not asked yet; 'first' = first run; 'help' = reopened; 'closed'. */
  let phase: null | 'first' | 'help' | 'closed' = null
  /**
   * The Welcome popup, on first run only and before the tour: 'show' while the account has not seen
   * it, 'done' otherwise (seen, closed now, or an answer nobody could read). The tour waits for it.
   * 'building': closed by its call to action, which replaces the tour for this page.
   */
  let greeting: 'show' | 'done' | 'building' = 'done'
  /** Bumped on each opening, so a reopened panel starts from a fresh state. */
  let opening = 0
  /** The account's menu flag as last read before an opening: the header button starts from it. */
  let menuHidden = false
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const set = (next: typeof phase) => {
    phase = next
    if (next === 'first' || next === 'help') opening += 1
    notify()
  }
  const shown = () => switches.isShown(SWITCH_ID)
  /** The rows re-read the account's flags whenever the screen opened, closed or toggled the menu flag. */
  const watch = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  let asked: Promise<void> | null = null
  const ask = () =>
    (asked ??= switches.ready
      .then(() => (shown() ? firstRun.get() : null))
      .then(
        async (state) => {
          const show = state !== null && typeof state === 'object' && state.closedAt === null
          if (show) menuHidden = state.menuHiddenAt !== null
          // First run starts with the Welcome popup unless this account has seen it.
          if (show)
            greeting = await welcome.seen().then(
              (seen) => (seen ? 'done' : 'show'),
              () => 'done' as const
            )
          if (phase === null) set(show ? 'first' : 'closed')
        },
        () => {
          if (phase === null) set('closed')
        }
      ))
  const open = () => {
    if (phase === 'first' || phase === 'help' || !shown()) return
    void store.get().then(
      (flags) => {
        menuHidden = flags.menuHiddenAt !== null
        set('help')
      },
      () => {
        menuHidden = false
        set('help')
      }
    )
  }
  /**
   * The Welcome popup closed: the account's mark is recorded (every way out counts as seen). Its
   * call to action opens Add site and counts as the first-run tour done, as pressing the tour's own
   * "Create a new site" does; × and Escape hand over to the tour.
   */
  const greeted = (by: WelcomeExit) => {
    greeting = by === 'cta' ? 'building' : 'done'
    const recorded = welcome.record()
    if (by !== 'cta') {
      notify()
      return
    }
    set('closed')
    // Both writes before leaving: Add site may be on another page, and a navigation drops a write
    // still in flight. A refused write never keeps the person from building.
    void Promise.allSettled([recorded, firstRun.close({ outcome: 'completed', picked: null })]).then(
      buildFirstSite
    )
  }
  function Overlay({ t }: { t: T }): JSX.Element | null {
    const [, render] = useState(0)
    useEffect(() => {
      const listener = () => render((n) => n + 1)
      listeners.add(listener)
      void ask()
      return () => {
        listeners.delete(listener)
      }
    }, [])
    const on = useSyncExternalStore(switches.subscribe, shown)
    const viewer = deps.viewer
    const email = useSyncExternalStore(
      viewer?.subscribe ?? (() => () => {}),
      () => viewer?.get().email ?? null
    )
    if (phase === null) return null
    // Into <body>, not the shell's overlay layer: that layer stacks under the Settings dialog, and
    // Help › Getting started may be pressed while Settings is open (measured 10/10/2026), and
    // Settings › Help & about's Open is always pressed from inside it.
    return createPortal(
      <>
        {phase === 'first' && on && greeting === 'show' && <Welcome t={t} onClose={greeted} />}
        <Tour
          t={t}
          first={phase === 'first'}
          enabled={on && phase !== 'help' && greeting === 'done'}
          account={email}
          complete={async () => {
            await firstRun.close({ outcome: 'completed', picked: null })
            set('closed')
          }}
        />
        {phase === 'help' && (
          <Onboard
            key={opening}
            t={t}
            deps={deps}
            reopened={phase === 'help'}
            menuHidden={menuHidden}
            onMenuChanged={notify}
            onClosed={() => set('closed')}
          />
        )}
      </>,
      document.body
    )
  }
  function MenuRow({ t, close }: MenuItemProps & { t: T }): JSX.Element | null {
    const on = useSyncExternalStore(switches.subscribe, shown)
    const list = useChecklist(deps.surface, store, status, watch)
    // Orca's rule: the row shows while ready && !complete && !dismissed.
    if (!on || list === null || list.hidden || list.done >= list.total) return null
    return (
      <PopoverItem
        itemId="getting-started"
        icon={<Ring done={list.done} total={list.total} t={t} />}
        end={
          <span className="tv-ob-menu-count">
            {list.done}/{list.total}
          </span>
        }
        onClick={() => {
          close()
          open()
        }}
      >
        <span className="flex-1 truncate">{t('menu.gettingStarted')}</span>
      </PopoverItem>
    )
  }
  function HelpRow({ t, buttonClassName }: HelpItemProps & { t: T }): JSX.Element | null {
    const on = useSyncExternalStore(switches.subscribe, shown)
    const list = useChecklist(deps.surface, store, status, watch)
    if (!on || list === null) return null
    const complete = list.done >= list.total
    return (
      <div className="ts-help-row" data-help-item="getting-started">
        <div className="ts-row-text">
          <span className="ts-row-title">{t('menu.gettingStarted')}</span>
          <p className="ts-help-status">
            <Ring done={list.done} total={list.total} t={t} decorative />
            <span>
              {complete ? t('help.allDone') : t('help.progress', { done: list.done, total: list.total })}
            </span>
            {list.hidden && (
              <span data-help-hidden="">
                <span aria-hidden="true">{'· '}</span>
                {t('help.hidden')}
              </span>
            )}
          </p>
        </div>
        <div className="ts-help-actions">
          <button type="button" className={buttonClassName} onClick={open}>
            {t('help.open')}
          </button>
        </div>
      </div>
    )
  }
  return { Overlay, open, MenuRow, HelpRow }
}

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  slots: Slots
  locale: LocaleRuntime
  theme: ThemeRuntime
}): void {
  if (typeof window === 'undefined') return
  // The desktop app's bridge (protocol 2) when there is one; anything else is the web, an older app
  // included: the account decides there.
  const app = onboardApp(window)
  const surface = app ? desktopSurface(app) : webSurface()

  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-onboard-style="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyOnboardStyle = '1'
    el.textContent = STYLES
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-onboard: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-onboard: dictionaries')

  const theme = ctx.theme
  const locale = ctx.locale
  const call = seatPlanApi()
  const deps: OnboardDeps = {
    surface,
    // Built on first use: the signed-in account owns automatic tour eligibility.
    viewer: {
      get: () => viewerStore().get(),
      subscribe: (listener) => viewerStore().subscribe(listener)
    },
    connect: (provider, onState) =>
      startConnect(provider, { call, onState, events: window, openBrowser: openExternal }),
    publishStatus,
    copy: copyText,
    // Settings' own Language row, over dsh's locale service; absent on a dsh without its face.
    language:
      typeof locale.getSnapshot === 'function' &&
      typeof locale.subscribe === 'function' &&
      typeof locale.setLocale === 'function' &&
      typeof locale.clearPreference === 'function' &&
      typeof locale.bind === 'function'
        ? {
            face: languageFace(locale as LanguageFace),
            t: (key, params) => (locale.bind as (ns: string) => T)(SETTINGS_NS)(key, params),
            deviceLanguages: () => deviceLanguages(globalThis)
          }
        : undefined,
    theme: {
      get: () => asChoice(theme.getTheme().preference),
      set: (id) => theme.setTheme(id)
    },
    readOffer: () => readOffer(),
    navigate: (address) => window.location.assign(address),
    location: window.location,
    formatTime: (at) =>
      new Intl.DateTimeFormat(interfaceLocale(), { hour: '2-digit', minute: '2-digit' }).format(at),
    isMac: /Mac/i.test(navigator.platform || navigator.userAgent),
    openExternal
  }

  const firstRun = accountStore()
  const { Overlay, open, MenuRow, HelpRow } = onboardOverlay(
    surface.onboarding,
    deps,
    uiSwitches(),
    pageAccountStatus(),
    app
      ? {
          ...firstRun,
          close: async (input) => {
            await firstRun.close(input)
            // The account owns completion; device bookkeeping still supports later sign-in frames.
            await app.onboarding.close(input).catch(() => {})
          }
        }
      : firstRun
  )
  // An app built before the Help menu entry has no `onOpen`: the first run still works.
  if (app !== undefined && typeof app.onboarding.onOpen === 'function')
    ctx.effect(() => app.onboarding.onOpen?.(open), 'tracy-onboard: help menu')

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'tracy-onboard', locale: NS }, Overlay)
  )

  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-tour-composer', order: 99 },
      TourComposerBridge
    )
  )

  // The account menu's "Getting started" (Appearance is 40, Community 50). The list slot is declared
  // by `@tracy/dsh-settings`; until it is, this registration waits.
  ctx.slots.inject('settings.menu.item', () =>
    ctx.slots.register({ name: 'settings.menu.item', id: MENU_ITEM_ID, order: 45, locale: NS }, MenuRow)
  )

  // Settings › Help & about's "Getting started", after the desktop app's updates: the way back to the
  // screen once its account menu row is gone (Lee, 12/10/2026). The list slot is declared by
  // `@tracy/dsh-settings`' Help & about section; until it is, this registration waits.
  ctx.slots.inject('settings.help.item', () =>
    ctx.slots.register({ name: 'settings.help.item', id: MENU_ITEM_ID, order: 10, locale: NS }, HelpRow)
  )
}
