/**
 * The switch that sends a build to the step chain instead of the agent-demo build.
 *
 * A build is on the chain only when its template has a pinned AI quickstart (#598, data only: the AI quickstart pins
 * of #588 read by `lib/ai-quickstart-pins.js`, judged by `website-opportunities/domain` `build-path.mjs`) AND the
 * environment master switch is on (`STEP_CHAIN_ENABLED=1`: on for dev, off for production until dev acceptance
 * passes). No template is named in code: a template joins by being pinned. With the pins file empty, no build is on
 * the chain.
 */
import { aiQuickstartOfTemplate, quickstartTemplateKey } from 'website-opportunities/domain'
import { shippedAiQuickstarts } from './ai-quickstart-pins.js'

/** The workflow marker a site creation carries when the chain builds the site. */
export const STEP_CHAIN_WORKFLOW = 'step-chain/1'

/** A quickstart tag without its release prefix or version suffix: `quickstart/ja-boxing/j6/1.0.10` is `ja-boxing/j6`. */
export const chainTemplateOf = quickstartTemplateKey

/**
 * Whether a build of this quickstart runs the step chain: its template has a pinned AI quickstart, and the master
 * switch is on.
 * @param {{ quickstart?: string | null, env?: Record<string, string | undefined>,
 *   aiQuickstarts?: ReturnType<typeof shippedAiQuickstarts> }} args `aiQuickstarts`: the pinned AI quickstarts
 *   (default: the ones this server ships)
 */
export function stepChainEnabled({ quickstart, env = process.env, aiQuickstarts }) {
  if (env.STEP_CHAIN_ENABLED !== '1') return false
  return aiQuickstartOfTemplate({ quickstart, quickstarts: aiQuickstarts ?? shippedAiQuickstarts() }) !== null
}

/** The same question asked of a build chat draft run (#598); one rule for every build. */
export const aiQuickstartPathEnabled = stepChainEnabled
