// Shard events name DNS labels, never hosts; kept out of label.js, whose rules are mirrored in the
// Add site plugin (packages/site/tracy-add-site/src/client/site-label.mjs, gate infra-contracts).
/**
 * The DNS label of a Tracy address under `siteDomain` (`shop.tracy.ai` → `shop`), or `fallback` for
 * a name outside it (an imported site's own domain). Shard events name labels, never hosts.
 * @param {string} name
 * @param {string} siteDomain
 * @param {string} fallback
 */
export function dnsLabelOf(name, siteDomain, fallback) {
  const suffix = `.${siteDomain}`
  return typeof name === 'string' && name.endsWith(suffix) && name.length > suffix.length
    ? name.slice(0, -suffix.length)
    : fallback
}
