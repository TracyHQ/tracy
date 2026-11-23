// Page composition is code (DECISIONS D5); the vertical rhythm of each section is the one the source's module carries
// (`spacing.top` / `spacing.bottom`: large = --gutter-xl, normal = --gutter-normal, blank = none), kept in page-layout.json by
// ingest/shape-model.mjs. `spacing('home-explore')` -> `top-normal bottom-large` for the `fr-section` classes.
import layout from './page-layout.json'

type Spacing = { top?: string | null; bottom?: string | null }
const CLASS: Record<string, string> = { large: 'large', normal: 'normal' }

export function spacing(slug: string): string {
  const s = ((layout as Record<string, { spacing?: Spacing }>)[slug]?.spacing ?? {}) as Spacing
  return [
    CLASS[s.top ?? ''] && `top-${CLASS[s.top ?? '']}`,
    CLASS[s.bottom ?? ''] && `bottom-${CLASS[s.bottom ?? '']}`
  ]
    .filter(Boolean)
    .join(' ')
}
