/**
 * Settings › General › Language, in Tracy's settings scale (Akemi, 02/10/2026): title and a one-line
 * description on the left, a compact 28px menu button on the right — the same build as the "All"
 * filter of Site changes, opening the same self-placing menu (`@tracy/core/site-tabs` Popover).
 *
 * It shadows dsh's own row (dsh-client-locale, list id `language`, priority 0) at priority -1 and
 * writes through the same `locale.setLocale`, so the stored preference is dsh's and unchanged.
 *
 * "Follow device" (Akemi, 02/10/2026, #756) comes first, above a hairline: the language follows the
 * browser's language list until the person picks one, and choosing it drops the pick again
 * (`locale.clearPreference`), the way Appearance's "System" works. While automatic, the button
 * names both the mode and the language it resolved to.
 *
 * Also exported as source, `@tracy/dsh-settings/language-row`, for the desktop first-run screen
 * (`@tracy/dsh-onboard`, step "Appearance & language"): the same row, the same service, the same
 * cookie. Such a caller builds its face with `languageFace`, injects `LANGUAGE_ROW_CSS` (the row
 * must not depend on Settings' `.ts-overlay` or on its Tailwind sheet) and passes its own root class
 * as `menuScope`, so the portalled menu keeps that plugin's reset and tokens.
 */
import { useSyncExternalStore } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverItem, PopoverSeparator } from '@tracy/core/site-tabs/popover'
import { clearLanguageCookie, rememberLanguagePick } from './language-cookie'

/** dsh's locale service, the slice this row needs. */
export interface LanguageFace {
  getSnapshot(): {
    active: string
    /** The explicit pick; absent while the language follows the device. */
    preference?: string
    locales: readonly { id: string; label: string }[]
  }
  subscribe(listener: () => void): () => void
  setLocale(id: string): void
  /** Drop the explicit pick, so the language follows the device again. */
  clearPreference(): void
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * The row's face over dsh's locale service (`ctx.locale`). An explicit pick is also remembered for
 * the pages tracy-web serves outside dsh (`language-cookie.ts`, #753); "Follow device" forgets it.
 * The automatic language never writes the cookie.
 */
export function languageFace(locale: LanguageFace): LanguageFace {
  return {
    getSnapshot: () => locale.getSnapshot(),
    subscribe: (listener) => locale.subscribe(listener),
    setLocale: (id) => {
      locale.setLocale(id)
      rememberLanguagePick(id)
    },
    clearPreference: () => {
      locale.clearPreference()
      clearLanguageCookie()
    }
  }
}

/**
 * What the row and its menu need, with no Settings dialog around them and no Tailwind: the label
 * column, the 28px menu button, and the portalled menu (class `ts-lang-menu`, beside the caller's
 * `menuScope`). Settings' own sheet carries the same text (`styles.ts`).
 * Plain CSS in a JavaScript string: no backtick inside.
 */
export const LANGUAGE_ROW_CSS = `
/* A row: label and description left, control right; a row too narrow puts the control under the words. */
.ts-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 16px; row-gap: 8px; padding: 11px 0; }
.ts-row-text { display: flex; flex: 1 1 160px; flex-direction: column; gap: 1px; min-width: 0; }
.ts-row-title { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--foreground); }
.ts-row-desc { font-size: 12px; line-height: 17px; color: var(--muted-foreground); }
/* A compact menu button, the same build as the All filter of Site changes. */
.ts-select {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; margin: 0; padding: 0 8px 0 10px;
  border: 1px solid var(--border); border-radius: 7px; background-color: transparent;
  color: var(--foreground); font: inherit; font-size: 13px; cursor: pointer;
}
.ts-select:hover, .ts-select[aria-expanded="true"] { background-color: color-mix(in oklab, var(--foreground) 5%, transparent); }
.ts-select:focus-visible { outline: 1px solid var(--ring); outline-offset: 0; }
.ts-select-chevron { width: 12px; height: 12px; color: var(--muted-foreground); }
/* The menu, portalled to the body. */
.ts-lang-menu {
  position: fixed; z-index: 2147483000; min-width: 14rem; max-height: min(70vh, 32rem); overflow-y: auto; padding: 4px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--popover, var(--card));
  color: var(--popover-foreground, var(--foreground)); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}
.ts-lang-menu button[role="menuitemradio"] {
  display: flex; width: 100%; align-items: center; gap: 8px; margin: 0; padding: 6px 8px; border: 0; border-radius: 6px;
  background-color: transparent; color: inherit; font: inherit; font-size: 14px; line-height: 20px; text-align: left; cursor: pointer;
}
.ts-lang-menu button[role="menuitemradio"]:hover { background-color: color-mix(in oklab, var(--foreground) 10%, transparent); }
.ts-lang-menu button[role="menuitemradio"] svg { width: 14px; height: 14px; flex: none; }
.ts-lang-menu button[aria-checked="false"] svg { visibility: hidden; }
.ts-lang-menu > div:not([role]) { height: 1px; margin: 4px -4px; background: var(--border); }
`

export function LanguageRow({
  t,
  language,
  menuScope = 'ts-menu'
}: {
  t: Translate
  language: LanguageFace
  /** The class that keeps the caller's reset and tokens on the portalled menu (Settings: `ts-menu`). */
  menuScope?: string
}) {
  const snapshot = useSyncExternalStore(
    (listener) => language.subscribe(listener),
    () => language.getSnapshot(),
    () => language.getSnapshot()
  )
  const active = snapshot.locales.find((l) => l.id === snapshot.active)?.label ?? snapshot.active
  const automatic = snapshot.preference === undefined
  const shown = automatic ? t('language.followDeviceCurrent', { language: active }) : active
  return (
    <div className="ts-row">
      <div className="ts-row-text">
        <div className="ts-row-title">{t('language.title')}</div>
        <div className="ts-row-desc">{t('language.description')}</div>
      </div>
      <Popover
        align="end"
        scopeClass={`${menuScope} ts-lang-menu`}
        className="min-w-40"
        trigger={(props) => (
          <button
            type="button"
            className="ts-select"
            aria-label={`${t('language.title')}: ${shown}`}
            {...props}
          >
            {shown}
            <ChevronDown className="ts-select-chevron" aria-hidden="true" />
          </button>
        )}
      >
        <LanguageMenu t={t} snapshot={snapshot} language={language} />
      </Popover>
    </div>
  )
}

/**
 * The menu's rows: "Follow device" first, checked while nothing is picked, then a hairline and the
 * languages, one checked only while it is the explicit pick (never two checks at once).
 */
export function LanguageMenu({
  t,
  snapshot,
  language
}: {
  t: Translate
  snapshot: ReturnType<LanguageFace['getSnapshot']>
  language: Pick<LanguageFace, 'setLocale' | 'clearPreference'>
}) {
  const automatic = snapshot.preference === undefined
  return (
    <>
      <PopoverItem selected={automatic} onClick={() => language.clearPreference()}>
        {t('language.followDevice')}
      </PopoverItem>
      <PopoverSeparator />
      {snapshot.locales.map((l) => (
        <PopoverItem
          key={l.id}
          selected={!automatic && l.id === snapshot.active}
          onClick={() => language.setLocale(l.id)}
        >
          {l.label}
        </PopoverItem>
      ))}
    </>
  )
}
