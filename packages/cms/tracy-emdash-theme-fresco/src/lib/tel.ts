/**
 * The `tel:` address of a phone number as an editor types it, in the form RFC 3966 gives: `tel:+<digits>` for a
 * number that starts with `+` (the one place a `+` may stand), `tel:<digits>` otherwise, and an extension (`x23`,
 * `ext. 23`) as `;ext=23`. Spaces, brackets, dots and dashes are dropped, and so is every other `+`. Null when the
 * text holds no digit, so no dead link is printed. Words before the number (the `M. ` and `P. ` of the footer's
 * phone lines) are no part of it: the number starts at its first `+` or digit, so `M. +201 …` keeps its `+`.
 */
export function telHref(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const ext = /\s*(?:;\s*ext\s*=\s*|(?:ext\.?|extension|x)\s*)(\d+)\s*$/i.exec(text)
  const whole = ext ? text.slice(0, ext.index) : text
  const main = whole.slice(Math.max(whole.search(/[+\d]/), 0))
  const digits = main.replace(/\D/g, '')
  if (!digits) return null
  return `tel:${main.startsWith('+') ? '+' : ''}${digits}${ext ? `;ext=${ext[1]}` : ''}`
}
