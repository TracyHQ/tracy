/**
 * Is this request on the desktop app's update host (`UPDATE_ORIGIN`, e.g. `update.tracy.ai`)? The
 * one implementation, as `api-host.js` is for the API host: `app.js` routes that hostname to the
 * feed and nothing else, BEFORE customer-site routing — `update.tracy.ai` is also the shape of a
 * site address on `tracy.ai`.
 * @param {string|null|undefined} hostHeader - the raw `Host` header, port and all.
 * @param {object} config - `readConfig`'s value (`updateOrigin`).
 * @returns {boolean}
 */
export function isUpdateHost(hostHeader, config) {
  const origin = config?.updateOrigin
  if (typeof origin !== 'string' || origin === '') return false
  let expected
  try {
    expected = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }
  const hostname = String(hostHeader ?? '')
    .split(':')[0]
    .toLowerCase()
    .trim()
  return hostname !== '' && hostname === expected
}
