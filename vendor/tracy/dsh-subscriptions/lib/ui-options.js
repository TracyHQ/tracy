// Surface options for hosts that embed this plugin (for example a desktop app that
// hides the Plugins page). One normaliser so the host routes and the web client
// read the same answer from the same config.

const CARD_PLACEMENTS = Object.freeze(['plugins', 'settings', 'both', 'none'])

/**
 * @param {Record<string, any> | null | undefined} cfg - plain (unwrapped) plugin config.
 * @returns {{ cardPlacement: 'plugins' | 'settings' | 'both' | 'none', headerPill: boolean, slashCommands: boolean, allowedVendors: string[] }}
 */
export function uiOptions(cfg) {
  const c = cfg || {}
  const cardPlacement = CARD_PLACEMENTS.includes(c.cardPlacement) ? c.cardPlacement : 'plugins'
  const allowedVendors = []
  for (const id of Array.isArray(c.allowedVendors) ? c.allowedVendors : []) {
    if (typeof id !== 'string') continue
    const norm = id.trim().toLowerCase()
    if (norm && !allowedVendors.includes(norm)) allowedVendors.push(norm)
  }
  return {
    cardPlacement,
    headerPill: c.headerPill !== false,
    slashCommands: c.slashCommands !== false,
    allowedVendors,
  }
}

/**
 * An empty allowedVendors list means every vendor is allowed.
 * @param {Record<string, any> | null | undefined} cfg - plain plugin config.
 * @param {string} provider - vendor id.
 * @returns {boolean}
 */
export function vendorAllowed(cfg, provider) {
  const list = uiOptions(cfg).allowedVendors
  return list.length === 0 || list.includes(String(provider || '').toLowerCase())
}

/**
 * The refusal every host door answers with for a vendor outside allowedVendors.
 * @param {string} provider - vendor id.
 * @returns {{ ok: false, error: { code: 'vendor_not_allowed', message: string } }}
 */
export function vendorNotAllowed(provider) {
  return { ok: false, error: { code: 'vendor_not_allowed', message: 'vendor ' + provider + ' is not allowed on this host' } }
}
