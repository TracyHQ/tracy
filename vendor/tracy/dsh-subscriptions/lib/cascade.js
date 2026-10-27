// #349: Cascading Cross-Vendor Fallback Engine
// When a primary vendor's accounts are all exhausted (or return 429/503),
// route seamlessly to a compatible alternative vendor.

export const DEFAULT_CASCADE_CHAINS = {
  claude: ['copilot', 'cursor', 'antigravity'],
  codex: ['copilot', 'cursor'],
  grok: ['copilot', 'antigravity'],
  copilot: ['cursor', 'codex'],
  cursor: ['copilot', 'claude'],
  antigravity: ['copilot', 'claude'],
  kimi: ['qwen', 'glm', 'spark'],
  glm: ['kimi', 'qwen', 'spark'],
  qwen: ['kimi', 'glm', 'spark'],
  spark: ['qwen', 'kimi', 'glm'],
  jetbrains: ['copilot', 'cursor'],
  perplexity: ['copilot', 'cursor'],
  replit: ['copilot', 'cursor'],
  cody: ['copilot', 'cursor'],
  kiro: ['copilot', 'cursor'],
  ernie: ['qwen', 'glm'],
}

/**
 * Resolves the next candidate fallback provider from the cascade chain.
 * @param {string} currentProvider - currently failing provider
 * @param {Set<string>|Array<string>} availableProviders - providers that currently have logged-in accounts
 * @param {Record<string, string[]>} [customChains] - user-configured custom chains
 * @param {Set<string>} [visited] - set of already attempted providers in this request cascade
 * @returns {string|null} - the next candidate provider or null if none available
 */
export function resolveFallbackVendor(currentProvider, availableProviders, customChains = {}, visited = new Set()) {
  const availSet = new Set(availableProviders || [])
  const chain = (customChains && customChains[currentProvider]) || DEFAULT_CASCADE_CHAINS[currentProvider] || []

  for (const candidate of chain) {
    if (candidate !== currentProvider && !visited.has(candidate) && availSet.has(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Maps a model identifier across vendors if needed.
 * @param {string} sourceProvider
 * @param {string} sourceModel
 * @param {string} targetProvider
 * @returns {string} target model name
 */
export function mapFallbackModel(sourceProvider, sourceModel, targetProvider) {
  const model = String(sourceModel || '').toLowerCase()
  // If fallback to copilot/cursor from claude, prefer claude-compatible tag if requested
  if ((targetProvider === 'copilot' || targetProvider === 'cursor') && model.includes('claude')) {
    return 'claude-3-5-sonnet'
  }
  if (targetProvider === 'codex' && model.includes('claude')) {
    return 'gpt-4o'
  }
  return sourceModel
}
