#!/usr/bin/env node
/**
 * The checks a desktop release must pass right before its channel file is written
 * (tasks/todo-desktop-release.md §2.2 step 4). Read-only: it writes no feed, uploads nothing, signs
 * nothing.
 *
 *   node build/release-preflight.mjs --channel stable|dev [--sha <rev>] [--version <v>] [--build-id <id>]
 *       [--feed <url|file>] [--origin <url>] [--notes <file>] [--artifact <path to .app>]
 *       [--repo <owner/name>] [--no-fetch] [--update-feed <url the app must name>]
 *
 * One PASS / FAIL / SKIP line per check; exit 1 when any check fails, 2 on bad usage. SKIP means
 * "not checked" (no artifact, no notes given) and is printed as such — never folded into a pass.
 *
 * Two halves, on purpose:
 *   - `preflight(facts)` judges a plain object of facts and returns the results. Pure, so every rule
 *     is tested with fixtures (`test/release-preflight.test.mjs`).
 *   - `gatherFacts(options)` runs git, gh, the feed request, the server contract and codesign/spctl
 *     to build that object. Nothing in it decides pass or fail.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { checkServerContract } from './check-server-contract.mjs'
import { fuseProblems, readAppFuses } from './fuses.mjs'
import { nonEnglishLines } from './english.mjs'
import { thirdPartyLines } from './third-party-names.mjs'
import { readPayload } from './payload.mjs'
import updateChannel from './update-channel.cjs'

const { verifyFeed } = createRequire(import.meta.url)('../src/feed-signature.js')

/** What each channel is built from, served by and pinned to. */
export const CHANNELS = Object.freeze({
  stable: {
    branch: 'origin/main',
    origin: 'https://cowork.tracy.ai',
    bundleId: 'ai.tracy.cowork',
    versionForm: /^\d+\.\d+\.\d+$/,
    versionHint: 'X.Y.Z'
  },
  dev: {
    branch: 'origin/develop',
    origin: 'https://cowork.tracy.site',
    bundleId: 'ai.tracy.cowork.dev',
    versionForm: /^\d+\.\d+\.\d+-dev\.\d+$/,
    versionHint: 'X.Y.Z-dev.N'
  }
})

const TEAM_ID = '9S5F8693FB'
const CI_WORKFLOW = 'tracy-ci.yml'
const PACKAGE_DIR = 'packages/desktop/tracy-desktop'

// ── pure half ────────────────────────────────────────────────────────────────────────────────────

/**
 * Order two versions of the forms `X.Y.Z` and `X.Y.Z-dev.N`: a release ranks above its dev builds,
 * and dev builds rank by N as a number.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive.
 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-dev\.(\d+))?$/.exec(v)
    if (!m) throw new Error(`not a desktop version: ${v}`)
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? Infinity : Number(m[4])]
  }
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/**
 * The version and build id a channel file serves. `buildId` is a top-level `buildId:` line, or null
 * when the file does not say.
 * @param {string} text
 * @returns {{ version: string | null, buildId: string | null }}
 */
export function parseFeed(text) {
  const field = (name) => {
    const m = new RegExp(`^${name}:\\s*['"]?([^'"\\s]+)['"]?\\s*$`, 'm').exec(text)
    return m ? m[1] : null
  }
  return { version: field('version'), buildId: field('buildId') }
}

const pass = (check, detail) => ({ check, status: 'PASS', detail })
const fail = (check, detail) => ({ check, status: 'FAIL', detail })
const skip = (check, detail) => ({ check, status: 'SKIP', detail: `not checked: ${detail}` })

/** @param {{ porcelain: string }} tree */
function checkTree(tree) {
  const lines = tree.porcelain.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return pass('clean tree', 'no local changes')
  const shown = lines.slice(0, 5).map((line) => line.trim())
  return fail(
    'clean tree',
    `${lines.length} local change(s): ${shown.join(', ')}${lines.length > 5 ? ', …' : ''}`
  )
}

/** @param {string} sha @param {{ branch: string, isAncestor: boolean, error?: string }} ancestry */
function checkAncestry(sha, ancestry) {
  if (ancestry.error) return fail('on origin', ancestry.error)
  return ancestry.isAncestor
    ? pass('on origin', `${sha.slice(0, 10)} is in the history of ${ancestry.branch}`)
    : fail(
        'on origin',
        `${sha.slice(0, 10)} is not in the history of ${ancestry.branch} — push and merge it first`
      )
}

/** @param {string} sha @param {{ runs?: object[], error?: string }} ci */
function checkCi(sha, ci) {
  if (ci.error || !Array.isArray(ci.runs))
    return fail('ci green on sha', `cannot read Tracy CI runs: ${ci.error ?? 'no run list in the answer'}`)
  const own = ci.runs.filter((run) => run.head_sha === sha)
  const green = own.find((run) => run.status === 'completed' && run.conclusion === 'success')
  if (green) return pass('ci green on sha', `Tracy CI run ${green.id} succeeded on ${sha.slice(0, 10)}`)
  const seen = own.map((run) => `${run.id} ${run.status}/${run.conclusion ?? '-'}`).join(', ')
  return fail(
    'ci green on sha',
    `no successful Tracy CI run with head_sha ${sha.slice(0, 10)}${seen ? ` (runs: ${seen})` : ''} — ` +
      `a merge commit never has one (CI runs on pull requests) — release the merged PR's head sha, or start a run with: gh workflow run ${CI_WORKFLOW} --ref <branch or tag at this sha>`
  )
}

/**
 * @param {'stable' | 'dev'} channel
 * @param {{ version: string | null, buildId: string | null, error?: string }} candidate
 * @param {{ url: string, text?: string, missing?: boolean, error?: string }} feed
 */
function checkVersion(channel, candidate, feed) {
  const name = 'version above feed'
  const { versionForm, versionHint } = CHANNELS[channel]
  if (candidate.version === null) return fail(name, `no candidate version: ${candidate.error ?? 'unknown'}`)
  if (!versionForm.test(candidate.version))
    return fail(name, `${candidate.version} is not a ${channel} version (${versionHint})`)
  if (feed.error) return fail(name, `cannot read ${feed.url}: ${feed.error}`)
  if (feed.missing)
    return pass(name, `${candidate.version}; no channel file at ${feed.url} yet — first release`)
  const published = parseFeed(feed.text)
  if (published.version === null || !/^\d+\.\d+\.\d+(-dev\.\d+)?$/.test(published.version))
    return fail(name, `${feed.url} has no readable version line`)
  const order = compareVersions(candidate.version, published.version)
  if (order > 0) return pass(name, `${candidate.version} > ${published.version} on ${feed.url}`)
  if (order < 0) return fail(name, `${candidate.version} < ${published.version} already on ${feed.url}`)
  if (published.buildId === null)
    return fail(
      name,
      `${candidate.version} is already on ${feed.url}, which names no build id — use a new version`
    )
  if (candidate.buildId !== published.buildId)
    return fail(
      name,
      `${candidate.version} is already on ${feed.url} as build ${published.buildId}, ` +
        `this is ${candidate.buildId ?? 'no build id'} — a published version is never replaced; use a new version`
    )
  return pass(name, `${candidate.version} re-run of the published build ${published.buildId}`)
}

/** @param {{ text: string } | { error: string } | null} notes */
function checkThirdParty(notes) {
  const name = 'notes name no third party'
  if (notes === null) return skip(name, 'no --notes given')
  if ('error' in notes) return fail(name, notes.error)
  const bad = thirdPartyLines(notes.text)
  return bad.length === 0
    ? pass(name, 'no vendor or upstream name')
    : fail(
        name,
        `write the effect the user sees instead of: ${bad.map((line) => JSON.stringify(line)).join(', ')}`
      )
}

/** @param {{ text: string } | { error: string } | null} notes */
function checkNotes(notes) {
  if (notes === null) return skip('notes in English', 'no --notes given')
  if ('error' in notes) return fail('notes in English', notes.error)
  const bad = nonEnglishLines(notes.text)
  return bad.length === 0
    ? pass('notes in English', `${notes.text.split('\n').filter((l) => l.trim()).length} line(s)`)
    : fail('notes in English', `Vietnamese in: ${bad.map((line) => JSON.stringify(line)).join(', ')}`)
}

/** @param {{ origin: string, results?: object[], error?: string }} contract */
function checkContract(contract) {
  if (contract.error) return fail('server contract', `${contract.origin}: ${contract.error}`)
  const broken = contract.results.filter((r) => !r.ok)
  return broken.length === 0
    ? pass('server contract', `${contract.results.length} door(s) answer as expected on ${contract.origin}`)
    : fail(
        'server contract',
        `${contract.origin}: ${broken.map((r) => `${r.method} ${r.path} (${r.reasons.join('; ')})`).join(' | ')}`
      )
}

/**
 * @param {'stable' | 'dev'} channel
 * @param {{ skipped: string } | { error: string } | {
 *   codesignVerify: { ok: boolean, output: string }, codesignInfo: string, spctl: string,
 *   stapler: { ok: boolean, output: string }, bundleId: string, origin: string, updateChannel: string,
 *   updateFeed: string, archs?: string[]
 * }} signature
 * @param {string} [updateFeed] - the feed the app must name in its app-update.yml (default: the channel's own).
 * @param {{ name?: string, expectArchs?: string[], dmg?: boolean }} [which] - the check's name, the archs
 *   (`lipo -archs`) the app's binary must hold — exactly those: an arch zip holds one, the universal dmg
 *   both — and whether the artifact is a dmg, whose CONTAINER must be signed, notarized and stapled too
 *   (`signature.container`: what Gatekeeper judges first when a downloaded dmg is opened).
 */
function checkSignature(channel, signature, updateFeed = updateChannel.feedFor(channel), which = {}) {
  const name = which.name ?? 'signature'
  if ('skipped' in signature) return skip(name, signature.skipped)
  if ('error' in signature) return fail(name, signature.error)
  const want = CHANNELS[channel]
  const problems = []
  if (!signature.codesignVerify.ok)
    problems.push(`codesign --verify --deep --strict failed: ${signature.codesignVerify.output.trim()}`)
  if (!/^Authority=Developer ID Application: /m.test(signature.codesignInfo))
    problems.push('not signed with a Developer ID')
  if (!new RegExp(`^TeamIdentifier=${TEAM_ID}$`, 'm').test(signature.codesignInfo))
    problems.push(`team is not ${TEAM_ID}`)
  if (!/^source=Notarized Developer ID$/m.test(signature.spctl))
    problems.push('spctl does not say Notarized Developer ID')
  if (!signature.stapler.ok) problems.push('no stapled notarization ticket')
  if (signature.bundleId !== want.bundleId)
    problems.push(`bundle id ${signature.bundleId}, expected ${want.bundleId}`)
  if (signature.origin !== want.origin)
    problems.push(`pinned origin ${signature.origin || '(none)'}, expected ${want.origin}`)
  if (signature.updateChannel !== channel)
    problems.push(`update channel ${signature.updateChannel || '(none)'}, expected ${channel}`)
  if (signature.updateFeed !== updateFeed)
    problems.push(`update feed ${signature.updateFeed || '(none)'}, expected ${updateFeed}`)
  const archs = (list) => [...(list ?? [])].sort().join('+')
  if (which.expectArchs && archs(signature.archs) !== archs(which.expectArchs))
    problems.push(
      `binary arch ${archs(signature.archs) || '(unknown)'}, expected ${archs(which.expectArchs)}`
    )
  // Electron fuses (build/fuses.mjs): a shipped app never runs as Node, takes NODE_OPTIONS or opens an inspector.
  problems.push(...fuseProblems(signature.fuses))
  if (signature.debugGuard !== true)
    problems.push(
      'main.js does not refuse remote-debugging switches before anything else (src/debug-switches.js)'
    )
  if (which.dmg) problems.push(...containerProblems(signature.container))
  return problems.length === 0
    ? pass(
        name,
        `Developer ID ${TEAM_ID}, notarized, stapled, ${want.bundleId}, ${want.origin}, feed ${updateFeed}, fuses hardened, refuses remote debugging` +
          (which.expectArchs ? `, ${archs(which.expectArchs)}` : '') +
          (which.dmg ? ', dmg notarized and stapled' : '')
      )
    : fail(name, problems.join('; '))
}

/**
 * Does this main.js refuse remote-debugging switches (src/debug-switches.js) as its first act — before
 * the app's other modules load and before `app.whenReady`? A static tripwire: the behaviour itself is
 * unit-tested and was measured on a real build; this catches a build whose main.js lost the call.
 * @param {string} source - the packaged `Contents/Resources/app/src/main.js`.
 */
export function debugGuardFirst(source) {
  const guard = source.indexOf('refuseDebugSwitches(')
  if (guard === -1) return false
  const firsts = [
    source.indexOf('whenReady'),
    source.indexOf("require('./", source.indexOf("require('./debug-switches.js')") + 1)
  ]
  return firsts.every((at) => at === -1 || guard < at)
}

/**
 * What is wrong with a dmg AS AN IMAGE — its own Developer ID signature, notarization and staple, as
 * Gatekeeper judges a downloaded dmg before the app inside. Empty when nothing is. Prepare asks it of
 * every dmg it built, publish of every dmg it downloads.
 * @param {{ spctl: string, stapler: { ok: boolean, output: string } } | undefined} container
 * @returns {string[]}
 */
export function containerProblems(container) {
  if (!container) return ['the dmg container was not checked']
  const problems = []
  if (!/^source=Notarized Developer ID$/m.test(container.spctl))
    problems.push('the dmg is not a notarized Developer ID image (spctl -t open)')
  if (!container.stapler.ok) problems.push('the dmg has no stapled ticket')
  return problems
}

/**
 * One signature line per artifact of a release (`facts.signatures`, from publish, which opens every
 * zip and dmg), or the single `facts.signature` of a hand run with `--artifact`.
 * @param {object} facts
 */
function checkSignatures(facts) {
  if (!Array.isArray(facts.signatures))
    return [checkSignature(facts.channel, facts.signature, facts.updateFeed)]
  // A release with no Mac artifact (its apps are payloads) has no signature line.
  if (facts.signatures.length === 0)
    return facts.payloads?.length ? [] : [fail('signature', 'no app to check')]
  return facts.signatures.map((s) =>
    checkSignature(facts.channel, s.signature, facts.updateFeed, {
      name: `signature ${s.artifact}`,
      expectArchs: s.expectArchs,
      dmg: s.artifact.endsWith('.dmg')
    })
  )
}

/**
 * Each artifact of the manifest, downloaded back from the release target, must carry the sha512 and
 * size the manifest froze at prepare: publish ships exactly the bytes that were accepted.
 * @param {{ expected: { name: string, sha512: string, size: number }[],
 *   downloaded: ({ name: string, sha512: string, size: number } | { name: string, error: string })[] } | undefined} artifacts
 */
function checkArtifacts(artifacts) {
  const name = 'artifacts match manifest'
  if (artifacts === undefined) return skip(name, 'no manifest given')
  if (artifacts.expected.length === 0) return fail(name, 'the manifest lists no artifact')
  const problems = []
  for (const want of artifacts.expected) {
    const got = artifacts.downloaded.find((d) => d.name === want.name)
    if (!got) problems.push(`${want.name}: not downloaded`)
    else if ('error' in got) problems.push(`${want.name}: ${got.error}`)
    else if (got.sha512 !== want.sha512 || got.size !== want.size)
      problems.push(
        `${want.name}: sha512/size ${got.sha512.slice(0, 12)}…/${got.size}, manifest ${want.sha512.slice(0, 12)}…/${want.size}`
      )
  }
  return problems.length === 0
    ? pass(name, `${artifacts.expected.length} file(s), sha512 and size as in the manifest`)
    : fail(name, problems.join('; '))
}

/**
 * The channel file right before it is written must be the one the checks read — same etag, or
 * still absent. Anything else means another publish ran in between. Pure; publish calls it at the
 * last moment (and the store's conditional write enforces it once more).
 * @param {{ etag?: string | null, missing?: boolean }} before
 * @param {{ etag?: string | null, missing?: boolean }} after
 */
export function checkFeedUnchanged(before, after) {
  const name = 'feed unchanged'
  const state = (f) => (f.missing ? 'absent' : `etag ${f.etag}`)
  return state(before) === state(after)
    ? pass(name, `channel file still ${state(after)}`)
    : fail(
        name,
        `channel file was ${state(before)} when checked, is ${state(after)} now — another publish ran; start over`
      )
}

/**
 * One version line per channel file a release writes (publish passes `feeds`), or the single line of
 * a hand run (`feed`).
 * @param {object} facts
 */
function checkVersions(facts) {
  if (!Array.isArray(facts.feeds)) return [checkVersion(facts.channel, facts.candidate, facts.feed)]
  return facts.feeds.map((feed) => {
    const r = checkVersion(facts.channel, facts.candidate, feed)
    return { ...r, check: `${r.check} ${feed.file}` }
  })
}

/**
 * The public keys `src/feed-key.js` pins, read from its source text; null when the list is not there.
 * @param {string} source
 * @returns {string[] | null}
 */
export function pinnedFeedKeys(source) {
  const list = /FEED_PUBLIC_KEYS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]\s*\)/.exec(String(source))
  if (!list) return null
  return [...list[1].matchAll(/['"]([A-Za-z0-9+/=]+)['"]/g)].map((x) => x[1])
}

/**
 * Each channel file publish is about to write must verify, with the signature it signed, against
 * the keys the candidate pins (src/feed-key.js at its sha): a build whose pinned keys do not match the
 * signing key would refuse every update it is offered — and that build could never be fixed by an update.
 * @param {object} facts - `feedSignatures` ({ file, yml, signature }[]) and `pinnedKeys` (string[] | null).
 */
function checkFeedSignatures(facts) {
  if (!Array.isArray(facts.feedSignatures)) return []
  return facts.feedSignatures.map(({ file, yml, signature }) => {
    const name = `feed signature ${file}`
    if (!Array.isArray(facts.pinnedKeys))
      return fail(name, 'cannot read the feed keys the candidate pins (src/feed-key.js at its sha)')
    if (facts.pinnedKeys.length === 0)
      return fail(
        name,
        'the candidate pins no feed key (src/feed-key.js): it would refuse every update — pin the key first'
      )
    const verdict = verifyFeed({ channelFile: file, text: yml, signature, publicKeys: facts.pinnedKeys })
    return verdict.ok
      ? pass(name, `Ed25519, verified with the ${facts.pinnedKeys.length} key(s) the candidate pins`)
      : fail(name, `the signing key is not one this build pins — ${verdict.reason}`)
  })
}

/**
 * The app inside a Windows installer or a Linux AppImage / .deb (build/payload.mjs). These builds are
 * not code-signed (decision D1, tasks/todo-desktop-windows.md): what makes an update trusted is the
 * signed channel file, and this line checks that the app behind it is the one the manifest says.
 * @param {'stable' | 'dev'} channel
 * @param {{ skipped: string } | { error: string } | ReturnType<typeof readPayload>} payload
 * @param {string} updateFeed
 * @param {{ name: string, expectArch: string, version: string | null }} which
 */
function checkPayload(channel, payload, updateFeed, which) {
  const { name } = which
  if ('skipped' in payload) return skip(name, payload.skipped)
  if ('error' in payload) return fail(name, payload.error)
  const want = CHANNELS[channel]
  const problems = []
  if (payload.version !== which.version)
    problems.push(`version ${payload.version ?? '(none)'}, expected ${which.version}`)
  if (payload.arch !== which.expectArch)
    problems.push(`binary arch ${payload.arch ?? '(unknown)'}, expected ${which.expectArch}`)
  if (payload.origin !== want.origin)
    problems.push(`pinned origin ${payload.origin || '(none)'}, expected ${want.origin}`)
  if (payload.updateChannel !== channel)
    problems.push(`update channel ${payload.updateChannel || '(none)'}, expected ${channel}`)
  if (payload.updateFeed !== updateFeed)
    problems.push(`update feed ${payload.updateFeed || '(none)'}, expected ${updateFeed}`)
  problems.push(...fuseProblems(payload.fuses))
  if (payload.debugGuard !== true)
    problems.push(
      'main.js does not refuse remote-debugging switches before anything else (src/debug-switches.js)'
    )
  return problems.length === 0
    ? pass(
        name,
        `${which.version}, ${which.expectArch}, ${want.origin}, feed ${updateFeed}, fuses hardened, refuses remote debugging; not code-signed (D1): trusted through the signed feed`
      )
    : fail(name, problems.join('; '))
}

/** One payload line per Windows / Linux artifact (`facts.payloads`, from publish). */
function checkPayloads(facts) {
  return (facts.payloads ?? []).map((p) =>
    checkPayload(facts.channel, p.payload, facts.updateFeed ?? updateChannel.feedFor(facts.channel), {
      name: `payload ${p.artifact}`,
      expectArch: p.expectArch,
      version: facts.candidate.version
    })
  )
}

/**
 * Judge a release candidate. Every check runs, so one report names every problem at once.
 * @param {object} facts - see `gatherFacts` for the shape.
 * @returns {{ check: string, status: 'PASS' | 'FAIL' | 'SKIP', detail: string }[]}
 */
export function preflight(facts) {
  return [
    checkTree(facts.tree),
    checkAncestry(facts.sha, facts.ancestry),
    checkCi(facts.sha, facts.ci),
    ...checkVersions(facts),
    checkNotes(facts.notes),
    checkThirdParty(facts.notes),
    checkContract(facts.contract),
    ...checkSignatures(facts),
    ...checkPayloads(facts),
    ...checkFeedSignatures(facts),
    checkArtifacts(facts.artifacts)
  ]
}

// ── side-effect half ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string, stderr: string }} both streams, success or not: codesign
 *   and spctl print what they found on stderr even when they succeed.
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) return { ok: false, stdout: '', stderr: result.error.message }
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** @param {string} source - a URL or a local file. */
async function readFeed(source) {
  if (/^https?:\/\//.test(source)) {
    try {
      const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (response.status === 404) return { url: source, missing: true }
      if (!response.ok) return { url: source, error: `HTTP ${response.status}` }
      return { url: source, text: await response.text() }
    } catch (error) {
      return { url: source, error: String(error?.cause?.message ?? error?.message ?? error) }
    }
  }
  // Only an HTTP 404 means "nothing published yet": a local file named on purpose and absent is a typo.
  if (!existsSync(source)) return { url: source, error: 'no such file' }
  return { url: source, text: readFileSync(source, 'utf8') }
}

/**
 * @param {string} app - path to the .app.
 * @param {string} [container] - the dmg it came out of, judged as a container (signature, notarization, staple).
 */
function readSignature(app, container) {
  // codesign and spctl print what they found on stderr.
  const verify = run('codesign', ['--verify', '--deep', '--strict', app], '.')
  const info = run('codesign', ['-dv', '--verbose=2', app], '.')
  const spctl = run('spctl', ['-a', '-vvv', '-t', 'exec', app], '.')
  const stapler = run('xcrun', ['stapler', 'validate', app], '.')
  const plist = run(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')],
    '.'
  )
  const resource = (name) => {
    try {
      return readFileSync(path.join(app, 'Contents/Resources/app', name), 'utf8').trim()
    } catch {
      return ''
    }
  }
  // The arch(s) of the main binary: `lipo -archs` prints e.g. `x86_64 arm64` for a universal app.
  const executable = run(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleExecutable', path.join(app, 'Contents/Info.plist')],
    '.'
  ).stdout.trim()
  const lipo = executable ? run('lipo', ['-archs', path.join(app, 'Contents/MacOS', executable)], '.') : null
  let updateFeed = ''
  try {
    updateFeed =
      updateChannel.feedOf(readFileSync(path.join(app, 'Contents/Resources/app-update.yml'), 'utf8')) ?? ''
  } catch {}
  return {
    codesignVerify: { ok: verify.ok, output: verify.stderr },
    codesignInfo: `${info.stdout}${info.stderr}`,
    spctl: `${spctl.stdout}${spctl.stderr}`,
    stapler: { ok: stapler.ok, output: `${stapler.stdout}${stapler.stderr}` },
    bundleId: plist.stdout.trim(),
    origin: resource('origin'),
    updateChannel: resource('update-channel'),
    updateFeed,
    container: container ? readContainer(container) : undefined,
    debugGuard: debugGuardFirst(resource('src/main.js')) && resource('src/debug-switches.js') !== '',
    fuses: (() => {
      try {
        return readAppFuses(app)
      } catch {
        return undefined
      }
    })(),
    archs: lipo?.ok ? lipo.stdout.trim().split(/\s+/) : []
  }
}

/** @param {string} dmg - Gatekeeper's verdict on a downloaded disk image, and its stapled ticket. */
export function readContainer(dmg) {
  const spctl = run('spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', dmg], '.')
  const stapler = run('xcrun', ['stapler', 'validate', dmg], '.')
  return {
    spctl: `${spctl.stdout}${spctl.stderr}`,
    stapler: { ok: stapler.ok, output: `${stapler.stdout}${stapler.stderr}` }
  }
}

/**
 * Build the facts `preflight` judges, from the repo at `options.cwd` and the network.
 * @param {{
 *   channel: 'stable' | 'dev', sha?: string, version?: string, buildId?: string, feed?: string,
 *   origin?: string, notes?: string, artifact?: string, repo?: string, fetch?: boolean, cwd?: string,
 *   updateFeed?: string,
 *   apps?: { artifact: string, expectArchs: string[], app?: string, container?: string, signature?: { error: string } | { skipped: string } }[],
 *   payloads?: { artifact: string, expectArch: string, root?: string, payload?: { error: string } | { skipped: string } }[],
 *   feedRead?: { url: string, text?: string, missing?: boolean, error?: string },
 *   feedReads?: { file: string, url: string, text?: string, missing?: boolean }[],
 *   feedSignatures?: { file: string, yml: string, signature: string }[],
 *   artifacts?: { expected: object[], downloaded: object[] }
 * }} options - `feedReads`, `feedSignatures`, `payloads` and `artifacts` come from `build/release.mjs
 *   publish`, which reads every channel file, signs it, and downloads the artifacts from the release
 *   target itself.
 */
export async function gatherFacts(options) {
  const { channel } = options
  const want = CHANNELS[channel]
  const root = run('git', ['rev-parse', '--show-toplevel'], options.cwd ?? process.cwd()).stdout.trim()
  // A failed fetch leaves origin/* where it was: judging ancestry against that would be stale.
  const fetched =
    options.fetch === false
      ? { ok: true }
      : run('git', ['fetch', '--quiet', 'origin', 'main', 'develop'], root)

  const resolved = run('git', ['rev-parse', '--verify', `${options.sha ?? 'HEAD'}^{commit}`], root)
  const sha = resolved.ok ? resolved.stdout.trim() : (options.sha ?? 'HEAD')
  const atSha = (file) => {
    const shown = run('git', ['show', `${sha}:${PACKAGE_DIR}/${file}`], root)
    return shown.ok ? shown.stdout : null
  }

  const ancestry = !resolved.ok
    ? { branch: want.branch, isAncestor: false, error: `${sha} is not a commit in this repo` }
    : !fetched.ok
      ? { branch: want.branch, isAncestor: false, error: `git fetch origin failed: ${fetched.stderr.trim()}` }
      : {
          branch: want.branch,
          isAncestor: run('git', ['merge-base', '--is-ancestor', sha, want.branch], root).ok
        }

  const repo =
    options.repo ??
    run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], root).stdout.trim()
  const runs = run(
    'gh',
    ['api', `repos/${repo}/actions/workflows/${CI_WORKFLOW}/runs?head_sha=${sha}&per_page=100`],
    root
  )
  let ci
  try {
    ci = runs.ok ? { runs: JSON.parse(runs.stdout).workflow_runs ?? null } : { error: runs.stderr.trim() }
  } catch {
    ci = { error: 'gh api answered something that is not JSON' }
  }

  /** Parse JSON from `text`, or say why not — a broken file is a finding, not a crash. */
  const parsed = (text, what) => {
    try {
      return { value: JSON.parse(text) }
    } catch (error) {
      return { error: `${what} is not JSON: ${error.message}` }
    }
  }

  let candidate
  if (options.version) candidate = { version: options.version, buildId: options.buildId ?? null }
  else {
    const pkg = atSha('package.json')
    const read =
      pkg === null
        ? { error: `no ${PACKAGE_DIR}/package.json at ${sha.slice(0, 10)}` }
        : parsed(pkg, 'package.json')
    candidate =
      typeof read.value?.version === 'string'
        ? { version: read.value.version, buildId: options.buildId ?? null }
        : { version: null, buildId: null, error: read.error ?? 'package.json has no version' }
  }

  const origin = options.origin ?? want.origin
  const contractText = atSha('server-contract.json')
  const contractJson = contractText === null ? null : parsed(contractText, 'server-contract.json')
  let contract
  if (contractJson === null)
    contract = { origin, error: `${sha.slice(0, 10)} has no ${PACKAGE_DIR}/server-contract.json` }
  else if (contractJson.error) contract = { origin, error: contractJson.error }
  else
    contract = {
      origin,
      results: await checkServerContract(origin, contractJson.value, { scope: 'packaged' })
    }

  // From publish: the unpacked Windows / Linux app of every such artifact, read here (or the verdict
  // publish gave one it could not unpack).
  const payloads = options.payloads?.map((p) => {
    let payload = p.payload
    if (!payload) {
      try {
        payload = readPayload(p.root)
      } catch (error) {
        payload = { error: `cannot read the app in ${p.artifact}: ${error.message}` }
      }
    }
    return { artifact: p.artifact, expectArch: p.expectArch, payload }
  })
  // The feed keys the candidate pins, as its sha has them: the signature publish made must verify with them.
  const keySource = options.feedSignatures ? atSha('src/feed-key.js') : null
  const pinnedKeys = keySource === null ? null : pinnedFeedKeys(keySource)

  // From publish: the app opened out of every artifact (or the verdict publish gave one it could not open).
  const signatures = options.apps?.map((a) => ({
    artifact: a.artifact,
    expectArchs: a.expectArchs,
    signature: a.signature ?? readSignature(a.app, a.container)
  }))
  let signature
  if (!options.artifact) signature = { skipped: 'no --artifact given' }
  else if (process.platform !== 'darwin') signature = { skipped: 'codesign/spctl need macOS' }
  // Named on purpose and absent is a typo or a lost build — a failure, never "not checked".
  else if (!existsSync(options.artifact)) signature = { error: `no app at ${options.artifact}` }
  else signature = readSignature(options.artifact)

  let notes = null
  if (options.notes) {
    try {
      notes = { text: readFileSync(options.notes, 'utf8') }
    } catch (error) {
      notes = { error: `cannot read ${options.notes}: ${error.code ?? error.message}` }
    }
  }

  return {
    channel,
    sha,
    updateFeed: options.updateFeed ?? updateChannel.feedFor(channel),
    tree: { porcelain: run('git', ['status', '--porcelain'], root).stdout },
    ancestry,
    ci,
    candidate,
    feed:
      options.feedRead ??
      (await readFeed(options.feed ?? `${updateChannel.feedFor(channel)}/${channel}-mac.yml`)),
    notes,
    contract,
    signature,
    signatures,
    payloads,
    feeds: options.feedReads,
    feedSignatures: options.feedSignatures,
    pinnedKeys,
    artifacts: options.artifacts
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage =
    'usage: release-preflight.mjs --channel stable|dev [--sha <rev>] [--version <v>] [--build-id <id>]\n' +
    '         [--feed <url|file>] [--origin <url>] [--notes <file>] [--artifact <app>] [--repo <owner/name>] [--no-fetch]\n' +
    '         [--update-feed <url>]   the feed the app must name (default: the feed of the channel)\n'
  const text = { type: 'string' }
  let values
  try {
    // Strict: a mistyped option must stop the run, not fall back to a default such as the real feed.
    ;({ values } = parseArgs({
      options: {
        channel: text,
        sha: text,
        version: text,
        'build-id': text,
        feed: text,
        origin: text,
        notes: text,
        artifact: text,
        repo: text,
        'update-feed': text,
        'no-fetch': { type: 'boolean' }
      },
      strict: true,
      allowPositionals: false
    }))
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}`)
    process.exit(2)
  }
  const { channel } = values
  if (!Object.hasOwn(CHANNELS, channel ?? '')) {
    process.stderr.write(usage)
    process.exit(2)
  }
  if (values.origin !== undefined && !/^https?:\/\/[^/\s]+$/.test(values.origin)) {
    process.stderr.write(`--origin must be an origin like https://cowork.tracy.site, got: ${values.origin}\n`)
    process.exit(2)
  }
  const facts = await gatherFacts({
    channel,
    sha: values.sha,
    version: values.version,
    buildId: values['build-id'],
    feed: values.feed,
    origin: values.origin,
    notes: values.notes,
    artifact: values.artifact,
    repo: values.repo,
    updateFeed: values['update-feed'],
    fetch: !values['no-fetch']
  })
  process.stdout.write(`preflight ${channel} ${facts.candidate.version} at ${facts.sha.slice(0, 10)}\n`)
  const results = preflight(facts)
  for (const r of results) process.stdout.write(`${r.status.padEnd(4)}  ${r.check} — ${r.detail}\n`)
  const count = (status) => results.filter((r) => r.status === status).length
  process.stdout.write(`${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} not checked\n`)
  process.exit(count('FAIL') === 0 ? 0 : 1)
}
