/**
 * Turborepo's remote cache API in front of an S3 bucket (Cloudflare R2), with no dependency
 * (12/10/2026).
 *
 * WHY NOT `turborepo-remote-cache` FROM npm. It worked, but it carries the AWS, Azure and Google
 * storage SDKs: `npx` fetched it in 86 s on every job, the plan job included. Turbo needs four
 * routes, and an S3 request is one signed HTTP call, so this file is the whole server. It keeps that
 * server's key layout (`<team>/<hash>` in the bucket), so artifacts written by either are shared.
 *
 * ENV. S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com), S3_BUCKET, S3_ACCESS_KEY,
 * S3_SECRET_KEY, TURBO_TOKEN (the bearer Turbo sends), PORT (default 43901), S3_REGION (`auto`).
 * Started by `.github/actions/turbo-cache`; it binds 127.0.0.1 only.
 */
import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const sha256hex = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

/**
 * Signs one S3 request with AWS Signature Version 4, path-style, unsigned payload.
 * @param {{ method: string, url: URL, accessKey: string, secretKey: string, region?: string, now?: Date }} req
 * @returns {Record<string, string>} the headers to send.
 */
export function signS3({ method, url, accessKey, secretKey, region = 'auto', now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const payload = 'UNSIGNED-PAYLOAD'
  const headers = { host: url.host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate }
  const signed = Object.keys(headers).sort()
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const canonical = [
    method,
    url.pathname.split('/').map(encodeURIComponent).join('/'),
    query,
    ...signed.map((h) => `${h}:${headers[h]}`),
    '',
    signed.join(';'),
    payload
  ].join('\n')
  const scope = `${day}/${region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`
  }
}

/** One path segment of the bucket key: no slash, and never `.` or `..` (which would leave the team's prefix). */
const SAFE = /^(?!\.+$)[A-Za-z0-9._-]{1,200}$/

/**
 * @param {{ endpoint: string, bucket: string, accessKey: string, secretKey: string, token: string, region?: string, fetchImpl?: typeof fetch }} config
 */
export function cacheServer({
  endpoint,
  bucket,
  accessKey,
  secretKey,
  token,
  region = 'auto',
  fetchImpl = fetch
}) {
  const s3 = (method, key, body) => {
    const url = new URL(`${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`)
    const headers = signS3({ method, url, accessKey, secretKey, region })
    return fetchImpl(url, { method, headers, body, ...(body ? { duplex: 'half' } : {}) })
  }
  return createServer(async (req, res) => {
    const send = (status, body = '', type = 'application/json') => {
      res.writeHead(status, { 'content-type': type })
      res.end(body)
    }
    try {
      const url = new URL(req.url ?? '/', 'http://local')
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, '{"error":"unauthorized"}')
      if (url.pathname === '/v8/artifacts/status') return send(200, '{"status":"enabled"}')
      if (url.pathname === '/v8/artifacts/events') return send(200, '{}')
      const m = /^\/v8\/artifacts\/([^/]+)$/.exec(url.pathname)
      const team =
        url.searchParams.get('teamId') ?? url.searchParams.get('slug') ?? url.searchParams.get('team')
      if (!m || !team || !SAFE.test(m[1]) || !SAFE.test(team)) return send(400, '{"error":"bad request"}')
      const key = `${team}/${m[1]}`
      if (req.method === 'HEAD' || req.method === 'GET') {
        const r = await s3(req.method, key)
        if (r.status === 404) return send(404, req.method === 'HEAD' ? '' : '{"error":"not found"}')
        if (!r.ok) return send(502, '')
        if (req.method === 'HEAD') return send(200, '')
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end(Buffer.from(await r.arrayBuffer()))
        return
      }
      if (req.method === 'PUT') {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const r = await s3('PUT', key, Buffer.concat(chunks))
        return r.ok ? send(202, JSON.stringify({ urls: [`${team}/${m[1]}`] })) : send(502, '')
      }
      return send(405, '')
    } catch {
      send(502, '')
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, TURBO_TOKEN, PORT, S3_REGION } = process.env
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY || !TURBO_TOKEN) {
    console.error(
      'turbo-cache-server: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY and TURBO_TOKEN are required'
    )
    process.exit(2)
  }
  cacheServer({
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    token: TURBO_TOKEN,
    region: S3_REGION || 'auto'
  }).listen(Number(PORT || 43901), '127.0.0.1')
}
