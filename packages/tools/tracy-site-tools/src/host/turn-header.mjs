/**
 * Which chat turn a site call belongs to: the value of `x-tracy-turn` (plan
 * `tasks/todo-site-changes.md` §5–§6, Q2), sent beside `x-tracy-session` on every call to tracy-web.
 *
 * 🔒 THE ROOT AGENT'S TURN, ALSO FOR A SUBAGENT. The person typed into the root conversation; the
 * Site changes tab shows one row per such turn, and joins a write to it by `<root session>:<turn>`
 * alone — never by time. A subagent runs its own session with its own turn numbers, which name
 * nothing the person did, so a subagent's call walks dsh's agent registry (`ctx.agents`: who owns
 * whom, at run time) up to its root and carries the root's current turn.
 *
 * The root's current turn is the `turn` of its latest `agent/pre-step` (every step names the turn it
 * belongs to), noted by `index.ts`. Nothing is guessed: no registry, a session that is no live agent,
 * or a root that has not stepped yet → null, and the write goes out as an "unknown turn" — never
 * refused over its label.
 */

/** A turn id's session part, as tracy-web and `webroot-git.sh` check it. */
const SESSION_SHAPE = /^[A-Za-z0-9_-]{1,128}$/

/** How far up a subagent chain the walk goes before giving up (a loop would be a registry bug). */
const MAX_DEPTH = 8

/**
 * @typedef {{ session: { id: string } }} AgentRef
 * @typedef {{ roots: () => AgentRef[], list: () => AgentRef[], isOwnedBy: (id: string, owner: AgentRef) => boolean }} Registry
 */

/**
 * @param {() => Registry | undefined} registry - dsh's `ctx.agents`, read at call time.
 */
export function createTurnLedger(registry) {
  /** @type {Map<string, number>} root session id → its current turn */
  const current = new Map()

  /** @param {string} sessionId */
  const isRoot = (sessionId) => {
    const agents = registry()
    return agents !== undefined && agents.roots().some((a) => a.session.id === sessionId)
  }

  /**
   * The root session `sessionId` runs under (itself when it is a root), or null.
   * @param {string} sessionId
   * @returns {string | null}
   */
  function rootOf(sessionId) {
    const agents = registry()
    if (agents === undefined) return null
    let id = sessionId
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      if (agents.roots().some((a) => a.session.id === id)) return id
      const owner = agents.list().find((a) => agents.isOwnedBy(id, a))
      if (owner === undefined) return null
      id = owner.session.id
    }
    return null
  }

  return {
    /**
     * A step of `sessionId` is about to run in `turn`. Only a root's step moves the turn.
     * @param {string} sessionId
     * @param {number} turn
     */
    noteStep(sessionId, turn) {
      if (!SESSION_SHAPE.test(sessionId) || !Number.isInteger(turn) || turn < 0) return
      if (isRoot(sessionId)) current.set(sessionId, turn)
    },

    /**
     * The `x-tracy-turn` value for a call made by `sessionId`'s agent, or null.
     * @param {string | null | undefined} sessionId
     * @returns {string | null}
     */
    turnIdFor(sessionId) {
      if (typeof sessionId !== 'string' || !SESSION_SHAPE.test(sessionId)) return null
      const root = rootOf(sessionId)
      if (root === null) return null
      const turn = current.get(root)
      return turn === undefined ? null : `${root}:${turn}`
    },

    /** A root session ended: forget its turn. @param {string} sessionId */
    forget(sessionId) {
      current.delete(sessionId)
    }
  }
}
