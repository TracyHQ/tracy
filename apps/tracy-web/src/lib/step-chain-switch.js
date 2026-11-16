/**
 * The switch that sends a build from business links to the step chain instead of the agent-demo build.
 *
 * A template is on the chain only when it is listed here (changed by PR) AND the environment master switch is on
 * (`STEP_CHAIN_ENABLED=1`: on for dev, off for production until dev acceptance passes).
 *
 * A run built from an approved build draft (the AI quickstart build, #598) does not read the list: it is on the chain
 * when its template has a pinned AI quickstart (`aiQuickstartPathEnabled`, data only: `lib/ai-quickstart-pins.js`),
 * under the same master switch.
 */
import { aiQuickstartOfTemplate, quickstartTemplateKey } from 'website-opportunities/domain'
import { shippedAiQuickstarts } from './ai-quickstart-pins.js'

/** The workflow marker a site creation carries when the chain builds the site. */
export const STEP_CHAIN_WORKFLOW = 'step-chain/1'

/** The templates (as `<design>/<kind>`, no version) the chain builds. */
export const STEP_CHAIN_TEMPLATES = ['ja-boxing/j6', 'ja-diner/j6']

/** A quickstart tag without its release prefix or version suffix: `quickstart/ja-boxing/j6/1.0.10` is `ja-boxing/j6`. */
export const chainTemplateOf = quickstartTemplateKey

/**
 * Whether a build of this quickstart runs the step chain.
 * @param {{ quickstart?: string | null, env?: Record<string, string | undefined> }} args
 */
export function stepChainEnabled({ quickstart, env = process.env }) {
  return env.STEP_CHAIN_ENABLED === '1' && STEP_CHAIN_TEMPLATES.includes(chainTemplateOf(quickstart))
}

/**
 * Whether a build of this quickstart may take the AI quickstart build: its template has a pinned AI quickstart, and
 * the master switch is on. No template is named in code.
 * @param {{ quickstart?: string | null, env?: Record<string, string | undefined>,
 *   aiQuickstarts?: ReturnType<typeof shippedAiQuickstarts> }} args `aiQuickstarts`: the pinned AI quickstarts
 *   (default: the ones this server ships)
 */
export function aiQuickstartPathEnabled({ quickstart, env = process.env, aiQuickstarts }) {
  if (env.STEP_CHAIN_ENABLED !== '1') return false
  return aiQuickstartOfTemplate({ quickstart, quickstarts: aiQuickstarts ?? shippedAiQuickstarts() }) !== null
}
