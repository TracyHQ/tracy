// A sweep for the sites a run account owns that no journey could name in time: a WO demo build makes its site
// asynchronously (after the press, sometimes after the journey ended), so the manifest names the ACCOUNT (kind
// `account-sites`) and the cleanup deletes every site it owns through the site door. Only per-run accounts are
// swept: everything such an account owns is this run's.

import { Client } from './api.mjs'
import { mintCookie } from './dev.mjs'
import { ENV } from './env.mjs'
import { deleteSite } from './sites.mjs'

/** Name the account's sites for the end-of-run sweep, once. */
export function noteAccountSites(manifest, email) {
  if (ENV.accounts !== 'per-run') return
  if (!manifest.read().resources.some((r) => r.kind === 'account-sites' && r.id === email))
    manifest.intend('account-sites', email, { owner: email })
}

/** The cleaner for kind `account-sites`. */
export async function cleanAccountSites(resource) {
  const owner = new Client({ name: 'owner', email: resource.id, token: await mintCookie(resource.id) })
  const listed = await owner.get('/api/sites')
  if (listed.status !== 200)
    return { state: 'left', detail: { reason: `GET /api/sites answered ${listed.status}` } }
  const owned = (listed.json?.sites ?? []).filter((s) => s.role === 'owner' || s.owner === true)
  const sites = []
  for (const s of owned) {
    const out = await deleteSite(owner, s.siteKey, String(s.siteKey).split('.')[0])
    sites.push({ siteKey: s.siteKey, state: out.state })
  }
  return { state: sites.some((s) => s.state === 'left') ? 'left' : 'cleaned', detail: { sites } }
}
