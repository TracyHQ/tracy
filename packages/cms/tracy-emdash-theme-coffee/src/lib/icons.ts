// The OpenDesign inline icons the source draws in value/feature/process cards, keyed by the
// names tools/build-seed.mjs assigns (ICONS table). 24×24 stroke icons and 124×108 "sketch"
// illustrations; the sketch fills read the accent and line tokens instead of the source's
// --brand-* variables.
const S =
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
export const ICONS: Record<string, { viewBox: string; body: string; sketch?: boolean }> = {
  check: { viewBox: '0 0 24 24', body: `<path d="M5 12l4 4 10-10" ${S}/>` },
  plus: { viewBox: '0 0 24 24', body: `<path d="M12 3v18M3 12h18" ${S}/>` },
  search: { viewBox: '0 0 24 24', body: `<circle cx="11" cy="11" r="6" ${S}/><path d="M20 20l-4-4" ${S}/>` },
  'check-double': { viewBox: '0 0 24 24', body: `<path d="M4 13l5 5L20 6" ${S}/><path d="M4 7l3 3" ${S}/>` },
  'plus-square': {
    viewBox: '0 0 24 24',
    body: `<rect x="4" y="4" width="16" height="16" rx="3" ${S}/><path d="M9 12h6M12 9v6" ${S}/>`
  },
  calendar: {
    viewBox: '0 0 24 24',
    body: `<rect x="3" y="5" width="18" height="16" rx="2" ${S}/><path d="M3 10h18M8 3v4M16 3v4" ${S}/>`
  },
  star: {
    viewBox: '0 0 24 24',
    body: `<path d="M12 2l3 6 7 .9-5 4.7 1.3 6.9L12 18l-6.3 3.5L7 14.6 2 9.9 9 9z" ${S}/>`
  },
  'sketch-lines': {
    viewBox: '0 0 124 108',
    sketch: true,
    body: `<rect x="14" y="40" width="92" height="9" rx="4.5" fill="var(--color-line)"/><rect x="14" y="58" width="58" height="9" rx="4.5" fill="var(--color-line)"/><rect x="14" y="80" width="40" height="14" rx="7" fill="var(--color-accent)"/>`
  },
  'sketch-panels': {
    viewBox: '0 0 124 108',
    sketch: true,
    body: `<rect x="14" y="38" width="44" height="38" rx="6" fill="none" stroke="var(--color-line)" stroke-width="2"/><rect x="66" y="38" width="44" height="38" rx="6" fill="none" stroke="var(--color-accent)" stroke-width="2"/><rect x="14" y="84" width="96" height="9" rx="4.5" fill="var(--color-line)"/>`
  },
  'sketch-check': {
    viewBox: '0 0 124 108',
    sketch: true,
    body: `<path d="M16 70l20 16 28-44" fill="none" stroke="var(--color-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="72" y="44" width="38" height="9" rx="4.5" fill="var(--color-line)"/><rect x="72" y="64" width="26" height="9" rx="4.5" fill="var(--color-line)"/>`
  }
}
export const ICON_NAMES = Object.keys(ICONS)
