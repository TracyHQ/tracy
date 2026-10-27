/**
 * The brand-kit swatches (Kit style guide, the slide deck's palette) show the template's own colours by
 * name. Under a worn design system each one shows the role that colour plays on the site, so the kit
 * stays the site's palette (MOCK-1: a hand-written colour the system cannot swap); with no system the
 * swatch is the literal it always was, the role read falling back to it.
 */
const ROLE_OF: Record<string, string> = {
  '#14171a': '--ds-c-ink',
  '#f5f3ee': '--ds-c-bg',
  '#edeae2': '--ds-c-surface-warm',
  '#14483a': '--ds-c-accent-band',
  '#da5a2a': '--ds-c-accent',
  '#dcd7cc': '--ds-c-border'
}

/** `background` for a swatch: its role with the template's colour as the fallback, or that colour alone. */
export function swatchFill(hex: string, own: string = hex): string {
  const role = ROLE_OF[String(hex).trim().toLowerCase()]
  return role ? `var(${role}, ${own})` : own
}
