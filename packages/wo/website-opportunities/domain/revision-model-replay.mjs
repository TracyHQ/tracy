// The model calls of a build kept for its next revision (ticket #599): the picture labelling and the icon keywords
// and ranking. Each answer is kept under the hash of its whole request (system, user, images by their bytes); a
// revision answers a request it already asked from the kept answer, with NO model call, and asks the model only when
// the request changed (a renamed service's icon ranking reads its new words). The writer's pages are kept another way
// (`revision-impact.mjs`). Pure apart from the calls it passes on.
import { createHash } from 'node:crypto'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** The key of a request: its JSON with keys sorted, bytes by their own hash, the abort signal left out. */
export function requestKeyOf(request) {
  const { signal: _signal, ...rest } = request ?? {}
  return sha256(
    JSON.stringify(rest, (_, v) => {
      if (v instanceof Uint8Array) return `bytes:${sha256(v)}`
      if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data))
        return `bytes:${sha256(Buffer.from(v.data))}`
      if (v && typeof v === 'object' && !Array.isArray(v))
        return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      return v
    })
  )
}

/**
 * A model that keeps its answers: `replies` (`{key, reply}`, every request answered in this build, replayed or not, so
 * the next revision has them too), and, given the kept replies of the previous build, answers a known request from
 * them. `asked` counts the calls passed on to the model, `replayed` the requests answered from the kept ones.
 * @param {Function} model the build model
 * @param {Array<{key: string, reply: unknown}>} [kept] the replies of the previous build
 */
export function keptModel(model, kept = []) {
  const known = new Map((Array.isArray(kept) ? kept : []).map((r) => [r.key, r.reply]))
  const replies = []
  const counts = { asked: 0, replayed: 0 }
  const call = async (request) => {
    const key = requestKeyOf(request)
    if (known.has(key)) {
      counts.replayed += 1
      const reply = structuredClone(known.get(key))
      replies.push({ key, reply })
      return structuredClone(reply)
    }
    counts.asked += 1
    const reply = await model(request)
    replies.push({ key, reply: structuredClone(reply) })
    return reply
  }
  return Object.defineProperties(call, {
    replies: { value: replies },
    asked: { get: () => counts.asked },
    replayed: { get: () => counts.replayed }
  })
}
