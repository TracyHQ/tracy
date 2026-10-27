/**
 * The Claude Cowork package an IMPORT uploads: the release's own `pkg_claudecowork-*.zip` carrying,
 * in its component (`com_claudecowork.zip` → `administrator/lib/contracts/`), only the quickstart
 * contracts this site needs, and nothing else changed.
 *
 * TWO SHAPES OF RELEASE, told apart by what the component holds, never by a version number:
 *
 *   - **Full** (every Joomla release up to 0.24.53): the component carries every JA template's
 *     contract at every version. 0.24.48 is 63 MB zipped and 503 MB unpacked, 502 MB of it contracts
 *     (measured 21/10/2026). A customer's host that accepts 2 MB in one upload refused it ("The
 *     package is 61 MB; the site accepts 2 MB"), and one with PHP's 128 MB ran out of memory
 *     unpacking it. Without them the package is about 1 MB. Here the contracts the site does not
 *     need are taken out.
 *   - **Slim** (later releases): the component carries no contract folder, only an index,
 *     `administrator/lib/contracts.json` (id → `asset`, `sha256`, `bytes`, `template`, `names`), and
 *     each contract is its own asset of the same GitHub release (`<id with "/" → "--">.zip`, its
 *     files at the zip root). The site's component fetches the contract it is bound to on first need,
 *     which a host that cannot reach GitHub cannot do. Here the contracts the site needs are fetched
 *     beside the package, checked against the index, and put into the component, so it carries them
 *     even there. An asset that cannot be fetched or does not match is left out: the site still tries
 *     to fetch it itself, and the install goes on.
 *
 * 🔒 A SITE BUILT FROM A JA QUICKSTART NAMES ITS CONTRACT, AND KEEPS IT. Its component params say
 * `contract: ja-impact/j6/1.0.1`, and the engine reads that folder on every request: without it,
 * every door answers `contract_unavailable` — `info` included — so the site's Claude Cowork stops
 * working (measured 21/10/2026 on a live JA Impact site, after this package dropped every contract).
 * The params are not on any admin page, so the contract is found from the outside: the candidates
 * are the contracts whose `manifest.json` (or index row) names a template the site has
 * (`contractCandidates`); a few public files whose hash differs between their versions are fetched
 * (`probePaths`), and the version whose `presentation-lock.json` matches them is kept, with the
 * contract its quickstart names (`pickContracts`). One version is 250–450 KB; every Tracy Business
 * version together is 3.9 MB, past a 2 MB host. A site with no candidate binds a contract DERIVED
 * from its own rows (`QuickstartContract::derived`).
 *
 * THE BYTES STAY THE RELEASE'S. Every kept entry is copied as the release packed it — the same
 * compressed bytes, the same CRC — and only the one nested archive is rewritten, its kept entries
 * copied the same way; an inserted contract's entries are copied as its asset packed them, under
 * the folder the component reads. A package that is not the expected shape is returned unchanged.
 */
import { createHash } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

/** The nested archive whose contracts go, and the folder inside it. */
const COMPONENT = 'packages/com_claudecowork.zip'
const CONTRACTS = 'administrator/lib/contracts/'
/** A slim release's index of the contracts it publishes as assets. */
const INDEX = 'administrator/lib/contracts.json'

/** One plain path segment or file name: no `.`, `..`, slash, backslash or NUL. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/**
 * A contract id that may become a folder name: `<slug>/j<n>/<version>`, every segment plain. An index
 * id is a path inside the customer's component, so `ja-resume/j6/..` must never reach a zip entry.
 */
export function safeContractId(id: string): boolean {
  const parts = id.split('/')
  return (
    parts.length === 3 &&
    parts.every((p) => SAFE_NAME.test(p) && !p.includes('..')) &&
    /^j\d+$/.test(parts[1])
  )
}
/** A plain `.zip` file name, safe to resolve beside the package's URL. */
function safeAssetName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes('..') && name.endsWith('.zip')
}

export interface Entry {
  name: Buffer
  method: number
  flags: number
  time: number
  date: number
  crc: number
  compressed: Buffer
  size: number
  external: number
  versionMadeBy: number
}

/** The entries of a zip archive, by its central directory, or undefined for anything else. */
function readZip(zip: Buffer): Entry[] | undefined {
  // End of central directory: its signature within the last 64 KiB plus its own 22 bytes.
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) return undefined
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  if (count === 0xffff || at === 0xffffffff) return undefined // ZIP64: not a shape this expects
  const entries: Entry[] = []
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) return undefined
    const flags = zip.readUInt16LE(at + 8)
    const method = zip.readUInt16LE(at + 10)
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const compressedSize = zip.readUInt32LE(at + 20)
    if (zip.readUInt32LE(local) !== 0x04034b50) return undefined
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    entries.push({
      name: zip.subarray(at + 46, at + 46 + nameLength),
      method,
      flags: flags & ~0x0008, // sizes are written in the local header below: no data descriptor
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      crc: zip.readUInt32LE(at + 16),
      compressed: zip.subarray(dataAt, dataAt + compressedSize),
      size: zip.readUInt32LE(at + 24),
      external: zip.readUInt32LE(at + 38),
      versionMadeBy: zip.readUInt16LE(at + 4)
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** A zip archive of `entries`, each written as given (no extra fields, no comments). */
function writeZip(entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(e.flags, 6)
    local.writeUInt16LE(e.method, 8)
    local.writeUInt16LE(e.time, 10)
    local.writeUInt16LE(e.date, 12)
    local.writeUInt32LE(e.crc, 14)
    local.writeUInt32LE(e.compressed.length, 18)
    local.writeUInt32LE(e.size, 22)
    local.writeUInt16LE(e.name.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(e.versionMadeBy, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(e.flags, 8)
    central.writeUInt16LE(e.method, 10)
    central.writeUInt16LE(e.time, 12)
    central.writeUInt16LE(e.date, 14)
    central.writeUInt32LE(e.crc, 16)
    central.writeUInt32LE(e.compressed.length, 20)
    central.writeUInt32LE(e.size, 24)
    central.writeUInt16LE(e.name.length, 28)
    central.writeUInt32LE(e.external, 38)
    central.writeUInt32LE(offset, 42)
    locals.push(local, e.name, e.compressed)
    centrals.push(central, e.name)
    offset += 30 + e.name.length + e.compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** CRC-32 (IEEE), the zip format's own. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** What `packageForImport` did, for the import's diagnostic. */
export interface Slimmed {
  bytes: ArrayBuffer
  /** Bytes of the package as released, and as sent. */
  from: number
  to: number
  /** How many files of `administrator/lib/contracts/` were left out. */
  dropped: number
  /** The contracts kept or put in, by id (`tracy-business/j6/1.2.2`). */
  kept: string[]
  /** Of `kept`, the ones put in from their release assets (a slim release). */
  inserted: string[]
}

/** A row of a slim release's `contracts.json`. */
export interface IndexEntry {
  /** The release asset's file name, beside the package (`tracy-business--j6--1.2.6.zip`). */
  asset: string
  /** Hex sha256 and length of that asset. */
  sha256: string
  bytes: number
  /** The Joomla template its manifest names (`tracy_business`). */
  template?: string
  /** The contract its quickstart's params name, when it has one. */
  names?: string
}

/** A contract's release asset, checked against the index: its entries, as the asset packed them. */
export interface ContractAsset {
  entries: Entry[]
}

/** A shipped contract of a template the site has, with what tells its versions apart. */
export interface Candidate {
  /** `tracy-business/j6/1.2.2`: its folder under `administrator/lib/contracts/`. */
  id: string
  /** Its `presentation-lock.json` files: webroot path → sha256 of the file as the quickstart shipped it. */
  files: Record<string, string>
  /** The contract its quickstart's params name, when another one (`…/1.2.6` names `…/1.2.5`). */
  names?: string
}

/** An entry's bytes, unpacked; undefined for a compression method this does not read. */
function contentOf(e: Entry): Buffer | undefined {
  if (e.method === 0) return e.compressed
  if (e.method === 8) return inflateRawSync(e.compressed)
  return undefined
}

/** A JSON entry's value, or undefined when it does not read. */
function jsonOf(e: Entry | undefined): unknown {
  try {
    return e ? JSON.parse(contentOf(e)?.toString('utf8') ?? '') : undefined
  } catch {
    return undefined
  }
}

/** The component's entries, or undefined when `pkg` is not a Joomla Claude Cowork package of the expected shape. */
function componentOf(pkg: ArrayBuffer): { outer: Entry[]; component: Entry; inner: Entry[] } | undefined {
  const outer = readZip(Buffer.from(pkg))
  const component = outer?.find((e) => e.name.toString('utf8') === COMPONENT)
  if (!outer || !component) return undefined
  const componentBytes = contentOf(component)
  const inner = componentBytes && readZip(componentBytes)
  return inner ? { outer, component, inner } : undefined
}

/**
 * The index of a slim release (`administrator/lib/contracts.json`), id → row; undefined when the
 * component holds none (a full release) or `pkg` is not a Joomla Claude Cowork package. A row
 * without an asset name, a sha256 or a length is left out: it cannot be checked.
 */
export function contractIndex(pkg: ArrayBuffer): Map<string, IndexEntry> | undefined {
  const inner = componentOf(pkg)?.inner
  const index = inner?.find((e) => e.name.toString('utf8') === INDEX)
  if (!index) return undefined
  const contracts = (jsonOf(index) as { contracts?: unknown } | undefined)?.contracts
  const out = new Map<string, IndexEntry>()
  if (!contracts || typeof contracts !== 'object') return out
  for (const [id, row] of Object.entries(contracts as Record<string, Record<string, unknown>>)) {
    if (!safeContractId(id) || !row || typeof row !== 'object') continue
    const { asset, sha256, bytes, template, names } = row
    if (typeof asset !== 'string' || !safeAssetName(asset)) continue
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) continue
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) continue
    out.set(id, {
      asset,
      sha256: sha256.toLowerCase(),
      bytes,
      ...(typeof template === 'string' ? { template } : {}),
      ...(typeof names === 'string' && names !== id && safeContractId(names) ? { names } : {})
    })
  }
  return out
}

/**
 * The ids of a slim release's index whose row names one of `templates` (lower case), less those the
 * component already carries as a folder: the contracts whose assets are worth fetching.
 */
export function indexedCandidates(pkg: ArrayBuffer, templates: ReadonlySet<string>): string[] {
  const index = contractIndex(pkg)
  if (!index || templates.size === 0) return []
  const carried = carriedIds(pkg)
  return [...index]
    .filter(([id, row]) => !carried.has(id) && templates.has(String(row.template ?? '').toLowerCase()))
    .map(([id]) => id)
}

/** The contracts the component carries as folders under `administrator/lib/contracts/`. */
function carriedIds(pkg: ArrayBuffer): Set<string> {
  const ids = new Set<string>()
  for (const e of componentOf(pkg)?.inner ?? []) {
    const name = e.name.toString('utf8')
    if (!name.startsWith(CONTRACTS)) continue
    const id = name.slice(CONTRACTS.length).split('/').slice(0, 3)
    if (id.length === 3 && id[2] !== '') ids.add(id.join('/'))
  }
  return ids
}

/**
 * A contract asset's bytes, when they match the index row (`bytes`, `sha256`) and read as a zip
 * holding a `manifest.json` at its root; undefined otherwise: an asset that does not match is not
 * put into a customer's site.
 */
export function verifiedAsset(bytes: ArrayBuffer | Buffer, row: IndexEntry): ContractAsset | undefined {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buffer.length !== row.bytes) return undefined
  if (createHash('sha256').update(buffer).digest('hex') !== row.sha256) return undefined
  const entries = readZip(buffer)
  // A profile's files sit at the asset's root: an entry with any path in its name (`../x`, `a/b`,
  // `/x`, `a\\b`) could land outside the contract's folder, so the whole asset is refused.
  if (
    !entries?.every((e) => SAFE_NAME.test(e.name.toString('utf8')) && !e.name.toString('utf8').includes('..'))
  )
    return undefined
  if (!entries.some((e) => e.name.toString('utf8') === 'manifest.json')) return undefined
  return { entries }
}

/**
 * The assets of the contracts `ids` that `pkg`'s index lists, fetched by `fetchAsset` (given the
 * asset's file name) and checked by `verifiedAsset`. An id the index does not list, an asset that
 * does not come, or one that does not match is left out; nothing here throws.
 */
export async function fetchContractAssets(
  pkg: ArrayBuffer,
  ids: Iterable<string>,
  fetchAsset: (asset: string) => Promise<ArrayBuffer | Buffer | undefined>
): Promise<Map<string, ContractAsset>> {
  const index = contractIndex(pkg)
  const out = new Map<string, ContractAsset>()
  if (!index) return out
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const row = index.get(id)
      if (!row) return
      try {
        const bytes = await fetchAsset(row.asset)
        const asset = bytes && verifiedAsset(bytes, row)
        if (asset) out.set(id, asset)
      } catch {
        // Not fetched: the site fetches it itself when it binds.
      }
    })
  )
  return out
}

/**
 * The contracts whose `manifest.json` names one of `templates` (Joomla template names, lower case:
 * `tracy_business`): those the component carries as folders (a full release), and those of
 * `assets` (a slim release's, fetched and checked). A manifest that does not read names nothing.
 */
export function contractCandidates(
  pkg: ArrayBuffer,
  templates: ReadonlySet<string>,
  assets: ReadonlyMap<string, ContractAsset> = new Map()
): Candidate[] {
  const inner = componentOf(pkg)?.inner
  if (!inner || templates.size === 0) return []
  const byName = new Map(inner.map((e) => [e.name.toString('utf8'), e]))
  for (const [id, asset] of assets)
    for (const e of asset.entries) {
      const name = `${CONTRACTS}${id}/${e.name.toString('utf8')}`
      if (!byName.has(name)) byName.set(name, e)
    }
  const out: Candidate[] = []
  for (const name of byName.keys()) {
    const id =
      name.startsWith(CONTRACTS) && name.endsWith('/manifest.json') ? name.slice(CONTRACTS.length, -14) : ''
    if (id.split('/').length !== 3) continue
    const manifest = jsonOf(byName.get(name)) as
      | { template?: unknown; quickstart?: { contract?: unknown } }
      | undefined
    const template = manifest?.template
    if (typeof template !== 'string' || !templates.has(template.toLowerCase())) continue
    const lock = jsonOf(byName.get(`${CONTRACTS}${id}/presentation-lock.json`)) as
      | { files?: unknown }
      | undefined
    const files = lock?.files && typeof lock.files === 'object' ? (lock.files as Record<string, string>) : {}
    const names = manifest?.quickstart?.contract
    out.push({ id, files, ...(typeof names === 'string' && names !== id ? { names } : {}) })
  }
  return out
}

/** A file a browser may fetch from the site as it is: a template's or media's style, script, image or manifest. */
const PUBLIC_FILE = /^(templates|media)\/[^?#]+\.(css|js|xml|svg)$/

/**
 * Up to `max` public files whose hash differs between `candidates`, the most telling first: asking
 * the site for them says which version it runs. None when there is nothing to tell apart.
 */
export function probePaths(candidates: Candidate[], max = 8): string[] {
  if (candidates.length < 2) return []
  const paths = new Set(candidates.flatMap((c) => Object.keys(c.files)).filter((p) => PUBLIC_FILE.test(p)))
  const spread = (p: string): number => new Set(candidates.map((c) => c.files[p] ?? '')).size
  return [...paths]
    .map((p) => ({ p, n: spread(p) }))
    .filter(({ n }) => n > 1)
    .sort((a, b) => b.n - a.n || (a.p < b.p ? -1 : 1))
    .slice(0, max)
    .map(({ p }) => p)
}

/**
 * The contracts to keep: the candidates whose files match most of what the site answered (`seen`:
 * path → sha256 of its body), with the contract each one's quickstart names. When the site answered
 * nothing, or matched none, every candidate is kept: a larger package beats a missing contract.
 */
export function pickContracts(candidates: Candidate[], seen: ReadonlyMap<string, string>): Set<string> {
  const all = new Set(candidates.map((c) => c.id))
  if (candidates.length < 2 || seen.size === 0) return withNamed(candidates, all)
  const score = (c: Candidate): number => [...seen].filter(([p, h]) => c.files[p] === h).length
  const best = Math.max(...candidates.map(score))
  if (best === 0) return withNamed(candidates, all)
  return withNamed(candidates, new Set(candidates.filter((c) => score(c) === best).map((c) => c.id)))
}

function withNamed(candidates: Candidate[], ids: Set<string>): Set<string> {
  for (const c of candidates) if (ids.has(c.id) && c.names) ids.add(c.names)
  return ids
}

/**
 * The package with only the quickstart contracts `keep` names (`tracy-business/j6/1.2.2`) in its
 * component: every other carried folder taken out, and each kept one the component does not carry
 * put in from `assets` (a slim release's, checked by `fetchContractAssets`). Undefined when `pkg`
 * is not a Joomla Claude Cowork package of the expected shape, or nothing would change (it is then
 * sent as released).
 */
export function packageForImport(
  pkg: ArrayBuffer,
  keep: ReadonlySet<string> = new Set(),
  assets: ReadonlyMap<string, ContractAsset> = new Map()
): Slimmed | undefined {
  const parts = componentOf(pkg)
  if (!parts) return undefined
  const { outer, component, inner } = parts
  const keptFolders = [...keep].map((id) => `${CONTRACTS}${id}/`)
  const kept = inner.filter((e) => {
    const name = e.name.toString('utf8')
    return !name.startsWith(CONTRACTS) || keptFolders.some((folder) => name.startsWith(folder))
  })
  const dropped = inner.length - kept.length
  const carried = (id: string): boolean =>
    kept.some((e) => e.name.toString('utf8').startsWith(`${CONTRACTS}${id}/`))
  const inserted = [...keep].filter((id) => !carried(id) && assets.has(id) && safeContractId(id)).sort()
  if (dropped === 0 && inserted.length === 0) return undefined
  const keptIds = [...keep].filter(carried)
  const added = inserted.flatMap((id) =>
    (assets.get(id)?.entries ?? []).map((e) => ({
      ...e,
      name: Buffer.concat([Buffer.from(`${CONTRACTS}${id}/`, 'utf8'), e.name])
    }))
  )
  const slimComponent = writeZip([...kept, ...added])
  const rewritten: Entry = {
    ...component,
    method: 8,
    crc: crc32(slimComponent),
    size: slimComponent.length,
    compressed: deflateRawSync(slimComponent)
  }
  const out = writeZip(outer.map((e) => (e === component ? rewritten : e)))
  const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.length) as ArrayBuffer
  return {
    bytes,
    from: pkg.byteLength,
    to: out.length,
    dropped,
    kept: [...new Set([...keptIds, ...inserted])].sort(),
    inserted
  }
}
