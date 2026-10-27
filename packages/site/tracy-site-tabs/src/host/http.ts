/**
 * Read a request body and answer JSON — two small jobs, split out because each has a trap that has already sprung.
 *
 * Pattern copied from `vendor/tracy/dsh-passwords/src/plugin.ts`, including the reason for each guard.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Request body cap.
 *
 * Every body here is control JSON — a site address, a username, a cursor. No content byte goes
 * through this door: the webroot and database go straight from the old site to storage over a
 * presigned URL. So a body larger than this cap is not "big data", it is a wrong call.
 */
const MAX_BODY = 64 * 1024

export class BodyTooLarge extends Error {}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

/**
 * A request's JSON body, or `{}` when empty.
 *
 * 🔒 OVER THE CAP, READ TO THE END THEN REFUSE; never destroy the socket. Destroying it mid-stream makes
 * the proxy in front read a connection reset and turns a readable `413` into a silent `502` — the very trap
 * `dsh-passwords` records at the same spot.
 */
export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (tooLarge) return
      if (size > MAX_BODY) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(new BodyTooLarge())
        return
      }
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolve({})
        return
      }
      try {
        const parsed: unknown = JSON.parse(text)
        // Arrays and numbers are valid JSON too, but not the shape this door takes. Return `{}` so
        // the field checks inside name what is missing, instead of throwing an unreadable syntax error.
        resolve(
          typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {}
        )
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}
