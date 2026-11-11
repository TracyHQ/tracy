/**
 * The line over My opportunities (#537, header C, owner's cut of 10/11): right-aligned, the Attention toggle (only
 * when a place needs attention, or while it is on), Search by name, and the "..." menu (`list-menu-model.ts`). In
 * selection mode the line gives way to the selection bar (`list-select-bar.tsx`).
 */

import { Popover, PopoverItem, PopoverLabel, PopoverSeparator } from '@tracy/core/site-tabs/popover'
import { Button, InputGroup, InputGroupAddon, InputGroupInput } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import {
  CircleAlert,
  EyeIcon,
  LayoutGridIcon,
  MapIcon,
  MoreHorizontal,
  Rows3Icon,
  Search,
  SquareCheck
} from 'lucide-react'
import { Fragment, type JSX } from 'react'

import type { MyView } from './column-prefs.ts'
import type { ListMenuEntry } from './list-menu-model.ts'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

const VIEW_ICON = { cards: LayoutGridIcon, rows: Rows3Icon, map: MapIcon } as const

function MenuEntry({
  entry,
  onSelect,
  onView,
  onCancelled
}: {
  entry: ListMenuEntry
  onSelect(): void
  onView(view: MyView): void
  onCancelled(on: boolean): void
}): JSX.Element {
  switch (entry.kind) {
    case 'select':
      return (
        <PopoverItem itemId="select" icon={<SquareCheck aria-hidden="true" />} onClick={onSelect}>
          {entry.label}
        </PopoverItem>
      )
    case 'views':
      return (
        <div role="group" aria-label={entry.label}>
          <PopoverLabel>{entry.label}</PopoverLabel>
          {entry.options.map((o) => {
            const Icon = VIEW_ICON[o.value]
            return (
              <PopoverItem
                key={o.value}
                itemId={`view-${o.value}`}
                selected={o.value === entry.value}
                icon={<Icon aria-hidden="true" />}
                onClick={() => onView(o.value)}
              >
                {o.label}
              </PopoverItem>
            )
          })}
        </div>
      )
    case 'cancelled':
      return (
        <PopoverItem
          itemId="cancelled"
          selected={entry.checked}
          icon={<EyeIcon aria-hidden="true" />}
          onClick={() => onCancelled(!entry.checked)}
          end={
            entry.count ? <span className="tracy-wo-muted tracy-wo-my-menu-n">{entry.count}</span> : undefined
          }
        >
          {entry.label}
        </PopoverItem>
      )
    case 'quota':
      return (
        <p className="tracy-wo-my-menu-note" role="status">
          {entry.label}
        </p>
      )
  }
}

export function ListToolbar({
  t,
  attention,
  attentionOn,
  text,
  onText,
  onAttention,
  menu,
  onSelect,
  onView,
  onCancelled
}: {
  t: Translate
  /** Places that need attention; null until the counts arrive. */
  attention: number | null
  attentionOn: boolean
  text: string
  onText(text: string): void
  onAttention(on: boolean): void
  menu: readonly ListMenuEntry[]
  onSelect(): void
  onView(view: MyView): void
  onCancelled(on: boolean): void
}): JSX.Element {
  return (
    <div className="tracy-wo-my-bar">
      {attentionOn || (attention ?? 0) > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={attentionOn}
          className={cn('tracy-wo-attn', attentionOn && 'is-on')}
          onClick={() => onAttention(!attentionOn)}
        >
          <CircleAlert aria-hidden="true" />
          {t('filter.attention')}
          <StatusPill state="failed" glyph={null} label={attention ?? 0} />
        </Button>
      ) : null}
      <InputGroup className="tracy-wo-q">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          value={text}
          maxLength={100}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          autoComplete="off"
          onChange={(event) => onText(event.target.value)}
        />
      </InputGroup>
      <Popover
        align="end"
        // Portalled out of the plugin root, so it carries the root class to keep the scoped reset.
        scopeClass="tracy-wo"
        className="tracy-wo-my-menu"
        trigger={(props) => (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('my.menu.label')}
            title={t('my.menu.label')}
            className="tracy-wo-my-dots"
            {...props}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        )}
      >
        {menu.map((entry, i) => (
          <Fragment key={entry.kind}>
            {i > 0 ? <PopoverSeparator /> : null}
            <MenuEntry entry={entry} onSelect={onSelect} onView={onView} onCancelled={onCancelled} />
          </Fragment>
        ))}
      </Popover>
    </div>
  )
}
