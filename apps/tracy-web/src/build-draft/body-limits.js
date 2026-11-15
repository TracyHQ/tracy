/**
 * The bounds on what a build draft door reads (#609, #611): every request body under `/api/build-draft` is refused
 * 413 `BODY_TOO_LARGE` past its bound, before it is parsed, so no door ever holds an unbounded body in memory.
 *
 * The hand off carries the whole build chat conversation, so its bound is larger; it still keeps the conversation
 * itself to `MAX_CONVERSATION_CHARS` (`handoff.js`).
 */
import { bodyLimit } from 'hono/body-limit'

/** The bound of every build draft body, in bytes. */
export const BODY_MAX_BYTES = 64 * 1024

/** The bound of the hand off body, which carries the conversation, in bytes. */
export const HANDOFF_BODY_MAX_BYTES = 1024 * 1024

const HANDOFF_PATH = '/api/build-draft/build/handoff'

const refuse = (c) =>
  c.json(
    { code: 'BODY_TOO_LARGE', next: 'Send a smaller request: this one is larger than this door reads.' },
    413
  )

const general = bodyLimit({ maxSize: BODY_MAX_BYTES, onError: refuse })
const handoff = bodyLimit({ maxSize: HANDOFF_BODY_MAX_BYTES, onError: refuse })

/** The middleware `app.js` mounts on `/api/build-draft/*`. A request without a body passes as it is. */
export const buildDraftBodyLimit = (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
  return (c.req.path === HANDOFF_PATH ? handoff : general)(c, next)
}
