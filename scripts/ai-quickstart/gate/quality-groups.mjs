// The site check groups template quality runs (ticket #586), by name, in the site check's own order. Kept apart from
// `quality.mjs` so the release guard, which checks a passing quality measurement names every one of them, loads none
// of the site check's code. Pure.

export const QUALITY_GROUPS = Object.freeze([
  'empty-frames',
  'cms-errors',
  'text-overflow',
  'stretched-pictures',
  'empty-controls',
  'main-heading',
  'orphan-row',
  'blank-footer-column',
  'band-contrast',
  'words-over-picture',
  'logo-readable'
])
