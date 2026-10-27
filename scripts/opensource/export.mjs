#!/usr/bin/env node
// Build the public tree of this repo from ONE immutable commit, never from a working tree.
//   node scripts/opensource/export.mjs --sha <commit sha> --out <new or empty dir> [--manifest <file>]
//     [--repo <git dir>] [--scanner <scan.mjs>] [--skip-gitleaks]
// Rules come from the commit itself (scripts/opensource/public-tree.json), so a rerun on the same SHA
// gives the same tree. The manifest (default <out>.manifest.json) sits OUTSIDE the tree it describes.
// Exit codes: 0 exported and scanned clean, 1 the scanner reported findings (tree kept for
// inspection), 2 refused, failed, or the tree could not be fully scanned (no scanner, no gitleaks,
// scanner error). --skip-gitleaks is the only way to pass without gitleaks, and the manifest says so.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RULES_FILE = 'scripts/opensource/public-tree.json'
export const OVERLAY_DIR = 'scripts/opensource/overlay/'
export const WORKFLOWS_DIR = 'scripts/opensource/workflows/'
export const SCANNER = 'scripts/opensource/scan.mjs'
const DEFAULT_DROP = [OVERLAY_DIR, WORKFLOWS_DIR]
const MANIFEST_SCHEMA = 1

/** A rule is a directory (`tasks/`), an exact path (a file or a directory), or a glob (`*`, `**`). */
export function matchesRule(file, rule) {
  if (rule.includes('*')) {
    const re = rule
      .split('**')
      .map((part) =>
        part
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*')
      )
      .join('.*')
    // A glob ending in `/` names directories; any other glob matches a path or everything under it.
    return new RegExp(`^${re}${rule.endsWith('/') ? '' : '(/.*)?$'}`).test(file)
  }
  if (rule.endsWith('/')) return file.startsWith(rule)
  return file === rule || file.startsWith(`${rule}/`)
}

const git = (repo, args, opts = {}) =>
  execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1024 * 1024 * 1024, ...opts })

/** Only a commit id is accepted: a branch or tag can move between two runs. */
export function resolveSha(repo, sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha ?? ''))
    throw new Error(`--sha must be a commit id (7–40 hex), got: ${sha}`)
  const full = git(repo, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])
    .toString()
    .trim()
  if (!full.startsWith(sha.toLowerCase()))
    throw new Error(`${sha} resolved to ${full}: a ref, not a commit id`)
  return full
}

function listTree(repo, sha) {
  const out = git(repo, ['ls-tree', '-r', '-l', '-z', '--full-tree', sha]).toString()
  return out
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t')
      const [mode, type, object, size] = meta.trim().split(/\s+/)
      return { mode, type, object, size: Number(size) || 0, path: file }
    })
}

/**
 * Write blobs straight from the object store. Not `git archive`: it honours `export-ignore` and
 * `export-subst` in `.gitattributes` (vendored subtrees carry both), so the tree would silently differ
 * from the commit.
 * @param {string} repo
 * @param {{ object: string, size: number, dest: string, mode: string }[]} items
 */
function writeBlobs(repo, items) {
  const LIMIT = 256 * 1024 * 1024
  for (let i = 0; i < items.length; ) {
    const batch = []
    let bytes = 0
    while (i < items.length && (batch.length === 0 || bytes + items[i].size < LIMIT)) {
      bytes += items[i].size
      batch.push(items[i++])
    }
    const buf = execFileSync('git', ['-C', repo, 'cat-file', '--batch'], {
      input: `${batch.map((b) => b.object).join('\n')}\n`,
      maxBuffer: bytes + batch.length * 128 + 1024
    })
    let at = 0
    for (const b of batch) {
      const nl = buf.indexOf(10, at)
      const [object, type, size] = buf.subarray(at, nl).toString().split(' ')
      if (object !== b.object || type !== 'blob')
        throw new Error(`cat-file answered ${object} ${type} for ${b.object}`)
      const body = buf.subarray(nl + 1, nl + 1 + Number(size))
      at = nl + 1 + Number(size) + 1
      mkdirSync(path.dirname(b.dest), { recursive: true })
      if (b.mode === '120000') symlinkSync(body.toString(), b.dest)
      else writeFileSync(b.dest, body, { mode: b.mode === '100755' ? 0o755 : 0o644 })
    }
  }
}

function submodules(repo, sha, gitlinks) {
  const urls = new Map()
  if (gitlinks.length) {
    const raw = spawnSync(
      'git',
      ['-C', repo, 'config', '--blob', `${sha}:.gitmodules`, '--get-regexp', '^submodule\\.'],
      {
        encoding: 'utf8'
      }
    ).stdout
    const byName = new Map()
    for (const line of raw.split('\n').filter(Boolean)) {
      const m = /^submodule\.(.+)\.(path|url) (.*)$/.exec(line)
      if (m) byName.set(m[1], { ...byName.get(m[1]), [m[2]]: m[3] })
    }
    for (const { path: p, url } of byName.values()) urls.set(p, url ?? null)
  }
  return gitlinks.map((e) => ({ path: e.path, sha: e.object, url: urls.get(e.path) ?? null }))
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/**
 * Plan the public tree: which source file lands at which public path. Pure — no file system.
 * @param {{ path: string, mode: string }[]} files blobs of the commit
 * @param {{ exclude?: string[], dropAfterExport?: string[] }} rules
 */
export function planTree(files, rules) {
  const exclude = rules.exclude ?? []
  const drop = rules.dropAfterExport ?? DEFAULT_DROP
  const isExcluded = (p) => exclude.some((r) => matchesRule(p, r))
  /** @type {Map<string, { from: string, mode: string }>} */
  const plan = new Map()
  const excluded = []
  for (const f of files) {
    if (isExcluded(f.path)) excluded.push(f.path)
    else plan.set(f.path, { from: f.path, mode: f.mode })
  }
  const overlay = []
  for (const f of files.filter((x) => x.path.startsWith(OVERLAY_DIR))) {
    const target = f.path.slice(OVERLAY_DIR.length)
    if (isExcluded(target)) throw new Error(`overlay ${f.path} targets an excluded path: ${target}`)
    plan.set(target, { from: f.path, mode: f.mode })
    overlay.push(target)
  }
  const publicWorkflows = files.filter((x) => x.path.startsWith(WORKFLOWS_DIR))
  if (publicWorkflows.length) {
    // Deleting the entry being visited is safe in a Map iteration.
    for (const p of plan.keys()) if (p.startsWith('.github/workflows/')) plan.delete(p)
    for (const f of publicWorkflows)
      plan.set(`.github/workflows/${f.path.slice(WORKFLOWS_DIR.length)}`, { from: f.path, mode: f.mode })
  }
  const dropped = []
  for (const p of plan.keys())
    if (drop.some((r) => matchesRule(p, r))) {
      plan.delete(p)
      dropped.push(p)
    }
  return {
    plan,
    excluded,
    overlay: overlay.sort(),
    workflows: publicWorkflows.length
      ? publicWorkflows.map((f) => f.path.slice(WORKFLOWS_DIR.length)).sort()
      : null,
    dropped
  }
}

function emptyOrAbsent(dir) {
  return !existsSync(dir) || readdirSync(dir).length === 0
}

/**
 * @param {{ repo: string, sha: string, out: string, manifest?: string, scanner?: string, skipGitleaks?: boolean, log?: (s: string) => void }} o
 */
export function exportTree(o) {
  const log = o.log ?? ((s) => process.stderr.write(`${s}\n`))
  const repo = path.resolve(o.repo)
  const out = path.resolve(o.out)
  const manifestFile = path.resolve(o.manifest ?? `${out}.manifest.json`)
  if (!emptyOrAbsent(out)) throw new Error(`output dir is not empty: ${out}`)
  if (existsSync(manifestFile)) throw new Error(`manifest already exists: ${manifestFile}`)
  if (manifestFile.startsWith(`${out}${path.sep}`))
    throw new Error('the manifest must sit outside the exported tree')
  const sha = resolveSha(repo, o.sha)

  const rulesBuf = git(repo, ['show', `${sha}:${RULES_FILE}`])
  const rules = JSON.parse(rulesBuf.toString())
  const entries = listTree(repo, sha)
  const blobs = entries.filter((e) => e.type === 'blob')
  const subs = submodules(
    repo,
    sha,
    entries.filter((e) => e.type === 'commit')
  )
  const { plan, excluded, overlay, workflows, dropped } = planTree(blobs, rules)

  const byPath = new Map(blobs.map((e) => [e.path, e]))
  const ordered = [...plan].sort(([a], [b]) => (a < b ? -1 : 1))
  // The scanner runs from the commit's own `scripts/`, which may be dropped from the public tree.
  const staging = mkdtempSync(path.join(tmpdir(), 'tracy-export-'))
  let wroteOut = false
  try {
    wroteOut = true
    mkdirSync(out, { recursive: true })
    writeBlobs(
      repo,
      ordered.map(([target, { from, mode }]) => ({ ...byPath.get(from), mode, dest: path.join(out, target) }))
    )
    writeBlobs(
      repo,
      blobs
        .filter((e) => e.path.startsWith('scripts/'))
        .map((e) => ({ ...e, dest: path.join(staging, e.path) }))
    )
    const files = []
    const warnings = []
    for (const [target, { from, mode }] of ordered) {
      const dest = path.join(out, target)
      if (mode === '120000') {
        const link = readlinkSync(dest)
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(target), link))
        const inside = !resolved.startsWith('../') && !path.posix.isAbsolute(link)
        const present = plan.has(resolved) || [...plan.keys()].some((p) => p.startsWith(`${resolved}/`))
        if (!inside || !present)
          warnings.push(
            `symlink ${target} -> ${link} points ${inside ? 'at nothing in the public tree' : 'outside the tree'}`
          )
        files.push({ path: target, type: 'symlink', target: link, sha256: sha256(Buffer.from(link)) })
      } else {
        const buf = readFileSync(dest)
        files.push({
          path: target,
          type: 'file',
          mode,
          size: buf.length,
          sha256: sha256(buf),
          ...(from !== target ? { from } : {})
        })
      }
    }
    for (const w of warnings) log(`warning: ${w}`)

    const scannerPath = o.scanner ? path.resolve(o.scanner) : path.join(staging, SCANNER)
    let scan
    // The staged scanner has no gitleaks binary beside it; use the one installed in this checkout.
    const gitleaks = process.env.GITLEAKS_BIN ?? fileURLToPath(new URL('./.bin/gitleaks', import.meta.url))
    if (!existsSync(scannerPath)) {
      log(`error: no ${SCANNER} at ${sha.slice(0, 10)} — the tree is UNSCANNED and not fit to publish`)
      scan = { status: 'unscanned' }
    } else if (!o.skipGitleaks && !existsSync(gitleaks)) {
      const reason = `gitleaks missing at ${gitleaks}: run node scripts/opensource/install-gitleaks.mjs, or pass --skip-gitleaks`
      log(`error: ${reason}`)
      scan = { status: 'failed', reason }
    } else {
      // The scanner reads a git ref, so commit the exported tree into a throwaway repo and scan that.
      const scanRepo = path.join(staging, 'scan-repo')
      const reportFile = path.join(staging, 'scan-report.json')
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: 'export',
        GIT_AUTHOR_EMAIL: 'export@invalid',
        GIT_COMMITTER_NAME: 'export',
        GIT_COMMITTER_EMAIL: 'export@invalid'
      }
      const g = (args) =>
        execFileSync('git', ['--git-dir', path.join(scanRepo, '.git'), '--work-tree', out, ...args], {
          env: gitEnv,
          stdio: ['ignore', 'ignore', 'pipe'],
          maxBuffer: 256 * 1024 * 1024
        })
      execFileSync('git', ['init', '-q', scanRepo])
      g(['add', '-A', '-f', '.'])
      g(['commit', '-q', '--no-verify', '-m', 'export scan'])
      const s = spawnSync(
        process.execPath,
        [
          scannerPath,
          '--repo',
          scanRepo,
          '--ref',
          'HEAD',
          '--json',
          reportFile,
          ...(o.skipGitleaks ? ['--no-gitleaks'] : ['--gitleaks', gitleaks])
        ],
        {
          cwd: o.scanner ? path.dirname(scannerPath) : staging,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024
        }
      )
      let report = null
      try {
        report = JSON.parse(readFileSync(reportFile, 'utf8'))
      } catch {
        report = { unparsedStdout: s.stdout.slice(0, 4000) }
      }
      // The scanner exits 2 when gitleaks did not run; with --skip-gitleaks that alone is accepted.
      const skippedOnly =
        o.skipGitleaks && s.status === 2 && report?.gitleaks?.skipped === true && report.blocking === 0
      const status = s.status === 0 || skippedOnly ? 'clean' : s.status === 1 ? 'findings' : 'failed'
      if (status === 'failed') log(`error: the scanner exited ${s.status}: ${s.stderr.trim().slice(-500)}`)
      scan = {
        status,
        exitCode: s.status,
        scanner: o.scanner ? scannerPath : SCANNER,
        ...(o.skipGitleaks ? { gitleaksSkipped: true } : {}),
        report,
        ...(s.status === 0 ? {} : { stderr: s.stderr.slice(-4000) })
      }
    }

    const manifest = {
      schema: MANIFEST_SCHEMA,
      source: {
        sha,
        tree: git(repo, ['rev-parse', `${sha}^{tree}`])
          .toString()
          .trim()
      },
      rules: { file: RULES_FILE, sha256: sha256(rulesBuf), version: rules.version ?? null },
      // sha256 over `<sha256>  <path>\n` lines in path order — `sha256sum` output, so anyone can recompute it.
      treeSha256: sha256(files.map((f) => `${f.sha256}  ${f.path}\n`).join('')),
      counts: {
        files: files.length,
        excluded: excluded.length,
        dropped: dropped.length,
        overlay: overlay.length
      },
      submodules: subs,
      overlay,
      workflows: workflows ? { replaced: true, files: workflows } : { replaced: false },
      warnings,
      scan,
      files
    }
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
    wroteOut = false
    return manifest
  } catch (err) {
    // `out` was empty or absent when we started, so a failed run leaves nothing half-written behind.
    if (wroteOut) rmSync(out, { recursive: true, force: true })
    throw err
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function main(argv) {
  const opt = (name) => {
    const i = argv.indexOf(name)
    return i < 0 ? undefined : argv[i + 1]
  }
  const sha = opt('--sha')
  const out = opt('--out')
  if (!sha || !out) {
    process.stderr.write(
      'usage: export.mjs --sha <commit> --out <dir> [--manifest <file>] [--repo <dir>] [--scanner <file>] [--skip-gitleaks]\n'
    )
    return 2
  }
  const repo = opt('--repo') ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  let manifest
  try {
    manifest = exportTree({
      repo,
      sha,
      out,
      manifest: opt('--manifest'),
      scanner: opt('--scanner'),
      skipGitleaks: argv.includes('--skip-gitleaks')
    })
  } catch (err) {
    process.stderr.write(`export: ${err.message}\n`)
    return 2
  }
  const { source, counts, scan, treeSha256 } = manifest
  process.stderr.write(
    `exported ${source.sha} → ${path.resolve(out)}: ${counts.files} files, ${counts.excluded} excluded, ` +
      `${counts.overlay} overlaid, tree sha256 ${treeSha256}, scan ${scan.status}` +
      `${scan.gitleaksSkipped ? ' (without gitleaks: --skip-gitleaks)' : ''}\n`
  )
  if (scan.status === 'clean') return 0
  if (scan.status === 'findings') return 1
  process.stderr.write(`export: the tree is not fully scanned (${scan.status}); not fit to publish\n`)
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)))
