/**
 * The toolbar of the "Choose a design system" sheet (Akemi, 12/10/2026: "the same search and Categories bar as the
 * Design inspiration gallery"). A PORT of `tracy-design-inspiration`'s `FilterParts.tsx` + `DesignSystemFilter.tsx`,
 * same components and classes, not an import: a plugin never imports another plugin's internals. Keep them in step.
 *
 * One row: the wide search field with its magnifier, the Categories button (filter icon, count badge, chevron) and
 * the Theme button (light, dark, mixed) at its right end, wrapping under the search when the sheet is narrow; under it the ticked categories as pills, then the muted count line with Clear.
 *
 * The menu is `@tracy/core`'s Popover (the gallery's: base UI's anchored menu never finishes placing itself in dsh's
 * page). Its rows are `menuitemcheckbox` buttons, so the Popover's menu keyboard applies: opening moves focus onto the
 * first ticked row (else the first), ArrowUp/ArrowDown/Home/End walk, Enter or Space ticks, Escape closes the menu
 * only (it is consumed before the sheet's own Escape) and gives focus back to the button. The panel is portalled to
 * the page body, outside `.tas-root`, so it carries `tas-dspop`: the preflight stand-ins the preview popup uses.
 */
import { Popover } from '@tracy/core/site-tabs/popover'
import { Badge, Button, cn, InputGroup, InputGroupAddon, InputGroupInput } from '@tracy/ui'
import { Check, ChevronDown, ListFilter, Search, SunMoon, X } from 'lucide-react'
import { type JSX, type ReactNode, useMemo } from 'react'

import {
  categoriesOf,
  countLineOf,
  isFiltered,
  NO_FILTER,
  type SystemFilter,
  themesOf
} from './design-system-filter.mjs'
import type { Translate } from './strings'

/** The portalled panel's scope: `design-system-css.ts` gives it the preflight stand-ins. */
const SCOPE = 'tas-dspop'

const toggle = (set: ReadonlySet<string>, key: string): Set<string> => {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/** The gallery's tick, two states here (a flat list has no part state). */
function Tick({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
      )}
    >
      {on ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

/** The gallery's Categories button: filter icon (or the given one), the label, the count badge, the chevron. */
function MenuButton({
  props,
  label,
  chosen,
  icon
}: {
  props: Record<string, unknown>
  label: string
  chosen: number
  icon: ReactNode
}): JSX.Element {
  return (
    <Button {...props} variant="outline" className="h-9 shrink-0 gap-1.5">
      {icon}
      {label}
      {chosen > 0 ? <Badge className="h-5 min-w-5 justify-center px-1 tabular-nums">{chosen}</Badge> : null}
      <ChevronDown size={14} className="text-muted-foreground" />
    </Button>
  )
}

/** One ticked row of a menu: a `menuitemcheckbox` button, so the Popover's menu keyboard walks it. */
function MenuRow({
  on,
  onToggle,
  label,
  count,
  data
}: {
  on: boolean
  onToggle: () => void
  label: string
  count: number
  /** The row's test hook, e.g. `{ 'data-ds-category': 'saas' }`. */
  data: Record<string, string>
}): JSX.Element {
  return (
    <button
      {...data}
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
        // Tinted with the text colour, as core's menu rows are: in dark the menu's own surface IS bg-muted's colour.
        'hover:bg-foreground/10 focus-visible:bg-foreground/10'
      )}
    >
      <Tick on={on} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
    </button>
  )
}

export function DesignSystemFilter({
  rows,
  value,
  onChange,
  shown,
  t,
  categories: customCategories,
  categoryLabel,
  searchPlaceholder,
  countText
}: {
  /** Every row the sheet offers: the categories and their counts are taken over all of them. */
  rows: { name: string; group?: string | null; theme?: string | null }[]
  value: SystemFilter
  onChange: (next: SystemFilter) => void
  /** How many system cards the grid shows, for the count line. */
  shown: number
  t: Translate
  categories?: { key: string; count: number }[]
  categoryLabel?: (key: string) => string
  searchPlaceholder?: string
  countText?: string
}): JSX.Element {
  const categories = useMemo(() => customCategories ?? categoriesOf(rows), [rows, customCategories])
  const themes = useMemo(() => themesOf(rows), [rows])
  const ticked = value.themes ?? new Set<string>()
  const label = categoryLabel ?? ((key: string): string => t(`ds_industry_${key}`))
  const themeLabel = (key: string): string => t(`ds_theme_${key}`)
  const setCategories = (next: Set<string>): void => onChange({ ...value, categories: next })
  const setThemes = (next: Set<string>): void => onChange({ ...value, themes: next })
  const count = countLineOf(shown, rows.length)
  // The placeholder's example: the first system of the library, as the gallery names one from its own list.
  const example = rows[0]?.name

  return (
    <div className="flex flex-col gap-3" data-design-system-filter="1">
      {/* Search, Categories, Theme. The search keeps 12rem; below that the two menus wrap to a second line
          instead of pushing the bar past the sheet (the gallery's chip row wraps the same way). */}
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 min-w-48 flex-1 bg-transparent dark:bg-transparent">
          <InputGroupAddon align="inline-start">
            <Search size={14} />
          </InputGroupAddon>
          <InputGroupInput
            value={value.query}
            placeholder={
              searchPlaceholder ??
              (example ? t('ds_filter_search', { name: example }) : t('ds_filter_search_plain'))
            }
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            spellCheck={false}
            autoComplete="off"
            aria-label={t('ds_filter_search_plain')}
          />
        </InputGroup>
        <Popover
          scopeClass={SCOPE}
          align="end"
          className="w-64 p-1"
          trigger={(props) => (
            <MenuButton
              props={props}
              label={t('ds_filter_categories')}
              chosen={value.categories.size}
              icon={<ListFilter size={14} className="text-muted-foreground" />}
            />
          )}
        >
          {/* Stops the panel's own close-on-click, so several categories can be ticked in one visit. */}
          <div onClick={(e) => e.stopPropagation()} data-ds-categories="">
            {categories.map((c) => (
              <MenuRow
                key={c.key}
                on={value.categories.has(c.key)}
                onToggle={() => setCategories(toggle(value.categories, c.key))}
                label={label(c.key)}
                count={c.count}
                data={{ 'data-ds-category': c.key }}
              />
            ))}
          </div>
        </Popover>
        {/* The look of each system (the catalogue's light, dark or mixed): the Categories menu's twin. Hidden when
            the door sends no theme (an older server), rather than a menu of nothing. */}
        {themes.length > 0 ? (
          <Popover
            scopeClass={SCOPE}
            align="end"
            className="w-48 p-1"
            trigger={(props) => (
              <MenuButton
                props={props}
                label={t('ds_filter_theme')}
                chosen={ticked.size}
                icon={<SunMoon size={14} className="text-muted-foreground" />}
              />
            )}
          >
            <div onClick={(e) => e.stopPropagation()} data-ds-themes="">
              {themes.map((th) => (
                <MenuRow
                  key={th.key}
                  on={ticked.has(th.key)}
                  onToggle={() => setThemes(toggle(ticked, th.key))}
                  label={themeLabel(th.key)}
                  count={th.count}
                  data={{ 'data-ds-theme': th.key }}
                />
              ))}
            </div>
          </Popover>
        ) : null}
      </div>

      {/* What is ticked: one pill per category and theme, X to untick it. */}
      {value.categories.size > 0 || ticked.size > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 text-xs">
          {categories
            .filter((c) => value.categories.has(c.key))
            .map((c) => (
              <Badge
                key={c.key}
                className="cursor-pointer gap-1 font-normal"
                onClick={() => setCategories(toggle(value.categories, c.key))}
              >
                {label(c.key)}
                <X size={12} className="opacity-70" />
              </Badge>
            ))}
          {themes
            .filter((th) => ticked.has(th.key))
            .map((th) => (
              <Badge
                key={th.key}
                className="cursor-pointer gap-1 font-normal"
                onClick={() => setThemes(toggle(ticked, th.key))}
              >
                {themeLabel(th.key)}
                <X size={12} className="opacity-70" />
              </Badge>
            ))}
        </div>
      ) : null}

      {/* The row keeps the Clear button's height whether or not Clear is shown, so the grid never jumps. */}
      <div className="flex min-h-6 items-center gap-2 text-muted-foreground text-xs">
        <span data-filter-count="">{countText ?? t(count.key, count.params)}</span>
        {isFiltered(value) ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onChange(NO_FILTER)}
          >
            <X size={12} />
            {t('ds_filter_clear')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
