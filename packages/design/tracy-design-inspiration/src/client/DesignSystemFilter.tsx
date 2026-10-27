/**
 * The Design system tab's toolbar (Akemi, 12/10/2026: "the same search and Categories bar as the Design inspiration
 * gallery"). Built from the gallery's own pieces (`FilterParts.tsx`): the wide search field, the Categories button,
 * the ticked chips, the count line with Clear. What differs is only the panel: the gallery's is a tree of groups,
 * this one is one flat list, the library's industries with their counts (`design-system-filter.mjs`).
 *
 * The rows are `CheckRow`s (`menuitemcheckbox` buttons, shared with the gallery's tree), so `@tracy/core`'s
 * Popover gives them its menu keyboard: opening moves focus onto the first ticked row (else the first),
 * ArrowUp/ArrowDown/Home/End walk, Enter or Space ticks, Escape closes and gives focus back to the button. The panel stays open while ticking (the content stops the click
 * before it reaches the panel's close-on-click, as the gallery's does).
 */
import { Popover } from '@tracy/core/site-tabs'
import { Badge } from '@tracy/ui'
import { SunMoon, X } from 'lucide-react'
import { type JSX, useMemo } from 'react'

import {
  categoriesOf,
  countLineOf,
  isFiltered,
  NO_FILTER,
  type SystemFilter,
  themesOf
} from './design-system-filter.mjs'
import { CategoriesButton, CheckRow, CountRow, SearchField } from './FilterParts'
import type { Key, Translate } from './strings'

/** The plugin's root class: the portalled panel carries it to keep the scoped reset. */
const SCOPE = 'tracy-design-inspiration'

const toggle = (set: ReadonlySet<string>, key: string): Set<string> => {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function DesignSystemFilter({
  rows,
  value,
  onChange,
  shown,
  t
}: {
  /** Every row the tab offers: the categories and their counts are taken over all of them. */
  rows: { name: string; group?: string | null; theme?: string | null }[]
  value: SystemFilter
  onChange: (next: SystemFilter) => void
  /** How many cards the grid shows, for the count line. */
  shown: number
  t: Translate
}): JSX.Element {
  const categories = useMemo(() => categoriesOf(rows), [rows])
  const themes = useMemo(() => themesOf(rows), [rows])
  const ticked = value.themes ?? new Set<string>()
  const label = (key: string): string => t(`ds.industry_${key}` as Key)
  const themeLabel = (key: string): string => t(`ds.theme.${key}` as Key)
  const setCategories = (next: Set<string>): void => onChange({ ...value, categories: next })
  const setThemes = (next: Set<string>): void => onChange({ ...value, themes: next })
  const count = countLineOf(shown, rows.length)
  // The placeholder's example: the first system of the library, as the gallery names one from its own list.
  const example = rows[0]?.name

  return (
    <>
      {/* Search, Categories, Theme. The search keeps 12rem; below that the two menus wrap to a second line
          instead of pushing the bar past the pane (the gallery's chip row wraps the same way). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-48 flex-1">
          <SearchField
            value={value.query}
            onChange={(query) => onChange({ ...value, query })}
            placeholder={example ? t('filter.search', { brand: example }) : t('ds.filter.searchPlain')}
            label={t('ds.filter.searchPlain')}
          />
        </div>
        <Popover
          scopeClass={SCOPE}
          align="end"
          className="w-64 p-1"
          trigger={(props) => (
            <CategoriesButton props={props} label={t('filter.categories')} chosen={value.categories.size} />
          )}
        >
          {/* Stops the panel's own close-on-click, so several categories can be ticked in one visit. */}
          <div onClick={(e) => e.stopPropagation()} data-ds-categories="">
            {categories.map((c) => (
              <CheckRow
                key={c.key}
                state={value.categories.has(c.key) ? 'on' : 'off'}
                data-ds-category={c.key}
                onToggle={() => setCategories(toggle(value.categories, c.key))}
              >
                <span className="flex-1 truncate">{label(c.key)}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{c.count}</span>
              </CheckRow>
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
              <CategoriesButton
                props={props}
                label={t('ds.filter.theme')}
                chosen={ticked.size}
                icon={<SunMoon size={14} className="text-muted-foreground" />}
              />
            )}
          >
            <div onClick={(e) => e.stopPropagation()} data-ds-themes="">
              {themes.map((th) => (
                <CheckRow
                  key={th.key}
                  state={ticked.has(th.key) ? 'on' : 'off'}
                  data-ds-theme={th.key}
                  onToggle={() => setThemes(toggle(ticked, th.key))}
                >
                  <span className="flex-1 truncate">{themeLabel(th.key)}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{th.count}</span>
                </CheckRow>
              ))}
            </div>
          </Popover>
        ) : null}
      </div>

      {/* What is ticked: one pill per category and theme, X to untick it (the gallery's pill for a fully ticked group). */}
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

      <CountRow
        line={t(count.key, count.params)}
        clearLabel={t('filter.clear')}
        onClear={isFiltered(value) ? () => onChange(NO_FILTER) : null}
      />
    </>
  )
}
