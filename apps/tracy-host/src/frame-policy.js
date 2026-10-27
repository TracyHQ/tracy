import path from 'node:path'
import { SAFE_LABEL } from './provision.js'
import { publicOriginOf, publicOriginEnv } from './public-origin.js'

/** This route inherits the host HMAC middleware; a caller never supplies filesystem paths. */
export function framePolicyRoute({ config, run }) {
  const running = new Map()
  return async (c) => {
    let body
    try {
      body = JSON.parse(c.get('rawBody'))
      if (
        !body ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => !['label', 'publicOrigin'].includes(k))
      )
        throw new Error('invalid body')
      if (typeof body.label !== 'string' || !SAFE_LABEL.test(body.label)) throw new Error('invalid label')
      body.publicOrigin = publicOriginOf(body.publicOrigin)
      if (!body.publicOrigin) throw new Error('missing public origin')
    } catch {
      return c.json({ code: 'BAD_REQUEST' }, 400)
    }
    const key = `${body.label}:${body.publicOrigin}`
    const work = async () => {
      const answer = await run({
        script: 'bash',
        args: [path.join(config.scriptsDir, 'webroot/site-frame-policy.sh'), config.privateRoot, body.label],
        env: publicOriginEnv(body),
        timeoutMs: 45_000
      })
      if (answer.code !== 0 || answer.timedOut || answer.signal || answer.spawnError)
        return { code: answer.code === 75 ? 'FRAME_POLICY_BUSY' : 'FRAME_POLICY_UNAVAILABLE' }
      for (const line of (Array.isArray(answer.tail) ? answer.tail.join('\n') : String(answer.tail ?? ''))
        .trim()
        .split('\n')
        .reverse()) {
        try {
          const value = JSON.parse(line)
          if (['current', 'updated', 'unmanaged', 'refused'].includes(value?.state))
            return { state: value.state }
        } catch {
          /* Only the helper's final JSON receipt is accepted. */
        }
      }
      return { code: 'FRAME_POLICY_UNAVAILABLE' }
    }
    if (!running.has(key)) {
      const pending = work()
        .catch(() => ({ code: 'FRAME_POLICY_UNAVAILABLE' }))
        .finally(() => running.delete(key))
      running.set(key, pending)
    }
    const result = await running.get(key)
    c.header('cache-control', 'no-store')
    return c.json(result, result.code ? 503 : 200)
  }
}
