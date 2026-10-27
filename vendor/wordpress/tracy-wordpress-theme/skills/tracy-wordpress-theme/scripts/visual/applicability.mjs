// Source applicability for visual QA. Keep the list here so producers and gates agree on which
// measurements compare against a reference and which remain target-side checks.
import { effectiveKinds } from '../lib/route-index.mjs'

const VISUAL_CHECKS = Object.freeze([
  'content-parity',
  'body-rendering',
  'image-parity',
  'container-parity',
  'menu-comparison',
])

export const SOURCE_DEPENDENT_CHECKS = VISUAL_CHECKS
// Site-sweep comparisons have their own evidence namespace: the corresponding target
// outcome remains applicable even when comparison with a source does not.
export const SWEEP_COMPARISON_CHECKS = Object.freeze([
  'overflow', 'scheme', 'background', 'header', 'chips',
  'fixed-widgets', 'icons', 'forms', 'text', 'first-interaction', 'heights'
].map((id) => `sweep-${id}-comparison`))
export const SWEEP_TARGET_CHECKS = Object.freeze(['overflow', 'scheme', 'fixed-widgets', 'icons', 'forms', 'first-interaction'])
export const SWEEP_APPLICABILITY_VERSION = 1
export const SOURCE_REQUIRED_CHECKS = Object.freeze([
  ...VISUAL_CHECKS,
  ...SWEEP_COMPARISON_CHECKS,
  'interaction-drawer-comparison',
  'interaction-touch-comparison',
  'interaction-toggle-comparison',
  'interaction-carousel-comparison',
  'interaction-form-comparison',
  'interaction-header-comparison',
  'preflight-source-census',
  'preflight-source-layout',
  'preflight-source-motion',
  'preflight-source-http',
  'preflight-source-hidden',
  'preflight-source-containers'
])

export function needsSource(check) {
  if (!SOURCE_REQUIRED_CHECKS.includes(check)) throw new Error(`unknown visual check ${check}`)
  return true
}

export function checkApplicability(referenceKind, check) {
  needsSource(check)
  if (referenceKind === 'none') return 'not-applicable'
  if (referenceKind === 'image' && check === 'menu-comparison') return 'source-unavailable'
  return 'applicable'
}

export const noReferenceReason = 'reference.kind=none'
export const imageReferenceReason = 'reference.kind=image has no DOM source for menu comparison'

/** Bind contract page kinds to the page-map and reference.json that produced the contract. */
export function bindReferenceKinds(contractPages, pageMap, reference) {
  const routeKinds = effectiveKinds(pageMap, reference ?? { pages: [] })
  const referenceKinds = {}
  const errors = []
  for (const page of contractPages ?? []) {
    const kind = [page.pagemapPath, page.path]
      .filter((route) => typeof route === 'string')
      .map((route) => routeKinds.get(route))
      .find((value) => value != null) ?? null
    if (page.referenceKind !== undefined && page.referenceKind !== kind)
      errors.push(`page ${page.id}: referenceKind ${page.referenceKind} does not match reference.json kind ${kind ?? '(missing)'} — regenerate the contract`)
    if (kind != null) {
      referenceKinds[page.id] = kind
      if (page.path) referenceKinds[page.path] = kind
      if (page.pagemapPath) referenceKinds[page.pagemapPath] = kind
    }
  }
  return { routeKinds, referenceKinds, errors }
}

export function notApplicableChecks(referenceKind) {
  return VISUAL_CHECKS
    .filter((check) => checkApplicability(referenceKind, check) === 'not-applicable')
    .map((check) => ({ check, status: 'not-applicable', reason: noReferenceReason }))
}

export function sweepComparisonNotApplicable(referenceKind, check) {
  const id = `sweep-${check}-comparison`
  if (!SWEEP_COMPARISON_CHECKS.includes(id)) throw new Error(`unknown visual check ${id}`)
  return checkApplicability(referenceKind, id) === 'not-applicable'
    ? { check: id, status: 'not-applicable', reason: noReferenceReason }
    : null
}
