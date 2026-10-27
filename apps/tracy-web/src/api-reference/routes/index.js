/**
 * EVERY ROUTE tracy-web SERVES, described once — the whole-system view of the API reference.
 *
 * `test/api-reference.test.mjs` builds the app and compares its registered routes (`app.routes`) with
 * this list both ways: a route added without a line here, or a line whose route is gone, is a red build.
 * That is what keeps the overview true after the week it was written.
 *
 * One entry (`RouteDoc`):
 *   method       'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' — as Hono registered it
 *   path         the Hono path exactly as registered (`/api/sites/:key/apply`, `/ops/*`)
 *   summary      one line, imperative, English, no trailing period
 *   description  a short paragraph (markdown allowed): what it does, what it answers
 *   audience     who calls it: any of 'customer' (a person in a browser), 'team' (Tracy staff),
 *                'agent' (the dsh agent through its tools), 'dsh' (the host's dsh process, machine
 *                to machine), 'fleet' (fleet hosts, provisioning, CI), 'site' (a customer site's own
 *                pages or plugin), 'desktop' (the Tracy Cowork for Mac app's main process),
 *                'public' (anyone, no account)
 *   auth         how it is authenticated: 'none' | 'session' (tracy_sess cookie) | 'actor'
 *                (signed x-tracy-actor from dsh) | 'session-or-actor' | 'admin' (a tracy_admin seat,
 *                ops/admit.js) | 'otp' | 'oauth' | 'token' (a bearer/shared secret — name it in the
 *                description) | 'signature' (HMAC — name the header) | 'invite' (a one-time link)
 *   internal     true for Ops and staff tooling, machine-to-machine doors and anything a customer or
 *                partner never calls; internal routes are documented only in the Internal reference
 *                (behind /ops), never on the public page
 *   params       optional { path?: {name: description}, query?: {name: description} }
 *   body         optional JSON Schema of the request body
 *   bodyOptional optional `true` when the door also answers a request with no body at all
 *                (`requestBody.required: false`); left out, a declared body is required
 *   answers      optional one line: what a 200 answers
 */

/**
 * @typedef {{ method: string, path: string, summary: string, description: string, audience: string[],
 *   auth: string, internal: boolean, params?: { path?: Record<string, string>, query?: Record<string, string> },
 *   body?: object, bodyOptional?: boolean, answers?: string }} RouteDoc
 */

import { API_ROUTES } from './api.js'
import { DEMO_ROUTES } from './demos.js'
import { MCP_ROUTES } from './mcp.js'
import { INVITATIONS_ROUTES } from './invitations.js'
import { INVITATIONS_REAL_ROUTES } from './invitations-real.js'
import { MISC_ROUTES } from './misc.js'
import { OPS_A_ROUTES } from './ops-a.js'
import { OPS_B_ROUTES } from './ops-b.js'
import { OPS_WO_PLACES_ROUTES } from './ops-wo-places.js'
import { PEOPLE_ROUTES } from './people.js'
import { SHARDS_ROUTES } from './shards.js'
import { SHARD_ROUTES } from './shard.js'
import { SITES_ROUTES } from './sites.js'
import { WIDGET_ROUTES } from './widget.js'
import { WEBSITE_OPPORTUNITIES_ROUTES } from './website-opportunities.js'

/** Groups, in the order the reference shows them. */
export const ROUTE_GROUPS = [
  {
    tag: 'MCP',
    description: 'Connect ChatGPT or Claude to one Tracy site through MCP and OAuth.',
    routes: MCP_ROUTES
  },
  {
    tag: 'API v1',
    description:
      'The public REST API on the api host: a site as resources (pages, contents, records, contract, applies), read and changed with a Bearer seat key.',
    routes: API_ROUTES
  },
  {
    tag: 'API v1: Demos',
    description:
      'Demo sites an outside builder (a self-hosted Website Opportunities) asks Tracy for, with an account token of scope `demos`.',
    routes: DEMO_ROUTES
  },
  {
    tag: 'Sites',
    description: 'Creating, building, releasing and changing customer sites.',
    routes: SITES_ROUTES
  },
  {
    tag: 'Website widget',
    description: 'Experimental, operator-enabled voice website discovery and inline sign-in.',
    routes: WIDGET_ROUTES
  },
  {
    tag: 'Website Opportunities',
    description:
      'Operator-enabled: find restaurants, collect their website and social content, write a brief and build a demo site.',
    routes: WEBSITE_OPPORTUNITIES_ROUTES
  },
  { tag: 'Accounts & seats', description: 'Signing in, teams, seats and workspaces.', routes: PEOPLE_ROUTES },
  {
    tag: 'Platform',
    description: 'Mail, badge, configuration, documentation and the workspace door.',
    routes: MISC_ROUTES
  },
  {
    tag: 'Ops',
    description: 'Tracy staff tooling: quickstarts, catalogue, hosts, models.',
    routes: OPS_A_ROUTES
  },
  {
    tag: 'Ops: Invitations',
    description: 'Separate synthetic sandbox and private real-campaign content review; no real sending.',
    routes: [...INVITATIONS_ROUTES, ...INVITATIONS_REAL_ROUTES]
  },
  {
    tag: 'Ops: fleet',
    description: 'Tracy staff tooling: inventory, demos, models and build settings.',
    routes: [...OPS_B_ROUTES, ...OPS_WO_PLACES_ROUTES]
  },
  {
    // docs/sre/hop-dong-cua-shard.md §1: `Shards (master)` here, `Shard (node)` for the shard half's doors.
    tag: 'Shards (master)',
    description: 'The doors shards call on their master, and the Shards screen of /ops.',
    routes: SHARDS_ROUTES
  },
  {
    tag: 'Shard (node)',
    description:
      'The doors a shard answers for the master and its heartbeat, and the one-time hop a person makes into a shard (shard beta).',
    routes: SHARD_ROUTES
  }
]

/** @type {RouteDoc[]} */
export const ROUTE_DOCS = ROUTE_GROUPS.flatMap((group) =>
  group.routes.map((route) => ({ ...route, tag: group.tag }))
)
