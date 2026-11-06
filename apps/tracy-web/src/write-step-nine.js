// Wiring: step 9 of the live build (ADR 0044; spec #418, #424): the write, then the finisher, in one run, before the site is
// handed to the customer. It sits beside app.js because it joins the write step and the site check. The finisher is reached
// only through its one entry point (write-step/finisher/finisher.js), as the bench's `finish` reaches it. The first site
// check starts the moment the write is done and runs beside the finder (the finisher awaits it when it merges its failures);
// the build keeps the final site check, run on the write report with the kept repairs in it.
//
// Repairs are part of the build, not changes the customer asked for: they are written by the build's site door under the
// finisher's own apply ids, outside any chat turn, so the Site changes tab, which lists chat turns (sites/activity.js), does
// not list them. A build that wires this step must give it the same build door the write uses, never a chat turn's.
import { defaultContracts } from './lib/contracts.js'
import { contractBaselineStore } from './site-check/demo-baseline.js'
import { withReadBack } from './site-check/read-back.js'
import { runFinisher } from './write-step/finisher/finisher.js'
import { runWriteStep } from './write-step/write-step.js'

/**
 * @param {{ write: object, finisher: { doors: object, capture: Function, saveFile: Function,
 *   pageHtml?: ((page: string) => Promise<string | null>) | null, demoImages?: object | null, facts?: object | null,
 *   limits?: object | null }, checkSite: (report: object, options: { baseline: object | null }) => Promise<object>,
 *   baselines?: { read: (contract: string) => Promise<object | null> } | null, contracts?: Map<string, object>,
 *   now?: () => number }} input
 *   `write` is the write step's own input (write-step.js); `checkSite` runs the site check on a report; `baselines` gives the
 *   demo baseline of the quickstart version the site was made from, by default the file beside the contract in `contracts`
 * @returns {Promise<{ report: object, siteCheck: object | null, repairLog: object | null, finisher: object | null }>}
 *   `report` is the build's write report, its `siteCheck` the final one; `finisher` says why the finisher did not run
 */
export async function runStepNine({ write, finisher, checkSite, baselines, contracts, now = Date.now }) {
  const written = await runWriteStep({ now, ...write })
  if (written.status !== 'done') return { report: written, siteCheck: null, repairLog: null, finisher: null }
  // The demo baseline committed beside the contract at step 0 (demo-baseline.json), unless the caller gives its own lookup.
  const store = baselines ?? contractBaselineStore({ index: contracts ?? defaultContracts() })
  const baseline = await store.read(written.contract).catch(() => null)
  const siteCheck = (report) => checkSite(report, { baseline })
  // Started now, awaited by the finisher: the first check runs beside the finder. A check that throws gives none.
  const firstCheck = siteCheck(written).catch(() => null)
  const finished = await runFinisher({
    ...finisher,
    door: write.door,
    siteKey: write.siteKey,
    kit: write.kit.doc,
    contentMap: write.contentMap ?? null,
    report: written,
    firstCheck,
    siteCheck,
    now
  })
  if (!finished.ok) {
    // A finisher that refused (a door it cannot use) leaves the written site as the write left it; its first check stands.
    const first = await firstCheck
    return {
      report: first ? withReadBack(written, first) : written,
      siteCheck: first,
      repairLog: null,
      finisher: { code: finished.code, reason: finished.reason }
    }
  }
  return {
    report: withReadBack(finished.report, finished.finalCheck),
    siteCheck: finished.finalCheck,
    repairLog: finished.log,
    finisher: null
  }
}
