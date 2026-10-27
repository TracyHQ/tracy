/**
 * The pieces every screen of the drawing shares. Nothing here is new UI — it is `@tracy/ui`
 * arranged twice or more, pulled out so seven screens cannot drift into seven vocabularies.
 *
 * The one rule worth naming: a state is always WORDS plus a colour, never a colour. A reviewer
 * reading this in dark mode, or colour-blind, or on a screenshot, still gets the answer.
 */
import { Badge, Button, Card, Input, Separator, cn } from '@tracy/ui'
import { AlertTriangle, Ban, Check, CircleDashed, Clock, HelpCircle, Loader2, X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import {
  LAYER_LABEL,
  PROVENANCE_LABEL,
  STATUS_LABEL,
  type Layers,
  type Provenance,
  type Status
} from './fixtures'

const STATUS_STYLE: Record<Status, { icon: ReactNode; className: string }> = {
  ready: { icon: <Check />, className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
  'not-verified': { icon: <HelpCircle />, className: 'border-border text-muted-foreground' },
  missing: { icon: <X />, className: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  pending: { icon: <Clock />, className: 'border-border text-muted-foreground' },
  blocked: { icon: <Ban />, className: 'border-orange-500/50 text-orange-700 dark:text-orange-400' },
  mismatch: { icon: <AlertTriangle />, className: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  error: { icon: <AlertTriangle />, className: 'border-destructive/50 text-destructive' },
  loading: { icon: <Loader2 />, className: 'border-border text-muted-foreground' }
}

/** The one way a state is ever drawn. */
export function StatusChip({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLE[status]
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-normal [&_svg]:size-3',
        s.className,
        status === 'loading' && '[&_svg]:animate-spin',
        className
      )}
    >
      {s.icon}
      {STATUS_LABEL[status]}
    </Badge>
  )
}

const LAYER_MARK: Record<'yes' | 'no' | 'unknown', { mark: string; tone: string; word: string }> = {
  yes: { mark: '✓', tone: 'text-emerald-700 dark:text-emerald-400', word: 'yes' },
  no: { mark: '✗', tone: 'text-muted-foreground', word: 'no' },
  unknown: { mark: '?', tone: 'text-muted-foreground', word: 'unknown' }
}

/**
 * IN REPO · PACKAGED · RUNNING, on one line.
 *
 * Three facts, never collapsed into one green dot. "The file is in the tree" is not "the image was
 * built", and neither is "somebody saw it answer" — those are three different repairs.
 */
export function LayerLine({ layers, className }: { layers: Layers; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs', className)}>
      {(['repo', 'packaged', 'running'] as const).map((key) => {
        const m = LAYER_MARK[layers[key]]
        return (
          <span key={key} className="flex items-center gap-1 text-muted-foreground">
            <span aria-hidden className={cn('font-mono', m.tone)}>
              {m.mark}
            </span>
            <span>
              {LAYER_LABEL[key]}
              <span className="sr-only">: {m.word}</span>
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Says where a value came from. `simulated` and `planned` must never look like `surveyed`. */
export function ProvenanceTag({ of }: { of: Provenance }) {
  return (
    <Badge
      variant={of === 'surveyed' ? 'secondary' : 'outline'}
      className={cn('font-normal', of === 'planned' && 'border-dashed')}
    >
      {PROVENANCE_LABEL[of]}
    </Badge>
  )
}

/** The heading every screen opens with — title, one line, and whatever controls it owns. */
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

/** A card with a title strip, used for every table and panel on these screens. */
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

/**
 * A code viewer. Scrolls in both directions inside its own box, so a long contract never pushes
 * the page sideways.
 */
export function Code({
  path,
  body,
  excerpt = false,
  maxHeight = '22rem'
}: {
  path: string
  body: string
  excerpt?: boolean
  maxHeight?: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs">{path}</span>
        {excerpt ? (
          <Badge variant="outline" className="ms-auto flex-none font-normal">
            Excerpt
          </Badge>
        ) : null}
      </div>
      <pre
        className="overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
        tabIndex={0}
      >
        {body}
      </pre>
    </div>
  )
}

/** A segmented control, the one `CmsAgents` already uses, so the two screens read as one product. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: readonly { id: T; label: string; icon?: ReactNode }[]
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
          // The glyph beside the label would otherwise land in the accessible name ("E EmDash").
          aria-label={o.label}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
            'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
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

/** What a filtered table shows when nothing matched. Says what to do, not just that it is empty. */
export function NoResults({ term, onClear }: { term: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <CircleDashed className="size-5 text-muted-foreground" />
      <p className="font-medium text-sm">No rows match “{term}”</p>
      <p className="max-w-sm text-muted-foreground text-xs">
        This table is a sample of the catalogue, not the whole of it — a design system that exists may still
        be absent here.
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear the search
      </Button>
    </div>
  )
}

/** Skeleton rows, for the loading state story. */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border" aria-busy="true" aria-label="Loading configuration">
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

/** A labelled fact, the shape used inside every drawer. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-border border-b py-2 last:border-b-0">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 break-words text-sm">{children}</span>
    </div>
  )
}

/** The steps still missing, in the order somebody would do them. Never a percentage. */
export function MissingSteps({ steps }: { steps: readonly string[] }) {
  if (steps.length === 0) return null
  return (
    <div className="mt-2">
      <p className="font-medium text-muted-foreground text-xs">Still missing</p>
      <ol className="mt-1 list-inside list-decimal text-sm">
        {steps.map((s) => (
          <li key={s} className="text-foreground/90">
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * A text input a controlled React value actually reaches.
 *
 * 🔒 `@tracy/ui`'s `Input` is base-ui's `Field.Control`, and it SWALLOWS `onChange`: its own
 * handler reads the value and calls `onValueChange` instead. So the shape every React snippet
 * uses — `value` plus `onChange` — leaves the DOM updating while state never moves, with no
 * error anywhere. Measured 12/09 in a headless run of these stories: the search box read
 * "tailwind" and the table under it still said "8 of 8 sample rows".
 *
 * `onValueChange` is not in `Input`'s published prop type (it is typed as a plain `<input>`), so
 * the cast below is deliberate, and it is the entire reason this wrapper exists rather than each
 * screen doing it four times.
 */
export function TextField({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onValue: (next: string) => void
}) {
  const controlled = { value, onValueChange: onValue } as ComponentProps<typeof Input>
  return <Input {...rest} {...controlled} />
}
