/**
 * Settings › General › Appearance, drawn as three thumbnails of a Tracy window (Light, Dark,
 * System) instead of dsh's three cubes (Akemi, 02/10/2026, option B of the settings review).
 *
 * It shadows dsh's own row (ui-theme, list id `appearance`, priority 0) at priority -1, the same
 * way FontSizeRow shadows `font-size`, and writes through the same `theme.setTheme`, so the stored
 * preference and its key are dsh's and nothing about persistence changes. Selection follows the
 * persisted preference (`system` stays `system`), never the resolved theme — same as dsh.
 *
 * The thumbnails are the one place a literal colour is right: each depicts a theme, so it must not
 * follow the theme it sits in. The accent line follows the brand primary.
 */
import { useId, useSyncExternalStore } from 'react'
import type { BrandKey } from './strings'

/** The three preferences dsh's theme service accepts (ui-theme THEME_PREFERENCES). */
export type ThemePreference = 'light' | 'dark' | 'system'

/** dsh's theme service, the slice this row needs. */
export interface AppearanceFace {
  getPreference(): string
  setTheme(id: ThemePreference): void
  subscribe(listener: () => void): () => void
}

const CHOICES: readonly { id: ThemePreference; label: BrandKey }[] = [
  { id: 'light', label: 'appearance.light' },
  { id: 'dark', label: 'appearance.dark' },
  { id: 'system', label: 'appearance.system' }
]

/** A miniature Tracy window: a side column and three lines of content, the last one the accent. */
function Window({ dark }: { dark: boolean }) {
  return (
    <span className={`tb-pv-win${dark ? ' tb-pv-dark' : ''}`}>
      <span className="tb-pv-side" />
      <span className="tb-pv-body">
        <span className="tb-pv-line" />
        <span className="tb-pv-line tb-pv-short" />
        <span className="tb-pv-line tb-pv-accent" />
      </span>
    </span>
  )
}

function Check() {
  return (
    <svg
      className="tb-th-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

export function AppearanceRow({ t, theme }: { t: (key: BrandKey) => string; theme: AppearanceFace }) {
  const titleId = useId()
  const preference = useSyncExternalStore(
    (listener) => theme.subscribe(listener),
    () => theme.getPreference(),
    () => theme.getPreference()
  )
  return (
    <div className="tb-row tb-row-block">
      <div className="tb-row-text">
        <div className="tb-title" id={titleId}>
          {t('appearance.title')}
        </div>
      </div>
      <div className="tb-thumbs" role="group" aria-labelledby={titleId}>
        {CHOICES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="tb-th"
            aria-pressed={preference === id}
            onClick={() => theme.setTheme(id)}
          >
            <span className={`tb-pv${id === 'system' ? ' tb-pv-split' : ''}`} aria-hidden="true">
              {id === 'system' ? (
                <>
                  <Window dark={false} />
                  <Window dark />
                </>
              ) : (
                <Window dark={id === 'dark'} />
              )}
            </span>
            <span className="tb-th-cap">
              {t(label)}
              <Check />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
