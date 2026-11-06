// empty-video-buttons (block; ADR 0044, decision 29): no kept page shows a control that opens a video player with no video in
// its address, such as a play button over a picture whose video id the plan hid. Read on the host's `videoButtons` (shown
// elements naming a video player's address), judged here (`lib/empty-video-buttons.js`). The fault is the write step's when the
// kit names a hide rule for its template (step 9 owed the rule), and the template's otherwise (it prints the button whatever
// the video field holds, and the kit does not know it). A host from before this measure answers none, and the group is unmeasured.
import { emptyVideoButtonsOf, isEmptyVideoAddress, VIDEO_BUTTONS_SLOT } from '../lib/empty-video-buttons.js'
import { TEMPLATE_STEP, WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead, WIDTHS } from './host-pages.js'
import { pathOfMeasure } from './page-faults.js'

const each = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {object[]} measures the host's page measures
 * @param {{ kitNamesRule: boolean }} options
 * @returns {{ checked: number, failures: object[] }}
 */
export function judgeEmptyVideoButtons(measures, { kitNamesRule }) {
  const failures = []
  const seen = new Set()
  let checked = 0
  for (const m of each(measures))
    for (const b of each(m.videoButtons)) {
      checked++
      if (!isEmptyVideoAddress(b.address)) continue
      const id = `${pathOfMeasure(m.path)} ${m.width} ${b.selector} ${b.address}`
      if (seen.has(id)) continue
      seen.add(id)
      failures.push({
        page: m.path,
        width: m.width,
        measured: b.address,
        causingStep: kitNamesRule ? WRITE_STEP : TEMPLATE_STEP,
        reason: kitNamesRule
          ? `The page shows ${b.selector}, which opens a video player with no video (${b.attribute}="${b.address}"), although the kit names a rule to hide it`
          : `The page shows ${b.selector}, which opens a video player with no video (${b.attribute}="${b.address}"); the template prints it whatever the video field holds, and the kit names no rule to hide it`
      })
    }
  return { checked, failures }
}

export const emptyVideoButtonsGroup = {
  name: 'empty-video-buttons',
  causingStep: WRITE_STEP,
  level: 'block',
  async run(context) {
    const read = await pagesRead(context)
    if (!read.measures.some((m) => Array.isArray(m.videoButtons)))
      throw new GroupUnmeasured(
        'The host answered no video controls (`videoButtons`), so this was not measured.'
      )
    // The kit names a rule, or the write report says the write step wrote one.
    const kitNamesRule =
      emptyVideoButtonsOf(context.kit).selectors.length > 0 ||
      each(context.report?.slots).some((l) => l?.slot === VIDEO_BUTTONS_SLOT)
    const judged = judgeEmptyVideoButtons(read.measures, { kitNamesRule })
    // Every page read answered, and none shows a video control: nothing of its kind (ADR 0044, decision 27).
    return {
      ...judged,
      ...(judged.checked ? {} : { notApplicable: 'no page read shows a video control' }),
      widths: WIDTHS,
      calls: read.calls
    }
  }
}
