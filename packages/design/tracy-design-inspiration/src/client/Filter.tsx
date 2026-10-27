/**
 * The library's toolbar: search is search, filter is filter, side by side above the grid (Akemi,
 * 15/09/2026; option A of three drawn on the bench — `Mockups/Library toolbar`, deleted once this
 * shipped). This replaces the one-box picker of 06/09 ("two searches — drop the outer one", Lee):
 * that picker put the search inside the category menu, so finding a name meant opening a menu and
 * ticking the match, and the dashed "Your brand" chip beside it duplicated the Add site card the
 * first-run page already shows in the middle.
 *
 * - The search box narrows the grid by NAME as the person types — a brand, a reference, one of
 *   OpenDesign's 152. Substring match: "app" must not surface "Professional & Corporate".
 * - The Categories button opens the tree: OpenDesign's 22 categories folded into five groups
 *   (`groups.mjs`), each parent listing its members with counts. MEMBERS are the state: ticking a
 *   parent ticks every member, a parent with some members ticked shows the part state. Ticked
 *   categories narrow the grid; the typed text narrows it further (AND).
 * - What is ticked shows under the row: a fully ticked parent as a pill, a partly ticked one as its
 *   name with the ticked members as bare words. A picked inspiration (`picked`, kept for the URL
 *   and the public page) still shows as its own pill.
 * - "Your brand" is a group like any other once the site has a brand inspiration. While it has
 *   none, the group is simply absent — no placeholder row, no chip: the way to add a site is the
 *   card in the middle of the page and the Add site tab.
 *
 * 🔒 The panel is `@tracy/core`'s Popover, NOT `@tracy/ui`'s: dsh's page runs React 18, which drops
 * the ref base UI hands a `render={<Button/>}`, and the menu opens invisible at (0,0) (measured on
 * the lucaswp lane 06/09). That Popover closes on ANY click inside its panel, which is right for a
 * menu and wrong for a picker where a person ticks five things — so the content stops the click
 * before it reaches the panel. Escape and a click outside still close it.
 *
 * 🔒 The tick is a `span`, not `@tracy/ui`'s Checkbox: that one has no drawing for the part state.
 */
import { type ReactNode, type JSX, useMemo } from 'react'
import { Popover } from '@tracy/core/site-tabs'
import { Badge, Button, cn } from '@tracy/ui'
import { Loader2, Users, X } from 'lucide-react'

import { CategoriesButton, CheckRow, CountRow, SearchField } from './FilterParts'
import { PlatformLogo } from './PlatformLogo'
import { onPlatforms, PLATFORMS, platformCounts } from './platforms.mjs'

import type { Inspiration } from './api'
import {
  GROUPS,
  type Group,
  categoryLabel,
  COMMUNITY_CATEGORY,
  OWN_CATEGORY,
  stateOf,
  toggle,
  toggleGroup
} from './groups.mjs'
import type { Key, Translate } from './strings'

/** The plugin's root class — the portalled panel carries it to keep the scoped reset. */
const SCOPE = 'tracy-design-inspiration'

export interface Selection {
  /** Ticked categories — members of the groups, by the catalog's own `category` string. */
  ticked: ReadonlySet<string>
  /** Inspirations picked by name, by id. */
  picked: ReadonlySet<string>
  /** Chosen CMS chips (`platforms.mjs`), by id. A separate axis: it narrows what the rest lets through. */
  platforms: ReadonlySet<string>
}

export const NOTHING: Selection = { ticked: new Set(), picked: new Set(), platforms: new Set() }

/**
 * The inspirations a selection lets through: all when nothing is chosen, else the OR of both sets —
 * and, when a name is typed, only those whose name (or id) contains it. Substring, case-folded.
 * A ticked box matches a category OR a publisher, so the publisher tabs filter the same way.
 * The CMS chips are ANDed on top: "Business, on WordPress" is Business cards that run on WordPress,
 * not every Business card plus every WordPress one. Between chips it is OR (`onPlatforms`).
 */
export function select(inspirations: Inspiration[], s: Selection, query = ''): Inspiration[] {
  const q = query.trim().toLowerCase()
  const byName = inspirations.filter(
    (d) => (q === '' || d.name.toLowerCase().includes(q) || d.id.includes(q)) && onPlatforms(d, s.platforms)
  )
  if (s.ticked.size === 0 && s.picked.size === 0) return byName
  return byName.filter(
    (d) =>
      s.ticked.has(d.category) || (d.provider !== undefined && s.ticked.has(d.provider)) || s.picked.has(d.id)
  )
}

export function Filter({
  inspirations,
  value,
  onChange,
  query,
  onQuery,
  shown,
  trailing = null,
  community = null,
  t
}: {
  inspirations: Inspiration[]
  value: Selection
  onChange: (next: Selection) => void
  /** The typed name; the gallery owns it so `select` can apply it to the grid. */
  query: string
  onQuery: (next: string) => void
  /** How many cards the grid shows, for the count line. */
  shown: number
  /** Extra chips on the count row, after Clear (the gallery's "Closest to your brand"). */
  trailing?: ReactNode
  /**
   * The public page's shortcut to the Community category (ADR 0013 §6): the same tick the picker
   * sets, reachable in one press — it calls `setTicked`, nothing else, so there is exactly one
   * action and two ways to reach it. `busy` is the page fetching the shelf that tick asked for.
   * The lane has no shelf and passes null, so no button is drawn there.
   */
  community?: { busy: boolean } | null
  t: Translate
}): JSX.Element {
  const { ticked, picked } = value

  const countOf = useMemo(() => {
    // A member is a category string, or — for the Provider group — a provider string; the two
    // vocabularies do not overlap (`groups.mjs`), so one map counts both.
    const m = new Map<string, number>()
    for (const d of inspirations) {
      m.set(d.category, (m.get(d.category) ?? 0) + 1)
      if (d.provider !== undefined) m.set(d.provider, (m.get(d.provider) ?? 0) + 1)
    }
    return (c: string): number => m.get(c) ?? 0
  }, [inspirations])
  const groupCount = (g: Group): number => g.members.reduce((n, m) => n + countOf(m), 0)
  const label = (g: Group): string => t(`group.${g.id}` as Key)
  const nameOf = (id: string): string => inspirations.find((d) => d.id === id)?.name ?? id

  // One per parent fully on, else one per ticked member; plus picked inspirations.
  const chosenCount =
    GROUPS.reduce(
      (n, g) => n + (stateOf(g, ticked) === 'on' ? 1 : g.members.filter((m) => ticked.has(m)).length),
      0
    ) + picked.size

  // The placeholder's example: a name everyone knows, else the first inspiration that is not the brand.
  const exampleBrand =
    inspirations.find((d) => d.name === 'Airbnb') ?? inspirations.find((d) => d.category !== OWN_CATEGORY)

  const setTicked = (next: Set<string>): void => onChange({ ...value, ticked: next })
  const setPicked = (next: Set<string>): void => onChange({ ...value, picked: next })
  const setPlatforms = (next: Set<string>): void => onChange({ ...value, platforms: next })

  // Counted over the whole list, not what the other filters leave: a chip says how many templates
  // exist on that CMS, and a number that shrank as a category was ticked would read as a different fact.
  const perPlatform = useMemo(() => platformCounts(inspirations), [inspirations])
  // The chips appear once any card names a CMS — the template list does; the design-system library
  // alone does not, and three chips reading 0 would only say "nothing to filter here".
  const hasPlatforms = useMemo(() => [...perPlatform.values()].some((n) => n > 0), [perPlatform])

  return (
    <>
      {/* The CMS chips (Akemi, 29/09): each with its logo and how many templates run on it; several
          may be on at once. A chip whose CMS has no template yet stays, greyed, so the row keeps its
          shape and says "none yet" rather than hiding a CMS Tracy supports. */}
      {hasPlatforms ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('filter.platforms')}>
          {PLATFORMS.map((p) => {
            const n = perPlatform.get(p.id) ?? 0
            const on = value.platforms.has(p.id)
            return (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                aria-pressed={on}
                disabled={n === 0 && !on}
                onClick={() => setPlatforms(toggle(value.platforms, p.id))}
                className={cn(
                  // No colour transition: the border must light on the press, like a native toggle.
                  // Measured 29/09 on local with the 28 templates: the 150 ms fade over a grid of
                  // 2880-px shots stalled the frame; without it the press paints in ~20 ms.
                  'h-8 gap-1.5 rounded-full pr-2 pl-2.5 transition-none',
                  // Chosen = one 1px terracotta line, no halo (Akemi's UI rule, 29/09).
                  on && 'border-ring bg-primary/10 hover:bg-primary/15 dark:border-ring dark:bg-primary/15'
                )}
              >
                <PlatformLogo id={p.id} className="size-4" />
                {p.label}
                <span className="rounded-full bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">
                  {n}
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}
      {/* One row: search takes the width, Categories sits at its right end (option A). */}
      <div className="flex items-center gap-2">
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder={
            exampleBrand ? t('filter.search', { brand: exampleBrand.name }) : t('filter.searchPlain')
          }
          label={t('filter.searchPlain')}
        />
        <Popover
          scopeClass={SCOPE}
          className="max-h-96 w-80 p-0"
          trigger={(props) => (
            <CategoriesButton props={props} label={t('filter.categories')} chosen={chosenCount} />
          )}
        >
          {/* Stops the panel's own close-on-click: see the header. The rows are menuitemcheckbox
              buttons (`CheckRow`), so the Popover's menu keyboard walks them. */}
          <div onClick={(e) => e.stopPropagation()} data-categories="">
            {GROUPS.map((g) => {
              const n = groupCount(g)
              // A group nobody has (the brand before a site is added) is not a row.
              if (n === 0) return null
              return (
                <div key={g.id} role="group" aria-label={label(g)} className="p-1">
                  <CheckRow state={stateOf(g, ticked)} onToggle={() => setTicked(toggleGroup(g, ticked))}>
                    <span className="flex-1 truncate font-medium">{label(g)}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{n}</span>
                  </CheckRow>
                  {g.members
                    // The brand group's own category IS its parent row; a member nobody has is not a row.
                    .filter((m) => m !== OWN_CATEGORY && countOf(m) > 0)
                    .sort((x, y) => countOf(y) - countOf(x))
                    .map((m) => (
                      <CheckRow
                        key={m}
                        state={ticked.has(m) ? 'on' : 'off'}
                        small
                        onToggle={() => setTicked(toggle(ticked, m))}
                        className="tdi-indent py-1 text-xs"
                      >
                        <span className="flex-1 truncate">{categoryLabel(t, m)}</span>
                        <span className="text-muted-foreground tabular-nums">{countOf(m)}</span>
                      </CheckRow>
                    ))}
                </div>
              )
            })}
          </div>
        </Popover>
        {community ? (
          <Button
            type="button"
            variant={ticked.has(COMMUNITY_CATEGORY) ? 'default' : 'outline'}
            className="h-9 shrink-0 gap-1.5"
            aria-pressed={ticked.has(COMMUNITY_CATEGORY)}
            onClick={() => setTicked(toggle(ticked, COMMUNITY_CATEGORY))}
          >
            {community.busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Users
                size={14}
                className={ticked.has(COMMUNITY_CATEGORY) ? undefined : 'text-muted-foreground'}
              />
            )}
            {t('filter.fromCommunity')}
          </Button>
        ) : null}
      </div>

      {/* What is ticked. */}
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {chosenCount > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 text-xs">
            {[...picked].map((id) => (
              <Badge
                key={id}
                variant="secondary"
                className="cursor-pointer gap-1 font-normal"
                onClick={() => setPicked(toggle(picked, id))}
              >
                {nameOf(id)}
                <X size={12} className="opacity-70" />
              </Badge>
            ))}
            {GROUPS.filter((g) => stateOf(g, ticked) !== 'off').map((g) => (
              <span key={g.id} className="inline-flex items-center gap-2">
                {stateOf(g, ticked) === 'on' ? (
                  <Badge
                    className="cursor-pointer gap-1 font-normal"
                    onClick={() => setTicked(toggleGroup(g, ticked))}
                  >
                    {label(g)}
                    <X size={12} className="opacity-70" />
                  </Badge>
                ) : (
                  <span className="text-muted-foreground/70">{label(g)}:</span>
                )}
                {(stateOf(g, ticked) === 'on' ? [] : g.members.filter((m) => ticked.has(m))).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTicked(toggle(ticked, m))}
                    className="inline-flex items-center gap-0.5 font-medium underline underline-offset-4 hover:text-muted-foreground"
                  >
                    {categoryLabel(t, m)}
                    <X size={11} className="opacity-60" />
                  </button>
                ))}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <CountRow
        line={
          shown === inspirations.length
            ? t('filter.countAll', { total: inspirations.length })
            : t('filter.count', { shown, total: inspirations.length })
        }
        clearLabel={t('filter.clear')}
        onClear={
          chosenCount > 0 || query !== '' || value.platforms.size > 0
            ? () => {
                onChange(NOTHING)
                onQuery('')
              }
            : null
        }
      >
        {trailing}
      </CountRow>
    </>
  )
}
