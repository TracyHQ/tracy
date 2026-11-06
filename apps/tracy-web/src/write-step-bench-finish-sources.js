// Wiring: what the write step bench's `finish` gives the finisher beyond the site (#423, spec #418): the first site check
// run now, beside the finder, when asked (`--check-now`); the page as the site serves it now, to confirm an invisible
// site check failure; and the template demo's block shots from the kit images, for the lost-design kind. Each is optional:
// without it the finisher runs as before and the bench says what it lacked. BENCH ONLY, beside write-step-bench-finish.js.
import { openKit } from './lib/template-kit-source.js'
import { checkLines } from './site-check/check-lines.js'

/**
 * The first site check started at once, so it runs while the finisher shoots the pages and asks the finder. A check that
 * throws gives no first check (the finisher then merges nothing from it), and the bench says why.
 * @param {() => Promise<object>} start
 */
export function firstCheckNow(start) {
  let failed = null
  const check = start().catch((error) => {
    failed = String(error?.message ?? error)
    return null
  })
  return {
    check,
    async report(d, firstCheck, saveFile) {
      if (!firstCheck) {
        d.out(`first site-check (run alongside the finder): failed, nothing merged: ${failed ?? 'no result'}`)
        return
      }
      await saveFile('first-site-check.json', `${JSON.stringify(firstCheck, null, 2)}\n`)
      d.out(`first site-check (run alongside the finder): ${firstCheck.status}, first-site-check.json`)
      for (const line of checkLines(firstCheck)) d.out(`  ${line}`)
    }
  }
}

/**
 * The page reader and the demo block shots for the finisher, with a line for each that says whether it was given.
 * @returns {Promise<{ input: object, lines: string[] }>}
 */
export async function finisherSources(d, { report, kitRef }) {
  const input = {}
  const lines = []
  if (d.pageHtml) input.pageHtml = (page) => d.pageHtml({ siteKey: report.site, path: page })
  else lines.push('live page reader: none, so invisible site check failures stay unconfirmed')
  let images = null
  if (d.kitImages) {
    const opened = openKit(kitRef, d.index ? { index: d.index } : {})
    const ready = opened
      ? await d.kitImages.ensure(opened).catch((e) => ({ ok: false, reason: e?.message }))
      : null
    if (ready?.ok) images = ready.images
    else lines.push(`template demo block shots: not available (${ready?.reason ?? 'no kit'})`)
  } else lines.push('template demo block shots: none given, so the finder cannot compare with the demo')
  if (images) input.demoImages = images
  return { input, lines }
}

/** The bench line of the merge of the finder's faults and the first site check's failures. */
export const mergeLine = (m) =>
  `merge: ${m.finder} from the finder, ${m.siteCheck} site check failures (${m.confirmed} confirmed on the live site, ${m.both} named by both and repaired once, ${m.measurementWrong} measurement wrong, ${m.noDoor} no door, ${m.loggedOnly} logged only, ${m.notDemo ?? 0} not demo: the brief's own)`

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`

/** The bench lines of what the finisher took: its time and cost against its limits, each stage's time, what stopped it. */
export function spendLines(log) {
  const { ms, costUsd, timings, limits, stoppedBy, rounds, undoneByFinalCheck } = log
  return [
    `repair log: repair-log.json, ${seconds(ms)} (target ${seconds(limits.targetMs)}, hard ${seconds(limits.hardMs)}), ${costUsd.toFixed(4)} USD (target ${limits.targetUsd}, hard ${limits.hardUsd}), ${rounds} round${rounds === 1 ? '' : 's'}`,
    `stages: ${Object.entries(timings)
      .map(([stage, t]) => `${stage} ${seconds(t)}`)
      .join(', ')} (summed over pages run side by side)`,
    ...(stoppedBy ? [`stopped: ${stoppedBy}; what was left is logged as unrepaired`] : []),
    ...(undoneByFinalCheck
      ? [`undone after the final site check: ${undoneByFinalCheck}, and the site check ran again`]
      : [])
  ]
}
