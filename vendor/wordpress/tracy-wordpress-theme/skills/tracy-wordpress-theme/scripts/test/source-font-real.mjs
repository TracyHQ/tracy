#!/usr/bin/env node
// Real-run harness for the Phase 2 source-font check: the production entry points against ONE release asset set
// (one release, one version, one expected outcome per invocation) and, for the browser mode, a running source stand.
// Nothing is mocked and nothing is skipped: a prerequisite that is unreachable (gh, a release, the stand) fails the run.
//
//   --mode static   download <slug>-<webroot|database|quickstart>-<version>.* of the release into a temp dir under
//                   --artifact-root, verify them, run quickstart-inventory.mjs, then `source-font.mjs check`, and compare
//                   the exit code and the findings with --expect.
//   --mode browser  the same download (its static report names the styles and routes), then source-font-browser.mjs
//                   against --site; the stand is only read.
//
// --version is a numeric version (1.0.3) or `current-pin`: the version the release's manifest.json pins now, resolved to
// its number, logged, and then fetched through the same explicitly versioned path. Assets are never verified against the
// current manifest or tracy_setting.json: a SHA256SUMS asset of the release (every version it lists), else the digest GitHub
// recorded for that asset, else the SHA-256 measured here is recorded in the log.
//
// Commands and their output are appended to <artifact-root>/source-font-real-<mode>-<time>.log; the temp dir
// (downloads, inventory) is removed in a finally block.
//
// Usage: node scripts/test/source-font-real.mjs --mode static|browser --gh <path> --repo <owner/name>
//          --release <tag> --version <x.y.z|current-pin> --expect pass|fail [--site <origin>] [--widths 1440,390]
//          --artifact-root <dir>
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.resolve(HERE, '..', '..')
const INVENTORY = path.join(SKILL, 'scripts/ingest/quickstart-inventory.mjs')
const CHECK = path.join(SKILL, 'scripts/ingest/source-font.mjs')
const BROWSER = path.join(SKILL, 'scripts/ingest/source-font-browser.mjs')

// What a release version must show when it is expected to fail: the finding it must name (SOURCE, file and key).
// A failing version without an entry here still has to produce findings that name the SOURCE and a file.
export const DEFECTS = {
  'quickstart/ja-essence/j6@1.0.3': { code: 'font-family-unset', role: 'body', file: 'templates/ja_essence/etc/site/default.json', jsonKey: 'body_font_family', says: /site profile default/ },
  'quickstart/ja-voyara/j6@1.0.5': { code: 'font-family-unset', role: 'body', file: 'templates/ja_voyara/local/etc/site/default.json', jsonKey: 'body_font_family', says: /replaces templates\/ja_voyara\/etc\/site\/default\.json wholesale/ },
  'quickstart/ja-spa/j6@1.0.2': { code: 'family-never-loaded', role: 'body', styleId: 13, family: 'Muli', says: /logo-light/ }
}

const VERSION = /^\d+(?:\.\d+){1,3}$/
const idOf = (tag) => tag.replace(/^quickstart\//, '').replace(/\//g, '-')

export function parse(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]
    const v = argv[i + 1]
    if (!k?.startsWith('--') || v === undefined) throw new Error(`bad argument ${k ?? ''}`)
    if (Object.hasOwn(o, k.slice(2))) throw new Error(`${k} given twice: one release, one version, one outcome per run`)
    o[k.slice(2)] = v
  }
  for (const need of ['mode', 'gh', 'repo', 'release', 'version', 'expect', 'artifact-root']) if (!o[need]) throw new Error(`--${need} is required`)
  if (!['static', 'browser'].includes(o.mode)) throw new Error('--mode is static or browser')
  if (!['pass', 'fail'].includes(o.expect)) throw new Error('--expect is pass or fail')
  if (o.version !== 'current-pin' && !VERSION.test(o.version)) throw new Error('--version is a number like 1.0.3, or current-pin')
  if (o.mode === 'browser' && !o.site) throw new Error('--mode browser needs --site')
  return o
}

/** The release assets of `version` for `id`: <id>-<webroot|database|quickstart>-<version>.<tar.gz|sql.gz|zip>, exact names only. */
export function selectAssets(assets, id, version) {
  const esc = version.replace(/[.]/g, '\\.')
  const re = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(webroot|database|quickstart)-${esc}\\.(tar\\.gz|sql\\.gz|zip)$`)
  const picked = (assets ?? []).filter((a) => re.test(a.name))
  if (!picked.some((a) => a.name.includes('-webroot-') || a.name.includes('-quickstart-'))) throw new Error(`${id}: the release has no ${id}-webroot-${version}.tar.gz or ${id}-quickstart-${version}.zip asset`)
  return picked
}

/** The SHA-256 a version's asset must have, from a source other than the current manifest: SHA256SUMS text, else GitHub's digest. */
export function expectedHash(name, sums, asset) {
  if (sums) {
    const line = sums.split('\n').map((l) => /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(l)).filter((m) => m && path.basename(m[2]) === name)
    const hashes = [...new Set(line.map((m) => m[1].toLowerCase()))]
    if (hashes.length > 1) throw new Error(`${name}: SHA256SUMS lists it with different hashes`)
    if (hashes.length) return { sha256: hashes[0], from: 'SHA256SUMS' }
  }
  if (typeof asset?.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)) return { sha256: asset.digest.slice(7).toLowerCase(), from: 'the digest GitHub recorded for the asset' }
  return null
}

export const sha256Stream = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })

/** A finding list against what a failing version must show → null or the reason it does not. */
export function judgeFailure(findings, want) {
  if (!findings.length) return 'the check failed but reported no finding'
  const bad = findings.find((f) => !/SOURCE/.test(f.message ?? ''))
  if (bad) return `a finding does not name the SOURCE: ${bad.key}`
  if (!want) return findings.every((f) => f.file || f.route) ? null : 'a finding names no file or page'
  const hit = findings.find(
    (f) =>
      f.code === want.code &&
      (!want.role || f.role === want.role) &&
      (!want.file || f.file === want.file) &&
      (!want.jsonKey || f.jsonKey === want.jsonKey) &&
      (!want.styleId || String(f.style?.id) === String(want.styleId)) &&
      (!want.family || f.family === want.family) &&
      (!want.says || want.says.test(f.message))
  )
  if (!hit) return `no ${want.code} finding as expected (${JSON.stringify({ ...want, says: String(want.says ?? '') })}); got ${findings.map((f) => `${f.code}@${f.file ?? f.route}:${f.jsonKey ?? ''}`).join(', ')}`
  if (!hit.file || !hit.jsonKey) return `the finding ${hit.key} names no file/key`
  return null
}

async function main() {
  const o = parse(process.argv.slice(2))
  const root = path.resolve(o['artifact-root'])
  mkdirSync(root, { recursive: true })
  const log = path.join(root, `source-font-real-${o.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
  const say = (line) => {
    console.log(line)
    appendFileSync(log, line + '\n')
  }
  const failures = []
  const fail = (m) => {
    failures.push(m)
    say(`FAIL ${m}`)
  }
  const run = (cmd, args, { allow = [0] } = {}) => {
    say(`$ ${[cmd, ...args].join(' ')}`)
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20, cwd: SKILL })
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd()
    if (text) say(text.split('\n').map((l) => `  ${l.slice(0, 400)}`).join('\n'))
    say(`  → exit ${r.status}`)
    if (r.error) throw new Error(`${cmd}: ${r.error.message}`)
    if (!allow.includes(r.status)) throw new Error(`${cmd} exited ${r.status}`)
    return r
  }
  const work = mkdtempSync(path.join(root, 'sf-real-'))
  say(`# source-font real run (${o.mode}) ${o.release} ${o.version} expect ${o.expect} — work dir ${work} (removed at the end)`)
  try {
    const id = idOf(o.release)
    const dir = path.join(work, 'in', id)
    mkdirSync(dir, { recursive: true })
    let version = o.version
    if (version === 'current-pin') {
      run(o.gh, ['release', 'download', o.release, '-R', o.repo, '-p', 'manifest.json', '-D', dir])
      version = String(JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version ?? '')
      rmSync(path.join(dir, 'manifest.json'))
      if (!VERSION.test(version)) throw new Error(`${o.release}: the manifest pins no numeric version`)
      say(`current pin of ${o.release} resolves to ${version}`)
    }
    const view = JSON.parse(run(o.gh, ['release', 'view', o.release, '-R', o.repo, '--json', 'assets']).stdout)
    const assets = selectAssets(view.assets, id, version)
    let sums = null
    if (view.assets.some((a) => a.name === 'SHA256SUMS')) {
      run(o.gh, ['release', 'download', o.release, '-R', o.repo, '-p', 'SHA256SUMS', '-D', work])
      sums = readFileSync(path.join(work, 'SHA256SUMS'), 'utf8')
    }
    for (const a of assets) {
      run(o.gh, ['release', 'download', o.release, '-R', o.repo, '-p', a.name, '-D', dir])
      const measured = await sha256Stream(path.join(dir, a.name))
      const want = expectedHash(a.name, sums, a)
      if (want && want.sha256 !== measured) throw new Error(`${a.name}: SHA-256 ${measured} differs from ${want.from} (${want.sha256})`)
      say(`  ${a.name} ${statSync(path.join(dir, a.name)).size} bytes sha256 ${measured} (${want ? `matches ${want.from}` : 'no published hash for this asset: the measured value is recorded'})`)
    }
    const out = path.join(work, 'out')
    run(process.execPath, [INVENTORY, '--input', path.join(work, 'in'), '--out', out])
    const inventory = path.join(out, 'inventory.json')
    const tag = `${o.release}@${version}`
    if (o.mode === 'static') {
      const result = path.join(root, `source-font-real-static-${id}-${version}.json`)
      const r = run(process.execPath, [CHECK, 'check', '--inventory', inventory, '--quickstart', id, '--out', result], { allow: [0, 1] })
      const report = JSON.parse(readFileSync(result, 'utf8')).results[0]
      const passed = r.status === 0
      if (passed !== (o.expect === 'pass')) fail(`${tag}: check exit ${r.status} (${passed ? 'passed' : 'failed'}), expected ${o.expect}`)
      else if (!passed) {
        const why = judgeFailure(report.findings ?? [], DEFECTS[tag])
        if (why) fail(`${tag}: ${why}`)
        else say(`OK ${tag}: fails as expected — ${(report.findings ?? []).map((f) => f.key).slice(0, 3).join(', ')}`)
      } else {
        const sf = JSON.parse(readFileSync(inventory, 'utf8')).quickstarts.find((q) => q.id === id)?.sites?.[0]?.sourceFonts
        if (!sf?.complete) fail(`${tag}: the check passed on incomplete static evidence`)
        else say(`OK ${tag}: passes — ${sf.usedStyles.length} used style(s), static evidence complete`)
      }
    } else {
      const result = path.join(root, `source-font-real-browser-${id}-${version}.json`)
      const widths = o.widths ? ['--widths', o.widths] : []
      const r = run(process.execPath, [BROWSER, '--site', o.site, '--static', inventory, '--quickstart', id, '--out', result, ...widths], { allow: [0, 1] })
      if ((r.status === 0) !== (o.expect === 'pass')) fail(`${tag}: the browser check exit ${r.status}, expected ${o.expect} on ${o.site}`)
      const m = JSON.parse(readFileSync(result, 'utf8'))
      const have = [...new Set(m.pages.map((p) => p.width))].sort((a, b) => a - b)
      const need = (o.widths ?? '1440,390').split(',').map(Number).sort((a, b) => a - b)
      if (JSON.stringify(have) !== JSON.stringify(need)) fail(`${tag}: measured widths ${have} not ${need}`)
      if (!m.pages.some((p) => p.kind === 'nested') || !m.pages.some((p) => p.kind === 'home')) fail(`${tag}: home and a nested route were not both measured`)
      if (m.pages.some((p) => !(p.roles?.body?.chars > 0))) fail(`${tag}: a page has no body text reading`)
      if (!failures.length) say(`OK ${tag}: ${m.pages.length} page reading(s) from ${o.site}, none a finding`)
    }
  } catch (e) {
    fail(e.message)
  } finally {
    rmSync(work, { recursive: true, force: true })
    say(`# removed ${work}`)
  }
  say(failures.length ? `RESULT FAIL (${failures.length})` : 'RESULT PASS')
  process.exit(failures.length ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(2)
  })
}
