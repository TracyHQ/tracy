import { useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export interface LanguageOption {
  code: string
  name: string
  url: string
  current: boolean
}

/**
 * The list length at which the flat menu becomes a dialog. Same number as the Joomla template
 * (`html/mod_languages/tb.php`): up to 8 a bilingual or handful-of-languages site sees exactly
 * the dropdown it always had; from 9 the anchored panel is the wrong container, because it is a
 * wide box inside a page whose ancestors (transform, overflow, z-index) we do not control. A
 * modal renders in the top layer, outside all of them.
 */
const MODAL_FROM = 9

/**
 * A language tag's flag, derived — never hand-listed.
 *
 * 🔒 A LANGUAGE IS NOT A COUNTRY, and this file has now been wrong in both directions. The source
 * drew EN and RU inline and gave everything else the Union Jack: at forty locales that was
 * thirty-six British flags beside Afrikaans, "日本語" and "ქართული". The tile-with-a-code that replaced
 * it on 22/09 was honest but lopsided — four rows carried a flag and thirty-six carried grey.
 *
 * So ask CLDR instead of a maintainer. `new Intl.Locale(tag).maximize()` is the Unicode
 * add-likely-subtags algorithm: it answers the question "when someone says only `ka`, which
 * script and region do they mean?" with CLDR's own data (`ka` → `ka-Geor-GE`, `lo` → `lo-Laoo-LA`,
 * `nb` → `nb-Latn-NO`). The region is two ASCII letters, and two regional indicator symbols make
 * the flag. Nothing is typed here, so adding a locale to `template.config.json` adds its flag.
 *
 * Two answers will look wrong to someone and are correct anyway: `en` → US and `pt` → BR. CLDR
 * maximizes to the region with the most speakers, not the language's birthplace — and the
 * alternative is a hand-list, which is what was wrong the last two times. `en` → GB would also
 * collide with `cy`, which really is GB.
 *
 * Measured 22/09 over the forty shipped locales: forty resolve, zero fall back. The fallback is
 * kept anyway — `maximize()` returns no region for a tag it cannot place (`und`, a private-use
 * tag) — and it is the code tile, which says exactly as much as is known.
 */
const flagCache = new Map<string, string | null>()

function flagOf(code: string): string | null {
  const hit = flagCache.get(code)
  if (hit !== undefined) return hit
  let flag: string | null = null
  try {
    const region = new Intl.Locale(code).maximize().region
    if (region && /^[A-Z]{2}$/.test(region)) {
      flag = String.fromCodePoint(...[...region].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    }
  } catch {
    flag = null
  }
  flagCache.set(code, flag)
  return flag
}

/**
 * The flag, or the neutral code tile when the tag has no region. Both occupy the same 18x12 box so
 * a mixed list does not ripple: the emoji is centred in a fixed-width inline-flex, not left to the
 * font's own advance width.
 */
function Flag({ code }: { code: string }) {
  const flag = flagOf(code)
  if (flag) {
    return (
      <span
        className="inline-flex w-[18px] shrink-0 justify-center text-[14px] leading-none"
        aria-hidden="true"
      >
        {flag}
      </span>
    )
  }
  if (code === 'en') {
    return (
      <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
        <rect width="18" height="12" fill="#012169" />
        <path d="M0 0l18 12M18 0L0 12" stroke="#FFFFFF" strokeWidth="2.4" />
        <path d="M0 0l18 12M18 0L0 12" stroke="#C8102E" strokeWidth="1.2" />
        <path d="M9 0v12M0 6h18" stroke="#FFFFFF" strokeWidth="3.6" />
        <path d="M9 0v12M0 6h18" stroke="#C8102E" strokeWidth="2" />
        <rect width="18" height="12" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
      </svg>
    )
  }
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
      <rect width="18" height="12" fill="currentColor" opacity=".08" />
      <text
        x="9"
        y="8.8"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        letterSpacing=".2"
        fill="currentColor"
        opacity=".75"
      >
        {code.slice(0, 2).toUpperCase()}
      </text>
      <rect width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1" opacity=".25" />
    </svg>
  )
}

export interface LanguageMenuProps {
  options: LanguageOption[]
  /** Accessible name of the control, and the dialog's title (`site.language_name`). */
  label: string
  /** Placeholder / accessible name of the dialog's filter box. */
  filterLabel: string
  /** Shown inside the dialog when the filter matches nothing. */
  emptyLabel: string
}

/**
 * The trigger, identical in both shapes. Below 768px it collapses to flag + uppercase code:
 * "Tiếng Việt" is 10 characters for a secondary control and pushes the topbar's right cluster
 * off the edge on a phone. The full name stays in the DOM (`sr-only`), and `aria-label` carries
 * the control's name, so what a screen reader hears does not change with the viewport.
 */
function Toggle({ current }: { current: LanguageOption }) {
  return (
    <>
      <Flag code={current.code} />
      <span className="sr-only md:not-sr-only md:inline">{current.name}</span>
      {/* Below 768px the name collapses to the code — unless the tile is already the code, which
          is any locale CLDR cannot place: "NB NB" was the first thing measured at 390px. The
          button and the rows read the same `flagOf`, so they cannot disagree about which is which. */}
      {flagOf(current.code) !== null && (
        <span className="text-[13px] font-semibold tracking-[.04em] md:hidden" aria-hidden="true">
          {current.code.split('-')[0].toUpperCase()}
        </span>
      )}
      <span className="text-[9px] text-on-forest-faint" aria-hidden="true">
        ▼
      </span>
    </>
  )
}

const TOGGLE_CLASS =
  'inline-flex shrink-0 items-center gap-2 font-semibold text-[color:var(--ds-c-on-accent-band,var(--color-white))] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'

/** Everything a typed query is matched against: the native name and the code, lower-cased once. */
const needleOf = (o: LanguageOption) => `${o.name} ${o.code}`.toLowerCase()

/**
 * Past 8 languages the panel is a modal dialog with a filter box and a responsive grid. Column
 * count is left to `auto-fill` over 190px tracks — the same number the Joomla template uses — so
 * no breakpoint has to guess how many columns fit. Escape, the backdrop, outside-click and the
 * focus trap are Radix's; focus is moved into the search box on open because typing two letters
 * is the fastest way out of a list of 43.
 */
function LanguageDialog({ options, label, filterLabel, emptyLabel }: LanguageMenuProps) {
  const current = options.find((o) => o.current) ?? options[0]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const needles = useMemo(() => options.map(needleOf), [options])
  const q = query.trim().toLowerCase()
  const visible = options.filter((_, i) => q === '' || needles[i].includes(q))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <DialogTrigger className={TOGGLE_CLASS} aria-label={label}>
        <Toggle current={current} />
      </DialogTrigger>
      <DialogContent
        className="grid max-h-[min(80vh,620px)] w-[min(92vw,640px)] max-w-[min(92vw,640px)] grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-[var(--ds-card-radius,0px)] border border-line bg-paper p-0 text-fg shadow-menu sm:max-w-[min(92vw,640px)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="sticky top-0 z-10 border-b border-line bg-paper p-2.5">
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter on a single remaining match goes straight there.
              if (e.key === 'Enter' && visible.length === 1) {
                e.preventDefault()
                window.location.href = visible[0].url
              }
            }}
            placeholder={filterLabel}
            aria-label={filterLabel}
            aria-controls="tb-lang-list"
            className="w-full rounded-[var(--ds-input-radius,0px)] border border-line bg-paper-2 px-2.5 py-2 pr-9 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <ul
            id="tb-lang-list"
            className="grid list-none grid-cols-[repeat(auto-fill,minmax(190px,1fr))] p-0"
          >
            {options.map((o) => (
              <li
                key={o.code}
                hidden={q !== '' && !needleOf(o).includes(q)}
                className="border-r border-b border-line-soft"
              >
                <a
                  href={o.url}
                  lang={o.code}
                  hrefLang={o.code}
                  aria-current={o.current ? 'true' : undefined}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-fg hover:bg-signal-tint"
                >
                  <Flag code={o.code} />
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.current && (
                    <span className="font-bold text-signal-text" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="m-0 p-3.5 text-sm text-fg-meta">{emptyLabel}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Topbar language switcher. TWO shapes, and the list length picks between them — decided here,
 * once, so markup and stylesheet cannot disagree about it:
 *
 *   <= 8   the anchored dropdown (190px, flag + name + check on the current one). shadcn
 *          DropdownMenu gives keyboard open/close, Escape and outside-click.
 *   >  8   a modal dialog with a filter box and an auto-fill grid — see LanguageDialog.
 */
export default function LanguageMenu(props: LanguageMenuProps) {
  const { options, label } = props
  const current = options.find((o) => o.current) ?? options[0]
  if (options.length >= MODAL_FROM) return <LanguageDialog {...props} />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TOGGLE_CLASS} aria-label={label}>
        <Toggle current={current} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={9}
        className="min-w-[190px] rounded-[var(--ds-card-radius,0px)] border border-line bg-paper p-0 text-fg shadow-menu"
      >
        {options.map((o) => (
          <DropdownMenuItem
            key={o.code}
            asChild
            className="rounded-[var(--ds-card-radius,0px)] px-3.5 py-2.5 text-sm focus:bg-signal-tint"
          >
            <a
              href={o.url}
              lang={o.code}
              hrefLang={o.code}
              className="flex items-center gap-2.5 border-b border-line-soft text-fg last:border-b-0"
            >
              <Flag code={o.code} />
              <span className="flex-1">{o.name}</span>
              {o.current && (
                <span className="font-bold text-signal-text" aria-hidden="true">
                  ✓
                </span>
              )}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
