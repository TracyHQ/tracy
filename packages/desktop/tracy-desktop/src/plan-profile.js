/**
 * The customer's own model plan in the desktop app (tasks/todo-desktop-surface.md part B; Lee,
 * 07/10/2026): what the app adds to ITS OWN dsh, on the customer's machine, before starting it.
 *
 * The deployment says, through its public `GET /api/desktop/config`, whether customers may connect
 * a plan and which vendors (`llm.connect`, `llm.providers`, set at `/ops` › User Interface › Desktop
 * App). With connecting on, the app's dsh gets a patch that:
 *
 *   - turns `settings` and `config-editor` on, which `@goodandready/dsh-subscriptions` needs to
 *     store the accounts the customer signs in (the fleet keeps both off, gate `image-profile`);
 *   - limits dsh-subscriptions to the allowed vendors (`allowedVendors`, refused at the plugin's own
 *     sign-in doors too), turns its own card off (`cardPlacement: none`), its header pill and slash
 *     commands too, and its two fallbacks (Ollama, another vendor) so a conversation never leaves
 *     the plan it started on;
 *   - turns on Tracy's Settings › Model plan (`@tracy/dsh-model-plan`, inserted disabled by the native
 *     bundle), the customer's view of those plans over the plugin's routes (Lee, 07/10/2026: the
 *     plugin's card is too technical; keep the plugin underneath, draw a simple section);
 *   - gives the model policy (`@tracy/dsh-mode-picker`) the plan routes, in the allowed order: a new
 *     conversation runs on the first vendor with a signed-in account, else on Tracy's model, and
 *     keeps that answer for its whole life (`session-models.mjs`).
 *
 * 🔒 ADVICE FROM THE SERVER, A DECISION OF THIS MACHINE. The answer only shapes the app's own dsh.
 * Nothing here is ever sent to a shared host, and the fleet image refuses `customerRoutes` and keeps
 * `settings` off whatever this file writes (gate `image-profile`, Dockerfile asserts).
 *
 * The patch is written as JSON flow rows, which YAML reads as they are: no YAML library in the app,
 * and no vendor id can break out of its row.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * The model a conversation runs on for each vendor of dsh-subscriptions 0.6.60. Claude and ChatGPT
 * are chosen (Sonnet, the mid GPT-6); every other one is the first model of the vendor's own default
 * list (`lib/vendors/<id>.js` `defaults().models`). A vendor missing here is still offered on the
 * card, but routes no conversation.
 */
const PLAN_MODELS = Object.freeze({
  claude: 'claude-sonnet-5',
  codex: 'gpt-6-sol',
  copilot: 'gpt-4.1',
  grok: 'grok-4',
  antigravity: 'gemini-3.8-flash-medium',
  kimi: 'kimi-for-coding',
  glm: 'glm-4-plus',
  cursor: 'composer-2.5',
  kiro: 'claude-sonnet-5',
  qwen: 'qwen-2.5-coder-32b-instruct',
  perplexity: 'sonar-reasoning-pro',
  ernie: 'ernie-speed-128k',
  spark: 'spark-max',
  jetbrains: 'jb-claude-3.5-sonnet',
  replit: 'replit-code-v2',
  cody: 'cody-claude-3.5-sonnet'
})

/** A vendor id as dsh-subscriptions spells one (`lib/refs.js`). */
const VENDOR_ID = /^[a-z][a-z0-9_-]*$/

/** How long the app waits for the deployment before starting with what it last read. */
const FETCH_TIMEOUT_MS = 4000

/**
 * The patch for the app's dsh, or null when the deployment does not let customers connect a plan.
 * @param {unknown} config - the body of `GET /api/desktop/config`.
 * @returns {string | null}
 */
function planPatch(config) {
  const llm = config !== null && typeof config === 'object' ? /** @type {any} */ (config).llm : undefined
  if (llm === null || typeof llm !== 'object' || llm.connect !== true || !Array.isArray(llm.providers))
    return null
  const vendors = llm.providers.filter((id) => typeof id === 'string' && VENDOR_ID.test(id))
  if (vendors.length === 0) return null
  const customerRoutes = vendors
    .filter((id) => Object.hasOwn(PLAN_MODELS, id))
    .map((id) => ({ provider: id, model: PLAN_MODELS[id] }))
  const rows = [
    { id: 'settings', disabled: false },
    { id: 'config-editor', disabled: false },
    {
      id: 'dsh-subscriptions',
      config: {
        cardPlacement: 'none',
        headerPill: false,
        slashCommands: false,
        allowedVendors: vendors,
        // A conversation stays on the plan it started on (Lee, 07/10/2026): no silent move to a local
        // Ollama model or to another vendor when the plan's accounts are exhausted or refused.
        ollamaFallback: false,
        cascadingFallback: false
      }
    },
    { id: 'tracy-model-plan', disabled: false },
    // A new chat runs on the first connected plan in `allowedVendors` order (`@tracy/dsh-mode-picker`
    // `decideFresh`): these routes keep that order, and every vendor of dsh-subscriptions has a model
    // here (test `every option the patch sets …`).
    { id: 'tracy-mode-picker', config: { customerRoutes } }
  ]
  return [
    '# Written by the Tracy Cowork app from the deployment answer of GET /api/desktop/config.',
    '# Regenerated at every start; edits here are lost.',
    ...rows.map((row) => `- ${JSON.stringify(row)}`),
    ''
  ].join('\n')
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isConfig = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (/** @type {any} */ (value).llm) === 'object'

/**
 * The deployment's desktop config: fresh from the server when it answers, else the copy kept from the
 * last start, else nothing. Read from the main process, never a renderer: no cookie, no CORS, and a
 * short timeout so a server that is down does not hold the app's start.
 * @param {{
 *   origin: string | undefined,
 *   fetch: (url: string, init: object) => Promise<{ ok: boolean, json(): Promise<unknown> }>,
 *   cacheFile: string,
 *   timeoutMs?: number,
 * }} deps
 * @returns {Promise<{ config: unknown, source: 'server' | 'cache' | 'none' }>}
 */
async function readDesktopConfig({ origin, fetch, cacheFile, timeoutMs = FETCH_TIMEOUT_MS }) {
  if (origin === undefined || origin === '') return { config: null, source: 'none' }
  try {
    const response = await fetch(`${origin.replace(/\/+$/, '')}/api/desktop/config`, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (response.ok) {
      const body = await response.json()
      if (isConfig(body)) {
        try {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
          fs.writeFileSync(cacheFile, JSON.stringify(body))
        } catch {
          // A copy that cannot be kept only costs the next offline start; this one goes on.
        }
        return { config: body, source: 'server' }
      }
    }
  } catch {
    // Down, slow or unreachable: fall through to the copy from the last start.
  }
  try {
    const kept = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (isConfig(kept)) return { config: kept, source: 'cache' }
  } catch {
    // No copy yet, or an unreadable one.
  }
  return { config: null, source: 'none' }
}

/**
 * Whether the window must send this request without its `Referer`.
 *
 * WHY. The local password gate (`dsh-passwords`, `./run.sh native`: gateway 51731 → dsh 51730)
 * rewrites `Host` and `Origin` to the upstream address and passes `Referer` through untouched.
 * dsh-subscriptions 0.6.60 (`lib/http.js` `isTrustedSettingsRequest`) refuses a request whose Referer
 * host differs from its Host, so every GET of its card — `/ui`, `/status`, `/config` — answers 403
 * "same-origin only" in the app (measured 07/10/2026), and the card never appears. Without a Referer
 * the plugin judges the request by its loopback peer, which the gate is. POSTs carry an `Origin`, which
 * the gate rewrites, so they already pass.
 *
 * Only the plugin's own paths on the app's own origin: nothing else changes, and nothing leaves the
 * machine differently. The real fix is the gate rewriting `Referer` as it rewrites `Origin`; until
 * then this keeps the app working.
 * @param {string} url - the request.
 * @param {string} home - the origin the window was opened on.
 * @returns {boolean}
 */
function refererToDrop(url, home) {
  try {
    const target = new URL(url)
    return target.origin === new URL(home).origin && target.pathname.startsWith('/dsh-subscriptions/')
  } catch {
    return false
  }
}

module.exports = { planPatch, readDesktopConfig, refererToDrop, PLAN_MODELS }
