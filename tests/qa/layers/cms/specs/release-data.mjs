// Per-release cases, one set for every release the repo carries a contract for. The expectations come from the
// case's own `dimensions` (extracted from the manifest at generation time), the consumer is the REAL product code
// run on the contract directory, and the RED proof corrupts that release's own data in a scratch copy.
//
// Oracle: ADR 0017 §3/§9 (a manifest names the quickstart it seals and pins its files by sha256), ADR 0022
// (contract = recommendation), and the producer files' own comments (superseded.json "$comment").
import path from 'node:path'
import {
  listBoundedDirAsync,
  MAX_LAYER_FILE_BYTES,
  readBoundedAsync,
  readBoundedJsonAsync
} from '../../../lib/bounded-reader.mjs'
import { PRODUCT, load, observe } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ADR22 = 'docs/adr/0022-quickstart-contract-is-advice.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })
const SHA = /^[a-f0-9]{64}$/
const SECRETS = [
  ['github-token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['url-credentials', /\bhttps?:\/\/[^\s/:@"']+:[^\s/@"']+@/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._-]{20,}/]
]

const dirOf = (ctx) => path.join(ctx.dataRoot, ctx.params.dir)
const copyOf = (p) => [p.dir, `${p.dir}.design.json`]

// Every read stays under the data root, so a symlinked or missing contract directory is refused. Only
// `optional` (the companion design file) may be absent, and only when its parent is a real directory.
async function readJson(ctx, file, { optional = false } = {}) {
  try {
    const value = await readBoundedJsonAsync(file, {
      maxBytes: MAX_LAYER_FILE_BYTES,
      allowMissing: optional,
      root: ctx.dataRoot
    })
    return value === null ? { value: null, error: null, absent: true } : { value, error: null }
  } catch (error) {
    return { value: null, error: `${error.code ?? 'ERROR'}: ${error.message}` }
  }
}

/** A neighbouring release is the control: the same assertion on its untouched data must hold. */
async function control(ctx, run) {
  const ctl = ctx.params.controlParams
  if (!ctl) return ok(true, 'no neighbour to control against')
  const r = await run({ ...ctx, dataRoot: ctx.repoRoot, params: ctl })
  return ok(r.ok, `control release ${ctl.release}@${ctl.version}: ${r.detail}`)
}

async function checkResolve(ctx) {
  const mod = await load(ctx.root, PRODUCT.contracts)
  const tagMod = await load(ctx.root, PRODUCT.quickstartReleases)
  const p = ctx.params
  const index = await observe(() => mod.readContracts([dirOf(ctx)]))
  if (index.threw) return ok(false, `readContracts threw: ${index.threw}`)
  const found = mod.contractFor(index.value, p.release, p.version)
  const problems = []
  if (!found) problems.push('no contract resolves for its own release@version')
  else {
    if (found.id !== p.id) problems.push(`resolved id ${found.id}, expected ${p.id}`)
    if (found.fallbackFrom) problems.push(`resolved only by fallback from ${found.fallbackFrom}`)
    if ((found.coworkMinVersion ?? null) !== (p.floor ?? null))
      problems.push(`cowork floor ${found.coworkMinVersion}, expected ${p.floor}`)
    if (found.platform !== p.platform) problems.push(`platform ${found.platform}, expected ${p.platform}`)
  }
  const tagPlatform = tagMod.platformOfTag(p.release)
  if (tagPlatform !== null && tagPlatform !== p.platform)
    problems.push(`tag ${p.release} suggests ${tagPlatform}`)
  return ok(
    problems.length === 0,
    problems.join('; ') || 'resolves to its own contract with its declared floor'
  )
}

async function checkPins(ctx) {
  const p = ctx.params
  const manifest = await readJson(ctx, path.join(dirOf(ctx), 'manifest.json'))
  if (manifest.error) return ok(false, `manifest unreadable: ${manifest.error}`)
  const parts = manifest.value?.quickstart?.parts ?? {}
  const names = Object.keys(parts).sort().join('+')
  // Part names are sorted before joining, so webroot+database reads "database+webroot".
  const allowed = ['', 'installer', 'database+webroot', 'template', 'bundle', 'source+state']
  const problems = []
  if (!allowed.includes(names)) problems.push(`install shape ${JSON.stringify(names)} is not a named shape`)
  for (const [name, part] of Object.entries(parts)) {
    if (typeof part?.file !== 'string' || part.file === '' || /[\\/]/.test(part.file) || part.file === '..')
      problems.push(`${name}.file is not a plain file name`)
    if (typeof part?.sha256 !== 'string' || !SHA.test(part.sha256))
      problems.push(`${name}.sha256 is not 64 lowercase hex`)
    if (!Number.isInteger(part?.bytes) || part.bytes < 1)
      problems.push(`${name}.bytes is not a positive integer`)
    if (part?.url !== undefined && /^https?:\/\/[^/]*@/.test(String(part.url)))
      problems.push(`${name}.url carries credentials`)
  }
  if (p.shape !== names)
    problems.push(`shape ${JSON.stringify(names)} differs from the inventoried ${JSON.stringify(p.shape)}`)
  if (Object.keys(parts).length === 0)
    return {
      verdict: 'PENDING',
      reason: 'the manifest declares no install parts, so there is no pin to check',
      evidence: []
    }
  return ok(
    problems.length === 0,
    problems.join('; ') ||
      `${Object.keys(parts).length} part(s) pinned with well-formed names, hashes and sizes`
  )
}

export async function checkLocks(ctx) {
  const dir = dirOf(ctx)
  const problems = []
  for (const name of ['presentation-lock.json', 'content-map.json']) {
    const r = await readJson(ctx, path.join(dir, name))
    if (r.error) problems.push(`${name}: ${r.error}`)
    else if (!r.value || typeof r.value !== 'object') problems.push(`${name}: not an object`)
  }
  const design = await readJson(ctx, `${dir}.design.json`, { optional: true })
  if (design.error) problems.push(`design file: ${design.error}`)
  if (ctx.params.platform === 'wordpress' && ctx.params.hasSuperseded) {
    const s = await readJson(ctx, path.join(dir, 'superseded.json'))
    if (s.error) problems.push(`superseded.json: ${s.error}`)
    else if (s.value?.contract !== ctx.params.id)
      problems.push(`superseded.json names contract ${s.value?.contract}, expected ${ctx.params.id}`)
  }
  return ok(
    problems.length === 0,
    problems.join('; ') || 'presentation lock, content map and companion files are present and parse'
  )
}

// Lists the contract directory through the shared lister (plain ancestors below the data root, the
// directory itself not a symlink). A FIFO, symlink or device is returned as a file to scan so the
// bounded reader refuses it by name; a listing error fails the scan.
async function walk(dir, root) {
  const out = []
  for (const entry of await listBoundedDirAsync(dir, { root })) {
    if (entry.kind === 'dir') out.push(...(await walk(entry.full, root)))
    else out.push(entry.full)
  }
  return out
}

export async function checkSecrets(ctx) {
  const dir = dirOf(ctx)
  const hits = []
  const refused = []
  let files
  try {
    files = await walk(dir, ctx.dataRoot)
  } catch (error) {
    return ok(false, `unsafe or unreadable contract directory: ${error.message}`)
  }
  // Every listed file must be scanned; only the companion design copy may be absent.
  const design = `${dir}.design.json`
  const scanned = [...files]
  for (const file of [...files, design]) {
    let text
    try {
      text = (
        await readBoundedAsync(file, {
          maxBytes: MAX_LAYER_FILE_BYTES,
          allowMissing: file === design,
          root: ctx.dataRoot
        })
      )?.toString('utf8')
    } catch (error) {
      refused.push(`${path.basename(file)}:${error.message}`)
      continue
    }
    if (text === undefined) continue
    if (file === design) scanned.push(design)
    for (const [name, re] of SECRETS) if (re.test(text)) hits.push(`${path.basename(file)}:${name}`)
  }
  if (refused.length) return ok(false, `unsafe or unreadable file(s): ${refused.join('; ')}`)
  return ok(
    hits.length === 0,
    hits.length
      ? `secret-like content in ${hits.join(', ')}`
      : `${scanned.length} file(s) scanned, no secret-like content`
  )
}

const manifestEdit = (fn) => (p) => ({
  kind: 'data',
  copy: copyOf(p),
  files: [{ path: `${p.dir}/manifest.json`, json: fn }]
})

const RUNNERS = { resolve: checkResolve, pins: checkPins, locks: checkLocks, secrets: checkSecrets }

const defs = {
  resolve: {
    assertion: 'release.contract-resolves-to-itself',
    requirement:
      "The sealing index built from this release's contract resolves its own release@version to its own id, with the floor and platform its manifest declares.",
    oracle: {
      source: ADR17,
      section: '§9',
      invariant: 'each manifest names the quickstart it seals; contracts.js builds the index from that'
    },
    tags: ['happy', 'upgrade-compat'],
    mutationId: 'version-drifts',
    mutation: manifestEdit((m) => {
      m.quickstart.version = '9.9.9'
    }),
    describe: 'the manifest claims another version than the release it sits for'
  },
  pins: {
    assertion: 'release.pins-are-well-formed',
    requirement:
      'Every install part of the release is a plain file name with a 64-hex sha256 and a positive size, and together the parts make a named install shape.',
    oracle: {
      source: ADR17,
      section: '§3-§4',
      invariant:
        'parts are pinned by sha256, never by an address; PHP CMS shapes are webroot+database or installer, not a mixture'
    },
    tags: ['bad-hash', 'archive-path', 'mixed-version'],
    mutationId: 'pin-corrupted',
    mutation: manifestEdit((m) => {
      const first = Object.values(m.quickstart.parts)[0]
      first.sha256 = first.sha256.slice(0, 63)
    }),
    describe: 'the first pin loses one hex digit'
  },
  locks: {
    assertion: 'release.lock-files-are-present',
    requirement:
      'The presentation lock and content map the contract points agents at exist and parse; a WordPress superseded list names this contract.',
    oracle: {
      source: `${ADR22} + ${ADR17} §9`,
      section: 'contract as a map of slots',
      invariant: 'the profile files beside manifest.json are all there, readable and about this profile'
    },
    tags: ['missing-contract', 'happy'],
    mutationId: 'lock-removed',
    mutation: (p) => ({
      kind: 'data',
      copy: copyOf(p),
      files: [{ path: `${p.dir}/presentation-lock.json`, remove: true }]
    }),
    describe: 'presentation-lock.json is deleted'
  },
  secrets: {
    assertion: 'release.contract-carries-no-secret',
    requirement: 'No file of the release contract contains a token, key, bearer value or credentialed URL.',
    oracle: {
      source: 'CLAUDE.md §5 (secrets and infrastructure) + ADR 0017 §3 (parts carry no URL)',
      section: 'secrets never ride in tracked contracts',
      invariant: 'contract files are public-safe'
    },
    tags: ['secret-scrub'],
    mutationId: 'token-injected',
    mutation: manifestEdit((m) => {
      m.note = `ghp_${'a1B2c3D4e5'.repeat(4)}`
    }),
    describe: 'a GitHub-token-shaped string is added to the manifest'
  }
}

/** Build the per-release specs from the inventory. */
export function releaseSpecs(inventory) {
  const releases = inventory.releases
  return Object.entries(defs).map(([kind, d]) => ({
    item: null,
    assertion: d.assertion,
    area: 'contract',
    requirement: d.requirement,
    oracle: d.oracle,
    reads: ['packages/cms/*/contracts'],
    perRelease: true,
    variants: releases.map((r, i) => {
      // The control release: the next one (cyclically) the same assertion can really judge.
      const pool = releases.filter((x) => x.key !== r.key && (kind !== 'pins' || x.shape !== 'none'))
      const neighbour = pool.length ? pool[i % pool.length] : r
      return {
        key: r.key,
        itemId: `release:${r.key}`,
        tags: d.tags,
        params: {
          dir: r.dir,
          release: r.release,
          version: r.version,
          id: r.id,
          platform: r.platform,
          floor: r.floor,
          shape: r.shape,
          hasSuperseded: r.hasSuperseded,
          controlParams:
            neighbour.key === r.key
              ? null
              : {
                  dir: neighbour.dir,
                  release: neighbour.release,
                  version: neighbour.version,
                  id: neighbour.id,
                  platform: neighbour.platform,
                  floor: neighbour.floor,
                  shape: neighbour.shape,
                  hasSuperseded: neighbour.hasSuperseded
                }
        },
        mutation: d.mutationId
      }
    }),
    mutations: { [d.mutationId]: (p) => ({ id: d.mutationId, describe: d.describe, ...d.mutation(p) }) },
    async execute(ctx) {
      const run = RUNNERS[kind]
      const check = await run(ctx)
      if (check.verdict) return check
      // The control is the same assertion on an untouched neighbour release: it proves the check can say yes.
      return { control: await control(ctx, run), check }
    }
  }))
}
