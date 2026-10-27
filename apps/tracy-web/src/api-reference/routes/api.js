/**
 * Route docs for `/v1` — GENERATED from `lib/v1-routes.js`, the table `api/route.js` registers its
 * routes from, so the reference and the router cannot list two different sets. `spec.js` draws the
 * operations themselves from the same table (headers, preconditions, responses); these entries are
 * what the whole-system coverage test (`test/api-reference.test.mjs`) compares with `app.routes`.
 */
import { V1_ROUTES } from '../../lib/v1-routes.js'

const PATH_WORDS = {
  key: 'The site key (its canonical name, e.g. `shop.example.com`); a public name of the site is accepted too.',
  id: 'The id named in the route’s description (a content id, a numeric record id, or an apply id).',
  kind: 'Record kind (`article`, `post`, `option`, `menuItem`, …).',
  operation: 'The contract operation (`inspect`, `apply`, `bind`, `multilingual.plan`, …).'
}

/** @type {import('./index.js').RouteDoc[]} */
export const API_ROUTES = V1_ROUTES.map((row) => ({
  method: row.method,
  path: row.path,
  summary: row.summary,
  description: row.description,
  audience: ['public', 'agent'],
  auth: 'token',
  internal: false,
  params: {
    path: Object.fromEntries(
      [...row.path.matchAll(/:([A-Za-z]+)/g)].map((m) => [m[1], PATH_WORDS[m[1]] ?? m[1]])
    ),
    query: row.query
  }
}))
