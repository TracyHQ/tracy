/**
 * The Site language question of the "Customize your site" sheet: ONE language (U10 of TracyHQ/tch#1013, approved
 * canvas `11-sheet-review-canvas.html`, `fLang`). Every template is built in one language this round (D10), so the
 * control is a select: the box shows the language picked; focus opens the full list, typing filters it, the picked
 * one wears a tick, and a pick replaces the language and closes the list.
 *
 * Not `LanguageBox` of `@tracy/site-build-core`: that one holds several languages as pills under a shortlist, and folds
 * regional variants into one row (English UK and US are one row there). Here every language the server offers is its
 * own row, English UK and US included.
 *
 * 🔒 NO LANGUAGE NAME IS TYPED HERE. The names come from the browser (`Intl.DisplayNames`), in English as on the
 * canvas; the search also knows each language's own name and its code, so "deutsch", "Deutsch", "german" and "de"
 * all find German.
 */
import { Check, ChevronDown } from 'lucide-react'
import { type FocusEvent, type JSX, type KeyboardEvent, useMemo, useRef, useState } from 'react'

/** A language tag as `Intl` spells it: `en-gb` → `en-GB`, `zh-tw` → `zh-TW`. */
const tagOf = (code: string) =>
  code.replace(
    /^([a-z]{2,3})-([a-z]{2,4})$/i,
    (_, l: string, r: string) => `${l.toLowerCase()}-${r.toUpperCase()}`
  )

function nameIn(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }).of(tagOf(code)) ?? ''
  } catch {
    return ''
  }
}

interface Row {
  code: string
  name: string
  search: string
}

export interface LanguageSelectProps {
  /** The codes the server offers, in its order. */
  options: string[]
  value: string | undefined
  onChange: (code: string) => void
  /** The id of the element naming the question. */
  labelledBy: string
  placeholder: string
  /** Said in the list when nothing matches what was typed. */
  noMatch: string
}

export function LanguageSelect({
  options,
  value,
  onChange,
  labelledBy,
  placeholder,
  noMatch
}: LanguageSelectProps): JSX.Element {
  const rows = useMemo<Row[]>(
    () =>
      options.map((code) => {
        // A region is named only when the list offers that language twice (British and American English);
        // otherwise the language alone: "Vietnamese", not "Vietnamese (Vietnam)".
        const base = code.split('-')[0]
        const twice = options.some((other) => other !== code && other.split('-')[0] === base)
        const name = nameIn('en', twice ? code : base) || code
        return { code, name, search: `${name} ${nameIn(code, code)} ${code}`.toLowerCase() }
      }),
    [options]
  )
  const current = rows.find((row) => row.code === value)
  const [open, setOpen] = useState(false)
  // What is typed while the list is open; null shows the picked language's name.
  const [query, setQuery] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = `${labelledBy}-languages`

  const term = (query ?? '').trim().toLowerCase()
  const shown =
    term === '' ? rows : rows.filter((row) => row.search.includes(term) || row.code.startsWith(term))

  const close = () => {
    setOpen(false)
    setQuery(null)
  }
  const pick = (code: string) => {
    onChange(code)
    close()
    input.current?.focus()
  }
  const optionsOf = () => [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      // The list closes; the sheet around it stays (it reads defaultPrevented).
      event.preventDefault()
      event.stopPropagation()
      close()
      input.current?.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      const all = optionsOf()
      const at = all.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown' ? Math.min(at + 1, all.length - 1) : at - 1
      if (next < 0) input.current?.focus()
      else all[next]?.focus()
    } else if (event.key === 'Enter' && event.target === input.current && open && shown[0]) {
      event.preventDefault()
      pick(shown[0].code)
    }
  }
  // Focus leaving the box and its list closes the list and shows the picked language again.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!box.current?.contains(event.relatedTarget as Node | null)) close()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the combobox and its list inside.
    <div ref={box} className="tas-lsel" data-open={open ? '1' : '0'} onKeyDown={onKeyDown} onBlur={onBlur}>
      <input
        ref={input}
        role="combobox"
        aria-labelledby={labelledBy}
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className="tas-lsel-input"
        placeholder={placeholder}
        value={query ?? current?.name ?? ''}
        onFocus={(event) => {
          setOpen(true)
          event.target.select()
        }}
        onClick={(event) => {
          setOpen(true)
          // The box already focused (a pick hands focus back): select the shown name, so typing
          // starts a new search instead of appending to it ("Vietnamesegerman", 13/10/2026).
          if (query === null) event.currentTarget.select()
        }}
        onChange={(event) => {
          setOpen(true)
          setQuery(event.target.value)
        }}
      />
      <ChevronDown aria-hidden="true" className="tas-lsel-chev" />
      {open ? (
        <div
          className="tas-lsel-drop"
          role="listbox"
          id={listId}
          aria-labelledby={labelledBy}
          // A press on a row keeps the focus in the box (Safari gives a pressed button none), so the list stays open
          // until the row's click has picked.
          onMouseDown={(event) => event.preventDefault()}
        >
          {shown.length > 0 ? (
            shown.map((row) => {
              const on = row.code === value
              return (
                <button
                  key={row.code}
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-language={row.code}
                  className="tas-lsel-opt"
                  onClick={() => pick(row.code)}
                >
                  <span>{row.name}</span>
                  {on ? <Check aria-hidden="true" /> : null}
                </button>
              )
            })
          ) : (
            <div className="tas-lsel-none">{noMatch}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
