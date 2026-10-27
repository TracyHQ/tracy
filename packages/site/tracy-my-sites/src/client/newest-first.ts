/**
 * My Sites lists the newest site first (Akemi, 29/09), by the `createdAt` `/api/sites` hands over.
 *
 * A row without a readable time goes to the end, in the order it arrived: a site whose age is
 * unknown must not jump above the one made a minute ago. Returns a copy; the list the tab holds in
 * state is never reordered in place.
 * @param rows - the sites as the door answered them.
 * @returns the same rows, newest first.
 */
export function newestFirst<T extends { createdAt?: string | null }>(rows: readonly T[]): T[] {
  const at = (row: T): number => {
    const time = row.createdAt ? Date.parse(row.createdAt) : Number.NaN
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
  }
  return rows
    .map((row, index) => ({ row, index, time: at(row) }))
    .sort((a, b) => (a.time === b.time ? a.index - b.index : b.time - a.time))
    .map(({ row }) => row)
}
