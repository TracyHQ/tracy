/**
 * The Design inspiration half of a quickstart: whether this release is a card customers can start
 * a site from, and what an administrator may change about that card.
 *
 * WHAT THIS REPLACES (Lee, 16/09). A card used to reach Design inspiration through four hand steps
 * — screenshots taken with a tool, a `card` block typed into `quickstarts.json`, the same block
 * written into the release, pictures committed so the dsh image carried them. Publish here writes
 * `tracy_design_inspiration.json` onto the release through the GitHub App and keeps the pictures in
 * this server's own store, so the press finishes the moment it returns: no commit, no image build.
 *
 * THREE STATES, NOT A TICK. `On Design inspiration` · `Card, not on Design inspiration` (and the
 * badge's title says what is missing) · `No card`. A release that could never be a card — a draft,
 * a design pack, one Tracy cannot read — says "—" and carries the reason as its title.
 *
 * WHAT IS READ vs WHAT IS OWNED. Label, version, languages, the platforms folded into this card and
 * the demo address are READ: the demo in particular is this server's own live one, so the rule
 * `demo.version == version` holds by construction and nobody types it. Provider, category, blurb,
 * thumbnail, the three filter traits and the layouts are the administrator's.
 *
 * 🔒 THE SERVER DECIDES THE STATE, NOT THIS FILE. `inspiration` arrives on every row of the list,
 * because deciding it needs this server's live demos and its picture store — two queries for the
 * page, not two per row. What this file computes is only the blockers under the Publish button, and
 * those are about the card being EDITED, which no server has seen yet.
 */
import {
  Badge,
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn
} from '@tracy/ui'
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Pencil,
  Save,
  Sparkles,
  Upload
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { CMS_LABEL, type Cms } from './App'
import { CMS } from './route'
import { Fact, Panel } from './parts'
import { useT } from '../i18n'

/** One section of the Templates page's Design Inspiration tab: a card of its own. */
const SECTION_CARD = 'rounded-xl border border-border bg-card px-4 py-4 text-card-foreground'

/**
 * The card's picture on the Templates page (Akemi, 10/10/2026): the home page's own shot, the layout
 * at "/" (else the first one), desktop else mobile; empty when it has none yet. Customers' gallery
 * shows the home desktop shot whenever the template has a demo (`cardPoster`), so a hand-picked
 * thumbnail was never seen; setting `image` the same way keeps a server without the demo showing
 * the same picture.
 */
export function homeShot(layouts: Layout[]): string {
  const home = layouts.find((l) => l.path === '/') ?? layouts[0]
  return home?.shots?.desktop || home?.shots?.mobile || ''
}

/** The picture types a page's chooser uploads, with the extension the stored name takes. */
const UPLOAD_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

import type { ReleaseRow } from './Quickstarts'
import { type CardPress, pressCard } from './card-press'
import {
  type StoredShot,
  keyFromPath,
  mergePageShots,
  moveLayout,
  pageProblems,
  pathProblems,
  removeLayout,
  shotsFor,
  uniqueKey
} from './demo-card-pages'
import { sameListing } from './listing-compare'
import { thrownText } from './response-error'
import { DemoCardEditor } from './DemoCardEditor'
import { BLURB_PLACEHOLDER } from './DemoCardFields'
import { type ListingRule, listingRuleText } from './problem-guides'

export type InspirationState = 'on' | 'card' | 'none' | 'n/a'
/** What the list's Design inspiration column draws, decided by the server for every row at once. */
export interface InspirationCell {
  state: InspirationState
  why: string | null
  /**
   * What the card lacks on this server — pictures, a demo, a blurb. A warning never takes a card
   * off: `on` means customers are offered it (`shownOnInspiration`, the rule `/api/templates` uses).
   * Optional because a server older than 04/10/2026 does not send it.
   */
  warnings?: string[]
}

/** The badge's hover text: the state, then why, then every warning — one sentence per line. */
function cellTitle(head: string, cell: InspirationCell) {
  return [head, cell.why, ...(cell.warnings ?? [])].filter(Boolean).join('\n')
}

export type Provider = 'Tracy' | 'JoomlArt'
export const PROVIDERS: readonly Provider[] = ['Tracy', 'JoomlArt']
export type Nav = 'top-left' | 'top-centered' | 'brand-centered' | 'overlay' | 'sidebar'
export type Hero = 'split' | 'centered' | 'cover' | 'stack'
/** Dictionary keys of the trait words: render with `t(NAV_LABEL[n])`. */
export const NAV_LABEL: Record<Nav, string> = {
  'top-left': 'cms-design.nav.topLeft',
  'top-centered': 'cms-design.nav.topCentered',
  'brand-centered': 'cms-design.nav.brandCentered',
  overlay: 'cms-design.nav.overlay',
  sidebar: 'cms-design.nav.sidebar'
}
export const HERO_LABEL: Record<Hero, string> = {
  split: 'cms-design.hero.split',
  centered: 'cms-design.hero.centered',
  cover: 'cms-design.hero.cover',
  stack: 'cms-design.hero.stack'
}

export interface Layout {
  key: string
  label: string
  path: string
  /**
   * Where this page ANSWERS, when that is not the same string as `path`.
   *
   * `path` is which page it is: it names the layout and the preview shows it to a reader. On a
   * Joomla demo running SEF with rewriting off — every demo Tracy provisions — the address is
   * `/index.php/our-services` while the path is `/our-services`, and only one of them is served.
   */
  address?: string
  /** A page that stands for many (12 services, 24 articles). */
  count?: number
  /** The file NAMES; the pictures themselves are in this server's store, listed as `shots` below. */
  shots?: { desktop?: string; mobile?: string }
}

export interface Card {
  schemaVersion?: string
  template?: string
  provider: Provider
  category: string
  blurb: string
  image: string
  nav?: Nav
  hero?: Hero
  dark?: boolean
  /** The side the demo opens on when no mode is asked; only read when `dark` is on. */
  defaultTheme?: 'light' | 'dark'
  languages?: string[]
  layouts: Layout[]
}

interface HeldShot {
  file: string
  bytes: number
  sha256: string
  updatedAt: string
}

/** Whether a release is bound to a content contract, decided by the server from the provisioning rule. */
export interface ContractStatus {
  state: 'exact' | 'lower' | 'none' | 'not-applicable'
  profile: string | null
  version: string | null
}

/**
 * The line a platform wears for its contract status; `null` for EmDash, which has nothing to bind.
 * `noun` names what Publish would put on Design inspiration: the old Quickstarts sheet says card, the
 * Templates page says listing (docs/references/vocabulary.md).
 */
function ContractLine({
  status,
  noun = 'card'
}: {
  status: ContractStatus | undefined
  noun?: 'card' | 'listing'
}) {
  const t = useT()
  if (!status || status.state === 'not-applicable') return null
  if (status.state === 'exact')
    return (
      <span className="text-muted-foreground text-xs">
        {t('cms-design.contract.exact', { profile: status.profile ?? '' })}
      </span>
    )
  const none = status.state === 'none'
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs', none ? 'text-destructive' : 'text-amber-600')}
    >
      <AlertTriangle className="size-3" />
      {none
        ? t(noun === 'listing' ? 'cms-design.contract.noneListing' : 'cms-design.contract.noneCard')
        : t('cms-design.contract.lower', { profile: status.profile ?? '', version: status.version ?? '' })}
    </span>
  )
}

/** `GET /api/ops/quickstart/inspiration?tag=` — everything the sheet draws, in one answer. */
interface Detail {
  tag: string
  writable: boolean
  refusal: string | null
  label: string
  version: string | null
  languages: string[]
  platform: Cms | null
  template: string | null
  demo: { url: string; version: string | null } | null
  platforms: { platform: Cms; tag: string; version: string; contract?: ContractStatus }[]
  card: Card | null
  published: boolean
  shots: HeldShot[]
  categories: string[]
  reason: string | null
}

/** One Demo Card page's own shoot (from its row or its picture chooser), kept by the page's key. */
export interface PageShootState {
  busy: boolean
  /** What the door said when the pictures did not come back; null when they did. */
  error: string | null
  /** The path this shoot was asked for. */
  path: string
}

const EMPTY_CARD: Card = {
  provider: 'JoomlArt',
  category: '',
  blurb: '',
  image: '',
  nav: 'top-left',
  hero: 'split',
  dark: true,
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: {} }]
}

/**
 * `compact` is the list's reading: the column header ("On Tracy") already names the place, so the
 * badge says only the state and keeps the full sentence as its hover title. The quickstart page's
 * panel has no such header and keeps the sentence.
 */
export function DesignInspirationBadge({
  cell,
  compact = false
}: {
  cell: InspirationCell
  compact?: boolean
}) {
  const t = useT()
  switch (cell.state) {
    case 'on':
      return (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-600/40 bg-emerald-600/10 font-normal text-emerald-700 dark:text-emerald-400"
          title={
            compact
              ? cellTitle(t('cms-design.badge.on'), cell)
              : (cell.warnings ?? []).length > 0
                ? (cell.warnings ?? []).join('\n')
                : undefined
          }
        >
          {compact ? null : <LayoutGrid className="size-3" />}
          {compact ? t('cms-design.badge.active') : t('cms-design.badge.on')}
          {(cell.warnings ?? []).length > 0 ? (
            <AlertTriangle className="size-3 text-amber-600" aria-label={t('cms-design.badge.hasWarnings')} />
          ) : null}
        </Badge>
      )
    case 'card':
      return (
        <Badge
          variant="outline"
          className="gap-1 border-amber-600/40 bg-amber-600/10 font-normal text-amber-700 dark:text-amber-400"
          title={compact ? cellTitle(t('cms-design.badge.card'), cell) : cellTitle('', cell) || undefined}
        >
          <EyeOff className="size-3" />
          {compact ? t('cms-design.badge.hidden') : t('cms-design.badge.card')}
        </Badge>
      )
    case 'none':
      // On the list it is the opposite of Active, so it wears the opposite colour (Akemi, 30/09).
      return compact ? (
        <Badge
          variant="outline"
          className="border-red-600/40 bg-red-600/10 font-normal text-red-700 dark:text-red-400"
          title={t('cms-design.badge.noCard')}
        >
          {t('cms-design.badge.disabled')}
        </Badge>
      ) : (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {t('cms-design.badge.noCard')}
        </Badge>
      )
    default:
      return (
        <span className="text-muted-foreground text-xs" title={cell.why ?? undefined}>
          —
        </span>
      )
  }
}

/**
 * The list's way into the sheet — the Action column. The state pill is its own column
 * (`DesignInspirationBadge` with `compact`), so a design pack, which has no card to open, draws
 * nothing here.
 *
 * The sheet is a `Sheet` with its own trigger rather than one controlled from the list, for the
 * reason `parts.tsx`'s `RowDrawer` gives: an inline panel loses focus return and leaves a keyboard
 * user at the top of the document.
 */
export function DesignInspirationCell({
  release,
  cell,
  writable,
  onChanged
}: {
  release: ReleaseRow
  cell: InspirationCell
  writable: boolean
  onChanged: () => void
}) {
  const t = useT()
  if (cell.state === 'n/a') return null
  const name = release.label ?? release.name
  return (
    <Sheet>
      <SheetTrigger
        render={
          // Outlined with a chevron so it reads as a way in, not as a label (Akemi, 30/09).
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-0.5 border-foreground/30 pr-1 pl-2 font-medium text-foreground text-xs"
            aria-label={t('cms-design.sheet.settingsFor', { name })}
          />
        }
      >
        {cell.state === 'none' ? t('cms-design.sheet.addCard') : t('cms-design.sheet.settings')}
        <ChevronRight className="size-3.5 text-foreground" />
      </SheetTrigger>
      {/* Wider than the ops sheets next to it, and draggable: this one carries a blurb, the
            traits, and a layout table with three columns, and 2xl put the table's Path column
            under a horizontal scrollbar at every window size. */}
      <SheetContent
        className="w-full sm:max-w-4xl"
        closeLabel={t('cms-design.sheet.close')}
        resizable
        resizeLabel={t('cms-design.sheet.resize')}
        resizeId="ops-design-inspiration"
      >
        <SheetHeader>
          <SheetTitle>{t('cms-design.sheet.title', { name })}</SheetTitle>
          <SheetDescription>{t('cms-design.sheet.description')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          {/* Keyed by release: a sheet is one release's form, and whatever a press of the last one
              answers later (a card, a note, a problem) has no sheet left to land on. */}
          <DesignInspirationBody
            key={release.tag}
            tag={release.tag}
            writable={writable}
            onChanged={onChanged}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** One release a card can be edited on, as the controlled sheet's picker lists it. */
export interface CardRelease {
  tag: string
  platform: string | null
  version: string | null
}

/**
 * The same sheet, opened from somewhere else — the Design inspiration screen's "Edit card" and
 * "Create card" — rather than from its own trigger in a list row.
 *
 * A card is one per TEMPLATE, but its file lives on each RELEASE: a template built on three CMSes
 * has three files, and the press writes one. So when `releases` holds more than one, the sheet asks
 * which release's file is edited (the first by default) instead of guessing.
 */
export function DesignInspirationSheet({
  open,
  onOpenChange,
  name,
  releases,
  writable,
  onChanged
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  releases: CardRelease[]
  writable: boolean
  onChanged: () => void
}) {
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={(next: boolean) => onOpenChange(next)}>
      <SheetContent
        className="w-full sm:max-w-4xl"
        closeLabel={t('cms-design.sheet.close')}
        resizable
        resizeLabel={t('cms-design.sheet.resize')}
        resizeId="ops-design-inspiration"
      >
        {/* Keyed by the releases: another template's card starts on its own first release. */}
        <PickedRelease
          key={releases.map((r) => r.tag).join(' ')}
          name={name}
          releases={releases}
          writable={writable}
          onChanged={onChanged}
        />
      </SheetContent>
    </Sheet>
  )
}

function PickedRelease({
  name,
  releases,
  writable,
  onChanged
}: {
  name: string
  releases: CardRelease[]
  writable: boolean
  onChanged: () => void
}) {
  const t = useT()
  const [tag, setTag] = useState(releases[0]?.tag ?? '')
  const cmsOf = (r: CardRelease) => (r.platform ? (CMS_LABEL[r.platform as Cms] ?? r.platform) : '—')
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('cms-design.sheet.title', { name })}</SheetTitle>
        <SheetDescription>
          {releases.length > 1
            ? t('cms-design.sheet.pickRelease', { count: releases.length })
            : t('cms-design.sheet.description')}
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {releases.length > 1 ? (
          <NativeSelect
            aria-label={t('cms-design.sheet.release')}
            data-card-release=""
            className="mb-4"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            {releases.map((r) => (
              <NativeSelectOption key={r.tag} value={r.tag}>
                {cmsOf(r)} · {r.tag} · {r.version ?? '—'}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
        {tag ? <DesignInspirationBody key={tag} tag={tag} writable={writable} onChanged={onChanged} /> : null}
      </div>
    </>
  )
}

/** The same body as a panel on the quickstart page (the `Design inspiration` tab). */
export function DesignInspirationPanel({
  tag,
  cell,
  writable,
  onChanged,
  cardOnly = false,
  status,
  demo,
  siteTag,
  readKey,
  demoLive
}: {
  tag: string
  cell: InspirationCell | null
  writable: boolean
  onChanged: () => void
  /**
   * The Templates page: the tab holds only what makes the card. Publish and Unpublish live in the
   * template header there, and the release facts (version, languages) on Quickstart settings; the demo comes in as `demo`.
   */
  cardOnly?: boolean
  /** cardOnly: the selected release's listing status, drawn at the head of the Listing section. */
  status?: ReactNode
  /** cardOnly: the selected release's demo on this server, the third cell of that row. */
  demo?: ReactNode
  /** cardOnly: a tag drawn beside the Demo Site title (e.g. "Needs update"). */
  siteTag?: ReactNode
  /** The page's read generation: a new value reads the sheet's facts again (the card stays). */
  readKey?: number
  /** Whether the page's road says the demo is live; when given, the Listing lock follows it. */
  demoLive?: boolean
}) {
  const t = useT()
  // Keyed by release, as in the cell's sheet: a late answer of the last one lands nowhere.
  const body = (
    <div className="px-4 py-4">
      <DesignInspirationBody
        key={tag}
        tag={tag}
        writable={writable}
        onChanged={onChanged}
        cardOnly={cardOnly}
        status={status}
        demo={demo}
      />
    </div>
  )
  // The Templates page has no title bar here: the tab already names it, and the header's
  // Active/Disabled tag (with its warnings box) says what the badge said. Its two sections are
  // cards of their own, so no outer card is drawn around them.
  if (cardOnly)
    return (
      <DesignInspirationBody
        key={tag}
        tag={tag}
        writable={writable}
        onChanged={onChanged}
        cardOnly={cardOnly}
        status={status}
        demo={demo}
        siteTag={siteTag}
        readKey={readKey}
        demoLive={demoLive}
      />
    )
  return (
    <Panel
      title={t('cms-design.panel.title')}
      icon={<LayoutGrid />}
      aside={cell ? <DesignInspirationBadge cell={cell} /> : null}
    >
      {body}
    </Panel>
  )
}

function DesignInspirationBody({
  tag,
  writable,
  onChanged,
  cardOnly = false,
  status,
  demo,
  siteTag,
  readKey = 0,
  demoLive
}: {
  tag: string
  writable: boolean
  onChanged: () => void
  cardOnly?: boolean
  status?: ReactNode
  demo?: ReactNode
  /** cardOnly: a tag drawn beside the Demo Site title (e.g. "Needs update"). */
  siteTag?: ReactNode
  readKey?: number
  demoLive?: boolean
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  // The listing as saved on the release (or the empty form when it has none): the unsaved mark is
  // the edited form compared with this, not a flag the first edit sets (`listing-compare.ts`).
  const [saved, setSaved] = useState<Card | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 🔒 A NOTE IS NOT AN ERROR, AND RED SAYS IT IS. Generate answers 200 and fills what it could;
  // routing that sentence through `setError` painted a partial success as a failure — the same
  // mistake that made a 501 go-live read as GO_LIVE_FAILED an hour earlier on this screen.
  const [note, setNote] = useState<string | null>(null)
  // What Publish answered besides `ok`: content-contract cautions. The card is published either way.
  const [warnings, setWarnings] = useState<string[]>([])
  // The Demo Card's Pages list (Templates page): the rows added since the card was read, whose key
  // still follows their path; the row whose path field takes the focus once; and each page's own
  // shoot, by key: running, what the door said when it did not bring the pictures back, and the
  // path it was asked for (a blur with the same path does not shoot again).
  const [freshKeys, setFreshKeys] = useState<ReadonlySet<string>>(new Set())
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [pageShoot, setPageShoot] = useState<Record<string, PageShootState>>({})
  const t = useT()

  // The release on screen, null once the sheet is gone: a press or a read answered after either
  // must not reload, fill or print under another release's card.
  const shownTag = useRef<string | null>(tag)
  const loads = useRef(0)
  /**
   * Read this release's sheet. Answers `false` when the read was not applied: another release is
   * on screen by now, or a newer read of this one was started — what the caller meant to put on
   * top of it (a kept card, a note) belongs to a sheet that is no longer there.
   */
  const load = async (keepCard = false): Promise<boolean> => {
    const asked = tag
    loads.current += 1
    const mine = loads.current
    const current = () => loads.current === mine && shownTag.current === asked
    setError(null)
    try {
      const response = await fetch(`/api/ops/quickstart/inspiration?tag=${encodeURIComponent(tag)}`, {
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(t('cms-design.error.door', { status: response.status }))
      const body: Detail = await response.json()
      if (!current()) return false
      setDetail(body)
      // keepCard: only the sheet's facts (the held pictures above all) are refreshed; the card
      // being edited, and what it is compared with, stay as they are.
      // ⚠ UNLESS THERE IS NO CARD YET. Opening a template reads the sheet, and the page's own list
      // re-read bumps `readKey` at once: that second read (keepCard) drops the first as stale, so
      // keeping "the card" kept nothing and the tab said "Reading…" until it was mounted again
      // (measured on dev 12/10/2026: 20 s and more). A card never read is filled from this read.
      if (keepCard) {
        setCard((c) => c ?? body.card ?? EMPTY_CARD)
        setSaved((c) => c ?? body.card ?? EMPTY_CARD)
        return true
      }
      setCard(body.card ?? EMPTY_CARD)
      setSaved(body.card ?? EMPTY_CARD)
      setFreshKeys(new Set())
      setPageShoot({})
      return true
    } catch (e) {
      if (current()) setError(thrownText(e))
      return false
    }
  }
  // One Publish/Unpublish at a time: the lock a second click meets before React has redrawn the
  // buttons as disabled.
  const pressing = useRef(false)
  // Unpublish takes a card customers choose from off the shelf: two presses, no modal — the pattern
  // the Demos screen uses for Remove. Asked about ONE release; another release is another question.
  const [unpublishArmed, setUnpublishArmed] = useState<string | null>(null)
  useEffect(() => {
    shownTag.current = tag
    setUnpublishArmed(null)
    void load()
    return () => {
      shownTag.current = null
    }
  }, [tag])
  // 🔒 READ AGAIN WITH THE PAGE (11/10/2026). The sheet was read once per release, so the demo it
  // knew stayed "none" after the demo went live: the Road said Listing was next while this card
  // still said "Waiting for the demo site." until F5. Each page read generation re-reads the
  // sheet's facts; the card being edited is kept (`keepCard`).
  const lastRead = useRef(readKey)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one re-read per page read generation.
  useEffect(() => {
    if (lastRead.current === readKey) return
    lastRead.current = readKey
    void load(true)
  }, [readKey])

  // ⚠ ONLY A LOAD FAILURE REPLACES THE SHEET. An error raised by a BUTTON — generate, capture,
  // upload — must be shown beside the form it acted on: replacing the whole sheet with one red
  // line takes away the fields the reader was working in, and takes away the Close button's
  // context too. Measured 17/09: a 500 from Generate, and later its own "the model answered 401"
  // note, both blanked the sheet down to a single sentence.
  if (error && !detail) return <p className="text-destructive text-sm">{error}</p>
  if (!detail || !card || !saved)
    return <p className="text-muted-foreground text-sm">{t('cms-design.body.reading')}</p>
  if (detail.refusal) return <p className="text-muted-foreground text-sm">{detail.refusal}</p>

  const edit = (patch: Partial<Card>) => {
    setCard({ ...card, ...patch })
  }
  // Whether a demo is live to read and shoot. The Templates page hands down what its road says
  // (`demoLive`, the list the Road to live and the Demo Site row are read with); the sheet's own
  // fact stands in where no road is drawn (the old Quickstarts sheet).
  const hasDemo = demoLive ?? detail.demo !== null
  const held = new Set(detail.shots.map((s) => s.file))
  const desktopShots = detail.shots.map((s) => s.file)

  // What stops a Publish, said in full rather than as a percentage. Two different things can be
  // missing and they read differently: a layout that names no picture, and a layout that names one
  // this server does not hold — the first is unfinished, the second is a broken card.
  // On the Templates page the picture follows the home page (`homeShot`); an empty home keeps
  // whatever the card had. The old Quickstarts sheet keeps its own Thumbnail select.
  const imageOf = (c: Card) => (cardOnly ? homeShot(c.layouts) || c.image : c.image)
  const cardImage = imageOf(card)
  // Unsaved: what Save would send differs from the saved listing, both read through the same image
  // rule, so a listing saved before that rule does not look edited the moment it is read.
  const dirty = !sameListing({ ...card, image: cardImage }, { ...saved, image: imageOf(saved) })
  const unnamed = card.layouts.filter((l) => !l.shots?.desktop)
  const unheld = [
    ...new Set(
      [cardImage, ...card.layouts.flatMap((l) => [l.shots?.desktop, l.shots?.mobile])].filter(
        (f): f is string => typeof f === 'string' && f !== '' && !held.has(f)
      )
    )
  ]
  // Joomla and WordPress releases of this card with no content contract: Publish is refused for them
  // (the server says the same, `ops/quickstarts.js`), so the sheet says so before the press.
  const noContract = detail.platforms.filter((p) => p.contract?.state === 'none')
  // Two lists: what stops Save card (the card itself is unfinished) and what stops Publish on this
  // sheet (the shelf refuses it). The Templates page gates its header Publish on its issue list.
  // No demo is asked: the publish door needs none (`publishRefusalOf` on the server), so this sheet
  // asks none either (11/10/2026; a UI-only demo gate here contradicted the door).
  const shelfBlockers = [
    ...noContract.map((p) => t('cms-design.shelf.noContract', { tag: p.tag })),
    detail.card === null ? t('cms-design.shelf.saveFirst') : null
  ].filter((x): x is string => x !== null)
  // Templates page: each page's own trouble (empty or shared path, no label) is said in its row,
  // and one line here keeps Save card / Update card off while any is left.
  const rowProblems = cardOnly ? pageProblems(card.layouts) : []
  const badRows = rowProblems.filter((p) => p !== null).length
  const shootingPages = Object.values(pageShoot).some((p) => p.busy)
  // What holds Save back, as codes (`ListingRule`); the words are the guide table's (`listingRuleText`).
  const rules: { code: ListingRule; params?: Record<string, unknown> }[] = []
  if (badRows > 0) rules.push({ code: 'pages-need-label-and-path', params: { count: badRows } })
  if (shootingPages) rules.push({ code: 'pages-shooting' })
  if (unnamed.length > 0)
    rules.push({ code: 'layout-no-desktop', params: { missing: unnamed.length, total: card.layouts.length } })
  if (unheld.length > 0) rules.push({ code: 'picture-not-held', params: { files: unheld } })
  if (card.category === '') rules.push({ code: 'no-category' })
  if (card.blurb === '') rules.push({ code: 'no-blurb' })
  if (cardImage === '') rules.push({ code: cardOnly ? 'no-home-picture' : 'no-thumbnail' })
  const blockers = rules.map((r) => listingRuleText(r.code, r.params))
  // The Templates page shows the four field rules as a short checklist (Akemi, 11/10/2026); the
  // other rules (page rows, pictures being taken, pictures this server lacks) stay short lines.
  const CHECKED: ListingRule[] = [
    'layout-no-desktop',
    'no-category',
    'no-blurb',
    'no-home-picture',
    'no-thumbnail'
  ]
  const checklist = [
    { label: t('cms-design.checklist.desktopEveryPage'), ok: unnamed.length === 0 },
    { label: t('cms-design.checklist.category'), ok: card.category !== '' },
    { label: t('cms-design.checklist.blurb'), ok: card.blurb !== '' },
    {
      label: cardOnly ? t('cms-design.checklist.homePicture') : t('cms-design.checklist.thumbnail'),
      ok: cardImage !== ''
    }
  ]
  const otherRules = rules
    .filter((r) => !CHECKED.includes(r.code))
    .map((r) => listingRuleText(r.code, r.params))

  /** Save card, Publish or Unpublish (`card-press.ts`); the form is kept whatever the answer. */
  const press = async (action: CardPress) => {
    if (pressing.current) return
    pressing.current = true
    setBusy(true)
    setError(null)
    setWarnings([])
    const asked = tag
    const here = () => shownTag.current === asked
    try {
      const done = await pressCard(tag, action, action === 'save' ? { ...card, image: cardImage } : undefined)
      if (!done.ok) {
        if (here()) setError(done.error)
        return
      }
      // The list behind the sheet changed whichever release is on screen now; the sheet itself is
      // re-read only when it still shows the release that was pressed.
      if (here()) await load()
      if (here()) setWarnings(done.warnings)
      onChanged()
    } finally {
      pressing.current = false
      setBusy(false)
    }
  }
  // The card by the name a person knows it by: the release's label and version, else its tag.
  const cardName = detail.label ? `${detail.label}${detail.version ? ` ${detail.version}` : ''}` : tag
  // The name is part of it: the question is asked by name, so a card read again under another
  // name asks again.
  const unpublishKey = JSON.stringify([tag, detail.version ?? '', cardName])
  const unpublishing = unpublishArmed === unpublishKey

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !detail.template) return
    setBusy(true)
    setError(null)
    try {
      for (const file of files) {
        const response = await fetch(
          `/api/ops/templates/${detail.template}/shots/${encodeURIComponent(file.name)}`,
          { method: 'PUT', headers: { 'content-type': file.type || 'image/png' }, body: file }
        )
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          setError(
            body.reason ?? t('cms-design.error.fileDoor', { file: file.name, status: response.status })
          )
          return
        }
      }
      // Reloading rather than patching: the card being edited is kept, the held pictures are not
      // the browser's to guess at, and a half-finished upload must not look complete.
      const kept = card
      await load()
      setCard(kept)
      // The store changed: the page's problems ("pictures not on this server") are read again.
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  /**
   * One picture for ONE page, from that page's own picture chooser (Templates page, Akemi
   * 10/10/2026). It goes through the same door as the old "Upload pictures" button, then becomes
   * that page's desktop or mobile shot in the form at once; Save card / Update card keeps it like
   * any other edit. Answers the refusal in words, or null when the picture is in.
   *
   * The name is composed here, not taken from the file: the store accepts only lower-case names,
   * and a fresh name per upload never overwrites a picture another page or release already wears
   * (the shoot's own `<template>-<key>-<width>.png` included).
   */
  const uploadShot = async (i: number, shape: 'desktop' | 'mobile', file: File): Promise<string | null> => {
    const template = detail.template
    if (!template)
      return cardOnly ? t('cms-design.upload.noTemplateListing') : t('cms-design.upload.noTemplateCard')
    const ext = UPLOAD_EXT[file.type]
    if (!ext) return t('cms-design.upload.badType', { file: file.name })
    const layout = card.layouts[i]
    if (!layout) return null
    const slug =
      layout.key
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'page'
    const width = shape === 'desktop' ? 1440 : 390
    const name = `${template}-${slug}-${String(width)}-upload-${Date.now().toString(36)}.${ext}`
    const asked = tag
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/ops/templates/${template}/shots/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        return body.reason ?? t('cms-design.error.fileDoor', { file: file.name, status: response.status })
      }
      // Reload so the held-pictures list is the store's, then put the edited card back with the
      // new picture on this page: the reload alone would drop every unsaved edit.
      const kept = card
      await load()
      onChanged()
      if (shownTag.current !== asked) return null
      setCard({
        ...kept,
        layouts: kept.layouts.map((l, j) => (j === i ? { ...l, shots: { ...l.shots, [shape]: name } } : l))
      })
      return null
    } catch (e) {
      return thrownText(e)
    } finally {
      setBusy(false)
    }
  }

  // Capture every layout off the live demo in one press. tracy-host does the shooting (it is the
  // only process with a browser on the demo's network); this refills the store, then points each
  // layout at the picture that was just taken for it, so a card can go from empty to publishable
  // without leaving the sheet. The manual Upload stays as the fallback beside it.
  /**
   * Fill the form from the demo itself: its own top-level menu becomes the layouts, its behaviour
   * under `prefers-color-scheme: dark` becomes the dark flag, and — where this deployment has a
   * model — a category and one sentence.
   *
   * ⚠ IT FILLS THE FORM, IT DOES NOT PUBLISH. Everything below lands in the fields a person is
   * already looking at, and Publish is still a press. A card is what a customer chooses a site
   * from; Tracy asserting something nobody read is the one thing this screen must not do.
   *
   * It never overwrites work already typed: a field an administrator has filled stays theirs, so
   * pressing this twice is safe and pressing it after editing is not a loss.
   */
  const generate = async () => {
    if (!detail.template || !hasDemo) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const response = await fetch(
        `/api/ops/templates/${detail.template}/generate?tag=${encodeURIComponent(tag)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // Only the door's own words are printed; a gateway page (no JSON) or a bare code is said
        // as what it means for the form (11/10/2026: the page read "the door answered 502").
        const told = typeof body?.reason === 'string' && body.reason !== '' ? body.reason : null
        setError(told ?? t('cms-design.generate.failed', { status: response.status }))
        return
      }
      const draft = body.draft ?? {}
      // ⚠ A MENU READ THAT FOUND ONLY HOME IS NOT A NEW MENU. The outline always answers at least
      // the home page, so `draft.layouts` is never empty — and a template whose menu the reader
      // could not see (JA Mood's T3 `#t3-mainnav`, measured 22/09) used to wipe the sub-pages an
      // administrator had already listed, after which Capture shot Home alone as well.
      const measured: Layout[] = draft.layouts ?? []
      const keepListed = measured.length <= 1 && card.layouts.length > 1
      const next: Card = {
        ...card,
        provider: card.provider || draft.provider,
        // ⚠ MEASURED FIELDS REFRESH; JUDGED FIELDS DO NOT. Pressing this again after the team
        // ships a new build is the point of it (Lee, 17/09), and what changed in that build is the
        // site: its menu and its dark mode. Those are facts, so they are re-read. A category and a
        // sentence somebody wrote are theirs, and are left alone.
        dark: draft.dark,
        defaultTheme: draft.defaultTheme === 'dark' ? 'dark' : 'light',
        layouts: keepListed || measured.length === 0 ? card.layouts : measured,
        category: card.category || draft.category || '',
        blurb: card.blurb || draft.blurb || ''
      }
      // 🔒 AND THEN IT SHOOTS THEM. Generate used to stop at the layout list and leave Count,
      // Desktop and Mobile for two more presses — which is how the form looked when Lee asked why
      // (17/09): four layouts, no pictures, and the ones that were there belonged to an older
      // shoot. `count` now arrives measured from the demo's own dropdowns, and the pictures are
      // taken here so one press answers the whole form.
      const shot = await shoot(next.layouts)
      const layouts = shot?.layouts ?? next.layouts
      // Old sheet: the thumbnail is the home page's narrow shot, unless a person already chose one.
      // Templates page: always the home page's own shot (`homeShot`). Either way it is left alone
      // when nothing was shot for home rather than pointed at a picture that is not there.
      const home = layouts.find((l) => l.path === '/') ?? layouts[0]
      const image = cardOnly
        ? homeShot(layouts) || next.image
        : next.image || home?.shots?.mobile || home?.shots?.desktop || next.image
      setCard({ ...next, layouts, image })
      // Said out loud rather than left as two empty fields: "no model on this server", "the model
      // suggested something that is not one of ours" and "the model would not answer" are three
      // different errands for whoever reads the screen. A shoot that lost pictures says so in the
      // same breath — the form is filled either way, and which half is thin is the useful part.
      const read = [
        body.why
          ? t('cms-design.generate.filledWhy', { why: String(body.why) })
          : t('cms-design.generate.filled'),
        keepListed ? t('cms-design.generate.keptListed') : ''
      ]
        .filter(Boolean)
        .join(' ')
      if (shot?.failed) setNote(`${read} ${shot.failed}`)
      else setNote(read)
    } catch (error) {
      setError(thrownText(error))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Shoot these layouts on the demo and hand them back pointing at the pictures that came of it.
   *
   * Shared by the Capture button and by Generate, which ENDS in exactly this work: a generated card
   * whose layouts name no picture is a card nobody can publish, so the button that fills the form
   * has to fill this part of it too (Lee, 17/09). It sets `error` and answers null when the door
   * refuses; it does not touch the card, because its two callers merge the result differently.
   */
  const shoot = async (
    layouts: Layout[],
    { row = false }: { row?: boolean } = {}
  ): Promise<{ layouts: Layout[]; stored: StoredShot[]; failed: string | null } | null> => {
    // row: one page of the Demo Card, shot from its own row. It says its progress and its refusal
    // in that row (the answer's `failed`), not in the sheet's note and error, and the reload after
    // it keeps the card being edited.
    // 🔒 ONE LAYOUT PER REQUEST, NOT ONE REQUEST FOR THE CARD. The host takes every picture before
    // it answers (two widths per layout, up to 30 s each), so six layouts were one request of two
    // or three minutes — longer than the edge in front of this page waits, which answers 524 and
    // drops the whole shoot, pictures the server had already stored included. That is the "only
    // Home and the thumbnail came back" the review measured 21/09: a short card fits, a real one
    // does not. Per layout, each request is two pictures, one bad page costs only its own row, and
    // the note can say which.
    type Stored = StoredShot
    type Failed = { key?: string; width?: number; error?: string }
    const stored: Stored[] = []
    const failed: Failed[] = []
    let answered = false
    for (const [i, l] of layouts.entries()) {
      if (!row)
        setNote(t('cms-design.shoot.progress', { page: l.label || l.key, n: i + 1, total: layouts.length }))
      let response: Response
      try {
        // eslint-disable-next-line no-await-in-loop -- one page at a time is the point: the host shoots serially anyway.
        response = await fetch(
          `/api/ops/templates/${detail.template}/capture?tag=${encodeURIComponent(tag)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              layouts: [
                { key: l.key, path: l.path, ...(l.address === undefined ? {} : { address: l.address }) }
              ]
            })
          }
        )
      } catch (error) {
        failed.push({ key: l.key, error: thrownText(error) })
        continue
      }
      // eslint-disable-next-line no-await-in-loop -- same loop.
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // A refusal about the card itself (no demo, wrong template) is the same for every layout:
        // said once and stopped, as before. Anything else is this page's own trouble.
        if (!answered && [400, 404, 409, 503].includes(response.status)) {
          const door = t('cms-design.error.door', { status: response.status })
          const reason = body.reason ?? body.error ?? door
          if (row) return { layouts, stored: [], failed: String(reason) }
          setNote(null)
          setError(body.reason ?? door)
          return null
        }
        failed.push({
          key: l.key,
          error: body.reason ?? body.error ?? t('cms-design.error.door', { status: response.status })
        })
        continue
      }
      answered = true
      stored.push(...((body.stored ?? []) as Stored[]))
      failed.push(...((body.failed ?? []) as Failed[]))
    }
    if (!row) setNote(null)
    // Point each layout at what was shot for it — desktop at 1440, mobile at 390 — keeping any
    // name the store already held for a shot the demo would not give up this time.
    const shot = (key: string, width: number) => stored.find((s) => s.key === key && s.width === width)?.file
    const withShots = layouts.map((l) => ({
      ...l,
      shots: {
        ...l.shots,
        desktop: shot(l.key, 1440) ?? l.shots?.desktop,
        mobile: shot(l.key, 390) ?? l.shots?.mobile
      }
    }))
    // Reload so the held-pictures list is the store's, not a guess, and tell the page: its problems
    // are read from the same store (Capture, Generate and a page's own shoot all end here).
    await load(row)
    if (stored.length > 0) onChanged()
    const failedNote =
      failed.length > 0
        ? t('cms-design.shoot.failed', {
            count: failed.length,
            list: failed
              .map(
                (f) =>
                  `${f.key ?? '?'}${f.width === undefined ? '' : `·${String(f.width)}`} (${f.error ?? t('cms-design.shoot.noPicture')})`
              )
              .join(', ')
          })
        : null
    return { layouts: withShots, stored, failed: failedNote }
  }

  const capture = async () => {
    if (!detail.template || !hasDemo) return
    setBusy(true)
    setError(null)
    try {
      const shot = await shoot(card.layouts)
      if (shot === null) return
      // The edited card with its freshly named shots. A card can be published straight after.
      setCard({ ...card, layouts: shot.layouts })
      if (shot.failed !== null) setError(shot.failed)
    } finally {
      setBusy(false)
    }
  }

  const layoutAt = (i: number, patch: Partial<Layout>) =>
    edit({ layouts: card.layouts.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const messages = (
    <>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {!error && note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </>
  )
  // 🔒 ON THE TEMPLATES PAGE THE PRESS SAYS WHICH IT IS (Akemi, 10/10/2026): "Create listing" drafts
  // the first listing from the demo; once the release has a saved one it is "Regenerate listing", which
  // re-reads the demo's menu, dark mode and shots and keeps what a person wrote (see `generate`).
  const hasCard = detail.card !== null
  const regenerate = cardOnly && hasCard
  // 🔒 THE LISTING WAITS FOR THE DEMO (Akemi, 11/10/2026): on the Templates page, with no listing
  // saved and no live demo, Save listing and Create listing are both off ("Install the demo
  // first."), the form is not drawn, and the road says the listing waits for step 4. The publish
  // door is unchanged (it never needed a demo); a listing already saved stays editable.
  const locked = cardOnly && !hasCard && !hasDemo
  const generateButton = (
    <Button
      size="sm"
      variant="outline"
      disabled={!writable || busy || shootingPages || !hasDemo}
      data-road-control={cardOnly ? 'create-listing' : undefined}
      title={
        !hasDemo
          ? listingRuleText('demo-required')
          : regenerate
            ? t('cms-design.generate.titleRegenerate')
            : cardOnly
              ? t('cms-design.generate.titleCreate')
              : t('cms-design.generate.titleCard')
      }
      onClick={() => void generate()}
    >
      <Sparkles />
      {cardOnly
        ? regenerate
          ? t('cms-design.generate.regenerate')
          : t('cms-design.generate.create')
        : t('cms-design.generate.card')}
    </Button>
  )
  const generateRow = (
    <>
      {/* 🔒 AT THE TOP, BECAUSE IT FILLS THE WHOLE FORM. It first sat in the Layouts row beside
          Capture, next to the thing it produces — but layouts are one of five fields it writes,
          and a control that edits everything belongs above everything rather than inside one
          section of it (Lee, 17/09). */}
      <div className="flex items-center justify-end gap-3">
        {cardOnly ? null : messages}
        {generateButton}
      </div>
    </>
  )
  const cardFields = (
    <>
      {detail.reason ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">{detail.reason}</p>
      ) : null}

      {/* Owned by the administrator. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cms-design.field.provider')} hint={t('cms-design.field.providerHint')}>
          <NativeSelect
            size="sm"
            aria-label={t('cms-design.field.provider')}
            disabled={!writable}
            value={card.provider}
            onChange={(e) => edit({ provider: e.target.value as Provider })}
          >
            {PROVIDERS.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('cms-design.field.category')} hint={t('cms-design.field.categoryHint')}>
          <NativeSelect
            size="sm"
            aria-label={t('cms-design.field.category')}
            disabled={!writable}
            value={card.category}
            onChange={(e) => edit({ category: e.target.value })}
          >
            <NativeSelectOption value="">{t('cms-design.field.pickCategory')}</NativeSelectOption>
            {detail.categories.map((cat) => (
              <NativeSelectOption key={cat} value={cat}>
                {cat}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label={t('cms-design.field.blurb')} hint={t('cms-design.field.blurbHint')}>
        <Textarea
          aria-label={t('cms-design.field.blurb')}
          rows={2}
          disabled={!writable}
          value={card.blurb}
          onChange={(e) => edit({ blurb: e.target.value })}
          placeholder={t(BLURB_PLACEHOLDER)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cms-design.field.thumbnail')} hint={t('cms-design.field.thumbnailHint')}>
          <NativeSelect
            size="sm"
            aria-label={t('cms-design.field.thumbnail')}
            disabled={!writable}
            value={card.image}
            onChange={(e) => edit({ image: e.target.value })}
          >
            <NativeSelectOption value="">{t('cms-design.field.choosePicture')}</NativeSelectOption>
            {desktopShots.map((file) => (
              <NativeSelectOption key={file} value={file}>
                {file}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('cms-design.field.traits')} hint={t('cms-design.field.traitsHint')}>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <NativeSelect
              size="sm"
              className="w-[9rem]"
              aria-label={t('cms-design.field.navigation')}
              disabled={!writable}
              value={card.nav ?? 'top-left'}
              onChange={(e) => edit({ nav: e.target.value as Nav })}
            >
              {(Object.keys(NAV_LABEL) as Nav[]).map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {t('cms-design.field.navOption', { value: t(NAV_LABEL[n]) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="w-[9rem]"
              aria-label={t('cms-design.field.hero')}
              disabled={!writable}
              value={card.hero ?? 'split'}
              onChange={(e) => edit({ hero: e.target.value as Hero })}
            >
              {(Object.keys(HERO_LABEL) as Hero[]).map((h) => (
                <NativeSelectOption key={h} value={h}>
                  {t('cms-design.field.heroOption', { value: t(HERO_LABEL[h]) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-1.5">
              <Switch
                checked={card.dark ?? false}
                disabled={!writable}
                onCheckedChange={(v: boolean) => edit({ dark: v })}
                aria-label={t('cms-design.field.hasDark')}
              />
              {t('cms-design.field.dark')}
            </label>
            <NativeSelect
              size="sm"
              aria-label={t('cms-design.field.opensIn')}
              disabled={!writable || !card.dark}
              value={card.defaultTheme ?? 'light'}
              onChange={(e) => edit({ defaultTheme: e.target.value as 'light' | 'dark' })}
            >
              <NativeSelectOption value="light">{t('cms-design.field.opensLight')}</NativeSelectOption>
              <NativeSelectOption value="dark">{t('cms-design.field.opensDark')}</NativeSelectOption>
            </NativeSelect>
          </div>
        </Field>
      </div>
    </>
  )
  // A new path is a different page, so the address measured for the old one goes with it: kept, it
  // framed the OLD page under the new name. With none, tracy-web frames a Joomla demo at
  // `/index.php<path>` (`joomlaAddresses`).
  const setPath = (i: number, path: string) =>
    edit({
      layouts: card.layouts.map((x, j) => {
        if (j !== i) return x
        const { address: _stale, ...rest } = x
        return { ...rest, path }
      })
    })
  const addLayout = () =>
    edit({
      layouts: [
        ...card.layouts,
        { key: `page-${String(card.layouts.length + 1)}`, label: 'New page', path: '/', shots: {} }
      ]
    })
  // ── The Demo Card's Pages list (Templates page only; the old sheet keeps `addLayout`). ──
  /**
   * Add a page at the end with an empty label and path; its path field takes the focus. The key is
   * a placeholder until the path is committed (`commitPagePath`), then it follows the path.
   */
  const addPage = () => {
    const key = uniqueKey(
      'new-page',
      card.layouts.map((l) => l.key)
    )
    edit({ layouts: [...card.layouts, { key, label: '', path: '', shots: {} }] })
    setFreshKeys(new Set([...freshKeys, key]))
    setFocusKey(key)
  }
  /**
   * Shoot ONE page on the demo, desktop and mobile, and put what came back on that page only,
   * found by key in the card as it is when the answer arrives (rows may have moved meanwhile).
   * Answers the door's own words when the pictures did not come back, or null.
   */
  const shootPage = async (layout: Layout): Promise<string | null> => {
    if (!detail.template || !hasDemo) return t('cms-design.shoot.noDemo')
    const { key, path } = layout
    setPageShoot((s) => ({ ...s, [key]: { busy: true, error: null, path } }))
    let failed: string | null = null
    try {
      const shot = await shoot([layout], { row: true })
      const got = shotsFor(shot?.stored ?? [], key)
      failed = shot?.failed ?? (got.desktop || got.mobile ? null : t('cms-design.shoot.nothingForPage'))
      if (got.desktop || got.mobile) {
        setCard((c) => (c ? { ...c, layouts: mergePageShots(c.layouts, key, got) } : c))
      }
    } catch (e) {
      failed = thrownText(e)
    }
    setPageShoot((s) => ({ ...s, [key]: { busy: false, error: failed, path } }))
    return failed
  }
  /**
   * The admin committed row `i`'s path (blur or Enter). A row added since the card was read takes
   * its key from the path, unique among the pages; then, when the path is sound and the template
   * has a demo, that one page is shot (once per path).
   */
  const commitPagePath = (i: number) => {
    const l = card.layouts[i]
    setFocusKey(null)
    if (!l || !freshKeys.has(l.key)) return
    // A path that is empty, not a path, or another page's keeps the placeholder key and is not shot;
    // the row says what is wrong with it.
    if (pathProblems(card.layouts)[i] !== null) return
    const key = uniqueKey(
      keyFromPath(l.path),
      card.layouts.filter((_, j) => j !== i).map((x) => x.key)
    )
    const committed: Layout = { ...l, key, path: l.path.trim() }
    if (key !== l.key || committed.path !== l.path) {
      edit({ layouts: card.layouts.map((x, j) => (j === i ? committed : x)) })
      setFreshKeys(new Set([...freshKeys].map((k) => (k === l.key ? key : k))))
      setPageShoot((s) => {
        const { [l.key]: moved, ...rest } = s
        return moved ? { ...rest, [key]: moved } : rest
      })
    }
    if (!detail.template || !hasDemo) return
    if (pageShoot[l.key]?.path === committed.path) return
    void shootPage(committed)
  }
  const removePage = (i: number) => {
    const l = card.layouts[i]
    edit({ layouts: removeLayout(card.layouts, i) })
    if (l) setFreshKeys(new Set([...freshKeys].filter((k) => k !== l.key)))
  }
  const movePage = (i: number, delta: -1 | 1) => edit({ layouts: moveLayout(card.layouts, i, delta) })
  // The shot buttons come in two sizes: `sm` for the old Layouts table, `xs` for the Demo Card's
  // Pages group, which sits in the narrow Edit card column.
  const captureButtonSized = (size: 'sm' | 'xs') => (
    <Button
      size={size}
      variant="outline"
      disabled={!writable || !detail.template || !hasDemo || busy}
      title={!hasDemo ? t('cms-design.capture.noDemo') : t('cms-design.capture.title')}
      onClick={() => void capture()}
    >
      <Camera />
      {t('cms-design.capture.button')}
    </Button>
  )
  const uploadButtonSized = (size: 'sm' | 'xs') => (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center rounded-md border border-border font-medium',
        size === 'sm' ? 'gap-1.5 px-3 py-1.5 text-sm' : 'h-6 gap-1 px-2 text-xs',
        (!writable || !detail.template || busy) && 'pointer-events-none opacity-50'
      )}
    >
      <Upload size={size === 'sm' ? 14 : 12} />
      {t('cms-design.upload.button')}
      <input
        type="file"
        className="sr-only"
        multiple
        accept="image/png,image/jpeg,image/webp"
        disabled={!writable || !detail.template || busy}
        onChange={(e) => void upload(e.target.files)}
      />
    </label>
  )
  const captureButton = captureButtonSized('sm')
  const uploadButton = uploadButtonSized('sm')
  const layoutTable = (
    <>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm">{t('cms-design.layouts.title')}</p>
          <span className="text-muted-foreground text-xs">{t('cms-design.layouts.hint')}</span>
          {captureButton}
          {uploadButton}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {/* The Templates page numbers the rows in the order the preview dialog lists them. */}
                {cardOnly ? <TableHead className="w-8 text-end">#</TableHead> : null}
                <TableHead>{t('cms-design.layouts.key')}</TableHead>
                <TableHead>{t('cms-design.layouts.label')}</TableHead>
                <TableHead>{t('cms-design.layouts.path')}</TableHead>
                <TableHead>{t('cms-design.layouts.count')}</TableHead>
                <TableHead>{t('cms-design.layouts.desktop')}</TableHead>
                <TableHead>{t('cms-design.layouts.mobile')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.layouts.map((l, i) => (
                <TableRow key={l.key}>
                  {cardOnly ? (
                    <TableCell
                      className="w-8 text-end text-muted-foreground text-xs tabular-nums"
                      data-layout-number=""
                    >
                      {i + 1}
                    </TableCell>
                  ) : null}
                  <TableCell className="font-mono text-xs">{l.key}</TableCell>
                  <TableCell>
                    <Input
                      className="h-7 w-[9rem] border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                      aria-label={t('cms-design.layouts.labelFor', { key: l.key })}
                      disabled={!writable}
                      value={l.label}
                      onChange={(e) => layoutAt(i, { label: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-7 w-[14rem] font-mono text-xs border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                      aria-label={t('cms-design.layouts.pathFor', { key: l.key })}
                      disabled={!writable}
                      value={l.path}
                      onChange={(e) => setPath(i, e.target.value)}
                    />
                    {/* Shown, not hidden: where the page answers is a fact about this card, and a
                        person correcting a layout has to be able to see the address the picture
                        was taken at. Only when it differs — on a site whose paths are real
                        addresses there is nothing to say. */}
                    {l.address === undefined ? null : (
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {t('cms-design.layouts.answersAt', { address: l.address })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-7 w-[4rem] border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                      placeholder="—"
                      aria-label={t('cms-design.layouts.countFor', { key: l.key })}
                      disabled={!writable}
                      value={l.count === undefined ? '' : String(l.count)}
                      onChange={(e) =>
                        layoutAt(i, {
                          count: e.target.value === '' ? undefined : Number(e.target.value)
                        })
                      }
                    />
                  </TableCell>
                  <ShotCell
                    label={t('cms-design.layouts.desktopFor', { key: l.key })}
                    value={l.shots?.desktop ?? ''}
                    held={desktopShots}
                    template={detail.template ?? null}
                    shape="desktop"
                    writable={writable}
                    onPick={(file) =>
                      layoutAt(i, { shots: { ...l.shots, desktop: file === '' ? undefined : file } })
                    }
                  />
                  <ShotCell
                    label={t('cms-design.layouts.mobileFor', { key: l.key })}
                    value={l.shots?.mobile ?? ''}
                    held={desktopShots}
                    template={detail.template ?? null}
                    shape="mobile"
                    writable={writable}
                    onPick={(file) =>
                      layoutAt(i, { shots: { ...l.shots, mobile: file === '' ? undefined : file } })
                    }
                  />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button size="sm" variant="ghost" className="mt-2" disabled={!writable} onClick={addLayout}>
          {t('cms-design.layouts.add')}
        </Button>
      </div>
    </>
  )
  // The Templates page writes a release's listing; the old Quickstarts sheet still says card.
  const cardHelp = t(
    cardOnly
      ? !hasCard
        ? 'cms-design.help.listingNew'
        : detail.published
          ? 'cms-design.help.listingPublished'
          : 'cms-design.help.listingHidden'
      : detail.published
        ? 'cms-design.help.cardPublished'
        : 'cms-design.help.cardHidden'
  )
  const saveButton = (
    <Button
      size="sm"
      variant={cardOnly ? 'default' : 'outline'}
      disabled={!writable || busy || locked || blockers.length > 0}
      onClick={() => void press('save')}
      data-card-save=""
      data-dirty={cardOnly && dirty ? '' : undefined}
      title={
        locked
          ? listingRuleText('demo-required')
          : blockers.length > 0
            ? blockers.join(' ')
            : cardOnly
              ? // The Templates page has no help line under its presses: the tooltip says what saving does.
                dirty
                ? t('cms-design.save.unsavedTitle', { help: cardHelp })
                : cardHelp
              : detail.published
                ? t('cms-design.save.titlePublished')
                : t('cms-design.save.titleHidden')
      }
    >
      <Save />
      {cardOnly
        ? hasCard
          ? t('cms-design.save.update')
          : t('cms-design.save.listing')
        : t('cms-design.save.card')}
      {/* 🔒 THE UNSAVED MARK IS ON THE PRESS (Akemi, 10/10/2026): a dot in the button's own text
          colour, where the old "Preview only" tag sat beside it; read aloud as Unsaved changes. */}
      {cardOnly && dirty ? (
        <>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" data-card-unsaved="" />
          <span className="sr-only">{t('cms-design.save.unsaved')}</span>
        </>
      ) : null}
    </Button>
  )
  const saveActions = (
    <>
      {/* Actions. Save card makes the card; Publish puts the saved card in front of customers. On
          the Templates page Publish and Unpublish sit in the template header instead. */}
      <div className="flex flex-col gap-2 border-border border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {saveButton}
          {cardOnly ? generateButton : null}
          {cardOnly ? null : (
            <>
              {detail.published ? null : (
                <Button
                  size="sm"
                  disabled={!writable || busy || shelfBlockers.length > 0}
                  onClick={() => void press('publish')}
                  data-card-publish=""
                  title={shelfBlockers.length > 0 ? shelfBlockers.join(' ') : t('cms-design.publish.title')}
                >
                  <Eye />
                  {t('cms-design.publish.button')}
                </Button>
              )}
              {detail.published ? (
                <Button
                  variant={unpublishing ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={!writable || busy}
                  data-card-unpublish=""
                  title={
                    unpublishing
                      ? t('cms-design.unpublish.titleArmed', { name: cardName, tag })
                      : t('cms-design.unpublish.title', { name: cardName })
                  }
                  onClick={() => {
                    if (pressing.current) return
                    if (!unpublishing) {
                      setUnpublishArmed(unpublishKey)
                      return
                    }
                    setUnpublishArmed(null)
                    void press('unpublish')
                  }}
                  onBlur={() => setUnpublishArmed(null)}
                >
                  <EyeOff />
                  {unpublishing
                    ? t('cms-design.unpublish.confirm', { name: cardName })
                    : t('cms-design.unpublish.button')}
                </Button>
              ) : null}
            </>
          )}
          {dirty ? (
            <Badge variant="outline" className="border-dashed font-normal">
              {t('cms-design.save.previewOnly')}
            </Badge>
          ) : null}
        </div>
        {warnings.length > 0 ? (
          <ul className="list-inside list-disc text-amber-600 text-xs">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {blockers.length > 0 ? (
          <ul className="list-inside list-disc text-muted-foreground text-xs">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {!cardOnly && !detail.published && shelfBlockers.length > 0 ? (
          <ul className="list-inside list-disc text-muted-foreground text-xs">
            {shelfBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground text-xs" data-card-help="">
          {cardHelp}
        </p>
      </div>
    </>
  )

  // 🔒 THE TEMPLATES PAGE SPLITS THE TAB IN TWO (Akemi, 10/10/2026): what comes off this CMS's demo
  // site (its address, the contract it binds) above what the card says, its layouts included.
  // Each Fact sits in its own wrapper so every cell of a row drops the bottom rule.
  if (cardOnly)
    return (
      <div className="flex flex-col gap-5">
        {messages}
        <section className={SECTION_CARD} data-card-section="demo-site">
          <span className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t('cms-design.facts.demoSite')}</h3>
            {siteTag}
          </span>
          <div className="mt-4">{demo}</div>
        </section>
        <section className={SECTION_CARD} data-card-section="demo-card" aria-labelledby="demo-card-heading">
          {/* The heading row (Listing, its presses, what holds Save back) is the editor's own. */}
          <div>
            <DemoCardEditor
              status={status}
              model={{
                // The picture as Save will store it, so the Preview shows what customers get.
                card: { ...card, image: cardImage },
                name: detail.label || tag,
                template: detail.template,
                shots: desktopShots,
                categories: detail.categories,
                // The CMSes the customer card wears logos for, in the gallery's order (Joomla first).
                platforms: CMS.filter(
                  (c) => detail.platforms.some((p) => p.platform === c) || detail.platform === c
                ),
                reason: detail.reason,
                writable,
                locked,
                checklist,
                otherRules,
                warnings,
                edit,
                layoutAt,
                setPath,
                addPage,
                commitPagePath,
                removePage,
                movePage,
                shootPage,
                rowProblems,
                pageShoot,
                focusKey,
                hasDemo,
                saveButton,
                generateButton,
                uploadShot
              }}
            />
          </div>
        </section>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      {generateRow}
      {/* Read, not typed: what the release and this server already know. */}
      {/* The Templates page draws its own facts in its two sections (cardOnly, above). */}
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Fact label={t('cms-design.facts.labelVersion')}>
          {detail.label} · {detail.version ?? '—'}
        </Fact>
        <Fact label={t('cms-design.facts.languages')}>{detail.languages.join(', ') || '—'}</Fact>
        <Fact label={t('cms-design.facts.demo')}>
          {detail.demo ? (
            <span className="flex flex-wrap items-center gap-2">
              <Globe className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{detail.demo.url}</span>
              <Badge variant="secondary" className="font-mono font-normal text-[10px]">
                {detail.demo.version ?? '—'}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('cms-design.facts.noDemo')}</span>
          )}
        </Fact>
        <Fact label={t('cms-design.facts.platforms')}>
          {detail.platforms.length > 0 ? (
            <span className="flex flex-col gap-1">
              {detail.platforms.map((p) => (
                <span key={p.tag} className="flex flex-wrap items-baseline gap-x-2">
                  <span>{CMS_LABEL[p.platform]}</span>
                  <ContractLine status={p.contract} />
                </span>
              ))}
            </span>
          ) : detail.platform ? (
            CMS_LABEL[detail.platform]
          ) : (
            '—'
          )}
        </Fact>
      </div>

      {cardFields}
      {layoutTable}
      {saveActions}
    </div>
  )
}

/**
 * One picture of one layout: which of the stored names it is, and whether this server has it.
 *
 * A choice among what is HELD rather than a free-text field, because a name typed by hand that the
 * store does not have is exactly the grey rectangle this whole store was built to end — and it
 * would validate, publish, and only be visible to a customer.
 *
 * Drawn as the picture itself, not its file name: two 11rem name dropdowns per row pushed the table
 * past the sheet (891 px in 861, Mobile cut off, measured 30/09) and still cut every name at
 * "business-home-144…". The name stays on the trigger's title and under each choice.
 */
function ShotCell(props: ShotPickerProps) {
  return (
    <TableCell>
      <ShotPicker {...props} />
    </TableCell>
  )
}

export interface ShotPickerProps {
  label: string
  value: string
  held: string[]
  /** The template the pictures belong to; null before the card has one. */
  template: string | null
  shape: 'desktop' | 'mobile'
  writable: boolean
  onPick: (file: string) => void
  /** Classes for the picture frame, to size it beyond the table's small default. */
  frameClassName?: string
  /** Words drawn inside an empty frame; none by default (the table shows a hatched box). */
  emptyText?: string
  /**
   * Which served width the frame loads; 720 for a frame wider than the table's. `original` loads the
   * stored file itself: the door's thumbnails are cropped to 16:10, which leaves a tall mobile frame
   * showing a sliver of the page's top.
   */
  thumbWidth?: 360 | 720 | 'original'
  /**
   * Opens the chosen picture large. When given and a held picture is chosen, a click on the picture
   * calls this, and a small corner button opens the picker instead, so viewing and choosing do not
   * fight over one click. Without it (the old table), the picture itself opens the picker.
   */
  onView?: () => void
  /**
   * Uploads one picture as THIS shot (the Templates page's Pages list). When given, the chooser
   * offers "Upload a picture"; the promise answers the refusal in words, or null once the picture
   * is stored and set. Without it (the old table, which keeps its own Upload pictures button), the
   * chooser only picks among held pictures.
   */
  onUpload?: (file: File) => Promise<string | null>
  /**
   * Shoots THIS page on the demo, desktop and mobile, and sets both its shots (the Templates
   * page's Pages list). When given, the chooser offers "Take from demo" beside "Upload a picture";
   * the promise answers the door's words when the pictures did not come back, or null.
   */
  onTake?: () => Promise<string | null>
  /** Why "Take from demo" is off (no demo, no path yet), said beside it; null when it is on. */
  takeBlocked?: string | null
  /** This page is being shot right now, from its row or from this chooser. */
  taking?: boolean
}

/** The picture trigger and its grid of held pictures, without the table cell around it. */
export function ShotPicker({
  label,
  value,
  held,
  template,
  shape,
  writable,
  onPick,
  frameClassName,
  emptyText,
  thumbWidth = 360,
  onView,
  onUpload,
  onTake,
  takeBlocked = null,
  taking = false
}: ShotPickerProps) {
  const t = useT()
  const missing = value !== '' && !held.includes(value)
  // The frame loads `thumbWidth`; the picker's grid of small tiles always loads the 360 thumbnail.
  const src = (file: string, w: 360 | 720 | 'original' = thumbWidth) =>
    template
      ? `/api/templates/${template}/shots/${encodeURIComponent(file)}${w === 'original' ? '' : `?w=${String(w)}`}`
      : undefined
  const frame = cn(shape === 'desktop' ? 'h-10 w-16' : 'h-10 w-[1.4rem]', frameClassName)
  // Controlled so a pick closes the grid, as choosing from the old dropdown did.
  const [open, setOpen] = useState(false)
  const pick = (file: string) => {
    onPick(file)
    setOpen(false)
  }
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const upload = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    // Cleared so choosing the same file again still fires a change.
    input.value = ''
    if (!file || !onUpload) return
    setUploading(true)
    setUploadError(null)
    try {
      const refused = await onUpload(file)
      if (refused === null) setOpen(false)
      else setUploadError(refused)
    } finally {
      setUploading(false)
    }
  }
  const take = async () => {
    if (!onTake) return
    setUploadError(null)
    const refused = await onTake()
    if (refused === null) setOpen(false)
    else setUploadError(refused)
  }
  const viewable = onView !== undefined && value !== '' && !missing && template !== null
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // A refusal belongs to the try it answered; a reopened chooser starts clean.
        if (next) setUploadError(null)
      }}
    >
      {viewable ? (
        // The picture views; the corner button (shown on hover or keyboard focus) chooses.
        <div className={cn('group relative overflow-hidden rounded border border-border bg-muted', frame)}>
          <button
            type="button"
            onClick={onView}
            aria-label={t('cms-design.shot.view', { label })}
            title={value}
            className="block size-full cursor-zoom-in outline-none focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1"
          >
            <img src={src(value)} alt="" className="size-full object-cover object-top" loading="lazy" />
          </button>
          {writable ? (
            <PopoverTrigger
              aria-label={t('cms-design.shot.change', { label })}
              title={t('cms-design.shot.another')}
              className="absolute right-0.5 bottom-0.5 grid size-5 place-items-center rounded border border-border bg-background text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:border-ring focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
            >
              <Pencil className="size-3" />
            </PopoverTrigger>
          ) : null}
        </div>
      ) : (
        <PopoverTrigger
          disabled={!writable}
          aria-label={label}
          title={
            missing
              ? t('cms-design.shot.missingTitle', { file: value })
              : value === ''
                ? t('cms-design.shot.none')
                : value
          }
          className={cn(
            'block overflow-hidden rounded border bg-muted disabled:cursor-not-allowed disabled:opacity-60',
            frame,
            value === '' &&
              'border-dashed bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--muted)_4px,var(--muted)_8px)]',
            missing && 'border-destructive'
          )}
        >
          {value !== '' && !missing && template ? (
            <img src={src(value)} alt="" className="size-full object-cover object-top" loading="lazy" />
          ) : missing ? (
            <ImageIcon className="m-auto size-3.5 text-destructive" />
          ) : emptyText ? (
            <span className="grid size-full place-items-center px-1 text-center text-[11px] text-muted-foreground">
              {emptyText}
            </span>
          ) : null}
        </PopoverTrigger>
      )}
      <PopoverContent align="end" className="w-[26rem] p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="min-w-0 font-medium text-xs">{label}</p>
          <span className="flex shrink-0 items-center gap-1.5">
            {onTake ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={!writable || takeBlocked !== null || taking || uploading}
                title={takeBlocked ?? t('cms-design.shot.takeTitle')}
                onClick={() => void take()}
              >
                <Camera className="size-3" />
                {taking ? t('cms-design.shot.taking') : t('cms-design.shot.take')}
              </Button>
            ) : null}
            {onUpload ? (
              <label
                className={cn(
                  'inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-2 font-medium text-xs hover:bg-muted has-[:focus-visible]:border-ring',
                  (uploading || taking) && 'pointer-events-none opacity-50'
                )}
                title={t('cms-design.shot.uploadTitle')}
              >
                <Upload className="size-3" />
                {uploading ? t('cms-design.shot.uploading') : t('cms-design.shot.upload')}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading || taking || !writable}
                  onChange={(e) => void upload(e.currentTarget)}
                />
              </label>
            ) : null}
          </span>
        </div>
        {onTake && takeBlocked !== null ? (
          <p className="mb-2 px-1 text-muted-foreground text-xs">{takeBlocked}</p>
        ) : null}
        {uploadError ? <p className="mb-2 px-1 text-destructive text-xs">{uploadError}</p> : null}
        {missing ? (
          <p className="mb-2 px-1 text-destructive text-xs">
            {t('cms-design.shot.missing', { file: value })}
          </p>
        ) : null}
        <div className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => pick('')}
            className={cn(
              'flex flex-col gap-1 rounded p-1 text-left text-[10px] text-muted-foreground hover:bg-muted',
              value === '' && 'ring-2 ring-primary'
            )}
          >
            <span className="h-14 w-full rounded border border-dashed" />
            {t('cms-design.shot.none')}
          </button>
          {held.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => pick(file)}
              title={file}
              className={cn(
                'flex min-w-0 flex-col gap-1 rounded p-1 text-left text-[10px] text-muted-foreground hover:bg-muted',
                file === value && 'ring-2 ring-primary'
              )}
            >
              <span className="h-14 w-full overflow-hidden rounded border bg-muted">
                {template ? (
                  <img
                    src={src(file, 360)}
                    alt=""
                    className="size-full object-cover object-top"
                    loading="lazy"
                  />
                ) : null}
              </span>
              <span className="break-all">{file}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
