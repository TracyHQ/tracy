import {
  buttonVariants,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { Columns3Icon } from 'lucide-react'

import { COLUMN_IDS } from './types.ts'
import type { ColumnId, Translate } from './types.ts'

/** A consumer's own column the menu can switch (My opportunities: Demo site). */
export interface ColumnsMenuItem {
  id: string
  label: string
  shown: boolean
  onToggle(): void
}

/** Which table columns show; Place always does. Remembering the choice is the consumer's job. */
export function ColumnsMenu({
  t,
  hidden,
  onToggle,
  columns = COLUMN_IDS,
  fixed = [],
  items = [],
  note
}: {
  t: Translate
  hidden: ReadonlySet<ColumnId>
  onToggle(c: ColumnId): void
  /** The built-in columns offered (same list as `PlacesTable.columns`). */
  columns?: readonly ColumnId[]
  /** Labels of columns that always show, listed first and checked but not switchable. */
  fixed?: readonly string[]
  /** Consumer columns, after the built-in ones. */
  items?: readonly ColumnsMenuItem[]
  /** Replaces the default "Place always shows." line. */
  note?: string
}) {
  return (
    <DropdownMenu>
      {/* The trigger IS the button, styled like one. Not `render={<Button/>}`: dsh's page runs React 18,
          which drops a `ref` passed to a function component, so the trigger never registered and the
          menu stayed unpositioned (opacity 0 at 0,0). */}
      <DropdownMenuTrigger
        type="button"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'tracy-wo-columns')}
        aria-label={t('columns.button')}
      >
        <Columns3Icon aria-hidden />
        <span className="tracy-wo-tool-label">{t('columns.button')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tracy-wo-columns-menu">
        {fixed.map((label) => (
          <DropdownMenuCheckboxItem key={`fixed-${label}`} checked disabled>
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        {fixed.length ? <DropdownMenuSeparator /> : null}
        {COLUMN_IDS.filter((c) => columns.includes(c)).map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={!hidden.has(c)}
            closeOnClick={false}
            onCheckedChange={() => onToggle(c)}
          >
            {t(`columns.${c}`)}
          </DropdownMenuCheckboxItem>
        ))}
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={item.shown}
            closeOnClick={false}
            onCheckedChange={item.onToggle}
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <p className="tracy-wo-menu-note">{note ?? t('columns.note')}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
