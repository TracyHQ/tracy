/**
 * The Templates page's Demo Card (Design Inspiration tab), as Akemi chose it on 10/10/2026
 * ("Preview + form", layout A): a read-only Preview panel of only what customers see, the
 * Edit listing form beside it (its last group is the compact Pages list, Akemi 10/10/2026). The two
 * presses sit on the Listing heading row, top right (Akemi, 10/10/2026): the section is long, and a
 * press at its foot meant scrolling to find it. What Save still needs is a short checklist under
 * the heading, left aligned; while the listing waits for the demo, one muted line instead and no form
 * (Akemi, 11/10/2026: keep it tidy and short).
 *
 * Every field, press and blocker is the one `DesignInspirationBody` owns (`DemoCardModel`); this file
 * only draws them. Any picture opens large in `ShotLightbox`.
 */
import { Button, Input, cn } from '@tracy/ui'
import { ArrowDown, ArrowUp, Circle, CircleCheck, Eye, Moon, Plus, Sun, X } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'

import { useT } from '../i18n'
import { type Card, type Layout, type PageShootState, ShotPicker } from './DesignInspiration'
import { isHome, pathProblems } from './demo-card-pages'
import { CardFields, GroupTitle } from './DemoCardFields'
import { CMS_LABEL, type Cms } from './route'
import { type LightboxShot, ShotLightbox, fileShot, shotSrc, pageShot } from './ShotLightbox'

/** Everything the Demo Card needs from the card form; built once in `DesignInspirationBody`. */
export interface DemoCardModel {
  card: Card
  name: string
  template: string | null
  shots: string[]
  categories: string[]
  /** The CMSes the template is offered on, in the gallery's order. */
  platforms: Cms[]
  reason: string | null
  writable: boolean
  /**
   * No listing saved and no live demo (Akemi, 11/10/2026): the listing waits for the demo. Both
   * presses are off, one muted line says so, and the checklist and the form are not drawn.
   */
  locked: boolean
  /** The four field rules Save needs, each done or not; drawn as a short checklist under the heading. */
  checklist: { label: string; ok: boolean }[]
  /** Any other reason Save is off (page rows, pictures being taken), one short line each. */
  otherRules: string[]
  warnings: string[]
  edit: (patch: Partial<Card>) => void
  layoutAt: (i: number, patch: Partial<Layout>) => void
  setPath: (i: number, path: string) => void
  /** Adds an empty page at the end; its path field takes the focus. */
  addPage: () => void
  /** Row `i`'s path was committed (blur or Enter): a new page's key follows it, then it is shot. */
  commitPagePath: (i: number) => void
  removePage: (i: number) => void
  movePage: (i: number, delta: -1 | 1) => void
  /** Shoots one page on the demo and sets both its shots; answers the door's words, or null. */
  shootPage: (layout: Layout) => Promise<string | null>
  /** What is wrong with each row (empty or shared path, no label), in row order; null when nothing. */
  rowProblems: (string | null)[]
  /** Each page's own shoot, by key. */
  pageShoot: Record<string, PageShootState>
  /** The page whose path field takes the focus once (a page just added). */
  focusKey: string | null
  /** Whether a demo is live: Take from demo reads it. */
  hasDemo: boolean
  /** Update/Save listing; it wears its own unsaved dot and says what saving does in its tooltip. */
  saveButton: ReactNode
  /** Regenerate/Create listing. */
  generateButton: ReactNode
  /** Uploads one picture as page `i`'s desktop or mobile shot; answers the refusal, or null. */
  uploadShot: (i: number, shape: 'desktop' | 'mobile', file: File) => Promise<string | null>
}

/** Opens one picture large; the Preview and the Pages list call it. */
export type ViewShot = (shot: LightboxShot) => void

/**
 * The whole Listing section's inside: the heading row with the presses, what holds Save back, then
 * `status`, the release's listing status strips (`ListingStatusStrip`), then the editor. The strip
 * sits right above Edit listing and its words point at that form (`listingNextStep`).
 */
export function DemoCardEditor({ model: m, status }: { model: DemoCardModel; status: ReactNode }) {
  const t = useT()
  const [shown, setShown] = useState<LightboxShot | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 id="demo-card-heading" className="font-semibold text-sm">
            {t('cms-demos.card.listing')}
          </h3>
          <div className="flex flex-wrap items-center gap-2" data-card-actions="">
            {m.saveButton}
            {m.generateButton}
          </div>
        </div>
        {m.locked ? (
          <p className="text-muted-foreground text-sm" data-card-locked="">
            {t('cms-demos.card.waiting')}
          </p>
        ) : (
          <Notes m={m} />
        )}
      </div>
      {status ?? null}
      {m.reason && !m.locked ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">{m.reason}</p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]" hidden={m.locked}>
        <CardPreview m={m} view={setShown} />
        <section
          aria-labelledby="demo-card-edit"
          className="flex min-w-0 flex-col gap-3"
          data-road-control="listing-edit"
        >
          <h4 id="demo-card-edit" className="font-semibold text-sm">
            {t('cms-demos.card.edit')}
          </h4>
          <CardFields m={m} />
          <Pages m={m} view={setShown} />
        </section>
      </div>
      <ShotLightbox shot={shown} template={m.template} onClose={() => setShown(null)} />
    </div>
  )
}

/** The real CMS logos the customer card and the Create with buttons wear. */
const LOGO: Record<Cms, typeof JoomlaIcon> = {
  joomla: JoomlaIcon,
  wordpress: WordpressIcon,
  emdash: EmdashIcon
}

/** The order of the preview dialog's Create with buttons (`CREATE_WITH` in the customer plugin). */
const DIALOG_ORDER: Cms[] = ['wordpress', 'joomla', 'emdash']

/**
 * Only what customers really see, read only, on a sunk panel with no input chrome so it never reads
 * as part of the form: the Design inspiration grid card (picture, name, category, CMS logos), then a
 * summary of the preview dialog (Create with, the page tabs, Light/Dark). The blurb, the provider
 * and nav/hero are filter or agent data customers never read, so they stay in Edit listing only
 * (Akemi, 10/10/2026). Sticky within the page's own scroll area while the form beside it scrolls.
 */
function CardPreview({ m, view }: { m: DemoCardModel; view: ViewShot }) {
  // The grid's rule (`cardPoster`): the home layout's desktop shot when there is one, else the
  // card's picture, which `DesignInspirationBody` already hands in as the home page's own shot.
  const home = m.card.layouts.find((l) => l.key === 'home')
  const posterFile = home?.shots?.desktop || m.card.image
  const poster = shotSrc(m.template, posterFile, 720)
  const t = useT()
  const cmsNames = m.platforms.map((c) => CMS_LABEL[c])
  return (
    <aside
      aria-label={t('cms-demos.card.preview')}
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/60 p-3 lg:sticky lg:top-4"
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-semibold text-sm">
          <Eye className="size-3.5 text-muted-foreground" />
          {t('cms-demos.card.preview')}
        </span>
        <span className="text-muted-foreground text-xs">{t('cms-demos.card.previewNote')}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        {poster ? (
          <button
            type="button"
            aria-label={t('cms-demos.card.viewPicture')}
            onClick={() => view(fileShot(m.card, posterFile))}
            className="block aspect-[16/10] w-full cursor-zoom-in bg-muted outline-none focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1"
          >
            <img src={poster} alt="" className="size-full object-cover object-top" />
          </button>
        ) : (
          <div className="aspect-[16/10] bg-muted" />
        )}
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-semibold text-sm leading-none">{m.name}</span>
            <span
              className={cn(
                'truncate text-xs',
                m.card.category ? 'text-muted-foreground' : 'text-destructive'
              )}
            >
              {m.card.category || t('cms-demos.card.noCategory')}
            </span>
          </div>
          {m.platforms.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1" title={cmsNames.join(', ')}>
              {m.platforms.map((c) => {
                const Logo = LOGO[c]
                return <Logo key={c} className="size-3.5" aria-hidden />
              })}
            </span>
          ) : null}
        </div>
      </div>
      <DialogSummary m={m} />
    </aside>
  )
}

/** How many page chips the summary shows before folding the rest into "+N more". */
const PAGE_CHIPS_SHOWN = 8

/** One label/value row of the dialog summary: a fixed muted label column, the value beside it. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-muted-foreground leading-5">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1.5">{children}</dd>
    </>
  )
}

/**
 * The preview dialog in three aligned rows: Create with (the dialog's own button order, WordPress
 * first, only the CMSes offered), the page tabs as small chips, and the theme toggle it offers.
 */
function DialogSummary({ m }: { m: DemoCardModel }) {
  const createWith = DIALOG_ORDER.filter((c) => m.platforms.includes(c))
  const pages = m.card.layouts
  const shownPages = pages.slice(0, pages.length > PAGE_CHIPS_SHOWN ? PAGE_CHIPS_SHOWN - 1 : PAGE_CHIPS_SHOWN)
  const hiddenPages = pages.length - shownPages.length
  const t = useT()
  return (
    <div className="flex flex-col gap-2 border-border border-t pt-2.5">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {t('cms-demos.card.inDialog')}
      </span>
      <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
        <SummaryRow label={t('cms-demos.card.createWith')}>
          {createWith.length > 0 ? (
            <ul aria-label={t('cms-demos.card.createWith')} className="flex flex-col gap-1">
              {createWith.map((c) => {
                const Logo = LOGO[c]
                return (
                  <li key={c} className="flex h-5 items-center gap-1.5 whitespace-nowrap">
                    <Logo className="size-3.5 shrink-0" aria-hidden />
                    {CMS_LABEL[c]}
                  </li>
                )
              })}
            </ul>
          ) : (
            <span className="text-destructive leading-5">{t('cms-demos.card.noPlatform')}</span>
          )}
        </SummaryRow>
        <SummaryRow label={t('cms-demos.card.pages')}>
          {pages.length > 0 ? (
            <>
              <span className="leading-5">{t('cms-demos.card.pageCount', { count: pages.length })}</span>
              <ol aria-label={t('cms-demos.card.pageTabs')} className="flex flex-wrap gap-1">
                {shownPages.map((l) => (
                  <li
                    key={l.key}
                    className="inline-flex h-5 max-w-full items-center rounded-md border border-border bg-card px-1.5 text-card-foreground text-xs"
                  >
                    <span className="truncate">{l.label || l.key}</span>
                  </li>
                ))}
                {hiddenPages > 0 ? (
                  <li className="inline-flex h-5 items-center px-1 text-muted-foreground text-xs">
                    {t('cms-demos.card.more', { count: hiddenPages })}
                  </li>
                ) : null}
              </ol>
            </>
          ) : (
            <span className="text-destructive leading-5">{t('cms-demos.card.noPages')}</span>
          )}
        </SummaryRow>
        <SummaryRow label={t('cms-demos.card.theme')}>
          <span className="flex h-5 items-center gap-1.5 whitespace-nowrap">
            <Sun className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {m.card.dark ? <Moon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
            {m.card.dark
              ? m.card.defaultTheme === 'dark'
                ? t('cms-demos.card.lightDarkOpensDark')
                : t('cms-demos.card.lightDark')
              : t('cms-demos.card.lightOnly')}
          </span>
        </SummaryRow>
      </dl>
    </div>
  )
}

/** A quiet input that only shows its border on hover and focus, as the old table's did. */
const QUIET_INPUT =
  'border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent'

/**
 * The pages the preview dialog lists, as the last group of the Edit card column: one compact row
 * per page. No shot buttons on the title row (Akemi, 10/10/2026): Create listing / Regenerate listing
 * shoot every page off the demo, and a single page's own pictures come from that page's picture
 * chooser (Take from demo, or Upload a picture). A page added by hand is shot as soon as its path
 * is committed. Each row moves up or down and can be removed.
 */
function Pages({ m, view }: { m: DemoCardModel; view: ViewShot }) {
  const list = useRef<HTMLOListElement>(null)
  // A moved row keeps the keyboard where it was: the same arrow on the same page, or the other
  // arrow once the page reached an end and that one is off. Done after the moved list is drawn
  // (moving a row's node drops the focus it held).
  const refocus = useRef<{ key: string; delta: -1 | 1 } | null>(null)
  useLayoutEffect(() => {
    const want = refocus.current
    if (!want) return
    refocus.current = null
    const row = list.current?.querySelector(`[data-page-row="${CSS.escape(want.key)}"]`)
    const same = row?.querySelector<HTMLButtonElement>(`[data-move="${String(want.delta)}"]`)
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${String(-want.delta)}"]`)
    ;(same && !same.disabled ? same : other)?.focus()
  })
  const t = useT()
  const move = (i: number, delta: -1 | 1, key: string) => {
    refocus.current = { key, delta }
    m.movePage(i, delta)
  }
  return (
    <section aria-labelledby="demo-card-pages" className="flex flex-col gap-2">
      <GroupTitle
        id="demo-card-pages"
        title={t('cms-demos.card.pagesTitle', { count: String(m.card.layouts.length) })}
        hint={t('cms-demos.card.pagesHint')}
      />
      <ol ref={list} className="flex flex-col gap-1">
        {m.card.layouts.map((l, i) => (
          <PageRow key={l.key} m={m} l={l} i={i} view={view} move={move} />
        ))}
      </ol>
      <div>
        <Button size="xs" variant="ghost" disabled={!m.writable} onClick={m.addPage}>
          <Plus />
          {t('cms-demos.card.addLayout')}
        </Button>
      </div>
    </section>
  )
}

/** The small icon buttons of a page row (move up, move down, remove). */
const ROW_ICON = 'size-[1.125rem] text-muted-foreground hover:text-foreground disabled:opacity-30'

function PageRow({
  m,
  l,
  i,
  view,
  move
}: {
  m: DemoCardModel
  l: Layout
  i: number
  view: ViewShot
  move: (i: number, delta: -1 | 1, key: string) => void
}) {
  const t = useT()
  const pick = (shape: 'desktop' | 'mobile') => (file: string) =>
    m.layoutAt(i, { shots: { ...l.shots, [shape]: file === '' ? undefined : file } })
  // The name a person reads this page by, in labels and questions: its label, else its path.
  const name = l.label.trim() || l.path.trim() || t('cms-demos.card.newPage')
  const last = m.card.layouts.length - 1
  const problem = m.rowProblems[i] ?? null
  const shooting = m.pageShoot[l.key]
  const taking = shooting?.busy === true
  // 🔒 THE HOME PAGE ASKS TWICE: the card's picture follows it (`homeShot`). First press arms,
  // the second removes; leaving the button disarms. No modal, the Unpublish pattern.
  const [armed, setArmed] = useState(false)
  const home = isHome(l)
  const pathProblem = pathProblems(m.card.layouts)[i] ?? null
  const takeBlocked = !m.hasDemo ? t('cms-demos.card.noDemo') : pathProblem
  const picker = (shape: 'desktop' | 'mobile') => ({
    label: t(shape === 'desktop' ? 'cms-demos.card.desktopPicture' : 'cms-demos.card.mobilePicture', {
      name
    }),
    value: l.shots?.[shape] ?? '',
    held: m.shots,
    template: m.template,
    shape,
    writable: m.writable,
    onView: () => view(pageShot(l)),
    onPick: pick(shape),
    onUpload: (file: File) => m.uploadShot(i, shape, file),
    onTake: () => m.shootPage(l),
    takeBlocked,
    taking
  })
  return (
    <li
      data-page-row={l.key}
      className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-card p-1"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex w-[1.125rem] shrink-0 flex-col items-center">
          <Button
            size="icon-xs"
            variant="ghost"
            className={ROW_ICON}
            aria-label={t('cms-demos.card.moveUpOf', { name })}
            title={t('cms-demos.card.moveUp')}
            data-move="-1"
            disabled={!m.writable || i === 0}
            onClick={() => move(i, -1, l.key)}
          >
            <ArrowUp className="size-3" />
          </Button>
          <span className="font-medium text-[11px] text-muted-foreground tabular-nums leading-3.5">
            {i + 1}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className={ROW_ICON}
            aria-label={t('cms-demos.card.moveDownOf', { name })}
            title={t('cms-demos.card.moveDown')}
            data-move="1"
            disabled={!m.writable || i === last}
            onClick={() => move(i, 1, l.key)}
          >
            <ArrowDown className="size-3" />
          </Button>
        </div>
        <ShotPicker
          {...picker('desktop')}
          frameClassName="h-[3.75rem] w-24 shrink-0"
          emptyText={t('cms-demos.card.pickShot')}
        />
        <ShotPicker
          {...picker('mobile')}
          frameClassName="h-[3.75rem] w-[1.875rem] shrink-0"
          thumbWidth="original"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Input
            className={cn(QUIET_INPUT, 'h-6 font-medium text-sm md:text-sm')}
            aria-label={t('cms-demos.card.labelFor', { name })}
            placeholder={t('cms-demos.card.labelPlaceholder')}
            aria-invalid={l.label.trim() === '' || undefined}
            disabled={!m.writable}
            value={l.label}
            onChange={(e) => m.layoutAt(i, { label: e.target.value })}
          />
          <Input
            className={cn(
              QUIET_INPUT,
              'h-[1.125rem] font-mono text-[11px] text-muted-foreground md:text-[11px]'
            )}
            aria-label={t('cms-demos.card.pathFor', { name })}
            placeholder={t('cms-demos.card.pathPlaceholder')}
            aria-invalid={pathProblem !== null || undefined}
            autoFocus={m.focusKey === l.key}
            disabled={!m.writable}
            value={l.path}
            onChange={(e) => m.setPath(i, e.target.value)}
            onBlur={() => m.commitPagePath(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
          <div className="flex h-[1.125rem] min-w-0 items-center gap-1 px-1.5 text-[11px] text-muted-foreground">
            <span
              className="truncate font-mono"
              title={l.address ? t('cms-demos.card.answersAt', { address: l.address }) : undefined}
            >
              {l.key}
            </span>
            <span aria-hidden="true">·</span>
            {t('cms-demos.card.count')}
            <Input
              className={cn(
                QUIET_INPUT,
                'h-[1.125rem] w-12 shrink-0 px-1 text-[11px] tabular-nums md:text-[11px]'
              )}
              aria-label={t('cms-demos.card.countFor', { name })}
              placeholder={t('cms-demos.card.notSet')}
              disabled={!m.writable}
              value={l.count === undefined ? '' : String(l.count)}
              onChange={(e) =>
                m.layoutAt(i, { count: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        </div>
        {/* One button that changes, so the keyboard stays on it between the two presses. */}
        <Button
          size={armed ? 'xs' : 'icon-xs'}
          variant={armed ? 'destructive' : 'ghost'}
          className={cn(armed ? 'shrink-0' : ROW_ICON, 'self-start')}
          aria-label={
            armed ? t('cms-demos.card.removeHomeConfirmOf', { name }) : t('cms-demos.card.removeOf', { name })
          }
          title={
            armed
              ? t('cms-demos.card.removeHomeConfirmTitle')
              : home
                ? t('cms-demos.card.removeHomeTitle')
                : t('cms-demos.card.removeTitle')
          }
          disabled={!m.writable}
          onClick={() => {
            if (home && !armed) {
              setArmed(true)
              return
            }
            setArmed(false)
            m.removePage(i)
          }}
          onBlur={() => setArmed(false)}
        >
          {armed ? t('cms-demos.card.removeHome') : <X className="size-3" />}
        </Button>
      </div>
      {problem !== null ? <p className="px-1 text-destructive text-xs">{problem}</p> : null}
      {taking ? (
        <p className="px-1 text-muted-foreground text-xs" role="status">
          {t('cms-demos.card.taking')}
        </p>
      ) : shooting?.error ? (
        <p className="px-1 text-destructive text-xs">{shooting.error}</p>
      ) : null}
    </li>
  )
}

/**
 * Why Save is off and what the last press warned, compact and right under the presses so the reason
 * sits next to the disabled button; right-aligned with them once the row is wide enough.
 */
function Notes({ m }: { m: DemoCardModel }) {
  const t = useT()
  const open = m.checklist.some((c) => !c.ok) || m.otherRules.length > 0
  if (!open && m.warnings.length === 0) return null
  return (
    <div className="flex flex-col gap-1 text-xs" data-card-notes="">
      {open ? (
        <ul
          className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground"
          aria-label={t('cms-demos.card.saveNeeds')}
        >
          {m.checklist.map((c) => {
            const Mark = c.ok ? CircleCheck : Circle
            return (
              <li
                key={c.label}
                className={cn('inline-flex items-center gap-1', c.ok && 'text-foreground')}
                data-card-check={c.ok ? 'done' : 'todo'}
              >
                <Mark
                  aria-hidden
                  className={cn('size-3.5 shrink-0', c.ok && 'text-emerald-700 dark:text-emerald-400')}
                />
                <span className="sr-only">{c.ok ? t('cms-demos.card.done') : t('cms-demos.card.todo')}</span>
                {c.label}
              </li>
            )
          })}
        </ul>
      ) : null}
      {m.otherRules.map((r) => (
        <p key={r} className="text-muted-foreground" data-card-blocker="">
          {r}
        </p>
      ))}
      {m.warnings.length > 0 ? (
        <ul
          className="flex flex-col gap-0.5 text-amber-600 dark:text-amber-400"
          aria-label={t('cms-demos.card.warnings')}
        >
          {m.warnings.map((w) => (
            <li key={w} data-card-warning="">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
