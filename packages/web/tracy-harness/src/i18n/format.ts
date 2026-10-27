/**
 * Numbers, dates and times in the language on screen (`.ts` without JSX: loads under plain `node --test`).
 * Like `tr()`, the imperative functions read the active language and follow a change only when called
 * during a render of a component using `useT`/`useLanguage`/`useFormat`. Formatters are cached.
 * English dates are day-month-year (`en-GB`) across /ops; English numbers group with commas (`en`).
 */
import { htmlLang } from '@tracy/core/interface-languages/resolve'
import { useMemo } from 'react'

import { activeLanguage, useLanguage } from './react.ts'

export type DateInput = Date | string | number
export type DateStyle = 'short' | 'medium' | 'long'
export interface FormatOptions {
  /** A language id; defaults to the one on screen. */
  lang?: string
  /** An IANA zone; defaults to the reader's. */
  timeZone?: string
}

const numbers = new Map<string, Intl.NumberFormat>()
const dates = new Map<string, Intl.DateTimeFormat>()

/** The BCP 47 tag for numbers in a language id (`zh` is `zh-CN`). */
export function numberLocale(lang: string = activeLanguage()): string {
  return htmlLang(lang)
}

/** The tag for dates and times: English reads day-month-year, so it takes `en-GB`. */
export function dateLocale(lang: string = activeLanguage()): string {
  return lang === 'en' ? 'en-GB' : htmlLang(lang)
}

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`
  let cached = numbers.get(key)
  if (!cached) numbers.set(key, (cached = new Intl.NumberFormat(locale, options)))
  return cached
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let cached = dates.get(key)
  if (!cached) dates.set(key, (cached = new Intl.DateTimeFormat(locale, options)))
  return cached
}

/** A number with the language's grouping and decimal marks. */
export function formatNumber(n: number, options?: Intl.NumberFormatOptions, lang?: string): string {
  return numberFormat(numberLocale(lang), options).format(n)
}

/** `digits` fixed decimals, ungrouped (a measurement or a price: `1234.5`, `1234,5` in German). */
export function formatFixed(n: number, digits: number, lang?: string): string {
  return formatNumber(
    n,
    { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false },
    lang
  )
}

/** A date or time with explicit `Intl` options, in the language on screen. */
export function formatWith(date: DateInput, options: Intl.DateTimeFormatOptions, lang?: string): string {
  return dateFormat(dateLocale(lang), options).format(new Date(date))
}

export function formatDate(date: DateInput, style: DateStyle = 'medium', o: FormatOptions = {}): string {
  return formatWith(date, { dateStyle: style, ...(o.timeZone && { timeZone: o.timeZone }) }, o.lang)
}

export function formatTime(date: DateInput, style: DateStyle = 'short', o: FormatOptions = {}): string {
  return formatWith(date, { timeStyle: style, ...(o.timeZone && { timeZone: o.timeZone }) }, o.lang)
}

export function formatDateTime(date: DateInput, style: DateStyle = 'medium', o: FormatOptions = {}): string {
  return formatWith(
    date,
    {
      dateStyle: style,
      timeStyle: style === 'long' ? 'medium' : 'short',
      ...(o.timeZone && { timeZone: o.timeZone })
    },
    o.lang
  )
}

/** The formatters bound to the language on screen; re-renders the component when it changes. */
export function useFormat() {
  const { lang } = useLanguage()
  return useMemo(
    () => ({
      lang,
      numberLocale: numberLocale(lang),
      dateLocale: dateLocale(lang),
      number: (n: number, options?: Intl.NumberFormatOptions) => formatNumber(n, options, lang),
      fixed: (n: number, digits: number) => formatFixed(n, digits, lang),
      date: (d: DateInput, style?: DateStyle, o?: FormatOptions) => formatDate(d, style, { ...o, lang }),
      time: (d: DateInput, style?: DateStyle, o?: FormatOptions) => formatTime(d, style, { ...o, lang }),
      dateTime: (d: DateInput, style?: DateStyle, o?: FormatOptions) =>
        formatDateTime(d, style, { ...o, lang }),
      with: (d: DateInput, options: Intl.DateTimeFormatOptions) => formatWith(d, options, lang)
    }),
    [lang]
  )
}
