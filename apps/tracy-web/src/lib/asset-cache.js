import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, lstat, readdir, utimes } from 'node:fs/promises'
import path from 'node:path'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** Verified, immutable blobs. The index supplies hashes, never arbitrary download URLs. */
export function assetCache({
  origin,
  directory,
  fetchImpl = fetch,
  maxBytes = 16 * 1024 * 1024,
  cacheBytes = 256 * 1024 * 1024
}) {
  const base = new URL(origin)
  if (
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Asset origin must use HTTPS or local HTTP without credentials.')
  if (!path.isAbsolute(directory)) throw new Error('Asset cache directory must be absolute.')
  if (!Number.isSafeInteger(cacheBytes) || cacheBytes < maxBytes)
    throw new Error('Invalid asset cache budget.')
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
  const pending = new Map()

  async function ensure(asset) {
    if (
      !/^[a-f0-9]{64}$/.test(asset?.sha256 ?? '') ||
      !Number.isSafeInteger(asset?.bytes) ||
      asset.bytes < 1 ||
      asset.bytes > maxBytes
    )
      throw new Error('Invalid asset descriptor.')
    const file = path.join(directory, asset.sha256)
    try {
      const stat = await lstat(file)
      if (stat.isFile() && stat.size === asset.bytes) {
        const bytes = await readFile(file)
        if (sha256(bytes) === asset.sha256) {
          await utimes(file, new Date(), new Date())
          return file
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const key = `${asset.sha256}:${asset.bytes}`
    if (pending.has(key)) return pending.get(key)
    const promise = download(asset, file).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }

  async function download(asset, file) {
    const response = await fetchImpl(new URL(`blobs/${asset.sha256}`, base), {
      headers: { 'accept-encoding': 'identity' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`Asset download failed (${response.status}).`)
    }
    const length = response.headers.get('content-length')
    if (length !== null && Number(length) !== asset.bytes) {
      await response.body.cancel()
      throw new Error('Asset size mismatch.')
    }
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > asset.bytes) throw new Error('Asset size exceeds its descriptor.')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    if (size !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw new Error('Asset checksum or size mismatch.')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = path.join(directory, `.${asset.sha256}.${randomUUID()}`)
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
      await rename(temporary, file)
      await trim(file)
    } finally {
      await rm(temporary, { force: true })
    }
    return file
  }

  async function trim(keep) {
    const files = []
    for (const name of await readdir(directory)) {
      if (!/^[a-f0-9]{64}$/.test(name)) continue
      const file = path.join(directory, name)
      try {
        const stat = await lstat(file)
        if (stat.isFile()) files.push({ file, size: stat.size, time: stat.mtimeMs })
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    let size = files.reduce((sum, f) => sum + f.size, 0)
    for (const item of files.sort((a, b) => a.time - b.time)) {
      if (size <= cacheBytes) break
      if (item.file === keep) continue
      await rm(item.file, { force: true })
      size -= item.size
    }
  }
  return { ensure }
}
