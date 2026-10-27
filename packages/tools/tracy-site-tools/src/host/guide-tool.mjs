/**
 * `tracy_guide` — how a customer uses TRACY ITSELF, answered from Tracy's own guide, in the agent's
 * chat. The pure half: the tool's text and parameters, and what its answer says. The other half
 * (`index.ts`) resolves who is asking and which site, and calls the guide door of tracy-web
 * (`GET /api/sites/_conversation/guide`, `apps/tracy-web/src/sites/guide.js`).
 *
 * WHY IT EXISTS. A customer who could not connect their domain asked the agent in the chat, and the
 * agent knew nothing of Tracy as a product: no domain, publish, backup, export or team in its
 * persona, its AGENTS.md or its site context, and a `web_search` for what Tracy's own screens
 * already say. Typing `/help` is a thing customers do not know to do. The guide is the one place that
 * knows (the `/help` answer reads it too), and the site context points the agent here first
 * (`GUIDE_RULE`, `site-context.mjs`).
 *
 * 🔒 THE DESCRIPTION IS A FUNCTION OF NOTHING (cache rules CS1/CS2, `surface.mjs`): no site, no
 * platform, no role, no switch. Sent on every step of every conversation, so it is short and the same
 * bytes everywhere; `test/guide-tool.test.mjs` holds both. What differs by site, role or switch is in
 * the ANSWER, which the door works out.
 *
 * 🔒 IT NEVER REFUSES WITH A BARE CODE. Every failure (no site in this chat, an older tracy-web with
 * no guide door, Tracy unreachable) is an answer with a `next` that tells the agent what to say, so
 * a miss never sends it to guess a DNS procedure from memory (CLAUDE.md §6, the refusal-next rule).
 */

/** What the model reads, once per step. ≤ 520 characters, held by the test. */
export const GUIDE_DESCRIPTION =
  'tracy_guide: how to use TRACY itself (own domain/DNS, publish, backup/restore, export, team, design system, pricing). Use FIRST when asked how to do something in Tracy or where a button is. Not for editing the site (tracy_site) or other companies\' screens (web_search). Call {q:"their question"}, {topic:"own-domain"}, or {q, recheck:true} to re-read DNS they just set up (Owner). Returns steps, screen link, this site\'s state, who may do it. Nothing found: say you do not know.'

export const GUIDE_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    q: { type: 'string', description: "The customer's question, in their own words." },
    topic: { type: 'string', description: 'An article id from an earlier answer (topics[].id).' },
    recheck: {
      type: 'boolean',
      description: 'With own-domain: look up the DNS records now, as the Check again button does.'
    }
  }
})

/** Longest question sent to the door (it cuts at 400 as well). */
const Q_MAX = 400

/**
 * The call, read once and repaired where a model predictably gets it wrong.
 * @param {unknown} args
 * @returns {{ ok: true, query: string } | { ok: false, code: string, error: string, next: string }}
 */
export function guideCall(args) {
  const a = args && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : {}
  const q =
    typeof a.q === 'string'
      ? a.q.trim().slice(0, Q_MAX)
      : typeof a.query === 'string'
        ? a.query.trim().slice(0, Q_MAX)
        : ''
  const topic = typeof a.topic === 'string' ? a.topic.trim().slice(0, 80) : ''
  if (q === '' && topic === '')
    return {
      ok: false,
      code: 'GUIDE_NEEDS_QUESTION',
      error: 'Say what the customer asked.',
      next: 'Call tracy_guide again with {q:"<their question in their words>"}.'
    }
  const params = new URLSearchParams()
  if (topic !== '') params.set('topic', topic)
  else params.set('q', q)
  if (a.recheck === true) params.set('recheck', '1')
  return { ok: true, query: params.toString() }
}

/**
 * The answer when the guide cannot be reached: what to tell the customer instead of guessing.
 * @param {string} code
 * @param {Record<string, unknown>} [extra]
 */
export function guideUnavailable(code, extra = {}) {
  return {
    ok: false,
    code,
    ...extra,
    next: 'Do not describe Tracy\'s screens or DNS steps from memory. Tell the customer you cannot look that up just now, send them to the Publish tab (My Sites, the site\'s "…" menu, Publish) if it is about the site address or domain, and give the Tracy Discord link if they need a person.'
  }
}

/**
 * The door's answer, shaped for the model: the article text first, then this site's state, who may
 * do it, and the link — one block per article. `ok` stays true on a miss: "the guide has nothing on
 * that" is an answer.
 * @param {any} body
 */
export function guideAnswer(body) {
  const articles = Array.isArray(body?.articles) ? body.articles : []
  if (articles.length === 0)
    return {
      ok: true,
      found: false,
      topics: Array.isArray(body?.topics) ? body.topics : [],
      next: 'The guide has nothing on that. Say you do not know and give the Tracy Discord link; do not invent a feature, a screen or a step. If one of the topics fits, call tracy_guide again with {topic}.'
    }
  return {
    ok: true,
    found: true,
    ...(body.role ? { role: body.role } : {}),
    articles: articles.map((/** @type {any} */ a) => ({
      id: a.id,
      title: a.title,
      guide: a.body,
      ...(a.roleNote ? { who: a.roleNote } : {}),
      ...(Array.isArray(a.state) && a.state.length > 0 ? { thisSite: a.state } : {}),
      ...(a.recheck ? { recheck: a.recheck } : {}),
      ...(a.screen ? { screen: a.screen } : {})
    })),
    next: "Answer in the customer's language, in a few plain steps for THEIR situation (use thisSite: say which record is missing, not the whole procedure). Give the screen as a Markdown link [label](href) copied exactly, so one click opens that tab. Say what only an Owner can do. You cannot press these buttons for them."
  }
}
