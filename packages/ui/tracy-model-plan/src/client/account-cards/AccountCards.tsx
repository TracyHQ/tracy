/**
 * The AI-account cards and the connect panel under them, shared by Settings › AI accounts
 * (`../AccountsPane.tsx`) and step 1 of the Getting started screen (`@tracy/dsh-onboard`
 * `AccountStep.tsx`), so a person sees one design before and after onboarding (Lee, 11/10/2026;
 * mock `tasks/evidence/desktop-onboard/mock/settings-ai-accounts.html`).
 *
 * Pure React: no locale registration, no fetch, no per-vendor table. Everything arrives through
 * props — the translated labels (each screen binds them from its own namespace), the vendor marks,
 * which card is picked, which badge each card wears — and every click goes back out as a callback.
 *
 * Class names are the Getting started screen's (`tv-ob-*`, onboard.css), unchanged, so the
 * regression cases REG-PR-1166-* keep matching; the stylesheet is `account-cards.css` beside this
 * file, whose tokens live under the root class `.tv-ac` that the CALLER puts on its container
 * (`.tv-onboard` declares the same tokens already).
 */
import type { JSX, ReactNode } from 'react'

/** One card: a vendor the deployment allows, or the built-in Tracy AI (`builtin`). */
export interface CardVendor {
  readonly id: string
  readonly name: string
  /** The desktop app found the vendor's program on this computer. */
  readonly found?: boolean
  /** Connects with a pasted API key rather than a sign-in. */
  readonly keyVendor?: boolean
  /** Tracy AI: part of the Tracy account, nothing to connect. */
  readonly builtin?: boolean
}

/** What a card's badge says: first in the order, connected, or Tracy AI not first. */
export type CardBadge = 'default' | 'connected' | 'included' | null

/** The words the grid shows, translated by the caller. */
export interface CardsLabels {
  /** "Included with your Tracy account" */
  readonly included: string
  /** "Found on this computer" */
  readonly found: string
  /** "Popular" */
  readonly popular: string
  readonly refresh: string
  readonly showMore: (n: number) => string
  readonly showLess: string
  /** Default / Connected / Included */
  readonly badge: Readonly<Record<Exclude<CardBadge, null>, string>>
  /** Accessible name of the check mark on the picked card, e.g. "Selected". */
  readonly picked: string
}

export interface CardsGridProps {
  readonly labels: CardsLabels
  /** The built-in card, always the first section. */
  readonly tracy: CardVendor
  /** "Found on this computer" (desktop, `scanning`) or "Popular" (web): the cards shown at once. */
  readonly found: readonly CardVendor[]
  /** The rest, behind "Show N more". */
  readonly more: readonly CardVendor[]
  /** True in the desktop app: the section is "Found on this computer" with a count and Refresh. */
  readonly scanning: boolean
  /** A scan runs: a spinner in the section head, Refresh waits. */
  readonly looking?: boolean
  readonly expanded: boolean
  readonly onToggleMore: () => void
  readonly picked: string | null
  readonly onPick: (id: string) => void
  readonly badgeOf: (id: string) => CardBadge
  /** The vendor's logo; the caller owns the per-vendor table. */
  readonly mark: (id: string) => ReactNode
  readonly onRefresh?: () => void
  /**
   * What the section head counts: a number as given, `null` for no count at all (an empty scan,
   * a scan under way), omitted = the cards marked `found` (desktop only).
   */
  readonly count?: number | null
  /** Drawn under the found grid and above "Show N more": the connect panel of the picked card. */
  readonly children?: ReactNode
}

const Check = (): JSX.Element => (
  <svg
    width={10}
    height={10}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const Refresh = (): JSX.Element => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
)

function AgentCard({
  vendor,
  picked,
  badge,
  labels,
  mark,
  onPick
}: {
  vendor: CardVendor
  picked: boolean
  badge: CardBadge
  labels: CardsLabels
  mark: ReactNode
  onPick: (id: string) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="tv-ob-agent"
      aria-pressed={picked}
      title={vendor.name}
      data-agent={vendor.id}
      data-found={vendor.found === true}
      onClick={() => onPick(vendor.id)}
    >
      <span className="tv-ob-agent-icon">{mark}</span>
      <span className="tv-ob-agent-name">{vendor.name}</span>
      {badge !== null && (
        <span className={badge === 'default' ? 'tv-ob-badge' : 'tv-ob-badge tv-ob-order'} data-badge={badge}>
          {labels.badge[badge]}
        </span>
      )}
      {picked && (
        <span className="tv-ob-check" aria-label={labels.picked} role="img">
          <Check />
        </span>
      )}
    </button>
  )
}

/** The cards in their sections, the caller's panel under the found grid, and the fold. */
export function CardsGrid(props: CardsGridProps): JSX.Element {
  const { labels, scanning, looking = false, expanded, more, found } = props
  const count =
    props.count !== undefined ? props.count : scanning ? found.filter((v) => v.found === true).length : null
  const card = (vendor: CardVendor) => (
    <AgentCard
      key={vendor.id}
      vendor={vendor}
      picked={props.picked === vendor.id}
      badge={props.badgeOf(vendor.id)}
      labels={labels}
      mark={props.mark(vendor.id)}
      onPick={props.onPick}
    />
  )
  return (
    <div className="tv-ob-stack" data-cards={scanning ? 'scan' : 'popular'}>
      <section>
        <div className="tv-ob-section-head">
          <span>{labels.included}</span>
        </div>
        <div className="tv-ob-grid">{card(props.tracy)}</div>
      </section>
      {(found.length > 0 || scanning) && (
        <section>
          <div className="tv-ob-section-head">
            {looking && <span className="tv-ob-spinner" aria-hidden="true" />}
            <span>{scanning ? labels.found : labels.popular}</span>
            {count !== null && <span className="tv-ob-count">{count}</span>}
            {scanning && props.onRefresh && (
              <button
                type="button"
                className="tv-ob-text-btn"
                data-action="refresh"
                disabled={looking}
                onClick={props.onRefresh}
              >
                <Refresh />
                {labels.refresh}
              </button>
            )}
          </div>
          <div className="tv-ob-grid">{found.map(card)}</div>
        </section>
      )}
      {props.children}
      {more.length > 0 && (
        <section>
          <button
            type="button"
            className="tv-ob-disclosure"
            aria-expanded={expanded}
            onClick={props.onToggleMore}
          >
            {expanded ? labels.showLess : labels.showMore(more.length)}
          </button>
          {expanded && <div className="tv-ob-more tv-ob-grid">{more.map(card)}</div>}
        </section>
      )}
    </div>
  )
}

/**
 * Where the picked card's connection stands. `device` is a pending sign-in by a code; `tracy` is
 * the built-in card (drawn as connected); `key` a key vendor waiting for its key; `off` says
 * connecting one's own account is turned off here.
 */
export type PanelState = 'idle' | 'pending' | 'device' | 'error' | 'connected' | 'key' | 'tracy' | 'off'

/** The CSS state the stylesheet paints for each panel state. */
const CSS_STATE: Readonly<Record<Exclude<PanelState, 'off'>, 'idle' | 'pending' | 'error' | 'connected'>> = {
  idle: 'idle',
  key: 'idle',
  pending: 'pending',
  device: 'pending',
  error: 'error',
  connected: 'connected',
  tracy: 'connected'
}

const Line = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

/** The panel's icon when the caller sends none. */
function defaultIcon(state: Exclude<PanelState, 'off'>): ReactNode {
  switch (state) {
    case 'pending':
    case 'device':
      return <span className="tv-ob-spinner" aria-hidden="true" />
    case 'error':
      return (
        <Line>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </Line>
      )
    case 'connected':
    case 'tracy':
      return (
        <Line>
          <path d="M20 6 9 17l-5-5" />
        </Line>
      )
    case 'key':
      return (
        <Line>
          <path d="m21 2-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L19 3m-4 4 2 2" />
        </Line>
      )
    default:
      return (
        <Line>
          <path d="M12 22v-5M9 8V2M15 8V2M18 8H6v4a6 6 0 0 0 12 0z" />
        </Line>
      )
  }
}

export interface ConnectPanelProps {
  readonly state: PanelState
  readonly icon?: ReactNode
  readonly title: string
  readonly line: string
  /** The buttons on the right of the row (Connect now, Set as default, Disconnect…). */
  readonly actions?: ReactNode
  /** Under the row: a device code, the paste-URL form, the key form. */
  readonly children?: ReactNode
  /** The line is an error (`role="alert"`), announced when it appears. */
  readonly alert?: boolean
}

/** The panel under the grid: the picked card's state, its one line, and what to do about it. */
export function ConnectPanel({
  state,
  icon,
  title,
  line,
  actions,
  children,
  alert = false
}: ConnectPanelProps): JSX.Element {
  if (state === 'off')
    return (
      <div className="tv-ob-note" data-connect="off">
        {line}
      </div>
    )
  return (
    <div className="tv-ob-connect" data-state={CSS_STATE[state]} data-connect={state}>
      <div className="tv-ob-connect-row">
        <span className="tv-ob-connect-icon">{icon ?? defaultIcon(state)}</span>
        <div className="tv-ob-connect-text">
          <div className="tv-ob-connect-title">{title}</div>
          <div className="tv-ob-connect-line" role={alert ? 'alert' : undefined}>
            {line}
          </div>
        </div>
        {actions !== undefined && actions !== null && actions !== false && (
          <div className="tv-ob-connect-actions">{actions}</div>
        )}
      </div>
      {children}
    </div>
  )
}
