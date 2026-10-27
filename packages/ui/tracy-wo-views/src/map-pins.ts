/**
 * Map pins drawn as SVG images for the classic `google.maps.Marker`, coloured by grade.
 *
 * Why not `AdvancedMarkerElement` (HTML pins, no deprecation warning): it only renders on a map
 * created with a Cloud Map ID, which this deployment does not configure. A classic marker with an
 * SVG `icon` needs no Map ID; Google logs a deprecation warning for `Marker`, accepted until a Map ID
 * setting exists (then `PlacesMap` already switches to advanced markers when given `mapId`).
 */
import type { Grade } from './types.ts'

/** The theme colours a pin reads, resolved from the page's tokens (any CSS colour string). */
export interface PinTokens {
  primary: string
  primaryForeground: string
  mutedForeground: string
  background: string
  muted: string
  border: string
  foreground: string
}

export interface PinPalette {
  fill: string
  ink: string
  stroke: string
}

/** A in the primary colour, B dark grey, C light grey (like the legend dots); null = a numbered group. */
export function pinPalette(tokens: PinTokens, grade: Grade | null, selected: boolean): PinPalette {
  const base: PinPalette =
    grade === 'A'
      ? { fill: tokens.primary, ink: tokens.primaryForeground, stroke: tokens.background }
      : grade === 'B'
        ? { fill: tokens.mutedForeground, ink: tokens.background, stroke: tokens.background }
        : grade === 'C'
          ? { fill: tokens.muted, ink: tokens.mutedForeground, stroke: tokens.mutedForeground }
          : { fill: tokens.foreground, ink: tokens.background, stroke: tokens.background }
  return selected ? { ...base, stroke: tokens.foreground } : base
}

export interface PinIcon {
  url: string
  width: number
  height: number
  /** The image point that sits on the place: a teardrop's tip, a group's centre. */
  anchor: { x: number; y: number }
}

const escapeXml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  )

const FONT =
  'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700" text-anchor="middle"'

/** A grade pin (`pin`, teardrop) or a numbered group (`cluster`, circle), as a data URI. */
export function pinIcon({
  shape,
  text,
  fill,
  ink,
  stroke
}: { shape: 'pin' | 'cluster'; text: string } & PinPalette): PinIcon {
  const label = escapeXml(text)
  let width: number
  let height: number
  let body: string
  let anchor: { x: number; y: number }
  if (shape === 'pin') {
    width = 28
    height = 38
    anchor = { x: 14, y: 38 }
    body =
      `<path d="M14 37C14 37 2 23.5 2 14a12 12 0 0 1 24 0c0 9.5-12 23-12 23z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
      `<text x="14" y="18.5" font-size="12" ${FONT} fill="${ink}">${label}</text>`
  } else {
    width = height = text.length > 2 ? 40 : 34
    const c = width / 2
    anchor = { x: c, y: c }
    body =
      `<circle cx="${c}" cy="${c}" r="${c - 1.5}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
      `<text x="${c}" y="${c + 4.5}" font-size="13" ${FONT} fill="${ink}">${label}</text>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width, height, anchor }
}

/**
 * Pins sit on Google's map canvas, which is light whatever theme the page is in (a dark map needs a
 * Map ID), so their colours are the light theme's values of `tokens.css`, not the element's computed
 * ones: read in the dark theme, `--muted` is near black and the C pins outranked the A pins (L14).
 * Only the primary follows the page, since terracotta reads the same on both.
 */
export function readPinTokens(el: Element): PinTokens {
  const primary = getComputedStyle(el).getPropertyValue('--primary').trim()
  return {
    primary: primary || '#bf5b3d',
    primaryForeground: '#ffffff',
    mutedForeground: '#525252',
    background: '#ffffff',
    muted: '#d4d4d4',
    border: '#e5e5e5',
    foreground: '#171717'
  }
}
