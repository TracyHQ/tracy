// H0 / K5: the gateway behind a reverse proxy that publishes it under a path.
//
// Tracy serves a lane under `cowork.tracy.ai/<siteKey>/…` and names that prefix in
// `x-forwarded-prefix`. A proxy the gateway trusts (`MCP_GATEWAY_TRUSTED_PROXIES`, loopback when
// unset) may name it; the gateway takes it off `req.url` before routing, so its own `/gateway/*`
// doors keep their root paths and every path rule sees the mount-relative path. What leaves for the
// browser (form actions, redirects, cookie paths) gets it back through `mountOf` / `currentMount`.
// The header is pinned to what was applied: a value the gateway did not vouch for is deleted, so it
// never reaches dsh from the gateway's loopback address.
//
// The proxy's HTTP handler classifies the mount-relative `req.url` (never `req.originalUrl`, which
// Express set before this middleware ran) and puts `mountOf(req)` back in front of the path it
// sends dsh, with the header — exactly what dsh needs to anchor its `<base href>` at the mount.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage } from 'node:http';

export const FORWARDED_PREFIX = 'x-forwarded-prefix';
/** One or more `/segment`s, none of them `.` or `..`, no trailing slash. Same rule as dsh's web server. */
const MOUNT_PREFIX = /^(?:\/[A-Za-z0-9._~-]*[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/;
export const LOOPBACK_PEERS: readonly string[] = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

const mounts = new WeakMap<IncomingMessage, string>();
const current = new AsyncLocalStorage<string>();

/** Whether `peer` (a socket remote address) is one of the proxies allowed to name the mount. */
export function peerTrusted(peer: string, trustedProxies: readonly string[]): boolean {
  for (const entry of trustedProxies) {
    if (entry === '*' || entry === peer) return true;
    const cidr = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(entry);
    const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(peer);
    if (cidr === null || v4 === null) continue;
    const bits = Number(cidr[5]);
    if (bits < 0 || bits > 32) continue;
    const toInt = (a: string, b: string, c: string, d: string): number =>
      ((Number(a) << 24) | (Number(b) << 16) | (Number(c) << 8) | Number(d)) >>> 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((toInt(cidr[1]!, cidr[2]!, cidr[3]!, cidr[4]!) & mask) === (toInt(v4[1]!, v4[2]!, v4[3]!, v4[4]!) & mask)) return true;
  }
  return false;
}

/** The proxies a gateway believes: its configured list, else loopback only. */
export function trustedProxiesOf(configured: readonly string[] | undefined): readonly string[] {
  return configured !== undefined && configured.length > 0 ? configured : LOOPBACK_PEERS;
}

/**
 * Take a trusted proxy's mount prefix off `req.url`, in place, and pin the header to what was
 * applied: a validated value stays for dsh to read; anything else is deleted.
 * @param stripPath - false for an upgrade: the WebSocket proxy forwards `req.url` itself, so the
 *   path keeps the prefix there and only the header is pinned (see TRACY-FORK.md §3, H0/H13).
 * @returns the prefix applied, or '' when none.
 */
export function unmount(req: IncomingMessage, trustedProxies: readonly string[], stripPath = true): string {
  const raw = req.headers[FORWARDED_PREFIX];
  const prefix = Array.isArray(raw) ? raw[0] : raw;
  const url = req.url ?? '/';
  let mount = '';
  if (
    prefix !== undefined &&
    MOUNT_PREFIX.test(prefix) &&
    peerTrusted(req.socket?.remoteAddress ?? '', trustedProxies) &&
    (url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`))
  ) {
    if (stripPath) {
      const rest = url.slice(prefix.length);
      req.url = rest === '' || rest.startsWith('?') ? `/${rest}` : rest;
    }
    mount = prefix;
  }
  if (mount === '') delete req.headers[FORWARDED_PREFIX];
  else req.headers[FORWARDED_PREFIX] = mount;
  mounts.set(req, mount);
  return mount;
}

/** The mount this request arrived under: '' at the root, else `/<prefix>`. */
export function mountOf(req: IncomingMessage): string {
  return mounts.get(req) ?? '';
}

/**
 * H0 as Express middleware: the first thing every request meets. It unmounts, then runs the rest of
 * the chain inside the request's mount, so a page renderer with no request in hand
 * (`currentMount`) still writes the mounted paths.
 */
export function mountMiddleware(trustedProxies: readonly string[] | undefined) {
  const trusted = trustedProxiesOf(trustedProxies);
  return (req: IncomingMessage, _res: unknown, next: () => void): void => {
    const mount = unmount(req, trusted);
    current.run(mount, next);
  };
}

/** The mount of the request being served, for code that renders without the request. */
export function currentMount(): string {
  return current.getStore() ?? '';
}

/** Express `trust proxy` for the same peers (`X-Forwarded-For` → `req.ip`): loopback when unset, as upstream. */
export function trustProxySetting(trustedProxies: readonly string[] | undefined): boolean | string[] | 'loopback' {
  if (trustedProxies === undefined || trustedProxies.length === 0) return 'loopback';
  if (trustedProxies.includes('*')) return true;
  return ['loopback', ...trustedProxies];
}
