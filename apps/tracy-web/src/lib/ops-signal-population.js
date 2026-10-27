import { customerSite, siteChronology, siteLifetimes } from './ops-signal-customer-sites.js'
import { matchesCustomerSites, matchesSignalSource, SOURCE_FILTERS } from './ops-signal-query.js'

const emailOf = (row) => row.data?.email?.toLowerCase() ?? null
const identity = (row) => row.account_id ?? emailOf(row)

/** Historical first-sign-in attribution and lifetime started sites, independent of the date window. */
export function signalPopulation(rows, filters) {
  const ordered = [...rows].sort(siteChronology)
  const people = new Map()
  for (const row of ordered) {
    if (row.kind !== 'account.first_sign_in') continue
    const person = people.get(row.account_id) ??
      people.get(emailOf(row)) ?? { source: row.data?.source, sites: [], unknownSites: false }
    if (row.account_id) people.set(row.account_id, person)
    if (emailOf(row)) people.set(emailOf(row), person)
  }
  const sites = new Map()
  const legacyIdentity = new Map()
  for (const { siteKey, key, events, start, demo } of siteLifetimes(ordered)) {
    if (!start) continue
    // An orphan legacy event before the first known start does not prove an extra incarnation.
    // Share only its counting identity; it still has no owner, CMS or lifecycle attribution.
    if (!start.site_instance && !legacyIdentity.has(siteKey)) legacyIdentity.set(siteKey, key)
    const site = customerSite(siteKey, events)
    const person = people.get(identity(start)) ?? people.get(emailOf(start))
    for (const event of events) sites.set(event, { site, person, key })
    if (demo === false && person) person.sites.push(site)
    if (demo === null && person) person.unknownSites = true
  }
  return {
    siteIdentity(row) {
      return (
        sites.get(row)?.key ??
        (row.site_instance
          ? `${row.site_key}:${new Date(row.site_instance).toISOString()}`
          : (legacyIdentity.get(row.site_key) ?? row.site_key))
      )
    },
    personMatches(row) {
      const person = people.get(identity(row)) ?? people.get(emailOf(row))
      return (
        matchesSignalSource(row.data?.source, filters) &&
        !(filters.status === 'no-site' && person?.unknownSites) &&
        matchesCustomerSites(person?.sites ?? [], filters)
      )
    },
    siteMatches(row) {
      const found = sites.get(row)
      if (filters.status === 'no-site' || (!found && (filters.cms || filters.status))) return false
      const ownerMatches =
        !SOURCE_FILTERS.some((key) => filters[key]) ||
        (found?.person && matchesSignalSource(found.person.source, filters))
      return ownerMatches && matchesCustomerSites(found ? [found.site] : [], filters)
    }
  }
}
