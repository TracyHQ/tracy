/**
 * The platform glyph at the left of a Sources row (and, later, of source attribution chips): inline SVG in
 * currentColor, the generic globe for a source with no shipped glyph. The mapping is `source-logo.ts`.
 */
import { Globe } from 'lucide-react'
import type { JSX } from 'react'

import { SOURCE_LOGO_PATHS, type SourceLogoKey, sourceLogoKey } from './source-logo.ts'

/** One glyph, 20px by default, decorative (the row names the source in words). */
export function SourceGlyph({ logo, size = 14 }: { logo: SourceLogoKey; size?: number }): JSX.Element {
  if (logo === 'website') return <Globe aria-hidden="true" width={size} height={size} data-logo="website" />
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      data-logo={logo}
      focusable="false"
    >
      <path d={SOURCE_LOGO_PATHS[logo]} />
    </svg>
  )
}

/** The 20px tile at the left of a Sources row. */
export function SourceLogo({ source, href }: { source: string; href?: string | null }): JSX.Element {
  return (
    <span className="tracy-wo-src-logo">
      <SourceGlyph logo={sourceLogoKey(source, href)} />
    </span>
  )
}
