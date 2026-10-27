/**
 * The site-language field, shared by two mockups — `Mockups/Fork a site` (where it was shaped,
 * 06/09) and `Mockups/Site question` (08/09: "bring it over and use it").
 *
 * IT LIVES IN ITS OWN FILE RATHER THAN BEING COPIED. A copy would be a second version of a field
 * that already took an evening of edits to settle — the shortlist order, the last chip that
 * cannot be removed, the detected language offered first — and the two would drift on the day
 * nobody is looking. Same rule the bench applies to product screens, applied to a drawing.
 *
 * Not a `.stories.tsx`: Storybook reads every named export of a story file as a story, so a shared
 * component in one would show up as a broken entry in the sidebar.
 */
import { Label } from '@tracy/ui'
import { X } from 'lucide-react'
import { useState } from 'react'

/**
 * A mock of the language row: English always on; "More" opens the picker; the picker first suggests
 * the language it detects in what the customer typed (name + the line about the business), then a
 * search. Detection here is a toy (Vietnamese diacritics → Vietnamese); the real one is a script.
 */
/** `<native name> · <English name>`, both from the browser — no language name is typed here. */
function nativeLabel(code: string): string {
  const native = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  const english = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  return `${native} · ${english}`
}

function detectLanguage(text: string): { code: string; label: string } | null {
  if (/[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i.test(text)) {
    return { code: 'vi', label: nativeLabel('vi') }
  }
  // Kana decides Japanese; Hangul decides Korean; Han characters alone are Chinese (06/09 —
  // a Chinese brief came out as Japanese). The real port uses a proper detector, not these three tests.
  if (/[ぁ-ゟ゠-ヿ]/.test(text)) return { code: 'ja', label: nativeLabel('ja') }
  if (/[가-힣]/.test(text)) return { code: 'ko', label: nativeLabel('ko') }
  if (/[一-鿿]/.test(text)) return { code: 'zh', label: nativeLabel('zh') }
  return null
}

/**
 * Site languages: ISO 639-1 codes, named by the browser itself (`Intl.DisplayNames`) — the native
 * name first, the English name after it, so "russian", "Русский" and "ru" all find the same row.
 * The interface languages in `@tracy/i18n` are a different, three-item list and stay out of this.
 */
const LANGUAGE_CODES =
  // Order matters: after English, the first six are the shortlist the picker opens with (Chinese,
  // Spanish, French, German, Japanese, Portuguese — Vietnamese is not a shortlist language).
  'en zh es fr de ja pt ko ru ar hi it nl id ms th tr pl sv da fi no cs sk hu ro bg el uk he fa ur bn ta te ml kn mr gu pa si my km lo ne tl sw af zu am ha yo ig et lv lt sl hr sr bs mk sq ca eu gl is ga cy mt lb vi'.split(
    ' '
  )
const nativeNames = new Intl.DisplayNames(LANGUAGE_CODES, { type: 'language' })
const englishNames = new Intl.DisplayNames(['en'], { type: 'language' })
const LANGUAGES = LANGUAGE_CODES.map((code) => {
  let native = code
  try {
    native = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  } catch {
    native = nativeNames.of(code) ?? code
  }
  const english = englishNames.of(code) ?? code
  return { code, label: native === english ? english : `${native} · ${english}` }
})

/**
 * The language field as a multi-select box (06/09): every chosen language is a chip with
 * a ×, English included; typing in the box searches; the list below opens on focus and offers the
 * language detected in the customer's text first.
 */
export function LanguageBox({
  typed,
  picked,
  setPicked,
  label = 'Site language'
}: {
  /** What the customer has written so far — the picker offers the language it detects in it first. */
  typed: string
  picked: string[]
  setPicked: (next: string[] | ((p: string[]) => string[])) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const detected = detectLanguage(typed)
  const q = query.trim().toLowerCase()
  const options = LANGUAGES.filter((l) => !picked.includes(l.code)).filter(
    (l) => q === '' || l.label.toLowerCase().includes(q) || l.code.startsWith(q)
  )
  const first =
    detected && !picked.includes(detected.code) ? options.find((l) => l.code === detected.code) : undefined
  const rest = options.filter((l) => l !== first)
  // Six common languages first; the rest sit behind one "+N more" chip (06/09) — a
  // search query shows everything that matches, since the query already narrowed the list.
  const COMMON = 6
  const shown = q !== '' || expanded ? rest : rest.slice(0, COMMON)
  const hidden = rest.length - shown.length
  const add = (code: string) => {
    setPicked((p) => [...p, code])
    setQuery('')
    setExpanded(false)
  }
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring">
        {picked.map((code) => {
          const l = LANGUAGES.find((x) => x.code === code)
          return (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm"
            >
              {l?.label ?? code}
              {/* The last language stays: a site with no language is not a site (06/09). */}
              {picked.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove ${l?.label ?? code}`}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setPicked((p) => p.filter((c) => c !== code))}
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
          placeholder="Add another…"
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          {first ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Looks like your text is in</span>
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
                className="rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                +{hidden} more
              </button>
            ) : null}
            {rest.length === 0 && !first ? <span className="text-muted-foreground">No match.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
