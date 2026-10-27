#!/usr/bin/env node
// Phase 8 as one run: http-parity → review/scan → shoot, fast gate first, full matrix after.
//
//   node scripts/verify.mjs --source <url> --target <url> --spec <spec dir> --config <review.config.json>
//        --evidence <dir> [--pairs <pairs.json>] [--accept <json>] [--theme <dir>]
//        [--fast|--full|--both] [--dark-hook attr:data-theme=dark] [--no-cache] [--runs leaf]
//        [--scan-routes <file>] [--timeout <minutes per phase>] [--concurrency 4]
//
// The three tools each answer one question (content parity, dark-mode/editability review,
// screenshots) and each used to be driven by hand, one after another, over the full matrix —
// 17 routes × 2 viewports × 2 themes plus 26 scanner processes — before anyone learned that the
// header was broken on every page. `--fast` runs the same tools over the smallest route set that
// touches every template family (home, the first page of every `view` in page-map.json, the
// single post, the 404) at 1440 only; a red fast run prints the delta and stops, a green one is
// followed by `--full`, the matrix exactly as before. `--both` (default) is that sequence.
//
// plan() is pure and tested against the real wp-tracy-business page-map. Every phase is a child
// process with a timeout, its output tee'd to <evidence>/verify.log, its verdict read from the
// JSON the tool wrote; <evidence>/verify.json is rewritten after every phase, so a run that dies
// still says how far it got. http-parity and scan share <evidence>/cache (lib/route-cache) unless
// --no-cache — the release run. Screenshots are never cached.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { cli, parseArgs, UsageError } from './quickstart/lib.mjs'
import { DEFAULT_CONCURRENCY } from './lib/browser.mjs'

export const PHASES = ['parity', 'scan', 'shoot']
const FAST_VIEWPORTS = ['1440x900']
const FULL_VIEWPORTS = ['1440x900', '390x844']
const here = path.dirname(new URL(import.meta.url).pathname)
const tool = (rel) => path.join(here, rel)

const SPEC = {
  '--source': { placeholder: 'url', required: true, help: 'the source site (design export / Joomla)' },
  '--target': { placeholder: 'url', required: true, help: 'the WordPress port' },
  '--spec': { placeholder: 'dir', required: true, help: 'spec dir: page-map.json, reference.json, reference/' },
  '--config': { placeholder: 'file', required: true, help: 'review.config.json for the scanners' },
  '--evidence': { placeholder: 'dir', required: true, help: 'where reports, shots, cache and logs go' },
  '--pairs': { placeholder: 'file', help: 'source→target route pairs (http-parity --pairs); page-map paths when absent' },
  '--accept': { placeholder: 'file', help: 'http-parity --accept' },
  '--theme': { placeholder: 'dir', help: 'theme dir — adds the editability scanner and keys the cache on the CSS' },
  '--fast': { value: false, help: 'representative routes at 1440, light+dark; stop on red' },
  '--full': { value: false, help: 'every route, both viewports, both themes' },
  '--both': { value: false, help: 'fast, then full when fast is green (default)' },
  '--dark-hook': { placeholder: 'hook', default: 'attr:data-theme=dark', help: 'as scripts/shoot.mjs' },
  '--no-cache': { value: false, help: 'measure everything (release run)' },
  '--runs': { placeholder: 'mode', default: 'leaf', help: 'http-parity --runs' },
  '--scan-routes': { placeholder: 'file', help: 'restrict the scanners (full mode) to these target routes' },
  '--timeout': { placeholder: 'minutes', default: '20', help: 'per phase' },
  '--concurrency': { placeholder: 'N', default: String(DEFAULT_CONCURRENCY) }
}

// --- plan ---------------------------------------------------------------------------------------
// From the page-map (and the pairs, when the source's routes are files the port serves elsewhere)
// name the routes each phase runs. Only the default locale is representative: a translation is
// the same template with other words.
export function plan({ pageMap, pairs = null, mode, scanRoutes = null }) {
  const rules = pairs ? (pairs.rules ?? pairs.pairs ?? pairs) : []
  const byFrom = new Map(rules.map((r) => [r.from, r]))
  const locale = pageMap.defaultLocale ?? null
  const pages = (pageMap.pages ?? []).filter((p) => !locale || !p.locale || p.locale === locale)
  // one entry per page: source route, target route, expected status, view
  const entries = []
  for (const p of pages) {
    const from = pairs ? `/${p.file ?? p.source?.file ?? ''}` : p.path
    const rule = byFrom.get(from)
    if (pairs && !rule) continue
    entries.push({ from, to: rule?.to ?? p.path, status: rule?.status ? Number(rule.status) : undefined, view: p.view ?? null })
  }
  const views = {}
  for (const e of entries) views[e.to] ??= e.view
  let parity
  if (mode === 'fast') {
    const chosen = []
    const seenTo = new Set()
    const seenView = new Set()
    const pick = (e) => {
      if (seenTo.has(e.to)) return
      seenTo.add(e.to)
      seenView.add(e.view)
      chosen.push(e)
    }
    const home = entries.find((e) => e.to === '/' || e.view === 'front-page')
    if (home) pick(home)
    for (const e of entries) if (!seenView.has(e.view)) pick(e)
    for (const e of entries) if (/single/.test(e.view ?? '') || /404/.test(e.view ?? '') || e.status === 404) pick(e)
    parity = chosen
  } else {
    // full: every pair in the pairs file's order (the source route list); page-map order without pairs
    parity = pairs
      ? rules.filter((r) => r.from && r.to).map((r) => ({ from: r.from, to: r.to, status: r.status ? Number(r.status) : undefined, view: entries.find((e) => e.from === r.from)?.view ?? null }))
      : entries
  }
  const target = parity.map((r) => r.to)
  const scan = scanRoutes ?? parity.filter((r) => (r.status ?? 200) === 200).map((r) => r.to)
  const expectStatus = Object.fromEntries(parity.filter((r) => r.status).map((r) => [r.to, r.status]))
  return {
    mode,
    parity: parity.map(({ from, to, status }) => (status ? { from, to, status } : { from, to })),
    target,
    scan,
    views: Object.fromEntries(target.map((t) => [t, views[t] ?? null])),
    expectStatus,
    viewports: mode === 'fast' ? FAST_VIEWPORTS : FULL_VIEWPORTS
  }
}

// shoot.mjs exits 1 for any non-200 shot; here a route whose contract IS 404 is fine at 404. A route
// whose contract is a redirect (an account view sending a visitor to login) cannot be shot as a
// redirect — the browser follows it — so it is fine when the shot landed on another address that
// answered 200; served at its own address, or landing on an error, it is not.
const pathOf = (u) => {
  try {
    return new URL(u, 'http://x').pathname.replace(/\/+$/, '')
  } catch {
    return String(u ?? '')
  }
}
export function judgeShoot(index, expectStatus = {}) {
  const fine = (r) => {
    const want = expectStatus[r.route] ?? 200
    if (want >= 300 && want < 400) return r.status === 200 && pathOf(r.url) !== pathOf(r.route)
    return r.status === want
  }
  const bad = index.filter((r) => !fine(r) || !r.file)
  return { ok: bad.length === 0, bad }
}

// --- phases -------------------------------------------------------------------------------------
function phaseArgv(phase, mode, p, o, dir) {
  const cache = o.noCache ? ['--no-cache'] : ['--cache', path.join(o.evidence, 'cache')]
  const conc = ['--concurrency', String(o.concurrency ?? DEFAULT_CONCURRENCY)]
  if (phase === 'parity')
    return [
      tool('http-parity.mjs'),
      '--source', o.source, '--target', o.target,
      '--routes', path.join(dir, 'source-routes.json'),
      '--pairs', path.join(dir, 'pairs.json'),
      '--runs', o.runs ?? 'leaf',
      '--out', path.join(dir, 'http-parity.json'),
      ...(o.spec ? ['--source-snapshot', o.spec] : []),
      ...(o.accept ? ['--accept', o.accept] : []),
      ...cache, ...conc
    ]
  if (phase === 'scan')
    return [
      tool('review/scan.mjs'), o.target,
      '--routes', path.join(dir, 'scan-routes.json'),
      '--config', o.config,
      '--tools', o.theme ? 'leak,contrast,editability' : 'leak,contrast',
      ...(o.theme ? ['--theme', o.theme] : []),
      '--out', path.join(dir, 'review', 'scanners.json'),
      ...cache, ...conc
    ]
  if (phase === 'shoot')
    return [
      tool('shoot.mjs'), o.target,
      '--routes', path.join(dir, 'target-routes.json'),
      '--out', path.join(dir, 'shots'),
      '--dark-hook', o.darkHook,
      '--viewports', p.viewports.join(','),
      '--themes', 'light,dark',
      ...conc
    ]
  throw new Error(`unknown phase ${phase}`)
}

// Read the verdict the tool wrote. Each phase answers { exit, summary, failing }.
function readVerdict(phase, p, dir, exit) {
  const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null)
  if (phase === 'parity') {
    const j = read(path.join(dir, 'http-parity.json'))
    if (!j) return { exit: exit || 1, summary: null, failing: [{ error: 'no http-parity.json written' }] }
    return {
      exit,
      summary: j.summary,
      failing: j.routes
        .filter((r) => !r.ok)
        .map((r) => ({ route: r.route, targetPath: r.targetPath, sourceStatus: r.sourceStatus, targetStatus: r.targetStatus, missing: r.missing.slice(0, 5), missingImages: r.missingImages.slice(0, 5), redirect: r.redirect, notes: r.notes }))
    }
  }
  if (phase === 'scan') {
    const j = read(path.join(dir, 'review', 'scanners.json'))
    if (!j) return { exit: exit || 1, summary: null, failing: [{ error: 'no scanners.json written' }] }
    return {
      exit,
      summary: j.summary,
      failing: j.results.filter((r) => r.status === 'fail').map((r) => ({ tool: r.tool, route: r.route, error: r.error ?? null, examined: r.examined, findings: (r.findings ?? r.baked ?? []).slice(0, 5) }))
    }
  }
  const index = read(path.join(dir, 'shots', 'index.json'))
  if (!index) return { exit: exit || 1, summary: null, failing: [{ error: 'no shots/index.json written' }] }
  const j = judgeShoot(index, p.expectStatus)
  return { exit: j.ok ? 0 : 1, summary: { shots: index.length, bad: j.bad.length }, failing: j.bad.map((b) => ({ route: b.route, width: b.width, theme: b.theme, status: b.status, error: b.errors?.[0] ?? null })) }
}

// Spawn one tool, tee its output, kill it at the deadline; then read what it wrote.
function spawnRunner({ log, timeoutMs }) {
  return (phase, mode, argv, p, dir) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)
      child.stdout.on('data', (d) => log(String(d).replace(/\n$/, '')))
      child.stderr.on('data', (d) => log(String(d).replace(/\n$/, '')))
      child.on('close', (code) => {
        clearTimeout(timer)
        const exit = timedOut ? 124 : (code ?? 1)
        const v = readVerdict(phase, p, dir, exit)
        if (timedOut) v.failing.unshift({ error: `${phase} timed out after ${timeoutMs / 60000} min` })
        resolve(v)
      })
    })
}

const printDelta = (log, mode, phase, v) => {
  for (const f of v.failing) {
    if (f.error && !f.route) log(`  ${mode} ${phase}: ${f.error}`)
    else if (phase === 'parity')
      log(`  ${mode} parity FAIL ${f.route} → ${f.targetPath} ${f.sourceStatus}/${f.targetStatus}${f.missing?.length ? ` missing: ${f.missing.map((m) => JSON.stringify(m.slice(0, 60))).join(', ')}` : ''}${f.redirect && !f.redirect.ok ? ` redirect ${f.redirect.status} → ${f.redirect.location}` : ''}`)
    else if (phase === 'scan') log(`  ${mode} scan FAIL ${f.tool} ${f.route}${f.error ? `: ${f.error}` : ` (${f.examined} examined)`}`)
    else log(`  ${mode} shoot ${f.status} ${f.route} ${f.width} ${f.theme}${f.error ? ` ${f.error}` : ''}`)
  }
}

export async function runVerify(o, { runner, log } = {}) {
  fs.mkdirSync(o.evidence, { recursive: true })
  const logFile = path.join(o.evidence, 'verify.log')
  const tee = (line) => {
    ;(log ?? console.log)(line)
    fs.appendFileSync(logFile, line + '\n')
  }
  const timeoutMs = (Number(o.timeout ?? 20) || 20) * 60000
  const run = runner ?? spawnRunner({ log: tee, timeoutMs })
  const modes = o.mode === 'both' ? ['fast', 'full'] : [o.mode]
  const state = { generatedAt: new Date().toISOString(), mode: o.mode, source: o.source, target: o.target, ok: null, seconds: 0, phases: [], results: {} }
  const save = () => fs.writeFileSync(path.join(o.evidence, 'verify.json'), JSON.stringify(state, null, 2) + '\n')
  const started = Date.now()
  let ok = true
  for (const mode of modes) {
    const p = plan({ pageMap: o.pageMap, pairs: o.pairs, mode, scanRoutes: mode === 'full' ? o.scanRoutes : null })
    const dir = path.join(o.evidence, mode)
    fs.mkdirSync(path.join(dir, 'review'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'source-routes.json'), JSON.stringify(p.parity.map((r) => r.from), null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'target-routes.json'), JSON.stringify(p.target, null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'scan-routes.json'), JSON.stringify(p.scan, null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'pairs.json'), JSON.stringify({ rules: p.parity }, null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(p, null, 2) + '\n')
    tee(`==> ${mode}: ${p.parity.length} routes parity · ${p.scan.length} routes scan · ${p.target.length} routes × ${p.viewports.length} viewports × 2 themes shoot`)
    state.results[mode] = {}
    let modeOk = true
    for (const phase of PHASES) {
      const argv = phaseArgv(phase, mode, p, o, dir)
      tee(`--> ${mode} ${phase}: node ${argv.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`)
      const t0 = Date.now()
      const v = await run(phase, mode, argv, p, dir)
      const seconds = Math.round((Date.now() - t0) / 100) / 10
      const phaseOk = v.exit === 0
      state.phases.push({ mode, phase, argv, seconds, exit: v.exit, ok: phaseOk })
      state.results[mode][phase] = { ok: phaseOk, seconds, summary: v.summary, failing: v.failing }
      state.seconds = Math.round((Date.now() - started) / 100) / 10
      save()
      tee(`<-- ${mode} ${phase}: ${phaseOk ? 'ok' : 'FAIL'} in ${seconds}s${v.summary ? ' ' + JSON.stringify(v.summary) : ''}`)
      if (!phaseOk) {
        modeOk = false
        printDelta(tee, mode, phase, v)
      }
    }
    if (!modeOk) {
      ok = false
      tee(`verify: ${mode} is RED — ${modes.length > 1 && mode === 'fast' ? 'full matrix not run; ' : ''}see ${logFile}`)
      break
    }
    tee(`verify: ${mode} is green`)
  }
  state.ok = ok
  state.seconds = Math.round((Date.now() - started) / 100) / 10
  save()
  tee(`verify: ${ok ? 'OK' : 'FAILED'} in ${state.seconds}s → ${path.join(o.evidence, 'verify.json')}`)
  return state
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(process.argv.slice(2), SPEC, 'usage: verify.mjs --source <url> --target <url> --spec <dir> --config <file> --evidence <dir> [--pairs f] [--accept f] [--theme d] [--fast|--full|--both] [options]')
    const picked = ['fast', 'full', 'both'].filter((m) => o[m])
    if (picked.length > 1) throw new UsageError('pick one of --fast, --full, --both')
    o.mode = picked[0] ?? 'both'
    const pageMapFile = path.join(o.spec, 'page-map.json')
    if (!fs.existsSync(pageMapFile)) throw new UsageError(`${pageMapFile} not found`)
    o.pageMap = JSON.parse(fs.readFileSync(pageMapFile, 'utf8'))
    o.pairs = o.pairs ? JSON.parse(fs.readFileSync(o.pairs, 'utf8')) : null
    o.scanRoutes = o.scanRoutes ? JSON.parse(fs.readFileSync(o.scanRoutes, 'utf8')) : null
    if (o.scanRoutes && !Array.isArray(o.scanRoutes)) o.scanRoutes = o.scanRoutes.routes ?? o.scanRoutes.pages?.map((p) => p.path)
    o.concurrency = Number(o.concurrency)
    const state = await runVerify(o)
    return state.ok ? 0 : 1
  })
