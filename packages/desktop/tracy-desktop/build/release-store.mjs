/**
 * Where a desktop release lives: the artifacts, the manifest and the channel file, under one root —
 * the S3-compatible `tracy-releases` (stable, `https://update.tracy.ai/desktop`) or `tracy-releases-dev`
 * (dev, `https://update.tracy.site/desktop`) bucket, or any test
 * target (a local folder, a throwaway prefix on a MinIO).
 *
 *   openStore('/abs/folder' | 'file:///abs/folder')         a folder on this machine
 *   openStore('s3://<bucket>/<prefix>', { credentials })    RELEASES_S3_ENDPOINT, RELEASES_S3_REGION (default auto)
 *
 * Four calls, the same on both: `get(key)` → `{ body, etag } | null`, `put(key, body, { contentType,
 * ifMatch, ifNoneMatch })` → `{ etag }`, `remove(key)`, `describe(key)`. A conditional put whose
 * condition no longer holds throws an error with `code: 'PRECONDITION'` and writes nothing — that is
 * what the publish lock (`ifNoneMatch: '*'`) and the "feed did not change since it was read" guard
 * (`ifMatch: <etag read>`) stand on. On S3 the store itself enforces both (HTTP 412), so two
 * publishers on two machines cannot both win. A folder makes "create only" atomic (link) but checks
 * `ifMatch` and then renames, two steps — fine for the test targets it is for, behind the lock.
 *
 * S3 requests are signed here (AWS Signature V4 over `fetch`) rather than through the aws CLI, so the
 * same code runs on the iMac and the Studio and can send the conditional headers.
 */
import { createHash, createHmac } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The two real release buckets, each serving one channel: `tracy-releases` behind update.tracy.ai
 * (stable), `tracy-releases-dev` behind update.tracy.site (dev). Judged by bucket name alone, on any
 * endpoint — a stand's MinIO bucket of the same name counts as real too, so a dry run uses another name.
 * A fork names its own buckets with `TRACY_RELEASE_BUCKET_STABLE` / `TRACY_RELEASE_BUCKET_DEV`.
 */
const REAL_STORES = realStores(process.env)

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Readonly<Record<string, 'stable' | 'dev'>>} bucket name → channel
 */
export function realStores(env) {
  const stable = env.TRACY_RELEASE_BUCKET_STABLE?.trim() || 'tracy-releases'
  const dev = env.TRACY_RELEASE_BUCKET_DEV?.trim() || 'tracy-releases-dev'
  if (stable === dev) throw new Error(`the stable and dev release buckets must differ: ${stable}`)
  return Object.freeze({ [stable]: 'stable', [dev]: 'dev' })
}

/**
 * @param {string} target
 * @returns {'stable' | 'dev' | null} the channel a real store serves; null for a test target.
 */
export function realStoreChannel(target) {
  if (!target.startsWith('s3://')) return null
  const { bucket } = parseS3(target)
  return Object.hasOwn(REAL_STORES, bucket) ? REAL_STORES[bucket] : null
}

function preconditionFailed(key, why) {
  return Object.assign(new Error(`${key}: ${why}`), { code: 'PRECONDITION' })
}

/** @param {string} key */
function checkKey(key) {
  const parts = String(key).split('/')
  if (key === '' || parts.some((p) => p === '' || p === '.' || p === '..'))
    throw new Error(`bad store key: ${JSON.stringify(key)}`)
  return key
}

/** @param {string} target */
function parseS3(target) {
  const m = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,62})(?:\/(.*))?$/.exec(target)
  if (!m) throw new Error(`not an s3://<bucket>/<prefix> target: ${target}`)
  return { bucket: m[1], prefix: (m[2] ?? '').replace(/^\/+|\/+$/g, '') }
}

/**
 * @param {string} target
 * @param {{ credentials?: { accessKeyId: string, secretAccessKey: string }, endpoint?: string, region?: string }} [options]
 */
export function openStore(target, options = {}) {
  if (target.startsWith('s3://')) return s3Store(target, options)
  const root = target.startsWith('file://') ? fileURLToPath(target) : target
  if (!path.isAbsolute(root)) throw new Error(`a folder store needs an absolute path, got: ${target}`)
  return fileStore(root)
}

// ── a folder ─────────────────────────────────────────────────────────────────────────────────────

/** @param {string} root */
function fileStore(root) {
  const where = (key) => path.join(root, checkKey(key))
  const etagOf = (body) => `"sha256:${createHash('sha256').update(body).digest('hex')}"`
  const read = (key) => {
    const file = where(key)
    if (!existsSync(file)) return null
    const body = readFileSync(file)
    return { body, etag: etagOf(body) }
  }
  return {
    target: root,
    describe: (key) => where(key),
    async get(key) {
      return read(key)
    },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      const file = where(key)
      mkdirSync(path.dirname(file), { recursive: true })
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`
      writeFileSync(temp, body)
      try {
        if (ifMatch !== undefined) {
          const now = read(key)
          if (now === null || now.etag !== ifMatch) throw preconditionFailed(key, 'changed since it was read')
        }
        if (ifNoneMatch === '*') {
          // link() fails when the name exists — an atomic "create only", like S3's If-None-Match: *.
          try {
            linkSync(temp, file)
          } catch (error) {
            if (error.code === 'EEXIST') throw preconditionFailed(key, 'already exists')
            throw error
          }
        } else renameSync(temp, file)
      } finally {
        rmSync(temp, { force: true })
      }
      return { etag: etagOf(Buffer.from(body)) }
    },
    async remove(key) {
      rmSync(where(key), { force: true })
    }
  }
}

// ── S3-compatible ────────────────────────────────────────────────────────────────────────────────

const sha256hex = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
// RFC 3986 unreserved characters stay; everything else is percent-encoded (SigV4's rule).
const encode = (segment) =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/**
 * @param {string} target
 * @param {{ credentials?: { accessKeyId: string, secretAccessKey: string }, endpoint?: string, region?: string }} options
 */
function s3Store(target, options) {
  const { bucket, prefix } = parseS3(target)
  const endpoint = (options.endpoint ?? process.env.RELEASES_S3_ENDPOINT ?? '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+$/.test(endpoint))
    throw new Error(`an s3 store needs RELEASES_S3_ENDPOINT (https://host), got: ${endpoint || '(unset)'}`)
  const region = options.region ?? process.env.RELEASES_S3_REGION ?? 'auto'
  const objectKey = (key) => (prefix ? `${prefix}/${checkKey(key)}` : checkKey(key))

  async function request(method, key, { body, headers = {} } = {}) {
    const { credentials } = options
    if (!credentials?.accessKeyId || !credentials?.secretAccessKey)
      throw new Error(`no credentials to ${method} ${target}`)
    const canonicalUri = `/${bucket}/${objectKey(key).split('/').map(encode).join('/')}`
    const url = new URL(endpoint + canonicalUri)
    const amzDate = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
    const day = amzDate.slice(0, 8)
    const payloadHash = sha256hex(body ?? '')
    const signed = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
    for (const [name, value] of Object.entries(headers)) signed[name.toLowerCase()] = String(value)
    const names = Object.keys(signed).sort()
    const canonical = [
      method,
      canonicalUri,
      '',
      ...names.map((n) => `${n}:${signed[n].trim()}`),
      '',
      names.join(';'),
      payloadHash
    ].join('\n')
    const scope = `${day}/${region}/s3/aws4_request`
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n')
    let key4 = hmac(`AWS4${credentials.secretAccessKey}`, day)
    for (const part of [region, 's3', 'aws4_request']) key4 = hmac(key4, part)
    const signature = createHmac('sha256', key4).update(toSign).digest('hex')
    const { host: _host, ...sent } = signed
    return fetch(url, {
      method,
      body,
      headers: {
        ...sent,
        authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
      },
      signal: AbortSignal.timeout(10 * 60_000)
    })
  }

  const failure = async (what, response) =>
    new Error(`${what}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)

  return {
    target,
    describe: (key) => `s3://${bucket}/${objectKey(key)}`,
    async get(key) {
      const response = await request('GET', key)
      if (response.status === 404) return null
      if (!response.ok) throw await failure(`GET ${objectKey(key)}`, response)
      return { body: Buffer.from(await response.arrayBuffer()), etag: response.headers.get('etag') }
    },
    async put(key, body, { contentType, ifMatch, ifNoneMatch } = {}) {
      const headers = {}
      if (contentType) headers['content-type'] = contentType
      if (ifMatch !== undefined) headers['if-match'] = ifMatch
      if (ifNoneMatch !== undefined) headers['if-none-match'] = ifNoneMatch
      const response = await request('PUT', key, { body, headers })
      // 412: the condition failed; 409: S3 lost a race between two conditional writes.
      if (response.status === 412 || response.status === 409)
        throw preconditionFailed(
          objectKey(key),
          ifNoneMatch === '*' ? 'already exists' : 'changed since it was read'
        )
      if (!response.ok) throw await failure(`PUT ${objectKey(key)}`, response)
      return { etag: response.headers.get('etag') }
    },
    async remove(key) {
      const response = await request('DELETE', key)
      if (!response.ok && response.status !== 404) throw await failure(`DELETE ${objectKey(key)}`, response)
    }
  }
}
