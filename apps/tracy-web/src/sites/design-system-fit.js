/**
 * What a site runs, judged for a design system (`design-system.js`): one `site-ds-slot` job in the site's
 * own container and its answer, the template that answer names, and whether that template's release can
 * wear a slot (its contract, or why not). Every door — the panel's read, the preview, an apply, an undo —
 * judges a site through this one place, so they never disagree on what it may wear.
 */

/**
 * How long the door waits for one `site-ds-slot` job: a little past the host's own limit for that mode
 * (tracy-host `ds-slot.js` `DS_TIMEOUT_MS`: read 45 s, apply and undo 120 s), so the door hears how a
 * write ended instead of saying "failed" while the host still writes. Sized for a busy host: a WordPress
 * boot took 45–74 s on the stand while other sites were building (11/10/2026).
 */
export const DOOR_WAIT_MS = Object.freeze({ read: 50_000, apply: 130_000, undo: 130_000 })

/**
 * @param {{
 *   ds: {
 *     templateKeyOf: (s: any) => string | null,
 *     contractFor: (key: string | null, version?: any) => any,
 *     versionKeyOf: (s: any) => { key: string | null, version: string | null }
 *   },
 *   runJob: (site: any, input: Record<string, unknown>, ms: number) => Promise<{ ok: boolean, output?: string, reason?: string }>
 * }} deps
 */
export function designSystemFit({ ds, runJob }) {
  /** The host's answer of one `site-ds-slot` job, or a failure reason. */
  async function job(site, input, ms) {
    const r = await runJob(site, { kind: 'site-ds-slot', platform: site.platform, ...input }, ms)
    if (!r.ok) return { failed: r.reason ?? 'job failed' }
    try {
      const lines = String(r.output ?? '')
        .trim()
        .split('\n')
      const answer = JSON.parse(lines[lines.length - 1] ?? '')
      return answer && typeof answer === 'object' ? answer : { failed: 'no answer' }
    } catch {
      return { failed: 'no answer' }
    }
  }

  /**
   * The template a site runs and its slot contract (or why none), from what one run in its container
   * said (`stylesheet` / `template`) or, for EmDash, its quickstart tag.
   * @param {any} site
   * @param {any} said a host answer (read, apply, undo) or null (EmDash needs none)
   */
  function fitOf(site, said) {
    const templateKey = ds.templateKeyOf({
      platform: site.platform,
      stylesheet: said?.stylesheet ?? null,
      template: said?.template ?? null,
      quickstartTag: site.quickstart_tag ?? null
    })
    // Ready only for the release the contract was measured on (`contractFor`, `minVersion`).
    return { templateKey, fit: ds.contractFor(templateKey, versionOf(site, said)) }
  }

  /**
   * The release a site runs, as the contract's `minVersion` names it: WordPress's theme version as
   * the run read it; Joomla's and EmDash's quickstart release from the site's row.
   */
  const versionOf = (site, said) =>
    ds.versionKeyOf({
      platform: site.platform,
      stylesheet: said?.stylesheet ?? null,
      themeVersion: said?.themeVersion ?? null,
      quickstartTag: site.quickstart_tag ?? null,
      quickstartVersion: site.quickstart_version ?? null
    })

  /**
   * The releases a version refusal names: the site's (`have`), the first that wears the slot (`need`)
   * and, past the last release confirmed to wear it, that one (`upTo`).
   */
  const versionPart = (fit) =>
    'need' in fit || 'have' in fit || 'upTo' in fit
      ? {
          version: {
            need: fit.need ?? null,
            have: fit.have ?? null,
            ...('upTo' in fit ? { upTo: fit.upTo ?? null } : {})
          }
        }
      : {}

  /** The raw template name a run said the site runs (what `templates` asks the next write to hold). */
  const rawOf = (site, said) => {
    const raw = site.platform === 'wordpress' ? said?.stylesheet : said?.template
    return typeof raw === 'string' && raw !== '' ? [raw] : null
  }

  /** The site's template, its contract (or why none), and what it wears now: one read. */
  async function survey(site) {
    const read = await job(site, { mode: 'read' }, DOOR_WAIT_MS.read)
    if (read.failed || read.ok !== true) return { failed: read.failed ?? 'read failed' }
    return { read, ...fitOf(site, read) }
  }

  return { job, fitOf, versionOf, versionPart, rawOf, survey }
}
