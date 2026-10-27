/** Shared write guards for the synthetic sandbox and its source doors. */
export const writable = (who) => ['owner', 'admin'].includes(who?.role)
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { status })
}

export async function body(c, config) {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json'))
    fail('json_required', 415)
  let origin
  try {
    origin = new URL(c.req.header('origin')).origin
  } catch {
    fail('same_origin_required', 403)
  }
  if (origin !== new URL(config.origin ?? c.req.url).origin) fail('same_origin_required', 403)
  const reader = c.req.raw.body?.getReader()
  if (!reader) fail('invalid_json')
  let size = 0
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 1048576) {
      await reader.cancel()
      fail('body_limit', 413)
    }
    chunks.push(value)
  }
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    fail('invalid_json')
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') fail('invalid_json')
  return value
}
