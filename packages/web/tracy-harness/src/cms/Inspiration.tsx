/**
 * Design inspiration — what customers on THIS server are offered right now, what is held back and
 * why, and the way to the card editor (`tasks/todo-ops-design-inspiration.md`).
 *
 * 🔒 LIVE, NOT A REF. Every number here is the database of the server answering
 * (`GET /api/ops/inspiration`): which releases it last read, which cards are unpublished, which
 * demos run. The repo's own catalogue at a ref is another screen (`catalog`, "Repo catalogue"), and
 * mixing the two is the mistake this screen exists to end (Lee, 04/10/2026). So there is no
 * environment picker above it, and its header names the server instead.
 *
 * 🔒 THE UNIT IS THE TEMPLATE, as a customer sees it. `tracy-business` is one row carrying three
 * CMSes, because it is one card. The two held-back tabs are per RELEASE, because what holds a card
 * back (a draft, an Unpublish) is a fact about one release.
 *
 * 🔒 A WARNING IS NOT A GATE. A card with no demo or no picture on this server is still offered —
 * the server's rule says so (`shownOnInspiration`) — so it stays on "Shown to customers" and wears
 * its warnings, rather than being drawn as off.
 */
import {
  Badge,
  Button,
  Card,
  Input,
  NativeSelect,
  NativeSelectOption,
  PlatformGlyph,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@tracy/ui'
import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  fetchInspiration,
  type Inspiration as Listing,
  type InspirationRelease,
  type InspirationShown,
  type Refusal
} from './api'
import { type CardRelease, DesignInspirationSheet } from './DesignInspiration'
import { DesignSystemsSwitch } from './DesignSystemsSwitch'
import { LoadingRows, Panel, RefusalNotice, ScreenHead } from './parts'
import { thrownText } from './response-error'
import { CMS, CMS_LABEL, type Cms } from './route'
import { formatWith, Trans, useLanguage, useT } from '../i18n'

type Tab = 'shown' | 'held' | 'none'
type CmsFilter = 'all' | Cms

const cmsName = (platform: string | null) => (platform ? (CMS_LABEL[platform as Cms] ?? platform) : '—')

/** "4 Oct, 17:36" in UTC — the header says UTC, so the clock of the reader's machine does not move it. */
function readAtText(iso: string, lang: string): string {
  return formatWith(
    iso,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' },
    lang
  )
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** What the sheet is open on: a card's name and the releases its file can be edited on. */
interface Editing {
  name: string
  releases: CardRelease[]
}

export function Inspiration() {
  const t = useT()
  const { lang } = useLanguage()
  const [listing, setListing] = useState<Listing | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flipping, setFlipping] = useState(false)
  const [tab, setTab] = useState<Tab>('shown')
  const [cms, setCms] = useState<CmsFilter>('all')
  const [category, setCategory] = useState('')
  const [term, setTerm] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    fetchInspiration(ac.signal).then((r) => {
      if (ac.signal.aborted) return
      if (!r.ok) {
        // A failed RE-read keeps the last answer on screen and says so; only a first read empties it.
        if (r.refusal.kind !== 'aborted') setRefusal(r.refusal)
        return
      }
      setRefusal(null)
      setListing(r.value)
    })
    return () => ac.abort()
  }, [reloadKey])

  const refresh = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/ops/quickstarts/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        setError(body.reason ?? t('cms-design.screen.refreshAnswered', { status: response.status }))
      reload()
    } catch (e) {
      setError(thrownText(e))
    } finally {
      setBusy(false)
    }
  }

  const flipDesignSystems = async (shown: boolean) => {
    setFlipping(true)
    setError(null)
    try {
      const response = await fetch('/api/ops/design-systems', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shown })
      })
      if (!response.ok) throw new Error(t('cms-design.screen.switchAnswered', { status: response.status }))
      const next = (await response.json()).shown === true
      setListing((was) => (was ? { ...was, designSystemsShown: next } : was))
    } catch (e) {
      setError(thrownText(e))
    } finally {
      setFlipping(false)
    }
  }

  const shown = listing?.shown ?? []
  const categories = useMemo(
    () =>
      [...new Set(shown.map((x) => x.card.category ?? ''))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [shown]
  )
  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    return shown.filter(
      (x) =>
        (cms === 'all' || x.platforms.some((p) => p.platform === cms)) &&
        (category === '' || x.card.category === category) &&
        (needle === '' || `${x.label} ${x.id}`.toLowerCase().includes(needle))
    )
  }, [shown, cms, category, term])

  if (!listing)
    return (
      <div className="flex flex-col gap-5 px-6 py-6">
        <ScreenHead title={t('cms-design.screen.title')} sub={t('cms-design.screen.sub')} />
        {refusal ? (
          <RefusalNotice refusal={refusal} onRetry={reload} />
        ) : (
          <Panel title={t('cms-design.screen.readingPanel')}>
            <LoadingRows label={t('cms-design.screen.readingRows')} />
          </Panel>
        )}
      </div>
    )

  const { counts, writable } = listing
  // `data-*` hooks are what the regression case (REG-100) reads — stable where the words are not.
  return (
    <div className="flex flex-col gap-5 px-6 py-6" data-ops-inspiration="">
      <ScreenHead
        title={t('cms-design.screen.title')}
        sub={
          <>
            <Trans
              i18nKey="cms-design.screen.subHost"
              values={{ host: hostOf(listing.origin) }}
              components={{ host: <span className="font-mono" /> }}
            />{' '}
            {listing.readAt
              ? t('cms-design.screen.readAt', { when: readAtText(listing.readAt, lang) })
              : t('cms-design.screen.neverRead')}
          </>
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={busy || !listing.canRefresh || !writable}
          data-refresh=""
          title={
            listing.canRefresh ? t('cms-design.screen.refreshTitle') : (listing.cannotRefreshReason ?? '')
          }
        >
          <RefreshCw />
          {busy ? t('cms-design.screen.refreshing') : t('cms-design.screen.refresh')}
        </Button>
      </ScreenHead>
      {!listing.canRefresh && listing.cannotRefreshReason ? (
        <p className="-mt-3 text-muted-foreground text-xs">{listing.cannotRefreshReason}</p>
      ) : null}
      {refusal ? <RefusalNotice refusal={refusal} onRetry={reload} /> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat id="shown" label={t('cms-design.screen.statShown')} value={counts.shown} />
        <Stat
          id="joomla"
          label={t('cms-design.screen.statWith', { cms: CMS_LABEL.joomla })}
          value={counts.joomla}
        />
        <Stat
          id="wordpress"
          label={t('cms-design.screen.statWith', { cms: CMS_LABEL.wordpress })}
          value={counts.wordpress}
        />
        <Stat
          id="emdash"
          label={t('cms-design.screen.statWith', { cms: CMS_LABEL.emdash })}
          value={counts.emdash}
        />
      </div>

      <DesignSystemsSwitch
        shown={listing.designSystemsShown}
        writable={writable}
        busy={flipping}
        onChange={(v) => void flipDesignSystems(v)}
      />

      <Tabs value={tab} onValueChange={(v: Tab) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="shown" data-tab="shown">
            {t('cms-design.screen.tabShown', { n: counts.shown })}
          </TabsTrigger>
          <TabsTrigger value="held" data-tab="held">
            {t('cms-design.screen.tabHeld', { n: counts.notShown })}
          </TabsTrigger>
          <TabsTrigger value="none" data-tab="none">
            {t('cms-design.screen.tabNone', { n: counts.noCard })}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'shown' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="ps-8"
                placeholder={t('cms-design.screen.search')}
                aria-label={t('cms-design.screen.search')}
                data-search=""
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <ToggleGroup
              variant="outline"
              value={[cms]}
              onValueChange={(v: string[]) => setCms((v[0] as CmsFilter | undefined) ?? 'all')}
              aria-label={t('cms-design.screen.cmsFilter')}
            >
              <ToggleGroupItem value="all" data-cms="all">
                {t('cms-design.screen.all')}
              </ToggleGroupItem>
              {CMS.map((c) => (
                <ToggleGroupItem key={c} value={c} aria-label={CMS_LABEL[c]} data-cms={c}>
                  <PlatformGlyph platform={c} />
                  {CMS_LABEL[c]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <NativeSelect
              aria-label={t('cms-design.screen.category')}
              data-category-filter=""
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <NativeSelectOption value="">{t('cms-design.screen.allCategories')}</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="ms-auto text-muted-foreground text-xs tabular-nums">
              {t('cms-design.screen.matches', { shown: filtered.length, total: shown.length })}
            </span>
          </div>
          <ShownTable
            rows={filtered}
            empty={
              shown.length === 0 ? t('cms-design.screen.emptyServer') : t('cms-design.screen.emptyFilter')
            }
            onEdit={(x) =>
              setEditing({
                name: x.label,
                releases: x.platforms.map((p) => ({ tag: p.tag, platform: p.platform, version: p.version }))
              })
            }
          />
        </>
      ) : (
        <ReleaseTable
          kind={tab}
          rows={tab === 'held' ? listing.notShown : listing.noCard}
          onOpen={(r) =>
            setEditing({
              name: r.label,
              releases: [{ tag: r.tag, platform: r.platform, version: r.version }]
            })
          }
        />
      )}

      <DesignInspirationSheet
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        name={editing?.name ?? ''}
        releases={editing?.releases ?? []}
        writable={writable}
        onChanged={reload}
      />
    </div>
  )
}

function Stat({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-4 py-3" data-stat={id}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-xl tabular-nums">{value}</span>
    </div>
  )
}

function Builds({ platforms }: { platforms: InspirationShown['platforms'] }) {
  return (
    <div className="flex flex-col gap-1">
      {platforms.map((p) => (
        <span
          key={p.tag}
          className="inline-flex items-center gap-1.5 text-xs"
          title={p.tag}
          data-build={p.tag}
          data-platform={p.platform}
        >
          {p.platform in CMS_LABEL ? <PlatformGlyph platform={p.platform as Cms} /> : null}
          <span>{cmsName(p.platform)}</span>
          <span className="text-muted-foreground tabular-nums">{p.version}</span>
        </span>
      ))}
    </div>
  )
}

/** The count, and every sentence on hover — a warning is read, not acted on from the list. */
function Warnings({ list }: { list: string[] }) {
  const t = useT()
  if (list.length === 0) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
            tabIndex={0}
            data-warnings={list.length}
          />
        }
      >
        <AlertTriangle className="size-3" />
        {t('cms-design.screen.warnings', { count: list.length })}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" data-warning-list="">
        <ul className="list-disc ps-4">
          {list.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

/** The group key of cards with no category (shown through the dictionary, sorted last). */
const NO_CATEGORY = 'No category'

function ShownTable({
  rows,
  empty,
  onEdit
}: {
  rows: InspirationShown[]
  empty: string
  onEdit: (t: InspirationShown) => void
}) {
  const t = useT()
  // Grouped by the card's own category string, A→Z; a card with none goes last, under its own name.
  const groups = useMemo(() => {
    const by = new Map<string, InspirationShown[]>()
    for (const x of rows) {
      const key = x.card.category || NO_CATEGORY
      by.set(key, [...(by.get(key) ?? []), x])
    }
    return [...by.entries()].sort(([a], [b]) =>
      a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b)
    )
  }, [rows])
  if (rows.length === 0)
    return (
      <Card className="py-0">
        <p className="px-4 py-6 text-muted-foreground text-sm">{empty}</p>
      </Card>
    )
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([category, list]) => (
        <Card key={category} className="gap-0 overflow-hidden py-0" data-category={category}>
          <div className="flex items-center gap-2 px-4 py-3">
            <h2 className="font-medium text-sm">
              {category === NO_CATEGORY ? t('cms-design.screen.noCategory') : category}
            </h2>
            <span className="text-muted-foreground text-xs tabular-nums">{list.length}</span>
          </div>
          <Separator />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('cms-design.screen.colCard')}</TableHead>
                  <TableHead>{t('cms-design.screen.colTemplate')}</TableHead>
                  <TableHead>{t('cms-design.screen.colBuilds')}</TableHead>
                  <TableHead>{t('cms-design.screen.colProvider')}</TableHead>
                  <TableHead className="text-end">{t('cms-design.screen.colLayouts')}</TableHead>
                  <TableHead>{t('cms-design.screen.colDesignSystem')}</TableHead>
                  <TableHead>{t('cms-design.screen.colWarnings')}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((x) => (
                  <TableRow key={x.id} data-template={x.id}>
                    <TableCell>
                      {x.card.image ? (
                        <img
                          src={x.card.image}
                          alt=""
                          className="h-12 w-20 rounded border border-border object-cover object-top"
                        />
                      ) : (
                        <span className="flex h-12 w-20 items-center justify-center rounded border border-dashed text-muted-foreground text-xs">
                          {t('cms-design.screen.noImage')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{x.label}</div>
                      <div className="font-mono text-muted-foreground text-xs">{x.id}</div>
                      {x.card.blurb ? (
                        <div className="max-w-64 truncate text-muted-foreground text-xs" title={x.card.blurb}>
                          {x.card.blurb}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Builds platforms={x.platforms} />
                    </TableCell>
                    <TableCell className="text-sm">{x.card.provider ?? '—'}</TableCell>
                    <TableCell className="text-end text-sm tabular-nums">{x.card.layouts}</TableCell>
                    <TableCell className="font-mono text-xs">{x.design?.id ?? '—'}</TableCell>
                    <TableCell>
                      <Warnings list={x.warnings} />
                    </TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant="outline" onClick={() => onEdit(x)} data-edit-card="">
                        {t('cms-design.screen.editCard')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ReleaseTable({
  kind,
  rows,
  onOpen
}: {
  kind: 'held' | 'none'
  rows: InspirationRelease[]
  onOpen: (r: InspirationRelease) => void
}) {
  const t = useT()
  if (rows.length === 0)
    return (
      <Card className="py-0">
        <p className="px-4 py-6 text-muted-foreground text-sm">
          {kind === 'held' ? t('cms-design.screen.emptyHeld') : t('cms-design.screen.emptyNone')}
        </p>
      </Card>
    )
  return (
    <Card className="gap-0 overflow-hidden py-0" data-release-table={kind}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('cms-design.screen.colTemplate')}</TableHead>
              <TableHead>{t('cms-design.screen.colRelease')}</TableHead>
              <TableHead>{t('cms-design.screen.cmsFilter')}</TableHead>
              <TableHead>
                {kind === 'held' ? t('cms-design.screen.colWhy') : t('cms-design.screen.colCard')}
              </TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.tag} data-release={r.tag}>
                <TableCell>
                  <div className="font-medium text-sm">{r.label}</div>
                  {r.template ? (
                    <div className="font-mono text-muted-foreground text-xs">{r.template}</div>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.tag} <span className="text-muted-foreground">{r.version ?? '—'}</span>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    {r.platform && r.platform in CMS_LABEL ? (
                      <PlatformGlyph platform={r.platform as Cms} />
                    ) : null}
                    {cmsName(r.platform)}
                  </span>
                </TableCell>
                <TableCell className="max-w-md text-sm" data-why="">
                  {kind === 'held' ? (
                    r.why
                  ) : (
                    <span className="text-muted-foreground">{t('cms-design.screen.noCard')}</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Button size="sm" variant="outline" onClick={() => onOpen(r)}>
                    {kind === 'held' ? t('cms-design.screen.editCard') : t('cms-design.screen.createCard')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
