/**
 * Whether the Claude Cowork plugin a new site gets (`cowork-install.js`) really carries the files of
 * the contract that seals its quickstart, measured on the plugin's own bytes. Read by the Customize
 * your site check (`customize-readiness.js` collects it, STAB-1 judges it through
 * `readers/cowork-plugin-contracts.js`).
 *
 * 🔒 WHY BYTES, AND NOT "THE ID IS LISTED" (25/10/2026). JA Boxing 1.0.3: Claude Cowork for Joomla
 * 0.24.62 listed `ja-boxing/j6/1.0.3` in its index and published the asset, but the asset held no
 * `showcase-nav-map.json`, and neither did the floor 0.24.63. Every new site kept the demo menu while
 * every check said the plugin carried the contract.
 *
 * WHICH FILES: the contract THIS deployment carries (`contractFor` → its folder), never the
 * hand-written `contractFiles` of `quickstarts.json`. The maps a site's showcase and demo trim run
 * from (`showcase-nav-map.json`, `demo-trim-map.json`) when the folder has them, plus the files they
 * read (`manifest.json`, `content-map.json`). A map the contract does not have is never asked for.
 *
 * THREE SHAPES OF PLUGIN, told apart by what the zip holds:
 *   - WordPress: `claude-cowork/lib/contracts/<id>/<file>` in the plugin zip;
 *   - Joomla up to 0.24.53: the component zip inside the package (`packages/com_claudecowork.zip`)
 *     carries `administrator/lib/contracts/<id>/<file>`;
 *   - later Joomla: the component carries only `administrator/lib/contracts.json` (id → `asset`,
 *     `sha256`, `bytes`); the asset is fetched from that very plugin version's release, its size and
 *     hash are checked against the index, then its files (at the zip root) are compared.
 *
 * THREE ANSWERS, never two: `carries` (every file read and equal), `lacks` (a file is known missing
 * or different: the plugin's to fix), `not-checked` (the bytes could not be read: a timeout, no
 * access, a corrupt archive). A corrupt zip is NOT a missing file, so this reads zips with
 * `readZipStrict`, which throws, and never with the forgiving `archive-binaries.js` reader.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { crc32, inflateRawSync } from 'node:zlib'

import { COWORK_RELEASE_BASE_URL } from './cowork-install.js'

/** The maps a contract may carry that a new site's build runs from. */
export const CONTRACT_MAPS = Object.freeze(['showcase-nav-map.json', 'demo-trim-map.json'])
/** The files those maps read: compared whenever a map is. */
export const MAP_BASE_FILES = Object.freeze(['manifest.json', 'content-map.json'])
/** The largest package or asset read (a full Joomla package was 63 MB at 0.24.48). */
export const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024
/**
 * The most one file of a contract may inflate to. The largest contract file in this tree is 3.0 MB
 * (`ja-resume/j6` `content-map.json`); 16 MiB leaves five times that, and caps what a zip bomb can
 * make this process allocate per entry.
 */
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024
/** The most claude-cowork's `update.json` may be: it names one version and one address. */
export const MAX_UPDATE_JSON_BYTES = 64 * 1024
/** The most one download may take. */
export const ARTIFACT_TIMEOUT_MS = 90_000

const sha256 = (/** @type {Buffer | string} */ b) => createHash('sha256').update(b).digest('hex')

/** The archive is not a readable zip: its bytes say nothing about which files it holds. */
export class CorruptArchive extends Error {}
/** The bytes could not be fetched: a timeout, no access, a size past the cap. */
export class Unreachable extends Error {}

/**
 * Every entry of a zip, by name, read lazily. Throws `CorruptArchive` when the archive has no end
 * record, a central directory that runs off the bytes, or (on `read`) an entry that does not inflate
 * to its declared size and CRC-32.
 * @param {Buffer} bytes
 * @returns {Map<string, { read: () => Buffer }>}
 */
export function readZipStrict(bytes) {
  const EOCD = 0x06054b50
  const CENTRAL = 0x02014b50
  const LOCAL = 0x04034b50
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) throw new CorruptArchive('too short to be a zip')
  const floor = Math.max(0, bytes.length - 0xffff - 22)
  let eocd = -1
  for (let at = bytes.length - 22; at >= floor; at -= 1)
    if (bytes.readUInt32LE(at) === EOCD) {
      eocd = at
      break
    }
  if (eocd < 0) throw new CorruptArchive('no end of central directory')
  const count = bytes.readUInt16LE(eocd + 10)
  const directorySize = bytes.readUInt32LE(eocd + 12)
  let at = bytes.readUInt32LE(eocd + 16)
  // The end record's count, size and offset must describe the same directory, which ends where the
  // end record starts: a count that disagrees would read a whole archive as one missing every file.
  const end = at + directorySize
  if (bytes.readUInt16LE(eocd + 8) !== count || end !== eocd)
    throw new CorruptArchive('the end record does not describe its central directory')
  /** @type {Map<string, { read: (max?: number) => Buffer }>} */
  const out = new Map()
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > eocd || bytes.readUInt32LE(at) !== CENTRAL)
      throw new CorruptArchive(`central directory entry ${i + 1} of ${count} does not read`)
    const nameLength = bytes.readUInt16LE(at + 28)
    // Every length is held to the archive: a field past it is a corrupt zip, never a short name.
    const next = at + 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
    if (next > eocd)
      throw new CorruptArchive(`central directory entry ${i + 1} of ${count} runs past the directory`)
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength)
    const method = bytes.readUInt16LE(at + 10)
    const crc = bytes.readUInt32LE(at + 16)
    const compressedSize = bytes.readUInt32LE(at + 20)
    const size = bytes.readUInt32LE(at + 24)
    const local = bytes.readUInt32LE(at + 42)
    at = next
    if (name.endsWith('/')) continue
    out.set(name, {
      // `max`: the most this entry may inflate to; a contract file by default (`MAX_ENTRY_BYTES`).
      read: (max = MAX_ENTRY_BYTES) => {
        if (size > max) throw new CorruptArchive(`${name}: declares ${size} bytes, more than ${max}`)
        if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== LOCAL)
          throw new CorruptArchive(`${name}: no local header`)
        const from = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
        if (from + compressedSize > bytes.length) throw new CorruptArchive(`${name}: cut short`)
        const raw = bytes.subarray(from, from + compressedSize)
        let data
        try {
          if (method === 0) data = Buffer.from(raw)
          else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, size) })
          else throw new Error(`compression method ${method}`)
        } catch (e) {
          throw new CorruptArchive(
            e instanceof RangeError
              ? `${name}: inflates past ${size} bytes`
              : `${name}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
        if (data.length !== size) throw new CorruptArchive(`${name}: ${data.length} bytes, ${size} declared`)
        if (crc32(data) !== crc) throw new CorruptArchive(`${name}: its CRC-32 does not match`)
        return data
      }
    })
  }
  if (at !== end) throw new CorruptArchive(`the central directory holds more than its ${count} entries`)
  return out
}

/**
 * The files of a contract folder this check compares, with their sha256: the maps it has, and the
 * files they read when it has one. Empty when the folder has no map.
 * @param {string} dir the contract's folder (`contractFor(...).dir`)
 * @returns {{ files: Record<string, string>, maps: string[] }}
 */
export function expectedContractFiles(dir) {
  const maps = CONTRACT_MAPS.filter((f) => existsSync(path.join(dir, f)))
  /** @type {Record<string, string>} */
  const files = {}
  if (maps.length === 0) return { files, maps }
  for (const f of [...MAP_BASE_FILES, ...maps])
    if (existsSync(path.join(dir, f))) files[f] = sha256(readFileSync(path.join(dir, f)))
  return { files, maps }
}

/**
 * @typedef {{ state: 'carries' | 'lacks' | 'not-checked', problems: string[], reason?: string, index?: { asset: string, sha256: string } }} PluginAnswer
 */

/**
 * Compare the files one plugin holds for `id` against `expected`.
 * @param {Map<string, { read: () => Buffer }>} entries
 * @param {string} prefix the folder the contract's files sit under in `entries` ('' for a slim asset)
 * @param {Record<string, string>} expected
 * @param {string} where how the answer names this plugin
 * @returns {string[]} what is missing or different
 */
function compareFiles(entries, prefix, expected, where) {
  const problems = []
  for (const [file, hash] of Object.entries(expected)) {
    const entry = entries.get(`${prefix}${file}`)
    if (!entry) problems.push(`${where} has no ${file}`)
    else if (sha256(entry.read()) !== hash)
      problems.push(`${where} carries another ${file} than this contract`)
  }
  return problems
}

/** The `<version>` of a Joomla package's manifest, or null. */
function packageVersionOf(/** @type {Map<string, { read: () => Buffer }>} */ entries) {
  const xml = entries.get('pkg_claudecowork.xml')
  const m = xml ? /<version>\s*([^<\s]+)\s*<\/version>/.exec(xml.read().toString('utf8')) : null
  return m ? m[1] : null
}

/**
 * What one plugin package holds for the contract `id`.
 * @param {{
 *   platform: string, bytes: Buffer, id: string, expected: Record<string, string>, label: string,
 *   version?: string | null, fetchAsset?: (url: string, sha: string, size: number) => Promise<Buffer>
 * }} input `fetchAsset`: reads a slim Joomla contract asset, checked against the index
 * @returns {Promise<PluginAnswer>}
 */
export async function pluginAnswer({ platform, bytes, id, expected, label, version = null, fetchAsset }) {
  try {
    const outer = readZipStrict(bytes)
    if (platform === 'wordpress') {
      const prefix = [...outer.keys()]
        .map((n) => {
          const at = n.indexOf(`lib/contracts/${id}/`)
          return at < 0 ? null : n.slice(0, at + `lib/contracts/${id}/`.length)
        })
        .find(Boolean)
      if (!prefix) return { state: 'lacks', problems: [`${label} does not carry the contract ${id}`] }
      const problems = compareFiles(outer, prefix, expected, label)
      return problems.length ? { state: 'lacks', problems } : { state: 'carries', problems: [] }
    }
    const component = outer.get('packages/com_claudecowork.zip')
    if (!component) return { state: 'lacks', problems: [`${label} holds no packages/com_claudecowork.zip`] }
    const inner = readZipStrict(component.read(MAX_ARTIFACT_BYTES))
    const folder = `administrator/lib/contracts/${id}/`
    if ([...inner.keys()].some((n) => n.startsWith(folder))) {
      const problems = compareFiles(inner, folder, expected, label)
      return problems.length ? { state: 'lacks', problems } : { state: 'carries', problems: [] }
    }
    const indexEntry = inner.get('administrator/lib/contracts.json')
    if (!indexEntry) return { state: 'lacks', problems: [`${label} does not carry the contract ${id}`] }
    let row
    try {
      row = JSON.parse(indexEntry.read().toString('utf8'))?.contracts?.[id]
    } catch {
      return { state: 'lacks', problems: [`${label} carries a contracts.json that is not JSON`] }
    }
    if (!row || typeof row !== 'object')
      return { state: 'lacks', problems: [`${label} does not list the contract ${id} in its contracts.json`] }
    const { asset, sha256: assetSha, bytes: assetBytes } = row
    if (
      typeof asset !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(asset) ||
      typeof assetSha !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(assetSha) ||
      !Number.isSafeInteger(assetBytes)
    )
      return {
        state: 'lacks',
        problems: [`${label} lists ${id} with an asset, sha256 or size that does not read`]
      }
    const index = { asset, sha256: assetSha.toLowerCase() }
    // Only the release of THAT plugin version publishes the assets its index names.
    const at = version ?? packageVersionOf(outer)
    if (!at) return { state: 'not-checked', problems: [], reason: `${label} names no version`, index }
    if (!fetchAsset)
      return {
        state: 'not-checked',
        problems: [],
        reason: `${asset} of ${label} could not be fetched here`,
        index
      }
    let assetBytesRead
    try {
      assetBytesRead = await fetchAsset(
        `${COWORK_RELEASE_BASE_URL}joomla-v${at}/${asset}`,
        index.sha256,
        assetBytes
      )
    } catch (e) {
      if (e instanceof Unreachable)
        return { state: 'not-checked', problems: [], reason: `${asset}: ${e.message}`, index }
      throw e
    }
    if (assetBytesRead.length !== assetBytes || sha256(assetBytesRead) !== index.sha256)
      return {
        state: 'lacks',
        problems: [
          `${asset} of Claude Cowork ${at} is not the file its contracts.json lists (size or sha256)`
        ],
        index
      }
    const problems = compareFiles(
      readZipStrict(assetBytesRead),
      '',
      expected,
      `${asset} of Claude Cowork ${at}`
    )
    return problems.length ? { state: 'lacks', problems, index } : { state: 'carries', problems: [], index }
  } catch (e) {
    if (e instanceof CorruptArchive)
      return { state: 'not-checked', problems: [], reason: `${label} is not a readable zip (${e.message})` }
    throw e
  }
}

/**
 * @typedef {{
 *   state: 'carries' | 'lacks' | 'not-checked' | 'not-applicable',
 *   checkedAt: string,
 *   contract: string | null,
 *   expected: Record<string, string>,
 *   source: string,
 *   plugins: ({ role: string, version: string | null, file: string | null, digest: string | null } & PluginAnswer)[],
 *   reason?: string
 * }} CoworkEvidence
 */

/**
 * The evidence for one release version: every candidate `coworkSelection` names, read and judged.
 * The worst answer wins: one candidate that lacks a file lacks it for the sites that get it.
 * @param {{
 *   platform: string,
 *   contract: { id: string, dir: string } | null,
 *   selection: import('./cowork-install.js').CoworkSelection,
 *   fetchArtifact: (candidate: import('./cowork-install.js').CoworkCandidate) => Promise<Buffer>,
 *   fetchAsset?: (url: string, sha: string, size: number) => Promise<Buffer>,
 *   now?: () => number
 * }} input
 * @returns {Promise<CoworkEvidence>}
 */
export async function collectCoworkEvidence({
  platform,
  contract,
  selection,
  fetchArtifact,
  fetchAsset,
  now = Date.now
}) {
  const base = {
    checkedAt: new Date(now()).toISOString(),
    contract: contract?.id ?? null,
    source: selection.source,
    plugins: /** @type {CoworkEvidence['plugins']} */ ([])
  }
  if (!contract || selection.source === 'none' || (platform !== 'joomla' && platform !== 'wordpress'))
    return { ...base, state: 'not-applicable', expected: {} }
  const { files: expected } = expectedContractFiles(contract.dir)
  for (const c of selection.candidates) {
    const label = `Claude Cowork ${c.version ?? c.file ?? '(unnamed)'} (${c.role})`
    const head = {
      role: c.role,
      version: c.version,
      file: c.file,
      digest: /** @type {string | null} */ (null)
    }
    if (!c.url && !c.githubAssetId && c.role === 'latest') {
      base.plugins.push({
        ...head,
        state: 'not-checked',
        problems: [],
        reason: "claude-cowork's update.json could not be read, so the latest plugin is not known"
      })
      continue
    }
    let bytes
    try {
      // eslint-disable-next-line no-await-in-loop -- one or two packages, one at a time.
      bytes = await fetchArtifact(c)
    } catch (e) {
      if (!(e instanceof Unreachable)) throw e
      base.plugins.push({ ...head, state: 'not-checked', problems: [], reason: `${label}: ${e.message}` })
      continue
    }
    head.digest = sha256(bytes)
    if (c.sha256 && head.digest !== c.sha256.toLowerCase()) {
      base.plugins.push({
        ...head,
        state: 'lacks',
        problems: [`${label} is not the file this release names (sha256 ${head.digest.slice(0, 12)}…)`]
      })
      continue
    }
    // An empty expectation still asks that the contract is carried at all.
    // eslint-disable-next-line no-await-in-loop -- see above.
    const answer = await pluginAnswer({
      platform,
      bytes,
      id: contract.id,
      expected: Object.keys(expected).length ? expected : {},
      label,
      version: c.version,
      fetchAsset
    })
    base.plugins.push({ ...head, ...answer })
  }
  const states = base.plugins.map((p) => p.state)
  const state = states.includes('lacks')
    ? 'lacks'
    : states.includes('not-checked') || !states.length
      ? 'not-checked'
      : 'carries'
  return { ...base, state, expected }
}

/**
 * Read a bounded body: refused past `max` bytes, aborted past the time limit.
 * @param {Response} response @param {number} max
 */
async function boundedBody(response, max) {
  const declared = Number(response.headers?.get?.('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max)
    throw new Unreachable(`${declared} bytes, more than ${max}`)
  if (!response.body) {
    const whole = Buffer.from(await response.arrayBuffer())
    if (whole.length > max) throw new Unreachable(`${whole.length} bytes, more than ${max}`)
    return whole
  }
  const chunks = []
  let total = 0
  for await (const chunk of /** @type {any} */ (response.body)) {
    total += chunk.length
    if (total > max) throw new Unreachable(`more than ${max} bytes`)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * The digest each plugin address answered, for this process and every check in it: a fleet plugin
 * (the latest, the floor) is installed by many releases, and each release's check makes its own
 * fetchers, so the address is remembered here and its bytes are read back from the disk cache.
 * Bounded: the oldest address is forgotten first (it is then only downloaded again).
 * @type {Map<string, string>}
 */
const digestOfUrl = new Map()
const MAX_REMEMBERED_URLS = 256
/** @param {string} url @param {string} digest */
function rememberDigest(url, digest) {
  digestOfUrl.delete(url)
  digestOfUrl.set(url, digest)
  if (digestOfUrl.size > MAX_REMEMBERED_URLS) digestOfUrl.delete(digestOfUrl.keys().next().value ?? '')
}

/**
 * The fetchers `collectCoworkEvidence` reads with: bounded, and kept on disk by digest, so one plugin
 * version is downloaded once however many releases install it.
 * @param {{ fetchImpl?: typeof fetch, token?: string | null, repo: string, cacheDir: string, localDir?: string | null, timeoutMs?: number, maxBytes?: number }} opts
 *   `repo`: the private releases repository a pin or a release's own asset is read from (by asset id,
 *   with `token`); `localDir`: a local pack's folder, read before any network
 */
export function artifactFetchers({
  fetchImpl = fetch,
  token = null,
  repo,
  cacheDir,
  localDir = null,
  timeoutMs = ARTIFACT_TIMEOUT_MS,
  maxBytes = MAX_ARTIFACT_BYTES
}) {
  const byDigest = (/** @type {string} */ d) => path.join(cacheDir, `${d}.zip`)
  const cached = async (/** @type {string | undefined} */ digest) => {
    if (!digest) return null
    try {
      const b = await readFile(byDigest(digest.toLowerCase()))
      return sha256(b) === digest.toLowerCase() ? b : null
    } catch {
      return null
    }
  }
  const keep = async (/** @type {Buffer} */ b) => {
    try {
      await mkdir(cacheDir, { recursive: true })
      const file = byDigest(sha256(b))
      await writeFile(`${file}.part`, b)
      await rename(`${file}.part`, file)
    } catch {
      // A cache that cannot be written only means the next check downloads again.
    }
  }
  /** @param {string} url @param {Record<string, string>} headers */
  const get = async (url, headers = {}) => {
    let response
    try {
      response = await fetchImpl(url, {
        headers: { 'user-agent': 'tracy-web', ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (e) {
      throw new Unreachable(`${url} could not be read (${e instanceof Error ? e.message : String(e)})`)
    }
    if (!response.ok) throw new Unreachable(`${url} answered HTTP ${response.status}`)
    try {
      return await boundedBody(response, maxBytes)
    } catch (e) {
      throw e instanceof Unreachable
        ? e
        : new Unreachable(`${url}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    /** @param {import('./cowork-install.js').CoworkCandidate} c */
    fetchArtifact: async (c) => {
      const hit = (await cached(c.sha256)) ?? (await cached(c.url ? digestOfUrl.get(c.url) : undefined))
      if (hit) return hit
      if (localDir && c.role === 'release' && c.file && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(c.file)) {
        try {
          return await readFile(path.join(localDir, c.file))
        } catch {
          throw new Unreachable(`${c.file} is not in the local pack`)
        }
      }
      let bytes
      if (c.githubAssetId) {
        if (!token) throw new Unreachable(`${c.file}: this server cannot read ${repo}`)
        bytes = await get(`https://api.github.com/repos/${repo}/releases/assets/${c.githubAssetId}`, {
          accept: 'application/octet-stream',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28'
        })
      } else if (c.url && c.url.startsWith('https://')) bytes = await get(c.url)
      else throw new Unreachable(`${c.file ?? 'the plugin'} has no address this server may read`)
      if (c.url) rememberDigest(c.url, sha256(bytes))
      await keep(bytes)
      return bytes
    },
    /** @param {string} url @param {string} sha @param {number} _size */
    fetchAsset: async (url, sha, _size) => {
      const hit = await cached(sha)
      if (hit) return hit
      const bytes = await get(url)
      if (sha256(bytes) === sha) await keep(bytes)
      return bytes
    }
  }
}

/**
 * What claude-cowork's `update.json` names for one platform now: `{ version, package }`, null when it
 * answered with no usable pair (the fleet then installs the floor), or `'unread'` when it did not
 * answer at all.
 * @param {string} platform
 * @param {{ fetchImpl?: typeof fetch, base?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ version: string, package: string } | null | 'unread'>}
 */
export async function readFleetLatest(
  platform,
  {
    fetchImpl = fetch,
    base = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main',
    timeoutMs = 10_000
  } = {}
) {
  try {
    const response = await fetchImpl(`${base}/${platform}/update.json`, {
      headers: { 'user-agent': 'tracy-web' },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) return 'unread'
    const body = await boundedBody(response, MAX_UPDATE_JSON_BYTES)
    let doc
    try {
      doc = JSON.parse(body.toString('utf8'))
    } catch {
      return null
    }
    return typeof doc?.version === 'string' && doc.version && typeof doc?.package === 'string' && doc.package
      ? { version: doc.version, package: doc.package }
      : null
  } catch {
    return 'unread'
  }
}
