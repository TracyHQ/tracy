// Offline, reproducible inventory of what the `cms` layer answers for. Everything here is read from the
// git-tracked tree (never from directory names): a release's identity is what its manifest.json says it is.
// What GitHub holds today is NOT in here: it is read at run time (probe + paging) and reported separately.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { sha256Of } from './kit.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

export const COMMON_TAGS = Object.freeze([
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
])
export const CMS_TAGS = Object.freeze([
  'fresh-install',
  'restore',
  'edit-readback',
  'missing-asset',
  'bad-hash',
  'mixed-version',
  'missing-contract',
  'upgrade-compat',
  'secret-scrub',
  'archive-path'
])
export const INSTALLS = Object.freeze(['fresh', 'restore'])
export const OPERATIONS = Object.freeze([
  'read',
  'content-edit',
  'file-edit',
  'backup',
  'restore',
  'publish',
  'delete'
])

const CONTRACT_PACKAGES = ['packages/cms/tracy-joomla-quickstart', 'packages/cms/tracy-wordpress-quickstart']
const EMDASH_THEMES = [
  'packages/cms/tracy-emdash-theme-base',
  'packages/cms/tracy-emdash-theme-business',
  'packages/cms/tracy-emdash-theme-saas'
]

export const CODE_FILES = Object.freeze([
  'apps/tracy-web/src/lib/release-assets.js',
  'apps/tracy-web/src/lib/quickstart-releases.js',
  'apps/tracy-web/src/lib/local-releases.js',
  'apps/tracy-web/src/lib/tracy-setting.mjs',
  'apps/tracy-web/src/lib/contracts.js',
  'apps/tracy-web/src/lib/build-questions.js',
  'apps/tracy-web/src/lib/question-sets.js',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstart.py',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstart_jpa.py'
])

export const ORACLE_DOCS = Object.freeze([
  'docs/adr/0017-github-release-is-quickstart-source-of-truth.md',
  'docs/adr/0021-one-content-api-for-three-cms.md',
  'docs/adr/0022-quickstart-contract-is-advice.md'
])

/** Legacy suites the layer wraps: [file, runner]. Others under packages/cms stay in the unit layer. */
const LEGACY_FILES = [
  ['apps/tracy-web/test/quickstart-releases.test.mjs', 'node'],
  ['apps/tracy-web/test/release-assets.test.mjs', 'node'],
  ['apps/tracy-web/test/local-releases.test.mjs', 'node'],
  ['apps/tracy-web/test/contracts.test.mjs', 'node'],
  ['apps/tracy-web/test/build-questions.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/emdash-quickstart.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/installer-quickstart.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/local-quickstart.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/template-quickstart.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/wordpress-quickstart.test.mjs', 'node'],
  ['packages/fleet/tracy-fleet-operation/test/quickstart-jpa.test.py', 'python3']
]

function gitFiles(repoRoot, ...specs) {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...specs], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return out.split('\0').filter(Boolean).sort()
}

const read = (repoRoot, rel) => readTextSync(path.join(repoRoot, rel))

/** Exported names of a JS module / top-level defs of a Python module, by regex (extractionKind: regex). */
export function symbolsOf(rel, text) {
  const names = new Set()
  if (rel.endsWith('.py')) {
    for (const m of text.matchAll(/^(?:def|class)\s+([A-Za-z_]\w*)/gm)) names.add(m[1])
  } else {
    for (const m of text.matchAll(
      /^export\s+(?:async\s+)?(?:function\*?|const|class)\s+([A-Za-z_$][\w$]*)/gm
    ))
      names.add(m[1])
    for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm))
      for (const part of m[1].split(',')) {
        const name = part
          .trim()
          .split(/\s+as\s+/)
          .pop()
        if (name) names.add(name)
      }
  }
  return [...names].sort()
}

const secretFreeBasename = (f) =>
  typeof f === 'string' && f !== '' && !f.includes('/') && !f.includes('\\') && f !== '..' && f !== '.'

/** The shape a manifest's parts make: 'webroot+database', 'installer', 'template', 'none', or the raw key list. */
export function shapeOfParts(parts) {
  const keys = Object.keys(parts ?? {}).sort()
  return keys.length === 0 ? 'none' : keys.join('+')
}

export function extract(repoRoot) {
  const unresolved = []
  const sources = []
  const track = (rel, text) => sources.push({ path: rel, sha256: sha256Of(text) })

  // --- releases, from the manifests the contract packages carry ---
  const releases = []
  const seenKeys = new Set()
  for (const pkg of CONTRACT_PACKAGES) {
    const files = gitFiles(repoRoot, `${pkg}/contracts`)
    const present = new Set(files)
    for (const rel of files.filter((f) => f.endsWith('/manifest.json'))) {
      const text = read(repoRoot, rel)
      track(rel, text)
      let m
      try {
        m = JSON.parse(text)
      } catch (error) {
        unresolved.push({ id: rel, reason: `manifest.json is not valid JSON: ${error.message}` })
        continue
      }
      const q = m?.quickstart
      if (
        typeof q?.release !== 'string' ||
        typeof q?.version !== 'string' ||
        typeof m?.id !== 'string' ||
        typeof m?.platform !== 'string'
      ) {
        unresolved.push({
          id: rel,
          reason: 'manifest does not name quickstart.release, quickstart.version, id and platform'
        })
        continue
      }
      const dir = path.posix.dirname(rel)
      const key = `${q.release.replaceAll('/', ':')}@${q.version}`
      if (seenKeys.has(key)) {
        unresolved.push({ id: rel, reason: `second manifest for ${key}` })
        continue
      }
      seenKeys.add(key)
      const parts = q.parts ?? {}
      const floor =
        [m.coworkContractVersion, m.receiverVersion, m.coworkMinVersion, m.receiverFloor].find(
          (v) => typeof v === 'string'
        ) ?? null
      releases.push({
        key,
        release: q.release,
        version: q.version,
        id: m.id,
        platform: m.platform,
        cms: q.cms?.version ?? q.platformVersion ?? null,
        template: m.template ?? m.theme ?? null,
        mode: typeof m.mode === 'string' ? m.mode : null,
        floor,
        dir,
        manifest: rel,
        pkg,
        parts: Object.fromEntries(
          Object.entries(parts).map(([name, p]) => [
            name,
            { file: p?.file ?? null, bytes: p?.bytes ?? null, sha256: p?.sha256 ?? null }
          ])
        ),
        shape: shapeOfParts(parts),
        hasSuperseded: present.has(`${dir}/superseded.json`),
        designPack: Object.keys(parts).length === 1 && 'template' in parts,
        unsafeFileName: Object.values(parts).some((p) => !secretFreeBasename(p?.file))
      })
    }
  }
  releases.sort((a, b) => a.key.localeCompare(b.key))

  // --- EmDash templates, from the QA contract each theme package carries ---
  const emdash = []
  for (const pkg of EMDASH_THEMES) {
    const rel = `${pkg}/qa.contract.json`
    try {
      const text = read(repoRoot, rel)
      track(rel, text)
      const doc = JSON.parse(text)
      if (typeof doc.id !== 'string') throw new Error('no id')
      emdash.push({ key: `emdash:${doc.id}`, id: doc.id, revision: doc.revision ?? null, pkg, path: rel })
    } catch (error) {
      unresolved.push({ id: rel, reason: `EmDash qa.contract.json unreadable: ${error.message}` })
    }
  }

  // --- the code under test, by exported symbol ---
  const functions = []
  for (const rel of CODE_FILES) {
    const text = read(repoRoot, rel)
    track(rel, text)
    for (const symbol of symbolsOf(rel, text))
      functions.push({ id: `fn:${path.posix.basename(rel)}#${symbol}`, file: rel, symbol })
  }
  unresolved.push({
    id: 'extraction:exports',
    reason:
      'function items are found by regex over export/def lines; a symbol exported by a computed or re-exported form is not seen'
  })

  // --- legacy suites ---
  const legacy = LEGACY_FILES.map(([file, runner]) => {
    const text = read(repoRoot, file)
    track(file, text)
    return { id: `suite:${file}`, file, runner, needsDatabase: /TEST_DATABASE_URL|DATABASE_URL/.test(text) }
  })
  unresolved.push({
    id: 'suites:packages/cms',
    reason:
      'other tests under packages/cms (themes, seeder, sections, content-api, motion, preview, joomla-template, wordpress-theme) are not wrapped by this layer; the unit layer owns them'
  })
  for (const rel of ORACLE_DOCS) track(rel, read(repoRoot, rel))
  unresolved.push({
    id: 'live:ja-products-releases',
    reason:
      'the release catalogue on GitHub (JoomlArt-Products/ja-products) is read only at run time and needs network and a token; this inventory is the set of releases the repo carries contracts for, not the catalogue'
  })
  unresolved.push({
    id: 'contracts:mode-name',
    reason:
      'ADR 0022 §3 says `mode` is content-recommendation; sealed manifests of earlier releases still carry content-only. Whether sealed manifests are rewritten is not ruled, so no case judges it'
  })
  unresolved.push({
    id: 'emdash:release-pins',
    reason:
      'EmDash templates have no per-release manifest with pins in this repo; only their qa.contract.json is inventoried'
  })

  sources.sort((a, b) => a.path.localeCompare(b.path))
  const revision = `tree:${sha256Of(JSON.stringify(sources)).slice(0, 16)}`
  return { releases, emdash, functions, legacy, sources, unresolved, revision }
}
