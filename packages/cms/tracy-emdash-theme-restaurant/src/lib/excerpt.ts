/**
 * A list excerpt cut at the last whole word that fits `max` characters, then `...` (never in the middle of a word).
 * A text with no space before the limit (one long word) is just the ellipsis, as the source does: Joomla's
 * `string.truncate` with `noSplit` returns `...` when the first `max` characters hold no space.
 */
export function cutAtWord(text: string, max = 95): string {
  if (text.length <= max) return text
  const at = text.lastIndexOf(' ', max)
  return at > 0 ? `${text.slice(0, at).trimEnd()}...` : '...'
}
