/**
 * The ports one lane of lane.mjs uses, every step its own, so lanes running side by side never meet.
 *
 * Before 18/10/2026 PREVIEW-PARITY listened on 9750+N, the port of lane 5's preview dark (9700+N*10+1), and
 * lanes in parallel died EADDRINUSE 127.0.0.1:9751; the preview Chrome (preview-check.mjs and
 * preview-parity.mjs open 9450 + port % 50) repeated every 5 lanes. Now:
 *   servers  (preview light, preview dark, parity, on this Mac): 10000 + 3*(N-1) + 0..2 -> 10000..10044 at N=15,
 *            so 9450 + port % 50 gives every server its own Chrome number (9450..9494)
 *   Chromes  (flow here, verify on the iMac): 10100 + 2*(N-1) + 0..1 -> 10100..10129
 *   stands   (iMac, mirrored by ~/bin/imac-tunnel): b2-l<N> on 52980+N, build/verify 52300+N*10 .. +2 (unchanged)
 * All of it stays clear of what agents pass by hand (preview-check 9611, preview-parity 9660, 93xx-98xx).
 * cdp.mjs starts each Chrome on port 0 since 14/10, so the Chrome numbers are nominal; they are kept distinct
 * so that a Chrome which ever takes its number again cannot meet another lane's.
 */
export const MAX_LANE = 15

const SERVERS = 10000
const CHROMES = 10100

/** @param {number} n lane 1..MAX_LANE */
export function lanePorts(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_LANE) throw new Error(`lane ${n}: 1..${MAX_LANE}`)
  const s = SERVERS + 3 * (n - 1)
  const c = CHROMES + 2 * (n - 1)
  return {
    stand: 52980 + n,
    build: 52300 + n * 10,
    flowCdp: c,
    verifyCdp: c + 1,
    previewLight: s,
    previewDark: s + 1,
    parity: s + 2,
    servers: [s, s + 1, s + 2]
  }
}

/** The Chrome number preview-check.mjs and preview-parity.mjs derive from their --port. */
export const chromeOfServer = (port) => 9450 + (port % 50)
