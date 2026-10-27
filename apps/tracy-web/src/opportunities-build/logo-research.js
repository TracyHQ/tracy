/**
 * 🔒 THE LOGO IS LOOKED FOR BEFORE THE BUILD (product owner, 24/10/2026). A demo whose research never looked for the
 * business's logo (no `brand.logoResearch`, not even "none found") asks the research door for that part alone
 * (`POST /api/website-opportunities/:id/research {only:"logo"}`) the first time it is prepared, and its brief is made
 * only once that research is done or {@link LOGO_RESEARCH_WAIT_MS} after it was asked. Found in time, the brief reads
 * the place again and the build fits the real logo, or draws the wordmark when the research found none; not in time,
 * or refused, the build goes on with the wordmark and the demo action keeps why (`selection.logoResearch`), which the
 * client check reports (`client-demo.js`). The logo is a cosmetic step: nothing here fails a build.
 *
 * 🔒 NOTHING WAITS FOR IT IN A REQUEST (product owner, 24/10/2026): `prepare` runs inside `POST /v1/demos` and
 * `GET /v1/demos/:id`, so a pending research answers `pending` at once and the brief is made by a later prepare —
 * the person's next read, or the demo runner's `reconcile`, which polls a queued action every few seconds.
 */
import { freezeDemoResearchInput } from './revisions.js'

/** How long after asking a brief waits for the logo research before it is made without it. */
export const LOGO_RESEARCH_WAIT_MS = 60_000

/**
 * The research door asked for the logo alone, as the demo's own account: `{ok}` when a run is queued or one already
 * running will answer, else `{ok: false, code}`. The request id is the action's, so asking again joins the same run.
 * @param {{request: (path: string, init?: Record<string, any>) => Promise<Response>, origin: string, cookie: string}} door
 */
export function logoResearchDoor({ request, origin, cookie }) {
  return async (action) => {
    const response = await request(
      `/api/website-opportunities/${encodeURIComponent(action.opportunity_id)}/research`,
      {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: `logo-${action.id}`, only: 'logo' })
      }
    )
    if (response.ok) return { ok: true }
    const body = await response.json().catch(() => null)
    if (body?.code === 'JOB_ACTIVE') return { ok: true }
    return { ok: false, code: body?.code ?? `HTTP_${response.status}` }
  }
}

/**
 * The research input a demo's brief is made from, after the logo research when it has never run, read without
 * waiting: `input` (the place read again once it holds `brand.logoResearch`, else the input frozen at acceptance),
 * `snapshotAt` when read again, and `logoResearch`, the state kept on the action (`requested` → `done`, `timeout` or
 * `failed`). While the research may still answer, `pending: true` and `retryAt`: no brief is made from `input` yet.
 * @param {{query: Function}} db
 * @param {{action: Record<string, any>, now?: () => number, research?: ((action: any) => Promise<{ok: boolean, code?: string}>) | null, freeze?: typeof freezeDemoResearchInput, waitMs?: number}} options
 */
export async function withLogoResearch(
  db,
  {
    action,
    now = Date.now,
    research = null,
    freeze = freezeDemoResearchInput,
    waitMs = LOGO_RESEARCH_WAIT_MS
  }
) {
  const input = action.selection?.researchInput
  const held = action.selection?.logoResearch ?? null
  // Looked for already, "none found" included, or a brief of no researched place: nothing to ask.
  if (!research || !input?.placeSnapshotId || input.brand?.logoResearch) return { input, logoResearch: held }
  if (held && held.state !== 'requested') return { input, logoResearch: held }
  const save = async (state, fresh = null) => {
    const at = new Date(now()).toISOString()
    await db.query(
      `update wo_demo_action set selection = selection || $2::jsonb, updated_at = $3 where id = $1`,
      [
        action.id,
        JSON.stringify({
          logoResearch: state,
          ...(fresh ? { researchInput: fresh, snapshotAt: at } : {})
        }),
        new Date(now())
      ]
    )
    return { input: fresh ?? input, logoResearch: state, ...(fresh ? { snapshotAt: at } : {}) }
  }
  let state = held
  if (!state) {
    const requestedAt = now()
    const asked = await research(action).catch((failure) => ({
      ok: false,
      code: failure?.code ?? 'LOGO_RESEARCH_UNREACHABLE'
    }))
    if (!asked.ok) return save({ state: 'failed', requestedAt, code: asked.code })
    state = { state: 'requested', requestedAt }
    await save(state)
  }
  const fresh = await freeze(db, action.opportunity_id, action.account_id).catch(() => null)
  if (fresh?.brand?.logoResearch) return save({ ...state, state: 'done' }, fresh)
  const retryAt = state.requestedAt + waitMs
  if (now() >= retryAt) return save({ ...state, state: 'timeout' })
  return { input, logoResearch: state, pending: true, retryAt }
}

/**
 * The client check's note when the build went on without the logo research it asked for: a pass that says so, so a
 * wordmark on the demo is never read as "the business has no logo". Null when there is nothing to say.
 * @param {Record<string, any> | null | undefined} logoResearch the action's `selection.logoResearch`
 */
export function logoResearchNote(logoResearch) {
  if (logoResearch?.state !== 'timeout' && logoResearch?.state !== 'failed') return null
  const why =
    logoResearch.state === 'timeout'
      ? `the logo research did not finish within ${LOGO_RESEARCH_WAIT_MS / 1000} s of the build`
      : `the logo research was refused (${logoResearch.code ?? 'unknown'})`
  return {
    id: 'logo-research',
    pass: true,
    measured: why,
    expected: "the business's logo looked for before the build",
    warning: `${why}; the logo is the business's name drawn as a wordmark. Research the logo and rebuild to use its own.`
  }
}
