import { mediaUrl } from '@/lib/media'
import type { Style } from '@/lib/sections'

export interface PanelImage {
  src: string
  width?: number
  height?: number
  alt: string
}

/**
 * The panel image drawn for the page's colour direction (DECISIONS D10: one image per direction).
 * No fallback to another direction's image: its colours belong to a different palette, so an empty
 * field means no panel rather than a mismatched one.
 */
export function panelImage(data: Record<string, any>, style: Style): PanelImage | null {
  return image(data?.[`image_${style}`])
}

/** URL + intrinsic size + alt of a media value, or null when the field is empty. */
export function image(value: any, fallbackAlt = ''): PanelImage | null {
  const src = mediaUrl(value)
  if (!src) return null
  const width = Number(value?.width) || undefined
  const height = Number(value?.height) || undefined
  return { src, width, height, alt: value?.alt || fallbackAlt }
}

/** Repeater rows as an array, dropping nulls an editor may leave behind. */
export function rows(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : []
}
