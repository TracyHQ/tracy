/**
 * Settings › Help & about (tasks/todo-desktop-help-about.md, mock-up `pa-b.html`): who Tracy is and
 * which build answers, the desktop app's updates where the page runs in the app, and the links to
 * tracy.ai and the community.
 *
 * Three surfaces, told apart without guessing:
 *   web      no `tracyDesktop.app` and no `TracyCowork/` in the user agent — download link;
 *   old-app  the user agent says `TracyCowork/<v>` but the app predates the bridge — its version,
 *            and a line asking to update the app (never shown as the web);
 *   app      the bridge answers — the update row and What's new.
 *
 * Other plugins add rows through the `settings.help.item` list this section declares (contract:
 * `@tracy/core/site-tabs` `HelpItemProps`), drawn after the update rows and before the release notes
 * — `@tracy/dsh-onboard`'s Getting started (Lee, 12/10/2026). This section never imports them.
 *
 * `HelpAboutView` draws from data alone (render tests); `HelpAboutSection` wires it to the update
 * source (desktop-updates.ts), the server build (`GET /api/build`), the clock and the slot.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type MouseEvent,
  type ReactNode
} from 'react'
import { BadgeHelp, BookOpen, Globe, MessagesSquare, ReceiptText } from 'lucide-react'
import { Badge, Button, buttonVariants, cn } from '@tracy/ui'
import { TracyMark } from '@tracy/ui/brand'
import { uiSwitches } from '@tracy/core/ui-switches'
import { interfaceLocale } from '@tracy/core/interface-languages'
import type { HelpItemProps } from '@tracy/core/site-tabs'
import type { AppInfo, UpdateAction, UpdateSource } from './desktop-updates'
import {
  COMMUNITY_PLATFORM,
  DEFAULT_TRACY_SITE,
  DEFAULT_DOCS_SITE,
  DEV_CHANNEL_NAME,
  NOTES_BOX_CAP_PX,
  PRODUCT_NAME,
  appVersionFromUserAgent,
  buildDate,
  helpLinks,
  legalLinks,
  noteLines,
  notesBoxHeight,
  policyNotice,
  relativeTime,
  runningNotes,
  waitingUpdate,
  type HelpLink,
  type InstallMode,
  type NoteLine,
  type UpdateState
} from './help-about-model'

export const HELP_SECTION_ID = 'tracy-help-about'

/** The list of rows other plugins add to this section (declared by its registration in index.tsx). */
export const HELP_ITEM_SLOT = 'settings.help.item'

/**
 * The class of the section's small outline button ("Check for updates"), handed to the slot's rows:
 * merged by `cn` as `<Button>` merges it, so the two are the same string.
 */
const ROW_BUTTON_CLASS = cn(buttonVariants({ variant: 'outline', size: 'sm' }))

type Translate = (key: string, params?: Record<string, unknown>) => string

export type HelpSurface =
  | { readonly kind: 'web' }
  | { readonly kind: 'old-app'; readonly version: string }
  | {
      readonly kind: 'app'
      readonly info: AppInfo | null
      readonly state: UpdateState | null
      readonly saveFailed: boolean
      /** The What's new switch could not be saved (protocol 3). */
      readonly notifySaveFailed?: boolean
      /** The app can open the running version's changelog (protocol 3). */
      readonly changelog?: boolean
    }

export interface BuildInfo {
  readonly commit: string | null
  readonly builtAt: string | null
  readonly desktopVersion?: string | null
}

type Tone = 'ok' | 'busy' | 'ready' | 'warn' | 'error' | 'muted'
interface Offer {
  readonly action: UpdateAction
  readonly label: string
  readonly primary?: boolean
  readonly disabled?: boolean
}

/** What the update row says and offers, for one state. */
export function updateLine(
  t: Translate,
  state: UpdateState,
  now: number,
  locale: string | undefined,
  installMode?: InstallMode | null
): { text: string; tone: Tone; spin?: boolean; offers: Offer[] } {
  const v = { version: state.version ?? '' }
  const check: Offer = { action: 'check', label: t('help.action.check') }
  switch (state.status) {
    case 'off':
      return { text: t('help.updates.off'), tone: 'muted', offers: [] }
    case 'idle':
      return { text: t('help.updates.idle'), tone: 'muted', offers: [check] }
    case 'checking':
      return {
        text: t('help.updates.checking'),
        tone: 'busy',
        spin: true,
        offers: [{ ...check, disabled: true }]
      }
    case 'current':
      return {
        text: t('help.updates.current', { when: relativeTime(state.lastCheckedAt ?? now, now, locale) }),
        tone: 'ok',
        offers: [check]
      }
    case 'downloading':
      return {
        text: t('help.updates.downloading', { ...v, percent: state.percent ?? 0 }),
        tone: 'busy',
        offers: [{ ...check, disabled: true }]
      }
    case 'downloaded': {
      // Restart installs now on every platform; on a Mac or an AppImage quitting installs it too.
      const offers: Offer[] = [{ action: 'restart', label: t('help.action.restart'), primary: true }]
      if (installMode === 'quit') {
        const staged = state.stagedVersion ?? null
        return staged === null
          ? { text: t('help.updates.preparing', v), tone: 'ready', offers }
          : { text: t('help.updates.installsOnQuit', { version: staged }), tone: 'ready', offers }
      }
      return { text: t('help.updates.downloaded', v), tone: 'ready', offers }
    }
    case 'available-manual':
      return {
        text: t('help.updates.manual', v),
        tone: 'warn',
        offers: [{ action: 'download', label: t('help.action.download'), primary: true }]
      }
    case 'error':
      return {
        text:
          state.nextRetryAt === null
            ? t('help.updates.error')
            : t('help.updates.errorRetry', { when: relativeTime(state.nextRetryAt, now, locale) }),
        tone: 'error',
        offers: [{ action: 'check', label: t('help.action.retry') }]
      }
    case 'installing':
      return { text: t('help.updates.installing', v), tone: 'busy', spin: true, offers: [] }
    case 'install-error':
      return {
        text: t('help.updates.installError', v),
        tone: 'error',
        offers: [{ action: 'restart', label: t('help.action.retry'), primary: true }]
      }
    default:
      return { text: '', tone: 'muted', offers: [] }
  }
}

/** The day a policy deadline falls on, in the interface language and the person's own time zone. */
function policyDate(at: number, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(at))
}

/**
 * The scrolling box around the release notes: as tall as the notes when they are short, capped (and
 * scrolling) when they are long — measured once the text is laid out (`notesBoxHeight`).
 */
function NotesBox({ notes, labelledBy }: { notes: string; labelledBy: string }): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(NOTES_BOX_CAP_PX)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Put back the height React wrote: when the result equals the current state, React writes nothing.
    const written = el.style.height
    el.style.height = 'auto'
    const needed = el.scrollHeight
    el.style.height = written
    setHeight(notesBoxHeight(needed))
  }, [notes])
  return (
    <div
      ref={box}
      className="ts-help-notes-box"
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={0}
      style={height === null ? undefined : { height }}
    >
      <Notes lines={noteLines(notes)} />
    </div>
  )
}

/** Release notes as paragraphs and lists, text nodes only: nothing in them is ever markup. */
function Notes({ lines }: { lines: readonly NoteLine[] }): JSX.Element {
  const blocks: JSX.Element[] = []
  let bullets: string[] = []
  const flush = (): void => {
    if (bullets.length === 0) return
    const items = bullets
    bullets = []
    blocks.push(
      <ul key={`u${blocks.length}`}>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are static text in their order
          <li key={index}>{item}</li>
        ))}
      </ul>
    )
  }
  for (const line of lines) {
    if (line.kind === 'bullet') {
      bullets.push(line.text)
      continue
    }
    flush()
    if (line.kind === 'text') blocks.push(<p key={`p${blocks.length}`}>{line.text}</p>)
  }
  flush()
  return <>{blocks}</>
}

const LINK_ICONS = {
  help: BookOpen,
  faq: BadgeHelp,
  pricing: ReceiptText,
  website: Globe,
  community: MessagesSquare
} as const

/** The section, drawn from data alone. */
export function HelpAboutView({
  t,
  locale,
  now,
  build,
  surface,
  onAction,
  onChangelog = () => {},
  onOpen,
  renderItems,
  downloadShown = true
}: {
  t: Translate
  locale: string | undefined
  now: number
  build: BuildInfo | null
  surface: HelpSurface
  onAction: (action: UpdateAction) => void
  downloadShown?: boolean
  /** Full changelog was pressed: the app opens the running version's page. */
  onChangelog?: () => void
  /** A link was pressed: the app opens it in the system browser (and prevents the default). */
  onOpen: (url: string, event: MouseEvent<HTMLAnchorElement>) => void
  /** The `settings.help.item` rows, given the props they receive; absent = none. */
  renderItems?: (props: HelpItemProps) => ReactNode
}): JSX.Element {
  const base = useId()
  const appVersion =
    surface.kind === 'app'
      ? (surface.info?.version ?? null)
      : surface.kind === 'old-app'
        ? surface.version
        : null
  const dev = surface.kind === 'app' && surface.info?.channel === 'dev'
  const state = surface.kind === 'app' ? surface.state : null
  const info = surface.kind === 'app' ? surface.info : null
  const line = state === null ? null : updateLine(t, state, now, locale, info?.installMode)
  const waitingNotes =
    state !== null && waitingUpdate(state) && state.releaseNotes ? state.releaseNotes : null
  // The running version's own notes, from the app bundle: shown whether or not anything waits.
  const ownNotes = runningNotes(info)
  const fresh = state?.whatsNew?.pending === true
  const canChangelog = surface.kind === 'app' && surface.changelog === true && Boolean(info?.notesPage)
  const policy = policyNotice(state?.policy)
  const serverLabel =
    build?.commit && build.builtAt
      ? t('help.serverVersion', { date: buildDate(build.builtAt, locale), commit: build.commit.slice(0, 7) })
      : null
  const link = (url: string) => ({
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onOpen(url, event)
    }
  })
  const name = (item: HelpLink) => t(`help.link.${item.id}`)

  return (
    <div className="ts-help">
      <div className="ts-help-box">
        <div className="ts-help-app">
          <div className="ts-help-logo">
            <TracyMark size={34} />
          </div>
          <div className="ts-help-app-text">
            <div className="ts-help-name">
              {PRODUCT_NAME}
              {dev && <span className="ts-help-channel">{DEV_CHANNEL_NAME}</span>}
            </div>
            <div className="ts-help-tagline">{t('help.tagline')}</div>
            {(serverLabel !== null || appVersion !== null) && (
              <div className="ts-help-tags">
                {serverLabel !== null && (
                  <Badge variant="secondary" className="ts-help-version ts-help-version-ok">
                    {serverLabel}
                  </Badge>
                )}
                {appVersion !== null && (
                  <Badge variant="secondary" className="ts-help-version ts-help-version-ok">
                    {t('help.appVersion', { version: appVersion })}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {surface.kind === 'web' && downloadShown && (
            <div className="ts-help-download-block">
              <a
                {...link(`${DEFAULT_TRACY_SITE}/download`)}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'ts-help-download')}
              >
                {t('help.downloadApp')}
              </a>
              {build?.desktopVersion && (
                <a
                  {...link(
                    `${DEFAULT_DOCS_SITE}/changelog/desktop/${build.desktopVersion.split('.').slice(0, 2).join('.')}/`
                  )}
                  className="ts-help-version-link ts-help-version-ok"
                  title={t('help.notes.changelog')}
                >
                  {t('help.appVersion', { version: build.desktopVersion })}
                </a>
              )}
            </div>
          )}
        </div>

        {surface.kind === 'old-app' && (
          <div className="ts-help-row">
            <div className="ts-row-text">
              <span className="ts-row-title">{t('help.updates.title')}</span>
              <p className="ts-help-status" aria-live="polite">
                <span className="ts-help-dot" data-tone="warn" aria-hidden="true" />
                <span>{t('help.updates.oldApp')}</span>
              </p>
            </div>
          </div>
        )}

        {surface.kind === 'app' && (
          <div className="ts-help-row">
            <div className="ts-row-text ts-help-grow">
              <span className="ts-row-title">{t('help.updates.title')}</span>
              <p className="ts-help-status" aria-live="polite">
                {line !== null &&
                  (line.spin ? (
                    <span className="ts-help-spin" aria-hidden="true" />
                  ) : (
                    <span className="ts-help-dot" data-tone={line.tone} aria-hidden="true" />
                  ))}
                {line !== null && <span>{line.text}</span>}
              </p>
              {state?.status === 'downloading' && (
                <div
                  className="ts-help-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={state.percent ?? 0}
                  aria-label={line?.text}
                >
                  <span style={{ width: `${state.percent ?? 0}%` }} />
                </div>
              )}
              {policy !== null && (
                <p className="ts-help-status ts-help-policy">
                  <span className="ts-help-dot" data-tone={policy.tone} aria-hidden="true" />
                  <span>
                    {t(policy.key, {
                      version: policy.minimumVersion,
                      date: policy.after === null ? '' : policyDate(policy.after, locale)
                    })}
                  </span>
                </p>
              )}
            </div>
            {line !== null && line.offers.length > 0 && (
              <div className="ts-help-actions">
                {line.offers.map((offer) => (
                  <Button
                    key={offer.action + offer.label}
                    type="button"
                    size="sm"
                    variant={offer.primary ? 'default' : 'outline'}
                    disabled={offer.disabled === true}
                    onClick={() => {
                      onAction(offer.action)
                    }}
                  >
                    {offer.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {renderItems?.({ buttonClassName: ROW_BUTTON_CLASS })}

        {waitingNotes !== null && state !== null && (
          <div className="ts-help-notes">
            <h3 className="ts-help-notes-title" id={`${base}-ready`}>
              {t(state.status === 'downloaded' ? 'help.notes.ready' : 'help.notes.title', {
                version: state.version ?? ''
              })}
            </h3>
            <NotesBox labelledBy={`${base}-ready`} notes={waitingNotes} />
          </div>
        )}

        {ownNotes !== null && info !== null && (
          <div className="ts-help-notes">
            <div className="ts-help-notes-head">
              <h3 className="ts-help-notes-title" id={`${base}-notes`}>
                {t('help.notes.title', { version: info.version })}
                {fresh && <span className="ts-help-new">{t('help.notes.new')}</span>}
              </h3>
              {canChangelog && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ts-help-changelog"
                  onClick={() => {
                    onChangelog()
                  }}
                >
                  {t('help.notes.changelog')}
                </Button>
              )}
            </div>
            <NotesBox labelledBy={`${base}-notes`} notes={ownNotes} />
          </div>
        )}
      </div>

      <div className="ts-help-box">
        {helpLinks(locale).map((item) => {
          const Icon = LINK_ICONS[item.id]
          return (
            <div key={item.id} className="ts-help-link">
              <Icon className="ts-help-link-icon" aria-hidden="true" />
              <span className="ts-row-text ts-help-grow">
                <span className="ts-row-title">{name(item)}</span>
                <span className="ts-row-desc">
                  {'address' in item.sub ? item.sub.address : t(item.sub.key)}
                </span>
              </span>
              <a
                {...link(item.url)}
                // cn merges the variant's border over the base `border-transparent`, as <Button> does.
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ts-help-open')}
                aria-label={t('help.link.openLabel', { name: name(item) })}
              >
                {item.id === 'community' ? COMMUNITY_PLATFORM : t('help.link.open')}
              </a>
            </div>
          )
        })}
      </div>

      <p className="ts-help-legal">
        {legalLinks(locale).map((item, index) => (
          <span key={item.id}>
            {index > 0 && <span aria-hidden="true"> · </span>}
            <a {...link(item.url)}>{t(`help.legal.${item.id}`)}</a>
          </span>
        ))}
      </p>
    </div>
  )
}

/** The system browser through the app, when the page runs in one (any app version has `links`). */
function appOpener(): ((url: string) => void) | null {
  const links = (window as { tracyDesktop?: { links?: { openExternal?: unknown } } }).tracyDesktop?.links
  return typeof links?.openExternal === 'function' ? (links.openExternal as (url: string) => void) : null
}

/** Read `GET /api/build` once; null when it cannot be read (signed out, an older server). */
async function readBuild(): Promise<BuildInfo | null> {
  try {
    const res = await fetch('/api/build', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) return null
    const body = (await res.json()) as Partial<BuildInfo>
    return {
      commit: typeof body.commit === 'string' ? body.commit : null,
      builtAt: typeof body.builtAt === 'string' ? body.builtAt : null,
      desktopVersion:
        typeof body.desktopVersion === 'string' && /^\d+\.\d+\.\d+$/.test(body.desktopVersion)
          ? body.desktopVersion
          : null
    }
  } catch {
    return null
  }
}

/** The section as registered: the view, wired to the app, the server, the clock and the slot. */
export function HelpAboutSection({
  t,
  updates,
  renderSlot
}: {
  t: Translate
  updates: UpdateSource
  /** Renders a declared child slot (dsh hands it to every slot component). */
  renderSlot?: (name: string, owner: Record<string, unknown>) => ReactNode
}): JSX.Element {
  const switches = uiSwitches()
  const downloadShown = useSyncExternalStore(
    switches.subscribe,
    () => switches.isShown('help-desktop-download'),
    () => switches.isShown('help-desktop-download')
  )
  const snapshot = useSyncExternalStore(updates.subscribe, updates.getSnapshot, () => null)
  const [build, setBuild] = useState<BuildInfo | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void readBuild().then((value) => {
      if (live) setBuild(value)
    })
    // Relative times ("2 minutes ago") stay true while the section is open.
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  // What's new is seen once this section is on screen: it mounts only while it is the open section,
  // and a window in the background waits until it is shown. Once per turn of `pending` to true.
  const pending = snapshot?.state?.whatsNew?.pending === true
  useEffect(() => {
    if (!pending) return
    const shown = (): boolean => document.visibilityState !== 'hidden'
    if (shown()) {
      void updates.seen()
      return
    }
    const onShow = (): void => {
      if (!shown()) return
      document.removeEventListener('visibilitychange', onShow)
      void updates.seen()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [pending, updates])

  const oldApp = updates.present ? null : appVersionFromUserAgent(navigator.userAgent)
  const surface: HelpSurface = updates.present
    ? {
        kind: 'app',
        info: snapshot?.info ?? null,
        state: snapshot?.state ?? null,
        saveFailed: snapshot?.saveFailed ?? false,
        notifySaveFailed: snapshot?.notifySaveFailed ?? false,
        changelog: updates.canOpenChangelog
      }
    : oldApp !== null
      ? { kind: 'old-app', version: oldApp }
      : { kind: 'web' }

  return (
    <HelpAboutView
      t={t}
      locale={interfaceLocale()}
      now={now}
      build={build}
      surface={surface}
      downloadShown={downloadShown}
      onAction={(action) => {
        void updates.act(action)
      }}
      onChangelog={() => {
        void updates.openChangelog()
      }}
      onOpen={(url, event) => {
        const open = appOpener()
        if (open === null) return
        event.preventDefault()
        open(url)
      }}
      renderItems={renderSlot ? (props) => renderSlot(HELP_ITEM_SLOT, { ...props }) : undefined}
    />
  )
}
