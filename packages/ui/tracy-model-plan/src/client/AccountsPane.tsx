/**
 * Settings › AI accounts: the person's AI accounts, their default and their fallbacks, drawn with
 * the same cards and connect panel as step 1 of the Getting started screen (`./account-cards`;
 * Lee, 11/10/2026, mock tasks/evidence/desktop-onboard/mock/settings-ai-accounts.html).
 *
 * WHAT THE SERVER SAYS. `GET /api/seat-plan/status` (`apps/tracy-web/src/seat-plan/broker.js`)
 * lists the vendors one can connect, the account's connections, and `routing.connectionOrder`: the
 * configured order, connection ids plus the literal `tracy` (Tracy AI, an entry like any other,
 * never removable). The first entry that can answer is the Default; the ones after it are the
 * fallbacks, tried in order. `PUT /api/seat-plan/routing` takes the whole order back, with
 * `expectedVersion`. `next` is the EFFECTIVE route of a new chat (null = Tracy AI), which the line
 * at the bottom reads; the cards and the fallback block read the CONFIGURED order.
 *
 * WHAT THIS FILE DOES. Reads the status (and again on window focus), keeps the connect machinery of
 * `connect.ts` / `device-sign-in.ts` / `plan-doors.ts` (one sign-in at a time, its panel under the
 * cards), and sends every reorder, Set as default and Disconnect to the doors. On the desktop app
 * the vendors whose program is on this computer come first (`found-on-computer.ts`); on the web the
 * first few vendors are "Popular". A `?settings=ai-accounts&vendor=<id>` address
 * (`@tracy/dsh-settings` `settings-link.ts`) arrives as the `vendor` prop and picks that card.
 */
import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { useViewer } from '@tracy/core/seat/viewer'
import { accountStatus } from './account-status.ts'
import {
  type CardBadge,
  type CardVendor,
  type CardsLabels,
  CardsGrid,
  ConnectPanel,
  type PanelState
} from './account-cards/index.ts'
import { type Connecting, isTransient, type SeatPlanStatus, seatPlanApi, startConnect } from './connect.ts'
import { copyText, type DeviceAttempt, openExternal, opensThroughApp } from './device-sign-in.ts'
import { desktopApp, foundOnComputer } from './found-on-computer.ts'
import { connectKey, type KeyFailureKind, signInFor } from './plan-doors.ts'
import type { ModelPlanKey, Translate } from './strings.ts'
import { VENDOR_MARKS } from './vendor-marks.tsx'

type Status = SeatPlanStatus
type Connection = Status['connections'][number]
type Provider = Status['providers'][number] & { readonly homepage?: unknown }

/** The seat-plan doors; the connect flow itself lives in `connect.ts`, shared with the first-run screen. */
const api = seatPlanApi()

/** The entry of the order that is Tracy AI, as the server spells it. */
export const TRACY = 'tracy'
/** Tracy AI's name on the card, the panel and the fallback head: a product name, the same in every language. */
export const TRACY_AI = 'Tracy AI'

/** How many vendors the web shows at once under "Popular" (the first-run screen's number). */
export const POPULAR_COUNT = 6

/** A vendor id as the settings link lets one through; anything else never reaches a selector. */
const VENDOR_ID = /^[a-z][a-z0-9-]*$/

/**
 * The configured order, whole: every connection that has a row, and `tracy` exactly once. An
 * answer from an older tracy-web (no `tracy`, a connection not listed) is completed the way the
 * server does it: `tracy` last, a new connection before a trailing `tracy`, else at the end.
 */
export function fullOrder(status: Pick<Status, 'routing' | 'connections'>): string[] {
  const rows = new Set(status.connections.map((c) => c.connectionId))
  const order: string[] = []
  for (const id of status.routing.connectionOrder) {
    if (order.includes(id)) continue
    if (id === TRACY || rows.has(id)) order.push(id)
  }
  if (!order.includes(TRACY)) order.push(TRACY)
  for (const id of rows) {
    if (order.includes(id)) continue
    if (order[order.length - 1] === TRACY) order.splice(order.length - 1, 0, id)
    else order.push(id)
  }
  return order
}

/** The entries of the order that can answer: Tracy AI, and the connections that are connected. */
export function activeOrder(status: Pick<Status, 'routing' | 'connections'>): string[] {
  return fullOrder(status).filter(
    (id) => id === TRACY || status.connections.some((c) => c.connectionId === id && c.connected)
  )
}

/** `order` with `id` first. */
export function asDefault(order: readonly string[], id: string): string[] {
  return [id, ...order.filter((x) => x !== id)]
}

/**
 * `order` with `a` and `b` swapped (the two active entries a Move up / Move down exchanges; the
 * entries between them, which cannot answer, keep their places).
 */
export function swapped(order: readonly string[], a: string, b: string): string[] {
  const next = [...order]
  const i = next.indexOf(a)
  const j = next.indexOf(b)
  if (i < 0 || j < 0) return next
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * Bring the card of `vendor` in `root` into view and focus it.
 * @returns whether the card was there.
 */
export function focusVendorCard(root: ParentNode | null, vendor: string): boolean {
  if (!root || !VENDOR_ID.test(vendor)) return false
  const card = root.querySelector<HTMLElement>(`[data-agent="${vendor}"]`)
  if (!card) return false
  card.scrollIntoView?.({ block: 'nearest' })
  card.focus()
  // The chat composer focuses itself ~100 ms after the page settles (measured in the app, 10/10/2026)
  // and would take the focus back. Re-take it only while it sits OUTSIDE this section: a person who
  // tabbed to another card in the meantime keeps their place.
  const doc = card.ownerDocument
  for (const delay of [150, 400, 900]) {
    setTimeout(() => {
      if (!card.isConnected) return
      const active = doc.activeElement
      if (active && root.contains(active)) return
      card.focus()
    }, delay)
  }
  return true
}

/**
 * Where a key vendor's API keys are made, for a server that sends no `homepage` (the homepages of
 * `apps/tracy-web/src/lib/desktop-setting.js`). A vendor in neither gets no link.
 */
const KEY_PAGES: Readonly<Record<string, string>> = {
  kimi: 'https://www.kimi.com',
  glm: 'https://z.ai',
  qwen: 'https://bailian.console.aliyun.com'
}

/** @returns the https page where `provider`'s keys are made, or undefined. */
function keyPageOf(provider: Provider): string | undefined {
  if (typeof provider.homepage === 'string' && provider.homepage.startsWith('https://'))
    return provider.homepage
  return Object.hasOwn(KEY_PAGES, provider.id) ? KEY_PAGES[provider.id] : undefined
}

/** The sentence for each reason a pasted key did not connect. */
const KEY_FAILURE_TEXT: Readonly<Record<KeyFailureKind, ModelPlanKey>> = {
  key: 'key.failed.key',
  plan: 'key.failed.plan',
  vendor: 'key.failed.vendor',
  invalid: 'key.failed.invalid',
  conflict: 'key.failed.conflict',
  disabled: 'key.failed.disabled',
  signedOut: 'key.failed.signedOut',
  failed: 'error.connect'
}

/**
 * How a vendor connects. A server that sends no `signIn` keeps the vendor as it always was:
 * Connect, and `connect/start` answers how the sign-in goes on (that server lists only vendors it
 * has that door for). Otherwise the server's word, and a word this page does not know offers nothing.
 */
function vendorSignIn(provider: Provider): 'connect' | 'key' | undefined {
  if (!Object.hasOwn(provider, 'signIn')) return 'connect'
  const kind = signInFor(provider)
  return kind === undefined ? undefined : kind === 'key' ? 'key' : 'connect'
}

/** Why a vendor's last sign-in failed, shown in its panel. */
export interface PanelError {
  readonly vendor: string
  readonly message: string
}

/** The card's logo: the vendor's mark, Tracy's T, or the first letter of the name. */
function markOf(id: string, name: string): ReactNode {
  if (id === TRACY) return <span className="tv-ob-mark-tracy">T</span>
  const Mark = Object.hasOwn(VENDOR_MARKS, id) ? VENDOR_MARKS[id] : undefined
  if (Mark) return <Mark size={id === 'claude' ? 16 : 18} />
  return <span className="tv-ob-letter">{Array.from(name.trim())[0]?.toUpperCase() ?? ''}</span>
}

const Up = (): JSX.Element => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m18 15-6-6-6 6" />
  </svg>
)
const Down = (): JSX.Element => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const External = (): JSX.Element => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 17 17 7M7 7h10v10" />
  </svg>
)

/** The box to paste a vendor's API key in, and Connect; the key lives here until it is sent. */
function KeyForm({
  t,
  vendor,
  page,
  disabled,
  onKey
}: {
  t: Translate
  vendor: string
  page: string | undefined
  disabled: boolean
  onKey: (key: string) => Promise<boolean>
}): JSX.Element {
  const [key, setKey] = useState('')
  const label = t('key.placeholder', { vendor })
  return (
    <>
      <form
        className="tv-ob-paste"
        onSubmit={(e) => {
          e.preventDefault()
          const sent = key.trim()
          if (sent === '' || disabled) return
          void onKey(sent).then((ok) => ok && setKey(''))
        }}
      >
        <input
          className="tv-ob-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={label}
          aria-label={label}
          disabled={disabled}
          data-action="key"
        />
        <button
          type="submit"
          className="tv-ob-btn tv-ob-btn-primary tv-ob-btn-xs"
          disabled={disabled || key.trim() === ''}
        >
          {t('action.connect')}
        </button>
      </form>
      {page && (
        <div className="tv-ob-connect-help">
          <VendorLink href={page}>
            {t('key.where')} <External />
          </VendorLink>
        </div>
      )}
    </>
  )
}

/**
 * A link to a vendor's page. On the web the anchor opens it itself, in a new tab: a person's click on
 * an `<a target="_blank">` is never a popup window (`window.open` with `noopener` is one in Chrome,
 * with no address bar to copy a sign-in's callback address from). In the desktop app the click goes
 * through {@link openExternal}, so the page opens in the person's browser and not inside the app.
 */
function VendorLink({
  href,
  action,
  children
}: {
  href: string
  action?: string
  children: ReactNode
}): JSX.Element {
  return (
    <a
      className="tv-ob-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-action={action}
      onClick={(e) => {
        if (!opensThroughApp()) return
        e.preventDefault()
        openExternal(href)
      }}
    >
      {children}
    </a>
  )
}

/**
 * What a vendor's device page needs that the code alone does not say, per vendor id: a sentence
 * (`{settings}` = the link's words) and the page the link opens. ChatGPT Codex: OpenAI refuses the
 * code while the account's "Device code sign-in" switch is off, and it is off by default.
 */
const DEVICE_NOTES: Readonly<Record<string, { text: ModelPlanKey; link: ModelPlanKey; url: string }>> = {
  codex: {
    text: 'device.codexSecurity',
    link: 'device.codexSecurity.link',
    url: 'https://chatgpt.com/#settings/Security'
  }
}

/** Stands in for the link inside a translated sentence, so the sentence can be cut around it. */
const LINK_MARK = '\u0001'

/** A vendor's note under its code (`DEVICE_NOTES`), the link opened like the other vendor pages. */
function DeviceNote({ t, provider }: { t: Translate; provider: string }): JSX.Element | null {
  const note = Object.hasOwn(DEVICE_NOTES, provider) ? DEVICE_NOTES[provider] : undefined
  if (!note) return null
  const [before, after = ''] = t(note.text, { settings: LINK_MARK }).split(LINK_MARK)
  return (
    <small className="tv-ob-connect-help" data-hint="device-security">
      {/* One flex item, so the link sits inside the sentence. */}
      <span>
        {before}
        <VendorLink href={note.url}>{t(note.link)}</VendorLink>
        {after}
      </span>
    </small>
  )
}

/**
 * A device sign-in under way: the code to type (selectable, with Copy), the vendor's page, and
 * while the polls get no answer from tracy-web (`retrying`) a line saying the page keeps asking.
 */
function DeviceCode({
  t,
  vendor,
  attempt,
  retrying
}: {
  t: Translate
  vendor: string
  attempt: DeviceAttempt
  retrying: boolean
}): JSX.Element {
  // "Copied" on the button for two seconds after a copy went through.
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <>
      <div className="tv-ob-device">
        <code className="tv-ob-code">{attempt.userCode}</code>
        <button
          type="button"
          className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
          data-action="copy"
          onClick={() => void copyText(attempt.userCode).then((ok) => ok && setCopied(true))}
        >
          {t(copied ? 'device.copied' : 'device.copy')}
        </button>
        <button
          type="button"
          className="tv-ob-btn tv-ob-btn-primary tv-ob-btn-xs"
          data-action="reopen"
          onClick={() => openExternal(attempt.authorizeUrl)}
        >
          {t('device.open', { vendor })} <External />
        </button>
      </div>
      <DeviceNote t={t} provider={attempt.provider} />
      <div className="tv-ob-connect-help" role="status">
        {t('device.waiting', { vendor })}
      </div>
      {retrying && (
        <div className="tv-ob-connect-help" data-hint="transient" role="status">
          {t('error.transient')}
        </div>
      )}
    </>
  )
}

/**
 * The address drawn when the attempt's own cannot be read: OpenAI's registered redirect. Drawn in
 * the address-bar picture as a code-like token, never translated.
 */
const CALLBACK_ADDRESS = 'localhost:1455/auth/callback?code=…'

/**
 * Where the vendor sends the browser back after this sign-in, as the address bar shows it: the
 * `redirect_uri` of the attempt's `authorizeUrl` without its scheme (Claude
 * `localhost:53692/callback?code=…`, ChatGPT Codex `localhost:1455/auth/callback?code=…`), else
 * {@link CALLBACK_ADDRESS}.
 * @param authorizeUrl - the vendor's sign-in page, from `connect/start`.
 */
export function callbackAddressOf(authorizeUrl: string): string {
  try {
    const redirect = new URL(new URL(authorizeUrl).searchParams.get('redirect_uri') ?? '')
    if (redirect.host) return `${redirect.host}${redirect.pathname}?code=…`
  } catch {
    /* no readable redirect: the fallback */
  }
  return CALLBACK_ADDRESS
}

/**
 * A browser's address bar holding the callback address, with a bracket under it: what step 3 asks
 * the person to copy. Decoration only (`aria-hidden`); the step's sentence carries the meaning.
 */
function AddressBar({ address }: { address: string }): JSX.Element {
  return (
    <div className="tv-ac-addr" data-illustration="address-bar" aria-hidden="true">
      <div className="tv-ac-addr-bar">
        <svg
          className="tv-ac-addr-glyph"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25v4M8 4.75v.01" />
        </svg>
        <code className="tv-ac-addr-text">{address}</code>
      </div>
      <div className="tv-ac-addr-bracket" />
    </div>
  )
}

/**
 * A browser sign-in under way: the three steps (open and sign in; the browser's error page is
 * expected, with a hint for a sign-in that opened in a window with no address bar; copy the
 * address), then the field for that address and Submit.
 */
function CallbackForm({
  t,
  authorizeUrl,
  busy,
  onSubmit
}: {
  t: Translate
  authorizeUrl: string
  busy: boolean
  onSubmit: (url: string) => void
}): JSX.Element {
  const [url, setUrl] = useState('')
  return (
    <>
      <ol className="tv-ac-steps" data-steps="browser-callback">
        <li data-step="open">
          <span>{t('account.step.open')}</span>{' '}
          <VendorLink href={authorizeUrl} action="reopen">
            {t('account.open')}
          </VendorLink>
        </li>
        <li data-step="refused">
          <span>{t('account.step.refused')}</span>
          <small className="tv-ac-step-hint" data-hint="popup">
            {t('account.step.popup')}
          </small>
        </li>
        <li data-step="copy">
          {t('account.step.copy')}
          <AddressBar address={callbackAddressOf(authorizeUrl)} />
        </li>
      </ol>
      <form
        className="tv-ob-paste"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim() !== '') onSubmit(url.trim())
        }}
      >
        <input
          className="tv-ob-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('account.callbackPlaceholder')}
          aria-label={t('account.callbackPlaceholder')}
          autoComplete="off"
          data-action="callback-url"
        />
        <button
          type="submit"
          className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
          data-action="submit"
          disabled={busy || url.trim() === ''}
        >
          {t('action.submit')}
        </button>
      </form>
    </>
  )
}

export function AccountsPane({ t, vendor }: { t: Translate; vendor?: string }): JSX.Element {
  const [doc, setShown] = useState<Status>()
  // Every answer this section gets is the page's copy too: the account menu's row follows it.
  const setDoc = useCallback((next: Status) => {
    setShown(next)
    accountStatus.publish(next)
  }, [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ provider: string; authorizeUrl: string }>()
  // The vendor whose last sign-in failed, and why: shown in its panel.
  const [failed, setFailed] = useState<PanelError>()
  // A device sign-in: its code shows in its vendor's panel while the section polls; Cancel stops it.
  const [device, setDevice] = useState<DeviceAttempt>()
  // Its polls get no answer from tracy-web right now (a restart, the network); the poll goes on.
  const [retrying, setRetrying] = useState(false)
  // The key vendor whose pasted key is being checked by the server.
  const [submitting, setSubmitting] = useState<string>()
  // The sign-in under way (`connect.ts`); one at a time.
  const session = useRef<Connecting | null>(null)
  const stopAttempt = useCallback(() => {
    session.current?.cancel()
    session.current = null
    setDevice(undefined)
    setRetrying(false)
    setPending(undefined)
  }, [])
  useEffect(() => () => session.current?.cancel(), [])
  const load = useCallback(
    () =>
      api('status')
        .then((next: Status) => {
          setError('')
          setDoc(next)
        })
        .catch(() => setError(t('error.load'))),
    [t, setDoc]
  )
  useEffect(() => {
    void load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  // Desktop app only: which vendors' programs are on this computer; Refresh asks again.
  const scanning = desktopApp(window) !== undefined
  const [found, setFound] = useState<string[]>([])
  const [looking, setLooking] = useState(false)
  const [scan, setScan] = useState(0)
  const providerKey = doc ? doc.providers.map((p) => p.id).join('\n') : null
  useEffect(() => {
    if (providerKey === null || providerKey === '') return
    const app = desktopApp(window)
    if (!app) return
    const stop = new AbortController()
    setLooking(true)
    void foundOnComputer(providerKey.split('\n'), { app, signal: stop.signal, onFound: setFound }).finally(
      () => {
        if (!stop.signal.aborted) setLooking(false)
      }
    )
    return () => stop.abort()
  }, [providerKey, scan])

  const [expanded, setExpanded] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const viewer = useViewer()

  // The order and its names, from the status alone.
  const full = useMemo(() => (doc ? fullOrder(doc) : []), [doc])
  const active = useMemo(() => (doc ? activeOrder(doc) : []), [doc])
  const connectionOf = (vendorId: string): Connection | undefined =>
    doc?.connections.find((c) => c.provider === vendorId)
  const entryName = (id: string): string =>
    id === TRACY ? TRACY_AI : (doc?.connections.find((c) => c.connectionId === id)?.name ?? id)
  const entryVendor = (id: string): string =>
    id === TRACY ? TRACY : (doc?.connections.find((c) => c.connectionId === id)?.provider ?? id)

  // The first card picked: the deep link's vendor, else the Default's.
  const section = useRef<HTMLElement | null>(null)
  const pickedOnce = useRef(false)
  useEffect(() => {
    if (!doc || pickedOnce.current) return
    pickedOnce.current = true
    const asked = vendor && doc.providers.some((p) => p.id === vendor) ? vendor : null
    setPicked(asked ?? entryVendor(active[0] ?? TRACY))
    if (asked) {
      // After React has drawn the cards.
      setTimeout(() => focusVendorCard(section.current, asked), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the status first lands
  }, [doc, vendor])

  async function action(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(
        isTransient(e)
          ? t('error.transientRetry')
          : e instanceof Error && e.message
            ? e.message
            : t('error.load')
      )
    } finally {
      setBusy(false)
    }
  }
  /**
   * Start `provider`'s sign-in (`connect.ts`): a code to type, or the vendor's page and a callback
   * URL, pasted or caught by the desktop app. A refusal ends the attempt and shows in that vendor's
   * panel.
   */
  function connect(provider: string) {
    stopAttempt()
    setError('')
    setFailed(undefined)
    setBusy(true)
    session.current = startConnect(provider, {
      call: api,
      events: window,
      openBrowser: openExternal,
      onState: (state) => {
        switch (state.kind) {
          case 'starting':
          case 'completing':
            setBusy(true)
            return
          case 'device':
            setBusy(false)
            setDevice(state.attempt)
            setRetrying(state.retrying === true)
            return
          case 'browser':
            setBusy(false)
            setPending({ provider, authorizeUrl: state.authorizeUrl })
            return
          case 'connected':
            setBusy(false)
            stopAttempt()
            setDoc(state.status)
            return
          case 'failed':
            setBusy(false)
            stopAttempt()
            setFailed({
              vendor: provider,
              message:
                state.reason === 'timeout'
                  ? t('device.timeout')
                  : state.reason === 'transient'
                    ? t('error.transientRetry')
                    : state.message || t('error.load')
            })
        }
      }
    })
  }
  /**
   * Connect a key vendor with the key the person pasted (`plan-doors.ts` `connectKey`). A refusal
   * shows its one sentence in that vendor's panel.
   * @returns whether it connected (the box then clears).
   */
  async function connectWithKey(provider: string, key: string): Promise<boolean> {
    stopAttempt()
    setError('')
    setFailed(undefined)
    setSubmitting(provider)
    try {
      const result = await connectKey(provider, key)
      if (result.kind === 'connected') {
        setDoc(result.status)
        return true
      }
      const name = doc?.providers.find((p) => p.id === provider)?.name ?? provider
      setFailed({ vendor: provider, message: t(KEY_FAILURE_TEXT[result.kind], { vendor: name }) })
      return false
    } finally {
      setSubmitting(undefined)
    }
  }
  /** Send a new order; the answer is the new status. */
  function saveOrder(connectionOrder: string[]) {
    void action(async () =>
      setDoc(
        await api('routing', 'PUT', {
          enabled: true,
          connectionOrder,
          expectedVersion: doc?.routing.version
        })
      )
    )
  }

  if (!doc)
    return (
      <section className="tv-ac tv-ac-pane" data-accounts-pane="loading">
        {error ? (
          <>
            <p className="tv-ac-error" role="alert">
              {error}
            </p>
            <div>
              <button
                type="button"
                className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
                data-action="retry-load"
                onClick={() => void load()}
              >
                {t('action.retry')}
              </button>
            </div>
          </>
        ) : (
          <p className="tv-ac-lead">{t('state.loading')}</p>
        )}
      </section>
    )

  const locked = !doc.enabled
  const labels: CardsLabels = {
    included: t('included.title'),
    found: t('found.computer'),
    popular: t('popular'),
    refresh: t('found.refresh'),
    showMore: (n) => t('more.show', { n }),
    showLess: t('more.less'),
    badge: {
      default: t('badge.default'),
      connected: t('badge.connected'),
      included: t('badge.included')
    },
    picked: t('card.picked')
  }

  // The cards: the found vendors (desktop) or the first few (web) and every connected one at once,
  // the rest behind "Show N more"; a picked card behind the fold opens it.
  const cardOf = (p: Provider): CardVendor => ({
    id: p.id,
    name: p.name,
    found: found.includes(p.id),
    keyVendor: vendorSignIn(p) === 'key'
  })
  const lead = scanning ? new Set(found) : new Set(doc.providers.slice(0, POPULAR_COUNT).map((p) => p.id))
  const atOnce = (p: Provider) => lead.has(p.id) || connectionOf(p.id)?.connected === true
  const primary = doc.providers.filter(atOnce).map(cardOf)
  const more = doc.providers.filter((p) => !atOnce(p)).map(cardOf)
  const opened = expanded || more.some((v) => v.id === picked)

  const badgeOf = (id: string): CardBadge => {
    const entry = id === TRACY ? TRACY : connectionOf(id)?.connectionId
    if (entry === undefined) return null
    const at = active.indexOf(entry)
    if (at === 0) return 'default'
    if (at > 0) return id === TRACY ? 'included' : 'connected'
    return null
  }

  /** "Your default…" or "Fallback n: used when … can't answer." for an entry that can answer. */
  const position = (entry: string): string => {
    const at = active.indexOf(entry)
    if (at < 0) return ''
    if (at === 0) return t('panel.default')
    const names = active.slice(0, at).map(entryName)
    const list = new Intl.ListFormat(interfaceLocale(), { style: 'long', type: 'conjunction' }).format(names)
    return t('panel.fallback', { n: at, list })
  }
  const setDefaultButton = (entry: string) =>
    active[0] === entry ? null : (
      <button
        type="button"
        className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
        data-action="set-default"
        disabled={busy}
        onClick={() => saveOrder(asDefault(full, entry))}
      >
        {t('action.setDefault')}
      </button>
    )

  /** The panel of the picked card. */
  function panel(): JSX.Element | null {
    if (locked || picked === null) return null
    if (picked === TRACY) {
      const line = viewer.email ? t('panel.tracy', { account: viewer.email }) : t('panel.tracyPlain')
      return (
        <ConnectPanel
          state="tracy"
          title={TRACY_AI}
          line={`${line} ${position(TRACY)}`}
          actions={setDefaultButton(TRACY)}
        />
      )
    }
    const provider = doc?.providers.find((p) => p.id === picked)
    if (!provider) return null
    const name = provider.name
    const connection = connectionOf(picked)
    const how = vendorSignIn(provider)
    if (connection?.connected) {
      const keyed = how === 'key'
      const line = keyed
        ? t('panel.connected.key')
        : t('panel.connected.line', { account: connection.account })
      return (
        <ConnectPanel
          state="connected"
          title={t('panel.connected.title', { vendor: name })}
          line={`${line} ${position(connection.connectionId)}`}
          actions={
            <>
              {setDefaultButton(connection.connectionId)}
              <button
                type="button"
                className="tv-ob-btn tv-ob-btn-danger"
                data-action="disconnect"
                disabled={busy || submitting !== undefined}
                onClick={() =>
                  void action(async () =>
                    setDoc(await api('disconnect', 'POST', { connectionId: connection.connectionId }))
                  )
                }
              >
                {t('action.disconnect')}
              </button>
            </>
          }
        />
      )
    }
    const cancel = (
      <button
        type="button"
        className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
        data-action="cancel"
        onClick={stopAttempt}
      >
        {t('action.cancel')}
      </button>
    )
    if (device?.provider === picked)
      return (
        <ConnectPanel
          state="device"
          title={t('panel.pending.title', { vendor: name })}
          line={t('device.enter', { vendor: name })}
          actions={cancel}
        >
          <DeviceCode t={t} vendor={name} attempt={device} retrying={retrying} />
        </ConnectPanel>
      )
    if (pending?.provider === picked)
      return (
        <ConnectPanel
          state="pending"
          title={t('panel.pending.title', { vendor: name })}
          line={t('pending.browser', { vendor: name })}
          actions={cancel}
        >
          <CallbackForm
            t={t}
            authorizeUrl={pending.authorizeUrl}
            busy={busy}
            onSubmit={(url) => session.current?.submit(url)}
          />
        </ConnectPanel>
      )
    const failure = failed?.vendor === picked ? failed.message : undefined
    if (how === 'key') {
      const state: PanelState = 'key'
      return (
        <ConnectPanel
          state={state}
          title={t('panel.key.title', { vendor: name })}
          line={failure ?? t('panel.key.line', { vendor: name })}
          alert={failure !== undefined}
        >
          <KeyForm
            t={t}
            vendor={name}
            page={keyPageOf(provider)}
            disabled={busy || submitting !== undefined}
            onKey={(key) => connectWithKey(provider.id, key)}
          />
        </ConnectPanel>
      )
    }
    if (failure !== undefined)
      return (
        <ConnectPanel
          state="error"
          title={t('panel.error.title', { vendor: name })}
          line={failure}
          alert
          actions={
            <button
              type="button"
              className="tv-ob-btn tv-ob-btn-outline tv-ob-btn-xs"
              data-action="retry"
              disabled={busy}
              onClick={() => connect(provider.id)}
            >
              {t('action.retry')}
            </button>
          }
        />
      )
    if (how === undefined) return <ConnectPanel state="idle" title={name} line={t('status.unavailable')} />
    return (
      <ConnectPanel
        state="idle"
        title={t('panel.idle.title', { vendor: name })}
        line={t('panel.idle.line', { vendor: name })}
        actions={
          <button
            type="button"
            className="tv-ob-btn tv-ob-btn-primary"
            data-action="connect"
            disabled={busy}
            onClick={() => connect(provider.id)}
          >
            {t('panel.connectNow')}
          </button>
        }
      />
    )
  }

  // The fallbacks: the active entries after the first, Move up / Move down between them.
  const first = active[0] ?? TRACY
  const fallbacks = active.slice(1)
  return (
    <section
      ref={section}
      className={`tv-ac tv-ac-pane${locked ? ' tv-ac-locked' : ''}`}
      data-accounts-pane="ready"
    >
      <p className="tv-ac-lead">{t('account.scope')}</p>
      {locked && (
        <div className="tv-ob-note" data-locked="admin">
          {t('account.disabled')}
        </div>
      )}
      {error && (
        <p className="tv-ac-error" role="alert">
          {error}
        </p>
      )}
      <CardsGrid
        labels={labels}
        tracy={{ id: TRACY, name: TRACY_AI, builtin: true }}
        found={primary}
        more={more}
        scanning={scanning}
        looking={looking}
        expanded={opened}
        onToggleMore={() => setExpanded(!opened)}
        picked={picked}
        onPick={setPicked}
        badgeOf={badgeOf}
        mark={(id) =>
          markOf(id, id === TRACY ? TRACY_AI : (doc.providers.find((p) => p.id === id)?.name ?? id))
        }
        onRefresh={scanning ? () => setScan((n) => n + 1) : undefined}
      >
        {panel()}
      </CardsGrid>
      <section data-fallbacks={fallbacks.length}>
        <div className="tv-ob-section-head tv-ob-fallback-head">
          {t('fallback.title', { vendor: entryName(first) })}
        </div>
        <p className="tv-ob-order-rule">{t('fallback.rule')}</p>
        {fallbacks.length === 0 ? (
          <div className="tv-ob-note">{t('fallback.none', { vendor: entryName(first) })}</div>
        ) : (
          <div className="tv-ob-order">
            {fallbacks.map((entry, i) => (
              <div key={entry} className="tv-ob-order-row" data-entry={entry}>
                <span className="tv-ob-order-n">{i + 1}</span>
                <span className="tv-ob-order-name">{entryName(entry)}</span>
                <span className="tv-ob-order-sub" />
                {fallbacks.length >= 2 && !locked && (
                  <span className="tv-ob-order-btns">
                    <button
                      type="button"
                      className="tv-ob-icon-btn"
                      aria-label={t('routing.up')}
                      data-action="up"
                      disabled={busy || i === 0}
                      onClick={() => saveOrder(swapped(full, entry, fallbacks[i - 1]))}
                    >
                      <Up />
                    </button>
                    <button
                      type="button"
                      className="tv-ob-icon-btn"
                      aria-label={t('routing.down')}
                      data-action="down"
                      disabled={busy || i === fallbacks.length - 1}
                      onClick={() => saveOrder(swapped(full, entry, fallbacks[i + 1]))}
                    >
                      <Down />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="tv-ob-footnote">
        <span>{doc.next ? t('newChat.plan', { vendor: doc.next.name }) : t('newChat.tracy')}</span>
      </div>
    </section>
  )
}
