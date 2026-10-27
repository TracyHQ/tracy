// H9: the Tracy settings of a gateway, read from the environment beside upstream's.
//
// Upstream 2.7.7 reads none of these. Each is optional and empty means "absent": no seat secret,
// no seat door (and the password door stays); no Tracy origin or actor secret, no Tracy sign-in
// door. A half-configured door is a 404, never a page that invites a retry.

/** The Tracy sign-in door (`/gateway/tracy/*`) and the seat book it asks. */
export interface TracyDoorConfig {
  /** `https://cowork.tracy.ai`: where identity is proven. */
  origin: string;
  /** Where the seat book answers (`/auth/link/*`, `/auth/otp/*`, `/sites/:key/seats`). Empty = `origin`. */
  seatsOrigin: string;
  /** The site this gateway guards. Empty on a host dsh, which serves every site of the machine. */
  siteKey: string;
  /** Signs "I ask on behalf of this address" for the seat book (`x-tracy-actor`). */
  actorSecret: string;
  /** The fleet label naming `/site/<label>`; not derivable from `siteKey` (the fleet hashes it). */
  siteLabel: string;
}

/** What `loadConfig` adds to upstream's config (top level). */
export interface TracyTopLevelConfig {
  /**
   * HMAC key of the seat door (`/gateway/seat/*`). Never derived from SETUP_KEY: it is handed to a
   * caller off this host, and deriving it would make one lane's environment yield its JWT key too.
   */
  seatSecret: string;
  tracy: TracyDoorConfig;
}

type ReadEnv = (name: string, fallback: string) => string;

/**
 * The Tracy keys the gateway a plugin spawns must take from the deployment file, as upstream's own
 * (`MANAGED_ENV_KEYS` in config.ts): a dsh process that inherited a stale seat secret or fleet flag
 * would otherwise hand it to the next gateway it starts.
 */
export const TRACY_MANAGED_ENV_KEYS = [
  'MCP_SEAT_SECRET', 'MCP_TRACY_ORIGIN', 'MCP_TRACY_SEATS_ORIGIN', 'MCP_TRACY_SITE_KEY', 'MCP_TRACY_ACTOR_SECRET',
  'MCP_TRACY_SITE_LABEL', 'MCP_TRACY_FLEET', 'MCP_GATEWAY_TRUSTED_PROXIES',
] as const;

/** The seat secret and the door settings, trimmed; empty when unset. */
export function readTracyConfig(readEnv: ReadEnv): TracyTopLevelConfig {
  return {
    seatSecret: readEnv('MCP_SEAT_SECRET', ''),
    tracy: {
      origin: readEnv('MCP_TRACY_ORIGIN', ''),
      seatsOrigin: readEnv('MCP_TRACY_SEATS_ORIGIN', ''),
      siteKey: readEnv('MCP_TRACY_SITE_KEY', ''),
      actorSecret: readEnv('MCP_TRACY_ACTOR_SECRET', ''),
      siteLabel: readEnv('MCP_TRACY_SITE_LABEL', ''),
    },
  };
}

/**
 * Peers believed about `x-forwarded-prefix` (and trusted for `X-Forwarded-For`): `*`, an address,
 * or an IPv4 CIDR, from `MCP_GATEWAY_TRUSTED_PROXIES`. Absent = loopback only, as upstream.
 */
export function readTrustedProxies(readEnv: ReadEnv): { trustedProxies?: string[] } {
  const list = readEnv('MCP_GATEWAY_TRUSTED_PROXIES', '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return list.length === 0 ? {} : { trustedProxies: list };
}
