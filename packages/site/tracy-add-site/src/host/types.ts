/**
 * The minimal shape of what dsh hands the host half — declared in place, NOT imported from
 * `@deepseek-ai/dsh-host-webserver`.
 *
 * 🔒 WHY NOT IMPORT. That package is the host's service: it is present at RUNTIME because dsh loads it, but
 * adding it to the plugin's `dependencies` pulls a second copy onto the customer's disk and opens the way for two
 * copies of different versions to coexist — the same kind of bug that makes `react` `external` in the client half. An
 * `import type` does not save it either, because `check-self-contained` reads `package.json`, not
 * intentions.
 *
 * So: declare exactly the part used, and accept that if dsh changes the shape this place must change
 * with it. That is the known price, paid for a dependency tree with nothing to drift.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

export type WebRouteKind = 'exact' | 'prefix'

export interface WebRoute {
  kind: WebRouteKind
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

export interface HostContext {
  webServer: { register: (route: WebRoute) => () => void }
  effect: (setup: () => () => void, label?: string) => void
  /**
   * The seam of the embed route on the `dsh-better-sidebar` side (since `0.17.1-tracy.13`): tells it how to
   * sign the viewer into the site it is fetching.
   *
   * Declared structurally rather than `import type` from that package: a value import lands in the bundle, and a
   * type import makes this package type-depend on an OPTIONAL peer. The shape below is the
   * contract, and `check-bundles` goes red if the bundle starts carrying the other package.
   */
  sidebarFrame: {
    useCredentials: (
      provider: (url: URL) => { cookie?: string; headers?: Record<string, string> } | null
    ) => () => void
  }
}
