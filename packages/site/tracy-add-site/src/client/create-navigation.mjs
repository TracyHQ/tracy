/** The ordered pages of creating a site; unsupported design systems are never offered.
 * @param {boolean} supportsSystem
 */
export function createStepIds(supportsSystem) {
  return [
    'source',
    'platform',
    'design',
    ...(supportsSystem ? ['system'] : []),
    'address',
    'customize',
    'review'
  ]
}

/** Enter after the choices already supplied by the opener, or resume the retained page.
 * @param {{pressedOrigin?:string, pressedPlatform?:string, pressedDesign?:string, addressDesign?:string, keptStep?:string}} input
 */
export function createEntryStep({ pressedOrigin, pressedPlatform, pressedDesign, addressDesign, keptStep }) {
  if (keptStep) return keptStep
  if (pressedDesign || addressDesign) return 'system'
  if (pressedPlatform) return 'design'
  if (pressedOrigin) return 'platform'
  return 'source'
}

/** Entry choices are completed pages, so they can be revisited through the step bar.
 * @param {string} step
 * @param {string[]} steps
 */
export function createDoneBefore(step, steps) {
  return steps.slice(0, Math.max(0, steps.indexOf(step)))
}

/** A review edit returns to review after Continue, rather than replaying later pages.
 * @param {string} current
 * @param {string[]} steps
 * @param {boolean} returnToReview
 */
export function createNextStep(current, steps, returnToReview = false) {
  return returnToReview ? 'review' : (steps[steps.indexOf(current) + 1] ?? 'review')
}
