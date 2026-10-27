/**
 * Step 3 — "Appearance & language": the mock's `stepLook`. On top, Settings' own Language row
 * (`@tracy/dsh-settings/language-row`, handed in as `language`: same component, same service, same
 * stored value), and under it one line when it follows the device and the device's language is not
 * one Tracy offers or could not be read (`language-note.ts`). Then three theme cards; a pick applies
 * at once through dsh's theme service (`ctx.theme.setTheme`, which writes the host setting and
 * `dsh.ui-theme.v1` itself). The previews are drawn with tokens, no images: `tv-ob-pv-light` /
 * `-dark` hold fixed palettes. Nothing here reads the desktop bridge (the web version reuses it).
 */
import type { JSX, ReactNode } from 'react'
import { Check, Monitor, Moon, Sliders, Sun } from './icons.tsx'
import type { LanguageNote } from './language-note.ts'
import { Bold, Strong, type T } from './text.tsx'

/** dsh's theme preferences (`@deepseek-ai/dsh-client-ui-theme` `setTheme`). */
export type ThemeChoice = 'system' | 'dark' | 'light'

export const THEMES: readonly { id: ThemeChoice; Icon: () => JSX.Element }[] = [
  { id: 'system', Icon: Monitor },
  { id: 'dark', Icon: Moon },
  { id: 'light', Icon: Sun }
]

function PreviewWindow(): JSX.Element {
  return (
    <div className="tv-ob-pv-win">
      <div className="tv-ob-pv-side">
        <div className="tv-ob-pv-row tv-ob-on" />
        <div className="tv-ob-pv-row" />
        <div className="tv-ob-pv-row tv-ob-short" />
      </div>
      <div className="tv-ob-pv-main">
        <div className="tv-ob-pv-line" />
        <div className="tv-ob-pv-line tv-ob-short" />
        <div className="tv-ob-pv-compose" />
      </div>
    </div>
  )
}

function Preview({ id }: { id: ThemeChoice }): JSX.Element {
  if (id === 'system')
    return (
      <div className="tv-ob-pv">
        <div className="tv-ob-pv-half tv-ob-pv-dark tv-ob-pv-split-l">
          <PreviewWindow />
        </div>
        <div className="tv-ob-pv-half tv-ob-pv-light tv-ob-pv-split-r">
          <PreviewWindow />
        </div>
        <div className="tv-ob-pv-divider" />
      </div>
    )
  return (
    <div className={`tv-ob-pv tv-ob-pv-${id}`}>
      <PreviewWindow />
    </div>
  )
}

export interface AppearanceStepProps {
  readonly t: T
  readonly theme: ThemeChoice
  readonly onTheme: (id: ThemeChoice) => void
  /** The Language row (Settings' own), drawn on top; absent when the page has no locale service. */
  readonly language?: ReactNode
  /** The line under the Language row, or null. */
  readonly note?: LanguageNote | null
}

export function AppearanceStep({
  t,
  theme,
  onTheme,
  language,
  note = null
}: AppearanceStepProps): JSX.Element {
  return (
    <div className="tv-ob-stack" data-step="appearance">
      {language !== undefined && (
        <>
          <section className="tv-ob-lang">
            {language}
            {note !== null && (
              <div className="tv-ob-lang-note" data-language-note={note.kind}>
                {note.kind === 'unsupported' ? (
                  <Strong
                    t={t}
                    k="language.unsupported"
                    values={{ system: note.system, fallback: note.fallback }}
                  />
                ) : (
                  <Strong t={t} k="language.failed" values={{ fallback: note.fallback }} />
                )}
              </div>
            )}
          </section>
          <div className="tv-ob-divider" />
        </>
      )}
      <section>
        {language !== undefined && (
          <div className="tv-ob-block-head">
            <span className="tv-ob-section-title">{t('appearance.look')}</span>
          </div>
        )}
        <div className="tv-ob-themes">
          {THEMES.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              className="tv-ob-theme-card"
              aria-pressed={theme === id}
              data-theme-pick={id}
              onClick={() => onTheme(id)}
            >
              <div className="tv-ob-preview-wrap">
                <Preview id={id} />
                {theme === id && (
                  <span className="tv-ob-check">
                    <Check />
                  </span>
                )}
              </div>
              <div className="tv-ob-theme-meta">
                <span className="tv-ob-theme-label">
                  <Icon />
                  {t(`theme.${id}`)}
                </span>
                <span className="tv-ob-theme-hint">{t(`theme.${id}.hint`)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <div className="tv-ob-footnote">
        <Sliders />
        <span>
          <Bold t={t} k="appearance.more" param="place" value={t('appearance.place')} />
        </span>
      </div>
    </div>
  )
}
