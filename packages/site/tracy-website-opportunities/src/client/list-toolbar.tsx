/**
 * The line over My opportunities (#537, header C, owner's cut of 10/11): right-aligned, the Attention toggle (only
 * when a place needs attention, or while it is on), Search by name, and the "..." menu (`list-menu-model.ts`). In
 * selection mode the line gives way to the selection bar (`list-select-bar.tsx`).
 */

import {
  Button,
  buttonVariants,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@tracy/ui'
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
        <DropdownMenuItem onClick={onSelect}>
          <SquareCheck aria-hidden="true" />
          {entry.label}
        </DropdownMenuItem>
      )
    case 'views':
      return (
        <DropdownMenuGroup>
          <DropdownMenuLabel>{entry.label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={entry.value}
            onValueChange={(next: unknown) => {
              const v = entry.options.find((o) => o.value === next)
              if (v) onView(v.value)
            }}
          >
            {entry.options.map((o) => {
              const Icon = VIEW_ICON[o.value]
              return (
                <DropdownMenuRadioItem key={o.value} value={o.value} data-view={o.value}>
                  <Icon aria-hidden="true" />
                  {o.label}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      )
    case 'cancelled':
      return (
        <DropdownMenuCheckboxItem checked={entry.checked} onCheckedChange={(on: boolean) => onCancelled(on)}>
          <EyeIcon aria-hidden="true" />
          {entry.label}
          {entry.count ? <span className="tracy-wo-muted tracy-wo-my-menu-n">{entry.count}</span> : null}
        </DropdownMenuCheckboxItem>
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
          <span className="tracy-wo-attn-pill">{attention ?? 0}</span>
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
      <DropdownMenu>
        {/* The trigger IS the button (React 18 drops a ref passed to a function component). */}
        <DropdownMenuTrigger
          type="button"
          aria-label={t('my.menu.label')}
          title={t('my.menu.label')}
          className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'tracy-wo-my-dots')}
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="tracy-wo-my-menu">
          {menu.map((entry, i) => (
            <Fragment key={entry.kind}>
              {i > 0 ? <DropdownMenuSeparator /> : null}
              <MenuEntry entry={entry} onSelect={onSelect} onView={onView} onCancelled={onCancelled} />
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
