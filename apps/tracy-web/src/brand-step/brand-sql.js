// Small SQL helpers shared by the brand bench's stores (brand-store.js, brand-round-store.js, brand-call-store.js).

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const json = (value) => (value === undefined ? null : JSON.stringify(value))
export const num = (value) => (value === null || value === undefined ? null : Number(value))
export const iso = (value) => (value ? new Date(value).toISOString() : null)
/** SQL that is true when no lease token is given, or the run holds the given one. */
export const fenced = (runParam, tokenParam) =>
  `($${tokenParam}::bigint is null or exists (select 1 from brand_run r where r.id = $${runParam} and r.lease_token = $${tokenParam}::bigint))`
