// The one rule of the trial-site writer (brand bench real-page check, #322): it writes the trial site and no other.
// The trial site is named by its label in the server's settings (TRACY_BRAND_TRIAL_SITE); a label that is not set
// writes nothing at all. Every write the trial writer sends goes through `guardedCall`, which checks the site key it
// is sent to against the one site the label resolved to, so even a bug further up cannot reach another site.

export class TrialSiteOnly extends Error {
  constructor(reason) {
    super(`TRIAL_SITE_ONLY: ${reason}`)
    this.code = 'TRIAL_SITE_ONLY'
  }
}

/** The trial site's label from the environment, or null when none is configured. */
export const trialLabelFrom = (env = process.env) => {
  const label = String(env.TRACY_BRAND_TRIAL_SITE ?? '').trim()
  return label === '' ? null : label
}

/** Throws unless `site` is the configured trial site. */
export function assertTrialSite(site, trialLabel) {
  if (typeof trialLabel !== 'string' || trialLabel === '')
    throw new TrialSiteOnly('no trial site is configured, so nothing is written')
  if (!site || typeof site.site_key !== 'string' || site.label !== trialLabel)
    throw new TrialSiteOnly(`the site ${site?.label ?? '(none)'} is not the trial site`)
  return site
}

/**
 * The Apply door as the trial writer may use it: every call is held to the trial site's key.
 * @param {{ site_key: string }} site the trial site, already checked
 * @param {(call: object) => Promise<any>} door
 */
export const guardedCall = (site, door) => (call) => {
  if (call?.siteKey !== site.site_key) throw new TrialSiteOnly('a write was addressed to another site')
  return door(call)
}
