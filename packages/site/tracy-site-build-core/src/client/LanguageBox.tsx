/**
 * The site-language field: chips for what is chosen, a picker below, and the language detected in
 * what the customer typed offered first.
 *
 * Shaped on the bench as `Mockups/Fork a site` (Lee, 06/09 21:1x) and REWRITTEN here rather than
 * copied — the bench is mode A and this is mode B, and `DESIGN.md` §0 forbids carrying one across.
 * Three of its rules came out of that evening and are load-bearing:
 *
 *   - The last chip has no ×. A site with no language is not a site.
 *   - Six common languages, then one "+N more" — a list of seventy is a list nobody reads. A search
 *     query shows everything that matches, because the query already narrowed it.
 *   - The detected language is offered ABOVE the shortlist, not sorted into it.
 *
 * 🔒 NO LANGUAGE NAME IS TYPED IN THIS FILE. `Intl.DisplayNames` gives the names from the browser:
 * the chip shows the English name alone ("Vietnamese"), and the search also knows the native name
 * and the code, so "russian", "Русский" and "ru" all find the same row and nothing here needs
 * translating. The interface languages of `@tracy/i18n` are a different, three-item list
 * and stay out of this.
 *
 * The rows, their names and the shortlist order live in `languages.mjs`, where `node --test`
 * reaches them; this file only draws.
 */
import { type JSX, useState } from 'react'
import { X } from 'lucide-react'

import type { Translate } from './strings'

import { baseOf, languageLabel as label, rowsFor } from './languages.mjs'

/**
 * Which language the customer is writing in. A toy on purpose — the script decides, and that is
 * enough to make the right chip the first one offered.
 *
 * Kana decides Japanese, Hangul decides Korean, and Han characters ALONE are Chinese: a Chinese
 * brief came out as Japanese on 06/09 because the Han test ran first.
 */
function detect(text: string): string | null {
  if (
    /[\u0103\u00e2\u0111\u00ea\u00f4\u01a1\u01b0\u00e0\u1ea3\u00e3\u00e1\u1ea1\u1eb1\u1eb3\u1eb5\u1eaf\u1eb7\u1ea7\u1ea9\u1eab\u1ea5\u1ead\u00e8\u1ebb\u1ebd\u00e9\u1eb9\u1ec1\u1ec3\u1ec5\u1ebf\u1ec7\u00ec\u1ec9\u0129\u00ed\u1ecb\u00f2\u1ecf\u00f5\u00f3\u1ecd\u1ed3\u1ed5\u1ed7\u1ed1\u1ed9\u1edd\u1edf\u1ee1\u1edb\u1ee3\u00f9\u1ee7\u0169\u00fa\u1ee5\u1eeb\u1eed\u1eef\u1ee9\u1ef1\u1ef3\u1ef7\u1ef9\u00fd\u1ef5]/i.test(
      text
    )
  )
    return 'vi'
  if (/[\u3041-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
  if (/[\uac00-\ud7a3]/.test(text)) return 'ko'
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  return null
}

/** How many sit above the "+N more" fold. */
const COMMON = 6

export function LanguageBox({
  typed,
  picked,
  allowedLanguages,
  single = false,
  placeholder,
  onChange,
  t
}: {
  /** What the customer has written so far — the picker offers the language it detects in it first. */
  typed: string
  picked: string[]
  allowedLanguages?: readonly string[]
  /** One language only (a quickstart with no second edition): choosing one replaces the other. */
  single?: boolean
  /** The search box's own words, for a caller that starts with no language chosen ("Add another…" would be wrong there). */
  placeholder?: string
  onChange: (next: string[]) => void
  t: Translate
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const q = query.trim().toLowerCase()
  const detectedBase = detect(typed)
  const rows = rowsFor(allowedLanguages, picked)
  const options = rows.filter((l) => !picked.includes(l.code)).filter((l) => q === '' || l.search.includes(q))
  // The script says `vi`; the offer may spell it `vi-vn`. Offer the first row with that base.
  const first =
    detectedBase && !picked.some((c) => baseOf(c) === detectedBase)
      ? options.find((l) => baseOf(l.code) === detectedBase)
      : undefined
  const rest = options.filter((l) => l !== first)
  const shown = q !== '' || expanded ? rest : rest.slice(0, COMMON)
  const hidden = rest.length - shown.length

  const add = (code: string) => {
    onChange(single ? [code] : [...picked, code])
    setQuery('')
    setExpanded(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring">
        {picked.map((code) => {
          const name = rows.find((l) => l.code === code)?.label ?? label(code)
          return (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm"
            >
              {name}
              {picked.length > 1 ? (
                <button
                  type="button"
                  aria-label={t('lang.remove', { language: name })}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(picked.filter((c) => c !== code))}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          )
        })}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          // One language only: picking replaces, so "add another" would promise a second one.
          placeholder={placeholder ?? t(single ? 'lang.change' : 'lang.add')}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          {first ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('lang.detected')}</span>
              <button
                type="button"
                className="rounded-md border border-primary bg-primary/10 px-2 py-1 font-medium"
                onClick={() => add(first.code)}
              >
                {first.label}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-sm">
            {shown.map((l) => (
              <button
                key={l.code}
                type="button"
                className="rounded-md border border-border px-2 py-1"
                onClick={() => add(l.code)}
              >
                {l.label}
              </button>
            ))}
            {hidden > 0 ? (
              <button
                type="button"
                className="rounded-md border border-border border-dashed px-2 py-1 text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                {t('lang.more', { count: hidden })}
              </button>
            ) : null}
            {rest.length === 0 && !first ? (
              <span className="text-muted-foreground">{t('lang.none')}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
