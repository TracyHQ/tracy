/**
 * The switch that sends a build from business links to the step chain instead of the agent-demo build.
 *
 * A template is on the chain only when it is listed here (changed by PR) AND the environment master switch is on
 * (`STEP_CHAIN_ENABLED=1`: on for dev, off for production until dev acceptance passes).
 */

/** The workflow marker a site creation carries when the chain builds the site. */
export const STEP_CHAIN_WORKFLOW = 'step-chain/1'

/** The templates (as `<design>/<kind>`, no version) the chain builds. */
export const STEP_CHAIN_TEMPLATES = ['ja-boxing/j6', 'ja-diner/j6']

/** A quickstart tag without its release prefix or version suffix: `quickstart/ja-boxing/j6/1.0.10` is `ja-boxing/j6`. */
export function chainTemplateOf(quickstart) {
  if (typeof quickstart !== 'string') return ''
  return quickstart
    .trim()
    .replace(/^quickstart\//, '')
    .replace(/@.*$/, '')
    .replace(/\/v?\d+(\.\d+)*$/, '')
}

/**
 * Whether a build of this quickstart runs the step chain.
 * @param {{ quickstart?: string | null, env?: Record<string, string | undefined> }} args
 */
export function stepChainEnabled({ quickstart, env = process.env }) {
  return env.STEP_CHAIN_ENABLED === '1' && STEP_CHAIN_TEMPLATES.includes(chainTemplateOf(quickstart))
}
