/**
 * "Open preview": LOOK first, READ second (Lee, 05/09 12:05); one device frame, not a scroll of
 * pages (Lee, 05/09 23:30 — spec §4b-bis); two axes (Lee, 06/09 12:30 — spec §4h).
 *
 * The question a customer has when they open this is "what does MY site look like in this
 * inspiration". The answer is drawn the way Lovable's template preview draws an app: the page is
 * rendered at a FIXED design viewport — Desktop 1280×800, Tablet 820×1180, Phone 390×844 — and the
 * frame is scaled to fit the dialog. Never at the dialog's own width: a system's tokens are a desktop
 * scale, and a page drawn at 1100px with an 88px headline was the bug this replaced. The customer
 * scrolls inside the frame; `sandbox=""` stays, so nothing in the page can script or reach the host.
 *
 * ACROSS: the kinds of page the customer can look at — the site's real pages on the inspiration's
 * fixture, then the inspiration's six sample products (Landing · Form · Newsletter · Email · Poster ·
 * Deck) wearing the site's words. One row, no second row, no Guideline. DOWN, left of the frame: the
 * content versions of the kind in view — Your words (the site's own, cut to fit), Default (the
 * author's), then whatever the agent or the model wrote — and a "More version" tile that calls the
 * lane's model right there (the host does it; nothing goes through the chat). The version chosen is
 * remembered per chip. Reading ABOUT the inspiration is the seventh product, Typography — the specimen,
 * colour roles, spacing and DESIGN.md in the inspiration's own tokens, a chip like the six.
 */
import {
  type JSX,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { Button, cn, Dialog, DialogContent, PreviewPager, Textarea, TracyMark } from '@tracy/ui'
// One module per mark, not the `@tracy/ui/icons` barrel: esbuild keeps every module of a package
// that does not declare `sideEffects`, and the barrel reaches 450 marks (11 MB of paths).
import { EmdashIcon as Emdash } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon as Joomla } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon as Wordpress } from '@tracy/ui/icons/platforms/wordpress'
import { Monitor, Moon, Pencil, Smartphone, Sparkles, Sun, Tablet, X } from 'lucide-react'

import {
  type ArtifactType,
  choose,
  type Copy,
  type CopyVersion,
  createVersion,
  deleteVersion,
  type Inspiration,
  fetchArtifactSlots,
  fetchCopy,
  fetchJob,
  fetchSystemFile,
  selectVersion,
  type SitePreview
} from './api'
import { currentSiteKey } from './dsh-url'
// The anchored popover of `@tracy/core`, not `@tracy/ui`'s: base UI's `render={<Button/>}` hands a `ref`
// React 18 drops, and the panel never positions on a lane (test/anchored-menus.test.mjs).
import { Popover as AnchoredPopover } from '@tracy/core/site-tabs'

import { uiSwitches } from '@tracy/core/ui-switches'
import { askAgent } from './composer'
import { CHAT_DS_SWITCH, offersUseThis, recordsPickOnCreate } from './chat-route.mjs'

/** The CMSes a site can be created on from this inspiration; labels are proper nouns, never translated. */
const CREATE_WITH = [
  { id: 'wordpress', label: 'WordPress', Icon: Wordpress },
  { id: 'joomla', label: 'Joomla', Icon: Joomla },
  { id: 'emdash', label: 'EmDash', Icon: Emdash }
] as const
import { loadArtifact } from './artifact-load.mjs'
import { createWith } from './create-with.mjs'
import { applyFill, nudgePaint, type Slot, swapBrand, type Theme, withTheme } from './fixture'
import { planBrandFill, planFill } from './fill.mjs'
import { useFixtureFiles } from './FixtureThumb'
import { TemplateBody } from './TemplateBody'
import { SWITCH_GROUP, SwitchSide } from './view-switch'
import type { Translate } from './strings'
import { categoryLabel } from './groups.mjs'

/**
 * The design viewports. Desktop is the width the 152 systems' tokens are drawn for (their fixtures
 * cap containers at 1023px+ and step down below); Phone is a current iPhone logical size, under the
 * fixtures' shared 639px breakpoint. Heights are what the frame shows before the customer scrolls.
 */
export const DEVICES = {
  desktop: { w: 1280, h: 800 },
  tablet: { w: 820, h: 1180 },
  mobile: { w: 390, h: 844 }
} as const
type Device = keyof typeof DEVICES

/** The six artifact chips, in the order Lee set them (§4h decision 1). */
const ARTIFACT_KINDS: readonly ArtifactType[] = [
  'landing',
  'form',
  'newsletter',
  'email',
  'poster',
  'deck',
  'typography'
]

/** The two versions every chip has without anything written: drawn from the fixture and the site file. */
const BUILTIN = { yours: 'yours', default: 'default' } as const
/** The site before it is read: every role empty, so a fill plan carries only the written words. */
const EMPTY_SITE: SitePreview['site'] = {
  name: null,
  url: '',
  nav: [],
  eyebrow: null,
  headline: null,
  sub: null,
  cta: null,
  cta2: null,
  image: null
}

type SitePage = SitePreview['pages'][number]

/** One chip across the top: what it is drawn on, and the key the copy file stores its versions under. */
interface Chip {
  key: string
  label: string
  /** The site address, shown beside the label for a real page; a sample product has none. */
  path: string | null
  /** The inspiration's artifact this chip is drawn on; `null` = the fixture with `page`. */
  artifact: ArtifactType | null
  page: SitePage | null
  /** The page kind the default prompt is picked by. */
  kind: string
}

/**
 * The chips of an inspiration: for the customer's own brand, one page cloned from the brand's landing
 * artifact, named `<siteKey>_landing` (§4h decision 8); then the site's real pages; then the six
 * sample products. Before the site is read there are no real pages — the brand landing and the
 * sample products stay, drawn on the author's words (06/09: a lane without `design-preview.json`
 * opened the dialog on a bare frame, no chips, no versions — the customer thought the feature was gone).
 */
function chipsOf(inspiration: Inspiration, site: SitePreview | null, t: Translate): Chip[] {
  const out: Chip[] = []
  if (inspiration.id.startsWith('brand:')) {
    // Before the site is read, the address still names the site — the key must match what the host
    // stores versions under once the file exists, or More version would land in a chip that vanishes.
    const key = `${site?.siteKey || hostOf(site?.site.url) || currentSiteKey() || 'site'}_landing`
    out.push({ key, label: key, path: null, artifact: 'landing', page: null, kind: 'landing' })
  }
  for (const p of site?.pages ?? []) {
    out.push({ key: p.path, label: p.label, path: p.path, artifact: null, page: p, kind: p.type })
  }
  for (const k of ARTIFACT_KINDS) {
    out.push({ key: k, label: t(`kind.${k}`), path: null, artifact: k, page: null, kind: k })
  }
  return out
}

function hostOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}

/** The inspiration's artifact and its slot map, fetched when a chip of that kind is in view. */
function useArtifact(id: string, type: ArtifactType | null): { html: string; slots: Slot[] } | null {
  const [state, setState] = useState<{ key: string; html: string; slots: Slot[] } | null>(null)
  useEffect(() => {
    if (type === null) return
    let live = true
    // Page and slot map are read independently: only the page failing means there is no page.
    loadArtifact(
      () => fetchSystemFile(id, `system/artifacts/${type}.html`),
      () => fetchArtifactSlots(id, type)
    ).then(({ html, slots }) => {
      if (live) setState({ key: `${id}/${type}`, html, slots: slots as Slot[] })
    })
    return () => {
      live = false
    }
  }, [id, type])
  return state && type !== null && state.key === `${id}/${type}` ? state : null
}

/**
 * The copy file of an inspiration, read on open, and every change applied to it in place. `wanted`
 * false (a template card) reads nothing: only a design system or a brand has a copy file.
 */
function useCopyFile(id: string, wanted = true): [Copy | null, (fn: (c: Copy) => Copy) => void] {
  const [state, setState] = useState<{ id: string; copy: Copy } | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    fetchCopy(id).then((c) => {
      if (live && c) setState({ id, copy: c })
    })
    return () => {
      live = false
    }
  }, [id, wanted])
  const update = useCallback(
    (fn: (c: Copy) => Copy) => setState((s) => (s && s.id === id ? { id, copy: fn(s.copy) } : s)),
    [id]
  )
  return [state && state.id === id ? state.copy : null, update]
}

/**
 * Scale the design viewport to the room the dialog gives it: never above 1, never wider than the
 * column, and the phone never taller than what fits without the dialog scrolling. Lovable's numbers
 * on a 1600px window are .72 for desktop and .81 for the phone; these land in the same range.
 */
function fit(device: Device, room: { w: number; h: number }): number {
  // Desktop fits the column: the stage takes the frame's height, so height cannot be an input here
  // without feeding the result back into itself. Tablet and phone stages have a fixed height, so they fit both.
  const d = DEVICES[device]
  if (device === 'desktop') return Math.min(1, (room.w - 32) / d.w)
  return Math.min(1, (room.w - 32) / d.w, (room.h - 24) / d.h)
}

/**
 * One device frame: a chrome the customer recognises (browser bar or phone bezel), an iframe drawn
 * at the design width, a wrapper that scales it. The iframe scrolls; pointer events reach it. Keyed
 * by the caller so a new document is a new frame, not a mutation of the old one.
 */
function DeviceFrame({
  device,
  doc,
  title,
  room
}: {
  device: Device
  doc: string
  title: string
  room: { w: number; h: number }
}): JSX.Element {
  const d = DEVICES[device]
  const s = fit(device, room)
  const phone = device !== 'desktop'
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-background shadow-lg',
        phone ? 'rounded-[40px] border-[10px] border-neutral-900' : 'rounded-xl border border-border'
      )}
      style={{
        width: Math.round(d.w * s) + (phone ? 20 : 2),
        height: Math.round(d.h * s) + (phone ? 20 : 30)
      }}
    >
      {phone ? null : (
        <div className="flex h-7 items-center gap-1.5 border-border border-b bg-muted/60 px-3">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="ml-3 h-3.5 flex-1 rounded-full bg-border/60" />
        </div>
      )}
      <div className="origin-top-left" style={{ width: d.w, height: d.h, transform: `scale(${s})` }}>
        <iframe
          title={title}
          srcDoc={doc}
          sandbox=""
          onLoad={(e) => nudgePaint(e.currentTarget)}
          className="block border-0"
          style={{ width: d.w, height: d.h }}
        />
      </div>
    </div>
  )
}

/** How often the dialog asks whether a take has landed, and for how long. */
const JOB_POLL_MS = 2000
const JOB_WAIT_MS = 5 * 60 * 1000

/**
 * The strip's thumbnails follow the device in view (Lee, 06/09 18:14): the desktop page fills the
 * strip's width, a tablet or phone stands upright in a bezel like the frame — the same document, the
 * same viewport, so what the tile shows is what the frame shows.
 */
const STRIP_W = 140
const THUMB_H = 88
function thumbShape(device: Device): { w: number; h: number; scale: number; phone: boolean } {
  const d = DEVICES[device]
  const w = device === 'desktop' ? STRIP_W : device === 'tablet' ? 104 : 76
  const scale = w / d.w
  // Portrait pages are tall: cap the tile and let the top of the page show, as the frame does.
  const h = Math.min(Math.round(d.h * scale), device === 'desktop' ? THUMB_H : 150)
  return { w, h, scale, phone: device !== 'desktop' }
}

/**
 * One tile of the version strip: the page at desktop width shrunk to the tile; on hover the page dims
 * and the version's name shows in the middle (Lee, 06/09 12:50) — the strip is looked at, not read.
 */
function Thumb({
  doc,
  label,
  selected,
  onClick,
  onRemove,
  removeLabel,
  removeAsk,
  onRemoveLeave,
  removeBusy = false,
  id,
  device
}: {
  doc: string
  label: string
  selected: boolean
  onClick: () => void
  /** One press of the remove control: the dialog decides whether it asks or removes. */
  onRemove?: () => void
  removeLabel?: string
  /** Set once the control was pressed: the question it now shows, and what the next press does. */
  removeAsk?: { text: string; title: string } | null
  /** Focus left the control: a question nobody answered is withdrawn. */
  onRemoveLeave?: () => void
  /** A removal of this inspiration is running; the control waits for it. */
  removeBusy?: boolean
  id: string
  device: Device
}): JSX.Element {
  const d = DEVICES[device]
  const shape = thumbShape(device)
  return (
    <div className="group relative" data-version={id} data-selected={selected ? 'true' : undefined}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={label}
        title={label}
        className={cn(
          'mx-auto block overflow-hidden bg-muted',
          shape.phone ? 'rounded-[14px] border-[3px] border-neutral-900' : 'rounded-lg',
          !shape.phone && (selected ? 'border border-ring' : 'border border-border hover:border-ring'),
          shape.phone && selected && 'ring-1 ring-ring ring-offset-2 ring-offset-background'
        )}
        style={{ width: shape.w + (shape.phone ? 6 : 2) }}
      >
        <div className="relative overflow-hidden" style={{ width: shape.w, height: shape.h }}>
          <div
            className="origin-top-left transition group-hover:opacity-30"
            style={{ width: d.w, height: d.h, transform: `scale(${shape.scale})` }}
          >
            <iframe
              title={label}
              srcDoc={doc}
              sandbox=""
              onLoad={(e) => nudgePaint(e.currentTarget)}
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none block border-0"
              style={{ width: d.w, height: d.h }}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center opacity-0 transition group-hover:opacity-100">
            <span className="font-medium text-[12px] leading-tight">{label}</span>
          </div>
        </div>
      </button>
      {/* Always drawn, never `hidden` until hover: a keyboard and a touch screen have no hover, and
          the control was out of their reach (#800). Two presses, no modal — the first asks and
          names the version, the second removes it; leaving the control withdraws the question. */}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeAsk ? removeAsk.title : removeLabel}
          title={removeAsk ? removeAsk.title : removeLabel}
          data-armed={removeAsk ? 'true' : undefined}
          disabled={removeBusy}
          onClick={onRemove}
          onBlur={onRemoveLeave}
          className={cn(
            'absolute top-1 right-1 grid h-5 place-items-center rounded-full border shadow-sm disabled:opacity-50',
            removeAsk
              ? 'max-w-[calc(100%-0.5rem)] border-destructive bg-background px-2 font-medium text-[11px] text-destructive'
              : 'w-5 border-border bg-background/95 text-muted-foreground hover:text-foreground'
          )}
        >
          {removeAsk ? <span className="truncate">{removeAsk.text}</span> : <X size={10} />}
        </button>
      ) : null}
    </div>
  )
}

/** The one-box prompt behind the pencil (§4h decision 6): prefilled, editable, sent as this take's ask. */
function PromptBox({
  value,
  onChange,
  onGo,
  t
}: {
  value: string
  onChange: (v: string) => void
  onGo: () => void
  t: Translate
}): JSX.Element {
  return (
    // The core Popover closes on any click inside its panel (it is built for menus); a form must not.
    // Clicks stop here — except the send button's, which is allowed through so the panel closes.
    <div
      className="space-y-3 p-2"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('[data-close]')) e.stopPropagation()
      }}
    >
      <div className="font-medium text-sm">{t('prompt.title')}</div>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">{t('prompt.label')}</span>
        <Textarea
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs leading-snug"
        />
      </label>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{t('prompt.note')}</span>
        <Button size="sm" className="gap-1.5" data-close="true" disabled={value.trim() === ''} onClick={onGo}>
          <Sparkles size={13} />
          {t('prompt.go')}
        </Button>
      </div>
    </div>
  )
}

/** What the public page hands the dialog instead of a seat. */
export interface PublicMode {
  build: (platform: string, inspiration: Inspiration) => void
}

export function PreviewDialog({
  list,
  index,
  site,
  onClose,
  onStep,
  openBuild = null,
  publicMode = null,
  t
}: {
  /** The list the arrows walk: the visible grid, or the three picks. */
  list: Inspiration[]
  index: number
  site: SitePreview | null
  onClose: () => void
  onStep: (dir: -1 | 1) => void
  /**
   * Opens the Build tab of that platform's own Build plugin (todo-build-with-experience.md §C3);
   * null where that plugin is not loaded, and the buttons fall back to asking the agent in the chat.
   */
  openBuild?: ((platform: string, inspiration: Inspiration, message: string) => void) | null
  /**
   * The public page (ADR 0011): no seat, no site file, no copy door. The write buttons go — Use this
   * inspiration, More version — and Create with hands the choice to `build`, which sends the visitor
   * into Tracy with the platform and the inspiration.
   */
  publicMode?: PublicMode | null
  t: Translate
}): JSX.Element {
  const inspiration = list[index]!
  // "Use this inspiration" is the chat route to a design system: the operator's switch decides.
  const ui = uiSwitches()
  const chatRoute = useSyncExternalStore(ui.subscribe, () => ui.isShown(CHAT_DS_SWITCH))
  const [device, setDevice] = useState<Device>('desktop')
  // The visitor's own press, if any. Until then the side is the template's own default (a dark-first
  // demo such as JA Boxing opens dark), so opening the popup never flips a template off its look.
  const [chosenTheme, setTheme] = useState<Theme | null>(null)
  const theme: Theme = chosenTheme ?? list[index]?.template?.defaultTheme ?? 'light'
  // 🔒 A TEMPLATE HAS NO SYSTEM FILES (#9, 04/10 dev E2E J16.1-J12). A quickstart card is drawn from its
  // live demo (`TemplateBody`); its id names no design system, so its fixture, slot maps, sample
  // artifacts and copy file do not exist, and asking for them under its id was five 404s per open
  // (the library's 404 carries no CORS header, so Chrome reported them as CORS failures).
  const isSystem = !inspiration.template
  const fixture = useFixtureFiles(inspiration.id, isSystem)
  const [copy, updateCopy] = useCopyFile(inspiration.id, isSystem)

  // ACROSS: the chips. Without a site read: the brand landing and the sample products, no real pages.
  const chips = useMemo(() => chipsOf(inspiration, site, t), [inspiration, site, t])
  const [chipKey, setChipKey] = useState<string | null>(null)
  const chip = chips.find((c) => c.key === chipKey) ?? chips[0] ?? null
  const artifact = useArtifact(inspiration.id, isSystem ? (chip?.artifact ?? null) : null)

  // DOWN: the versions of the chip in view. The choice is the file's, with the customer's clicks on
  // top until the file says the same; `More version` in flight and its failure are per chip too.
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [prompts, setPrompts] = useState<Record<string, string>>({})

  // Removing a version (#800). The question belongs to ONE version of one chip of one inspiration,
  // so anything else on screen is not an answer to it. One removal per inspiration at a time: the
  // set is the lock a second press meets before React has redrawn the control as disabled.
  const [armed, setArmed] = useState<{ id: string; chip: string; vid: string; title: string } | null>(null)
  const [removing, setRemoving] = useState<Record<string, string>>({})
  const removingIds = useRef(new Set<string>())
  const [removeFailed, setRemoveFailed] = useState<Record<string, string>>({})
  /** The inspiration on screen, null once the dialog is gone: a late answer checks it before it writes. */
  const shownId = useRef<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ w: 1000, h: 720 })

  useEffect(() => {
    setNotice(null)
    setPicked({})
    setFailed({})
    setPrompts({})
    setArmed(null)
    setRemoveFailed({})
    shownId.current = inspiration.id
    return () => {
      shownId.current = null
    }
  }, [inspiration.id])
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = (): void => setRoom({ w: el.clientWidth, h: Math.max(420, el.clientHeight) })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const chipCopy = chip && copy ? copy.pages[chip.key] : undefined
  const stored: CopyVersion[] = chipCopy?.versions ?? []
  // "Your words" is the site's words on the page: without the site file it would be Default twice over.
  const builtins: readonly [string, string][] = site
    ? [
        [BUILTIN.yours, t('version.yours')],
        [BUILTIN.default, t('version.default')]
      ]
    : [[BUILTIN.default, t('version.default')]]
  const fallback = site ? BUILTIN.yours : BUILTIN.default
  const selectedId = chip ? (picked[chip.key] ?? chipCopy?.selected ?? fallback) : fallback
  const prompt = chip
    ? (prompts[chip.key] ?? chipCopy?.nextPrompt ?? copy?.defaultPrompts[chip.kind] ?? '')
    : ''

  // What the chip is drawn on: the artifact and its slots, or the fixture and its slots with the page.
  const base = chip
    ? chip.artifact
      ? artifact && artifact.html !== ''
        ? { html: artifact.html, slots: artifact.slots }
        : null
      : fixture
    : fixture
  const artifactMissing = chip?.artifact ? artifact !== null && artifact.html === '' : false

  /** The document of one version: the base wearing the site's words, the author's, or a written take. */
  const docOf = useCallback(
    (versionId: string): string | null => {
      if (!base) return null
      let html = base.html
      if (versionId !== BUILTIN.default) {
        const v = stored.find((x) => x.id === versionId)
        // No site file yet: nothing of the site's to wear, so only what the model wrote lands.
        const source = {
          site: site?.site ?? EMPTY_SITE,
          pages: site?.pages ?? [],
          page: chip?.page ?? null,
          copy: v?.slots ?? null
        }
        // A sample product is one skeleton per inspiration; only the author's words tell a Deck from a
        // Form (measured 06/09). So "Your words" there swaps the brand, buttons and nav — not the
        // headline — while a real page takes the site's words by role.
        html = chip?.artifact
          ? swapBrand(
              applyFill(base.html, planBrandFill(base.slots, source)),
              inspiration.name,
              site?.site.name ?? ''
            )
          : applyFill(base.html, planFill(base.slots, source))
      }
      // Dark on the author's fixture is one override block; `dark.json` says whether it is enough there.
      return withTheme(html, inspiration.dark || chip?.artifact ? theme : 'light')
    },
    [base, site, stored, chip, inspiration.dark, theme]
  )

  const pick = (vid: string): void => {
    if (!chip) return
    setPicked((p) => ({ ...p, [chip.key]: vid }))
    void selectVersion(inspiration.id, chip.key, vid)
  }

  /** More version (§4h decision 3): the tile turns into Tracy writing; the answer is the next tile, selected. */
  const more = (custom: string | null): void => {
    if (!chip || working !== null) return
    const key = chip.key
    const id = inspiration.id
    setWorking(key)
    setFailed((f) => ({ ...f, [key]: '' }))
    const settle = (
      r: { ok: true; version: CopyVersion; nextPrompt: string | null } | { ok: false; message: string }
    ): void => {
      setWorking((w) => (w === key ? null : w))
      if (!r.ok) {
        setFailed((f) => ({ ...f, [key]: r.message }))
        return
      }
      updateCopy((c) => ({
        ...c,
        pages: {
          ...c.pages,
          [key]: {
            versions: [...(c.pages[key]?.versions ?? []).filter((v) => v.id !== r.version.id), r.version],
            selected: r.version.id,
            nextPrompt: r.nextPrompt ?? c.pages[key]?.nextPrompt ?? null
          }
        }
      }))
      setPicked((p) => ({ ...p, [key]: r.version.id }))
      if (r.nextPrompt) setPrompts((p) => ({ ...p, [key]: r.nextPrompt! }))
      else setPrompts(({ [key]: _gone, ...rest }) => rest)
    }
    // The host answers with a job at once and the take lands later: poll until it does.
    void createVersion(id, key, custom).then((r) => {
      if (!r.ok) {
        settle(r)
        return
      }
      const started = Date.now()
      const tick = (): void => {
        void fetchJob(id, r.job).then((j) => {
          if (j.state === 'done') settle({ ok: true, version: j.version, nextPrompt: j.nextPrompt })
          else if (j.state === 'failed') settle({ ok: false, message: j.key ? t(j.key) : j.message })
          else if (Date.now() - started > JOB_WAIT_MS) settle({ ok: false, message: 'timeout' })
          else window.setTimeout(tick, JOB_POLL_MS)
        })
      }
      window.setTimeout(tick, JOB_POLL_MS)
    })
  }

  // The question is remembered with the title it was asked in: a re-read that renames the version
  // is another question, never an answer to the one on screen a moment ago.
  const armedFor = (version: CopyVersion): boolean =>
    armed !== null &&
    armed.id === inspiration.id &&
    armed.chip === chip?.key &&
    armed.vid === version.id &&
    armed.title === version.title

  /** One press of a tile's remove control: ask first, remove on the press that answers (#800). */
  const remove = (version: CopyVersion): void => {
    if (!chip) return
    const id = inspiration.id
    const key = chip.key
    const vid = version.id
    if (removingIds.current.has(id)) return
    if (!armedFor(version)) {
      setArmed({ id, chip: key, vid, title: version.title })
      return
    }
    setArmed(null)
    removingIds.current.add(id)
    setRemoving((r) => ({ ...r, [id]: vid }))
    setRemoveFailed((f) => ({ ...f, [key]: '' }))
    void deleteVersion(id, key, vid).then(async (r) => {
      // Not removed for certain: read the copy again, so the tiles show what the host holds whichever
      // way the request went. The removal itself is never sent twice.
      const held = r.ok ? null : await fetchCopy(id).catch(() => null)
      removingIds.current.delete(id)
      setRemoving(({ [id]: _done, ...rest }) => rest)
      // The dialog closed or stepped to another inspiration meanwhile: this answer is not about what
      // is on screen (`updateCopy` drops it by id as well).
      if (shownId.current !== id) return
      if (r.ok) {
        updateCopy((c) => {
          const page = c.pages[key]
          if (!page) return c
          return {
            ...c,
            pages: {
              ...c.pages,
              [key]: {
                ...page,
                versions: page.versions.filter((v) => v.id !== vid),
                selected: page.selected === vid ? null : page.selected
              }
            }
          }
        })
        setPicked((p) => (p[key] === vid ? { ...p, [key]: fallback } : p))
        return
      }
      if (held) {
        updateCopy(() => held)
        if (!held.pages[key]?.versions.some((v) => v.id === vid))
          setPicked((p) => (p[key] === vid ? { ...p, [key]: fallback } : p))
      }
      setRemoveFailed((f) => ({
        ...f,
        [key]: t(r.refused ? 'version.removeFailed' : 'version.removeUnsure', {
          title: version.title,
          message: r.message
        })
      }))
    })
  }

  const doc = docOf(selectedId)
  // A template's preview is its demo, so only the card's own flag says whether Dark does anything
  // there; the artifact chips of a design system are not in play (Akemi, 30/09).
  const darkAvailable = inspiration.template ? inspiration.dark : inspiration.dark || chip?.artifact !== null
  const frameKey = `${inspiration.id}-${chip?.key ?? 'band'}-${selectedId}-${device}-${theme}`

  // Every device on show as one switch, like Live | Screenshot (Akemi, 29/09). It replaces the one pill
  // that stepped Desktop → Tablet → Mobile (Lee, 06/09): its label changed length on each press, so
  // the controls beside it shifted. A template has a desktop and a phone picture only — its Tablet
  // would show the phone one — so it offers the two it has.
  const DEVICE_ICON: Record<Device, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone }
  const deviceLabel = (d: Device): string =>
    d === 'desktop' ? t('dialog.desktop') : d === 'tablet' ? t('dialog.tablet') : t('dialog.mobile')
  const deviceChoices: Device[] = inspiration.template
    ? ['desktop', 'mobile']
    : (Object.keys(DEVICES) as Device[])
  // Stepping from a design system on Tablet to a template lands on what the template shows for it.
  const shownDevice: Device = deviceChoices.includes(device) ? device : 'mobile'

  // How the page is LOOKED AT — light or dark, which device — sits in the second row with the page
  // chips (and, for a template, Live | Screenshot), not in the header (Akemi, 29/09, option B of
  // three on the bench): the header says WHICH inspiration and what to do with it; the second row
  // says how it is shown. Each choice is its own two-or-three-sided switch (Akemi, 29/09: light and
  // dark split out like the rest), so a press never changes a control's width. Placed by both bodies.
  const shownTheme: Theme = theme === 'dark' && darkAvailable ? 'dark' : 'light'
  /** One side of a switch: filled when chosen, the same as the page chip in view (Akemi, 29/09; `view-switch.tsx`). */
  const side = (
    key: string,
    on: boolean,
    Icon: typeof Monitor,
    label: string,
    props: Record<string, unknown>
  ) => <SwitchSide key={key} on={on} Icon={Icon} label={label} props={props} />
  const switchGroup = SWITCH_GROUP
  // A template whose demo has no dark mode offers no Light/Dark at all: a switch that can only sit
  // on Light is noise (Akemi, 30/09). A design system keeps the disabled Dark and its reason.
  const themeSwitch =
    inspiration.template && !darkAvailable ? null : (
      <span role="group" aria-label={t('dialog.theme')} className={switchGroup}>
        {side('light', shownTheme === 'light', Sun, t('dialog.light'), { onClick: () => setTheme('light') })}
        {side('dark', shownTheme === 'dark', Moon, t('dialog.dark'), {
          onClick: () => setTheme('dark'),
          disabled: !darkAvailable,
          title: darkAvailable ? t('dialog.darkTitle') : t('dialog.darkUnsafe')
        })}
      </span>
    )
  const viewControls = (
    <>
      {themeSwitch}
      <span role="group" aria-label={t('dialog.device')} className={switchGroup}>
        {deviceChoices.map((d) =>
          side(d, shownDevice === d, DEVICE_ICON[d], deviceLabel(d), {
            onClick: () => setDevice(d),
            title: `${deviceLabel(d)} · ${DEVICES[d].w} px`
          })
        )}
      </span>
    </>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      {/* A quickstart is judged on the live site itself, so its dialog takes nearly the whole
          window (review, 21/09: at 1240 px the demo read cramped and wrapped its own menu). A
          design system keeps 1240 px — its fixtures are drawn for that width. */}
      <DialogContent
        closeLabel={t('action.close')}
        className={cn(
          'tracy-design-inspiration flex flex-col gap-0 p-0',
          inspiration.template
            ? 'h-[96vh] max-w-[98vw] sm:max-w-[98vw]'
            : 'h-[92vh] max-w-[min(1240px,96vw)] sm:max-w-[min(1240px,96vw)]'
        )}
      >
        {/* Header: WHICH inspiration, and what to do with it. The pager stands FIRST, so however long
            the name it never moves when the customer steps — Lee's rule of 07/09 (the counter must
            not jump), kept without the fixed 192 px name box that left a gap after a short name
            (Akemi, 29/09). The category lives in the name's tooltip; the right corner offers
            Create with. Light/dark and the device moved to the second row (`viewControls`). */}
        <div className="relative flex flex-wrap items-center gap-3 border-border border-b py-3 pr-13 pl-5">
          <PreviewPager
            position={t('dialog.position', { index: index + 1, total: list.length })}
            prevLabel={t('dialog.prev')}
            nextLabel={t('dialog.next')}
            onStep={onStep}
          />
          <span
            className="min-w-0 truncate font-semibold text-base"
            title={`${inspiration.name} · ${categoryLabel(t, inspiration.category)}`}
          >
            {inspiration.name}
          </span>
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-1.5">
            <span className="mr-1 text-muted-foreground text-xs">{t('dialog.createWith')}</span>
            {CREATE_WITH.map(({ id, label, Icon }) => {
              // A card that names its platforms is buildable only there; a CMS not named greys
              // the button and says why (Lee, 15/09: what the customer sees is what they get).
              // A brand says so in its own words (`create-with.mjs`).
              const state = createWith(inspiration, id)
              return (
                <Button
                  key={id}
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={state.disabled}
                  title={t(state.title, { platform: label, name: inspiration.name })}
                  onClick={() => {
                    // Creating a site from this inspiration is also choosing it: record the choice
                    // (best effort — a site not yet read refuses) while the chat route is on; off,
                    // the host closes that door and nothing would read the record
                    // (`recordsPickOnCreate`). Then the Build tab asks the customer, and nothing
                    // reaches the chat until they press Build there (Lee, 07/09). Without that
                    // plugin, ask the agent in the chat as before.
                    if (publicMode) {
                      publicMode.build(id, inspiration)
                      return
                    }
                    if (recordsPickOnCreate({ chatRoute })) void choose(inspiration.id)
                    if (openBuild) {
                      // The opener owns the whole sequence — a NEW session, the Build tab in it, then
                      // the decision in ITS chat — because the order matters and only the opener can
                      // wait for the session to arrive (Lee, 08/09 01:0x). This dialog's part is to
                      // get out of the way: it is a full-screen sheet, so leaving it up would hide the
                      // very tab that was just opened.
                      openBuild(
                        id,
                        inspiration,
                        t('msg.buildWith', { name: inspiration.name, id: inspiration.id, platform: label })
                      )
                      onClose()
                      return
                    }
                    const told = askAgent(
                      t('msg.createWith', { platform: label, name: inspiration.name, id: inspiration.id })
                    )
                    setNotice(
                      told
                        ? t('dialog.createTold', { platform: label, name: inspiration.name })
                        : t('dialog.createFailed')
                    )
                  }}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Button>
              )
            })}
          </div>
        </div>

        {inspiration.template ? (
          <TemplateBody
            template={inspiration.template}
            name={inspiration.name}
            device={device === 'desktop' ? 'desktop' : 'mobile'}
            theme={shownTheme}
            controls={viewControls}
            t={t as never}
          />
        ) : null}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', inspiration.template && 'hidden')}>
          {/* ACROSS: the kinds of page — the site's real pages, then the inspiration's six sample products. */}
          {/* Always drawn: even with no chip it carries the view controls. */}
          <div className="flex flex-wrap items-center gap-1.5 border-border border-b px-5 py-2 font-mono text-[11px]">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={c.key === chip?.key}
                data-chip={c.key}
                onClick={() => {
                  setChipKey(c.key)
                  setArmed(null)
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
                  c.key === chip?.key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="font-sans">{c.label}</span>
                {c.path ? <span className="opacity-70">{c.path}</span> : null}
              </button>
            ))}
            <span className="ms-auto flex items-center gap-2">{viewControls}</span>
          </div>

          <div className="flex gap-4 bg-muted/40 px-4 py-3">
            {/* DOWN, left of the frame: the content versions of the chip in view, then More version. */}
            {chip ? (
              <div
                className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto pr-1"
                // Upright tiles are tall: the strip scrolls within the frame's height instead of pushing it down.
                style={{ maxHeight: device === 'desktop' ? undefined : 'clamp(420px, 60vh, 700px)' }}
                data-strip={chip.key}
              >
                {builtins.map(([vid, label]) => {
                  const d = docOf(vid)
                  return d === null ? null : (
                    <Thumb
                      key={vid}
                      id={vid}
                      device={device}
                      doc={d}
                      label={label}
                      selected={vid === selectedId}
                      onClick={() => pick(vid)}
                    />
                  )
                })}
                {stored.map((v) => {
                  const d = docOf(v.id)
                  return d === null ? null : (
                    <Thumb
                      key={v.id}
                      id={v.id}
                      device={device}
                      doc={d}
                      label={v.title}
                      selected={v.id === selectedId}
                      onClick={() => pick(v.id)}
                      onRemove={() => remove(v)}
                      removeLabel={t('version.remove', { title: v.title })}
                      removeAsk={
                        armedFor(v)
                          ? {
                              text: t('version.removeConfirm', { title: v.title }),
                              title: t('version.removeConfirmTitle', { title: v.title })
                            }
                          : null
                      }
                      onRemoveLeave={() => setArmed(null)}
                      removeBusy={inspiration.id in removing}
                    />
                  )
                })}
                {removeFailed[chip.key] ? (
                  <p
                    role="alert"
                    data-remove-failed="true"
                    className="rounded-lg border border-destructive/40 bg-background px-2 py-1.5 text-[11px] text-muted-foreground"
                  >
                    {removeFailed[chip.key]}
                  </p>
                ) : null}
                {working === chip.key ? (
                  <div
                    className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[11px] text-muted-foreground"
                    style={{ height: THUMB_H }}
                    data-working="true"
                  >
                    <TracyMark size={22} className="animate-[spin_3s_linear_infinite]" />
                    {t('version.working')}
                  </div>
                ) : failed[chip.key] ? (
                  <div
                    className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-2 text-center text-[11px] text-muted-foreground"
                    style={{ minHeight: THUMB_H }}
                    data-failed="true"
                  >
                    <span className="line-clamp-3">
                      {t('version.failed', { message: failed[chip.key]! })}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => more(null)}
                    >
                      {t('version.retry')}
                    </Button>
                  </div>
                ) : base && !publicMode ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => more(null)}
                      data-more="true"
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-border border-dashed bg-background text-[11px] text-muted-foreground hover:border-ring hover:text-foreground"
                      style={{ height: THUMB_H }}
                    >
                      <Sparkles size={16} className="text-primary" />
                      {t('version.more')}
                    </button>
                    <AnchoredPopover
                      align="start"
                      scopeClass="tracy-design-inspiration"
                      className="w-80"
                      trigger={(props) => (
                        <Button
                          {...props}
                          size="icon"
                          variant="outline"
                          className="absolute top-1 right-1 size-6 rounded-full bg-background/95"
                          aria-label={t('prompt.open')}
                          title={t('prompt.open')}
                        >
                          <Pencil size={11} />
                        </Button>
                      )}
                    >
                      <PromptBox
                        value={prompt}
                        onChange={(v) => setPrompts((p) => ({ ...p, [chip.key]: v }))}
                        onGo={() => more(prompt.trim())}
                        t={t}
                      />
                    </AnchoredPopover>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div
              ref={stageRef}
              className="relative flex min-h-[420px] min-w-0 flex-1 items-start justify-center overflow-hidden"
              style={{ height: device === 'desktop' ? undefined : 'clamp(420px, 60vh, 700px)' }}
            >
              {doc !== null ? (
                <DeviceFrame
                  key={frameKey}
                  device={device}
                  doc={doc}
                  title={`${inspiration.name} · ${chip?.label ?? ''}`}
                  room={room}
                />
              ) : artifactMissing ? (
                <p className="self-center text-muted-foreground text-sm">{t('kind.missing')}</p>
              ) : (
                <p className="self-center text-muted-foreground text-sm">{t('state.reading')}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-border border-t px-5 py-3">
          {notice ? <span className="text-foreground text-xs">{notice}</span> : null}
          {!offersUseThis({
            publicMode: Boolean(publicMode),
            template: Boolean(inspiration.template),
            chatRoute
          }) ? null : (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                void choose(inspiration.id).then((ok) => {
                  // The choice is recorded for the agent's next turn; when a chat is open the dialog also
                  // tells the agent right away, so step 3 starts without the customer retyping it.
                  const told = ok && askAgent(t('msg.use', { name: inspiration.name, id: inspiration.id }))
                  setNotice(
                    ok
                      ? told
                        ? t('dialog.chosenTold', { name: inspiration.name })
                        : t('dialog.chosen', { name: inspiration.name })
                      : t('dialog.chooseFailed')
                  )
                })
              }}
            >
              {t('dialog.use')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
