// The asset set of a published AI quickstart (ticket #588): what the publish step adds to the release of the human
// quickstart of the same template version. Every name starts with `ai-quickstart-<slug>-<cms>-<version>.`, a prefix no
// human quickstart asset carries (`ja-boxing-j6-quickstart-<version>.zip`, `template-kit-<slug>-<version>.zip`,
// `SHA256SUMS`, `manifest.json`, ...), so the two never collide in one release and two versions never collide either.
// The set: the blank site archive, every file of the kit folder the publish step checked (the block store, the page
// recipes, the mapping file, the kit manifest, the blank site contract, the check record and the rest), the template
// kit the build reads beside it, and a checksum manifest naming each asset's kit path, bytes and sha256. Pure but for
// reading the files named.
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

export const PUBLISH_MANIFEST_SCHEMA = 'tracy-ai-quickstart-published/v1'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The kit a folder `<slug>/<cms>/<version>` is, by its path. */
export function kitRefOf(folder) {
  const [slug, cms, version] = path.resolve(folder).split(path.sep).slice(-3)
  return { slug, cms, version }
}

/** The prefix of every asset of one kit version. */
export const assetPrefixOf = ({ slug, cms, version }) => 'ai-quickstart-' + slug + '-' + cms + '-' + version

/** The asset name of a kit file: the prefix, then its path with each folder separator a dot. */
export const assetNameOf = (prefix, rel) => prefix + '.' + rel.split('/').join('.')

/** Every file of a kit folder, by its path relative to it, sorted. */
function kitFiles(folder) {
  return readdirSync(folder, { recursive: true })
    .map(String)
    .sort()
    .filter((rel) => statSync(path.join(folder, rel)).isFile())
    .map((rel) => ({ rel: rel.split(path.sep).join('/'), from: path.join(folder, rel) }))
}

const described = (name, role, kitPath, from) => {
  const bytes = readFileSync(from)
  return { name, role, path: kitPath, from, bytes: bytes.length, sha256: sha256(bytes) }
}

/**
 * The assets of a kit, every one with its name, role, kit path (null when not a kit file), bytes and sha256.
 * @param {{folder: string, blankSite: string, templateKit?: string | null}} input `blankSite`: the archive the gate
 *   ran on; `templateKit`: the template kit file beside the kit, when there is one
 * @returns {{prefix: string, assets: object[], problems: Array<{code: string, message: string}>}}
 */
export function assetSetOf({ folder, blankSite, templateKit = null }) {
  const prefix = assetPrefixOf(kitRefOf(folder))
  const assets = [described(prefix + '.blank-site.zip', 'blank-site', null, blankSite)]
  for (const f of kitFiles(folder))
    assets.push(described(assetNameOf(prefix, f.rel), 'kit-file', f.rel, f.from))
  if (templateKit && existsSync(templateKit))
    assets.push(described(prefix + '.template-kit.json', 'template-kit', null, templateKit))
  const seen = new Map()
  const problems = []
  for (const a of assets) {
    if (seen.has(a.name))
      problems.push({
        code: 'asset_name_collision',
        message: a.name + ' names both ' + (seen.get(a.name) ?? a.role) + ' and ' + (a.path ?? a.role)
      })
    seen.set(a.name, a.path ?? a.role)
  }
  return { prefix, assets, problems }
}

/** The checksum manifest of an asset set: what was published, for which release, on which record. */
export function publishedManifestOf({ kitRef, release, binding, assets }) {
  return {
    schema: PUBLISH_MANIFEST_SCHEMA,
    kit: kitRef,
    release,
    gateVersion: binding.gateVersion ?? null,
    kitFilesSha256: binding.kitFilesSha256 ?? null,
    recordSha256: binding.recordSha256 ?? null,
    blankSiteSha256: binding.blankSiteSha256 ?? null,
    humanQuickstartSha256: binding.humanQuickstartSha256 ?? null,
    assets: assets.map(({ name, role, path: p, bytes, sha256: s }) => ({
      name,
      role,
      path: p,
      bytes,
      sha256: s
    }))
  }
}

/** The names of an asset set the release already has. */
export const collisionsOf = (names, existing) => names.filter((n) => existing.includes(n))

/**
 * Writes every asset and the manifest into `dir` under its published name.
 * @returns {{files: string[], manifest: {file: string, bytes: number, sha256: string}}}
 */
export function writeAssetSet(dir, { prefix, assets }, manifest) {
  mkdirSync(dir, { recursive: true })
  const files = []
  for (const a of assets) {
    const to = path.join(dir, a.name)
    copyFileSync(a.from, to)
    if (sha256(readFileSync(to)) !== a.sha256) throw new Error(a.name + ' changed while it was copied')
    files.push(to)
  }
  const text = JSON.stringify(manifest, null, 1) + '\n'
  const file = path.join(dir, prefix + '.manifest.json')
  writeFileSync(file, text)
  files.push(file)
  return {
    files,
    manifest: { file: path.basename(file), bytes: Buffer.byteLength(text), sha256: sha256(Buffer.from(text)) }
  }
}
