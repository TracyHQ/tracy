/**
 * The minimal shape of what dsh hands the host half — declared here, NOT imported from
 * `@deepseek-ai/dsh-*`. Same reason as `tracy-site-tabs/src/host/types.ts`: those packages are
 * the host's own services, present at run time because dsh loads them; adding them to this
 * plugin's `dependencies` pulls a second copy onto the customer's disk, and `check-self-contained`
 * reads `package.json`, not intent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  /** dsh's tool registry: a plain definition object — name · description · parameters · output · execute. */
  tools: { register: (tool: Record<string, unknown>) => () => void }
  effect: (setup: () => () => void, label?: string) => void
}

/** What a bundle may set on this plugin's row. Everything has a default that fits a lane. */
export interface Config {
  /** The site folder that receives `Brand/<host>/`. Default: where dsh stands (same rule as design-inspiration). */
  siteDir?: string
  /**
   * Test injection for the fork doors, which extract for real: a `fetch` for the crawl, harvesters that
   * touch no network, and where the web-clone scripts stand (a directory that does not exist = no recon).
   * A bundle never sets these.
   */
  fetch?: typeof fetch
  enrich?: Record<string, unknown>
  reconScriptsDir?: string
}
