/**
 * When the Build workspace turns to the site it just built, on its own.
 *
 * David, 24/09/2026: when a build ends, the customer should be looking at their live site, not at
 * the summary of their own answers. The Building screen already promises it — "the live site
 * replaces it when the pages are laid out" (`building.note`) — and nothing kept the promise: the tab
 * stayed on the brief, and the site was one unlabelled Monitor button away. It opens IN PLACE, in
 * the browser that button borrows, not as a Live tab of its own (Lee, 13/09: PA B).
 *
 * Four conditions, each a way the automatic turn would be wrong:
 *  - only a run this tab SAW running: opening the Build tab of a site built last week must not
 *    move the customer off the brief they came to read;
 *  - once per run (`job:runs`): the next poll must not reopen what the customer closed, and a
 *    Retry that finishes is a new run, so it turns again;
 *  - only from the brief: another view may hold a request the customer is typing;
 *  - never over the customer's own choice: once they pressed the toggle in this tab, it is theirs.
 *
 * Pure, so the rule is tested without a browser: the component keeps `memory` in a ref, passes it
 * back each time the job or the view moves, and switches the preview on when `show` says so.
 *
 * @typedef {{ watched: string | null, shown: string | null }} AutoPreviewMemory
 * @param {AutoPreviewMemory} memory
 * @param {{ job: string, runs?: number, status: string, targetSiteKey?: string, targetUrl?: string } | null | undefined} job
 * @param {{ siteKey?: string, view: string, chose: boolean }} tab
 * @returns {{ memory: AutoPreviewMemory, show: boolean }}
 */
export function autoPreview(memory, job, tab) {
  if (!job || !tab.siteKey || job.targetSiteKey !== tab.siteKey) return { memory, show: false }
  const run = `${job.job}:${String(job.runs ?? 0)}`
  if (job.status === 'running') return { memory: { ...memory, watched: run }, show: false }
  if (job.status !== 'done' || memory.watched !== run || memory.shown === run) return { memory, show: false }
  const url = typeof job.targetUrl === 'string' ? job.targetUrl : ''
  return {
    memory: { ...memory, shown: run },
    show: !tab.chose && tab.view === 'brief' && /^https?:\/\//.test(url)
  }
}

/**
 * Where a tab starts: it has seen no run yet.
 * @type {Readonly<AutoPreviewMemory>}
 */
export const NO_RUN_SEEN = Object.freeze({ watched: null, shown: null })
