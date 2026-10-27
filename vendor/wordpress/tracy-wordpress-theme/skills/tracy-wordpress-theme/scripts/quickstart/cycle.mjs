#!/usr/bin/env node
// The whole Phase 10 as one fail-fast run: prune → pack → restore → verify-parity → contract-bind → release.
//
//   node scripts/quickstart/cycle.mjs --stand <dir> --id <product/cms> --version <x.y.z>
//        --site-a <url> --site-b <url> --wp-a "<runner>" --wp-b "<runner>" --root-b "<root runner>"
//        --routes <page-map.json> --run-root <dossier> --spec <spec-pack> [--admin tracyagent] [--title "…"] [--dark-hook cookie:tracy_theme=dark]
//        [--theme-zip <zip> --visual-ledger <rounds.jsonl> --checkpoint <run> [--restore-smoke <run>] --behaviour-sweep <site-sweep.json>] [--asset <file>]…
//        --contract <slug>/wp7/<version> [--plugin <zip>] [--curl "<runner>"] [--bind-site-url <url>]
//        [--patch --previous <VERIFICATION.json|dir> --measure <file> [--no-baseline "<reason>"] [--changed-from <zip>]]
//        [--keep-draft <id>]…
//        [--db-host verify-db] [--db-password-env MARIADB_ROOT_PASSWORD] [--keep-root name]… [--keep-define NAME]…
//        [--verify-down "<cmd>"] [--verify-up "<cmd>"] [--from <phase>] [--to <phase>]
//
// Why one script and not five commands in a shell line: the five tools together make ~200 wp
// calls, each a `docker run`, and a shell `a; b; c` keeps going after a failure and writes a
// release over a broken pack. Measured 14/09: a cycle typed by hand died in the middle with no
// log of what had finished. Here every phase is timed, its output is written to
// <stand>/cycle.log as it happens (tee; outside pack/, which the pack phase deletes), its result lands in <stand>/pack/cycle.json, and
// the next phase runs only when the previous one exited 0 — release never runs over a red
// verify. `--from <phase>` resumes after a fix, provided every earlier phase is green in
// cycle.json. Nothing is skipped to go faster: prune, restore and verify are the gate.
//
// Phases: prune (apply, then re-audit must show 0 PRUNE and 0 to decide; both audits read
// `--routes` as the page-map, so the seeder's search-view draft is kept, and carry every
// `--keep-draft`) · pack · restore
// (`--verify-down` before, `--verify-up` after, both optional shell commands) · verify · contract-bind
// (the content-contract bind test on the restored stand, evidence in <stand>/pack/contract-bind/) · release.
//
// The restore stand stands in for the fleet: `--root-b` runs as root in the verify webroot (a
// Linux volume, which the verify web server and `--wp-b` mount too), restore extracts through it,
// and `--wp-b` runs as www-data. verify re-runs the access probe (and checks restore.json is of
// this pack) — so `--from verify` proves the same thing as a full run.
//
// `--patch` is a fix release of a port already released (release.mjs --patch): the same five phases and
// the same contract-bind, but the release phase takes `--previous`, `--measure` (and `--no-baseline`,
// `--changed-from`) instead of the dossier, the Visual QA ledger and the checkpoint, and the contract
// preflight is not run. The measure is of the restored stand, so like the checkpoint it cannot exist before
// the pack: `--to verify`, run the port's measure script on the restore, then `--from contract-bind`.
// `--spec` is still required: its page map declares the status each parity route must answer.
//
// Before anything is created, removed or run — resumes included — the run-root's canonical design
// and visual contracts must be fresh against `--spec` (release.mjs contractProblems): a missing,
// ambiguous, unreadable, unbound, invalid or stale contract stops the cycle with its named reason, not after
// ~100 s of prune, pack, restore and verify. The release phase needs a complete four-tier Visual QA
// checkpoint bound to the pack's archives, which only exist after pack: a cycle that would run pack
// and release in one invocation is refused up front. The statuses `--routes` declares (a `/404`
// page answering 404) are the ones verify holds each route to, and release reads them again from
// `--spec`: a `--routes` that cannot be read, declares a status the spec-pack does not, or leaves out
// a route the spec-pack declares is refused before the first phase, not at release after verify
// passed on it. Run `--to verify`, measure the checkpoint
// against the restored stand (round.mjs with `pack` in its config writes each tier's
// artifact-binding.json as it measures), then `--from contract-bind`.
import { spawn } from 'node:child_process'
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, parseArgs, readRouteExpectations, UsageError } from './lib.mjs'
import { contractProblems, formatProblems, readRegular, specRouteExpectations } from './release.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PHASES = ['prune', 'pack', 'restore', 'verify', 'contract-bind', 'release']

export const SPEC = {
  '--stand': { placeholder: 'dir', required: true, help: 'stand dir: capture/ (webroot), pack/, release/ — the restore lives in the --root-b volume' },
  '--id': { placeholder: 'id', required: true, help: 'quickstart id, e.g. tracy-business/wp7' },
  '--version': { placeholder: 'x.y.z', required: true },
  '--site-a': { placeholder: 'url', required: true, help: 'build stand address' },
  '--site-b': { placeholder: 'url', required: true, help: 'restore stand address' },
  '--wp-a': { placeholder: 'runner', required: true, help: 'wp-cli runner on the build stand' },
  '--wp-b': { placeholder: 'runner', required: true, help: 'wp-cli runner on the restore stand, as www-data (--user 33:33)' },
  '--root-b': { placeholder: 'runner', help: 'root runner on the restore stand webroot (restore.mjs --root-runner) — required for restore and verify' },
  '--webroot-b': { placeholder: 'path', default: '/var/www/html', help: 'the restore stand webroot as its runners see it' },
  '--runtime-uid': { placeholder: 'uid', default: '33', help: "the fleet's www-data uid" },
  '--routes': { placeholder: 'file', required: true, help: 'page-map.json (verify-parity routes)' },
  '--admin': { placeholder: 'login', default: 'tracyagent' },
  '--asset': { placeholder: 'file', repeat: true, help: 'extra release asset (profile zip); repeatable' },
  '--theme-zip': { placeholder: 'file', help: 'the final theme zip (release.mjs --theme-zip); a contract bound to an artifact is checked against it' },
  '--setting-template': { placeholder: 'file', help: 'release.mjs --setting-template: the port\'s published tracy_setting.json, the new one is written from it' },
  '--card': { placeholder: 'file', help: 'release.mjs --card: the port\'s tracy_design_inspiration.json, copied into the release' },
  '--title': { placeholder: 'text', help: 'release title' },
  '--dark-hook': { placeholder: 'hook', default: 'attr:data-theme=dark' },
  '--light-hook': { placeholder: 'hook', help: 'verify-parity --light-hook: the light pass of a site dark by default (default none)' },
  '--db-host': { placeholder: 'host', default: 'verify-db' },
  '--db-password-env': { placeholder: 'VAR', default: 'MARIADB_ROOT_PASSWORD' },
  // release.mjs names the canonical contracts and refuses a stale one, so the cycle must carry the
  // dossier, the spec-pack, the theme zip and the checkpoint through — without them the last phase
  // died on its own required flag after the other four had passed (15/09).
  '--run-root': { placeholder: 'dir', help: 'the site dossier (release.mjs --run-root) — required: the cycle checks its canonical contracts before the first phase and refuses to start without it' },
  '--contract': { placeholder: 'slug/wp7/version', help: 'the content-contract id of this release (contract-bind.mjs --contract) — required by the contract-bind phase' },
  '--plugin': { placeholder: 'zip url|path', help: 'contract-bind.mjs --plugin: install and activate this Cowork plugin zip on the restore first (a local path is hashed into the evidence)' },
  '--curl': { placeholder: 'runner', help: 'contract-bind.mjs --curl: command prefix that ends in curl and reaches the restored site (default curl)' },
  '--bind-site-url': { placeholder: 'url', help: 'the restored site as the --curl runner reaches it (default --site-b)' },
  '--verbose': { value: false, help: 'print every phase tool line as it runs (default: one line per phase; the full output is in <stand>/cycle.log)' },
  '--patch': { value: false, help: 'a fix release of a shipped port: release.mjs --patch (the release phase needs --previous, --measure, --spec — a run that stops at verify needs neither --previous nor --measure); no contract preflight, no checkpoint' },
  '--previous': { placeholder: 'file|dir', help: '--patch: the last release\'s VERIFICATION.json or directory (release.mjs --previous)' },
  '--measure': { placeholder: 'file', help: '--patch: tracy-fix-measure/v1 evidence measured on the restored stand (release.mjs --measure)' },
  '--no-baseline': { placeholder: 'reason', help: '--patch: release.mjs --no-baseline' },
  '--changed-from': { placeholder: 'zip', help: '--patch: release.mjs --changed-from, the previous theme zip' },
  '--keep-user': { placeholder: 'login', repeat: true, help: 'an author the spec declares (prune-audit --keep-user)' },
  '--keep-draft': { placeholder: 'id', repeat: true, help: 'a draft page decided on: keep it as a draft (prune-audit --keep-draft)' },
  '--keep-root': { placeholder: 'name', repeat: true, help: 'a webroot root entry the design ships (pack.mjs --keep-root)' },
  '--keep-define': { placeholder: 'NAME', repeat: true, help: 'a wp-config.php constant the design ships (pack.mjs --keep-define)' },
  '--spec': { placeholder: 'dir', help: 'spec-pack the contracts are bound to (release.mjs --spec) — required: the cycle refuses to start on a contract it cannot prove fresh' },
  '--visual-ledger': { placeholder: 'file', help: 'the Visual QA ledger holding --checkpoint (release.mjs --visual-ledger)' },
  '--checkpoint': { placeholder: 'run', help: 'the complete four-tier checkpoint the release quotes (release.mjs --checkpoint)' },
  '--restore-smoke': { placeholder: 'run', help: 'run id, in --visual-ledger, of the one-tier dark-responsive smoke measured on the restored pack: with it a build-stand four-tier --checkpoint bound to the same artifacts is accepted (release.mjs --restore-smoke); otherwise the checkpoint must be four tiers on the restore' },
  '--behaviour-sweep': { placeholder: 'file', help: 'a first release (not --patch): the site-sweep.json with all eleven sweep checks, measured on the restored pack (release.mjs --behaviour-sweep); the release phase is refused without it' },
  '--verify-down': { placeholder: 'cmd', help: 'shell command that stops the restore stand before restore' },
  '--verify-up': { placeholder: 'cmd', help: 'shell command that starts the restore stand after restore' },
  '--from': { placeholder: 'phase', help: `resume at this phase (${PHASES.join(', ')}); earlier phases must be green in cycle.json` },
  '--to': { placeholder: 'phase', help: 'stop after this phase (e.g. verify, to measure the Visual QA checkpoint before --from contract-bind)' },
  '--env-file': { placeholder: 'file', help: 'pack.mjs --env-file (stand secrets to scan for)' },
  '--timeout': { placeholder: 's', default: '3600', help: 'seconds for the whole cycle; past it the running phase is killed and the cycle ends with exit 1' }
}

/** The argv of each phase's tool, from the cycle's options. Pure, so a test can read the plan. */
export function plan(o) {
  const S = o.stand
  const pack = path.join(S, 'pack')
  const t = (name) => path.join(HERE, `${name}.mjs`)
  const webrootB = o.webrootB ?? '/var/www/html'
  const runtimeUid = String(o.runtimeUid ?? '33')
  // The page-map tells the audit which draft is the seeder's search view; --keep-draft records a
  // person's decision on any other. Both audits get both.
  const decisions = [...(o.routes ? ['--page-map', o.routes] : []), ...(o.keepDraft ?? []).flatMap((id) => ['--keep-draft', String(id)])]
  return {
    prune: [
      { argv: [t('prune-audit'), '--webroot', path.join(S, 'capture'), '--wp', o.wpA, '--admin', o.admin, ...(o.keepUser ?? []).flatMap((u) => ['--keep-user', u]), ...decisions, '--site-url', o.siteA, '--apply'] },
      // The check re-audits with the SAME flags: an audit that does not know which users are
      // content reports them as PRUNE again and the phase fails on its own removals (15/09).
      { argv: [t('prune-audit'), '--webroot', path.join(S, 'capture'), '--wp', o.wpA, '--admin', o.admin, ...(o.keepUser ?? []).flatMap((u) => ['--keep-user', u]), ...decisions, '--site-url', o.siteA], mustMatch: /— \d+ keep, 0 prune, \d+ removed, 0 to decide/ }
    ],
    pack: [
      { rm: pack },
      { argv: [t('pack'), '--webroot', path.join(S, 'capture'), '--wp', o.wpA, '--site-url', o.siteA, '--out', pack, '--id', o.id, '--version', o.version, ...(o.keepRoot ?? []).flatMap((n) => ['--keep-root', n]), ...(o.keepDefine ?? []).flatMap((n) => ['--keep-define', n]), ...(o.envFile ? ['--env-file', o.envFile] : [])] }
    ],
    restore: [
      ...(o.verifyDown ? [{ sh: o.verifyDown }] : []),
      { argv: [t('restore'), '--pack', pack, ...(o.rootB ? ['--root-runner', o.rootB] : []), '--container-webroot', webrootB, '--runtime-uid', runtimeUid, '--wp', o.wpB, '--site-url', o.siteB, '--db-host', o.dbHost, '--db-password-env', o.dbPasswordEnv, '--origin-wp', o.wpA, '--wipe', '--report', path.join(pack, 'restore.json')] },
      ...(o.verifyUp ? [{ sh: o.verifyUp }, { sleep: 4 }] : [])
    ],
    verify: [
      { argv: [t('verify-parity'), '--a', o.siteA, '--b', o.siteB, '--routes', o.routes, '--wp-a', o.wpA, '--wp-b', o.wpB, ...(o.rootB ? ['--root-b', o.rootB] : []), '--webroot-b', webrootB, '--runtime-uid', runtimeUid, '--pack', pack, '--restore-report', path.join(pack, 'restore.json'), '--dark-hook', o.darkHook, ...(o.lightHook ? ['--light-hook', o.lightHook] : []), '--out', path.join(pack, 'parity.json')] }
    ],
    // Run on the restore AFTER pack and verify: the packed archives never carry the plugin or its binding.
    // The evidence is bound to this pack and the theme zip, which release.mjs requires.
    'contract-bind': [
      { argv: [t('contract-bind'), '--wp', o.wpB, '--site-url', o.bindSiteUrl ?? o.siteB, ...(o.contract ? ['--contract', o.contract] : []), ...(o.plugin ? ['--plugin', o.plugin] : []), ...(o.curl ? ['--curl', o.curl] : []), ...(o.rootB ? ['--root-runner', o.rootB, '--container-webroot', webrootB, '--runtime-uid', runtimeUid] : []), '--pack', pack, ...(o.themeZip ? ['--theme-zip', o.themeZip] : []), '--out', path.join(pack, 'contract-bind')] }
    ],
    // No `rm` of release/ first: release.mjs replaces it only once the release is accepted, so a
    // refused release leaves the last good one (and its notes) where they were.
    release: [
      { argv: [t('release'), '--pack', pack, '--out', path.join(S, 'release'), '--parity', path.join(pack, 'parity.json'), '--restore-report', path.join(pack, 'restore.json'), '--contract-bind', path.join(pack, 'contract-bind', 'contract-bind.json'), ...(o.patch
        ? ['--patch', ...(o.previous ? ['--previous', o.previous] : []), ...(o.measure ? ['--measure', o.measure] : []), ...(o.noBaseline !== undefined ? ['--no-baseline', o.noBaseline] : []), ...(o.changedFrom ? ['--changed-from', o.changedFrom] : []), ...(o.runRoot ? ['--run-root', o.runRoot] : []), ...(o.spec ? ['--spec', o.spec] : []), ...(o.themeZip ? ['--theme-zip', o.themeZip] : [])]
        : [...(o.runRoot ? ['--run-root', o.runRoot] : []), ...(o.spec ? ['--spec', o.spec] : []), ...(o.themeZip ? ['--theme-zip', o.themeZip] : []), ...(o.visualLedger ? ['--visual-ledger', o.visualLedger] : []), ...(o.checkpoint ? ['--checkpoint', o.checkpoint] : []), ...(o.restoreSmoke ? ['--restore-smoke', o.restoreSmoke] : []), ...(o.behaviourSweep ? ['--behaviour-sweep', o.behaviourSweep] : [])]), ...(o.settingTemplate ? ['--setting-template', o.settingTemplate] : []), ...(o.card ? ['--card', o.card] : []), ...(o.asset ?? []).flatMap((a) => ['--asset', a]), ...(o.title ? ['--title', o.title] : []), '--admin', o.admin] }
    ]
  }
}

/** Run one step, streaming its output to the console and the log; resolves {code, output}. */
let current = null // the child of the step under way, for the cycle's own timeout
function runStep(step, log, verbose = true) {
  if (step.rm) {
    rmSync(step.rm, { recursive: true, force: true })
    return Promise.resolve({ code: 0, output: '' })
  }
  if (step.mkdir) {
    mkdirSync(step.mkdir, { recursive: true })
    return Promise.resolve({ code: 0, output: '' })
  }
  if (step.sleep) return new Promise((r) => setTimeout(() => r({ code: 0, output: '' }), step.sleep * 1000))
  const child = step.sh
    ? spawn('sh', ['-c', step.sh], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    : spawn(process.execPath, step.argv, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  current = child
  let output = ''
  const tee = (chunk) => {
    const s = chunk.toString()
    output += s
    if (verbose) process.stdout.write(s)
    log.write(s)
  }
  child.stdout.on('data', tee)
  child.stderr.on('data', tee)
  return new Promise((resolve) => {
    child.on('close', (code) => {
      if (code === 0 && step.mustMatch && !step.mustMatch.test(output)) resolve({ code: 1, output: `${output}\ncycle: output did not match ${step.mustMatch}` })
      else resolve({ code: code ?? 1, output })
    })
  })
}

/**
 * What would stop a phase that is going to run, known before anything runs. release.mjs requires
 * `--run-root`, and a cycle without it ran prune, pack, restore and verify green (~100 s on Tracy
 * Base 1.1.0) only to die on that flag at the last phase. restore and verify read the restore as
 * the fleet does, through a root runner; without one neither can pass.
 */
export function preflight(steps, phases) {
  const problems = []
  for (const [phase, tool, flag] of [['restore', 'restore.mjs', '--root-runner'], ['verify', 'verify-parity.mjs', '--root-b']])
    if (phases.includes(phase))
      for (const step of steps[phase] ?? [])
        if (step.argv && path.basename(step.argv[0]) === tool && !step.argv.includes(flag))
          problems.push(`the ${phase} phase will run and ${tool} needs ${flag} — pass --root-b "<root runner on the restore webroot>"`)
  if (phases.includes('contract-bind'))
    for (const step of steps['contract-bind'] ?? [])
      if (step.argv && path.basename(step.argv[0]) === 'contract-bind.mjs')
        for (const [flag, what] of [['--contract', '<slug>/wp7/<version>'], ['--theme-zip', '<zip>']])
          if (!step.argv.includes(flag)) problems.push(`[contract-bind-input-missing] the contract-bind phase will run and contract-bind.mjs --pack needs ${flag} ${what} — pass ${flag}`)
  if (phases.includes('release'))
    for (const step of steps.release ?? []) {
      if (!step.argv || path.basename(step.argv[0]) !== 'release.mjs') continue
      const patch = step.argv.includes('--patch')
      for (const [flag, what] of patch ? [['--previous', '<VERIFICATION.json|dir>'], ['--measure', '<file>'], ['--run-root', '<dossier>'], ['--spec', '<spec-pack>'], ['--theme-zip', '<zip>']] : [['--run-root', '<dossier>'], ['--spec', '<spec-pack>'], ['--theme-zip', '<zip>'], ['--visual-ledger', '<rounds.jsonl>'], ['--checkpoint', '<run>']])
        if (!step.argv.includes(flag)) problems.push(`[release-input-missing] the release phase will run and release.mjs${patch ? ' --patch' : ''} requires ${flag} ${what} — pass ${flag}`)
      // A first release owes the behaviour pass (release.mjs behaviourProblems): refused here, before prune/pack/restore/verify run.
      if (!patch && !step.argv.includes('--behaviour-sweep'))
        problems.push('[behaviour-pass-missing] the release phase will run and a first release needs the behaviour pass — a site-sweep.json with all eleven sweep checks measured on the restored pack (run --to verify, then node scripts/visual/site-sweep.mjs --zip <theme zip> with no --only, fix or record every group in sweep.accept, then --from contract-bind with --behaviour-sweep <site-sweep.json>)')
      // The checkpoint must be bound to archives measured after pack wrote them: one invocation
      // that packs and then releases can only release on evidence older than its own pack.
      if (phases.includes('pack'))
        problems.push(patch
          ? '[measure-before-pack] this run packs and then releases, but the fix release needs a measure taken on the restore of this pack — run --to verify, run the port\'s measure script on the restored stand, then --from contract-bind'
          : '[checkpoint-before-pack] this run packs and then releases, but the release needs a Visual QA checkpoint measured after the pack — run --to verify, measure the checkpoint (round.mjs binds each tier to the pack), then --from contract-bind')
    }
  return problems
}

/**
 * Named reasons the design inputs cannot back this cycle, known before anything runs: the run-root's
 * canonical contracts against the spec-pack (release.mjs contractProblems: run-root-missing,
 * spec-missing, spec-unreadable, contract-missing, contract-ambiguous, contract-unreadable,
 * contract-unbound, contract-invalid, contract-stale), and a --theme-zip that is not a readable
 * regular file. Every file hashed is held to be a regular file first: a FIFO never holds the run.
 */
export function freshness(o) {
  const problems = []
  let artifactPath = null
  if (o.themeZip)
    try {
      readRegular(o.themeZip)
      artifactPath = o.themeZip
    } catch (e) {
      problems.push({ code: 'theme-zip-invalid', message: e.message })
    }
  // a fix release runs no design or visual contract gate (the release reads visual.contract.json only for routes and source site); its page map still declares the parity statuses
  if (o.patch) {
    if (!o.spec) problems.push({ code: 'spec-missing', message: 'no --spec: the status each parity route must answer is declared by the spec-pack\'s page map, which a fix release reads too' })
  } else problems.push(...contractProblems({ runRoot: o.runRoot ?? null, specDir: o.spec ?? null, artifactPath }).problems)
  problems.push(...routeProblems(o))
  return problems
}

/**
 * Named reasons verify and release would not hold the same routes to the same statuses: `--routes`
 * (lib.mjs readRouteExpectations) must be readable, name every route the spec-pack's page map
 * declares — release refuses a parity.json that leaves one out — and hold each to the status the
 * page map declares for its path (200 where it declares nothing). An unreadable `--routes` or page
 * map is refused here by name, before prune, pack or restore run on it. Without `--spec` the
 * contracts gate already refuses the run (contractProblems spec-missing).
 */
export function routeProblems(o) {
  let routes
  try {
    if (!o.routes) throw new Error('no --routes')
    routes = readRouteExpectations(o.routes)
  } catch (e) {
    return [{ code: 'routes-invalid', message: `the routes verify compares cannot be read: ${e.message}` }]
  }
  if (!o.spec) return []
  const spec = specRouteExpectations(o.spec)
  if (!spec.expectations) return spec.problems
  const given = new Map(routes.map((r) => [r.path, r.expected]))
  const out = routes
    .filter((r) => r.expected !== (spec.expectations.get(r.path) ?? 200))
    .map((r) => ({ code: 'parity-expectation', message: `--routes declares ${r.path} answering ${r.expected}, the spec-pack's page map ${spec.expectations.get(r.path) ?? 200} — verify and release would hold it to two statuses` }))
  for (const p of spec.expectations.keys())
    if (!given.has(p)) out.push({ code: 'parity-incomplete', message: `the spec-pack's page map declares ${p}, --routes does not name it — verify would not measure it and release refuses a parity.json without it` })
  return out
}

/** What a failed step said that names the refusal: the marked lines, else the last ones — at most 40. */
export function refusalLines(text) {
  const lines = String(text).split('\n').map((l) => l.trimEnd()).filter(Boolean)
  const marked = lines.filter((l) => /\[[a-z][a-z0-9-]+\]|refus|fail|error|^!!|✗/i.test(l))
  return (marked.length ? marked : lines).slice(-40)
}

/** The cycle's own log: beside pack/, never in it — the pack phase removes the whole directory before it packs. */
export const cycleLogPath = (stand) => path.join(stand, 'cycle.log')

export async function runCycle(o, { from = null, to = null, planOverride = null, timeout = Number(o.timeout ?? 3600), verbose = Boolean(o.verbose) } = {}) {
  const pack = path.join(o.stand, 'pack')
  const steps = planOverride ?? plan(o)
  const start = from ? PHASES.indexOf(from) : 0
  if (start === -1) throw new UsageError(`--from must be one of ${PHASES.join(', ')}`)
  const end = to ? PHASES.indexOf(to) : PHASES.length - 1
  if (end === -1) throw new UsageError(`--to must be one of ${PHASES.join(', ')}`)
  if (end < start) throw new UsageError(`--to ${to} comes before --from ${from}`)
  const phases = PHASES.slice(start, end + 1)
  // Before the first phase and before anything is created or removed — a resume included.
  const problems = [...preflight(steps, phases), ...freshness(o).map((p) => formatProblems([p]))]
  if (problems.length) throw new UsageError(`cycle: ${problems.join('; ')}`)
  mkdirSync(pack, { recursive: true })
  const logPath = cycleLogPath(o.stand)
  // The cycle's own clock, over the tools' own --timeout: when it runs out the phase under way is
  // killed, the log says so, and the cycle ends with exit 1 — never a phase that sits there.
  const timer = setTimeout(() => {
    const line = `cycle: timed out after ${timeout}s — killing the running phase\n`
    process.stderr.write(line)
    try {
      appendFileSync(logPath, line)
    } catch {}
    current?.kill('SIGTERM')
    process.exit(1)
  }, timeout * 1000)
  timer.unref()
  const statePath = path.join(pack, 'cycle.json')
  const state = from && existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { id: o.id, version: o.version, phases: {} }
  for (const p of PHASES.slice(0, start))
    if (!state.phases[p]?.ok) throw new UsageError(`--from ${from}: phase ${p} is not green in ${statePath}; run from ${p}`)
  const log = createWriteStream(logPath, { flags: 'a' })
  const stamp = () => new Date().toISOString().slice(11, 19)
  for (const phase of phases) {
    const line = `== ${phase} ${stamp()}\n`
    process.stdout.write(line)
    log.write(line)
    const t0 = Date.now()
    let ok = true
    for (const step of steps[phase]) {
      const { code, output } = await runStep(step, log, verbose)
      if (code !== 0) {
        ok = false
        if (!verbose) process.stdout.write(`${refusalLines(output).join('\n')}\n`)
        break
      }
    }
    state.phases[phase] = { ok, seconds: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() }
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
    const done = `== ${phase} ${ok ? 'ok' : 'FAILED'} in ${state.phases[phase].seconds}s\n`
    process.stdout.write(done)
    log.write(done)
    if (!ok) {
      if (!verbose) process.stdout.write(`log: ${logPath}\n`)
      // the log is flushed before the cycle reports: a caller reads it right after (the failing
      // phase's own output was missing from cycle.log under load)
      await new Promise((r) => log.end(r))
      clearTimeout(timer)
      throw new Error(`cycle: ${phase} failed — later phases not run (${statePath})`)
    }
  }
  await new Promise((r) => log.end(r))
  clearTimeout(timer)
  return state
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain)
  cli(async () => {
    const o = parseArgs(process.argv.slice(2), SPEC, 'usage: cycle.mjs --stand <dir> --id <id> --version <v> --site-a <url> --site-b <url> --wp-a "<runner>" --wp-b "<runner>" --root-b "<root runner>" --routes <page-map.json> --run-root <dossier> --spec <spec-pack> [--theme-zip <zip> --visual-ledger <rounds.jsonl> --checkpoint <run>] [--from <phase>] [--to <phase>]')
    // --previous and --measure belong to the release phase (preflight names them when the run reaches it): the measure is
    // taken on the restore, so a run that stops at verify cannot have it yet
    const state = await runCycle(o, { from: o.from ?? null, to: o.to ?? null })
    if (!o.verbose) console.log(`log: ${cycleLogPath(o.stand)}`)
    const total = Object.values(state.phases).reduce((n, p) => n + p.seconds, 0)
    console.log(`cycle: ${PHASES.map((p) => `${p} ${state.phases[p]?.seconds ?? '-'}s`).join(' · ')} · total ${total}s`)
  })
