/**
 * "Add a business by its links": the two-mode switch and the link rows, shared by the Find box of Website
 * Opportunities and Build it from my business in Add site. The rows' logic is `link-rows-model.ts`.
 *
 * No words of its own: each consumer passes `copy`, a translate function over `LinkRowsKey`, so every sentence
 * stays in that plugin's namespace and its locales.
 */
import { type ClipboardEvent, type JSX, type ReactNode, useId } from 'react'
import { AlertCircle, Globe, Link2, MapPin, Plus, Store, X } from 'lucide-react'
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  ToggleGroup,
  ToggleGroupItem
} from '@tracy/ui'
import { FacebookIcon } from '@tracy/ui/icons/platforms/facebook'
import { InstagramIcon } from '@tracy/ui/icons/platforms/instagram'
import { TiktokIcon } from '@tracy/ui/icons/platforms/tiktok'
import { YoutubeIcon } from '@tracy/ui/icons/platforms/youtube'

import {
  MAX_LINKS,
  READY_ROWS,
  type RowView,
  type RowsSummary,
  type ServerLink,
  addRow,
  judgeRows,
  removable,
  removeRow,
  spreadPaste,
  summaryOf
} from './link-rows-model'

/** Every sentence the rows say; the consumer maps each to a key of its own namespace. */
export type LinkRowsKey =
  | 'label'
  | 'placeholder.google'
  | 'placeholder.social'
  | 'placeholder.website'
  | 'placeholder.another'
  | 'add'
  | 'remove'
  | 'status.google'
  | 'status.listing'
  | 'status.social'
  | 'status.website'
  | 'reason.invalid'
  | 'reason.duplicate'
  | 'reason.not-public'
  | 'reason.limit'
  | 'reason.one-google'
  | 'reason.one-website'
  | 'reason.unresolvable'
  | 'reason.blocked'
  | 'hint.empty'
  | 'summary.one'
  | 'summary.oneExtra'
  | 'summary.many'
  | 'summary.manyExtra'
  | 'summary.none'
  | 'extra.leftOut'
  | 'extra.twice'

export type LinkRowsCopy = (key: LinkRowsKey, params?: Record<string, string | number>) => string

export type FindMode = 'search' | 'links'

/** One half of the switch: an equal share of the width, a label that wraps instead of overflowing. */
export const MODE_ITEM =
  'h-auto min-h-7 min-w-0 flex-1 shrink whitespace-normal py-1 text-center leading-tight'

/**
 * The segmented switch between searching and pasting links. It spans its container and each half shrinks and wraps
 * its label, so a narrow panel (the left column, about 276 px) never pushes it past the edge.
 */
export function ModeSwitch({
  mode,
  onMode,
  search,
  links,
  disabled
}: {
  mode: FindMode
  onMode(mode: FindMode): void
  search: ReactNode
  links: ReactNode
  disabled?: boolean
}): JSX.Element {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[mode]}
      disabled={disabled}
      onValueChange={(next: unknown[]) => {
        const picked = next[0]
        if (picked === 'search' || picked === 'links') onMode(picked)
      }}
      data-link-mode={mode}
      className="w-full max-w-md"
    >
      <ToggleGroupItem value="search" className={MODE_ITEM}>
        {search}
      </ToggleGroupItem>
      <ToggleGroupItem value="links" className={MODE_ITEM}>
        {links}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

const SOCIAL_MARK: Record<string, (props: { className?: string }) => JSX.Element> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TiktokIcon,
  youtube: YoutubeIcon
}

function KindIcon({ view, index }: { view: RowView | null; index: number }): JSX.Element {
  const mark = 'size-4 shrink-0'
  if (view === null) {
    if (index === 0) return <MapPin aria-hidden="true" className={`${mark} text-muted-foreground`} />
    return <Link2 aria-hidden="true" className={`${mark} text-muted-foreground`} />
  }
  if (view.reason === 'invalid' || view.reason === 'not-public' || view.reason === 'blocked')
    return <AlertCircle aria-hidden="true" className={`${mark} text-destructive`} />
  const Social = view.kind ? SOCIAL_MARK[view.kind] : undefined
  if (Social) return <Social className={mark} />
  if (view.group === 'google') return <MapPin aria-hidden="true" className={mark} />
  if (view.group === 'listing') return <Store aria-hidden="true" className={mark} />
  return <Globe aria-hidden="true" className={mark} />
}

const PLACEHOLDERS = ['placeholder.google', 'placeholder.social', 'placeholder.website'] as const

/** The status or the reason under a filled row. */
function rowLine(copy: LinkRowsCopy, view: RowView): { text: string; tone: 'ok' | 'out' | 'bad' } {
  if (view.reason) {
    const bad = view.reason === 'invalid' || view.reason === 'not-public' || view.reason === 'blocked'
    return { text: copy(`reason.${view.reason}`), tone: bad ? 'bad' : 'out' }
  }
  return { text: copy(`status.${view.group ?? 'website'}`), tone: 'ok' }
}

/** The line under the rows: the empty hint, the summary, or that none can be used. */
export function summaryLine(copy: LinkRowsCopy, summary: RowsSummary): { text: string; error: boolean } {
  if (summary.filled === 0) return { text: copy('hint.empty'), error: false }
  if (summary.used === 0) return { text: copy('summary.none'), error: true }
  const extra = [
    summary.leftOut > 0 ? copy('extra.leftOut', { count: summary.leftOut }) : '',
    summary.twice > 0 ? copy('extra.twice', { count: summary.twice }) : ''
  ]
    .filter(Boolean)
    .join(', ')
  const one = summary.used === 1
  if (extra === '')
    return { text: one ? copy('summary.one') : copy('summary.many', { count: summary.used }), error: false }
  return {
    text: one
      ? copy('summary.oneExtra', { extra })
      : copy('summary.manyExtra', { count: summary.used, extra }),
    error: false
  }
}

/**
 * The link rows. Controlled: `rows` and `onRows` belong to the consumer, which also owns the form (Enter in a row
 * submits it) and the submit button. A paste holding several links spreads into rows; its leftover words go to
 * `onName`.
 */
export function LinkRows({
  copy,
  rows,
  onRows,
  onName,
  server,
  disabled
}: {
  copy: LinkRowsCopy
  rows: readonly string[]
  onRows(rows: string[]): void
  onName?(name: string): void
  server?: readonly ServerLink[]
  disabled?: boolean
}): JSX.Element {
  const baseId = useId()
  const views = judgeRows(rows, server)
  const hint = summaryLine(copy, summaryOf(views))

  const paste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const spread = spreadPaste(rows, index, event.clipboardData.getData('text'))
    if (spread === null) return
    event.preventDefault()
    onRows(spread.rows)
    if (spread.name) onName?.(spread.name)
  }

  return (
    <div className="grid gap-2" data-link-rows={rows.length}>
      <label className="font-medium text-muted-foreground text-xs" htmlFor={`${baseId}-0`}>
        {copy('label')}
      </label>
      <div className="grid gap-2">
        {rows.map((value, index) => {
          const view = views[index]
          const line = view ? rowLine(copy, view) : null
          return (
            <div
              // Rows have no identity of their own: the index is what the person sees and edits.
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              key={index}
              className="grid gap-1"
              data-link-row={index}
              data-link-kind={view?.kind ?? ''}
              data-link-reason={view?.reason ?? ''}
            >
              <InputGroup>
                <InputGroupAddon>
                  <KindIcon view={view} index={index} />
                </InputGroupAddon>
                <InputGroupInput
                  id={`${baseId}-${index}`}
                  value={value}
                  disabled={disabled}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="url"
                  aria-invalid={line?.tone === 'bad' ? true : undefined}
                  placeholder={copy(index < READY_ROWS ? PLACEHOLDERS[index] : 'placeholder.another')}
                  onChange={(event) => onRows(rows.map((row, i) => (i === index ? event.target.value : row)))}
                  onPaste={paste(index)}
                />
                {removable(rows, index) ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={copy('remove')}
                      disabled={disabled}
                      onClick={() => onRows(removeRow(rows, index))}
                    >
                      <X aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              {line ? (
                <span
                  className={
                    line.tone === 'bad'
                      ? 'pl-1 text-destructive text-xs'
                      : line.tone === 'out'
                        ? 'pl-1 text-muted-foreground text-xs italic'
                        : 'pl-1 text-muted-foreground text-xs'
                  }
                >
                  {line.text}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      {rows.length < MAX_LINKS ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onRows(addRow(rows))}
          >
            <Plus aria-hidden="true" />
            {copy('add')}
          </Button>
        </div>
      ) : null}
      <p
        className={hint.error ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        role={hint.error ? 'alert' : 'status'}
        data-link-summary={hint.error ? 'none' : 'ok'}
      >
        {hint.text}
      </p>
    </div>
  )
}
