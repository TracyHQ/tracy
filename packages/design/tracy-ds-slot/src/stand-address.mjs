/**
 * The address a stand (scripts/stand.mjs) gives the site it restores (probe 10, 18/10/2026).
 *
 * The preview probes open a loopback stand at `localhost`, never at a bare IP
 * (apps/tracy-web/scripts/preview-check/host-named.mjs: some YouTube videos refuse to play inside a page
 * served from an IP). WordPress keeps its own address (`home` / `siteurl`) and answers any other host with a
 * 301 to it (redirect_canonical), so a WordPress stand set to http://127.0.0.1:<port> sent the probe's
 * http://localhost:<port>/ back to 127.0.0.1, and the home page was left unmeasured as LEAVES_SITE
 * (JA Kinetic WordPress 1.0.10, 18/10/2026). A WordPress stand is therefore set to the host name the probes
 * open. Joomla answers whatever host it is asked at, so its stand keeps 127.0.0.1 as before.
 * The container port stays published on 127.0.0.1 in both cases: only the site's own address changes.
 */

/**
 * @param {string} platform 'joomla' | 'wordpress'
 * @param {number | string} port the stand's published port
 * @returns {string} the site's address, no trailing slash
 */
export function standAddressOf(platform, port) {
  const host = platform === 'wordpress' ? 'localhost' : '127.0.0.1'
  return `http://${host}:${port}`
}
