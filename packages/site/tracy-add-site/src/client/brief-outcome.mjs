/**
 * How the Customize answers ended on a new site, as the job door reports it beside `done`
 * (tracy-web `sites/route.js`: `briefState`, the `site_brief` row's state).
 *
 * `failed` covers a run that wrote nothing and one that ran out of time after writing part of the site
 * (`brief-build.js` ends both as failed): either way some pages may still show the template's own words,
 * and the ready screen says so instead of landing on the site as if they had all gone in. `applied` lands
 * as before. A site made without answers has no brief (`null`).
 *
 * 🔒 PLAIN JAVASCRIPT, for `node --test` without a build (as `steps.mjs`).
 * @param {unknown} state `briefState` of the job door's answer.
 * @returns {'applied' | 'failed' | null}
 */
export function briefOutcomeOf(state) {
  if (state === 'failed') return 'failed'
  if (state === 'applied') return 'applied'
  return null
}
