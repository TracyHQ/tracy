// Cases that need something outside the repo: GitHub (the release catalogue and each release's assets) or a live
// stand (install and operate a site). Each says what it needs as a prerequisite; a probe that looked and found it
// missing makes the case ENV, never PASS. When the dependency is there but no safe driver exists the case is
// PENDING with the exact missing piece, so every obligation stays in coverage.
import fs from 'node:fs/promises'
import path from 'node:path'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonAsync } from '../../../lib/bounded-reader.mjs'
import { PRODUCT, load } from '../lib/helpers.mjs'
import { INSTALLS, OPERATIONS } from '../lib/inventory.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })

const OP_TAGS = {
  read: ['happy'],
  'content-edit': ['edit-readback'],
  'file-edit': ['edit-readback'],
  backup: ['restore'],
  restore: ['restore'],
  publish: ['happy'],
  delete: ['cleanup']
}

async function github(ctx, url, { accept = 'application/vnd.github+json', ms = 60_000 } = {}) {
  const f = ctx.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await f(url, {
      signal: controller.signal,
      headers: {
        accept,
        authorization: `Bearer ${ctx.env.QA_RELEASES_TOKEN}`,
        'user-agent': 'tracy-qa',
        'x-github-api-version': '2022-11-28'
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

async function hashBody(response) {
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of response.body) {
    hash.update(chunk)
    size += chunk.length
  }
  return { sha256: hash.digest('hex'), size }
}

/** Live check of one release: every pinned part exists on the release and its bytes are the pinned bytes. */
async function checkLivePins(ctx) {
  const mod = await load(ctx.root, PRODUCT.quickstartReleases)
  const api = ctx.env.QA_GITHUB_API ?? 'https://api.github.com'
  const manifest = await readBoundedJsonAsync(path.join(ctx.dataRoot, ctx.params.dir, 'manifest.json'), {
    maxBytes: MAX_LAYER_FILE_BYTES,
    root: ctx.dataRoot
  })
  const tag = manifest.quickstart.release
  const parts = manifest.quickstart.parts ?? {}
  const lookup = await github(
    ctx,
    `${api}/repos/${mod.RELEASES_REPO}/releases/tags/${encodeURIComponent(tag)}`
  )
  if (lookup.status === 404)
    return {
      verdict: 'PENDING',
      reason: `${mod.RELEASES_REPO} has no release tagged ${tag}; no ruling says a contract must have a published release`,
      evidence: []
    }
  if (!lookup.ok)
    return { verdict: 'ENV', reason: `GitHub answered ${lookup.status} reading ${tag}`, evidence: [] }
  const release = await lookup.json()
  const control = ok(
    Array.isArray(release.assets) && release.tag_name === tag,
    `release ${tag} read: ${release.assets?.length} assets`
  )
  const problems = []
  for (const [name, pin] of Object.entries(parts)) {
    const asset = (release.assets ?? []).find((a) => a.name === pin.file)
    if (!asset) {
      problems.push(`${name}: ${pin.file} is not an asset of ${tag}`)
      continue
    }
    if (Number.isInteger(pin.bytes) && Number.isInteger(asset.size) && asset.size !== pin.bytes)
      problems.push(`${name}: size ${asset.size}, pinned ${pin.bytes}`)
    const stated = /^sha256:([a-f0-9]{64})$/.exec(asset.digest ?? '')?.[1] ?? null
    if (stated) {
      if (stated !== pin.sha256)
        problems.push(`${name}: GitHub states sha256 ${stated}, pinned ${pin.sha256}`)
      continue
    }
    const bytes = await github(ctx, `${api}/repos/${mod.RELEASES_REPO}/releases/assets/${asset.id}`, {
      accept: 'application/octet-stream',
      ms: 600_000
    })
    if (!bytes.ok) {
      problems.push(`${name}: download answered ${bytes.status}`)
      continue
    }
    const got = await hashBody(bytes)
    if (got.sha256 !== pin.sha256)
      problems.push(`${name}: downloaded bytes hash to ${got.sha256}, pinned ${pin.sha256}`)
  }
  return {
    control,
    check: ok(
      problems.length === 0,
      problems.join('; ') || `${Object.keys(parts).length} part(s) exist with the pinned size and sha256`
    )
  }
}

async function checkLiveCatalogue(ctx) {
  const mod = await load(ctx.root, PRODUCT.quickstartReleases)
  const api = ctx.env.QA_GITHUB_API ?? 'https://api.github.com'
  const tags = []
  const MAX_PAGES = 30
  let truncated = true
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await github(ctx, `${api}/repos/${mod.RELEASES_REPO}/releases?per_page=100&page=${page}`)
    if (!res.ok)
      return {
        verdict: 'ENV',
        reason: `GitHub answered ${res.status} listing releases (page ${page})`,
        evidence: []
      }
    const batch = await res.json()
    tags.push(...batch.map((r) => r.tag_name))
    if (batch.length < 100) {
      truncated = false
      break
    }
  }
  if (truncated)
    return {
      verdict: 'PENDING',
      reason: `more than ${MAX_PAGES * 100} releases: the live catalogue could not be read to its end`,
      evidence: []
    }
  const known = new Set(ctx.params.inventoryTags)
  const missingLive = [...known].filter((t) => !tags.includes(t))
  const unknownToRepo = tags.filter((t) => !known.has(t))
  const rel = 'evidence/live-catalogue.json'
  await fs.mkdir(path.join(ctx.outDir, 'evidence'), { recursive: true })
  await fs.writeFile(
    path.join(ctx.outDir, rel),
    `${JSON.stringify({ liveCount: tags.length, inventoryCount: known.size, missingLive, unknownToRepoCount: unknownToRepo.length, unknownToRepo }, null, 2)}\n`
  )
  return {
    verdict: 'PENDING',
    reason: `live catalogue read (${tags.length} releases): ${unknownToRepo.length} have no contract in this repo, ${missingLive.length} contract release(s) are not live; recorded as coverage observations, not judged (no ruling)`,
    evidence: [rel]
  }
}

export function liveSpecs(inventory) {
  const releases = inventory.releases
  const emdash = inventory.emdash
  const matrixItems = [
    ...releases
      .filter((r) => !r.designPack)
      .map((r) => ({ itemId: `release:${r.key}`, label: r.key, cms: r.platform })),
    ...emdash.map((e) => ({ itemId: `emdash:${e.id}`, label: e.key, cms: 'emdash' }))
  ]
  const matrixVariants = []
  for (const item of matrixItems)
    for (const install of INSTALLS)
      for (const op of OPERATIONS)
        matrixVariants.push({
          key: `${item.label}-${install}-${op}`,
          itemId: item.itemId,
          tags: [install === 'fresh' ? 'fresh-install' : 'restore', ...OP_TAGS[op]],
          params: { item: item.itemId, label: item.label, cms: item.cms, install, operation: op },
          mutation: null
        })
  return [
    {
      item: null,
      assertion: 'release.live-pins-match-github',
      area: 'live',
      requirement:
        "Each pinned part of the release exists on the GitHub release with the pinned size and sha256 (GitHub's own digest, or the downloaded bytes when it states none).",
      oracle: {
        source: ADR17,
        section: '§3 and Consequences',
        invariant:
          'the pin in the release setting is checked against the asset list and the bytes; a release that declares a wrong hash but downloads is a FAIL'
      },
      reads: ['https://api.github.com (JoomlArt-Products/ja-products releases)'],
      perRelease: true,
      prerequisites: ['net:github', 'creds:releases-token'],
      variants: releases
        .filter((r) => r.shape !== 'none')
        .map((r) => ({
          key: r.key,
          itemId: `release:${r.key}`,
          tags: ['missing-asset', 'bad-hash'],
          params: { dir: r.dir },
          mutation: 'pin-corrupted-live'
        })),
      mutations: {
        'pin-corrupted-live': (p) => ({
          id: 'pin-corrupted-live',
          describe: 'the first pin loses one hex digit',
          kind: 'data',
          copy: [p.dir],
          files: [
            {
              path: `${p.dir}/manifest.json`,
              json: (m) => {
                const first = Object.values(m.quickstart.parts)[0]
                first.sha256 = `${first.sha256.slice(0, 63)}${first.sha256.endsWith('0') ? '1' : '0'}`
              }
            }
          ]
        })
      },
      execute: checkLivePins,
      live: true
    },
    {
      item: null,
      assertion: 'catalogue.live-releases-read',
      area: 'live',
      requirement:
        'The live release catalogue is read to its end and compared with the releases this repo has contracts for.',
      oracle: {
        source: ADR17,
        section: 'Acceptance (the screen lists every release GitHub has)',
        invariant: 'the releases repository is the source of truth of the catalogue'
      },
      reads: ['https://api.github.com (JoomlArt-Products/ja-products releases)'],
      prerequisites: ['net:github', 'creds:releases-token'],
      variants: [
        {
          key: 'ja-products',
          itemId: 'live:ja-products-releases',
          tags: ['happy', 'boundary'],
          params: { inventoryTags: [...new Set(releases.map((r) => r.release))].sort() },
          mutation: null
        }
      ],
      mutations: {},
      execute: checkLiveCatalogue
    },
    {
      item: null,
      assertion: 'stand.cms-operation',
      area: 'matrix',
      requirement:
        'On a live stand, a site built from this template/release by this install way supports this operation, proven by an independent read-back (content, files, database).',
      oracle: {
        source:
          "CONTEXT.md + docs/adr/0014 (agent commands run in the site's own container) + ADR 0017 §4 (install shapes)",
        section: 'CMS x release x install x operation matrix',
        invariant: 'readback of content/file/database equals what was written or restored'
      },
      reads: ['QA_STAND_URL'],
      writes: ['stand site (owned by the QA run)'],
      containers: true,
      targets: ['local', 'dev'],
      prerequisites: ['stand:url'],
      variants: matrixVariants,
      mutations: {},
      pending:
        'a stand is reachable but this layer has no driver for the operation yet: it needs QA_STAND_* site fixture bindings (a site built from this release) and an independent readback oracle for content, files and database; none is granted to W8'
    }
  ]
}
