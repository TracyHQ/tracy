/**
 * The class list of one My Sites row.
 *
 * Joined from an array on purpose. It used to be a template literal with the optional class
 * written as a leading-space string, and `biome lint --write` (useSortedClasses) trimmed that
 * space: the row read "py-2.5is-openable" and lost its hover and its "Chat" hint (29/09).
 * @param openable - whether a press on the row opens its site.
 * @param current - whether this is the site being managed; tinted at rest like the viewer's own
 *   row in the Team tab (Akemi, 29/09).
 * @returns the classes, separated by single spaces.
 */
export function rowClassName(openable: boolean, current: boolean): string {
  return ['tracy-mysites-row', openable ? 'is-openable' : null, current ? 'bg-foreground/5' : null]
    .filter(Boolean)
    .join(' ')
}
