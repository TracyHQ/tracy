/** Provider-specific OAuth and wire code. Endpoints and model choices are server-owned. */
import * as claude from './wire/vendors/claude.js'
import * as codex from './wire/vendors/codex.js'
import * as copilot from './wire/vendors/copilot.js'
import * as grok from './wire/vendors/grok.js'
import * as antigravity from './wire/vendors/antigravity.js'
import * as kimi from './wire/vendors/kimi.js'
import * as glm from './wire/vendors/glm.js'
import * as qwen from './wire/vendors/qwen.js'
import { keyIdentity } from './wire/api-key.js'

export const providers = { claude, codex, copilot, grok, antigravity, kimi, glm, qwen }
export const models = {
  claude: 'claude-sonnet-5',
  codex: 'gpt-6.1-sol',
  copilot: 'gpt-4.1',
  grok: 'grok-4',
  antigravity: 'gemini-3.8-flash-medium',
  // The id Kimi tells third-party tools to use (kimi.com/coding/docs).
  kimi: 'kimi-for-coding',
  // The id in Z.ai's tool examples (docs.z.ai/devpack/tool/others).
  glm: 'glm-5.2',
  // The id in Model Studio's OpenAI-compatible examples (alibabacloud.com/help/en/model-studio).
  qwen: 'qwen-plus'
}
export const names = {
  claude: 'Claude',
  codex: 'ChatGPT Codex',
  copilot: 'GitHub Copilot',
  grok: 'Grok',
  antigravity: 'Antigravity (Gemini)',
  kimi: 'Kimi',
  glm: 'GLM',
  qwen: 'Qwen'
}

export async function identityOf(provider, blob, fetchImpl) {
  // A pasted key names no vendor account: the key itself is the identity (its full hash).
  if (providers[provider]?.signIn === 'key' && blob?.kind === 'key' && typeof blob.apiKey === 'string')
    return keyIdentity(blob.apiKey)
  if (provider === 'codex' && blob.accountId)
    return { subject: blob.accountId, label: blob.email || 'ChatGPT Codex' }
  if (provider === 'claude') {
    const { raw } = await claude.check(blob, claude.defaults(), fetchImpl)
    const subject = raw.account?.uuid ?? raw.account?.id ?? raw.uuid ?? raw.id
    if (typeof subject === 'string' && subject)
      return { subject, label: raw.account?.email ?? raw.email ?? 'Claude' }
  }
  if (provider === 'copilot') {
    // The numeric GitHub id survives a login rename; the login is what the person recognises.
    const person = blob.githubId
      ? blob
      : await copilot.check(blob, copilot.defaults(), fetchImpl).then(({ raw }) => ({
          githubId: raw?.id != null ? String(raw.id) : '',
          login: raw?.login,
          email: raw?.email
        }))
    if (person.githubId)
      return { subject: person.githubId, label: person.login || person.email || 'GitHub Copilot' }
  }
  if (provider === 'grok') {
    const identity = grok.identity(blob)
    if (identity) return identity
  }
  if (provider === 'antigravity') {
    const { subject, email } = await antigravity.identity(blob, fetchImpl)
    if (subject) return { subject, label: email || blob.email || 'Antigravity' }
  }
  throw new Error('SUBSCRIPTION_IDENTITY_UNAVAILABLE')
}

/**
 * Which inputs `model` takes on `provider`: `['text', 'image']` or `['text']`, from the vendor's own
 * table. The broker decides from this, on every attempt, whether a request may carry pictures.
 * @param {string} provider
 * @param {string} model
 * @returns {string[]}
 */
export function inputModalities(provider, model) {
  const answer = providers[provider]?.inputModalities?.(model)
  return Array.isArray(answer) && answer.includes('image') ? ['text', 'image'] : ['text']
}

/** A 429 alone is not evidence of subscription exhaustion. Never route on a transient rate limit. */
export function exhausted(error) {
  if (![402, 429].includes(error?.status)) return false
  // `run out of credits` / `spending-limit`: Grok's 402 on an account without credits (measured 10/10/2026).
  // `limit exhausted` / `insufficient balance` / `package has expired`: Z.ai's 429s 1310, 1113 and 1309
  // (docs.z.ai/api-reference/api-code; its other plan limits already read `usage limit reached`).
  // `exceeded your current quota`: Model Studio's 429 for quota or arrears
  // (alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope).
  return /usage.?limit|usage_limit_reached|quota.?exceeded|weekly.?limit|credit.?balance|insufficient_quota|limit.*reset|out of credits|spending.?limit|limit exhausted|insufficient balance|package has expired|exceeded your current quota/i.test(
    String(error.message)
  )
}
