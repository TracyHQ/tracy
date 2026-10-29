/** A figure as the site's language prints numbers: 12,400 in English, 12.400 in German. Pure. */
export function numberIn(amount, locale) {
  try {
    return new Intl.NumberFormat(locale || 'en').format(amount)
  } catch {
    return new Intl.NumberFormat('en').format(amount)
  }
}
