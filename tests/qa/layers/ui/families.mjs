// Maps one assertion family to the measurement it needs and the check that decides it. Shared by the
// run (run.mjs) and the RED proofs (red.mjs) so a mutant is judged by EXACTLY the code a case is.

import {
  checkAccessibleNames,
  checkConsoleNetwork,
  checkDialog,
  checkFocusStroke,
  checkOverflow,
  checkRawKeys,
  checkTabReach,
  checkVocabulary
} from './assertions.mjs'

/** What each family needs measured on a story visit: which viewports and which extra drivers. */
export const NEEDS = Object.freeze({
  'console-network': (variant) => [variant],
  overflow: () => ['390'],
  'accessible-name': () => ['1440'],
  'tab-reach': () => ['1440', 'tab'],
  'focus-stroke': () => ['1440', 'tab'],
  'dialog-recovery': () => ['1440', 'dialog'],
  'raw-keys': () => ['1440'],
  vocabulary: () => ['1440']
})

/**
 * Judge one family on a measured story. `measurement.visits[vp]` comes from browser.measureStory.
 * Returns { kind: 'checked', result } or { kind: 'harness', reason } when the page never became
 * measurable (timeout) so the caller maps it to ENV/PENDING instead of blaming the product.
 */
// Messages that mean the bench could not BUILD the story (an unresolved import, a module that failed to
// load): the harness's problem, never a product violation, for every family including console-network.
const BUNDLE_FAILURE =
  /Failed to resolve import|Could not resolve|Cannot find module|Failed to fetch dynamically imported module|Pre-transform error|error while importing|Failed to load url/i

export const isBundleFailure = (text) => BUNDLE_FAILURE.test(String(text ?? ''))

// Only signals the bench itself emits count as a build failure, and only when they provably come from THIS run's
// Storybook origin (`visit.benchOrigin`, recorded by measureStory): the Vite client's own "[vite] ..." console
// lines (their source is `/@vite/client` on the bench origin), and a failed dynamic import (or a render error
// naming the module) whose request the bench's dev server answered with a 5xx in the same visit — that answer is
// how Vite reports a module it could not transform. A console.error, pageerror or render error the story raises
// on its own, even one quoting these phrases or prefixed "[vite]", a module that is simply missing (404), and a
// failure from any other origin (a CDN, a stand) are product signals. A visit without a bench origin proves none.
const MODULE_PATH = /\.(?:[cm]?[jt]sx?|mdx|css|svelte|vue)$/i
const parse = (u) => {
  try {
    return new URL(u)
  } catch {
    return null
  }
}
const fromBench = (u, benchOrigin) => Boolean(benchOrigin) && parse(u)?.origin === benchOrigin
const isViteModuleFailure = (e, benchOrigin) =>
  e?.type === 'response' &&
  e.status >= 500 &&
  fromBench(e.url, benchOrigin) &&
  MODULE_PATH.test(parse(e.url).pathname)
const sameModule = (a, b) => {
  const x = parse(a)
  const y = parse(b)
  return Boolean(x && y) && x.origin === y.origin && x.pathname === y.pathname
}
const DYNAMIC_IMPORT = /Failed to fetch dynamically imported module:\s*(\S+)/i

/**
 * The text proving the bench could not build the story, or undefined when nothing in the visit does.
 * @param {{errorText?: string, events?: object[], benchOrigin?: string}} visit - one measured visit.
 * @returns {string|undefined} the bench's own failure text.
 */
export function benchFailureText(visit) {
  const { benchOrigin } = visit
  if (!benchOrigin) return undefined
  const events = visit.events ?? []
  const failed = events.filter((e) => isViteModuleFailure(e, benchOrigin))
  const vite = events.find(
    (e) =>
      e?.type === 'console' &&
      fromBench(e.url, benchOrigin) &&
      parse(e.url).pathname.startsWith('/@vite/client') &&
      /^\s*\[vite\]/i.test(e.text ?? '') &&
      isBundleFailure(e.text)
  )
  if (vite) return vite.text
  for (const e of events) {
    if (e?.type !== 'pageerror') continue
    const url = DYNAMIC_IMPORT.exec(e.text ?? '')?.[1]
    if (url && failed.some((f) => sameModule(f.url, url))) return e.text
  }
  const errorText = String(visit.errorText ?? '')
  if (isBundleFailure(errorText) && failed.some((f) => errorText.includes(parse(f.url).pathname)))
    return errorText
  return undefined
}

export function evaluate(familyKey, variant, measurement, ctx) {
  const visit =
    measurement.visits[familyKey === 'overflow' ? '390' : familyKey === 'console-network' ? variant : '1440']
  if (!visit)
    return { kind: 'harness', reason: 'MEASUREMENT_MISSING: the visit for this variant did not run' }
  if (visit.state === 'timeout')
    return { kind: 'harness', reason: `STORY_TIMEOUT: ${visit.errorText || 'story never became ready'}` }
  const bundleText = benchFailureText(visit)
  if (bundleText)
    return {
      kind: 'harness',
      reason: `BUNDLE_FAILURE: the bench could not build this story (${String(bundleText).split('\n')[0].slice(0, 200)}); not a product measurement`
    }
  if (visit.state === 'error') {
    // A story that crashes on render is a product (bench) failure for the console/network family and
    // an unmeasurable page for every other family.
    if (familyKey === 'console-network') {
      return {
        kind: 'checked',
        result: {
          ok: false,
          vacuous: false,
          violations: [
            {
              message: `story failed to render: ${visit.errorText.split('\n')[0]}`,
              evidence: { errorText: visit.errorText }
            }
          ]
        }
      }
    }
    return { kind: 'harness', reason: `STORY_RENDER_ERROR: ${visit.errorText.split('\n')[0]}` }
  }
  switch (familyKey) {
    case 'console-network':
      return { kind: 'checked', result: checkConsoleNetwork(visit.eventsAfter ?? visit.events) }
    case 'overflow':
      return { kind: 'checked', result: checkOverflow(visit.facts, 390) }
    case 'accessible-name':
      return { kind: 'checked', result: checkAccessibleNames(visit.facts) }
    case 'tab-reach':
      return { kind: 'checked', result: checkTabReach(visit.facts, visit.order ?? []) }
    case 'focus-stroke':
      return { kind: 'checked', result: checkFocusStroke(visit.facts, visit.stops ?? []) }
    case 'dialog-recovery':
      return { kind: 'checked', result: checkDialog(visit.dialog) }
    case 'raw-keys':
      return { kind: 'checked', result: checkRawKeys(visit.facts, ctx.keys) }
    case 'vocabulary':
      return { kind: 'checked', result: checkVocabulary(visit.facts, ctx.banned) }
    default:
      return { kind: 'harness', reason: `UNKNOWN_FAMILY: ${familyKey}` }
  }
}

/** Case id of a (story key, family, variant) as cases.mjs builds it. */
export function caseIdFor(storyKey, family, variant) {
  const explicit = family.variants.length > 1 || family.key === 'overflow'
  return `QA-UI-${storyKey}-${family.key}${explicit ? `-${variant}` : ''}`
}
