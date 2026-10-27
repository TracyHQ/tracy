/**
 * THROWAWAY MOCK — "Build with WordPress" from the preview, done the way Claude Design does it.
 *
 * THE QUESTION IT EXISTS TO ANSWER: when the customer presses Create with WordPress on a design
 * inspiration, what do they see in the side card and in the chat, in what order, so that the build
 * feels like an agent laying out THEIR page rather than a script running? Three things Lee asked for
 * (07/09, after the Claude Design screenshots): the questions live in a side-card tab, not in the
 * chat; while the engine runs, the tab shows the inspiration's own layout as a pulsing skeleton that
 * fills in stage by stage; when it is done, a picture of the page comes back to the chat.
 *
 * WHAT DECIDES IT: the form is the Fork form's middle (one line + attach, language) plus what the
 * theme needs (pages, tone, contact) — every box optional, "leave it empty and Tracy decides". The
 * skeleton is not a generic spinner: it is `components.html` of the chosen inspiration with each
 * text slot replaced by a grey bar the width of its words, so the customer watches the exact page
 * they will get being written. The chat gets exactly two cards per build: a running card (stages)
 * and, once the turn ends, a picture card — dsh folds settled tool calls, so the picture lives in
 * the turn tail like the picks row does (measured on lucaswp 07/09 16:08).
 *
 * WHAT IS NOT BEING ASKED HERE: the words of the questions (Lee: tune later); the element picker
 * ("comment on this and send to Tracy") — needs a slot map the sections do not have yet; Joomla and
 * EmDash differences (same screens, other zip).
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real screens are the `tracy:build` tab and
 * two chat cards in `tracy-design-inspiration`, MODE B, plain CSS. Whatever wins here is REWRITTEN
 * there, not copied. `DESIGN.md` §0.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Input,
  Label,
  Separator,
  Skeleton,
  Switch,
  Textarea
} from '@tracy/ui'
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Wrench
} from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useMemo, useState } from 'react'

import { applyFill, type Slot } from '../../../../design/tracy-design-inspiration/src/client/fixture'
import { useFixtureFiles } from '../../../../design/tracy-design-inspiration/src/client/FixtureThumb'
import { planFill } from '../../../../design/tracy-design-inspiration/src/client/fill.mjs'
import { installDoors, SITE } from '../pages/in-dsh/design-inspirations.doors'

const meta: Meta = {
  title: 'Mockups/Build with',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ─── The five stages and what the customer reads for each ─────────────────────────────────────

const STAGES = ['check', 'theme', 'style', 'copy', 'seed'] as const
type StageName = (typeof STAGES)[number]
type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting'
type Stage = { name: StageName; status: StageStatus; detail?: string }

/** Customer words per stage — the card never shows the engine's names. */
const STAGE_WORDS: Record<StageName, [string, string]> = {
  check: ['Checking the site', 'Site checked'],
  theme: ['Installing the theme', 'Theme installed'],
  style: ['Applying the look', 'Look applied'],
  copy: ['Writing your words', 'Words written'],
  seed: ['Laying out the pages', 'Pages laid out']
}

/** Stages up to `running` done, that one running, the rest pending; optional overrides. */
function stagesAt(running: number, patch: Partial<Record<StageName, Stage>> = {}): Stage[] {
  return STAGES.map((name, i) => {
    const base: Stage = { name, status: i < running ? 'done' : i === running ? 'running' : 'pending' }
    return patch[name] ?? base
  })
}
const ALL_DONE = stagesAt(STAGES.length)

// ─── Frame: a lane, side card left, chat right ─────────────────────────────────────────────────

function Lane({
  tab,
  tabTitle,
  chat,
  note
}: {
  tab: ReactNode
  tabTitle: string
  chat: ReactNode
  note: string
}): JSX.Element {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <p className="border-border border-b px-4 py-2 text-muted-foreground text-xs">{note}</p>
      {/* Chat on the left, the side card on the right — the way a lane lays them out (Lee, 07/09). */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_440px]">
        <main className="flex min-h-0 flex-col border-border border-r">
          <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
            {chat}
          </div>
          <div className="mx-auto w-full max-w-[600px] px-4 pb-4">
            <div className="rounded-lg border border-border px-3 py-2 text-muted-foreground text-sm">
              Message or run a task…
            </div>
          </div>
        </main>
        <aside className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-border border-b px-3 py-2 text-sm">
            <Badge variant="secondary" className="font-normal">
              Brand
            </Badge>
            <Badge variant="secondary" className="font-normal">
              Design inspirations
            </Badge>
            <Badge className="font-medium">{tabTitle}</Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{tab}</div>
        </aside>
      </div>
    </div>
  )
}

/** Installs the bench's fake doors once so the fixture and its slots resolve like on a lane. */
function Bench({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installDoors(SITE)
    setReady(true)
  }, [])
  return ready ? <>{children}</> : <div />
}

// ─── The fixture as a skeleton that fills in ─────────────────────────────────────────────────

const PULSE =
  '<style>@keyframes tskel{0%,100%{opacity:.10}50%{opacity:.24}}[data-skel]{display:inline-block;height:.85em;border-radius:.3em;background:currentColor;opacity:.14;animation:tskel 1.4s ease-in-out infinite;vertical-align:middle}</style>'

/** Roles the copy stage writes; everything else (labels, nav, buttons) waits for the seed stage. */
const PROSE = new Set(['headline', 'paragraph', 'eyebrow', 'title', 'subtitle', 'quote'])

/**
 * The inspiration's own page with each text slot turned into a grey bar the width of its words.
 * `filled` names the roles whose real text is already in; the rest keep their bar. The brand name
 * is never a bar: it is the one word the customer gave before anything ran.
 */
function skeletonDoc(html: string, slots: Slot[], filled: (role: string) => boolean): string {
  const fills = planFill(slots, { site: SITE.site, pages: SITE.pages, page: null, copy: null })
  const byId = new Map(fills.map((f) => [f.id, f]))
  const doc = new DOMParser().parseFromString(applyFill(html, fills), 'text/html')
  const byTag = new Map<string, Element[]>()
  for (const s of slots) {
    if (s.role === 'brand' || filled(s.role)) continue
    let list = byTag.get(s.tag)
    if (!list) {
      list = Array.from(doc.body.querySelectorAll(s.tag))
      byTag.set(s.tag, list)
    }
    const el = list[s.n]
    if (!el) continue
    const words = Math.max(1, byId.get(s.id)?.text.split(/\s+/).length ?? s.words)
    const bar = doc.createElement('span')
    bar.setAttribute('data-skel', '')
    bar.style.width = `${Math.min(words * 3.4, 60)}ch`
    if (words > 12) bar.style.width = '100%'
    el.textContent = ''
    el.append(bar)
  }
  doc.head.insertAdjacentHTML('beforeend', PULSE)
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

/**
 * The fixture at 1280px scaled into the side card, as a skeleton or with the words in. No `sandbox`
 * on the iframe here: inside Storybook's own iframe a sandboxed srcdoc paints nothing (07/09); the
 * real tab keeps FixtureThumb's `sandbox=""`, which draws fine on a lane.
 */
function PageFrame({
  stage,
  height = 460,
  siteBar
}: {
  /** Index of the running stage; ≥ 3 fills prose, ≥ 5 fills everything. */
  stage: number
  height?: number
  siteBar?: string
}): JSX.Element {
  const files = useFixtureFiles('airbnb')
  const doc = useMemo(() => {
    if (!files) return null
    if (stage >= STAGES.length)
      return applyFill(
        files.html,
        planFill(files.slots, { site: SITE.site, pages: SITE.pages, page: null, copy: null })
      )
    return skeletonDoc(files.html, files.slots, (role) => stage > 3 && PROSE.has(role))
  }, [files, stage])
  const width = 408
  const scale = width / 1280
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {siteBar ? (
        <div className="flex items-center gap-2 border-border border-b bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="ml-2 truncate">{siteBar}</span>
        </div>
      ) : null}
      <div style={{ height }} className="relative overflow-hidden">
        {doc ? (
          <iframe
            title="page"
            srcDoc={doc}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{ width: 1280, height: height / scale, transform: `scale(${scale})` }}
          />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Form ─────────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

function Chips({
  items,
  on,
  onToggle
}: {
  items: string[]
  on: string[]
  onToggle?: (item: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <button
          type="button"
          key={p}
          onClick={() => onToggle?.(p)}
          className={cn(
            'rounded-md border px-2.5 py-1 text-sm',
            on.includes(p)
              ? 'border-primary bg-primary/10 font-medium'
              : 'border-border text-muted-foreground'
          )}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

const PAGES = ['Home', 'Listing', 'Article', 'Pricing', 'Contact']
const TONES = ['Plain', 'Warm', 'Bold']

function BuildForm({
  missing,
  onBuild
}: {
  /** Fields the agent came back for (`waiting:form`); only these are highlighted. */
  missing?: string[]
  onBuild?: () => void
}): JSX.Element {
  const [name, setName] = useState(missing ? '' : 'Tracy')
  const [about, setAbout] = useState(
    missing
      ? ''
      : 'An AI workstation for people who run websites: one desk per site, an agent that reads, checks and proposes, you approve what ships.'
  )
  const [pages, setPages] = useState<string[]>(['Home', 'Pricing', 'Contact'])
  const [tone, setTone] = useState<string[]>(['Plain'])
  const [langs] = useState<string[]>(['English'])
  const [contact, setContact] = useState('hello@tracy.ai')
  const [attached, setAttached] = useState<string[]>([])
  const hi = (k: string) => (missing?.includes(k) ? 'ring-2 ring-primary rounded-md' : '')
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0">
          <PageFrame stage={STAGES.length} height={64} />
        </div>
        <div className="min-w-0">
          <div className="font-medium">Build with WordPress</div>
          <div className="text-muted-foreground text-sm">
            Design inspiration <span className="text-foreground">Airbnb</span> · on lucaswp.tracy.ai
          </div>
        </div>
      </div>
      {missing ? (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-primary" />
          Tracy needs two more things before writing your words.
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          A few things about you. Leave a box empty and Tracy decides.
        </p>
      )}
      <Separator />
      <div className={hi('name')}>
        <Field label="Business name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Studio" />
        </Field>
      </div>
      <div className={hi('about')}>
        <Field
          label={
            <>
              One line about your business or{' '}
              <button
                type="button"
                className="text-primary underline underline-offset-4"
                onClick={() => setAttached((a) => [...a, 'company-profile.pdf'])}
              >
                attach
              </button>{' '}
              any business info
            </>
          }
          hint="PDF, Word, text, Markdown or images · up to 5 files · 10 MB each"
        >
          <div className="relative">
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={3}
              placeholder="What you do, for whom, and what makes you the right choice."
              className="pr-9"
            />
            <Paperclip size={16} className="absolute right-3 bottom-3 text-muted-foreground" />
          </div>
          {attached.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {attached.map((f) => (
                <Badge key={f} variant="secondary" className="font-normal">
                  {f}
                </Badge>
              ))}
            </div>
          ) : null}
        </Field>
      </div>
      <Field label="Pages you want" hint="Home is always there.">
        <Chips
          items={PAGES}
          on={pages}
          onToggle={(p) =>
            p === 'Home' ? undefined : setPages((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
          }
        />
      </Field>
      <Field label="Tone">
        <Chips items={TONES} on={tone} onToggle={(t) => setTone([t])} />
      </Field>
      <Field label="Site language">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chips items={langs} on={langs} />
          <button type="button" className="text-primary text-sm underline underline-offset-4">
            More
          </button>
        </div>
      </Field>
      <Field label="Contact" hint="Goes on the Contact page and in the footer.">
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="email · phone · address"
        />
      </Field>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Nothing is sent until you press Send to Tracy.</span>
        <Button onClick={onBuild}>Send to Tracy</Button>
      </div>
    </div>
  )
}

// ─── Tab: Building ─────────────────────────────────────────────────────────────────────────────

function BuildingTab({ stages }: { stages: Stage[] }): JSX.Element {
  const running = stages.findIndex((s) => s.status === 'running')
  const failed = stages.find((s) => s.status === 'failed')
  const current = running === -1 ? STAGES.length : running
  const doneCount = stages.filter((s) => s.status === 'done').length
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle size={16} className="text-destructive" />
        ) : (
          <Loader2 size={16} className="animate-spin text-primary" />
        )}
        <span className="font-medium">
          {failed
            ? `${STAGE_WORDS[failed.name][0]} failed`
            : running === -1
              ? 'Pages laid out'
              : `${STAGE_WORDS[STAGES[current]!][0]}…`}
        </span>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {doneCount} of {STAGES.length}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', failed ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${((doneCount + (running === -1 ? 0 : 0.5)) / STAGES.length) * 100}%` }}
        />
      </div>
      <PageFrame stage={current} />
      {failed ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <span>{failed.detail}</span>
          <div>
            <Button size="sm" variant="outline">
              <RotateCcw size={14} /> Retry this step
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          The page you are looking at is the inspiration's own layout. Words drop in as Tracy writes them; the
          live site replaces it when the pages are laid out.
        </p>
      )}
    </div>
  )
}

// ─── Tab: Built (live site + Tweaks) ───────────────────────────────────────────────────────────

function Tweak({ label, value, options }: { label: string; value: string; options: string[] }): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        defaultValue={value}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

function BuiltTab({ headline }: { headline?: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Check size={16} className="text-primary" />
        <span className="font-medium">lucaswp.tracy.ai is built</span>
        <Button size="sm" variant="outline" className="ml-auto">
          <ExternalLink size={14} /> Open site
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
          <Wrench size={12} /> Tweaks
        </span>
        <Tweak label="Style" value="Airbnb" options={['Airbnb', 'Apple', 'Brutalism', 'Notion']} />
        <Tweak label="Nav" value="auto" options={['auto', 'left', 'center']} />
        <Tweak label="Hero" value="auto" options={['auto', 'split', 'typographic']} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Dark</span>
          <Switch />
        </label>
      </div>
      <PageFrame
        stage={STAGES.length}
        siteBar={headline ? 'lucaswp.tracy.ai · headline updated' : 'lucaswp.tracy.ai'}
      />
      <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
        <span>
          Change a tweak and the look reruns; say what to change in the chat and only that page reruns.
        </span>
        <Button size="sm" variant="ghost" disabled>
          <MessageSquare size={14} /> Comment on the page
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
            soon
          </Badge>
        </Button>
      </div>
    </div>
  )
}

// ─── Chat pieces ───────────────────────────────────────────────────────────────────────────────

function UserBubble({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm">{children}</div>
    </div>
  )
}

function Agent({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-sm leading-relaxed">{children}</p>
}

/** What the composer posts on Build: the answers, as the customer's own message. */
function Answered(): JSX.Element {
  return (
    <UserBubble>
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground text-xs">
        <Check size={12} /> You answered
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {[
          ['build', 'Airbnb on WordPress'],
          ['name', 'Tracy'],
          ['about', 'An AI workstation for people who run websites…'],
          ['pages', 'Home, Pricing, Contact'],
          ['tone', 'Plain'],
          ['language', 'English'],
          ['contact', 'hello@tracy.ai']
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </UserBubble>
  )
}

/** The running card — the tool call's own view, alive only while the call is in flight. */
function RunningCard({
  stages,
  title = 'Building your site…'
}: {
  stages: Stage[]
  title?: string
}): JSX.Element {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-2 px-4 py-3">
        <div className="text-sm font-medium">{title}</div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {stages.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              {s.status === 'done' ? (
                <Check size={14} className="text-primary" />
              ) : s.status === 'running' ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : s.status === 'failed' ? (
                <AlertCircle size={14} className="text-destructive" />
              ) : s.status === 'waiting' ? (
                <MessageSquare size={14} className="text-primary" />
              ) : (
                <CircleDashed size={14} className="text-muted-foreground" />
              )}
              <span
                className={cn(
                  s.status === 'pending' && 'text-muted-foreground',
                  s.status === 'skipped' && 'text-muted-foreground line-through'
                )}
              >
                {s.status === 'done' ? STAGE_WORDS[s.name][1] : STAGE_WORDS[s.name][0]}
              </span>
              {s.status === 'running' ? <Skeleton className="h-3 w-20" /> : null}
              {s.detail ? <span className="text-muted-foreground text-xs">· {s.detail}</span> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** The picture card — the turn tail, after the tool settled and the turn closed. */
function BuiltCard({ caption, headline }: { caption: string; headline?: string }): JSX.Element {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="bg-muted/40 p-3">
        <div className="mx-auto w-[88%] overflow-hidden rounded-t-md border border-border border-b-0 bg-card">
          <PageFrame stage={STAGES.length} height={150} />
        </div>
        <div className="mx-auto h-1.5 w-[96%] rounded-b-md bg-border" />
      </div>
      <CardContent className="flex items-center gap-3 px-4 py-3 text-sm">
        <Check size={14} className="text-primary" />
        <span className="min-w-0 truncate">{caption}</span>
        {headline ? (
          <Badge variant="secondary" className="font-normal">
            headline
          </Badge>
        ) : null}
        <Button size="sm" variant="outline" className="ml-auto">
          <ExternalLink size={14} /> Open site
        </Button>
        <Button size="sm" variant="ghost">
          Build tab <ChevronRight size={14} />
        </Button>
      </CardContent>
    </Card>
  )
}

const NOTE =
  'NOT IN PRODUCT · a proposal; the real screens are the tracy:build tab and two chat cards, Mode B'

// ─── Stories ───────────────────────────────────────────────────────────────────────────────────

/** Pressing Create with WordPress opened the tab. Nothing went to the chat yet. */
export const Form: Story = {
  render: () => (
    <Bench>
      <Lane
        note={`${NOTE} — state 1: the tab asks; the chat is untouched until Build.`}
        tabTitle="Build"
        tab={<BuildForm />}
        chat={
          <p className="text-muted-foreground text-sm">
            (No message yet. The button did not speak for the customer — the form will, once they press
            Build.)
          </p>
        }
      />
    </Bench>
  )
}

/** Build pressed: the answers landed in the chat, the agent said one line, the engine is on stage 4. */
export const Building: Story = {
  render: () => (
    <Bench>
      <Lane
        note={`${NOTE} — state 2: writing the words. The tab shows the Airbnb layout with grey bars where the words go.`}
        tabTitle="Build"
        tab={<BuildingTab stages={stagesAt(3)} />}
        chat={
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <RunningCard stages={stagesAt(3)} />
          </>
        }
      />
    </Bench>
  )
}

/** Words in, pages being laid out: the prose is real, the labels still bars. */
export const BuildingWordsIn: Story = {
  name: 'Building · words in',
  render: () => (
    <Bench>
      <Lane
        note={`${NOTE} — state 2b: the words are in, the pages are being laid out.`}
        tabTitle="Build"
        tab={<BuildingTab stages={stagesAt(4)} />}
        chat={
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <RunningCard stages={stagesAt(4)} />
          </>
        }
      />
    </Bench>
  )
}

/** Done: dsh folded the tool call; the picture card is the turn's tail. The tab is the live site. */
export const Built: Story = {
  render: () => (
    <Bench>
      <Lane
        note={`${NOTE} — state 3: built. The running card folded into "1 tool call"; the picture is the turn tail.`}
        tabTitle="Build"
        tab={<BuiltTab />}
        chat={
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <div className="flex items-center gap-1 text-muted-foreground text-sm">
              1 tool call <ChevronRight size={14} />
            </div>
            <Agent>
              Done. Theme and the Airbnb look are on, three pages carry your words. Say what to change — a
              headline, a section, the tone — and only that part is redone.
            </Agent>
            <BuiltCard caption="Created lucaswp.tracy.ai · 3 pages" />
          </>
        }
      />
    </Bench>
  )
}

/** The seeder is not wired yet: the last stage is crossed out and the card says so in one line. */
export const SeederMissing: Story = {
  name: 'Built · no seeder yet',
  render: () => {
    const stages = stagesAt(4, { seed: { name: 'seed', status: 'skipped', detail: 'comes with the seeder' } })
    return (
      <Bench>
        <Lane
          note={`${NOTE} — state 3b: today's truth on lucaswp — the look is on, the pages are not seeded yet.`}
          tabTitle="Build"
          tab={<BuiltTab />}
          chat={
            <>
              <Answered />
              <Agent>
                Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
              </Agent>
              <RunningCard stages={stages} title="Site built — look only" />
              <Agent>
                The look is on and your words are written. Laying them out into pages comes with the seeder;
                until then the site shows the theme's own pages.
              </Agent>
            </>
          }
        />
      </Bench>
    )
  }
}

/** A stage failed: the card names it in the customer's words, and the tab offers Retry this step. */
export const Failed: Story = {
  render: () => {
    const stages = stagesAt(1, {
      theme: { name: 'theme', status: 'failed', detail: 'the lane image has no theme zip' }
    })
    return (
      <Bench>
        <Lane
          note={`${NOTE} — state 4: a stage failed. One line of why, one button.`}
          tabTitle="Build"
          tab={<BuildingTab stages={stages} />}
          chat={
            <>
              <Answered />
              <Agent>
                Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
              </Agent>
              <RunningCard stages={stages} title="Build stopped" />
              <Agent>
                Installing the theme failed: this lane's image is older than the themes. I have asked for the
                image to be updated; press Retry this step in the Build tab once it is.
              </Agent>
            </>
          }
        />
      </Bench>
    )
  }
}

/** The engine needs words it does not have: the card points to the tab, the tab highlights the two boxes. */
export const NeedsForm: Story = {
  name: 'Waiting for answers',
  render: () => {
    const stages = stagesAt(3, {
      copy: { name: 'copy', status: 'waiting', detail: 'answer in the Build tab' }
    })
    return (
      <Bench>
        <Lane
          note={`${NOTE} — state 5: the copy stage has nothing to write from. The question goes to the tab, not the chat.`}
          tabTitle="Build"
          tab={<BuildForm missing={['name', 'about']} />}
          chat={
            <>
              <UserBubble>Build "Airbnb" with WordPress.</UserBubble>
              <Agent>Building this with WordPress: the theme, the Airbnb look, then your words.</Agent>
              <RunningCard stages={stages} title="Waiting for two answers" />
              <Agent>
                Theme and look are on. Tell me your name and one line about you in the Build tab and I
                continue.
              </Agent>
            </>
          }
        />
      </Bench>
    )
  }
}

/** The customer changes one thing: only the last stage reruns, for one page; a new picture comes back. */
export const Rerun: Story = {
  name: 'Change one thing',
  render: () => {
    const stages = STAGES.map<Stage>((name) =>
      name === 'seed' ? { name, status: 'running', detail: 'home only' } : { name, status: 'done' }
    )
    return (
      <Bench>
        <Lane
          note={`${NOTE} — state 6: "change the headline". Words rewritten, ONLY the home page relaid; theme and look untouched.`}
          tabTitle="Build"
          tab={<BuiltTab headline="new" />}
          chat={
            <>
              <BuiltCard caption="Created lucaswp.tracy.ai · 3 pages" />
              <UserBubble>Change the headline to "Your website, with someone on duty."</UserBubble>
              <Agent>
                Rewriting the headline and relaying the home page — the theme and look stay as they are.
              </Agent>
              <RunningCard stages={stages} title="Updating the home page" />
              <BuiltCard caption="Updated lucaswp.tracy.ai · home" headline="new" />
            </>
          }
        />
      </Bench>
    )
  }
}

/** All of it, in order, with Next/Back — the flow Lee reviews as one story. */
export const Walkthrough: Story = {
  render: () => {
    const [step, setStep] = useState(0)
    const steps: { title: string; tab: ReactNode; chat: ReactNode }[] = [
      {
        title: 'Create with WordPress pressed → the Build tab asks',
        tab: <BuildForm onBuild={() => setStep(1)} />,
        chat: <p className="text-muted-foreground text-sm">(nothing yet)</p>
      },
      {
        title: 'Build pressed → answers in the chat, engine running, skeleton in the tab',
        tab: <BuildingTab stages={stagesAt(2)} />,
        chat: (
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <RunningCard stages={stagesAt(2)} />
          </>
        )
      },
      {
        title: 'Words written → prose fills in, labels still bars',
        tab: <BuildingTab stages={stagesAt(4)} />,
        chat: (
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <RunningCard stages={stagesAt(4)} />
          </>
        )
      },
      {
        title: 'Done → picture in the chat, live site with Tweaks in the tab',
        tab: <BuiltTab />,
        chat: (
          <>
            <Answered />
            <Agent>
              Building this with WordPress: the theme, the Airbnb look, your words, then the pages.
            </Agent>
            <div className="flex items-center gap-1 text-muted-foreground text-sm">
              1 tool call <ChevronRight size={14} />
            </div>
            <Agent>Done. Say what to change and only that part is redone.</Agent>
            <BuiltCard caption="Created lucaswp.tracy.ai · 3 pages" />
          </>
        )
      },
      {
        title: '"Change the headline" → one stage, one page, new picture',
        tab: <BuiltTab headline="new" />,
        chat: (
          <>
            <BuiltCard caption="Created lucaswp.tracy.ai · 3 pages" />
            <UserBubble>Change the headline to "Your website, with someone on duty."</UserBubble>
            <Agent>Rewriting the headline and relaying the home page — the theme and look stay.</Agent>
            <RunningCard stages={ALL_DONE} title="Home page updated" />
            <BuiltCard caption="Updated lucaswp.tracy.ai · home" headline="new" />
          </>
        )
      }
    ]
    const s = steps[step]!
    return (
      <Bench>
        <div className="flex h-dvh flex-col">
          <div className="flex items-center gap-3 border-border border-b px-4 py-2 text-sm">
            <Button size="sm" variant="outline" disabled={step === 0} onClick={() => setStep((n) => n - 1)}>
              Back
            </Button>
            <Button size="sm" disabled={step === steps.length - 1} onClick={() => setStep((n) => n + 1)}>
              Next
            </Button>
            <span className="text-muted-foreground">
              {step + 1}/{steps.length} · {s.title}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <Lane note={NOTE} tabTitle="Build" tab={s.tab} chat={s.chat} />
          </div>
        </div>
      </Bench>
    )
  }
}
