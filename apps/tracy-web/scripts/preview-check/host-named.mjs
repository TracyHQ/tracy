/**
 * The address a probe opens a stand's pages at: a host name, never a bare loopback IP (probe 10, 18/10/2026).
 *
 * A stand (stand.mjs, lane.mjs) answers at http://127.0.0.1:<port>, and the probes opened its pages there. Some
 * YouTube videos refuse to play when the page embedding them is served from an IP address: JA Spa 1.0.7's
 * /our-spa video (dbKgJ0DG4T0, the same id JoomlArt's own demo embeds) showed "This video is unavailable" from
 * 127.0.0.1 and 10.0.0.2, and played from localhost, *.tracy.test and *.tracy.site, so PREV-1 (embed-error) failed
 * a page every customer sees playing. A customer's site always has a host name, so the probes read a loopback
 * stand at `localhost` instead: same machine, same port, same server, only the origin the page runs under
 * changes. Everything a probe derives from the address (the live frame's document origin, the ticket's origin
 * check, the picture door's allowed origin, the menu links it follows) follows it, as they all read this one
 * address. A public demo (https://…) or a non-loopback IP is left as it is: there is no name to give it here.
 */

/** IPv4 127.0.0.0/8 or IPv6 ::1, as URL writes the host name ("[::1]"). */
const LOOPBACK_IP = /^(127(\.\d{1,3}){3}|\[::1\])$/

/**
 * @param {string} address an absolute URL (a stand's or a public demo's)
 * @returns {string} the same URL, its loopback IP host replaced by `localhost`
 */
export function hostNamedAddress(address) {
  const u = new URL(address)
  if (!LOOPBACK_IP.test(u.hostname)) return address
  u.hostname = 'localhost'
  return u.href
}
