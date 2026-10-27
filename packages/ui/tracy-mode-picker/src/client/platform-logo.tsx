/**
 * The platform's own mark, drawn in the picker's glyph box (pill and menu rows).
 *
 * WordPress and Joomla come from the one place Tracy keeps platform marks: the generated set in
 * `@tracy/ui` (Simple Icons paths, each brand's own colour). They are imported through the narrow
 * `@tracy/ui/icons/platform-marks/<id>/light` entry, not the compound `<id>` entry: the compound
 * one carries an Avatar (base-ui) and switches light/dark with Tailwind classes, and this plugin
 * runs in mode B inside dsh's page, where no Tailwind exists. The light drawing is the only one
 * used; for these two marks the generated dark drawing is the same colour, and the WordPress dark
 * case is handled in styles.ts with the official white W.
 *
 * EmDash comes from the same set, through the same narrow entry: its official mark (copied from
 * vendor/emdash/emdash, MIT licence, Copyright 2026 Cloudflare Inc.) lives in `@tracy/ui` and gives
 * each drawing its own gradient ids, so the pill and the open menu do not share one url(#id). Its
 * module imports nothing but React, so it brings no Avatar or Tailwind either. EmDash's admin
 * shows this one drawing in both themes, so it has no dark variant.
 */
import type { JSX } from 'react'
import { EmdashLight } from '@tracy/ui/icons/platform-marks/emdash/light'
import { JoomlaLight } from '@tracy/ui/icons/platform-marks/joomla/light'
import { WordpressLight } from '@tracy/ui/icons/platform-marks/wordpress/light'

export type PlatformId = 'wordpress' | 'joomla' | 'emdash'

/**
 * The glyph box for one platform: its logo when the platform is known, a neutral dot when the
 * preset id names no platform the picker knows.
 */
export function PlatformLogo({ platform }: { platform: PlatformId | null }): JSX.Element {
  const mark =
    platform === 'wordpress' ? (
      <WordpressLight className="tv-glyph-mark" aria-hidden />
    ) : platform === 'joomla' ? (
      <JoomlaLight className="tv-glyph-mark" aria-hidden />
    ) : platform === 'emdash' ? (
      <EmdashLight className="tv-glyph-mark" aria-hidden />
    ) : null
  return (
    <span className="tv-glyph" data-platform={platform ?? undefined}>
      {mark ?? '•'}
    </span>
  )
}
