/**
 * The General-settings rows: Primary color, and the font pair. They read this entry's settings form
 * (`configForms.get('tracy-brand')`, dsh 0.1.7) through React's external-store hook and write
 * back through `scope.set`, so the theme layer (which adopts the same form) follows without the
 * rows knowing about it.
 */
import { useState, useSyncExternalStore } from 'react'
import {
  CODE_FONTS,
  CODE_FONT_FIELD,
  DEFAULT_PRIMARY,
  DEFAULT_SETTINGS,
  GLOBAL_FONTS,
  GLOBAL_FONT_FIELD,
  PRIMARY_FIELD,
  PRIMARY_SWATCHES
} from '../shared/settings.mjs'
import { normalizePrimary } from '../shared/theme.mjs'
import type { BrandKey } from './strings'

/** The slice of dsh's `ConfigForm` (ui-settings, dsh 0.1.7) these rows use. */
export interface BrandScope {
  getSnapshot(): { status: string; value?: Record<string, unknown> | undefined; writable: boolean }
  subscribe(listener: () => void): () => void
  /** Resolves `false` when the Host refused the write; the form then reloads the accepted value. */
  set(field: string, value: unknown): Promise<unknown>
}

export interface RowProps {
  t: (key: BrandKey, params?: Record<string, string>) => string
  scope: BrandScope
}

function useBrandSettings(scope: BrandScope) {
  // Wrapped, not passed by reference: `subscribe` is a method on dsh's form controller and reads
  // `this.store` — handed to React unbound it threw "Cannot read properties of undefined
  // (reading 'store')" and the slot renderer dropped all three rows (lane tchwp2august, 03/09).
  const read = (): ReturnType<BrandScope['getSnapshot']> => scope.getSnapshot()
  const snapshot = useSyncExternalStore((listener) => scope.subscribe(listener), read, read)
  const value = { ...DEFAULT_SETTINGS, ...snapshot.value } as Record<string, string>
  return { value, ready: snapshot.status === 'ready' && snapshot.writable }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function PrimaryColorRow({ t, scope }: RowProps) {
  const { value, ready } = useBrandSettings(scope)
  const current = normalizePrimary(value[PRIMARY_FIELD])
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? current
  const valid = HEX.test(shown)
  const commit = (hex: string): void => {
    setDraft(null)
    if (!HEX.test(hex)) return
    void scope.set(PRIMARY_FIELD, hex.toLowerCase() === DEFAULT_PRIMARY ? '' : hex.toLowerCase())
  }
  return (
    <div className="tb-row">
      <div className="tb-row-text">
        <div className="tb-title">{t('primary.title')}</div>
        <div className="tb-desc">{t('primary.description')}</div>
      </div>
      <div className="tb-control">
        {PRIMARY_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            className="tb-swatch"
            style={{ background: hex }}
            aria-label={t('primary.swatch', { color: hex })}
            aria-pressed={hex.toLowerCase() === current.toLowerCase()}
            disabled={!ready}
            onClick={() => commit(hex)}
          />
        ))}
        <input
          className="tb-hex"
          aria-label={t('primary.hex')}
          aria-invalid={!valid}
          value={shown}
          disabled={!ready}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(shown)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(shown)
          }}
        />
      </div>
    </div>
  )
}

function FontRow({
  t,
  scope,
  field,
  fonts,
  titleKey,
  descriptionKey
}: RowProps & {
  field: string
  fonts: readonly { id: string; label: string }[]
  titleKey: BrandKey
  descriptionKey: BrandKey
}) {
  const { value, ready } = useBrandSettings(scope)
  const selected = fonts.some((f) => f.id === value[field]) ? value[field] : fonts[0].id
  return (
    <div className="tb-row">
      <div className="tb-row-text">
        <div className="tb-title">{t(titleKey)}</div>
        <div className="tb-desc">{t(descriptionKey)}</div>
      </div>
      <div className="tb-control">
        <select
          className="tb-select"
          aria-label={t(titleKey)}
          value={selected}
          disabled={!ready}
          onChange={(e) => void scope.set(field, e.target.value)}
        >
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id === fonts[0].id ? t('font.default') : f.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function GlobalFontRow(props: RowProps) {
  return (
    <FontRow
      {...props}
      field={GLOBAL_FONT_FIELD}
      fonts={GLOBAL_FONTS}
      titleKey="font.global.title"
      descriptionKey="font.global.description"
    />
  )
}

export function CodeFontRow(props: RowProps) {
  return (
    <FontRow
      {...props}
      field={CODE_FONT_FIELD}
      fonts={CODE_FONTS}
      titleKey="font.code.title"
      descriptionKey="font.code.description"
    />
  )
}

/** dsh's theme service, the slice the font-size row needs. */
export interface ThemeFace {
  getFontSize(): number
  setFontSize(px: number): void
  subscribe(listener: () => void): () => void
  min: number
  max: number
}

/**
 * Replaces dsh's font-size stepper (ui-theme, id `font-size`) by shadowing it at a lower priority:
 * a compact "minus, value, plus" stepper (Akemi, 02/10/2026) writing through the same
 * `theme.setFontSize` dsh's stepper uses, clamped to the same bounds, one pixel per press.
 */
export function FontSizeRow({ t, theme }: { t: (key: BrandKey) => string; theme: ThemeFace }) {
  const current = useSyncExternalStore(
    (listener) => theme.subscribe(listener),
    () => theme.getFontSize(),
    () => theme.getFontSize()
  )
  const step = (delta: number): void => {
    theme.setFontSize(Math.min(theme.max, Math.max(theme.min, current + delta)))
  }
  return (
    <div className="tb-row">
      <div className="tb-row-text">
        <div className="tb-title">{t('fontSize.title')}</div>
        <div className="tb-desc">{t('fontSize.description')}</div>
      </div>
      <div className="tb-control">
        <div className="tb-step">
          <button
            type="button"
            aria-label={t('fontSize.decrease')}
            disabled={current <= theme.min}
            onClick={() => step(-1)}
          >
            {'\u2212'}
          </button>
          <output aria-live="polite">{current} px</output>
          <button
            type="button"
            aria-label={t('fontSize.increase')}
            disabled={current >= theme.max}
            onClick={() => step(1)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
