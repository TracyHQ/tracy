/**
 * The unread count as the left column shows it: hidden at 0, the number up to 9, then "9+".
 * A count the server did not give (NaN, negative) is no count at all.
 * @param count - unread notifications.
 * @returns the badge text, or null when no badge is drawn.
 */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 9 ? '9+' : String(Math.floor(count))
}
