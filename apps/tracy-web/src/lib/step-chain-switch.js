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

/**
 * The templates the chain builds for Tracy staff only (an account seated in the `tracy_admin` workspace), while their write
 * is measured on dev; a customer's build of one keeps its own build until it joins the list above. JA Diner on EmDash: the
 * write step writes EmDash since TracyHQ/tracy#754; JA Diner on WordPress: its words through the plugin's contract.
 */
export const STEP_CHAIN_STAFF_TEMPLATES = ['tracy-diner/emdash-0.x', 'ja-diner/wp7']

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
export function stepChainEnabled({ quickstart, env = process.env, staff = false }) {
  if (env.STEP_CHAIN_ENABLED !== '1') return false
  const template = chainTemplateOf(quickstart)
  return STEP_CHAIN_TEMPLATES.includes(template) || (staff && STEP_CHAIN_STAFF_TEMPLATES.includes(template))
}

/**
 * Whether a build of this quickstart by this account runs the step chain: `stepChainEnabled`, with the staff templates for
 * a staff account. The account is read only for a staff template; any doubt reads as not staff.
 * @param {{ quickstart?: string | null, env?: Record<string, string | undefined>,
 *   db: { query: Function }, accountId?: string | null }} args
 */
export async function stepChainFor({ quickstart, env = process.env, db, accountId }) {
  if (stepChainEnabled({ quickstart, env })) return true
  if (!stepChainEnabled({ quickstart, env, staff: true }) || !accountId) return false
  try {
    const { rows } = await db.query(
      `select 1
         from seat_workspace sw
         join workspace w on w.id = sw.workspace_id
        where sw.account_id = $1 and w.kind = 'tracy_admin'
          and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null
        limit 1`,
      [accountId]
    )
    return rows.length > 0
  } catch {
    return false
  }
}
