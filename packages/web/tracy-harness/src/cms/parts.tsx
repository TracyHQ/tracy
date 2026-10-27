/**
 * The pieces every configuration screen shares.
 *
 * Ported from the approved drawing (`packages/dev/tracy-design/src/mockups/ops-build-config`,
 * commit dd64e940d) with one change that matters: in the drawing a status was a literal somebody
 * typed, here it arrives from a snapshot. So `SectionGate` exists — a section that is not `ok`
 * renders ITS OWN reason and nothing else, rather than the screen guessing what to draw from
 * absent data.
 *
 * The rule the drawing was reviewed on still holds: a state is always WORDS plus a colour, never a
 * colour. A screenshot in a dark terminal, a colour-blind reader, and a printed page all have to
 * get the same answer.
 */
import {
  Badge,
  Button,
  Card,
  cn,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@tracy/ui'
import { AlertTriangle, Ban, Check, CircleDashed, Clock, HelpCircle, Loader2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatNumber, Trans, type T, useT } from '../i18n'
import type { Refusal, Section, Status } from './api'

const STATUS_KEY: Record<Status, string> = {
  ok: 'cms-screens.status.ok',
  missing: 'cms-screens.status.missing',
  unsupported: 'cms-screens.status.unsupported',
  unavailable: 'cms-screens.status.unavailable',
  error: 'cms-screens.status.error',
  unknown: 'cms-screens.status.unknown'
}

/** A status in words, in the language on screen; an id the table does not know prints as sent. */
export const statusLabel = (status: Status, t: T): string =>
  Object.hasOwn(STATUS_KEY, status) ? t(STATUS_KEY[status]) : status

const STATUS_STYLE: Record<Status, { icon: ReactNode; className: string }> = {
  ok: { icon: <Check />, className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
  missing: { icon: <X />, className: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  unsupported: { icon: <Clock />, className: 'border-border text-muted-foreground' },
  unavailable: {
    icon: <AlertTriangle />,
    className: 'border-amber-500/50 text-amber-700 dark:text-amber-400'
  },
  error: { icon: <AlertTriangle />, className: 'border-destructive/50 text-destructive' },
  unknown: { icon: <HelpCircle />, className: 'border-border text-muted-foreground' }
}

export function StatusChip({ status, className }: { status: Status; className?: string }) {
  const t = useT()
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unknown
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal [&_svg]:size-3', s.className, className)}>
      {s.icon}
      {statusLabel(status, t)}
    </Badge>
  )
}

/**
 * IN REPO · PACKAGED · RUNNING — three facts, never one tick.
 *
 * `running` is `unknown` on every row a snapshot produced, because a snapshot describes a tree and
 * a tree is not a machine. Only `/api/ops/cms/runtime` may move it, and it does so on its own
 * screen where the observation carries a timestamp.
 */
export function LayerLine({
  inRepo,
  packaged = 'unknown',
  running = 'unknown',
  className
}: {
  inRepo: Status
  packaged?: Status
  running?: Status
  className?: string
}) {
  const t = useT()
  const mark = (s: Status) => (s === 'ok' ? '✓' : s === 'unknown' ? '?' : '✗')
  const tone = (s: Status) =>
    s === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
  const cells: [string, Status][] = [
    [t('cms-screens.layer.inRepo'), inRepo],
    [t('cms-screens.layer.packaged'), packaged],
    [t('cms-screens.layer.running'), running]
  ]
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs', className)}>
      {cells.map(([label, s]) => (
        <span key={label} className="flex items-center gap-1 text-muted-foreground">
          <span aria-hidden className={cn('font-mono', tone(s))}>
            {mark(s)}
          </span>
          <span>
            {label}
            <span className="sr-only">: {statusLabel(s, t)}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

export function ScreenHead({
  title,
  sub,
  children
}: {
  title: string
  sub: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
        <p className="mt-0.5 max-w-3xl text-muted-foreground text-sm">{sub}</p>
      </div>
      {children ? <div className="flex flex-none flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function Panel({
  title,
  icon,
  aside,
  children,
  className
}: {
  title: ReactNode
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <h2 className="font-medium text-sm">{title}</h2>
        {aside ? <div className="ms-auto flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      <Separator />
      {children}
    </Card>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-border border-b py-2 last:border-b-0">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 break-words text-sm">{children}</span>
    </div>
  )
}

/**
 * A section that is not `ok` draws its own reason and nothing else.
 *
 * 🔒 THIS IS THE WHOLE POINT OF THE SCREEN. Without it, a `unsupported` capability catalogue would
 * render as a table with no rows — which reads as "there are no providers", a claim that is false
 * and that sends somebody to author providers on a ref that never had the file.
 */
export function SectionGate<T>({
  section,
  what,
  children
}: {
  section: Section<T> | undefined
  what: string
  children: (data: T) => ReactNode
}) {
  if (!section)
    return (
      <Panel title={what}>
        <p className="px-4 py-6 text-muted-foreground text-sm">
          <Trans
            i18nKey="cms-screens.gate.noSection"
            values={{ what }}
            components={{ c: <span className="font-mono" /> }}
          />
        </p>
      </Panel>
    )
  if (section.status !== 'ok')
    return (
      <Panel title={what} aside={<StatusChip status={section.status} />}>
        <p className="px-4 py-5 text-sm">{section.reason}</p>
        <Separator />
        <SourceList sources={section.sources} />
      </Panel>
    )
  return <>{children(section.data)}</>
}

/** Where a section was read from, so a reader can go and check rather than take our word. */
export function SourceList({ sources }: { sources: { path: string; sha256: string; bytes: number }[] }) {
  const t = useT()
  if (!sources || sources.length === 0)
    return <p className="px-4 py-2.5 text-muted-foreground text-xs">{t('cms-screens.sources.none')}</p>
  return (
    <ul className="divide-y divide-border">
      {sources.map((s) => (
        <li key={s.path} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">{s.path}</span>
          <span className="text-muted-foreground tabular-nums">
            {t('cms-screens.sources.bytes', { count: s.bytes, bytes: formatNumber(s.bytes) })}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{s.sha256.slice(0, 12)}…</span>
        </li>
      ))}
    </ul>
  )
}

/** What a refused or failed request looks like. Four kinds, four different things to do about it. */
export function RefusalNotice({ refusal, onRetry }: { refusal: Refusal; onRetry?: () => void }) {
  const t = useT()
  const title = t(
    {
      'signed-out': 'cms-screens.refusal.signedOut',
      'not-staff': 'cms-screens.refusal.notStaff',
      unavailable: 'cms-screens.refusal.unavailable',
      error: 'cms-screens.refusal.error',
      aborted: 'cms-screens.refusal.aborted'
    }[refusal.kind]
  )
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-border border-dashed px-4 py-5">
      <div className="flex items-center gap-2">
        <Ban className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="max-w-2xl text-muted-foreground text-sm">{refusal.reason}</p>
      {refusal.kind === 'signed-out' ? (
        <Button
          size="sm"
          render={
            <a
              href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
            />
          }
        >
          {t('cms-screens.refusal.signIn')}
        </Button>
      ) : onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t('cms-screens.refusal.retry')}
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingRows({ rows = 4, label }: { rows?: number; label?: string }) {
  const t = useT()
  return (
    <ul
      className="divide-y divide-border"
      aria-busy="true"
      aria-label={label ?? t('cms-screens.loading.rows')}
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="h-4 w-40 animate-pulse rounded bg-muted" />
          <span className="h-4 w-24 animate-pulse rounded bg-muted" />
          <span className="ms-auto h-4 w-32 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

export function NoResults({ term, onClear }: { term: string; onClear: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <CircleDashed className="size-5 text-muted-foreground" aria-hidden />
      <p className="font-medium text-sm">{t('cms-screens.search.noMatch', { term })}</p>
      <Button variant="outline" size="sm" onClick={onClear}>
        {t('cms-screens.search.clear')}
      </Button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: readonly { id: T; label: string; icon?: ReactNode; disabled?: boolean }[]
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="flex flex-none gap-1 rounded-lg bg-muted p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          aria-label={o.label}
          disabled={o.disabled}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
            'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            o.id === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A code block that scrolls inside its own box, with an honest excerpt marker and a real total. */
export function Code({
  path,
  lines,
  totalLines,
  truncated,
  maxHeight = '22rem'
}: {
  path: string
  lines: string[]
  totalLines?: number
  truncated?: boolean
  maxHeight?: string
}) {
  const t = useT()
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs">{path}</span>
        {truncated ? (
          <Badge variant="outline" className="ms-auto flex-none font-normal">
            {t('cms-screens.code.excerpt', { count: totalLines ?? lines.length, shown: lines.length })}
          </Badge>
        ) : null}
      </div>
      <pre
        className="overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
        tabIndex={0}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}

/** A text input a controlled React value actually reaches — see the note in `Search` below. */
export function Search({
  value,
  onValue,
  label,
  placeholder
}: {
  value: string
  onValue: (next: string) => void
  label: string
  placeholder?: string
}) {
  /**
   * 🔒 A PLAIN `<input>`, NOT `@tracy/ui`'s `Input`. That component is base-ui's `Field.Control`,
   * whose own handler consumes `onChange` and calls `onValueChange` instead — so the React idiom
   * `value` + `onChange` leaves the DOM updating while state never moves, with no error anywhere
   * (measured 12/09: the box read "tailwind" and the table under it still said "8 of 8"). Fixing
   * the shared library to suit one search box is the wrong trade in this task; this input carries
   * the same token classes and behaves.
   */
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValue(e.currentTarget.value)}
      className={cn(
        'h-8 w-[12rem] min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none',
        'transition-colors placeholder:text-muted-foreground focus-visible:border-ring'
      )}
    />
  )
}

/**
 * The drawer the approved drawing uses for a row's full record.
 *
 * 🔒 A SHEET WITH ITS OWN TRIGGER, NOT A PANEL AND NOT A CONTROLLED DIALOG. The trigger is inside
 * the `Sheet`, which is what makes the browser give back the three behaviours a reviewer will test
 * for free and correctly: Escape closes, focus moves into the panel when it opens, and focus
 * RETURNS TO THE BUTTON THAT OPENED IT when it closes. Driving the same component from a `useState`
 * boolean and a button somewhere else loses the last one silently — the page keeps working and a
 * keyboard user is dropped at the top of the document.
 *
 * The first port of these screens replaced the drawers with inline panels. That was not a design
 * decision anybody made; it was a shortcut, and it quietly removed the thing the drawing was
 * approved with.
 */
export function RowDrawer({
  label,
  trigger,
  triggerClassName,
  title,
  description,
  children
}: {
  /** The accessible name of the opening button. Must be unique on the screen. */
  label: string
  /** For a trigger that is a whole cell's content rather than one word, e.g. two lines of text. */
  triggerClassName?: string
  /** What the button says. The accessible name above is what a test and a screen reader use. */
  trigger: ReactNode
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="sm" className={triggerClassName} aria-label={label} />}
      >
        {trigger}
      </SheetTrigger>
      <SheetContent closeLabel={t('cms-screens.drawer.close')} className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
