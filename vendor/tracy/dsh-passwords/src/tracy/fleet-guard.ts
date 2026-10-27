import type { TracyPolicy } from './policy.js';
import { tracyPolicy } from './index.js';

/**
 * Exit code of a fleet gateway that refuses to start. Upstream uses 1 and 30–37
 * (cli.ts, plugin.ts `PERMANENT_GATEWAY_EXIT_CODES`); 38 is free.
 */
export const EXIT_TRACY_FLEET_GUARD = 38;

/**
 * Why a fleet gateway must not start, or null. `MCP_TRACY_FLEET=1` (set by the fleet's
 * host-dsh-init.sh) marks a host that serves customer seats: there the gateway runs only with the
 * Tracy policy plugged in, a seat secret and an explicit DSH root. A missing secret is not taken as
 * "not a fleet host"; that would drop the seat fence silently. No public host is required: tracy-web
 * strips the browser's `Origin` and `Referer` before a request reaches the gateway
 * (`apps/tracy-web/src/workspace/proxy.js`), and upstream passes a request that carries no `Origin`.
 */
export function tracyFleetStartupProblem(env: Readonly<Record<string, string | undefined>>, policy: TracyPolicy): string | null {
  if (env.MCP_TRACY_FLEET?.trim() !== '1') return null;
  if (policy !== tracyPolicy) return `MCP_TRACY_FLEET=1 but the gateway policy is "${policy.name}", not the Tracy policy`;
  if ((env.MCP_SEAT_SECRET ?? '').trim() === '') return 'MCP_TRACY_FLEET=1 requires MCP_SEAT_SECRET';
  if ((env.MCP_DSH_ROOT ?? '').trim() === '') return 'MCP_TRACY_FLEET=1 requires MCP_DSH_ROOT';
  return null;
}
