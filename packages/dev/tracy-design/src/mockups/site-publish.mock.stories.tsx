// Can publishing a site be one button in the site header instead of two unconnected doors?
/**
 * THROWAWAY MOCK — the Publish flow of one site. Not shipped code.
 *
 * WHY THE QUESTION EXISTS. Taking a site out of draft is two doors today and no screen joins them:
 *
 *   - `POST /api/sites/:key/go-live` `{op: 'live' | 'draft', domains?}` (Owner or Editor) turns on
 *     mail, lifts noindex and routes the domains. No client screen calls it.
 *   - `PUT /api/sites/:key/address` + `…/verify` (Owner only) reserves a custom domain, which then
 *     waits on three checks — domain ownership, routing, HTTPS. Its screen is Site settings.
 *
 * THE ANSWER DRAWN HERE (revision 7, 07/10/2026). Not a button in a header: the top header and the
 * sidebar are dsh's, and Tracy draws nothing over them. The two doors meet in the frames Tracy owns:
 *
 *   - the site has a Publish tab of its own (`@tracy/core/site-tabs` `PublishView`): the site head,
 *     then the `Domains` section, where Publish, Back to draft and Connect domain live; the site's
 *     state is written once, in the chip beside the site name;
 *   - the site's Settings tab keeps the same site head and the CMS's settings, and has no Domains
 *     section (revision 6 drew the section there);
 *   - the My Sites table shows each site's state after its name and role, and its `⋯` menu has one
 *     line, `Publish`, right under `Settings`, that opens the Publish tab — the same line for a
 *     draft and a live site.
 *
 * WHAT IS DRAWN AND WHAT IS NOT. Only the inside of the side card: the Publish tab, the Settings
 * tab down to the placeholder for the CMS's settings, and the My Sites table. Everything of dsh — sidebar, header, chat, the tab strip
 * of the side card — is a grey placeholder. The frame is mirrored from the real code by hand; no
 * product module is imported, or the classifier would call this proposal a real screen.
 *
 * WORDS. Sentences that say the same thing as an existing one are copied verbatim from
 * `packages/site/tracy-site-tabs/src/client/strings.ts` (`settings.*`) and
 * `packages/site/tracy-my-sites/src/client/strings.ts` — see `EXISTING` below.
 *
 * NOTHING HERE TALKS TO ANYTHING. Every transition, the failed job and the DNS checks are local
 * state on a timer; `Copy` writes to the clipboard and says so honestly when the browser refuses;
 * every `Open` opens nothing.
 *
 * ⚠ MODE A — Tailwind, Tracy owns `<html>`. The real surface is a dsh plugin, MODE B, plain CSS
 * with `tv-` prefixes: this has to be REWRITTEN, not copied (`DESIGN.md` §0).
 *
 * ⚠ DELETE WHEN THE REAL SCREEN EXISTS (`docs/references/ui-workflow.md`, step 1b).
 */
import {
  type ComponentType,
  type Dispatch,
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState
} from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  cn
} from '@tracy/ui'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Check,
  ChevronDown,
  Circle,
  Copy,
  ExternalLink,
  Globe,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Users
} from 'lucide-react'
import { expect, fireEvent, screen, waitFor, within } from 'storybook/test'

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────

const OWN_DOMAIN = 'acmestudio.com'
/** Illustrative: there is no read door for "published by / since" yet (open point 6). */
const PUBLISHED_AT = 'today, 14:02'
const PUBLISHED_BY = 'Hana'
/**
 * A fixture in the form the address door produces: `randomBytes(24).toString('hex')`, 48 hex
 * characters, under `_tracy.<domain>` (`apps/tracy-web/src/sites/address.js`).
 */
const TXT_TOKEN = '3f9a1c7e5b2d8046a1f3c5e7092b4d6f8a0c2e4b6d810357'
/**
 * NOT a value. The form `go-live.sh` prints for the customer's CNAME; the real tunnel address has
 * to come from the host, and no door returns it (open point 3).
 */
const ROUTING_PLACEHOLDER = '<tunnel-id>.cfargotunnel.com'
/** Said under the placeholder, so nobody types it into a DNS provider. */
const ROUTING_CAPTION = 'Example only. The real value comes from the host.'
const FAILED_LINE = "Couldn't publish. The site is still a draft."
/** Illustrative: what `Details` shows, on one line. */
const FAILED_JOB = 'job go-live · 14:02'
/** One simulated beat of work. Long enough to read the line, short enough to click through. */
const TICK_MS = 900
/** A simulated publish takes this many beats. The host reports no steps (open point 4). */
const PUBLISH_TICKS = 3
/** How long `Copied` stays beside a copy button. */
const COPIED_MS = 1600

/** Copied verbatim from the two plugins' `strings.ts`. */
const EXISTING = {
  /** `settings.url.ownerOnly` */
  ownerOnly: 'Only the site Owner can change its address. Ask the Owner to change it.',
  /** `settings.url.dnsType` · `settings.url.dnsName` · `settings.url.dnsValue` */
  dnsType: 'Record type',
  dnsName: 'Record name',
  dnsValue: 'Record value',
  /** `settings.url.ownership` */
  ownership: 'Domain ownership',
  /** `settings.url.ready` · `settings.url.waiting` · `settings.url.checking` */
  ready: 'Ready',
  waiting: 'Pending',
  checking: 'Checking…',
  /** `settings.openSite` · `settings.openAdmin` */
  openSite: 'Open site',
  openAdmin: 'Open admin',
  /** My Sites: `list.title` · `action.addSites` · `action.more` · `badge.current` */
  sitesTitle: 'Your sites',
  addSites: 'Add sites',
  more: 'More',
  managing: 'Managing',
  /** My Sites: `column.site` · `column.team` · `column.more` */
  columnSite: 'Site',
  columnTeam: 'Team',
  columnMore: 'More',
  /** My Sites `⋯` menu: `more.*` */
  menuLive: 'Open live site',
  menuAdmin: 'Open admin',
  menuCopy: 'Copy address',
  menuTeam: 'Team',
  menuChanges: 'Site changes',
  menuSettings: 'Settings',
  menuLeave: 'Leave site',
  menuDelete: 'Delete site…'
} as const

type Role = 'owner' | 'editor' | 'viewer'
type Status = 'draft' | 'publishing' | 'live'
/** The second card of the Domains section: nothing, the domain form, or the DNS checks. */
type Panel = 'closed' | 'domain' | 'dns'
type Target = 'managed' | 'own'
type View = 'publish' | 'settings' | 'sites'
type SiteKey = 'acme' | 'harbor' | 'northwind'
type CheckState = 'waiting' | 'checking' | 'ready'
/** Domain ownership, routing, HTTPS — in the order they can become ready. */
type Checks = readonly [CheckState, CheckState, CheckState]
/** Where the keyboard is taken after a press removed the thing that was pressed. */
type Focus = 'domains' | 'input' | 'dns' | 'connect' | 'action'

interface Domain {
  name: string
  www: boolean
  checks: Checks
  /** The site answers at it. False while it is still being connected. */
  active: boolean
}

interface SiteInfo {
  key: SiteKey
  name: string
  /** A draft site answers at `<label>.tracy.site`. */
  managed: string
  /** The line under the name in the site head. The versions are illustrative. */
  cms: string
  logo: ComponentType<{ className?: string }>
  /** The viewer's role there, and the state the site starts in. */
  role: Role
  status: Status
  team: readonly string[]
}

const SITES: readonly SiteInfo[] = [
  {
    key: 'acme',
    name: 'Acme Studio',
    managed: 'acme-studio.tracy.site',
    cms: 'WordPress 7.0',
    logo: WordpressIcon,
    role: 'owner',
    status: 'draft',
    team: ['H', 'L', 'A']
  },
  {
    key: 'harbor',
    name: 'Harbor Bakery',
    managed: 'harbor-bakery.tracy.site',
    cms: 'Joomla 6.1.1',
    logo: JoomlaIcon,
    role: 'editor',
    status: 'live',
    team: ['M', 'H']
  },
  {
    key: 'northwind',
    name: 'Northwind Journal',
    managed: 'northwind-journal.tracy.site',
    cms: 'EmDash 0.37',
    logo: EmdashIcon,
    role: 'viewer',
    status: 'live',
    team: ['K', 'H', 'T', 'B']
  }
]

function siteOf(key: SiteKey): SiteInfo {
  return SITES.find((site) => site.key === key) ?? (SITES[0] as SiteInfo)
}

/** What the mockup remembers about one site. */
interface Slice {
  role: Role
  /** False = the server answers 501: the host has no tunnel configuration. */
  setUp: boolean
  status: Status
  /** While publishing: the beats of work already done. */
  step: number
  /** What the running (or last) publish is for. */
  target: Target
  /** The last simulated publish did not finish. The site is still a draft. */
  failed: boolean
  panel: Panel
  domainInput: string
  www: boolean
  domain: Domain | null
  /** The domain that keeps answering while its replacement is being connected, or null. */
  previous: string | null
  /** A still: no timer runs until the person presses something that starts work. */
  hold: boolean
}

interface Fixture extends Slice {
  /** The side card's width: its narrow and its wide end. */
  width: 420 | 760
  view: View
  /** The site the Settings tab shows. */
  siteKey: SiteKey
  /** The "Back to draft" confirmation is open. */
  confirm: boolean
  /** My Sites: the row whose `⋯` menu is open, or null. */
  menu: SiteKey | null
}

interface State extends Fixture {
  /** What a mock control just did, read out in the view's status line. */
  note: string
  /** Where to take the keyboard, and a counter that says "now". */
  focus: Focus | null
  moved: number
  /** The sites that are not on screen, as they were left. */
  stash: Partial<Record<SiteKey, Slice>>
}

const SLICE_KEYS = [
  'role',
  'setUp',
  'status',
  'step',
  'target',
  'failed',
  'panel',
  'domainInput',
  'www',
  'domain',
  'previous',
  'hold'
] as const satisfies readonly (keyof Slice)[]

function sliceOf(s: Slice): Slice {
  return Object.fromEntries(SLICE_KEYS.map((key) => [key, s[key]])) as unknown as Slice
}

function freshSlice(site: SiteInfo): Slice {
  return {
    role: site.role,
    setUp: true,
    status: site.status,
    step: 0,
    target: 'managed',
    failed: false,
    panel: 'closed',
    domainInput: '',
    www: true,
    domain: null,
    previous: null,
    hold: false
  }
}

const DRAFT: Fixture = {
  ...freshSlice(siteOf('acme')),
  width: 420,
  view: 'publish',
  siteKey: 'acme',
  confirm: false,
  menu: null
}

const PENDING_DOMAIN: Domain = {
  name: OWN_DOMAIN,
  www: true,
  checks: ['ready', 'checking', 'waiting'],
  active: false
}
const ACTIVE_DOMAIN: Domain = {
  name: OWN_DOMAIN,
  www: true,
  checks: ['ready', 'ready', 'ready'],
  active: true
}

const FIXTURES = {
  flow: DRAFT,
  flowWide: { ...DRAFT, width: 760 },
  draft: DRAFT,
  connectDomain: { ...DRAFT, panel: 'domain', domainInput: OWN_DOMAIN },
  dnsChecks: { ...DRAFT, panel: 'dns', domainInput: OWN_DOMAIN, domain: PENDING_DOMAIN, hold: true },
  publishing: { ...DRAFT, status: 'publishing', step: 1, hold: true },
  live: { ...DRAFT, status: 'live' },
  liveDomainPending: {
    ...DRAFT,
    status: 'live',
    domainInput: OWN_DOMAIN,
    domain: { ...PENDING_DOMAIN, checks: ['ready', 'ready', 'checking'] },
    hold: true
  },
  liveOnOwnDomain: {
    ...DRAFT,
    status: 'live',
    target: 'own',
    domainInput: OWN_DOMAIN,
    domain: ACTIVE_DOMAIN
  },
  backToDraft: {
    ...DRAFT,
    status: 'live',
    target: 'own',
    domainInput: OWN_DOMAIN,
    domain: ACTIVE_DOMAIN,
    confirm: true
  },
  viewer: { ...DRAFT, role: 'viewer' },
  editor: { ...DRAFT, role: 'editor' },
  failed: { ...DRAFT, failed: true },
  notSetUp: { ...DRAFT, setUp: false },
  mySites: { ...DRAFT, view: 'sites', menu: 'acme' }
} satisfies Record<string, Fixture>

// ── Rules the drawing keeps ───────────────────────────────────────────────────────────────

/** Owner or Editor may publish (ADR 0028), and only where publishing is set up. */
function canPublish(s: Slice) {
  return s.setUp && s.role !== 'viewer'
}

/** Only the Owner may change the address. */
function canChangeAddress(s: Slice) {
  return canPublish(s) && s.role === 'owner'
}

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * The typed domain as a bare host name, or null when it is not one.
 *
 * Deliberately narrow: no scheme, no path, no port, at least two labels, and not an address Tracy
 * already hands out. Anything else must not reach the DNS checks looking like a real domain.
 */
function domainOf(input: string): string | null {
  const name = input.trim().toLowerCase()
  if (name.length === 0 || name.length > 253) return null
  const labels = name.split('.')
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) return null
  // A top-level label of digits only is an IP address or a typo, never a domain.
  if (/^\d+$/.test(labels[labels.length - 1] ?? '')) return null
  if (name === 'tracy.site' || name.endsWith('.tracy.site')) return null
  return name
}

function allReady(domain: Domain | null) {
  return domain?.checks.every((check) => check === 'ready') ?? false
}

function readyCount(domain: Domain) {
  return domain.checks.filter((check) => check === 'ready').length
}

/** The address visitors use right now. */
function addressOf(s: Fixture) {
  return s.domain?.active ? s.domain.name : (s.previous ?? siteOf(s.siteKey).managed)
}

/** A timer is owed: a publish is running, or a check is being made. */
function working(s: Slice) {
  if (s.hold) return false
  return s.status === 'publishing' || (s.domain?.checks.includes('checking') ?? false)
}

// ── State ─────────────────────────────────────────────────────────────────────────────────

type Action =
  | { type: 'view'; view: View }
  | { type: 'menu'; menu: SiteKey | null }
  | { type: 'openSite'; siteKey: SiteKey; view: 'publish' | 'settings' }
  | { type: 'panel'; panel: Panel }
  | { type: 'input'; value: string }
  | { type: 'www'; www: boolean }
  | { type: 'reserve' }
  | { type: 'check' }
  | { type: 'publish'; target: Target }
  | { type: 'confirm'; confirm: boolean }
  | { type: 'draft' }
  | { type: 'note'; note: string }
  | { type: 'tick' }

/** One check forward: the running one becomes ready, the next one starts. */
function advance(checks: Checks): Checks {
  const next = [...checks] as [CheckState, CheckState, CheckState]
  const running = next.indexOf('checking')
  if (running !== -1) next[running] = 'ready'
  const waiting = next.indexOf('waiting')
  if (running !== -1 && waiting !== -1) next[waiting] = 'checking'
  return next
}

/** The same state with the keyboard taken somewhere. */
function move(s: State, focus: Focus): State {
  return { ...s, focus, moved: s.moved + 1 }
}

/**
 * Every transition refuses what the screen has disabled or does not draw. A disabled button is a
 * promise; the reducer keeps it even when a late timer or a second click arrives anyway.
 */
function reduce(s: State, action: Action): State {
  switch (action.type) {
    case 'view':
      if (s.confirm) return s
      return { ...s, view: action.view, menu: null, note: '' }

    case 'menu':
      return { ...s, menu: action.menu, note: '' }

    case 'openSite': {
      // The site left behind keeps what was done to it; the one opened comes back as it was left.
      const stash = { ...s.stash, [s.siteKey]: sliceOf(s) }
      const slice = stash[action.siteKey] ?? freshSlice(siteOf(action.siteKey))
      // The tab opens as dsh opens any tab: the keyboard is not taken to a section of it.
      return {
        ...s,
        ...slice,
        stash,
        siteKey: action.siteKey,
        view: action.view,
        menu: null,
        confirm: false,
        note: ''
      }
    }

    case 'panel': {
      if (s.status === 'publishing') return s
      if (action.panel === 'closed') return move({ ...s, panel: 'closed', note: '' }, 'connect')
      if (!canChangeAddress(s)) return s
      if (action.panel === 'dns') {
        if (s.domain === null || s.domain.active) return s
        return move({ ...s, panel: 'dns', note: '' }, 'dns')
      }
      // The form opens on the domain being connected, so correcting a typo starts from it.
      const domainInput = s.domain !== null && !s.domain.active ? s.domain.name : ''
      return move({ ...s, panel: 'domain', domainInput, note: '' }, 'input')
    }

    case 'input':
      return { ...s, domainInput: action.value, note: '' }

    case 'www':
      return { ...s, www: action.www, note: '' }

    case 'reserve': {
      const name = domainOf(s.domainInput)
      if (name === null || !canChangeAddress(s) || s.status === 'publishing' || s.panel !== 'domain') return s
      const www = s.www && !name.startsWith('www.')
      if (s.domain?.name === name) {
        // The domain the site already answers at: nothing to connect.
        if (s.domain.active) return move({ ...s, panel: 'closed', note: '' }, 'connect')
        // The same pending domain again keeps the checks it already passed.
        return move({ ...s, panel: 'dns', domain: { ...s.domain, www }, note: '' }, 'dns')
      }
      // A replacement starts its checks over, and the address in use keeps answering meanwhile.
      const previous = s.domain?.active ? s.domain.name : s.previous
      const checks: Checks = ['waiting', 'waiting', 'waiting']
      return move(
        { ...s, panel: 'dns', domain: { name, www, checks, active: false }, previous, hold: false, note: '' },
        'dns'
      )
    }

    case 'check': {
      if (!canChangeAddress(s) || s.domain === null || s.domain.active || allReady(s.domain)) return s
      // Already checking: a second press only lets a still start moving.
      if (s.domain.checks.includes('checking')) return { ...s, hold: false, note: '' }
      const checks = [...s.domain.checks] as [CheckState, CheckState, CheckState]
      checks[checks.indexOf('waiting')] = 'checking'
      return { ...s, hold: false, domain: { ...s.domain, checks }, note: '' }
    }

    case 'publish': {
      if (!canPublish(s) || s.status === 'publishing') return s
      if (action.target === 'own') {
        if (!canChangeAddress(s) || s.domain === null || s.domain.active || !allReady(s.domain)) return s
      } else if (s.status !== 'draft') {
        return s
      }
      // The pressed button goes away with the state it belonged to; the section heading stays.
      return move(
        {
          ...s,
          status: 'publishing',
          panel: 'closed',
          step: 0,
          target: action.target,
          failed: false,
          hold: false,
          note: ''
        },
        'domains'
      )
    }

    case 'confirm':
      if (action.confirm) {
        if (s.status !== 'live' || !canPublish(s)) return s
        return { ...s, confirm: true, note: '' }
      }
      if (!s.confirm) return s
      return move({ ...s, confirm: false, note: '' }, 'action')

    case 'draft':
      if (s.status !== 'live' || !s.confirm || !canPublish(s)) return s
      // The mock forgets the connected domain here. What the real site keeps is not decided.
      return move(
        {
          ...s,
          status: 'draft',
          panel: 'closed',
          confirm: false,
          target: 'managed',
          domain: null,
          previous: null,
          domainInput: '',
          failed: false,
          note: ''
        },
        'action'
      )

    case 'note':
      return { ...s, note: action.note }

    case 'tick': {
      // A timer that fires after the work stopped changes nothing.
      if (!working(s)) return s
      if (s.status === 'publishing') {
        if (s.step < PUBLISH_TICKS - 1) return { ...s, step: s.step + 1 }
        // Publishing on the domain is what makes it the address; until then the old one answers.
        if (s.target === 'own' && s.domain !== null && allReady(s.domain)) {
          return {
            ...s,
            status: 'live',
            step: 0,
            domain: { ...s.domain, active: true },
            previous: null
          }
        }
        return { ...s, status: 'live', step: 0 }
      }
      if (s.domain === null) return s
      return { ...s, domain: { ...s.domain, checks: advance(s.domain.checks) } }
    }
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────────────────

interface Props {
  s: State
  dispatch: Dispatch<Action>
}

/**
 * The kit's controls only recolour their border on focus, which disappears on a terracotta
 * button. The mockup adds a ring so the keyboard path is judged along with the rest.
 */
const FOCUS = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring'
const LINK = cn('h-auto rounded-sm p-0 font-normal', FOCUS)
/** The cards of the real Settings tab: `.tv-site-address-box`, `.tv-site-rows`. */
const CARD = 'rounded-[10px] border border-border bg-card'
/** A grid whose one column may be narrower than its content, so a long name wraps inside its own box. */
const ONE_COLUMN = 'grid-cols-[minmax(0,1fr)]'

const STATUS: Record<Status, { label: string; chip: string; dot: string }> = {
  draft: { label: 'Draft', chip: '', dot: 'bg-muted-foreground' },
  publishing: {
    label: 'Publishing…',
    chip: 'border-primary/40 bg-primary/10',
    dot: 'animate-pulse bg-primary motion-reduce:animate-none'
  },
  live: { label: 'Live', chip: 'border-success/50 bg-success/10', dot: 'bg-success' }
}

/** Dot + word. The word carries the state; the colour only repeats it. */
function StatusChip({ status, where }: { status: Status; where: string }) {
  const { label, chip, dot } = STATUS[status]
  return (
    <Badge variant="outline" data-status={status} data-where={where} className={cn('shrink-0 gap-1.5', chip)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </Badge>
  )
}

/**
 * A host name or a record value that breaks only after a dot: each piece between dots is one
 * unbreakable box, so nothing is ever broken in the middle of a word.
 */
function Dotted({ text }: { text: string }) {
  const pieces: { at: number; piece: string }[] = []
  let at = 0
  for (const label of text.split('.')) {
    pieces.push({ at, piece: at + label.length < text.length ? `${label}.` : label })
    at += label.length + 1
  }
  return (
    <>
      {pieces.map(({ at: offset, piece }) => (
        <Fragment key={offset}>
          {offset > 0 && <wbr />}
          <span className="whitespace-nowrap">{piece}</span>
        </Fragment>
      ))}
    </>
  )
}
/** A host name whose single label is longer than its box scrolls sideways instead of being cut. */
const SCROLLS = 'min-w-0 overflow-x-auto'
/** Prose that quotes a host name: it wraps at spaces, and inside the name only when it must. */
const PROSE = '[overflow-wrap:anywhere]'

/** A quiet remark under the controls. */
function Remark({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className={cn('text-muted-foreground text-xs', PROSE)}>
      {children}
    </p>
  )
}

const COPY_REFUSED = 'Could not copy. Select the text and copy it yourself.'

/**
 * A small icon button that really writes to the clipboard, says `Copied` beside itself for a
 * moment, and reports a refusal as a refusal: a mock that always says "Copied" teaches the reviewer
 * a behaviour the browser does not have.
 *
 * Only the latest press may speak. An answer that arrives after a newer press, after the text
 * changed (the caller keys this by its text) or after the button is gone is dropped.
 */
function CopyButton({
  text,
  label,
  say,
  disabled
}: {
  text: string
  label: string
  say: (note: string) => void
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const turn = useRef(0)
  useEffect(
    () => () => {
      turn.current += 1
    },
    []
  )
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function press() {
    turn.current += 1
    const mine = turn.current
    setCopied(false)
    let done = false
    try {
      await navigator.clipboard.writeText(text)
      done = true
    } catch {
      // No clipboard, or the browser refused: said below, never as "Copied".
    }
    if (turn.current !== mine) return
    setCopied(done)
    say(done ? '' : COPY_REFUSED)
  }

  return (
    <span data-copy className="flex flex-none items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn('text-muted-foreground', FOCUS)}
        aria-label={label}
        disabled={disabled}
        onClick={press}
      >
        {copied ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
      </Button>
      {/* Always there and as wide as its word, so saying it moves nothing. */}
      <span role="status" data-copied className="min-w-11 text-muted-foreground text-xs">
        {copied ? 'Copied' : ''}
      </span>
    </span>
  )
}

/** Opens nothing: every address here belongs to a site that does not exist. */
function wouldOpen(what: string) {
  return `Mockup: this would open ${what} in a new tab.`
}

type RowState = 'done' | 'working' | 'next'

function RowIcon({ state, label }: { state: RowState; label: string }) {
  if (state === 'working') return <Spinner label={label} className="shrink-0 motion-reduce:animate-none" />
  if (state === 'done') return <Check aria-hidden className="size-4 shrink-0 text-success" />
  return <Circle aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />
}

/** One line of work: an icon, what it is, and how far it got — in words, never colour alone. */
function WorkRows({
  label,
  rows
}: {
  label: string
  rows: { name: string; state: RowState; text: string }[]
}) {
  return (
    <ul aria-label={label} className="divide-y divide-border rounded-lg border border-border text-[13px]">
      {rows.map((row) => (
        <li key={row.name} data-state={row.state} className="flex items-center gap-2.5 px-3 py-2">
          <RowIcon state={row.state} label={`${row.name}: ${row.text}`} />
          <span className="min-w-0 flex-1">{row.name}</span>
          <span className="shrink-0 text-muted-foreground text-xs">{row.text}</span>
        </li>
      ))}
    </ul>
  )
}

function checkRows(domain: Domain) {
  const [ownership, routing, https] = domain.checks
  const row = (name: string, check: CheckState, waiting: string) => ({
    name,
    state: (check === 'ready'
      ? 'done'
      : check === 'checking'
        ? 'working'
        : 'next') satisfies RowState as RowState,
    text: check === 'ready' ? EXISTING.ready : check === 'checking' ? EXISTING.checking : waiting
  })
  return [
    row(EXISTING.ownership, ownership, EXISTING.waiting),
    row('Routing', routing, EXISTING.waiting),
    // HTTPS cannot be issued for a name that does not route here yet, and the row says so.
    row('HTTPS', https, routing === 'ready' ? EXISTING.waiting : 'Waiting for routing')
  ]
}

// ── Settings tab: the site head ───────────────────────────────────────────────────────────

/**
 * `TabHeader` of `@tracy/core/site-tabs`: the site picker at the left, nothing at the right on
 * Settings. The picker is drawn shut; it is not what this mockup asks about.
 */
function TabHeader({ s, dispatch }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-3">
      <Button
        variant="ghost"
        size="sm"
        className={cn('-ml-1 gap-1.5 px-2 font-semibold', FOCUS)}
        onClick={() =>
          dispatch({ type: 'note', note: 'Mockup: the site picker is not part of this drawing.' })
        }
      >
        {siteOf(s.siteKey).name}
        <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  )
}

/** `SiteHead` of `SettingsView`: tile, name, CMS line, the two places people go — plus the chip. */
function SiteHead({ s, dispatch }: Props) {
  const site = siteOf(s.siteKey)
  const Logo = site.logo
  const say = (note: string) => dispatch({ type: 'note', note })
  return (
    <div data-site-head className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-10 flex-none place-items-center rounded-[10px] border border-border bg-foreground/5"
      >
        <Logo className="size-[22px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate font-semibold text-sm leading-5">{site.name}</span>
          {/* The one place the site's state is written on this tab. */}
          <span aria-live="polite" className="flex flex-none">
            <StatusChip status={s.status} where="head" />
          </span>
        </div>
        <div className="text-muted-foreground text-xs">{site.cms}</div>
      </div>
      <div className="flex flex-none flex-wrap gap-1.5">
        <Button size="sm" className={FOCUS} onClick={() => say(wouldOpen(`https://${addressOf(s)}`))}>
          {EXISTING.openSite}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={FOCUS}
          onClick={() => say(wouldOpen(`the admin of ${site.name}`))}
        >
          {EXISTING.openAdmin}
        </Button>
      </div>
    </div>
  )
}

// ── Publish tab: the Domains section ──────────────────────────────────────────────────────

/** The quiet facts under the address: muted label, value at the right, hairlines only. */
function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl data-facts className="border-border/60 border-t px-3.5 py-1.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 py-1">
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="grid min-w-0 justify-items-end gap-0.5 text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The failed publish: one quiet line, and the job reference behind `Details`. */
function FailedLine() {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div data-line="failed" className="grid gap-0.5 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p role="alert" className="text-destructive">
          {FAILED_LINE}
        </p>
        <Button
          variant="link"
          className={cn(LINK, 'text-muted-foreground text-xs')}
          aria-expanded={open}
          aria-controls={open ? `${id}-details` : undefined}
          onClick={() => setOpen(!open)}
        >
          Details
        </Button>
      </div>
      {open && (
        <p id={`${id}-details`} data-details className="whitespace-nowrap text-muted-foreground">
          {FAILED_JOB}
        </p>
      )}
    </div>
  )
}

/** What the primary card has to tell under its address, in one quiet line — or nothing. */
function PrimaryLine({ s }: { s: State }) {
  if (s.status === 'publishing') return null
  if (!s.setUp) {
    return (
      <p id="publish-not-set-up" data-line="not-set-up" className="text-muted-foreground text-xs">
        Publishing is not set up on this server yet. Ask your administrator.
      </p>
    )
  }
  if (s.role === 'viewer') {
    return (
      <p data-line="viewer" className="text-muted-foreground text-xs">
        Only an Owner or an Editor can publish this site. Ask one of them to publish it.
      </p>
    )
  }
  if (s.failed) return <FailedLine />
  return null
}

/**
 * The other addresses, once the Owner's domain is the address: told, not hidden. Nothing else is
 * listed here — no door returns a site's search-engine or email state (open point 7).
 */
function PrimaryFacts({ s }: { s: State }) {
  if (!s.domain?.active) return null
  const also = [...(s.domain.www ? [`www.${s.domain.name}`] : []), siteOf(s.siteKey).managed]
  return (
    <Facts
      rows={[
        {
          label: 'Also answers at',
          value: also.map((name) => (
            <span key={name} data-host className={cn('max-w-full', SCROLLS)}>
              <Dotted text={name} />
            </span>
          ))
        }
      ]}
    />
  )
}

/** The one action of the primary card: Publish while draft, Back to draft while live. */
function PrimaryAction({ s, dispatch }: Props) {
  if (s.role === 'viewer') return null
  if (s.status === 'publishing') {
    // In the button's place while the work runs; the chip in the site head says it too.
    return (
      <p data-publishing className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Spinner aria-hidden label="Publishing" className="size-3.5 shrink-0 motion-reduce:animate-none" />
        Publishing… this takes about a minute.
      </p>
    )
  }
  if (s.status === 'live') {
    return (
      <Button
        variant="ghost"
        size="sm"
        data-focus="action"
        className={cn('text-destructive hover:bg-destructive/10 hover:text-destructive', FOCUS)}
        disabled={!canPublish(s)}
        onClick={() => dispatch({ type: 'confirm', confirm: true })}
      >
        Back to draft
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      data-focus="action"
      className={FOCUS}
      disabled={!canPublish(s)}
      aria-describedby={s.setUp ? undefined : 'publish-not-set-up'}
      onClick={() => dispatch({ type: 'publish', target: 'managed' })}
    >
      {s.failed ? 'Try again' : 'Publish'}
    </Button>
  )
}

function PrimaryCard({ s, dispatch }: Props) {
  const say = (note: string) => dispatch({ type: 'note', note })
  const address = addressOf(s)
  const pending = s.domain !== null && !s.domain.active ? s.domain : null
  const lead =
    s.status === 'draft'
      ? 'Only people with the link can open it until the site is published.'
      : s.status === 'live'
        ? pending !== null
          ? `Live at the address below. ${pending.name} is still being connected.`
          : `Live since ${PUBLISHED_AT} · published by ${PUBLISHED_BY}`
        : null
  return (
    <div data-card="primary" className={CARD}>
      <div className={cn('grid gap-2 px-3.5 py-3', ONE_COLUMN)}>
        <div className="grid gap-0.5">
          <h3 className="text-muted-foreground text-xs">Primary domain</h3>
          {lead !== null && (
            <p data-lead className={cn('text-[13px]', PROSE)}>
              {lead}
            </p>
          )}
        </div>
        {/* One line when it fits; otherwise the action drops under the address, at the right. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <span data-address data-host className={cn('font-mono text-[13px]', SCROLLS)}>
              <Dotted text={address} />
            </span>
            <CopyButton key={address} text={address} label="Copy address" say={say} />
          </div>
          <div className="ml-auto flex">
            <PrimaryAction s={s} dispatch={dispatch} />
          </div>
        </div>
        <PrimaryLine s={s} />
      </div>
      <PrimaryFacts s={s} />
    </div>
  )
}

/** Step one of connecting a domain, as a card under the primary one. */
function DomainCard({ s, dispatch }: Props) {
  const id = useId()
  const name = domainOf(s.domainInput)
  const typed = s.domainInput.trim().length > 0
  const invalid = typed && name === null
  // A name that already starts with www has no second www address to offer.
  const offerWww = name === null || !name.startsWith('www.')
  return (
    <form
      data-card="domain"
      aria-labelledby={`${id}-title`}
      className={cn(CARD, ONE_COLUMN, 'grid gap-3 p-3.5')}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        dispatch({ type: 'reserve' })
      }}
    >
      <h3 id={`${id}-title`} className="font-semibold text-sm">
        Connect a domain you own
      </h3>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-domain`}>Domain</Label>
        <Input
          id={`${id}-domain`}
          data-focus="input"
          className={FOCUS}
          value={s.domainInput}
          placeholder={OWN_DOMAIN}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
          onChange={(event) => dispatch({ type: 'input', value: event.target.value })}
        />
        <p
          id={`${id}-help`}
          className={cn('text-xs', invalid ? 'text-destructive' : 'text-muted-foreground')}
        >
          Enter the domain without https:// or a path.
        </p>
      </div>
      {offerWww && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${id}-www`}
            className={cn('mt-0.5', FOCUS)}
            checked={s.www}
            onCheckedChange={(www) => dispatch({ type: 'www', www })}
          />
          <Label htmlFor={`${id}-www`} className={cn('block min-w-0 font-normal', PROSE)}>
            Also use www.{name ?? OWN_DOMAIN}
          </Label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className={FOCUS} disabled={name === null}>
          Continue
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={FOCUS}
          onClick={() => dispatch({ type: 'panel', panel: 'closed' })}
        >
          Cancel
        </Button>
      </div>
      <Remark>{addressOf(s)} remains active until every check is ready.</Remark>
    </form>
  )
}

/** Step two: the records to add, the three checks, and the button they unlock. */
function DnsCard({ s, dispatch, domain }: Props & { domain: Domain }) {
  const id = useId()
  const say = (note: string) => dispatch({ type: 'note', note })
  const managed = siteOf(s.siteKey).managed
  const ready = allReady(domain)
  const records = [
    { type: 'TXT', name: `_tracy.${domain.name}`, value: TXT_TOKEN, known: true },
    // The customer points the domain at the host's tunnel; only the form of the value is known.
    { type: 'CNAME', name: domain.name, value: ROUTING_PLACEHOLDER, known: false }
  ]
  return (
    // A group, not a fieldset: a fieldset would draw its own frame.
    <div
      data-card="dns"
      role="group"
      aria-labelledby={`${id}-title`}
      className={cn(CARD, ONE_COLUMN, 'grid gap-3 p-3.5')}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          id={`${id}-title`}
          tabIndex={-1}
          data-focus="dns"
          data-host
          className={cn('rounded-sm font-semibold text-sm outline-none', SCROLLS, FOCUS)}
        >
          <Dotted text={domain.name} />
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className={cn('shrink-0', FOCUS)}
          aria-label="Hide domain checks"
          onClick={() => dispatch({ type: 'panel', panel: 'closed' })}
        >
          Hide
        </Button>
      </div>
      <p className="text-[13px]">Add these records at your domain’s DNS provider, then check again.</p>
      {/* One row per fact, label left and value right, both on one baseline and in one rhythm: a
          line of 18px inside 3px above and below is 24px, the height of the copy button, so a row
          with a button is no taller than one without. The name and the value — what is typed into
          the DNS provider — each have their copy button right after the text; the type is plain
          text. A long value wraps inside the card, its label staying beside its first line. */}
      <ul aria-label="DNS records" className="grid gap-2 text-xs">
        {records.map((record) => (
          <li
            key={record.type}
            data-record={record.type}
            className="rounded-lg border border-border px-2.5 py-2"
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 [overflow-wrap:anywhere]">
              <dt className="py-[3px] text-muted-foreground leading-[18px]">{EXISTING.dnsType}</dt>
              <dd data-record-type className="py-[3px] leading-[18px]">
                {record.type}
              </dd>
              <dt className="py-[3px] text-muted-foreground leading-[18px]">{EXISTING.dnsName}</dt>
              <dd className="flex min-w-0 items-start gap-1">
                <code
                  data-host
                  data-record-name
                  className="min-w-0 py-[3px] font-mono text-xs leading-[18px]"
                >
                  <Dotted text={record.name} />
                </code>
                <CopyButton text={record.name} label={`Copy ${record.type} record name`} say={say} />
              </dd>
              <dt className="py-[3px] text-muted-foreground leading-[18px]">{EXISTING.dnsValue}</dt>
              <dd className="flex min-w-0 items-start gap-1">
                <code
                  data-dns-value
                  data-host
                  className={cn(
                    'min-w-0 py-[3px] text-xs leading-[18px]',
                    record.known ? 'font-mono' : 'font-sans text-muted-foreground'
                  )}
                >
                  <Dotted text={record.value} />
                </code>
                <CopyButton
                  text={record.value}
                  label={`Copy ${record.type} record value`}
                  say={say}
                  // A placeholder on the clipboard ends up pasted into a DNS provider.
                  disabled={!record.known}
                />
              </dd>
              {record.known ? null : (
                <dd className="col-start-2 pb-[3px] text-[11px] text-muted-foreground leading-[18px]">
                  {ROUTING_CAPTION}
                </dd>
              )}
            </dl>
          </li>
        ))}
      </ul>
      <WorkRows label="Domain checks" rows={checkRows(domain)} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className={FOCUS}
          disabled={ready}
          onClick={() => dispatch({ type: 'check' })}
        >
          Check again
        </Button>
        {/* The whole label, always: it wraps in a narrow card and is never cut. */}
        <Button
          size="sm"
          className={cn(
            'h-auto min-h-7 max-w-full whitespace-normal py-1 text-left [overflow-wrap:anywhere]',
            FOCUS
          )}
          disabled={!ready}
          onClick={() => dispatch({ type: 'publish', target: 'own' })}
        >
          Publish on {domain.name}
        </Button>
      </div>
      <Remark>DNS changes can take up to an hour.</Remark>
      {s.status === 'draft' && (
        <Button
          variant="link"
          className={cn(LINK, PROSE, 'justify-self-start whitespace-normal text-left')}
          onClick={() => dispatch({ type: 'publish', target: 'managed' })}
        >
          Publish at {managed} for now
        </Button>
      )}
    </div>
  )
}

/** A domain being connected, folded to one line: how far it is, and the way back in. */
function PendingRow({ s, dispatch, domain }: Props & { domain: Domain }) {
  return (
    <div
      data-card="pending"
      className={cn(
        CARD,
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2 text-[13px]'
      )}
    >
      <span data-host className={cn('font-mono', SCROLLS)}>
        <Dotted text={domain.name} />
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {readyCount(domain)} of {domain.checks.length} checks ready
        {canChangeAddress(s) && s.status !== 'publishing' && (
          <>
            <span aria-hidden>·</span>
            <Button
              variant="link"
              className={LINK}
              aria-label={`View the checks of ${domain.name}`}
              onClick={() => dispatch({ type: 'panel', panel: 'dns' })}
            >
              View
            </Button>
          </>
        )}
      </span>
    </div>
  )
}

function SecondCard({ s, dispatch }: Props) {
  const pending = s.domain !== null && !s.domain.active ? s.domain : null
  if (s.status !== 'publishing' && canChangeAddress(s)) {
    if (s.panel === 'domain') return <DomainCard s={s} dispatch={dispatch} />
    if (s.panel === 'dns' && pending !== null) return <DnsCard s={s} dispatch={dispatch} domain={pending} />
  }
  if (pending !== null) return <PendingRow s={s} dispatch={dispatch} domain={pending} />
  return null
}

/** Says what stops before the button that stops it; the domain is named only when one is connected. */
function BackToDraftDialog({ s, dispatch }: Props) {
  return (
    <AlertDialog open={s.confirm} onOpenChange={(confirm) => dispatch({ type: 'confirm', confirm })}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take {siteOf(s.siteKey).name} back to draft?</AlertDialogTitle>
          <AlertDialogDescription>
            Visitors will stop reaching it until you publish again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {s.domain?.active && (
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            <li>{s.domain.name} stops opening the site</li>
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={FOCUS}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className={FOCUS}
            onClick={() => dispatch({ type: 'draft' })}
          >
            Back to draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The section that replaces today's address box. Its header carries the title and the way to a
 * domain of one's own; the primary card carries the address and the one action on it.
 */
function DomainsSection({ s, dispatch }: Props) {
  const id = useId()
  const owner = canChangeAddress(s)
  // A Viewer is shown no action at all; an Editor sees the Owner's button and why it is not theirs.
  const showConnect = s.role !== 'viewer'
  const whyNot =
    s.setUp && s.role === 'editor' ? `${id}-owner-only` : !s.setUp ? 'publish-not-set-up' : undefined
  return (
    <section data-section="domains" aria-labelledby={`${id}-title`} className={cn('grid gap-2', ONE_COLUMN)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2
          id={`${id}-title`}
          tabIndex={-1}
          data-focus="domains"
          className={cn('rounded-sm font-semibold text-sm leading-5 outline-none', FOCUS)}
        >
          Domains
        </h2>
        {showConnect && (
          <Button
            variant="outline"
            size="sm"
            data-focus="connect"
            className={FOCUS}
            disabled={!owner || s.status === 'publishing'}
            aria-describedby={whyNot}
            onClick={() => dispatch({ type: 'panel', panel: 'domain' })}
          >
            {s.domain?.active ? 'Change domain' : 'Connect domain'}
          </Button>
        )}
      </div>
      {s.setUp && s.role === 'editor' && <Remark id={`${id}-owner-only`}>{EXISTING.ownerOnly}</Remark>}
      <PrimaryCard s={s} dispatch={dispatch} />
      <SecondCard s={s} dispatch={dispatch} />
      {s.status === 'draft' && !s.failed && canPublish(s) && (
        <Remark>You can take the site back to draft at any time.</Remark>
      )}
      <BackToDraftDialog s={s} dispatch={dispatch} />
    </section>
  )
}

/** The site's Publish tab: the site head, then the Domains section. */
function PublishTab({ s, dispatch }: Props) {
  return (
    <>
      <TabHeader s={s} dispatch={dispatch} />
      {/* `.tv-site-settings`: a 20px grid inside 16px of padding. */}
      <div data-tab="publish" className={cn('grid gap-5 p-4', ONE_COLUMN)}>
        <SiteHead s={s} dispatch={dispatch} />
        <DomainsSection s={s} dispatch={dispatch} />
      </div>
    </>
  )
}

/** The site's Settings tab: the same site head and the CMS's settings; no Domains section. */
function SettingsTab({ s, dispatch }: Props) {
  return (
    <>
      <TabHeader s={s} dispatch={dispatch} />
      <div data-tab="settings" className={cn('grid gap-5 p-4', ONE_COLUMN)}>
        <SiteHead s={s} dispatch={dispatch} />
        <div
          aria-hidden
          className="rounded-[10px] border border-border border-dashed px-3.5 py-3 text-muted-foreground text-xs"
        >
          {siteOf(s.siteKey).cms.split(' ')[0]} settings — unchanged, not drawn
        </div>
      </div>
    </>
  )
}

// ── My Sites ──────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }

/** What My Sites knows about a row: the open site as it is now, the others as they were left. */
function rowOf(s: State, site: SiteInfo): { role: Role; status: Status } {
  if (site.key === s.siteKey) return { role: s.role, status: s.status }
  const left = s.stash[site.key]
  return { role: left?.role ?? site.role, status: left?.status ?? site.status }
}

/**
 * The `⋯` of a row — `MoreMenu` of `tracy-my-sites`, its three groups in their order: `Settings`
 * opens the site's Settings tab, and the one line under it, `Publish` — the same words for a draft
 * and a live site — opens the site's Publish tab.
 */
function RowMenu({ s, dispatch, site }: Props & { site: SiteInfo }) {
  const { role } = rowOf(s, site)
  const notDrawn = (what: string) => () =>
    dispatch({
      type: 'note',
      note: `Mockup: "${what}" is today's menu line; it is not part of this drawing.`
    })
  return (
    <DropdownMenu
      open={s.menu === site.key}
      onOpenChange={(open) => dispatch({ type: 'menu', menu: open ? site.key : null })}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={FOCUS}
            aria-label={`${EXISTING.more}: ${site.name}`}
          />
        }
      >
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuLive)}>
          <ExternalLink aria-hidden />
          {EXISTING.menuLive}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuAdmin)}>
          <ExternalLink aria-hidden />
          {EXISTING.menuAdmin}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuCopy)}>
          <Copy aria-hidden />
          {EXISTING.menuCopy}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuTeam)}>
          <Users aria-hidden />
          {EXISTING.menuTeam}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuChanges)}>
          <ListChecks aria-hidden />
          {EXISTING.menuChanges}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dispatch({ type: 'openSite', siteKey: site.key, view: 'settings' })}>
          <Settings aria-hidden />
          {EXISTING.menuSettings}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-new-line
          onClick={() => dispatch({ type: 'openSite', siteKey: site.key, view: 'publish' })}
        >
          <Globe aria-hidden />
          Publish
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={notDrawn(EXISTING.menuLeave)}>
          <LogOut aria-hidden />
          {EXISTING.menuLeave}
        </DropdownMenuItem>
        {role === 'owner' && (
          <DropdownMenuItem variant="destructive" onClick={notDrawn(EXISTING.menuDelete)}>
            <Trash2 aria-hidden />
            {EXISTING.menuDelete}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MySitesTab({ s, dispatch }: Props) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-3">
        <h2 className="truncate font-semibold text-sm">{EXISTING.sitesTitle}</h2>
        <Button
          size="sm"
          className={FOCUS}
          onClick={() => dispatch({ type: 'note', note: 'Mockup: Add sites is not part of this drawing.' })}
        >
          <Plus aria-hidden data-icon="inline-start" />
          {EXISTING.addSites}
        </Button>
      </div>
      <div className="px-3 py-3">
        <div data-sites-table className="rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{EXISTING.columnSite}</th>
                <th className="px-3 py-2 text-left font-medium">{EXISTING.columnTeam}</th>
                <th className="px-3 py-2 text-left font-medium">Agent</th>
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">{EXISTING.columnMore}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SITES.map((site) => {
                const { role, status } = rowOf(s, site)
                return (
                  <tr key={site.key} data-site={site.key}>
                    <td className="px-3 py-2 align-middle">
                      {/* Name, then the viewer's role, then the site's state — which is the new part. */}
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{site.name}</span>
                        <Badge variant="outline" className="shrink-0">
                          {ROLE_LABEL[role]}
                        </Badge>
                        <StatusChip status={status} where="row" />
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="flex -space-x-1.5">
                        {site.team.map((initial) => (
                          <Avatar key={initial} aria-hidden className="size-5 border border-background">
                            <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                          </Avatar>
                        ))}
                      </span>
                      <span className="sr-only">{site.team.length} people</span>
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground text-xs">
                      {site.key === s.siteKey ? (
                        <Badge variant="secondary">{EXISTING.managing}</Badge>
                      ) : (
                        'Started'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <RowMenu s={s} dispatch={dispatch} site={site} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ── The mockup ────────────────────────────────────────────────────────────────────────────

function PublishMock(fixture: Fixture) {
  const [s, dispatch] = useReducer(
    reduce,
    fixture,
    (initial): State => ({ ...initial, note: '', focus: null, moved: 0, stash: {} })
  )
  const card = useRef<HTMLDivElement>(null)

  // One timer at a time, owed only while work is running, and dropped on every change and on
  // unmount — so a late tick can never land on a state that has moved on.
  const busy = working(s)
  const beat = `${s.siteKey}:${s.status}:${s.step}:${s.domain?.name ?? ''}:${s.domain?.checks.join(',') ?? ''}`
  // `beat` is a dependency on purpose: it restarts the timer for every step.
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => dispatch({ type: 'tick' }), TICK_MS)
    return () => clearTimeout(timer)
  }, [busy, beat])

  // A press that removes its own button must not drop the keyboard on the page.
  useEffect(() => {
    if (s.moved === 0 || s.focus === null) return
    const target = card.current?.querySelector<HTMLElement>(`[data-focus="${s.focus}"]`)
    target?.focus()
    target?.scrollIntoView({ block: 'nearest' })
  }, [s.moved, s.focus])

  return (
    <div className="flex h-full min-h-[760px] bg-background text-foreground">
      <div
        aria-hidden
        className="hidden min-w-0 flex-1 bg-muted/40 p-4 text-muted-foreground text-xs sm:block"
      >
        dsh — sidebar, header and chat. Not Tracy’s to draw on.
      </div>
      <div
        ref={card}
        data-side-card={s.width}
        className={cn(
          'flex min-w-0 max-w-full flex-none flex-col border-border border-l bg-background',
          s.width === 760 ? 'w-[760px]' : 'w-[420px]'
        )}
      >
        {/* dsh's tab strip, as a placeholder. Its buttons are the mockup's own way between views. */}
        <nav
          aria-label="Mockup: the side card’s tabs (dsh)"
          className="flex shrink-0 items-center gap-1 border-border border-b bg-muted px-2 py-1"
        >
          {(['sites', 'settings', 'publish'] as const).map((view) => (
            <Button
              key={view}
              variant="ghost"
              size="xs"
              className={cn(s.view === view ? 'bg-background' : 'text-muted-foreground', FOCUS)}
              aria-pressed={s.view === view}
              onClick={() => dispatch({ type: 'view', view })}
            >
              {view === 'sites' ? 'My Sites' : view === 'settings' ? 'Settings' : 'Publish'}
            </Button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {s.view === 'sites' && <MySitesTab s={s} dispatch={dispatch} />}
          {s.view === 'settings' && <SettingsTab s={s} dispatch={dispatch} />}
          {s.view === 'publish' && <PublishTab s={s} dispatch={dispatch} />}
          <p role="status" className="px-4 pb-4 text-muted-foreground text-xs empty:hidden">
            {s.note}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────────────────────

const DESCRIPTION = `
**A proposal, not a screen.** Revision 7 (07/10/2026): publishing is **not** a button in a header —
the top header and the sidebar are dsh's. It lives in the frames Tracy owns in the side card:

1. **The site's Publish tab** — a tab of its own, holding the site head and the \`Domains\` section.
   The Settings tab keeps the same site head and the CMS's settings and has **no** Domains section
   (revision 6 drew the section inside Settings). The site's state
   (\`Draft\` / \`Publishing…\` / \`Live\`) is written **once**: the chip beside the site name in the
   site head. The section header carries the title and \`Connect domain\`; the **Primary domain** card
   carries the address, a small copy button, and the one action on it (\`Publish\` while draft,
   \`Back to draft\` while live). Connecting a domain opens **inline**, as a
   second card. A running publish is one line with a spinner in the action's place; a failure and
   "not set up" are one quiet line under the address.
2. **The My Sites table**: a status chip after each site's name and role, and one line in the
   row's \`⋯\` menu, \`Publish\`, right under \`Settings\` — no ellipsis, the same words for a draft
   and a live site — that opens that site's Publish tab.

Both doors of today — \`POST /api/sites/:key/go-live\` and \`PUT /api/sites/:key/address\` — are behind
that one tab.

**Why \`Connect domain\` is drawn.** Putting a site on the customer's own domain needs two things at
the same moment — the customer points DNS at Tracy, and Tracy is told the domain so its ingress
accepts it. This card is where the customer does both.

**The two DNS records.** The TXT record is in the form the address door produces
(\`_tracy.<domain>\`, a 48-character hex token); the token shown is a fixture. The CNAME value
\`${ROUTING_PLACEHOLDER}\` is only the form the host's go-live script prints: it is a placeholder,
the real value must come from the host, and its **Copy** is disabled for that reason.
 Open **Flow** (side card 420px) or **Flow, wide** (760px) to click through; the
other stories are stills of one state each, drawn at 420px (set \`width\` in Controls for 760).
Switch **Theme** in the toolbar for dark. The grey areas and the tab strip are placeholders for dsh;
the buttons in the strip are the mockup's own way between the three views.

Nothing here publishes anything: every transition is local state on a ${TICK_MS} ms timer.

### Open points — not resolved by this drawing

1. Whether \`go-live\` without a custom domain is meant for customer sites at all (demos use it).
2. The two server paths — address + verify, and go-live with domains — are not joined. The drawing
   treats **Publish** as one action doing both (mail and noindex included).
3. \`address.js\` marks routing and HTTPS as not ready for a custom domain and nothing sets them, so
   no real domain can pass the three checks today. The CNAME's real value is not returned by any
   door either.
4. Whether the job reports per-step progress. The drawing shows one running line either way; steps
   would be an addition to it.
5. The wording for the 207 answer (the host took the work, the published flag could not be set).
6. A read door for "published by / since".
7. Whether a draft site is hidden from search engines and blocked from sending email depends on how it was created; show these only once a door returns them per site.
8. No screen calls the go-live door today.
9. How HTTPS is issued for a customer's domain behind the tunnel is not established.

### What is proposed rather than mirrored

- **My Sites columns.** The brief names \`Site · Team · Agent · More\`; the table in the product today
  is \`Site · CMS · Role · Team · Created · More\`, with the role in a column of its own. The drawing
  follows the brief, so its columns — and the \`Agent\` cell's words — are a proposal too. The menu's
  other lines are today's, in today's order.
- The header button reads \`Change domain\` once a domain of the Owner's is the address.
- A domain being connected folds to one line (\`2 of 3 checks ready · View\`) under the primary card.
- \`Visit site\` and the card's own \`Open\` are gone: the site head's \`Open site\` does it. The head's
  \`Open site\` is a filled button today, so a draft shows two filled buttons.
- The DNS records are one box per record, each a list of rows — label left, value right, both on
  one baseline and all rows in one 24px rhythm. \`Record name\` and \`Record value\` each have a copy
  button right after the text (both are typed into the DNS provider); \`Record type\` is plain text.
  A long value wraps inside the box, its label staying beside its first line.

### What is illustrative

- \`${PUBLISHED_AT}\`, \`${PUBLISHED_BY}\`, the TXT value, \`${FAILED_JOB}\`, the three sites, their
  people and the CMS versions are made up.
- The CNAME row's value is a placeholder in the form \`go-live.sh\` prints, never a real address.
- The publish itself, the failed job and the checks that turn **Ready** after **Check again** are
  simulated. Today the address door reports routing and HTTPS as never ready, and the host takes
  go-live as one background job.
- **Failed** is a simulated failure in which nothing changed. It is **not** the 207 answer.
  \`Details\` shows a made-up job reference.
- After **Back to draft** the mock forgets the connected domain; what the real site keeps is part of
  open point 2. The Tracy address keeps answering beside a custom one (\`Also answers at\`): the host's
  script adds the domain, it does not replace the address.
- **Routing** and **HTTPS** are this drawing's words for the checks Site settings calls
  "Site routing" and "HTTPS certificate"; the rest of the DNS wording is copied from there.
- Every **Open** opens nothing and says so in the status line under the view; the copy buttons write
  to the clipboard, say \`Copied\` for ${COPIED_MS} ms, and report a refusal as one.
`

const meta = {
  title: 'Mockups/Site publish',
  component: PublishMock,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: DESCRIPTION }, story: { inline: false, height: '820px' } }
  },
  argTypes: { width: { control: 'inline-radio', options: [420, 760] } },
  // A still is a starting state: changing an arg in Controls starts the mockup over from it.
  render: (args) => <PublishMock key={JSON.stringify(args)} {...args} />
} satisfies Meta<typeof PublishMock>

export default meta
type Story = StoryObj<typeof meta>
type Play = NonNullable<Story['play']>

const SITE = siteOf('acme')
const SETTLE = { timeout: 10_000 }

/** The one place the site's state is written on a site tab: the chip beside the site name. */
function chipOf(canvasElement: HTMLElement) {
  const chips = canvasElement.querySelectorAll('[data-side-card] [data-status]')
  const head = canvasElement.querySelector('[data-site-head] [data-status]')
  if (head === null || chips.length !== 1)
    throw new Error(`The tab shows the site status ${chips.length} times, expected once in the site head`)
  return head
}

async function expectStatus(canvasElement: HTMLElement, label: string) {
  await expect(chipOf(canvasElement)).toHaveTextContent(label)
  await expect(within(canvasElement).queryByText(/Site status/)).not.toBeInTheDocument()
}

const PUBLISHING_LINE = 'Publishing… this takes about a minute.'

/** What no door returns per site (open point 7), so no state of the drawing may state it. */
const SITE_FACTS = /search engines|email from the site|sending email/i

/** The primary card states nothing about search engines or email, and leaves no empty frame. */
async function expectNoSiteFacts(canvasElement: HTMLElement) {
  const primary = canvasElement.querySelector('[data-card="primary"]')
  if (primary === null) throw new Error('There is no primary card')
  await expect(primary.textContent ?? '').not.toMatch(SITE_FACTS)
  const section = within(canvasElement).getByRole('region', { name: 'Domains' })
  await expect(section.textContent ?? '').not.toMatch(SITE_FACTS)
  for (const facts of primary.querySelectorAll('[data-facts]')) {
    await expect(facts.querySelectorAll('dt').length).toBeGreaterThan(0)
    await expect(facts).toHaveTextContent(/^Also answers at/)
  }
}

/** A host name is drawn as one piece per label, so its text is matched on the element that holds it. */
function wholeHost(text: string) {
  return (_: string, element: Element | null) =>
    element?.hasAttribute('data-host') === true && element.textContent === text
}

function domainsOf(canvasElement: HTMLElement) {
  return within(within(canvasElement).getByRole('region', { name: 'Domains' }))
}

function addressIn(canvasElement: HTMLElement) {
  const address = canvasElement.querySelector('[data-card="primary"] [data-address]')
  if (address === null) throw new Error('The primary card shows no address')
  return address
}

/**
 * Click the mockup through, the way a reviewer would: draft → live → draft, then a domain of the
 * Owner's as far as its checks. Ends on a fresh draft.
 */
const flowPlay: Play = async ({ mount, canvasElement, userEvent, args }) => {
  await mount()
  const domains = domainsOf(canvasElement)

  // A draft: the address and the one action.
  await expectStatus(canvasElement, 'Draft')
  await expect(addressIn(canvasElement)).toHaveTextContent(SITE.managed)
  await expect(
    domains.getByText('Only people with the link can open it until the site is published.')
  ).toBeVisible()
  await expect(domains.queryByRole('radio')).not.toBeInTheDocument()

  // Draft → Publishing… → Live. One line in the button's place.
  await userEvent.click(domains.getByRole('button', { name: 'Publish' }))
  await expectStatus(canvasElement, 'Publishing…')
  await expect(domains.getByText(PUBLISHING_LINE)).toBeVisible()
  await expectNoSiteFacts(canvasElement)
  await expect(domains.queryByRole('list')).not.toBeInTheDocument()
  await expect(domains.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  await waitFor(() => expectStatus(canvasElement, 'Live'), SETTLE)
  await expectNoSiteFacts(canvasElement)
  await expect(domains.queryByText(PUBLISHING_LINE)).not.toBeInTheDocument()

  // Back to draft, cancelled: still live.
  await userEvent.click(domains.getByRole('button', { name: 'Back to draft' }))
  const cancelled = await screen.findByRole('alertdialog', { name: `Take ${SITE.name} back to draft?` })
  // No domain is connected: the sentence alone, and no list at all.
  await expect(
    within(cancelled).getByText('Visitors will stop reaching it until you publish again.')
  ).toBeVisible()
  await expect(within(cancelled).queryByRole('list')).not.toBeInTheDocument()
  await expect(within(cancelled).queryByText(SITE_FACTS)).not.toBeInTheDocument()
  await userEvent.click(within(cancelled).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(), SETTLE)
  await expectStatus(canvasElement, 'Live')

  // Back to draft, confirmed.
  await userEvent.click(domains.getByRole('button', { name: 'Back to draft' }))
  const confirmed = await screen.findByRole('alertdialog')
  await userEvent.click(within(confirmed).getByRole('button', { name: 'Back to draft' }))
  await waitFor(() => expectStatus(canvasElement, 'Draft'), SETTLE)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(), SETTLE)
  await expect(domains.getByRole('button', { name: 'Publish' })).toBeEnabled()
  await expectNoSiteFacts(canvasElement)

  // Draft → Connect domain → DNS checks, inline under the primary card.
  await userEvent.click(domains.getByRole('button', { name: 'Connect domain' }))
  const form = await domains.findByRole('form', { name: 'Connect a domain you own' })
  const input = within(form).getByRole('textbox', { name: 'Domain' })
  await expect(within(form).getByRole('button', { name: 'Continue' })).toBeDisabled()
  await userEvent.type(input, OWN_DOMAIN)
  await userEvent.click(within(form).getByRole('button', { name: 'Continue' }))
  const dns = await domains.findByRole('group', { name: OWN_DOMAIN })
  await expect(within(dns).getByRole('button', { name: `Publish on ${OWN_DOMAIN}` })).toBeDisabled()
  await expect(within(dns).getByText(wholeHost(ROUTING_PLACEHOLDER))).toBeVisible()
  await expectNoSiteFacts(canvasElement)
  await expectStatus(canvasElement, 'Draft')
  await expect(addressIn(canvasElement)).toHaveTextContent(SITE.managed)

  // The Viewer story's own fixture: no radio cards, and neither action is offered.
  await mount(<PublishMock key="viewer" {...FIXTURES.viewer} width={args.width} />)
  const viewer = domainsOf(canvasElement)
  await expect(viewer.queryByRole('radio')).not.toBeInTheDocument()
  await expectNoSiteFacts(canvasElement)
  await expect(viewer.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  await expect(viewer.queryByRole('button', { name: 'Connect domain' })).not.toBeInTheDocument()

  // Hand the reviewer a fresh Owner draft.
  await mount(<PublishMock key="flow" {...args} />)
  await expectStatus(canvasElement, 'Draft')
}

/** Click through at the side card's narrow end. */
export const Flow: Story = { args: FIXTURES.flow, play: flowPlay }

/** The same click-through at the side card's wide end. */
export const FlowWide: Story = { name: 'Flow, wide', args: FIXTURES.flowWide, play: flowPlay }

/** 1 — a draft: where it answers and the one button that publishes it. */
export const Draft: Story = {
  args: FIXTURES.draft,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Draft')
    await expect(domains.getByText('Primary domain')).toBeVisible()
    await expect(addressIn(canvasElement)).toHaveTextContent(SITE.managed)
    await expectNoSiteFacts(canvasElement)
    await expect(domains.getByRole('button', { name: 'Publish' })).toBeEnabled()
    await expect(domains.getByRole('button', { name: 'Connect domain' })).toBeEnabled()
    await expect(domains.getByText('You can take the site back to draft at any time.')).toBeVisible()
    // Trimmed in revision 3: no `Ready` chip, no second way to open the site, and the copy button
    // is an icon with a name.
    await expect(domains.queryByText(EXISTING.ready)).not.toBeInTheDocument()
    await expect(domains.queryByRole('button', { name: /^Open/ })).not.toBeInTheDocument()
    const copy = domains.getByRole('button', { name: 'Copy address' })
    await expect(copy).toBeEnabled()
    await expect(copy).toHaveTextContent('')
    await expect(domains.queryByText('Copied')).not.toBeInTheDocument()
  }
}

/** 2 — the Owner names a domain. Nothing that is not a bare domain gets past this card. */
export const ConnectDomain: Story = {
  name: 'Connect domain',
  args: FIXTURES.connectDomain,
  play: async ({ mount, canvasElement, userEvent, args }) => {
    await mount()
    const domains = domainsOf(canvasElement)
    const form = within(domains.getByRole('form', { name: 'Connect a domain you own' }))
    await expectNoSiteFacts(canvasElement)
    const input = form.getByRole('textbox', { name: 'Domain' })
    const next = form.getByRole('button', { name: 'Continue' })
    await expect(input).toHaveValue(OWN_DOMAIN)
    await expect(next).toBeEnabled()
    await expect(form.getByRole('checkbox', { name: `Also use www.${OWN_DOMAIN}` })).toBeChecked()
    await expect(form.getByText(`${SITE.managed} remains active until every check is ready.`)).toBeVisible()

    // Empty, a scheme, a path, a single label, an address Tracy hands out: none of them continues.
    await userEvent.clear(input)
    await expect(next).toBeDisabled()
    await expect(input).not.toHaveAttribute('aria-invalid')
    for (const bad of [
      `https://${OWN_DOMAIN}`,
      `${OWN_DOMAIN}/shop`,
      'acmestudio',
      '-acme.com',
      SITE.managed
    ]) {
      await userEvent.clear(input)
      await userEvent.type(input, bad)
      await expect(next).toBeDisabled()
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      // Enter submits the form; the refusal has to hold there too.
      await userEvent.keyboard('{Enter}')
      await expect(domains.getByRole('form', { name: 'Connect a domain you own' })).toBeVisible()
      await expect(domains.queryByText(EXISTING.dnsType)).not.toBeInTheDocument()
    }

    await mount(<PublishMock key="restored" {...args} />)
  }
}

/** 3 — the records to add and the three checks. Publishing on the domain waits for all three. */
export const DnsChecks: Story = {
  name: 'DNS checks',
  args: FIXTURES.dnsChecks,
  play: async ({ mount, canvasElement, userEvent, args }) => {
    await mount()
    const dns = within(domainsOf(canvasElement).getByRole('group', { name: OWN_DOMAIN }))
    await expectNoSiteFacts(canvasElement)
    const publish = dns.getByRole('button', { name: `Publish on ${OWN_DOMAIN}` })
    await expect(publish).toBeDisabled()
    // Two records: the ownership TXT in the address door's form, and the CNAME placeholder.
    await expect(dns.getByText(wholeHost(`_tracy.${OWN_DOMAIN}`))).toBeVisible()
    await expect(TXT_TOKEN).toMatch(/^[0-9a-f]{48}$/)
    await expect(dns.getByText(TXT_TOKEN)).toBeVisible()
    await expect(dns.getByText(wholeHost(ROUTING_PLACEHOLDER))).toBeVisible()
    await expect(dns.getByText(ROUTING_CAPTION)).toBeVisible()
    // The unknown routing value cannot be copied as if it were a record.
    await expect(dns.getByRole('button', { name: 'Copy CNAME record value' })).toBeDisabled()
    await expect(dns.getByRole('button', { name: 'Copy TXT record value' })).toBeEnabled()
    // The name is typed into the DNS provider too: each record's name has its own copy button.
    await expect(dns.getByRole('button', { name: 'Copy TXT record name' })).toBeEnabled()
    await expect(dns.getByRole('button', { name: 'Copy CNAME record name' })).toBeEnabled()
    // Every label sits on the baseline of its value, the copy button comes right after the text it
    // copies, the type has none, and nothing is drawn outside its record's box.
    const baseline = (el: Element): number => {
      const probe = document.createElement('span')
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
      el.prepend(probe)
      const y = probe.getBoundingClientRect().bottom
      probe.remove()
      return y
    }
    for (const record of canvasElement.querySelectorAll('[data-record]')) {
      const box = record.getBoundingClientRect()
      const labels = [...record.querySelectorAll('dt')]
      await expect(labels.map((label) => label.textContent)).toEqual([
        EXISTING.dnsType,
        EXISTING.dnsName,
        EXISTING.dnsValue
      ])
      for (const label of labels) {
        const value = label.nextElementSibling as HTMLElement
        const text = value.querySelector('code') ?? value
        await expect(Math.abs(baseline(label) - baseline(text))).toBeLessThanOrEqual(0.5)
        await expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(box.right)
        const copy = value.querySelector('[data-copy]')
        await expect(copy === null).toBe(value.hasAttribute('data-record-type'))
        if (copy !== null) await expect(text.nextElementSibling).toBe(copy)
      }
    }
    // The records are a list, not a grid that squeezes the value; nothing in it scrolls sideways.
    await expect(dns.queryByRole('table')).not.toBeInTheDocument()
    await expect(
      within(dns.getByRole('list', { name: 'DNS records' })).getAllByRole('listitem')
    ).toHaveLength(2)
    const checks = within(dns.getByRole('list', { name: 'Domain checks' }))
    await expect(checks.getByText('Waiting for routing')).toBeVisible()
    await expectStatus(canvasElement, 'Draft')

    // Still not publishable with two of three ready; only all three unlock it.
    await userEvent.click(dns.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(checks.getAllByText(EXISTING.ready)).toHaveLength(2), SETTLE)
    await expect(publish).toBeDisabled()
    await waitFor(() => expect(checks.getAllByText(EXISTING.ready)).toHaveLength(3), SETTLE)
    await expect(publish).toBeEnabled()

    await mount(<PublishMock key="restored" {...args} />)
  }
}

/** 4 — the publish is running: one line in the action's place, and the chip in the site head. */
export const Publishing: Story = {
  args: FIXTURES.publishing,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Publishing…')
    await expect(domains.getByText(PUBLISHING_LINE)).toBeVisible()
    // No step list, and nothing about search engines or email.
    await expect(domains.queryByRole('list')).not.toBeInTheDocument()
    await expectNoSiteFacts(canvasElement)
    await expect(domains.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(domains.getByRole('button', { name: 'Connect domain' })).toBeDisabled()
  }
}

/** 5 — live at the Tracy address. */
export const Live: Story = {
  args: FIXTURES.live,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Live')
    await expect(domains.getByText(`Live since ${PUBLISHED_AT} · published by ${PUBLISHED_BY}`)).toBeVisible()
    await expectNoSiteFacts(canvasElement)
    await expect(domains.getByRole('button', { name: 'Back to draft' })).toBeEnabled()
    await expect(domains.getByRole('button', { name: 'Connect domain' })).toBeEnabled()
  }
}

/** 6 — live at the Tracy address while the Owner's domain is still being connected. */
export const LiveDomainPending: Story = {
  name: 'Live, domain pending',
  args: FIXTURES.liveDomainPending,
  play: async ({ mount, canvasElement, userEvent, args }) => {
    await mount()
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Live')
    await expect(
      domains.getByText(`Live at the address below. ${OWN_DOMAIN} is still being connected.`)
    ).toBeVisible()
    await expect(addressIn(canvasElement)).toHaveTextContent(SITE.managed)
    await expect(domains.getByText(/2 of 3 checks ready/)).toBeVisible()
    await expectNoSiteFacts(canvasElement)

    // View opens the checks in place; the site stays live at the Tracy address meanwhile.
    await userEvent.click(domains.getByRole('button', { name: `View the checks of ${OWN_DOMAIN}` }))
    const dns = within(await domains.findByRole('group', { name: OWN_DOMAIN }))
    await expect(dns.getByRole('button', { name: `Publish on ${OWN_DOMAIN}` })).toBeDisabled()
    await expect(dns.queryByRole('button', { name: /for now$/ })).not.toBeInTheDocument()
    await expectStatus(canvasElement, 'Live')

    await mount(<PublishMock key="restored" {...args} />)
  }
}

/** 7 — live on the Owner's domain; the other addresses move to a quiet row. */
export const LiveOnOwnDomain: Story = {
  name: 'Live on own domain',
  args: FIXTURES.liveOnOwnDomain,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Live')
    await expect(addressIn(canvasElement)).toHaveTextContent(new RegExp(`^${OWN_DOMAIN}$`))
    const also = domains.getByText('Also answers at').parentElement
    await expect(also).toHaveTextContent(`www.${OWN_DOMAIN}`)
    await expect(also).toHaveTextContent(SITE.managed)
    await expectNoSiteFacts(canvasElement)
    await expect(domains.getByRole('button', { name: 'Change domain' })).toBeEnabled()
    await expect(domains.queryByRole('button', { name: 'Connect domain' })).not.toBeInTheDocument()
  }
}

/** 8 — what stops is said before the button that stops it; here, the connected domain. */
export const BackToDraft: Story = {
  name: 'Back to draft',
  args: FIXTURES.backToDraft,
  play: async ({ canvasElement }) => {
    const dialog = await screen.findByRole('alertdialog', { name: `Take ${SITE.name} back to draft?` })
    await expect(
      within(dialog).getByText('Visitors will stop reaching it until you publish again.')
    ).toBeVisible()
    await expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([`${OWN_DOMAIN} stops opening the site`])
    await expect(within(dialog).queryByText(SITE_FACTS)).not.toBeInTheDocument()
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(within(dialog).getByRole('button', { name: 'Back to draft' })).toBeVisible()
    await expectStatus(canvasElement, 'Live')
  }
}

/** 9 — a Viewer sees the draft and why they cannot publish it; no action is offered. */
export const Viewer: Story = {
  args: FIXTURES.viewer,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Draft')
    await expect(domains.queryByRole('radio')).not.toBeInTheDocument()
    await expect(
      domains.getByText('Only an Owner or an Editor can publish this site. Ask one of them to publish it.')
    ).toBeVisible()
    await expect(domains.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(domains.queryByRole('button', { name: 'Connect domain' })).not.toBeInTheDocument()
    await expect(domains.queryByRole('button', { name: 'Back to draft' })).not.toBeInTheDocument()
    await expectNoSiteFacts(canvasElement)
    // What a Viewer may still do: read the address and take it with them.
    await expect(domains.getByRole('button', { name: 'Copy address' })).toBeEnabled()
  }
}

/** 10 — an Editor publishes at the Tracy address; connecting a domain is the Owner's. */
export const Editor: Story = {
  args: FIXTURES.editor,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    const connect = domains.getByRole('button', { name: 'Connect domain' })
    await expect(connect).toBeDisabled()
    await expect(connect).toHaveAccessibleDescription(EXISTING.ownerOnly)
    await expect(domains.getByText(EXISTING.ownerOnly)).toBeVisible()
    await expectNoSiteFacts(canvasElement)
    // Pressing it anyway opens nothing.
    await fireEvent.click(connect)
    await expect(domains.queryByRole('form')).not.toBeInTheDocument()
    await expect(domains.getByRole('button', { name: 'Publish' })).toBeEnabled()
    await expectStatus(canvasElement, 'Draft')
  }
}

/** 11 — a simulated publish that changed nothing: one quiet line under the address. NOT the 207 answer. */
export const Failed: Story = {
  args: FIXTURES.failed,
  play: async ({ mount, canvasElement, userEvent, args }) => {
    await mount()
    const domains = domainsOf(canvasElement)
    await expectStatus(canvasElement, 'Draft')
    const alert = domains.getByRole('alert')
    await expect(alert).toHaveTextContent(new RegExp(`^${FAILED_LINE}$`))
    await expect(alert.tagName).toBe('P')
    // No frame, no step table or list, no line for the administrator, no search or email rows.
    await expect(domains.queryByRole('table')).not.toBeInTheDocument()
    await expect(domains.queryByRole('list')).not.toBeInTheDocument()
    await expect(domains.queryByText(/administrator/i)).not.toBeInTheDocument()
    await expectNoSiteFacts(canvasElement)
    await expect(domains.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()

    // Details is shut until asked, then shows the job reference and time, and shuts again.
    const details = domains.getByRole('button', { name: 'Details' })
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await expect(domains.queryByText(FAILED_JOB)).not.toBeInTheDocument()
    await userEvent.click(details)
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(domains.getByText(FAILED_JOB)).toBeVisible()
    await userEvent.click(details)
    await expect(domains.queryByText(FAILED_JOB)).not.toBeInTheDocument()

    // Try again starts a publish over from a draft.
    await userEvent.click(domains.getByRole('button', { name: 'Try again' }))
    await expectStatus(canvasElement, 'Publishing…')
    await expect(domains.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expectStatus(canvasElement, 'Live'), SETTLE)

    await mount(<PublishMock key="restored" {...args} />)
  }
}

/** 12 — the server cannot publish at all (501: the host has no tunnel configuration). */
export const NotSetUp: Story = {
  name: 'Not set up',
  args: FIXTURES.notSetUp,
  play: async ({ canvasElement }) => {
    const domains = domainsOf(canvasElement)
    const sentence = 'Publishing is not set up on this server yet. Ask your administrator.'
    await expect(domains.getByText(sentence)).toBeVisible()
    const publish = domains.getByRole('button', { name: 'Publish' })
    await expect(publish).toBeDisabled()
    await expect(publish).toHaveAccessibleDescription(sentence)
    await expect(domains.queryByRole('alert')).not.toBeInTheDocument()
    await expectNoSiteFacts(canvasElement)
    await expect(domains.getByRole('button', { name: 'Connect domain' })).toBeDisabled()
    await fireEvent.click(publish)
    await expectStatus(canvasElement, 'Draft')
  }
}

/** 13 — My Sites: each site's state after its name and role, and the menu line that leads in. */
export const MySites: Story = {
  name: 'My Sites table',
  args: FIXTURES.mySites,
  play: async ({ mount, canvasElement, userEvent, args }) => {
    await mount()
    const canvas = within(canvasElement)
    const chips = [...canvasElement.querySelectorAll('[data-site] [data-status]')].map(
      (chip) => chip.textContent
    )
    await expect(chips).toEqual(['Draft', 'Live', 'Live'])

    // The draft row's menu is open: `Settings`, and right under it the one line `Publish`.
    const menu = within(await screen.findByRole('menu'))
    const lines = (await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim())
    await expect(lines[lines.indexOf(EXISTING.menuSettings) + 1]).toBe('Publish')
    await expect(lines.filter((line) => /publish|domain/i.test(line ?? ''))).toEqual(['Publish'])

    // It opens that site's Publish tab: the site head and the Domains section.
    await userEvent.click(menu.getByRole('menuitem', { name: 'Publish' }))
    await canvas.findByRole('heading', { name: 'Domains' })
    await expect(canvasElement.querySelector('[data-tab]')).toHaveAttribute('data-tab', 'publish')
    await expect(addressIn(canvasElement)).toHaveTextContent(SITE.managed)
    await expectStatus(canvasElement, 'Draft')

    // Settings is another tab: the same site head, and no Domains section.
    await userEvent.click(canvas.getByRole('button', { name: 'My Sites' }))
    await userEvent.click(await canvas.findByRole('button', { name: `${EXISTING.more}: ${SITE.name}` }))
    await userEvent.click(await screen.findByRole('menuitem', { name: EXISTING.menuSettings }))
    await waitFor(
      () => expect(canvasElement.querySelector('[data-tab]')).toHaveAttribute('data-tab', 'settings'),
      SETTLE
    )
    await expectStatus(canvasElement, 'Draft')
    await expect(canvas.queryByRole('region', { name: 'Domains' })).not.toBeInTheDocument()
    const settings = within(canvasElement.querySelector('[data-tab="settings"]') as HTMLElement)
    await expect(settings.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(settings.queryByRole('button', { name: 'Connect domain' })).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-tab="settings"] [data-card]')).toBeNull()

    // A live site's line reads the same, and opens that site — not the one that was open.
    await userEvent.click(canvas.getByRole('button', { name: 'My Sites' }))
    const harbor = siteOf('harbor')
    await userEvent.click(await canvas.findByRole('button', { name: `${EXISTING.more}: ${harbor.name}` }))
    await expect(screen.queryByRole('menuitem', { name: 'Domains' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Publish' }))
    await waitFor(() => expect(addressIn(canvasElement)).toHaveTextContent(harbor.managed), SETTLE)
    await expectStatus(canvasElement, 'Live')
    // An Editor there: Back to draft is theirs, a domain is the Owner's.
    await expect(domainsOf(canvasElement).getByRole('button', { name: 'Back to draft' })).toBeEnabled()
    await expect(domainsOf(canvasElement).getByRole('button', { name: 'Connect domain' })).toBeDisabled()

    await mount(<PublishMock key="restored" {...args} />)
    await screen.findByRole('menu')
  }
}
