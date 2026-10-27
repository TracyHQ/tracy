// Built-in providers + dynamic ones from Config.customVendors.
export const BUILTIN_PROVIDERS = Object.freeze([
  'codex',
  'claude',
  'grok',
  'antigravity',
  'kimi',
  'glm',
  'cursor',
  'kiro',
  'copilot',
  'qwen',
  'ernie',
  'spark',
  'jetbrains',
  'perplexity',
  'replit',
  'cody',
])

const dynamicIds = new Set()
const displayExtra = {}

export let PROVIDERS = [...BUILTIN_PROVIDERS]

export function registerCustomProviderIds(ids) {
  let changed = false
  for (const id of ids || []) {
    if (typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id) && !dynamicIds.has(id)) {
      dynamicIds.add(id)
      changed = true
    }
  }
  if (changed) PROVIDERS = listProviders()
}

export function listProviders() {
  return [...BUILTIN_PROVIDERS, ...dynamicIds]
}

export function registerDisplayName(id, name) {
  if (id && name) displayExtra[id] = name
}

export function isProvider(value) {
  return BUILTIN_PROVIDERS.includes(value) || dynamicIds.has(value)
}

const DISPLAY = {
  codex: 'ChatGPT Codex',
  claude: 'Claude',
  grok: 'Grok',
  antigravity: 'Antigravity',
  kimi: 'Moonshot Kimi',
  glm: 'Zhipu GLM',
  cursor: 'Cursor',
  kiro: 'AWS Kiro',
  copilot: 'GitHub Copilot',
}

export function displayName(provider) {
  return DISPLAY[provider] || displayExtra[provider] || provider
}

/**
 * @param {string} provider
 * @param {number} index
 * @returns {string} provider-scoped credential ref, e.g. CODEX_OAUTH_1
 */
export function oauthRef(provider, index) {
  const n = Number(index)
  if (!Number.isInteger(n) || n < 1) throw new Error('account index must be an integer >= 1')
  return `${String(provider).toUpperCase()}_OAUTH_${n}`
}

export function parseOauthRef(ref) {
  if (typeof ref !== 'string') return null
  const match = /^([A-Z][A-Z0-9_]*)_OAUTH_([1-9][0-9]*)$/.exec(ref)
  if (!match) return null
  return { provider: match[1].toLowerCase(), index: Number(match[2]) }
}

export function droppedCredentialRefs(previousSlots, nextSlots) {
  const keep = new Set()
  for (const slot of nextSlots || []) {
    if (!slot || !slot.provider) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    keep.add(oauthRef(slot.provider, index))
  }
  const out = []
  const seen = new Set()
  for (const slot of previousSlots || []) {
    if (!slot || !slot.provider) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref) || keep.has(ref)) continue
    seen.add(ref)
    out.push(ref)
  }
  return out
}
