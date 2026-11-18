// The words this template says itself, English only for now (DECISIONS D17: the other languages of the site-language list read
// English until their tables are added here; a language missing from `UI_WORDS` reads as English, never as a blank).
//
// The stored locale is `en`; the language a visitor reads is the display tag `personalize` wrote (`src/lib/display-locale.ts`).
// Dates are not spelled here: ICU knows how every language writes a month (`uiDate`), and the Gregorian calendar is named so a
// Thai site never prints the Buddhist year. Counts go through `Intl.PluralRules` (`uiCount`).
//
// Pure (no file, no EmDash), so a plain `node --test` holds it.

/** A message that depends on a number: one string per plural category, `other` always present. */
export type Plural = { other: string } & Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>>

export interface UiWords {
  close: string
  menu: string
  primary: string
  pagination: string
  pageOf: string
  home: string
  search: string
  searchButton: string
  searchResultsLine: string
  searchEmpty: string
  pageNotFound: string
  notFoundText: string
  backHome: string
  skipToContent: string
  themeToggle: string
  firstPage: string
  previousPage: string
  previousSlide: string
  nextSlide: string
  nextPage: string
  lastPage: string
  hits: string
  countArticles: string
  countArticlesOne?: string
  noArticles: string
  trending: string
  openMenu: string
  breadcrumb: string
}

/** Every language's words; `en` is complete, a regional table (`pt-pt`) only says what differs from its language. */
export const UI_WORDS: Record<string, Partial<UiWords>> = {
  en: {
    close: 'Close',
    menu: 'Menu',
    primary: 'Primary',
    pagination: 'Pagination',
    pageOf: 'Page {page} of {pages}',
    home: 'Home',
    search: 'Search',
    searchButton: 'Search',
    searchResultsLine: '{count} results for “{query}”',
    searchEmpty: 'No results for “{query}”.',
    pageNotFound: 'Page not found',
    notFoundText: 'An error has occurred while processing your request.',
    backHome: 'Home Page',
    skipToContent: 'Skip to content',
    themeToggle: 'Toggle dark mode',
    firstPage: 'First page',
    previousPage: 'Previous page',
    previousSlide: 'Previous picture',
    nextSlide: 'Next picture',
    nextPage: 'Next page',
    lastPage: 'Last page',
    hits: 'Hits: {count}',
    countArticles: '{count} Articles',
    countArticlesOne: '{count} Article',
    noArticles: 'No articles.',
    trending: 'Trending',
    openMenu: 'Open menu',
    breadcrumb: 'Breadcrumb'
  }
}

const ENGLISH = UI_WORDS.en as UiWords

/** The words for a display tag (`vi-VN`, `zh-TW`, `en`): the exact tag over its language over English. */
export function uiWords(tag: string | null | undefined): UiWords {
  const lower = String(tag ?? 'en').toLowerCase()
  const language = lower.split('-')[0]
  const words = { ...ENGLISH, ...UI_WORDS[language], ...UI_WORDS[lower] } as UiWords
  // English's count-of-one form must not leak into another language
  if (language !== 'en' && !UI_WORDS[language]?.countArticlesOne && !UI_WORDS[lower]?.countArticlesOne)
    delete words.countArticlesOne
  return words
}

/** `{name}` placeholders filled; an unknown one is left as written. */
export function fillWords(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`))
}

/** A counted message in the tag's plural form, `{count}` and any other placeholder filled. */
export function uiCount(
  tag: string | null | undefined,
  message: Plural,
  count: number,
  values: Record<string, string | number> = {}
): string {
  let form: string = 'other'
  try {
    form = new Intl.PluralRules(String(tag ?? 'en')).select(count)
  } catch {
    // a tag ICU does not know: the general form
  }
  const text = (message as Record<string, string | undefined>)[form] ?? message.other
  return fillWords(text, { ...values, count })
}

/** A date in the tag's own words (Gregorian, UTC, as stored); '' for a date that is not one. */
export function uiDate(
  tag: string | null | undefined,
  date: Date | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!date || Number.isNaN(date.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = { ...options, timeZone: 'UTC' }
  try {
    return new Intl.DateTimeFormat(`${String(tag ?? 'en')}-u-ca-gregory`, opts).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-u-ca-gregory', opts).format(date)
  }
}

/** Whether a tag is English, the language the template's own date shapes are written for. */
export function isEnglish(tag: string | null | undefined): boolean {
  return (
    String(tag ?? 'en')
      .toLowerCase()
      .split('-')[0] === 'en'
  )
}
