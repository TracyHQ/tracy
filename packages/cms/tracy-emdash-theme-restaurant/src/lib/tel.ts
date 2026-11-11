/**
 * The `tel:` address of a phone number as an editor types it, in the form RFC 3966 gives: `tel:+<digits>` for a
 * number that starts with `+` (the one place a `+` may stand), `tel:<digits>` otherwise, and an extension (`x23`,
 * `ext. 23`) as `;ext=23`. Spaces, brackets, dots and dashes are dropped, and so is every other `+`. Null when the
 * text holds no digit, so no dead link is printed.
 */
export function telHref(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const ext = /\s*(?:;\s*ext\s*=\s*|(?:ext\.?|extension|x)\s*)(\d+)\s*$/i.exec(text)
  const main = ext ? text.slice(0, ext.index) : text
  const digits = main.replace(/\D/g, '')
  if (!digits) return null
  return `tel:${main.trimStart().startsWith('+') ? '+' : ''}${digits}${ext ? `;ext=${ext[1]}` : ''}`
}
