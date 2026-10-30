/**
 * `tracy_build_check` — the site build rules checked on one page, in the agent's chat (spec TracyHQ/tracy#189, COO
 * decision 30/10/2026). The pure half: the tool's text and parameters, the call, and what its answer says. The other half
 * (`index.ts`) resolves who is asking and which site, and calls the build-check door of tracy-web
 * (`GET /api/sites/_conversation/build-check?path=`, `apps/tracy-web/src/opportunities-build/page-build-check.js`).
 *
 * WHY IT EXISTS. A brief build ends with the final checks of the site build rules registry (`build-rules.mjs`): sibling
 * cards in one shape, the footer shape, every channel on the Contact page, menu items named by their page, no demo left.
 * An owner's later edit ("add a lesson") went through the agent with none of them, so one new card could break the
 * parity the build had made. The agent's skill `site-build-rules` and the site context (`BUILD_RULES_RULE`,
 * `site-context.mjs`) send it here after it changed a page.
 *
 * 🔒 THE DESCRIPTION IS A FUNCTION OF NOTHING (cache rules CS1/CS2, `surface.mjs`): the same bytes on every step of every
 * conversation. 🔒 IT NEVER REFUSES WITH A BARE CODE: every failure answers a `next` that tells the agent what to do.
 */

/** What the model reads, once per step. ≤ 400 characters, held by the test. */
export const BUILD_CHECK_DESCRIPTION =
  'tracy_build_check: check one page of this site against its build rules (sibling cards in one shape, footer shape, Contact page channels, menu names, no template demo left). Call {path:"/the/page"} after you changed that page, and once with {path:"/"} after a menu or footer change. Returns what to fix there, blockers first, with what to put instead. Read-only.'

export const BUILD_CHECK_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The page you changed, a site address such as "/lessons".' }
  }
})

/**
 * The call, read once and repaired where a model predictably gets it wrong (a full URL, no leading slash).
 * @param {unknown} args
 * @returns {{ ok: true, path: string, query: string } | { ok: false, code: string, error: string, next: string }}
 */
export function buildCheckCall(args) {
  const a = args && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : {}
  let raw = typeof a.path === 'string' ? a.path.trim() : typeof a.page === 'string' ? a.page.trim() : '/'
  const absolute = /^https?:\/\/[^/]+(\/.*)?$/i.exec(raw)
  if (absolute) raw = absolute[1] ?? '/'
  if (raw === '') raw = '/'
  if (!raw.startsWith('/')) raw = `/${raw}`
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (path.startsWith('//') || path.length > 300 || /[\s\\]|\/\.\.?(?:\/|$)/.test(path))
    return {
      ok: false,
      code: 'BUILD_CHECK_BAD_PATH',
      error: 'That is not a page address of this site.',
      next: 'Call tracy_build_check again with {path:"/the/page"}, the address the page is served at.'
    }
  return { ok: true, path, query: new URLSearchParams({ path }).toString() }
}

/**
 * The answer when the check cannot run: what the agent does instead of guessing.
 * @param {string} code
 * @param {Record<string, unknown>} [extra]
 */
export function buildCheckUnavailable(code, extra = {}) {
  return {
    ok: false,
    code,
    ...extra,
    next: 'The build check could not run. Look at the page yourself against the site-build-rules skill (siblings in one shape, the footer shape, the Contact page, menu names), and tell the customer the automatic check was not available.'
  }
}

/**
 * The door's answer, shaped for the model: the findings first, each with what to put instead.
 * @param {any} body
 */
export function buildCheckAnswer(body) {
  const findings = Array.isArray(body?.findings) ? body.findings : []
  const broken = Array.isArray(body?.broken) ? body.broken : []
  if (findings.length === 0 && broken.length === 0)
    return {
      ok: true,
      pass: true,
      path: body?.path ?? null,
      next: 'This page keeps the build rules. Tell the customer what you changed.'
    }
  return {
    ok: true,
    pass: false,
    path: body?.path ?? null,
    blockers: Number(body?.blockers ?? 0),
    ...(broken.length ? { broken } : {}),
    findings: findings.map((/** @type {any} */ f) => ({
      ...(f.rule ? { rule: f.rule } : {}),
      ...(f.blocks ? { blocks: true } : {}),
      where: [f.page, f.place].filter(Boolean).join(' | ') || 'the whole site',
      ...(f.found ? { found: f.found } : {}),
      ...(f.instead ? { instead: f.instead } : {}),
      ...(f.guarantee ? { why: f.guarantee } : {})
    })),
    ...(Number(body?.more) > 0 ? { more: Number(body.more) } : {}),
    next: 'Fix each finding at its place with its instead text, blockers first, touching nothing else; a hard fact (price, phone, address, hours, name, year, guarantee) only from the customer. Then call tracy_build_check again. What you cannot fix, tell the customer plainly.'
  }
}
