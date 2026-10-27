/**
 * The pieces of the library toolbar both lists of this plugin draw: the gallery (`Filter.tsx`) and the running
 * site's Design system tab (`DesignSystemFilter.tsx`). One markup, so the two bars cannot drift apart: the wide
 * search field with its magnifier, the Categories button with its filter icon, count badge and chevron, the
 * three-state tick, and the count line with Clear.
 */
import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'
import { Badge, Button, cn, InputGroup, InputGroupAddon, InputGroupInput } from '@tracy/ui'
import { Check, ChevronDown, ListFilter, Minus, Search, X } from 'lucide-react'

export type Tri = 'on' | 'part' | 'off'

/**
 * The highlight of a row in a Categories menu: the pointer's row (hover) and the keyboard's row (focus-visible).
 * Tinted with the text colour, as `@tracy/core`'s menu rows are, never bg-muted: in dark the menu's own surface IS
 * bg-muted's colour, so a bg-muted row vanished. The add-site plugin keeps a copy of the same classes (a plugin
 * never imports another's).
 */
export const MENU_ROW_TINT = 'hover:bg-foreground/10 focus-visible:bg-foreground/10'

/**
 * One row of a Categories menu, in both lists (the gallery's tree and the Design system tab's flat list). A
 * `menuitemcheckbox` button, so `@tracy/core`'s Popover gives it the WAI-ARIA menu keyboard: ArrowDown on the
 * Categories button opens the menu on the first ticked row (else the first), ArrowUp/ArrowDown/Home/End walk,
 * Enter or Space ticks (a native button click), Escape closes and gives focus back to the button. The gallery's
 * rows were cmdk items once: role="option" rows the Popover does not walk, so focus stayed on the button and the
 * arrows never moved (12/10/2026). `part` is said as aria-checked="mixed".
 * Extra props (a `data-*` hook) land on the button.
 */
export function CheckRow({
  state,
  onToggle,
  small = false,
  className,
  children,
  ...rest
}: {
  state: Tri
  onToggle: () => void
  /** The member rows of the gallery's tree: a smaller tick. */
  small?: boolean
  className?: string
  children: ReactNode
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'role' | 'type' | 'className' | 'children'
>): JSX.Element {
  return (
    <button
      {...rest}
      type="button"
      role="menuitemcheckbox"
      aria-checked={state === 'on' ? true : state === 'part' ? 'mixed' : false}
      onClick={onToggle}
      className={cn(
        'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
        MENU_ROW_TINT,
        className
      )}
    >
      <Tick state={state} small={small} />
      {children}
    </button>
  )
}

/** A tick in three states: on, part (a minus), off. */
export function Tick({ state, small = false }: { state: Tri; small?: boolean }): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-[4px] border',
        small ? 'size-3.5' : 'size-4',
        state === 'off' ? 'border-input' : 'border-primary',
        state === 'on'
          ? 'bg-primary text-primary-foreground'
          : state === 'part'
            ? 'bg-primary/20 text-primary'
            : ''
      )}
    >
      {/* Sized by CLASS, not the `size` prop: a 16px default overflows a 16px box with a border and drew
          the mark a pixel off, clipped (Akemi, 15/09). */}
      {state === 'on' ? <Check className={small ? 'size-2.5' : 'size-3'} strokeWidth={3} /> : null}
      {state === 'part' ? <Minus className={small ? 'size-2.5' : 'size-3'} strokeWidth={3} /> : null}
    </span>
  )
}

/** The search box: it takes the row's width; the Categories button sits at its right end. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** The box's accessible name, said without the example. */
  label: string
}): JSX.Element {
  return (
    <InputGroup className="h-9 flex-1 bg-transparent dark:bg-transparent">
      <InputGroupAddon align="inline-start">
        <Search size={14} />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        aria-label={label}
      />
    </InputGroup>
  )
}

/**
 * The Categories button. `props` are the menu-button props `@tracy/core`'s Popover hands its trigger (they open the
 * panel and make ArrowDown/ArrowUp land on its rows); `chosen` is how many things are ticked, shown as a badge.
 * The Design system tab's Theme menu is the same button with its own icon.
 */
export function CategoriesButton({
  props,
  label,
  chosen,
  icon = null
}: {
  props: Record<string, unknown>
  label: string
  chosen: number
  /** The leading icon; the filter icon when none is given. */
  icon?: ReactNode
}): JSX.Element {
  return (
    <Button {...props} variant="outline" className="h-9 shrink-0 gap-1.5">
      {icon ?? <ListFilter size={14} className="text-muted-foreground" />}
      {label}
      {chosen > 0 ? <Badge className="h-5 min-w-5 justify-center px-1 tabular-nums">{chosen}</Badge> : null}
      <ChevronDown size={14} className="text-muted-foreground" />
    </Button>
  )
}

/**
 * The count line under the toolbar, with Clear while anything narrows the list.
 * The row keeps the Clear button's height whether or not Clear is shown. Without it, every first or last
 * chip/tick grew or shrank the row by 8 px, pushed the whole grid, and the browser repainted every card
 * picture: a ~630 ms frozen frame per press (measured 29/09).
 */
export function CountRow({
  line,
  clearLabel,
  onClear,
  children = null
}: {
  line: string
  clearLabel: string
  /** Null while nothing narrows the list: no Clear. */
  onClear: (() => void) | null
  /** Extra chips after Clear (the gallery's "Closest to your brand"). */
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="flex min-h-6 items-center gap-2 text-muted-foreground text-xs">
      <span data-filter-count="">{line}</span>
      {onClear ? (
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={onClear}>
          <X size={12} />
          {clearLabel}
        </Button>
      ) : null}
      {children}
    </div>
  )
}
