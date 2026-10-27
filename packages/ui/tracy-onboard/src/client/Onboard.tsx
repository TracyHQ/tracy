/**
 * The first-run screen, laid out like Orca's Getting Started (Lee, 10/10/2026): a top row with the
 * logo and a short line; the SETUP checklist on the left (`SetupRail.tsx`); the current step's
 * title, subtitle and body on the right; the footer with Skip / Back / Continue. Same size as
 * Tracy's Settings dialog (`@tracy/dsh-settings` `.ts-surface`). Four steps in the desktop app (Lee,
 * 11/10/2026): Sign in (always done here), Pick your AI account (with "Connect now"), Appearance &
 * language, Notifications; the web has the first three (`surface.ts`). `OnboardView` draws a state
 * and reports clicks; `Onboard` holds the state (flow.ts), reads the offer, scans this computer
 * where it can, runs a sign-in, and records the close where the surface keeps it.
 *
 * Keys, as the mock: ⌘↵ (Ctrl↵ outside macOS) = Continue / Done; Escape = Skip (unless a menu of
 * the screen is open: Escape closes that first). A click on the backdrop is Skip too, and so is the
 * × in the header. Skip never asks again. The button beside the × is a two-way switch for the
 * account menu's row (Lee, 12/10/2026, tasks/evidence/getting-started-reopen/mock.html §A): "Hide
 * from account menu" records the account's flag, "Show in account menu" clears it; either way the
 * screen stays open and the button shows what the account now says.
 */
import {
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import type { Connecting, ConnectState, SeatPlanStatus } from '@tracy/dsh-model-plan/connect'
import { LanguageRow, type LanguageFace } from '@tracy/dsh-settings/language-row'
import type { Viewer } from '@tracy/core/seat/viewer'
import { AccountStep } from './AccountStep.tsx'
import { AppearanceStep, type ThemeChoice } from './AppearanceStep.tsx'
import type { NotifyStatus } from './bridge.ts'
import { connectPanel, type PanelView, TRACY } from './connect-panel.ts'
import {
  accountView,
  firstUndone,
  initialState,
  reduce,
  stepsDone,
  type Closed,
  type FlowAction,
  type FlowState,
  type Vendor
} from './flow.ts'
import { Check, ChevronLeft, Eye, EyeOff, X } from './icons.tsx'
import { type LanguageNote, languageNote } from './language-note.ts'
import { NotificationStep } from './NotificationStep.tsx'
import { aiAccountsAddress, type Offer, offerWithStatus } from './offer.ts'
import { scanAgents } from './scan.ts'
import { SetupRail, STEP_KEYS } from './SetupRail.tsx'
import { SignInStep } from './SignInStep.tsx'
import { type OnboardSurface, stepsOf } from './surface.ts'
import type { T } from './text.tsx'

/** The viewer while nobody answered: nothing drawn, nothing invented. */
const UNKNOWN_VIEWER: Viewer = { state: 'loading', email: null, name: null, face: null }

/**
 * Every menu open on the page (`@tracy/core/site-tabs` Popover keeps the list on the document under
 * this symbol). The Language row's menu answers Escape itself; the screen must not close under it.
 */
const OPEN_MENUS = Symbol.for('tracy.site-tabs.open-menus')
const menuOpen = (): boolean =>
  ((document as unknown as Record<symbol, unknown[] | undefined>)[OPEN_MENUS]?.length ?? 0) > 0

/** The product's name beside the logo: a name, not a sentence to translate. */
const PRODUCT = 'Tracy Cowork'
const PRODUCT_INITIAL = 'T'

/** Everything the screen needs from outside, so a test can hand in fakes. */
export interface OnboardDeps {
  /** The web or the desktop app: where a close is kept, and whether it scans and notifies. */
  readonly surface: OnboardSurface
  /** Who is signed in (`@tracy/core/seat/viewer` store); absent = nobody named. */
  readonly viewer?: { get(): Viewer; subscribe(listener: () => void): () => void }
  /** Start one vendor's sign-in (`@tracy/dsh-model-plan/connect` `startConnect`). */
  readonly connect: (provider: string, onState: (state: ConnectState) => void) => Connecting
  /** A status answer after a connect, for the rest of the page (the account menu's row). */
  readonly publishStatus?: (status: SeatPlanStatus) => void
  /** Copy a device code (`copyText`); resolves whether it went through. */
  readonly copy: (text: string) => Promise<boolean>
  /**
   * Settings' Language row: dsh's locale service as its face, the Settings words it speaks, and the
   * device's languages (for the line under it). Absent when the page has no locale service.
   */
  readonly language?: {
    readonly face: LanguageFace
    readonly t: T
    readonly deviceLanguages: () => Promise<readonly string[] | null>
  }
  readonly theme: { get(): ThemeChoice; set(id: ThemeChoice): void }
  readonly readOffer: () => Promise<Offer>
  /** Load another address of this page (Settings › AI accounts after Done). */
  readonly navigate: (address: string) => void
  readonly location: Pick<Location, 'pathname' | 'search' | 'hash'>
  readonly formatTime: (at: number) => string
  readonly isMac: boolean
  readonly sleep?: (ms: number) => Promise<void>
  readonly openExternal: (url: string) => void
}

export interface OnboardViewProps {
  readonly t: T
  /** Opened from the app's Help menu rather than on first run: the top row says so. */
  readonly reopened: boolean
  readonly state: FlowState
  readonly viewer: Viewer
  /** The connect panel under the AI-account grid. */
  readonly panel: PanelView
  /** Settings' Language row, already built; absent without a locale service. */
  readonly language?: ReactNode
  readonly languageNote: LanguageNote | null
  readonly offer: Offer | null
  readonly theme: ThemeChoice
  readonly notify: NotifyStatus | null
  readonly isMac: boolean
  readonly formatTime: (at: number) => string
  readonly dispatch: (action: FlowAction) => void
  /** The account menu's row is hidden: the header button offers "Show in account menu". */
  readonly menuHidden: boolean
  /** The header button: hide the row when shown, show it when hidden; the screen stays. */
  readonly onToggleMenu: () => void
  readonly onRefresh: () => void
  readonly onInstall: (vendor: Vendor) => void
  readonly onPick: (id: string) => void
  readonly onConnect: () => void
  readonly onConnectCancel: () => void
  readonly onConnectReopen: () => void
  readonly onConnectSubmit: (url: string) => void
  readonly onCopy: (code: string) => Promise<boolean>
  readonly onTheme: (id: ThemeChoice) => void
  readonly onNotifyToggle: (on: boolean) => void
  readonly onNotifyTest: () => void
  readonly onNotifySettings: () => void
  /** Absent when the app offers no sound picker. */
  readonly onNotifySound?: (name: string) => void
}

export function OnboardView(props: OnboardViewProps): JSX.Element {
  const { t, state, offer, dispatch } = props
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    dialog.current?.focus()
  }, [])
  const keys = STEP_KEYS[state.step] ?? 'account'
  const done = stepsDone({ connected: (offer?.connected.length ?? 0) > 0, notify: props.notify }).slice(
    0,
    state.steps
  )
  const last = state.step === state.steps - 1
  const catalogue = offer?.catalogue ?? []
  const body =
    state.step === 0 ? (
      <SignInStep t={t} viewer={props.viewer} />
    ) : state.step === 1 ? (
      <AccountStep
        t={t}
        view={accountView(catalogue, state, offer?.connected ?? [])}
        picked={state.picked}
        panel={props.panel}
        connected={offer?.connected ?? []}
        account={props.viewer.email}
        onPick={props.onPick}
        onToggleMore={() => dispatch({ type: 'toggleMore' })}
        onRefresh={props.onRefresh}
        onInstall={props.onInstall}
        onConnect={props.onConnect}
        onCancel={props.onConnectCancel}
        onReopen={props.onConnectReopen}
        onSubmit={props.onConnectSubmit}
        onCopy={props.onCopy}
        onOpenAccounts={() => dispatch({ type: 'finish' })}
      />
    ) : state.step === 2 ? (
      <AppearanceStep
        t={t}
        theme={props.theme}
        onTheme={props.onTheme}
        language={props.language}
        note={props.languageNote}
      />
    ) : (
      <NotificationStep
        t={t}
        status={props.notify}
        formatTime={props.formatTime}
        onToggle={props.onNotifyToggle}
        onTest={props.onNotifyTest}
        onOpenSettings={props.onNotifySettings}
        onSound={props.onNotifySound}
      />
    )
  return (
    <div
      className="tv-onboard tv-ob-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) dispatch({ type: 'dismiss' })
      }}
    >
      <section
        ref={dialog}
        className="tv-ob-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.label')}
        tabIndex={-1}
        data-tracy-onboard=""
        data-step-index={state.step}
      >
        <div className="tv-ob-inner">
          <div className="tv-ob-top">
            <span className="tv-ob-logo-mark" aria-hidden="true">
              {PRODUCT_INITIAL}
            </span>
            <span className="tv-ob-logo-name">{PRODUCT}</span>
            <span className="tv-ob-eyebrow">{props.reopened ? t('eyebrow.reopened') : t('eyebrow')}</span>
            <div className="tv-ob-top-actions">
              <button
                type="button"
                className="tv-ob-hide"
                data-action="hide-menu"
                data-state={props.menuHidden ? 'hidden' : 'shown'}
                title={t(props.menuHidden ? 'action.showInMenuHint' : 'action.hideFromMenuHint')}
                aria-label={t(props.menuHidden ? 'action.showInMenu' : 'action.hideFromMenu')}
                onClick={props.onToggleMenu}
              >
                {props.menuHidden ? <Eye /> : <EyeOff />}
                <span className="tv-ob-hide-label">
                  {t(props.menuHidden ? 'action.showInMenu' : 'action.hideFromMenu')}
                </span>
              </button>
              <button
                type="button"
                className="tv-ob-close"
                data-action="close"
                aria-label={t('action.close')}
                onClick={() => dispatch({ type: 'dismiss' })}
              >
                <X />
              </button>
            </div>
          </div>

          <div className="tv-ob-columns">
            <SetupRail
              t={t}
              step={state.step}
              done={done}
              onJump={(step) => dispatch({ type: 'jump', step })}
            />
            <div className="tv-ob-pane">
              <div className="tv-ob-head">
                <div className="tv-ob-title-row">
                  <h1 className="tv-ob-title">{t(`${keys}.title`)}</h1>
                  <span
                    className={`tv-ob-chip${done[state.step] ? ' tv-ob-done' : ''}`}
                    data-done={done[state.step]}
                  >
                    {done[state.step] && <Check />}
                    {done[state.step] ? t('step.done') : t('step.notDone')}
                  </span>
                </div>
                <p className="tv-ob-subtitle">{t(`${keys}.subtitle`)}</p>
              </div>
              <div className="tv-ob-body">{body}</div>
            </div>
          </div>

          <footer className="tv-ob-footer">
            <button
              type="button"
              className="tv-ob-skip"
              data-action="skip"
              onClick={() => dispatch({ type: 'dismiss' })}
            >
              {t('action.skip')}
            </button>
            <div className="tv-ob-foot-right">
              {state.step > 0 && (
                <button
                  type="button"
                  className="tv-ob-btn tv-ob-btn-outline"
                  data-action="back"
                  onClick={() => dispatch({ type: 'back' })}
                >
                  <ChevronLeft />
                  {t('action.back')}
                </button>
              )}
              <button
                type="button"
                className="tv-ob-btn tv-ob-btn-primary"
                data-action="next"
                onClick={() => dispatch({ type: 'next' })}
              >
                <span>{last ? t('action.done') : t('action.continue')}</span>
                <span className="tv-ob-kbd" aria-hidden="true">
                  {props.isMac ? KBD_MAC : KBD_OTHER}
                </span>
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  )
}

/** Key caps, not words: the same in every language. */
const KBD_MAC = '⌘ ↵'
const KBD_OTHER = 'Ctrl ↵'

const noViewer = { get: () => UNKNOWN_VIEWER, subscribe: () => () => {} }
const noLanguage = {
  getSnapshot: () => null,
  subscribe: () => () => {}
}

/**
 * The screen with its state. Calls `onClosed` once the flow closed and the app recorded it (or
 * failed to: the screen goes either way, and comes back on the next launch if the write failed).
 */
export function Onboard({
  t,
  deps,
  reopened = false,
  menuHidden: menuHiddenAtOpen = false,
  onMenuChanged = () => {},
  onClosed
}: {
  t: T
  deps: OnboardDeps
  /** Opened from the app's Help menu ("Getting started with Tracy Cowork"), not on first run. */
  reopened?: boolean
  /** The account's menu flag as last read when the screen opened. */
  menuHidden?: boolean
  /** The header button changed the account's menu flag (the menu row and Help & about re-read it). */
  onMenuChanged?: () => void
  onClosed: () => void
}): JSX.Element | null {
  const { surface } = deps
  const [menuHidden, setMenuHidden] = useState(menuHiddenAtOpen)
  /** Bumped on each press: only the latest press's read-back draws (two quick presses, two answers). */
  const presses = useRef(0)
  // Shown at once, then what the account says once the door answered: a refused door puts it back.
  const toggleMenu = useCallback(() => {
    const press = ++presses.current
    const hide = !menuHidden
    setMenuHidden(hide)
    void (hide ? surface.onboarding.hideMenu() : surface.onboarding.showMenu())
      .then(() => surface.onboarding.get())
      .then(
        (flags) => {
          if (press === presses.current) setMenuHidden(flags.menuHiddenAt !== null)
        },
        () => {}
      )
      .finally(onMenuChanged)
  }, [menuHidden, surface, onMenuChanged])
  const [state, dispatch] = useReducer(
    reduce,
    { steps: stepsOf(surface), scan: surface.agents !== undefined },
    initialState
  )
  const [offer, setOffer] = useState<Offer | null>(null)
  const [theme, setTheme] = useState<ThemeChoice>(() => deps.theme.get())
  const [notify, setNotify] = useState<NotifyStatus | null>(null)
  const scanAbort = useRef<AbortController | null>(null)
  const viewerStore = deps.viewer ?? noViewer
  const viewer = useSyncExternalStore(viewerStore.subscribe, viewerStore.get, viewerStore.get)

  // The sign-in started here ("Connect now"), one at a time, and its latest state.
  const session = useRef<Connecting | null>(null)
  const [attempt, setAttempt] = useState<ConnectState | null>(null)
  const stopConnect = useCallback(() => {
    session.current?.cancel()
    session.current = null
    setAttempt(null)
  }, [])
  const connect = useCallback(
    (provider: string) => {
      stopConnect()
      session.current = deps.connect(provider, (next) => {
        setAttempt(next)
        if (next.kind === 'connected') {
          setOffer((known) => (known === null ? known : offerWithStatus(known, next.status)))
          deps.publishStatus?.(next.status)
        }
      })
    },
    [deps, stopConnect]
  )

  // Settings' Language row, and the device's languages for the line under it (asked once).
  const language = deps.language
  const languageStore = language?.face ?? noLanguage
  const snapshot = useSyncExternalStore(
    languageStore.subscribe,
    languageStore.getSnapshot,
    languageStore.getSnapshot
  )
  const [deviceLanguages, setDeviceLanguages] = useState<readonly string[] | null | undefined>(undefined)
  useEffect(() => {
    if (!language) return
    let live = true
    language.deviceLanguages().then(
      (list) => live && setDeviceLanguages(list),
      () => live && setDeviceLanguages(null)
    )
    return () => {
      live = false
    }
  }, [language])
  const note = snapshot && deviceLanguages !== undefined ? languageNote(snapshot, deviceLanguages) : null

  const scan = useCallback(
    (catalogue: readonly Vendor[], refresh: boolean) => {
      const agents = surface.agents
      if (agents === undefined) return
      scanAbort.current?.abort()
      const controller = new AbortController()
      scanAbort.current = controller
      dispatch({ type: 'rescan' })
      void scanAgents(
        { agents },
        catalogue.map((v) => v.id),
        {
          refresh,
          sleep: deps.sleep,
          signal: controller.signal,
          onAnswer: (detection) => dispatch({ type: 'detected', detection })
        }
      ).then((last) => {
        if (controller.signal.aborted) return
        if (last === null) dispatch({ type: 'detectFailed' })
        else if (!last.scanComplete) dispatch({ type: 'scanStopped' })
      })
    },
    [surface, deps.sleep]
  )

  // On open: what the deployment offers, then the scan; the notification status. Once both are
  // known the screen moves to the first step not done (unless the person moved already).
  useEffect(() => {
    let live = true
    const offered = deps.readOffer().then((read) => {
      if (live) {
        setOffer(read)
        dispatch({ type: 'connected', ids: read.connected })
        scan(read.catalogue, false)
      }
      return read
    })
    const notifications = surface.notifications
    const status = notifications
      ? notifications.status().then(
          (answer) => {
            if (live) setNotify(answer)
            return answer
          },
          () => null
        )
      : Promise.resolve(null)
    void Promise.all([offered, status]).then(([read, answer]) => {
      const done = stepsDone({ connected: read.connected.length > 0, notify: answer })
      if (live) dispatch({ type: 'startAt', step: firstUndone(done.slice(0, stepsOf(surface))) })
    })
    // The app reads macOS's permission again when its window gets the focus (back from System
    // Settings) and pushes it; an app without the push keeps the first answer.
    const unwatch = notifications?.onChange?.((answer) => {
      if (live) setNotify(answer)
    })
    return () => {
      live = false
      scanAbort.current?.abort()
      session.current?.cancel()
      unwatch?.()
    }
    // Once per opening of the screen.
  }, [])

  // ⌘↵ / Ctrl↵ and Escape, ahead of the page's own shortcuts while the screen is up.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        event.stopPropagation()
        dispatch({ type: 'next' })
      } else if (event.key === 'Escape') {
        if (menuOpen()) return
        event.preventDefault()
        event.stopPropagation()
        dispatch({ type: 'dismiss' })
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // Closed: record it where the surface keeps it (this device, the account), then lead a completed flow to the picked account's row.
  const closed = state.closed
  useEffect(() => {
    if (closed === null) return
    scanAbort.current?.abort()
    session.current?.cancel()
    const record: Closed = { outcome: closed.outcome, picked: closed.picked }
    // Done leads to Settings › AI accounts only while the picked vendor is not connected yet. The
    // built-in Tracy AI card has nothing to connect: closing with it picked goes nowhere.
    const lead =
      record.outcome === 'completed' &&
      record.picked !== null &&
      record.picked !== TRACY &&
      offer !== null &&
      offer.connect &&
      !offer.connected.includes(record.picked)
    surface.onboarding.close(record).then(
      () => {
        onClosed()
        if (lead && record.picked !== null) deps.navigate(aiAccountsAddress(deps.location, record.picked))
      },
      () => onClosed()
    )
    // Once, when the flow closes.
  }, [closed])

  const panel = useMemo(
    () =>
      offer === null
        ? ({ kind: 'none' } as const)
        : connectPanel({ catalogue: offer.catalogue, picked: state.picked, offer, attempt }),
    [offer, state.picked, attempt]
  )
  const languageRow = useMemo(
    () =>
      language ? <LanguageRow t={language.t} language={language.face} menuScope="tv-onboard" /> : undefined,
    [language]
  )

  const view = useMemo(
    () => ({
      t,
      reopened,
      state,
      viewer,
      panel,
      language: languageRow,
      languageNote: note,
      offer,
      theme,
      notify,
      isMac: deps.isMac,
      formatTime: deps.formatTime,
      dispatch,
      menuHidden,
      onToggleMenu: toggleMenu,
      onRefresh: () => scan(offer?.catalogue ?? [], true),
      onInstall: (vendor: Vendor) => {
        if (vendor.homepage !== null) deps.openExternal(vendor.homepage)
      },
      // Another vendor while a sign-in is under way: that sign-in stops (its callback no longer counts).
      onPick: (id: string) => {
        if (session.current !== null && session.current.provider !== id) stopConnect()
        dispatch({ type: 'pick', id })
      },
      onConnect: () => {
        if (state.picked !== null) connect(state.picked)
      },
      onConnectCancel: stopConnect,
      onConnectReopen: () => {
        const url =
          attempt?.kind === 'browser'
            ? attempt.authorizeUrl
            : attempt?.kind === 'device'
              ? attempt.attempt.authorizeUrl
              : null
        if (url) deps.openExternal(url)
      },
      onConnectSubmit: (url: string) => session.current?.submit(url),
      onCopy: (code: string) => deps.copy(code),
      onTheme: (id: ThemeChoice) => {
        setTheme(id)
        deps.theme.set(id)
      },
      onNotifyToggle: (on: boolean) => {
        surface.notifications?.setEnabled(on).then(setNotify, () => {})
      },
      onNotifyTest: () => {
        surface.notifications?.test().then(setNotify, () => {})
      },
      onNotifySettings: () => {
        surface.notifications?.openSystemSettings().catch(() => {})
      },
      onNotifySound:
        typeof surface.notifications?.setSound === 'function'
          ? (name: string) => {
              surface.notifications?.setSound?.(name).then(setNotify, () => {})
            }
          : undefined
    }),
    [
      t,
      reopened,
      state,
      viewer,
      panel,
      languageRow,
      note,
      offer,
      theme,
      notify,
      deps,
      surface,
      scan,
      attempt,
      connect,
      stopConnect,
      menuHidden,
      toggleMenu
    ]
  )

  if (closed !== null) return null
  return <OnboardView {...view} />
}
