#!/usr/bin/env node
/**
 * Batch content-contract capture for every template that has a Design inspiration card.
 *
 * WHY: a Joomla or WordPress site built from a card template with no contract profile for the
 * release's version falls back to `tracy-apple/j6/1.1.0`, and `content.read` answers 503 (#722).
 * `quickstart-contract` makes ONE profile per run on a DDEV stand; this tool makes all the
 * missing ones on disposable Docker stands, with the same capture scripts and the same bind
 * proof, and delivers only the profiles that pass it.
 *
 *   discover        list the card releases and which of them have no profile at --baseline
 *   capture         restore, capture twice, bind-test, gate and PLACE the profiles that pass
 *   verify          do it all again from the release and compare byte for byte with the tree
 *   verify-report   check a `verify` report against the tree, the notes, the journal, git and Docker
 *   render-notes    write the Vietnamese notes table from a report
 *
 * The list of templates is never kept here: it is re-derived from the releases on every run
 * (published, not a draft, a valid `tracy_design_inspiration.json`, no
 * `tracy_design_inspiration_hidden.json`). `--without-card <tag,…>` admits the named releases that
 * have no card yet (a contract comes before the card); every other rule still applies to them.
 * Nothing here pushes, uploads, commits or releases.
 *
 * Every stand is its own Compose project taken from a declared pool (`--project-prefix`,
 * `--project-capacity`); a project name with anything already running under it is refused, and
 * only projects this run started are ever taken down.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline as streamPipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateDesignInspiration, validateSetting } from '../../../apps/tracy-web/src/lib/tracy-setting.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '../../..')
export const DEFAULT_REPO = 'JoomlArt-Products/joomlart-products'
export const CARD_FILE = 'tracy_design_inspiration.json'
export const HIDDEN_FILE = 'tracy_design_inspiration_hidden.json'
export const SETTING_FILE = 'tracy_setting.json'

export const PLATFORMS = Object.freeze({
  joomla: {
    suffix: 'j6',
    contracts: 'packages/cms/tracy-joomla-quickstart/contracts',
    cowork: 'joomla/cowork'
  },
  wordpress: {
    suffix: 'wp7',
    contracts: 'packages/cms/tracy-wordpress-quickstart/contracts',
    cowork: 'wordpress/cowork'
  }
})

// ───────────────────────────── errors ─────────────────────────────

/**
 * `blocked`: the release cannot be turned into a profile by this tool, and the reason is exact.
 * `failed`: a step ran and gave the wrong answer. `unknown`: the environment (network, Docker,
 * time) did not let a step finish — never a pass, never a verdict on the release.
 */
export class StepError extends Error {
  constructor(kind, step, message, detail = {}) {
    super(`${step}: ${message}`)
    this.kind = kind
    this.step = step
    this.detail = detail
  }
}
const blocked = (step, message, detail) => new StepError('blocked', step, message, detail)
const failed = (step, message, detail) => new StepError('failed', step, message, detail)
const unknown = (step, message, detail) => new StepError('unknown', step, message, detail)

// ───────────────────────────── options ─────────────────────────────

const COMMON = {
  baseline: { type: 'string', default: 'HEAD' },
  platform: { type: 'string', default: 'all' },
  repo: { type: 'string', default: DEFAULT_REPO },
  'without-card': { type: 'string' },
  only: { type: 'string' },
  pilot: { type: 'string' },
  jobs: { type: 'string', default: '2' },
  'project-prefix': { type: 'string' },
  'project-capacity': { type: 'string', default: '40' },
  'template-timeout-seconds': { type: 'string', default: '1200' },
  'cowork-source': { type: 'string' },
  'cowork-version': { type: 'string' },
  artifacts: { type: 'string' },
  scratch: { type: 'string' },
  cache: { type: 'string' },
  report: { type: 'string' },
  design: { type: 'string' },
  'baseline-evidence': { type: 'boolean', default: false },
  'keep-scratch': { type: 'boolean', default: false }
}
const OPTIONS = {
  discover: {
    baseline: COMMON.baseline,
    platform: COMMON.platform,
    repo: COMMON.repo,
    'without-card': COMMON['without-card'],
    report: COMMON.report
  },
  capture: COMMON,
  verify: COMMON,
  'verify-report': {
    baseline: COMMON.baseline,
    report: { type: 'string' },
    notes: { type: 'string' },
    journal: { type: 'string' },
    'project-prefix': { type: 'string' },
    scratch: { type: 'string' },
    'require-staged': { type: 'boolean', default: false },
    'require-cleanup': { type: 'boolean', default: false }
  },
  'render-notes': { report: { type: 'string' }, out: { type: 'string' }, append: { type: 'string' } }
}

const posInt = (name, value, min, max, errors) => {
  if (!/^\d+$/.test(String(value))) {
    errors.push(`--${name} must be a whole number, got ${JSON.stringify(value)}`)
    return null
  }
  const n = Number(value)
  if (n < min || n > max) errors.push(`--${name} must be between ${min} and ${max}, got ${n}`)
  return n
}

/**
 * Every way the command line can be wrong, as sentences, before anything is touched.
 * @returns {{ errors: string[], value: Record<string, any> }}
 */
export function validateOptions(command, values) {
  const errors = []
  const v = { ...values }
  if (!OPTIONS[command]) return { errors: [`unknown command ${JSON.stringify(command)}`], value: v }
  if ('platform' in OPTIONS[command]) {
    if (!['all', ...Object.keys(PLATFORMS)].includes(v.platform))
      errors.push(`--platform must be all, joomla or wordpress, got ${JSON.stringify(v.platform)}`)
  }
  if (v.baseline !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v.baseline))
    errors.push(`--baseline must be a git ref, got ${JSON.stringify(v.baseline)}`)
  if (v.repo !== undefined && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.repo))
    errors.push(`--repo must be OWNER/NAME, got ${JSON.stringify(v.repo)}`)
  if (v['without-card'] !== undefined && v['without-card'].split(',').some((t) => parseTag(t) === null))
    errors.push('--without-card must be a comma list of release tags such as quickstart/ja-fresco/j6')
  if (command === 'capture' || command === 'verify') {
    v.jobsN = posInt('jobs', v.jobs, 1, 4, errors)
    v.capacityN = posInt('project-capacity', v['project-capacity'], 1, 99, errors)
    v.timeoutN = posInt('template-timeout-seconds', v['template-timeout-seconds'], 60, 6 * 3600, errors)
    if (!v['project-prefix'] || !/^[a-z][a-z0-9-]{2,30}$/.test(v['project-prefix']))
      errors.push('--project-prefix must be 3-31 characters of a-z, 0-9 and -, starting with a letter')
    if (v.jobsN && v.capacityN && v.jobsN > v.capacityN)
      errors.push('--jobs cannot exceed --project-capacity')
    for (const req of ['cowork-source', 'artifacts']) {
      if (!v[req]) errors.push(`--${req} is required`)
      else if (!path.isAbsolute(v[req])) errors.push(`--${req} must be an absolute path`)
    }
    if (v.scratch && !path.isAbsolute(v.scratch)) errors.push('--scratch must be an absolute path')
    if (v.cache && !path.isAbsolute(v.cache)) errors.push('--cache must be an absolute path')
    if (v.report && !path.isAbsolute(v.report)) errors.push('--report must be an absolute path')
    if (
      v.design !== undefined &&
      !/^[a-z][a-z0-9-]*=(null|[a-z][a-z0-9-]*)(,[a-z][a-z0-9-]*=(null|[a-z][a-z0-9-]*))*$/.test(v.design)
    )
      errors.push('--design must be slug=null or slug=<catalogue id>, comma separated')
    if (v['cowork-version'] && !/^\d+\.\d+\.\d+$/.test(v['cowork-version']))
      errors.push('--cowork-version must look like 0.20.3')
    for (const list of ['only', 'pilot'])
      if (v[list] !== undefined) {
        const names = v[list].split(',')
        if (names.some((n) => !/^[a-z][a-z0-9-]*$/.test(n)))
          errors.push(`--${list} must be a comma list of template slugs`)
      }
  }
  if (command === 'verify-report') {
    for (const req of ['report', 'notes', 'journal']) if (!v[req]) errors.push(`--${req} is required`)
  }
  if (command === 'render-notes')
    for (const req of ['report', 'out']) if (!v[req]) errors.push(`--${req} is required`)
  return { errors, value: v }
}

// ───────────────────────────── process runner ─────────────────────────────

const children = new Set()
/** Work started under `cancelScope.run({ signal }, fn)` has every command it starts killed when the signal aborts. */
export const cancelScope = new AsyncLocalStorage()
const secrets = new Set()
/** Secrets are masked in every log line and error text. */
export const redact = (text) => {
  let out = String(text)
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('«secret»')
  return out
}
const excerpt = (text, n = 1500) => {
  const t = redact(text).trim()
  return t.length <= n ? t : `${t.slice(0, n / 2)}\n…\n${t.slice(-n / 2)}`
}

/**
 * Run one command with arguments as an array (never through a shell).
 * `stdinFile`/`stdoutFile` stream a file; `input` is a string/buffer; output is capped at `maxBytes`.
 * Resolves `{ code, signal, stdout, stderr, timedOut }`; rejects only when the process cannot start.
 */
export function run(cmd, args, o = {}) {
  return new Promise((resolve, reject) => {
    const cancel = o.signal ?? cancelScope.getStore()?.signal
    if (cancel?.aborted)
      return reject(Object.assign(new Error('cancelled before it started'), { cancelled: true }))
    const stdin = o.stdinFile || o.input !== undefined ? 'pipe' : 'ignore'
    const child = spawn(cmd, args, {
      cwd: o.cwd,
      env: { ...process.env, ...o.env },
      stdio: [stdin, 'pipe', 'pipe']
    })
    children.add(child)
    // A file sink has no cap unless the caller names one; captured output always has one.
    const max = o.maxBytes ?? (o.stdoutFile ? Infinity : 64 * 1024 * 1024)
    const out = []
    const err = []
    let outBytes = 0
    let errBytes = 0
    let timedOut = false
    let overflow = false
    let cancelled = false
    let ioError = null
    const fail = (e) => {
      ioError ??= e
      child.kill('SIGKILL')
    }
    const onAbort = () => {
      cancelled = true
      child.kill('SIGKILL')
    }
    cancel?.addEventListener('abort', onAbort, { once: true })
    const timer = o.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, o.timeoutMs)
      : null
    let sinkDone = Promise.resolve()
    if (o.stdoutFile) {
      // pipeline: backpressure, and a write error (disk full) comes back to the caller.
      const cap = new Transform({
        transform(chunk, _enc, cb) {
          outBytes += chunk.length
          if (outBytes > max) {
            overflow = true
            child.kill('SIGKILL')
            return cb(new Error('output over its cap'))
          }
          cb(null, chunk)
        }
      })
      sinkDone = streamPipeline(child.stdout, cap, createWriteStream(o.stdoutFile, { mode: 0o600 })).catch(
        (e) => {
          if (!overflow) fail(e)
        }
      )
    } else {
      child.stdout.on('data', (d) => {
        outBytes += d.length
        if (outBytes > max) {
          overflow = true
          child.kill('SIGKILL')
          return
        }
        out.push(d)
      })
    }
    child.stderr.on('data', (d) => {
      errBytes += d.length
      if (errBytes <= 4 * 1024 * 1024) err.push(d)
    })
    // The input is streamed with pipeline too: its end, or its failure, is awaited before the command
    // may be reported. A read error is ours (fail); the command closing its stdin first is its own choice
    // and is reported as `stdinClosedEarly`, which `must` turns into a failure on a "successful" exit.
    let stdinClosedEarly = false
    let stdinDone = Promise.resolve()
    if (stdin === 'pipe') {
      const source = o.stdinFile ? createReadStream(o.stdinFile) : Readable.from(Buffer.from(o.input))
      stdinDone = streamPipeline(source, child.stdin).catch((e) => {
        if (['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED', 'ECONNRESET'].includes(e.code))
          stdinClosedEarly = true
        else fail(e)
      })
    }
    const done = () => {
      children.delete(child)
      if (timer) clearTimeout(timer)
      cancel?.removeEventListener('abort', onAbort)
    }
    child.on('error', (e) => {
      done()
      reject(e)
    })
    child.on('close', async (code, signal) => {
      done()
      await Promise.all([sinkDone, stdinDone])
      if (cancelled) return reject(Object.assign(new Error('cancelled'), { cancelled: true }))
      if (ioError) return reject(Object.assign(new Error(`i/o failed: ${ioError.message}`), { io: true }))
      resolve({
        code,
        signal,
        timedOut,
        overflow,
        stdinClosedEarly,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8')
      })
    })
  })
}

/** `run`, but a non-zero exit, a timeout or an overflow is a StepError naming the step. */
export async function must(step, cmd, args, o = {}) {
  let r
  try {
    r = await run(cmd, args, o)
  } catch (e) {
    throw unknown(step, e.io || e.cancelled ? `${cmd}: ${e.message}` : `could not start ${cmd}: ${e.message}`)
  }
  if (r.timedOut)
    throw unknown(step, `${cmd} did not finish in ${Math.round((o.timeoutMs ?? 0) / 1000)}s`, {
      stderr: excerpt(r.stderr)
    })
  if (r.overflow) throw failed(step, `${cmd} printed more than ${o.maxBytes ?? 64 * 1024 * 1024} bytes`)
  if (r.code === 0 && r.stdinClosedEarly)
    throw failed(
      step,
      `${cmd} closed its input before it was all sent, so the input cannot be taken as consumed`
    )
  if (r.code !== 0)
    throw failed(
      step,
      `${cmd} ${redact(args.slice(0, 3).join(' '))} exited ${r.code}: ${excerpt(r.stderr || r.stdout, 800)}`,
      {
        stderr: excerpt(r.stderr),
        stdout: o.stdoutFile ? '' : excerpt(r.stdout)
      }
    )
  return r
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256File = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('error', reject)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
  })

class TargetLog {
  constructor(file) {
    this.file = file
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '')
  }
  line(text) {
    appendFileSync(this.file, `${new Date().toISOString()} ${redact(text)}\n`)
  }
}

// ───────────────────────────── GitHub: discovery ─────────────────────────────

/** `gh api` with a bounded retry; network and rate-limit failures are `unknown`, never an empty answer. */
export async function ghApi(endpoint, { accept, attempts = 4, stdoutFile, maxBytes } = {}) {
  const args = ['api', endpoint]
  if (accept) args.push('-H', `Accept: ${accept}`)
  let last
  for (let i = 1; i <= attempts; i++) {
    let r
    try {
      r = await run('gh', args, { stdoutFile, maxBytes, timeoutMs: stdoutFile ? 30 * 60_000 : 120_000 })
    } catch (e) {
      throw unknown('github', e.io || e.cancelled ? `gh: ${e.message}` : `gh cannot start: ${e.message}`)
    }
    if (r.code === 0 && !r.timedOut && !r.overflow) return stdoutFile ? null : r.stdout
    last = r.timedOut ? 'timed out' : excerpt(r.stderr || r.stdout, 300)
    // A 404 is an answer, not a flake: do not retry it.
    if (/HTTP 404/.test(last)) throw unknown('github', `${endpoint}: ${last}`)
    await sleep(800 * i)
  }
  throw unknown('github', `${endpoint} failed after ${attempts} tries: ${last}`)
}

/**
 * Every release of the repository, page by page. Completeness is proved, not assumed: the listing
 * ends on a page shorter than `perPage`, and a duplicate release id or tag is an error.
 */
export async function listReleases(repo, api = ghApi, perPage = 100) {
  const all = []
  const seen = new Set()
  for (let page = 1; page <= 100; page++) {
    const batch = JSON.parse(await api(`repos/${repo}/releases?per_page=${perPage}&page=${page}`))
    if (!Array.isArray(batch)) throw unknown('github', `page ${page} of the release list is not an array`)
    for (const r of batch) {
      if (seen.has(r.id) || seen.has(r.tag_name))
        throw unknown('github', `the release list repeats ${r.tag_name} (id ${r.id}) — paging moved under us`)
      seen.add(r.id)
      seen.add(r.tag_name)
    }
    all.push(...batch)
    if (batch.length < perPage) return all
  }
  throw unknown('github', 'the release list did not end within 100 pages; completeness is unknown')
}

/** `quickstart/ja-essence/j6` → `{ slug: 'ja-essence', platform: 'joomla' }`; null when out of scope. */
export function parseTag(tag) {
  const m = /^(?:quickstart\/)?([a-z][a-z0-9-]*)\/(j6|wp7)$/.exec(String(tag))
  if (!m) return null
  const platform = m[2] === 'j6' ? 'joomla' : 'wordpress'
  return { slug: m[1], platform }
}

const assetDigest = (a) => {
  const m = /^sha256:([a-f0-9]{64})$/.exec(a.digest ?? '')
  return m ? m[1] : null
}

/**
 * Decide, release by release, whether it is a card release in scope, and why not otherwise.
 * `readAsset(asset)` returns the text of a small asset.
 * A release that is public with a card but whose card or setting cannot be used is `broken`, never
 * dropped: it stays in the count as a blocked row. Pre-releases are in scope (78 of the 91 j6/wp7
 * releases are marked so; the card, not the flag, is what makes a template one of ours).
 * A tag in `withoutCard` is admitted with no card (`cardless: true`); a card it does carry is still read.
 * @returns {Promise<{ cards: object[], excluded: object[], broken: object[] }>}
 */
export async function selectCards(releases, readAsset, platforms, withoutCard = new Set()) {
  const cards = []
  const excluded = []
  const broken = []
  for (const rel of releases) {
    const scope = parseTag(rel.tag_name)
    if (!scope) {
      excluded.push({
        tag: rel.tag_name,
        reason: 'out of scope: not a Joomla (j6) or WordPress (wp7) release'
      })
      continue
    }
    if (!platforms.includes(scope.platform)) continue
    if (rel.draft) {
      excluded.push({ tag: rel.tag_name, reason: 'draft' })
      continue
    }
    const assets = rel.assets ?? []
    const names = assets.map((a) => a.name)
    const cardless = !names.includes(CARD_FILE)
    if (cardless && !withoutCard.has(rel.tag_name)) {
      excluded.push({ tag: rel.tag_name, reason: 'no card' })
      continue
    }
    if (names.includes(HIDDEN_FILE)) {
      excluded.push({ tag: rel.tag_name, reason: 'card hidden' })
      continue
    }
    let card
    let setting
    try {
      if (!cardless) card = JSON.parse(await readAsset(assets.find((a) => a.name === CARD_FILE)))
    } catch (e) {
      if (e instanceof StepError) throw e
      broken.push({
        tag: rel.tag_name,
        slug: scope.slug,
        platform: scope.platform,
        reason: `card is not JSON: ${e.message}`
      })
      continue
    }
    const cardProblems = cardless ? [] : validateDesignInspiration(card)
    if (cardProblems.length > 0) {
      broken.push({
        tag: rel.tag_name,
        slug: scope.slug,
        platform: scope.platform,
        reason: `invalid card: ${cardProblems.join('; ')}`
      })
      continue
    }
    if (!names.includes(SETTING_FILE)) {
      broken.push({
        tag: rel.tag_name,
        slug: scope.slug,
        platform: scope.platform,
        reason: `card without ${SETTING_FILE}`
      })
      continue
    }
    try {
      setting = JSON.parse(await readAsset(assets.find((a) => a.name === SETTING_FILE)))
    } catch (e) {
      if (e instanceof StepError) throw e
      broken.push({
        tag: rel.tag_name,
        slug: scope.slug,
        platform: scope.platform,
        reason: `${SETTING_FILE} is not JSON: ${e.message}`
      })
      continue
    }
    const digests = new Map(assets.filter((a) => assetDigest(a)).map((a) => [a.name, assetDigest(a)]))
    const settingProblems = validateSetting(setting, { assets: names, digests })
    if (settingProblems.length === 0 && setting.platform !== scope.platform)
      settingProblems.push(`setting platform ${setting.platform} does not match the tag`)
    if (settingProblems.length > 0) {
      broken.push({
        tag: rel.tag_name,
        slug: scope.slug,
        platform: scope.platform,
        reason: `invalid ${SETTING_FILE}: ${settingProblems.join('; ')}`
      })
      continue
    }
    cards.push({
      tag: rel.tag_name,
      slug: scope.slug,
      platform: scope.platform,
      version: setting.version,
      label: setting.label,
      cms: setting.cms,
      template: setting.template ?? null,
      shape: Object.keys(setting.install)
        .filter((k) => k !== 'cowork')
        .sort()
        .join('+'),
      install: setting.install,
      prerelease: rel.prerelease === true,
      ...(cardless ? { cardless: true } : {}),
      releaseId: rel.id,
      assets: Object.fromEntries(
        assets.map((a) => [
          a.name,
          { id: a.id, size: a.size, sha256: assetDigest(a), updatedAt: a.updated_at }
        ])
      )
    })
  }
  return { cards, excluded, broken }
}

/** Versions of a design that have a profile at `baseline` (read from git, not from the disk). */
export async function profilesAt(baseline, platform, slug) {
  const suffix = PLATFORMS[platform].suffix
  const dir = `${PLATFORMS[platform].contracts}/${slug}/${suffix}`
  // Recursive: a version folder counts only when it holds a manifest.json. A folder with nothing but
  // measurements (design-system-measurement.json, written before any contract) is not a profile.
  const r = await run('git', ['ls-tree', '-r', '--name-only', `${baseline}:${dir}`], { cwd: REPO_ROOT })
  // With a valid baseline (checked by `discover`), only a path that is not in it means "no profile yet".
  if (r.code !== 0) {
    if (
      /Not a valid object name/.test(r.stderr) &&
      (await run('git', ['rev-parse', '--verify', '--quiet', `${baseline}^{commit}`], { cwd: REPO_ROOT }))
        .code === 0
    )
      return []
    throw failed('baseline', `cannot read ${dir} at ${baseline}: ${excerpt(r.stderr, 300)}`)
  }
  return r.stdout
    .split('\n')
    .map((n) => /^(\d+\.\d+\.\d+)\/manifest\.json$/.exec(n)?.[1])
    .filter((v) => v !== undefined)
    .sort()
}

/** Each card release gets exactly one state: its version has a profile at the baseline, or not. */
export async function classify(cards, baseline, profiles = profilesAt) {
  const rows = []
  for (const c of cards) {
    const have = await profiles(baseline, c.platform, c.slug)
    rows.push({ ...c, existingVersions: have, state: have.includes(c.version) ? 'exists' : 'missing' })
  }
  return rows.sort((a, b) => a.platform.localeCompare(b.platform) || a.slug.localeCompare(b.slug))
}

export async function discover({ repo, baseline, platform, withoutCard = [], api = ghApi }) {
  const ref = await run('git', ['rev-parse', '--verify', '--quiet', `${baseline}^{commit}`], {
    cwd: REPO_ROOT
  })
  if (ref.code !== 0) throw failed('baseline', `--baseline ${baseline} is not a commit of this repository`)
  const platforms = platform === 'all' ? Object.keys(PLATFORMS) : [platform]
  const releases = await listReleases(repo, api)
  const readAsset = async (a) =>
    api(`repos/${repo}/releases/assets/${a.id}`, { accept: 'application/octet-stream' })
  for (const tag of withoutCard)
    if (!releases.some((r) => r.tag_name === tag))
      throw failed('options', `--without-card names ${tag}, which is not a release of ${repo}`)
  const { cards, excluded, broken } = await selectCards(releases, readAsset, platforms, new Set(withoutCard))
  const rows = await classify(cards, baseline)
  return { repo, baseline, releasesSeen: releases.length, platforms, rows, excluded, broken }
}

// ───────────────────────────── downloads & archives ─────────────────────────────

/** Download one release asset by id, check size and sha256, and never trust a file already on disk. */
export async function downloadAsset(repo, asset, name, dest, expectSha, api = ghApi) {
  if (!Number.isSafeInteger(asset.size) || asset.size < 0)
    throw failed('download', `${name} has no usable size in the release metadata`)
  if (existsSync(dest)) {
    const have = await sha256File(dest)
    if (have === expectSha) return dest
    rmSync(dest, { force: true })
  }
  mkdirSync(path.dirname(dest), { recursive: true })
  let last = ''
  for (let i = 1; i <= 3; i++) {
    const part = `${dest}.part`
    rmSync(part, { force: true })
    await api(`repos/${repo}/releases/assets/${asset.id}`, {
      accept: 'application/octet-stream',
      stdoutFile: part,
      maxBytes: asset.size
    })
    const size = statSync(part).size
    const digest = await sha256File(part)
    if (size === asset.size && digest === expectSha) {
      renameSync(part, dest)
      return dest
    }
    last = `size ${size}/${asset.size}, sha256 ${digest.slice(0, 12)}…/${expectSha.slice(0, 12)}…`
    rmSync(part, { force: true })
    await sleep(500 * i)
  }
  throw unknown(
    'download',
    `${name} does not match the release after 3 tries (${last}); the asset may have been replaced`
  )
}

// Python's `data` extraction filter refuses absolute paths, `..`, links that leave the folder, device
// files and FIFOs; the size and count caps come on top. A library filter, not a hand-written parser,
// wherever the Python has it (3.12+, and 3.8.17/3.9.17/3.10.12/3.11.4 backports). Older ones, such as
// the macOS system Python 3.9.6, reject the `filter` argument, so `data_member` applies the same
// policy by hand there: the same refusals, the same mode clamp, no ownership taken from the archive.
export const SAFE_EXTRACT = `
import copy, os, sys, tarfile, zipfile, stat
archive, dest, cap, max_entries = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
os.makedirs(dest, exist_ok=True)
root = os.path.realpath(dest)
def inside(p):
    r = os.path.realpath(os.path.join(root, p))
    return r == root or r.startswith(root + os.sep)
def check_name(name):
    if name.startswith('/') or '..' in name.split('/'):
        sys.exit('refused path ' + name)
if archive.endswith('.zip'):
    # ZipFile reads the whole central directory into memory when it opens, so the entry count and the
    # directory size are taken from the end record (the one ZipFile itself would trust, zip64 included)
    # and bounded before it is opened.
    with open(archive, 'rb') as fp:
        end = zipfile._EndRecData(fp)
    if not end: sys.exit('not a zip archive')
    declared, cd_size = end[zipfile._ECD_ENTRIES_TOTAL], end[zipfile._ECD_SIZE]
    if declared > max_entries: sys.exit('archive has more than %d entries' % max_entries)
    if cd_size > 512 * declared + 1024 * 1024 or cd_size > 64 * 1024 * 1024:
        sys.exit('zip central directory of %d bytes does not fit %d entries' % (cd_size, declared))
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > max_entries: sys.exit('archive has more than %d entries' % max_entries)
        total = 0
        for i in infos:
            total += i.file_size
            if total > cap: sys.exit('archive larger than the cap')
            mode = (i.external_attr >> 16) & 0xFFFF
            if mode and (stat.S_ISLNK(mode) or stat.S_ISFIFO(mode) or stat.S_ISCHR(mode) or stat.S_ISBLK(mode)):
                sys.exit('refused special entry ' + i.filename)
            if i.filename.startswith('/') or '..' in i.filename.split('/') or not inside(i.filename):
                sys.exit('refused path ' + i.filename)
        z.extractall(root)
else:
    # Pass 1 reads the headers one at a time (forgetting each) and refuses before anything is written;
    # pass 2 extracts one member at a time under the data filter (it keeps the member list, which hard links need).
    has_filter = hasattr(tarfile, 'data_filter')
    def data_member(m):
        # Mirrors tarfile.data_filter for a Python without it; paths are resolved against what is
        # already on disk, so a symlink extracted earlier cannot carry a later member outside.
        if os.path.isabs(m.name) or not inside(m.name): sys.exit('refused path ' + m.name)
        if not (m.isreg() or m.isdir() or m.issym() or m.islnk()):
            sys.exit('refused special entry ' + m.name)
        if m.issym():
            if os.path.isabs(m.linkname) or not inside(os.path.join(os.path.dirname(m.name), m.linkname)):
                sys.exit('refused link ' + m.name + ' -> ' + m.linkname)
        if m.islnk():
            if os.path.isabs(m.linkname) or not inside(m.linkname):
                sys.exit('refused link ' + m.name + ' -> ' + m.linkname)
        m = copy.copy(m)
        mode = m.mode & 0o755
        if m.isreg() or m.islnk():
            if not mode & 0o100: mode &= ~0o111
            mode |= 0o600
        elif m.isdir():
            # data_filter leaves a directory's mode alone (None); this tarfile cannot, so keep it usable.
            mode |= 0o700
        m.mode = mode
        m.uid, m.gid, m.uname, m.gname = os.geteuid(), os.getegid(), '', ''
        return m
    def walk(extract):
        count = 0
        total = 0
        with tarfile.open(archive, 'r:*') as t:
            while True:
                m = t.next()
                if m is None: break
                count += 1
                if count > max_entries: sys.exit('archive has more than %d entries' % max_entries)
                total += m.size
                if total > cap: sys.exit('archive larger than the cap')
                check_name(m.name)
                if extract and has_filter: t.extract(m, root, filter='data')
                elif extract: t.extract(data_member(m), root)
                if not extract: t.members = []
        return count
    walk(False)
    walk(True)
print(len(os.listdir(root)))
`

export const MAX_ARCHIVE_ENTRIES = 500_000

export async function safeExtract(
  archive,
  dest,
  capBytes = 8 * 1024 ** 3,
  step = 'extract',
  maxEntries = MAX_ARCHIVE_ENTRIES
) {
  const r = await run('python3', ['-c', SAFE_EXTRACT, archive, dest, String(capBytes), String(maxEntries)], {
    timeoutMs: 20 * 60_000
  })
  if (r.timedOut) throw unknown(step, `extracting ${path.basename(archive)} timed out`)
  if (r.code !== 0) throw failed(step, `refused ${path.basename(archive)}: ${excerpt(r.stderr, 400)}`)
}

// ───────────────────────────── Docker stands ─────────────────────────────

/**
 * Names `<prefix>-01 … <prefix>-NN`; one is taken for the life of one stand. A name is also claimed
 * with a lock folder (`mkdir` is atomic) so two runs of this tool never pick the same project, and a
 * name that has resources nobody here claimed is left alone for good.
 */
export class ProjectPool {
  constructor(prefix, capacity, inUse = async () => false, lockRoot = null) {
    this.names = Array.from({ length: capacity }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`)
    this.taken = new Set()
    this.skipped = []
    this.inUse = inUse
    this.lockRoot = lockRoot
    this.waiters = []
  }
  lock(name) {
    if (!this.lockRoot) return true
    mkdirSync(this.lockRoot, { recursive: true })
    const dir = path.join(this.lockRoot, name)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        mkdirSync(dir)
        writeFileSync(path.join(dir, 'pid'), String(process.pid))
        return true
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
        let pid = 0
        try {
          pid = Number(readFileSync(path.join(dir, 'pid'), 'utf8'))
        } catch {
          return false
        }
        let alive = true
        try {
          process.kill(pid, 0)
        } catch (k) {
          alive = k.code === 'EPERM'
        }
        if (alive) return false
        rmSync(dir, { recursive: true, force: true }) // a run that died holding it
      }
    }
    return false
  }
  unlock(name) {
    if (this.lockRoot) rmSync(path.join(this.lockRoot, name), { recursive: true, force: true })
  }
  async acquire() {
    for (const name of this.names) {
      if (this.taken.has(name) || this.skipped.includes(name)) continue
      if (!this.lock(name)) continue
      this.taken.add(name)
      if (await this.inUse(name)) {
        // Something is already running under this name and it is not ours: leave it alone.
        this.taken.delete(name)
        this.unlock(name)
        this.skipped.push(name)
        continue
      }
      return name
    }
    if (this.taken.size === 0)
      throw unknown(
        'pool',
        `no free compose project name in the pool (${this.skipped.length} occupied by others: ${this.skipped.join(', ')}; the rest are claimed by another run)`
      )
    await new Promise((r) => this.waiters.push(r))
    return this.acquire()
  }
  release(name) {
    this.taken.delete(name)
    this.unlock(name)
    const w = this.waiters.shift()
    if (w) w()
  }
}

async function projectResources(name) {
  const filter = `label=com.docker.compose.project=${name}`
  const found = []
  for (const args of [
    ['ps', '-a', '-q', '--filter', filter],
    ['volume', 'ls', '-q', '--filter', filter],
    ['network', 'ls', '-q', '--filter', filter]
  ]) {
    const r = await run('docker', args, { timeoutMs: 60_000 })
    if (r.code !== 0) throw unknown('docker', `docker ${args[0]} failed: ${excerpt(r.stderr, 300)}`)
    found.push(...r.stdout.split('\n').filter(Boolean))
  }
  return found
}
export const projectInUse = async (name) => (await projectResources(name)).length > 0

export const activeStands = new Map()

class Stand {
  constructor(name, dir, log) {
    this.name = name
    this.dir = dir
    this.log = log
    this.file = path.join(dir, 'compose.yml')
    this.password = randomBytes(12).toString('hex')
    secrets.add(this.password)
    // A stand belongs to the target that made it: nothing takes it down until that target confirms it
    // has stopped (processTarget sets this), whatever path the run takes to its end.
    this.ownerStopped = false
  }
  compose(args, o = {}) {
    return run('docker', ['compose', '-p', this.name, '-f', this.file, ...args], { cwd: this.dir, ...o })
  }
  async must(step, args, o = {}) {
    return must(step, 'docker', ['compose', '-p', this.name, '-f', this.file, ...args], {
      cwd: this.dir,
      ...o
    })
  }
  async down() {
    if (!activeStands.has(this.name)) return
    const r = await run(
      'docker',
      ['compose', '-p', this.name, '-f', this.file, 'down', '-v', '--remove-orphans', '-t', '3'],
      {
        cwd: this.dir,
        timeoutMs: 180_000
      }
    ).catch((e) => ({ code: 1, stderr: e.message }))
    const left = await projectResources(this.name).catch(() => ['unknown'])
    if (r.code !== 0 || left.length > 0) {
      say(this.log, `teardown of ${this.name}: exit ${r.code}, ${left.length} resource(s) left`)
      throw unknown(
        'teardown',
        `${this.name} could not be taken down completely (${left.length} resource(s) left)`
      )
    }
    activeStands.delete(this.name)
  }
}

// Stands whose target did not stop when cancelled: taking the stand away under a running target would
// be the very race this prevents, so they stay up, are named in the failures, and are never forced down.
export const heldStands = new Set()
// The whole run's shutdown (a signal) and the targets in flight, for the handler to wait on.
export const shutdown = new AbortController()
export const inflight = new Set()
export const runState = { scratch: null, keepScratch: false, unsettled: false }

export async function teardownAll() {
  const failures = []
  // Whatever is still running owns its stand: with a target undrained (or a drain that timed out) nothing
  // is taken down, and every stand left is named.
  if (runState.unsettled || inflight.size > 0) {
    for (const stand of activeStands.values())
      failures.push(`${stand.name} kept up: a target of this run is not known to have stopped`)
    return failures
  }
  for (const stand of activeStands.values()) {
    if (heldStands.has(stand) || !stand.ownerStopped) {
      failures.push(`${stand.name} kept up: its target did not stop when cancelled`)
      continue
    }
    try {
      await stand.down()
    } catch (e) {
      failures.push(e.message)
    }
  }
  return failures
}

export function joomlaCompose(password, webroot) {
  return `services:
  db:
    image: mariadb:11
    mem_limit: 768m
    command: ['--max-allowed-packet=256M']
    environment:
      MARIADB_ROOT_PASSWORD: ${password}
      MARIADB_DATABASE: joomla
    healthcheck:
      test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized']
      interval: 2s
      timeout: 5s
      retries: 90
  web:
    image: joomla:5-php8.3-apache
    mem_limit: 1g
    depends_on:
      db:
        condition: service_healthy
    environment:
      JOOMLA_DB_HOST: db
      JOOMLA_DB_USER: root
      JOOMLA_DB_PASSWORD: ${password}
      JOOMLA_DB_NAME: joomla
    volumes: ['${webroot}:/var/www/html']
`
}

// ───────────────────────────── Joomla adapter ─────────────────────────────

const JOOMLA_SCRIPTS = {
  inventory: 'packages/cms/tracy-joomla-quickstart/scripts/dump-inventory.php',
  capture: 'packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py',
  bootstrap: 'packages/fleet/tracy-fleet-operation/scripts/provision/joomla-bootstrap.php',
  install: 'packages/fleet/tracy-fleet-operation/scripts/provision/joomla-contract-install.php',
  identity: 'packages/fleet/tracy-fleet-operation/scripts/provision/joomla-content-identity.php',
  render: 'packages/fleet/tracy-fleet-operation/scripts/provision/render_configuration.py'
}
/**
 * Which module-title prefix to capture with: the candidate that gives the most slots. A candidate the
 * capture REFUSES stops the release instead: its slot count is unknown, and falling back to a narrower
 * prefix would hide whatever the refusal found (the other modules would simply not be looked at).
 * @param {[string, { slots?: number, refused?: string }][]} trials in candidate order
 * @returns {{ prefix: string, refusedBy?: string }}
 */
export function choosePrefix(trials) {
  const refused = trials.find(([, c]) => c.refused)
  if (refused) return { prefix: refused[0], refusedBy: refused[1].refused }
  let best = null
  for (const [prefix, c] of trials)
    if (best === null || c.slots > best.slots) best = { prefix, slots: c.slots }
  return { prefix: best.prefix }
}

/** The one sentence a refusal of `capture-contract.py` comes down to: its own list, or its error line, without our scratch paths. */
export function refusalSummary(stderr, webroot) {
  const lines = stderr
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
  const at = lines.findIndex((l) => l.startsWith('Contract not written:'))
  const picked =
    at >= 0
      ? lines.slice(at, at + 8)
      : [
          [...lines].reverse().find((l) => /^[A-Za-z]*(Error|Exception):/.test(l)) ??
            lines.at(-1) ??
            'no message'
        ]
  return picked.join(' | ').split(webroot).join('<webroot>').slice(0, 900)
}

/** For a refusal about an ACM block the template lacks: which modules of the demo use that block, and are they live. */
/**
 * Site modules of `mod_ja_acm` whose block the template has no folder for (`templates/<t>/acm/<block>/`):
 * mod_ja_acm has no layout to draw them with, so they render nothing whatever their state. The same
 * rule `capture-contract.py --skip-unshipped-block-modules` applies; this copy only names the rows.
 */
export function unshippedBlockModules(inv, webroot, template) {
  const rows = []
  for (const m of inv.modules) {
    if (m.client_id !== '0' || m.module !== 'mod_ja_acm') continue
    let block = ''
    try {
      const type = JSON.parse(JSON.parse(m.params)['jatools-config'])[':type']
      if (typeof type === 'string') block = type.split(':').pop() ?? ''
    } catch {
      continue
    }
    if (!block) continue
    const dir = path.join(webroot, 'templates', template, 'acm', block)
    if (!(existsSync(dir) && statSync(dir).isDirectory())) rows.push(m)
  }
  return rows
}

export function missingBlockModules(inv, message) {
  const block = /\/acm\/([^/\s]+)\/tmpl\//.exec(message)?.[1] ?? /acm\/([^/\s]+)\/tmpl/.exec(message)?.[1]
  if (!block) return ''
  const users = []
  for (const m of inv.modules) {
    if (m.client_id !== '0' || m.module !== 'mod_ja_acm') continue
    try {
      const type = JSON.parse(JSON.parse(m.params)['jatools-config'])[':type']
      if (typeof type === 'string' && type.endsWith(`:${block}`))
        users.push(`#${m.id} "${m.title}" published=${m.published}`)
    } catch {
      /* a module whose config is not JSON is not this block's */
    }
  }
  return users.length ? ` — used by ${users.length} module(s): ${users.slice(0, 5).join(', ')}` : ''
}

/** What `capture-contract.py` says when it refuses a release rather than crashing. */
const CAPTURE_REFUSAL = /Contract not written:|Missing ACM schema|Mixed module assignment modes/
const INVENTORY_TABLES = [
  'modules',
  'modules_menu',
  'content',
  'menu',
  'template_styles',
  'categories',
  'viewlevels',
  'usergroups',
  'assets'
]

/**
 * Parameters of `capture-contract.py` for one template, read from its own inventory and webroot —
 * the derivation the skill spells out by hand (section 7, step 3), with the evidence it asks for.
 * `exists(rel)` and `readText(rel)` look inside the webroot.
 */
export function deriveJoomlaParams(inv, setting, exists, listAcmXml) {
  const evidence = {}
  for (const t of INVENTORY_TABLES)
    if (!Array.isArray(inv[t])) throw failed('inventory', `the inventory has no ${t} table`)
  const template = setting.template
  if (!template || !/^[a-z][a-z0-9_]*$/.test(template))
    throw blocked(
      'template',
      `tracy_setting.json names no usable template folder (${JSON.stringify(template)})`
    )
  if (!exists(`templates/${template}`))
    throw blocked('template', `templates/${template} is not in the webroot`)
  const siteStyles = inv.template_styles.filter((r) => r.client_id === '0')
  const own = siteStyles.filter((r) => r.template === template)
  evidence.styles = siteStyles.map((r) => `${r.id} ${r.template} ${r.title}`)
  if (own.length === 0) throw blocked('template', `no site template style uses ${template}`)

  const frameworks = ['t4', 't3'].filter((f) => exists(`plugins/system/${f}`))
  if (frameworks.length !== 1)
    throw blocked(
      'framework',
      frameworks.length === 0
        ? 'neither plugins/system/t4 nor plugins/system/t3 is in the webroot'
        : 'both t3 and t4 are in the webroot: which one the template uses is not decided'
    )

  const menutypes = [
    ...new Set(inv.menu.filter((r) => r.client_id === '0' && r.menutype).map((r) => r.menutype))
  ].sort()
  if (menutypes.length === 0) throw blocked('menutypes', 'the site has no menu')
  evidence.menutypes = Object.fromEntries(
    menutypes.map((m) => [m, inv.menu.filter((r) => r.client_id === '0' && r.menutype === m).length])
  )

  // Multilingual content is outside this skill: the contract of a site with several editions is
  // the multilingual profile, which is not captured here.
  const langs = new Set()
  for (const t of ['content', 'menu', 'categories'])
    for (const r of inv[t])
      if (r.language && r.language !== '*' && (t !== 'menu' || r.client_id === '0')) langs.add(r.language)
  if (langs.size > 1)
    throw blocked(
      'languages',
      `the site carries content in ${langs.size} languages (${[...langs].sort().join(', ')}); the single-language capture does not describe it`
    )

  const contentModules = inv.modules.filter(
    (r) => r.client_id === '0' && ['mod_ja_acm', 'mod_custom'].includes(r.module)
  )
  const titles = contentModules.map((r) => r.title)
  const candidates = ['']
  if (titles.some((t) => t.startsWith('[Tracy'))) candidates.push('[Tracy')
  const counts = new Map()
  for (const t of titles) {
    const m = /^\[[^\]]+/.exec(t)
    if (m) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1)
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (common && !candidates.includes(common[0])) candidates.push(common[0])

  const notes = [...new Set(inv.modules.filter((r) => r.client_id === '0' && r.note).map((r) => r.note))]
  const identityNote = notes.includes('tracy:identity') ? 'tracy:identity' : ''
  const root = (d) => exists(d)
  const fileRoots = [
    `templates/${template}`,
    `plugins/system/${frameworks[0]}`,
    'modules/mod_ja_acm',
    'media'
  ].filter(root)
  return {
    template,
    styles: template,
    menutypes: menutypes.join(','),
    listItems: listAcmXml(template),
    fileRoots: fileRoots.join(','),
    identityNote,
    prefixCandidates: candidates,
    framework: frameworks[0],
    evidence
  }
}

function acmHasItems(webroot, template) {
  const dir = path.join(webroot, 'templates', template, 'acm')
  if (!existsSync(dir)) return false
  for (const block of readdirSync(dir)) {
    const tmpl = path.join(dir, block, 'tmpl')
    if (!existsSync(tmpl)) continue
    for (const f of readdirSync(tmpl))
      if (f.endsWith('.xml') && readFileSync(path.join(tmpl, f), 'utf8').includes('<item')) return true
  }
  return false
}

/** The release manifest the contract quotes: the release's own, else one built from its setting. */
export function quickstartManifest(card, released) {
  if (released) {
    const m = { ...released }
    if (m.version !== card.version)
      throw blocked(
        'manifest',
        `manifest.json is version ${m.version}, tracy_setting.json is ${card.version}`
      )
    if (m.release === undefined) m.release = card.tag
    return {
      manifest: m,
      source:
        m.release === card.tag && released.release === undefined
          ? 'release manifest.json + release tag'
          : 'release manifest.json'
    }
  }
  const parts = {}
  for (const [part, info] of Object.entries(card.install))
    if (part !== 'cowork')
      parts[part] = { file: info.file, bytes: card.assets[info.file]?.size ?? null, sha256: info.sha256 }
  return {
    manifest: {
      schemaVersion: 'tracy-quickstart/v1',
      product: card.slug,
      id: card.tag,
      version: card.version,
      platform: card.platform,
      cms: { name: card.platform, version: card.cms },
      template: card.template,
      parts,
      release: card.tag,
      repository: DEFAULT_REPO
    },
    source: 'built from tracy_setting.json (the release has no manifest.json)'
  }
}

const jsonStable = (v) => `${JSON.stringify(v, null, 2)}\n`
const PROFILE_FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']

/** A WordPress profile also carries `superseded.json`, which `build-wordpress-superseded.mjs` makes. */
const EXTRA_FILES = ['superseded.json']

function readProfile(dir) {
  const names = [...PROFILE_FILES, ...EXTRA_FILES.filter((f) => existsSync(path.join(dir, f)))]
  return Object.fromEntries(names.map((f) => [f, readFileSync(path.join(dir, f))]))
}
/** Same files, same bytes. A file one side has and the other lacks is a difference. */
export function sameProfile(a, b) {
  const names = Object.keys(a)
  return (
    names.length === Object.keys(b).length &&
    names.every((f) => b[f] !== undefined && Buffer.compare(Buffer.from(a[f]), Buffer.from(b[f])) === 0)
  )
}

// PHP that binds the profile on the stand exactly the way the provision does it (it loads the
// bootstrap's own functions), but judges the answers itself: the bootstrap's closing `bound === true`
// check reads a field the component's `inspect` answer does not carry.
const BIND_DRIVER = String.raw`<?php
if (PHP_SAPI !== 'cli') exit(1);
require '/tmp/bc-bootstrap-lib.php';
require '/var/www/html/configuration.php';
$config = new JConfig();
$db = new mysqli($config->host, $config->user, $config->password, $config->db);
$prefix = (string) $config->dbprefix;
$door = tracy_door('http://127.0.0.1/index.php?option=com_claudecowork&task=api.exec&format=json');
$contract = (string) getenv('BC_CONTRACT');
$mode = (string) getenv('BC_MODE');
$row = tracy_cowork_row($db, $prefix);
if (!$row) { echo json_encode(['error' => 'component missing']); exit(0); }
$params = tracy_decode_params($row['params']);
$out = [];
if ($mode === 'bind') {
    $token = bin2hex(random_bytes(32));
    $write = tracy_pairing_params($params, 'contract', $contract, false, $token);
    tracy_reset_site($db, $prefix);
    $id = (int) $row['extension_id'];
    $value = json_encode($write);
    $stmt = $db->prepare("UPDATE {$prefix}extensions SET params=? WHERE extension_id=?");
    $stmt->bind_param('si', $value, $id);
    $stmt->execute();
    [$probe, , $pstatus] = tracy_call($door, ['token' => $token, 'action' => 'core.manifest', 'params' => new stdClass()], 30);
    $out['probe'] = ['ok' => tracy_door_ok($probe, $pstatus), 'platform' => $probe['manifest']['platform'] ?? null];
    $menu = [];
    $rows = $db->query("SELECT id FROM {$prefix}menu WHERE published=1 AND client_id=0 AND type='component' AND id>1 ORDER BY id");
    if ($rows) while ($r = $rows->fetch_row()) $menu[] = (int) $r[0];
    tracy_warm_site(tracy_warm_urls($menu));
    $bind = ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'bind']];
    $attempts = 0;
    for ($try = 1; $try <= 3; $try++) {
        $attempts = $try;
        [$bound, $transport, $status] = tracy_call($door, $bind, 900);
        if (tracy_bind_accepted($bound, $contract, $status)) break;
        $missing = $try < 3 && tracy_http_ok($status) ? tracy_contract_retry_path($bound, '/var/www/html') : null;
        if ($missing === null) break;
        tracy_warm_site(array_merge(tracy_warm_urls_for_missing($missing), tracy_warm_urls($menu)));
    }
    $out['bind'] = ['accepted' => tracy_bind_accepted($bound, $contract, $status), 'attempts' => $attempts, 'http' => $status, 'said' => tracy_door_said($bound, $transport, $status), 'bound' => $bound['bound'] ?? null, 'contract' => $bound['contract'] ?? null];
    [$ins, $itransport, $istatus] = tracy_call($door, ['token' => $token, 'action' => 'content.contract', 'params' => ['operation' => 'inspect']], 900);
    $raw = json_encode($ins);
    $out['inspect'] = [
        'http' => $istatus, 'ok' => $ins['ok'] ?? null, 'contract' => $ins['contract'] ?? null,
        'bound' => $ins['bound'] ?? null,
        'slots' => is_array($ins['slots'] ?? null) ? count($ins['slots']) : null,
        'pages' => is_array($ins['pages'] ?? null) ? count($ins['pages']) : null,
        'warnings' => is_array($ins['warnings'] ?? null) ? count($ins['warnings']) : 0,
        'problems' => is_array($ins['problems'] ?? null) ? array_slice($ins['problems'], 0, 5) : [],
        'missingOrAmbiguous' => strpos($raw, 'Missing or ambiguous entity') !== false,
        'said' => tracy_door_said($ins, $itransport, $istatus),
    ];
} else {
    $token = (string) ($params->token ?? '');
    [$read, $transport, $status] = tracy_call($door, ['token' => $token, 'action' => 'content.read', 'params' => ['limit' => '5']], 300);
    $contents = $read['contents'] ?? null;
    $out['read'] = [
        'http' => $status,
        'contents' => is_array($contents) ? count($contents) : null,
        'total' => $read['pagination']['total'] ?? null,
        'contractId' => $read['provenance']['contractId'] ?? null,
        'completeness' => $read['completeness']['status'] ?? null,
        'error' => $read['error']['code'] ?? null,
        'sample' => is_array($contents) ? array_map(fn($c) => ['id' => $c['id'] ?? null, 'type' => $c['type'] ?? null], array_slice($contents, 0, 3)) : [],
    ];
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
`

const parseJsonLine = (step, text) => {
  const line = text.trim().split('\n').filter(Boolean).pop() ?? ''
  try {
    return JSON.parse(line)
  } catch {
    throw failed(step, `no JSON answer: ${excerpt(text, 400)}`)
  }
}

/** The component version the copy of the source declares, per platform (never a number invented for a release to come). */
export function readCoworkVersion(src, platform) {
  const file =
    platform === 'joomla'
      ? path.join(src, PLATFORMS.joomla.cowork, 'pkg_claudecowork.xml')
      : path.join(src, PLATFORMS.wordpress.cowork, 'claude-cowork/claude-cowork.php')
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const m =
    platform === 'joomla'
      ? /<version>([^<]+)<\/version>/.exec(text)
      : /^\s*\*\s*Version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(text)
  return m ? m[1].trim() : null
}

/** Run one Joomla target end to end. `ctx` carries the shared run state. */
async function joomlaTarget(card, ctx, log, t) {
  const work = path.join(ctx.scratch, `${card.slug}-${card.platform}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const webroot = path.join(work, 'webroot')
  const step = (s) => {
    t.step = s
    log.line(`== ${s}`)
  }
  const result = { shape: card.shape }

  // 1. the release's files, checksum-verified against the pinned setting
  step('download')
  const shape = card.shape
  if (!['database+webroot', 'installer'].includes(shape))
    throw blocked(
      'shape',
      `install shape ${shape} has no headless restore here (Akeeba bundle needs Kickstart)`
    )
  const files = {}
  for (const part of shape.split('+')) {
    const info = card.install[part]
    const asset = card.assets[info.file]
    files[part] = await downloadAsset(
      ctx.repo,
      { id: asset.id, size: asset.size },
      info.file,
      path.join(ctx.cache, card.slug, info.file),
      info.sha256
    )
  }
  let released = null
  if (card.assets['manifest.json']) {
    const txt = await ghApi(`repos/${ctx.repo}/releases/assets/${card.assets['manifest.json'].id}`, {
      accept: 'application/octet-stream'
    })
    released = JSON.parse(txt)
  }
  const qm = quickstartManifest(card, released)
  result.manifestSource = qm.source
  writeFileSync(path.join(work, 'manifest.json'), jsonStable(qm.manifest))

  step('extract')
  await safeExtract(shape === 'installer' ? files.installer : files.webroot, webroot, 6 * 1024 ** 3)
  if (!existsSync(path.join(webroot, 'index.php')) || !existsSync(path.join(webroot, 'libraries')))
    throw blocked('extract', 'the archive does not hold a Joomla webroot (no index.php / libraries)')
  for (const d of ['tmp', 'cache', 'administrator/logs', 'administrator/cache'])
    mkdirSync(path.join(webroot, d), { recursive: true })

  // 2. the stand
  step('stand')
  const stand = new Stand(ctx.project, work, log)
  writeFileSync(stand.file, joomlaCompose(stand.password, webroot), { mode: 0o600 })
  activeStands.set(stand.name, stand)
  t.stand = stand
  await stand.must('stand-up', ['up', '-d', '--wait', '--wait-timeout', '240'], { timeoutMs: 300_000 })
  const php = (args, o = {}) =>
    stand.must(
      t.step,
      [
        'exec',
        '-T',
        ...(o.env ?? []).flatMap((e) => ['-e', e]),
        '-w',
        '/var/www/html',
        'web',
        'php',
        ...args
      ],
      o
    )
  const phpFile = (rel, env = [], step2 = t.step) =>
    stand.must(step2, ['exec', '-T', ...env.flatMap((e) => ['-e', e]), 'web', 'php'], {
      input: readFileSync(path.join(REPO_ROOT, rel)),
      timeoutMs: 600_000,
      maxBytes: 512 * 1024 * 1024
    })

  if (shape === 'installer') {
    step('install')
    if (!existsSync(path.join(webroot, 'installation/joomla.php')))
      throw blocked('install', 'the installer zip carries no installation/joomla.php')
    await php(
      [
        'installation/joomla.php',
        'install',
        '--no-interaction',
        '--site-name',
        card.slug,
        '--admin-user',
        'Tracy Agent',
        '--admin-username',
        'tracyagent',
        '--admin-password',
        `A-${stand.password}-z9`,
        '--admin-email',
        'tracy-agent@example.invalid',
        '--db-type',
        'mysqli',
        '--db-host',
        'db',
        '--db-user',
        'root',
        '--db-pass',
        stand.password,
        '--db-name',
        'joomla',
        '--db-prefix',
        'tr_'
      ],
      { timeoutMs: 600_000 }
    )
    if (!existsSync(path.join(webroot, 'configuration.php')))
      throw failed('install', 'the CLI installer wrote no configuration.php')
    rmSync(path.join(webroot, 'installation'), { recursive: true, force: true })
  } else {
    step('restore')
    const cfg = path.join(webroot, 'configuration.php')
    if (!existsSync(cfg)) throw blocked('restore', 'the snapshot has no configuration.php')
    const src = path.join(work, 'configuration.source.php')
    cpSync(cfg, src)
    await must(
      'configure',
      'python3',
      [
        path.join(REPO_ROOT, JOOMLA_SCRIPTS.render),
        '--source',
        src,
        '--out',
        cfg,
        '--db-host',
        'db',
        '--db-user',
        'root',
        '--db-password',
        stand.password,
        '--db-name',
        'joomla',
        '--live-site',
        'http://127.0.0.1'
      ],
      { timeoutMs: 60_000 }
    )
    const sql = path.join(work, 'database.sql')
    await must('restore', 'sh', ['-c', 'gunzip -c "$1" > "$2"', 'sh', files.database, sql], {
      timeoutMs: 300_000
    })
    await stand.must(
      'restore',
      ['exec', '-T', '-e', `MYSQL_PWD=${stand.password}`, 'db', 'mariadb', '-uroot', 'joomla'],
      { stdinFile: sql, timeoutMs: 900_000 }
    )
    rmSync(sql, { force: true })
  }
  const tableRows = await stand.must('inventory-probe', [
    'exec',
    '-T',
    '-e',
    `MYSQL_PWD=${stand.password}`,
    'db',
    'mariadb',
    '-uroot',
    'joomla',
    '-N',
    '-e',
    'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema="joomla"'
  ])
  result.tables = Number(tableRows.stdout.trim())
  if (!(result.tables > 50)) throw failed('restore', `the restored database has ${result.tables} tables`)

  // 3. inventory, warm-up, parameters
  const warm = async () => {
    const ids = JSON.parse(
      (
        await stand.must('warm', [
          'exec',
          '-T',
          'web',
          'php',
          '-r',
          'require "/var/www/html/configuration.php";$c=new JConfig();$d=new mysqli($c->host,$c->user,$c->password,$c->db);$r=$d->query("SELECT id FROM {$c->dbprefix}menu WHERE published=1 AND client_id=0 AND type=\'component\' AND id>1 ORDER BY id");$o=[];while($x=$r->fetch_row())$o[]=(int)$x[0];echo json_encode($o);'
        ])
      ).stdout
    )
    const urls = [
      'http://127.0.0.1/',
      ...ids.slice(0, 60).map((i) => `http://127.0.0.1/index.php?Itemid=${i}`)
    ]
    await stand.must(
      'warm',
      [
        'exec',
        '-T',
        'web',
        'sh',
        '-c',
        `for u in ${urls.map((u) => `'${u}'`).join(' ')}; do curl -s -o /dev/null --max-time 30 -L "$u"; done`
      ],
      { timeoutMs: 600_000 }
    )
    return urls.length
  }
  // Installer sites have no generated assets until pages are served, and the lock must describe the
  // site the provision will bind (it warms first); a snapshot is hashed as shipped, like the skill does.
  if (shape === 'installer') {
    step('warm')
    result.warmed = await warm()
  }
  step('inventory')
  const invFile = path.join(work, 'inventory.json')
  await stand.must('inventory', ['exec', '-T', 'web', 'php'], {
    input: readFileSync(path.join(REPO_ROOT, JOOMLA_SCRIPTS.inventory)),
    stdoutFile: invFile,
    timeoutMs: 300_000
  })
  let inv
  try {
    inv = JSON.parse(readFileSync(invFile, 'utf8'))
  } catch (e) {
    throw failed('inventory', `the inventory is not JSON: ${e.message}`)
  }
  const exists = (rel) => existsSync(path.join(webroot, rel))
  const params = deriveJoomlaParams(inv, { template: card.template }, exists, (tpl) =>
    acmHasItems(webroot, tpl)
  )
  result.params = { ...params, evidence: undefined }
  result.evidence = params.evidence
  result.counts = { modules: inv.modules.length, articles: inv.content.length, menu: inv.menu.length }

  // 4. capture twice; the first prefix that gives the most slots wins
  step('capture')
  const slotsHelper = path.join(ctx.cowork.src, 'joomla/cowork/lib/ContentSlots.php')
  const contractId = `${card.slug}/j6/${card.version}`
  const coworkVersion = ctx.coworkVersions.joomla
  // A module in the trash renders nowhere and is not customer content; when only such modules need an ACM
  // schema the template lacks, the capture is repeated with them left out. Every other release is captured
  // exactly as before, so a published profile re-captures byte for byte.
  let skipTrashed = false
  let skipUnshipped = false
  // A new profile declares every piece of demo content (`--full-coverage`); one already in the tree re-captures with
  // the rules it was made with, so `verify` still compares it byte for byte.
  const fullCoverage = capturesWithFullCoverage(PROFILE_DIR(card.platform, card.slug, card.version))
  result.fullCoverage = fullCoverage
  const capture = async (out, prefix) => {
    const args = [
      path.join(REPO_ROOT, JOOMLA_SCRIPTS.capture),
      '--webroot',
      webroot,
      '--inventory',
      invFile,
      '--manifest',
      path.join(work, 'manifest.json'),
      '--slots-helper',
      slotsHelper,
      '--out',
      out,
      '--id',
      contractId,
      '--template',
      params.template,
      '--styles',
      params.styles,
      '--menutypes',
      params.menutypes,
      '--module-prefix',
      prefix,
      '--exclude-generated',
      // A numbered ACM link field (`btn-link-2`) is a url slot by its name, whatever its demo value.
      '--link-fields-by-role',
      // A fact slot (a price, a counter, an address) asks for evidence by its field name (#1326).
      '--evidence-by-field',
      '--file-roots',
      params.fileRoots,
      '--cowork-version',
      coworkVersion
    ]
    if (params.listItems) args.push('--list-items')
    if (fullCoverage) args.push('--full-coverage')
    if (skipTrashed) args.push('--skip-trashed-modules')
    if (skipUnshipped) args.push('--skip-unshipped-block-modules')
    if (params.identityNote) args.push('--identity-note', params.identityNote)
    const r = await run('python3', args, { cwd: REPO_ROOT, timeoutMs: 600_000 }).catch((e) => {
      throw unknown('capture', `could not start python3: ${e.message}`)
    })
    if (r.timedOut) throw unknown('capture', 'capture-contract.py did not finish')
    if (r.code !== 0) {
      // The capture tool's own refusals are properties of the release (duplicate rows, an ACM block
      // whose schema the template lacks, mixed assignment): deterministic, so the release is blocked,
      // and the sentence names why. Any other crash is a failure of the run.
      if (CAPTURE_REFUSAL.test(r.stderr)) return { refused: refusalSummary(r.stderr, webroot) }
      throw failed('capture', `capture-contract.py exited ${r.code}: ${excerpt(r.stderr, 700)}`)
    }
    return JSON.parse(r.stdout.trim().split('\n').pop())
  }
  const trashedModules = inv.modules.filter((r) => r.client_id === '0' && String(r.published) === '-2')
  const trialsFor = async () => {
    const trials = {}
    const ordered = []
    for (const prefix of params.prefixCandidates) {
      const out = path.join(
        work,
        `trial-${ordered.length}${skipTrashed ? 's' : ''}${skipUnshipped ? 'u' : ''}`
      )
      const counts = await capture(out, prefix)
      trials[JSON.stringify(prefix)] = counts
      ordered.push([prefix, counts])
    }
    return { trials, pick: choosePrefix(ordered) }
  }
  let { trials, pick } = await trialsFor()
  if (pick.refusedBy && /Missing ACM schema/.test(pick.refusedBy) && trashedModules.length > 0) {
    skipTrashed = true
    say(
      log,
      `capture refused for a missing ACM schema; repeating without the ${trashedModules.length} trashed module(s)`
    )
    ;({ trials, pick } = await trialsFor())
  }
  // Still refused: a PUBLISHED module of a block the template has no folder for. It draws nothing, so
  // it is left out the same way (capture-contract.py decides which rows qualify, by the block folder).
  const unshippedModules = unshippedBlockModules(inv, webroot, params.template)
  if (pick.refusedBy && /Missing ACM schema/.test(pick.refusedBy) && unshippedModules.length > 0) {
    skipUnshipped = true
    say(
      log,
      `capture refused for a missing ACM schema; repeating without the ${unshippedModules.length} module(s) of a block the template does not ship`
    )
    ;({ trials, pick } = await trialsFor())
  }
  result.prefixTrials = trials
  if (skipTrashed) result.skippedTrashedModules = trashedModules.map((r) => String(r.id))
  if (skipUnshipped) result.skippedUnshippedBlockModules = unshippedModules.map((r) => String(r.id))
  if (pick.refusedBy) {
    throw blocked(
      'capture',
      `capture-contract.py refuses this release with module prefix ${JSON.stringify(pick.prefix)}: ${pick.refusedBy}${missingBlockModules(inv, pick.refusedBy)}`
    )
  }
  const chosen = pick.prefix
  const out1 = path.join(work, 'capture-1')
  const out2 = path.join(work, 'capture-2')
  const c1 = await capture(out1, chosen)
  const c2 = await capture(out2, chosen)
  if (c1.refused || c2.refused)
    throw failed(
      'capture',
      `a capture of the chosen prefix was refused the second time: ${c1.refused ?? c2.refused}`
    )
  const p1 = readProfile(out1)
  const p2 = readProfile(out2)
  result.deterministic = sameProfile(p1, p2)
  if (!result.deterministic) throw failed('capture', 'two captures of the same stand differ')
  result.modulePrefix = chosen
  result.capture = { entities: c1.entities, slots: c1.slots, files: c1.files }
  if (!(c1.entities > 0 && c1.slots > 0 && c1.files > 0))
    throw failed('capture', `capture is empty: ${JSON.stringify(c1)}`)
  // K2+K3: what the contract says it describes is what the release is.
  const mf = JSON.parse(p1['manifest.json'].toString())
  if (mf.quickstart?.version !== card.version || mf.quickstart?.release !== card.tag || mf.id !== contractId)
    throw failed(
      'capture',
      `contract names ${mf.id} / ${mf.quickstart?.release} ${mf.quickstart?.version}, the release is ${card.tag} ${card.version}`
    )

  // 5. bind test on the stand, with the profile put into a copy of the component
  step('bind')
  const bindResult = await bindTest({ contractId, out: out1, work, stand, ctx, log, t, phpFile })
  result.bind = bindResult.bind
  result.inspect = bindResult.inspect
  result.read = bindResult.read
  result.baseline = bindResult.baseline
  result.cowork = ctx.cowork.fingerprint
  result.profile = { dir: out1, files: p1 }
  return result
}

async function bindTest({ contractId, out, work, stand, ctx, log, t, phpFile }) {
  const build = async (root, withProfile) => {
    const copy = stageComponentBuild(ctx.cowork, 'joomla', root)
    if (withProfile) {
      const slot = path.join(copy, 'lib/contracts', ...contractId.split('/'))
      mkdirSync(slot, { recursive: true })
      for (const f of PROFILE_FILES) cpSync(path.join(out, f), path.join(slot, f))
    }
    await must('build-component', 'bash', ['./build.sh'], { cwd: copy, timeoutMs: 300_000 })
    const zip = path.join(copy, 'dist/pkg_claudecowork.zip')
    if (!existsSync(zip)) throw failed('build-component', 'build.sh made no pkg_claudecowork.zip')
    await stand.must('install-component', ['cp', zip, 'web:/tmp/tracy-contract-cowork.zip'])
    await phpFile(JOOMLA_SCRIPTS.install, [], 'install-component')
    // A slim component (0.24.55+) packs no profile, only its index: a site fetches its profile from the
    // GitHub release it runs, which has no asset for a profile captured just now. Put the profile where
    // the component reads a carried one first, after the install (whose postflight prunes profiles the
    // site is not held to) and before bind: what the provision's joomla_fetch_contract leaves there.
    if (withProfile && existsSync(path.join(copy, 'com_claudecowork/administrator/lib/contracts.json'))) {
      const into = `/var/www/html/administrator/components/com_claudecowork/lib/contracts/${contractId}`
      await stand.must('install-component', ['exec', '-T', 'web', 'mkdir', '-p', into])
      for (const f of PROFILE_FILES)
        await stand.must('install-component', ['cp', path.join(out, f), `web:${into}/${f}`])
    }
    await stand.must(
      'install-component',
      ['exec', '-T', 'web', 'chown', '-R', 'www-data:www-data', '/var/www/html'],
      { timeoutMs: 600_000 }
    )
  }
  await stand.must('bind', [
    'cp',
    path.join(REPO_ROOT, JOOMLA_SCRIPTS.bootstrap),
    'web:/tmp/bc-bootstrap-lib.php'
  ])
  const driver = path.join(work, 'bc-driver.php')
  writeFileSync(driver, BIND_DRIVER)
  await stand.must('bind', ['cp', driver, 'web:/tmp/bc-driver.php'])
  const drive = async (mode) =>
    parseJsonLine(
      'bind',
      (
        await stand.must(
          'bind',
          [
            'exec',
            '-T',
            '-e',
            'TRACY_BOOTSTRAP_LIB_ONLY=1',
            '-e',
            `BC_CONTRACT=${contractId}`,
            '-e',
            `BC_MODE=${mode}`,
            'web',
            'php',
            '/tmp/bc-driver.php'
          ],
          { timeoutMs: 1_500_000, maxBytes: 64 * 1024 * 1024 }
        )
      ).stdout
    )
  // What the site does WITHOUT the profile: the component names no contract it carries, so it falls
  // back to the Apple one. Measured before the profile goes in, on request (`--baseline-evidence`).
  let baseline = null
  if (ctx.baselineEvidence) {
    t.step = 'baseline'
    log.line('== baseline (no profile)')
    await build(path.join(work, 'cowork-plain'), false)
    await phpFile(JOOMLA_SCRIPTS.identity, ['TRACY_NEW_SITE=1'], 'baseline')
    const before = (await drive('read')).read
    baseline = {
      http: before.http,
      contents: before.contents,
      error: before.error,
      contractId: before.contractId
    }
    log.line(`baseline content.read: ${JSON.stringify(baseline)}`)
    t.step = 'bind'
  }
  await build(path.join(work, 'cowork'), true)
  const bound = await drive('bind')
  if (bound.error) throw failed('bind', bound.error)
  if (!bound.probe?.ok || bound.probe.platform !== 'joomla')
    throw failed(
      'bind',
      `the component door did not answer the manifest probe: ${JSON.stringify(bound.probe)}`
    )
  if (!bound.bind.accepted || bound.bind.bound !== true || bound.bind.contract !== contractId)
    throw failed('bind', `bind refused: ${bound.bind.said}`)
  const ins = bound.inspect
  if (ins.http !== 200 || ins.ok !== true || ins.contract !== contractId)
    throw failed('inspect', `inspect did not confirm ${contractId}: ${ins.said}`)
  if (ins.missingOrAmbiguous) throw failed('inspect', 'inspect reports "Missing or ambiguous entity"')
  if (ins.problems.length > 0)
    throw failed('inspect', `inspect lists problems: ${JSON.stringify(ins.problems)}`)
  t.step = 'content-reader'
  log.line('== content-reader')
  const idr = await phpFile(JOOMLA_SCRIPTS.identity, ['TRACY_NEW_SITE=1'], 'content-reader')
  if (!/TRACY_RESULT content_reader=enabled/.test(idr.stdout))
    throw failed('content-reader', `the content reader was not enabled: ${excerpt(idr.stdout, 300)}`)
  const read = (await drive('read')).read
  if (read.http !== 200 || !(read.contents > 0) || read.contractId !== contractId)
    throw failed(
      'content.read',
      `content.read answered HTTP ${read.http}, ${read.contents} item(s), contract ${read.contractId}, error ${read.error}`
    )
  return { bind: bound.bind, inspect: ins, read, baseline }
}

// ───────────────────────────── WordPress adapter ─────────────────────────────

const WP_SCRIPTS = {
  contract: 'packages/cms/tracy-wordpress-quickstart/scripts/capture-contract.mjs',
  inventory: 'packages/cms/tracy-wordpress-quickstart/scripts/capture-inventory.mjs',
  images: 'packages/cms/tracy-wordpress-quickstart/scripts/capture-image-slots.mjs',
  config: 'packages/fleet/tracy-fleet-operation/scripts/provision/render_wp_config.py'
}
const WP_DOOR = 'http://127.0.0.1/wp-admin/admin-ajax.php?action=claude_cowork'

export function wordpressCompose(password, webroot, prefix) {
  const env = `      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: root
      WORDPRESS_DB_PASSWORD: ${password}
      WORDPRESS_DB_NAME: wp
      WORDPRESS_TABLE_PREFIX: ${prefix}`
  return `services:
  db:
    image: mariadb:11
    mem_limit: 768m
    command: ['--max-allowed-packet=256M']
    environment:
      MARIADB_ROOT_PASSWORD: ${password}
      MARIADB_DATABASE: wp
    healthcheck:
      test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized']
      interval: 2s
      timeout: 5s
      retries: 90
  web:
    image: wordpress:php8.3-apache
    mem_limit: 1g
    depends_on:
      db:
        condition: service_healthy
    environment:
${env}
    volumes: ['${webroot}:/var/www/html']
  cli:
    image: wordpress:cli-php8.3
    profiles: ['cli']
    entrypoint: ['wp']
    user: '33:33'
    depends_on:
      db:
        condition: service_healthy
    environment:
${env}
    volumes: ['${webroot}:/var/www/html']
`
}

/** Run the three capture scripts over one scratch contracts tree; the same inputs always give the same bytes. */
async function wpCapturePass({ root, contractId, dump, webrootTar, step }) {
  const node = (script, extra) =>
    must(
      step,
      process.execPath,
      [
        path.join(REPO_ROOT, script),
        '--contract',
        contractId,
        '--dump',
        dump,
        '--contracts-root',
        root,
        ...extra
      ],
      { cwd: REPO_ROOT, timeoutMs: 600_000 }
    )
  await node(WP_SCRIPTS.inventory, ['--webroot', webrootTar])
  await node(WP_SCRIPTS.images, [])
  // Image slots must leave the lock where it was; the script proves it against the archive.
  await node(WP_SCRIPTS.inventory, ['--webroot', webrootTar, '--check'])
  // `superseded.json`: a new profile has no earlier bytes to accept, the file only records its own.
  await must(step, process.execPath, [path.join(REPO_ROOT, 'scripts/build-wordpress-superseded.mjs')], {
    cwd: REPO_ROOT,
    env: { TRACY_WP_CONTRACTS: root },
    timeoutMs: 120_000
  })
  const dir = path.join(root, contractId)
  const profile = readProfile(dir)
  if (!profile['superseded.json'])
    throw failed(step, 'build-wordpress-superseded.mjs wrote no superseded.json')
  return profile
}

async function wordpressTarget(card, ctx, log, t) {
  const work = path.join(ctx.scratch, `${card.slug}-${card.platform}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const webroot = path.join(work, 'webroot')
  const step = (s) => {
    t.step = s
    log.line(`== ${s}`)
  }
  const result = { shape: card.shape }
  step('download')
  if (card.shape !== 'database+webroot')
    throw blocked('shape', `install shape ${card.shape} has no headless restore for WordPress here`)
  if (!card.assets['manifest.json'])
    throw blocked(
      'manifest',
      'the release has no manifest.json; the profile cannot name the archives it describes'
    )
  const files = {}
  for (const part of ['webroot', 'database']) {
    const info = card.install[part]
    const asset = card.assets[info.file]
    files[part] = await downloadAsset(
      ctx.repo,
      { id: asset.id, size: asset.size },
      info.file,
      path.join(ctx.cache, `${card.slug}-wp`, info.file),
      info.sha256
    )
  }
  const release = JSON.parse(
    await ghApi(`repos/${ctx.repo}/releases/assets/${card.assets['manifest.json'].id}`, {
      accept: 'application/octet-stream'
    })
  )
  const named = (
    await import(pathToFileURL(path.join(REPO_ROOT, WP_SCRIPTS.contract)).href)
  ).normalizeRelease(release)
  if (named.version !== card.version)
    throw blocked(
      'manifest',
      `manifest.json is version ${named.version}, tracy_setting.json is ${card.version}`
    )
  for (const part of ['webroot', 'database'])
    if (named[part]?.sha256 !== card.install[part].sha256 || named[part]?.file !== card.install[part].file)
      throw blocked(
        'manifest',
        `manifest.json ${part} (${named[part]?.file}) is not the file tracy_setting.json pins (${card.install[part].file})`
      )
  result.manifestSource = 'release manifest.json'
  step('extract')
  await safeExtract(files.webroot, webroot, 6 * 1024 ** 3)
  for (const need of ['wp-config.php', 'wp-includes', 'wp-content'])
    if (!existsSync(path.join(webroot, need)))
      throw blocked('extract', `the archive has no ${need}; it is not a WordPress webroot`)

  // 1. the profile, from the release's own database and webroot archive
  step('derive')
  const { deriveProfile } = await import(pathToFileURL(path.join(REPO_ROOT, WP_SCRIPTS.contract)).href)
  const { readDump, tableRows, wordpressPrefix } = await import(
    pathToFileURL(path.join(HERE, 'mysqldump.mjs')).href
  )
  const sql = readDump(files.database)
  const prefix = wordpressPrefix(sql)
  const opt = new Map(tableRows(sql, `${prefix}options`).map((o) => [o.option_name, o.option_value]))
  const roots = [...new Set([opt.get('stylesheet'), opt.get('template')].filter(Boolean))].map(
    (n) => `wp-content/themes/${n}`
  )
  for (const r of roots)
    if (!existsSync(path.join(webroot, r))) throw blocked('derive', `${r} is not in the webroot archive`)
  const card2 = { ...card, repo: ctx.repo }
  let derived
  try {
    derived = deriveProfile({
      sql,
      release,
      card: card2,
      coworkVersion: ctx.coworkVersions.wordpress,
      themeRoots: roots
    })
  } catch (e) {
    throw blocked('derive', e.message)
  }
  const contractId = `${card.slug}/wp7/${card.version}`
  const stable = (v) => jsonStable(v)
  const seed = (root) => {
    const dir = path.join(root, contractId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'manifest.json'), stable(derived.manifest))
    writeFileSync(path.join(dir, 'content-map.json'), stable(derived.contentMap))
    writeFileSync(path.join(dir, 'presentation-lock.json'), stable(derived.lock))
  }
  step('capture')
  const pass = async (n) => {
    const root = path.join(work, `contracts-${n}`)
    seed(root)
    return wpCapturePass({
      root,
      contractId,
      dump: files.database,
      webrootTar: files.webroot,
      step: 'capture'
    })
  }
  const p1 = await pass(1)
  const p2 = await pass(2)
  result.deterministic = sameProfile(p1, p2)
  if (!result.deterministic) throw failed('capture', 'two captures of the same archives differ')
  const map = JSON.parse(p1['content-map.json'].toString())
  const lock = JSON.parse(p1['presentation-lock.json'].toString())
  result.capture = {
    entities: map.entities.length,
    slots: map.slots.length,
    files: Object.keys(lock.files ?? {}).length,
    imageSlots: map.slots.filter((s) => s.type === 'image').length
  }
  result.coverage = {
    pages: derived.coverage.pages,
    governedPages: map.entities.filter((e) => e.kind === 'page').length,
    pagesWithoutSlots: derived.coverage.pagesWithoutSlots,
    ambiguousPages: [...new Set(derived.coverage.ambiguousPages)],
    skippedBlocks: derived.coverage.skipped.length,
    skippedSample: derived.coverage.skipped.slice(0, 12)
  }
  if (!(result.capture.entities > 0 && result.capture.slots > 0 && result.capture.files > 0))
    throw failed('capture', `capture is empty: ${JSON.stringify(result.capture)}`)
  const mf = JSON.parse(p1['manifest.json'].toString())
  if (mf.quickstart.version !== card.version || mf.quickstart.release !== card.tag || mf.id !== contractId)
    throw failed('capture', `contract names ${mf.id}, the release is ${card.tag} ${card.version}`)

  // 2. the stand
  step('stand')
  const stand = new Stand(ctx.project, work, log)
  writeFileSync(
    stand.file,
    wordpressCompose(stand.password, webroot, derived.manifest.quickstart.tablePrefix),
    { mode: 0o600 }
  )
  activeStands.set(stand.name, stand)
  t.stand = stand
  const siteUrl = 'http://127.0.0.1'
  await must(
    'configure',
    'python3',
    [
      path.join(REPO_ROOT, WP_SCRIPTS.config),
      '--source',
      path.join(webroot, 'wp-config.php'),
      '--out',
      path.join(work, 'wp-config.rendered.php'),
      '--db-host',
      'db',
      '--db-user',
      'root',
      '--db-password',
      stand.password,
      '--db-name',
      'wp',
      '--site-url',
      siteUrl,
      '--table-prefix',
      derived.manifest.quickstart.tablePrefix
    ],
    { timeoutMs: 60_000 }
  )
  cpSync(path.join(work, 'wp-config.rendered.php'), path.join(webroot, 'wp-config.php'))
  await stand.must('stand-up', ['up', '-d', '--wait', '--wait-timeout', '240', 'db', 'web'], {
    timeoutMs: 300_000
  })
  await stand.must('stand-up', ['exec', '-T', '-u', '0', 'web', 'chown', '-R', '33:33', '/var/www/html'], {
    timeoutMs: 600_000
  })
  const wp = (args, o = {}) =>
    stand.must(t.step, ['run', '--rm', '-T', 'cli', ...args], { timeoutMs: 600_000, ...o })
  step('restore')
  const sqlFile = path.join(work, 'database.sql')
  await must('restore', 'sh', ['-c', 'gunzip -c "$1" > "$2"', 'sh', files.database, sqlFile], {
    timeoutMs: 300_000
  })
  await stand.must(
    'restore',
    ['exec', '-T', '-e', `MYSQL_PWD=${stand.password}`, 'db', 'mariadb', '-uroot', 'wp'],
    { stdinFile: sqlFile, timeoutMs: 900_000 }
  )
  rmSync(sqlFile, { force: true })
  const placeholder = derived.manifest.quickstart.placeholderUrl
  for (const [from, to] of [
    [placeholder, siteUrl],
    [placeholder.replace(/\//g, '\\/'), siteUrl.replace(/\//g, '\\/')]
  ])
    await wp([
      'search-replace',
      from,
      to,
      '--all-tables',
      '--precise',
      '--report-changed-only',
      '--format=count'
    ])
  await wp(['cache', 'flush'], {}).catch(() => {})
  const home = (await wp(['option', 'get', 'home'])).stdout.trim()
  if (home !== siteUrl) throw failed('restore', `home is ${home}, expected ${siteUrl}`)
  const active = (await wp(['theme', 'list', '--status=active', '--field=name'])).stdout.trim()
  if (active !== derived.stylesheet)
    throw failed('restore', `active theme is ${active}, the release says ${derived.stylesheet}`)

  // 3. bind test
  step('bind')
  const installPlugin = async (withProfile) => {
    const copy = stageComponentBuild(
      ctx.cowork,
      'wordpress',
      path.join(work, withProfile ? 'cowork' : 'cowork-plain')
    )
    if (withProfile) {
      const slot = path.join(copy, 'lib/contracts', ...contractId.split('/'))
      mkdirSync(slot, { recursive: true })
      for (const [f, data] of Object.entries(p1)) writeFileSync(path.join(slot, f), data)
    }
    await must('build-component', 'bash', ['./build.sh'], { cwd: copy, timeoutMs: 300_000 })
    const zip = path.join(copy, 'dist/claude-cowork.zip')
    if (!existsSync(zip)) throw failed('build-component', 'build.sh made no claude-cowork.zip')
    const staged = path.join(webroot, 'tracy-cowork.zip')
    cpSync(zip, staged)
    try {
      await wp(['plugin', 'install', '/var/www/html/tracy-cowork.zip', '--activate', '--force'])
    } finally {
      rmSync(staged, { force: true })
    }
  }
  const door = async (token, action, params) => {
    const r = await stand.must(
      t.step,
      [
        'exec',
        '-T',
        'web',
        'curl',
        '-s',
        '-S',
        '-m',
        '900',
        '-w',
        '\n%{http_code}',
        '-H',
        'content-type: application/json',
        '--data-binary',
        '@-',
        WP_DOOR
      ],
      { input: JSON.stringify({ token, action, params }), timeoutMs: 1_000_000, maxBytes: 128 * 1024 * 1024 }
    )
    const at = r.stdout.lastIndexOf('\n')
    let body
    try {
      body = JSON.parse(r.stdout.slice(0, at))
    } catch {
      throw failed(
        t.step,
        `${action} did not answer JSON (${r.stdout.length} bytes): ${excerpt(r.stdout, 200)}`
      )
    }
    return { http: Number(r.stdout.slice(at + 1)), body }
  }
  const tokenOf = async () => {
    const token = (await wp(['option', 'get', 'claude_cowork_token'])).stdout.trim()
    secrets.add(token)
    if (!/^[a-f0-9]{32,}$/.test(token)) throw failed('bind', 'the plugin minted no token on activation')
    return token
  }
  if (ctx.baselineEvidence) {
    // What the site does WITHOUT the profile: the plugin carries none for this id.
    step('baseline')
    await installPlugin(false)
    const plain = await tokenOf()
    await wp(['option', 'update', 'claude_cowork_contract', contractId])
    const refused = await door(plain, 'content.contract', { operation: 'bind', contract: contractId })
    const identity = await door(plain, 'content.identity', {
      newSite: true,
      requestId: `bc-baseline-${card.slug}`
    })
    const before = await door(plain, 'content.read', { limit: '5' })
    result.baseline = {
      bind: {
        http: refused.http,
        ok: refused.body.ok ?? null,
        error: refused.body.error ?? null,
        message: excerpt(String(refused.body.message ?? ''), 200)
      },
      identity: { http: identity.http, ok: identity.body.ok ?? null },
      read: {
        http: before.http,
        contents: Array.isArray(before.body.contents) ? before.body.contents.length : null,
        error: before.body.error?.code ?? null
      }
    }
    log.line(`baseline: ${JSON.stringify(result.baseline)}`)
    step('bind')
  }
  await installPlugin(true)
  const token = await tokenOf()
  await wp(['option', 'update', 'claude_cowork_contract', contractId])
  const bound = await door(token, 'content.contract', { operation: 'bind', contract: contractId })
  const bindOk =
    bound.http === 200 &&
    bound.body.ok === true &&
    bound.body.bound === true &&
    bound.body.contract === contractId
  if (!bindOk)
    throw failed(
      'bind',
      `bind refused (HTTP ${bound.http}): ${excerpt(JSON.stringify({ ok: bound.body.ok, error: bound.body.error, message: bound.body.message, problems: bound.body.problems }), 600)}`
    )
  const ins = await door(token, 'content.contract', { operation: 'inspect' })
  const ib = ins.body
  const insText = JSON.stringify(ib)
  if (ins.http !== 200 || ib.ok !== true || ib.bound !== true || ib.contract !== contractId)
    throw failed(
      'inspect',
      `inspect did not confirm ${contractId} (HTTP ${ins.http}): ${excerpt(JSON.stringify({ ok: ib.ok, bound: ib.bound, contract: ib.contract, message: ib.message }), 400)}`
    )
  if (insText.includes('Missing or ambiguous entity'))
    throw failed('inspect', 'inspect reports "Missing or ambiguous entity"')
  if ((ib.problems ?? []).length > 0)
    throw failed(
      'inspect',
      `inspect lists problems: ${excerpt(JSON.stringify(ib.problems.slice(0, 5)), 500)}`
    )
  if ((ib.missing ?? []).length > 0)
    throw failed('inspect', `inspect lists missing entities: ${JSON.stringify(ib.missing.slice(0, 5))}`)
  step('content-reader')
  const idr = await door(token, 'content.identity', { newSite: true, requestId: `bc-${card.slug}` })
  if (idr.body.ok !== true)
    throw failed(
      'content-reader',
      `the content reader was not enabled: ${excerpt(JSON.stringify(idr.body), 300)}`
    )
  step('content.read')
  const read = await door(token, 'content.read', { limit: '5' })
  const rb = read.body
  const contents = Array.isArray(rb.contents) ? rb.contents : null
  result.read = {
    http: read.http,
    contents: contents?.length ?? null,
    total: rb.pagination?.total ?? null,
    contractId: rb.provenance?.contractId ?? null,
    completeness: rb.completeness?.status ?? null,
    error: rb.error?.code ?? null
  }
  if (read.http !== 200 || !(result.read.contents > 0) || result.read.contractId !== contractId)
    throw failed(
      'content.read',
      `content.read answered HTTP ${read.http}, ${result.read.contents} item(s), contract ${result.read.contractId}, error ${result.read.error}`
    )
  result.bind = { accepted: true, attempts: 1, contract: bound.body.contract, bound: true }
  result.inspect = {
    ok: true,
    slots: Array.isArray(ib.slots) ? ib.slots.length : null,
    pages: null,
    warnings: (ib.drift ?? []).length,
    bound: ib.bound
  }
  result.cowork = ctx.cowork.fingerprint
  result.profile = { dir: path.join(work, 'contracts-1', contractId), files: p1 }
  result.params = { stylesheet: derived.stylesheet, template: derived.template, fileRoots: roots.join(',') }
  result.modulePrefix = null
  result.prefixTrials = null
  return result
}

// ───────────────────────────── publication ─────────────────────────────

const PROFILE_DIR = (platform, slug, version, root = REPO_ROOT) =>
  path.join(root, PLATFORMS[platform].contracts, slug, PLATFORMS[platform].suffix, version)

/** A version folder holds a profile only when it has a manifest.json; measurements alone are not one. */
const hasProfile = (dir) => existsSync(path.join(dir, 'manifest.json'))

/**
 * Whether a Joomla capture for this profile folder runs `capture-contract.py --full-coverage`: always for a profile not yet
 * in the tree, and for one in it only when it was made that way (a slot marked `customize: "keep"` is only ever written by
 * that rule). Every profile captured before the rule then re-captures byte for byte.
 * @param {string} dir
 */
export function capturesWithFullCoverage(dir) {
  if (!hasProfile(dir)) return true
  try {
    return JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8')).slots.some(
      (/** @type {any} */ slot) => slot?.customize === 'keep'
    )
  } catch {
    return false
  }
}

/**
 * The version of the profile Tracy uses for a release version that has none of its own: the highest
 * LOWER version of the same template and platform with the same major (apps/tracy-web contractFor,
 * TCH #816). Null when there is none, or when `version` is not x.y.z.
 */
export function nearestLowerProfile(platform, slug, version, root = REPO_ROOT) {
  const semver = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v))
    return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  const wanted = semver(version)
  if (wanted === null) return null
  const parent = path.dirname(PROFILE_DIR(platform, slug, version, root))
  if (!existsSync(parent)) return null
  let best = null
  for (const name of readdirSync(parent)) {
    const have = semver(name)
    if (have === null || have[0] !== wanted[0] || cmp(have, wanted) >= 0) continue
    if (!existsSync(path.join(parent, name, 'manifest.json'))) continue
    if (best === null || cmp(have, semver(best)) > 0) best = name
  }
  return best
}

/** `grep -c "\"slug\"" catalog.json` of the skill: a design the catalogue names needs a person. */
export function catalogNames(slug) {
  const file = path.join(REPO_ROOT, 'vendor/tracy/od-design-system/catalog.json')
  if (!existsSync(file)) throw unknown('catalog', `${file} is missing`)
  return readFileSync(file, 'utf8').split(`"${slug}"`).length - 1
}

/**
 * The `.design.json` of a profile. A design the catalogue does not name wears none (`null`). One it
 * does name is a person's choice, never ours: the run is blocked until `--design <slug>=null|<id>`
 * says which, and an id must be a system of the catalogue.
 */
export function designSidecar(slug, decisions, storedFile = null) {
  const chosen = Object.fromEntries(
    (decisions ?? '')
      .split(',')
      .filter(Boolean)
      .map((p) => p.split('='))
  )
  const doc = (design) => ({ schemaVersion: 'tracy-contract-design/v1', design })
  const names = catalogNames(slug)
  if (!(slug in chosen) && storedFile) return storedDesign(slug, storedFile, doc)
  if (slug in chosen) {
    if (chosen[slug] === 'null') return doc(null)
    const catalog = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'vendor/tracy/od-design-system/catalog.json'), 'utf8')
    )
    if (!(catalog.systems ?? []).some((s) => s.id === chosen[slug]))
      throw blocked('design', `--design names ${chosen[slug]}, which is not a system of the catalogue`)
    return doc({ id: chosen[slug], source: 'catalog' })
  }
  if (names !== 0)
    throw blocked(
      'design',
      `the design catalogue names "${slug}" ${names} time(s); a person must choose its sidecar (rerun with --design ${slug}=null or --design ${slug}=<catalogue id>)`
    )
  return doc(null)
}

/**
 * With no `--design` for a profile that is already in the tree, its own sidecar is the decision a person
 * took earlier. It is read strictly: anything but the two exact shapes (null, or a catalogue id) fails.
 */
function storedDesign(slug, file, doc) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw failed(
      'design',
      `the stored sidecar ${path.relative(REPO_ROOT, file)} cannot be read as JSON: ${e.message}`
    )
  }
  const keys = (o) =>
    o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : null
  if (keys(parsed) !== 'design,schemaVersion' || parsed.schemaVersion !== 'tracy-contract-design/v1')
    throw failed(
      'design',
      `the stored sidecar ${path.relative(REPO_ROOT, file)} is not a tracy-contract-design/v1 document`
    )
  if (parsed.design === null) return doc(null)
  const d = parsed.design
  if (keys(d) !== 'id,source' || d.source !== 'catalog' || typeof d.id !== 'string')
    throw failed(
      'design',
      `the stored sidecar ${path.relative(REPO_ROOT, file)} has a design that is neither null nor { id, source: "catalog" }`
    )
  const catalog = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'vendor/tracy/od-design-system/catalog.json'), 'utf8')
  )
  if (!(catalog.systems ?? []).some((x) => x.id === d.id))
    throw failed(
      'design',
      `the stored sidecar of ${slug} names ${d.id}, which is not a system of the catalogue`
    )
  return doc({ id: d.id, source: 'catalog' })
}

let publishChain = Promise.resolve()
/** One publication at a time: placing a profile and running the gate must not interleave. */
export function serialized(fn) {
  const next = publishChain.then(fn, fn)
  publishChain = next.catch(() => {})
  return next
}

/**
 * Place a profile atomically (a temp folder renamed into place), run the gate, and take ONLY what
 * this call added away again if the gate fails. A profile already in the tree is never overwritten.
 */
export async function publishProfile({ card, files, gate, designJson, root = REPO_ROOT }) {
  const dir = PROFILE_DIR(card.platform, card.slug, card.version, root)
  const sidecar = `${dir}.design.json`
  if (hasProfile(dir) || existsSync(sidecar))
    throw failed(
      'publish',
      `${path.relative(REPO_ROOT, dir)} already exists; a released profile is never overwritten`
    )
  const parent = path.dirname(dir)
  const addedParent = !existsSync(path.join(root, PLATFORMS[card.platform].contracts, card.slug))
  mkdirSync(parent, { recursive: true })
  // A version folder that already holds measurements only (no manifest.json) keeps them: the profile
  // files are renamed into it one by one, and only those are taken away again on failure.
  const intoExisting = existsSync(dir)
  const tmp = path.join(parent, `.${card.version}.tmp-${process.pid}`)
  const tmpSide = `${sidecar}.tmp-${process.pid}`
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp)
  // Only what THIS call renamed into place is taken away again: another run's folder is not ours.
  let placedDir = false
  let placedSide = false
  const placedFiles = []
  try {
    for (const name of Object.keys(files))
      if (intoExisting && existsSync(path.join(dir, name)))
        throw failed('publish', `${path.relative(REPO_ROOT, path.join(dir, name))} already exists`)
    for (const [name, data] of Object.entries(files)) writeFileSync(path.join(tmp, name), data)
    writeFileSync(tmpSide, jsonStable(designJson))
    if (intoExisting) {
      for (const name of Object.keys(files)) {
        renameSync(path.join(tmp, name), path.join(dir, name))
        placedFiles.push(path.join(dir, name))
      }
      rmSync(tmp, { recursive: true, force: true })
    } else {
      renameSync(tmp, dir)
      placedDir = true
    }
    renameSync(tmpSide, sidecar)
    placedSide = true
    await gate()
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true })
    rmSync(tmpSide, { force: true })
    if (placedDir) rmSync(dir, { recursive: true, force: true })
    for (const f of placedFiles) rmSync(f, { force: true })
    if (placedSide) rmSync(sidecar, { force: true })
    if (addedParent) {
      const slugDir = path.join(root, PLATFORMS[card.platform].contracts, card.slug)
      try {
        const platformDir = path.join(slugDir, PLATFORMS[card.platform].suffix)
        if (existsSync(platformDir) && readdirSync(platformDir).length === 0)
          rmSync(platformDir, { recursive: true })
        if (existsSync(slugDir) && readdirSync(slugDir).length === 0) rmSync(slugDir, { recursive: true })
      } catch {
        /* a folder that cannot be tidied is reported by the cleanup check */
      }
    }
    throw e
  }
  return { dir: path.relative(root, dir), sidecar: path.relative(root, sidecar) }
}

async function runGate(only = ['contracts']) {
  const args = ['exec', 'tsx', 'scripts/check-all.ts', ...only.flatMap((g) => ['--only', g])]
  const r = await run('pnpm', args, { cwd: REPO_ROOT, timeoutMs: 600_000 })
  if (r.timedOut) throw unknown('gate', `${only.join('+')} gate did not finish`)
  if (r.code !== 0)
    throw failed('gate', `${only.join('+')} gate failed: ${excerpt(r.stdout + r.stderr, 1200)}`)
  return { gates: only, ok: true }
}

// ───────────────────────────── cowork source ─────────────────────────────

/** A read-only copy of the component source at the checkout's HEAD, fingerprinted. */
export async function prepareCowork(source, scratch, platforms) {
  if (!existsSync(path.join(source, '.git'))) throw failed('cowork', `${source} is not a git checkout`)
  const head = (await must('cowork', 'git', ['-C', source, 'rev-parse', 'HEAD'])).stdout.trim()
  const dirty = (
    await must('cowork', 'git', [
      '-C',
      source,
      'status',
      '--porcelain',
      '--',
      ...platforms.map((p) => PLATFORMS[p].cowork)
    ])
  ).stdout.trim()
  const src = path.join(scratch, 'cowork-src')
  rmSync(src, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  const archive = path.join(scratch, 'cowork-src.tar')
  // The repo-root helpers build.sh calls (see stageComponentBuild), each only when HEAD has it.
  const helpers = []
  for (const name of COMPONENT_BUILD_HELPERS)
    if ((await run('git', ['-C', source, 'cat-file', '-e', `HEAD:scripts/${name}`])).code === 0)
      helpers.push(`scripts/${name}`)
  await must('cowork', 'git', [
    '-C',
    source,
    'archive',
    '--format=tar',
    '-o',
    archive,
    'HEAD',
    ...platforms.map((p) => PLATFORMS[p].cowork),
    ...helpers
  ])
  await safeExtract(archive, src, 2 * 1024 ** 3, 'cowork')
  rmSync(archive, { force: true })
  return {
    src,
    fingerprint: {
      checkout: source,
      head,
      uncommittedPaths: dirty ? dirty.split('\n').length : 0,
      usedHead: true
    }
  }
}

/**
 * A build folder for one component copy. Newer component sources run `../../scripts/release-manifest.mjs`
 * from `build.sh`, so the copy sits two levels under a root that carries that script (when the source has it).
 * @returns {string} the folder to run `build.sh` in
 */
const COMPONENT_BUILD_HELPERS = ['release-manifest.mjs', 'contract-assets.mjs', 'joomla-own-media.mjs']

export function stageComponentBuild(cowork, platform, root) {
  rmSync(root, { recursive: true, force: true })
  const copy = path.join(root, PLATFORMS[platform].cowork)
  cpSync(path.join(cowork.src, PLATFORMS[platform].cowork), copy, { recursive: true })
  // build.sh calls repo-root helpers two levels up: release-manifest.mjs (0.21.0), since the
  // Joomla package stopped carrying profiles (0.24.55) contract-assets.mjs, and since 0.24.58
  // joomla-own-media.mjs. Copy each one the
  // source has; an older source without them gets none invented.
  for (const name of COMPONENT_BUILD_HELPERS) {
    const script = path.join(cowork.src, 'scripts', name)
    if (!existsSync(script)) continue
    mkdirSync(path.join(root, 'scripts'), { recursive: true })
    cpSync(script, path.join(root, 'scripts', name))
  }
  return copy
}

async function coworkUnchanged(cowork) {
  const head = (
    await must('cowork', 'git', ['-C', cowork.fingerprint.checkout, 'rev-parse', 'HEAD'])
  ).stdout.trim()
  if (head !== cowork.fingerprint.head)
    throw unknown(
      'cowork',
      `the component checkout moved from ${cowork.fingerprint.head.slice(0, 9)} to ${head.slice(0, 9)} during the run`
    )
}

// ───────────────────────────── the run ─────────────────────────────

/** Run `fn` over `items`, at most `jobs` at a time. Results keep the order of `items`. */
export async function pool(items, jobs, fn, { onError } = {}) {
  const results = Array.from({ length: items.length })
  let next = 0
  let first = null
  // A failure stops new work, tells the caller (so it can cancel the siblings) and still waits for every
  // worker to settle: the pool never returns while one of its tasks is running.
  const worker = async () => {
    for (;;) {
      if (first) return
      const i = next++
      if (i >= items.length) return
      try {
        results[i] = await fn(items[i], i)
      } catch (e) {
        if (!first) {
          first = { e }
          try {
            onError?.(e)
          } catch {
            // the original failure is the one reported
          }
        }
        return
      }
    }
  }
  await Promise.allSettled(Array.from({ length: Math.min(jobs, items.length) }, worker))
  if (first) throw first.e
  return results
}

// A log line must never take cleanup with it: failures to write the log are not the target's failure.
function say(log, text) {
  try {
    log?.line(text)
  } catch {
    // out of disk or folder gone; the row still carries the result
  }
}

function rowOf(card, extra) {
  return {
    template: card.slug,
    platform: card.platform,
    tag: card.tag,
    version: card.version,
    shape:
      card.shape === 'installer' ? 'installer' : card.shape === 'database+webroot' ? 'snapshot' : card.shape,
    ...extra
  }
}

export async function processTarget(card, o, ctx, mode) {
  const started = Date.now()
  let log = null
  const t = { step: 'start', stand: null }
  const row = rowOf(card, {
    status: 'failed',
    capture: null,
    gate: null,
    bind: null,
    content: null,
    path: null,
    blocker: null,
    evidence: path.join('logs', `${card.platform}-${card.slug}.log`)
  })
  ctx = { ...ctx }
  let project = null
  let working = null
  const stop = new AbortController()
  let timedOut = false
  const onShutdown = () => stop.abort()
  shutdown.signal.addEventListener('abort', onShutdown, { once: true })
  try {
    log = new TargetLog(path.join(o.artifacts, 'logs', `${card.platform}-${card.slug}.log`))
    if (shutdown.signal.aborted)
      throw unknown('start', 'the run was interrupted before this template started')
    project = await ctx.projects.acquire()
    ctx.project = project
    // A name freed by a failed sibling can wake this waiter after the run was told to stop.
    if (shutdown.signal.aborted)
      throw unknown('start', 'the run was interrupted before this template started')
    await coworkUnchanged(ctx.cowork)
    t.timer = setTimeout(() => {
      timedOut = true
      stop.abort()
    }, o.timeoutN * 1000)
    // Everything the target starts runs under the cancel scope: when the deadline aborts it, every
    // command is killed and no new one starts, and the target is awaited before its resources go back.
    working = cancelScope.run({ signal: stop.signal }, () =>
      card.platform === 'joomla' ? joomlaTarget(card, ctx, log, t) : wordpressTarget(card, ctx, log, t)
    )
    let res
    try {
      res = await working
    } catch (e) {
      if (timedOut) throw unknown(t.step, `the template did not finish within ${o.timeoutN}s`)
      throw e
    }
    clearTimeout(t.timer)
    row.capture = {
      ...res.capture,
      deterministic: res.deterministic,
      modulePrefix: res.modulePrefix,
      prefixTrials: res.prefixTrials,
      manifest: res.manifestSource,
      params: res.params,
      counts: res.counts,
      // Present only when the capture left rows out, so every other row reads as before.
      ...(res.skippedTrashedModules ? { skippedTrashedModules: res.skippedTrashedModules } : {}),
      ...(res.skippedUnshippedBlockModules
        ? { skippedUnshippedBlockModules: res.skippedUnshippedBlockModules }
        : {})
    }
    row.bind = {
      bind: {
        accepted: res.bind.accepted,
        attempts: res.bind.attempts,
        contract: res.bind.contract,
        bound: res.bind.bound
      },
      inspect: {
        ok: res.inspect.ok,
        slots: res.inspect.slots,
        pages: res.inspect.pages,
        warnings: res.inspect.warnings,
        hasBoundField: res.inspect.bound !== null
      }
    }
    row.content = res.read
    row.cowork = res.cowork
    row.coverage = res.coverage ?? null
    row.baseline = res.baseline ?? null
    const files = res.profile.files
    const dir = PROFILE_DIR(card.platform, card.slug, card.version)
    const inTree = hasProfile(dir) ? readProfile(dir) : null
    const sideText = `${dir}.design.json`
    const designJson = designSidecar(card.slug, o.design, inTree && existsSync(sideText) ? sideText : null)
    const sidecarSame =
      inTree && existsSync(sideText) && readFileSync(sideText, 'utf8') === jsonStable(designJson)
    if (inTree) {
      // A profile already in the tree is never overwritten: identical is a re-run, different is an error.
      row.path = path.relative(REPO_ROOT, dir)
      if (!sameProfile(inTree, files) || !sidecarSame)
        throw failed(
          mode === 'deliver' ? 'publish' : 'compare',
          `${row.path} differs from a fresh capture (${sameProfile(inTree, files) ? 'sidecar' : 'profile'}); a released profile is never overwritten`
        )
      row.status = 'delivered'
      row.gate = {
        gates: ['contracts'],
        ok: true,
        note:
          mode === 'deliver'
            ? 'already in the tree, identical; gate run over the whole tree at the end'
            : 'run once over the whole tree by the verify command'
      }
    } else if (mode === 'deliver') {
      const placed = await serialized(() =>
        publishProfile({
          card,
          files,
          designJson,
          gate: async () => {
            row.gate = await runGate(
              card.platform === 'wordpress' ? ['contracts', 'wordpress-superseded'] : ['contracts']
            )
          }
        })
      )
      row.path = placed.dir
      row.status = 'delivered'
    } else {
      const lower = nearestLowerProfile(row.platform, row.template, row.version)
      if (lower !== null) {
        row.status = 'served-by-lower'
        row.servedBy = lower
      } else row.status = 'deliverable-not-delivered'
    }
  } catch (e) {
    clearTimeout(t.timer)
    const err = e instanceof StepError ? e : failed(t.step, e?.message ?? String(e))
    say(log, `FAILED ${err.kind} ${err.message}`)
    row.status = err.kind === 'blocked' ? 'blocked' : err.kind === 'unknown' ? 'unknown' : 'failed'
    row.blocker = { step: err.step, kind: err.kind, message: redact(err.message).slice(0, 1200) }
  } finally {
    clearTimeout(t.timer)
    stop.abort()
    // Wait for the target to stop before its stand, project name and scratch are taken away.
    let settled = true
    if (working) {
      settled = await Promise.race([
        working.then(
          () => true,
          () => true
        ),
        sleep(60_000).then(() => false)
      ])
      if (!settled) {
        row.teardownFailed =
          'the target did not stop within 60s of being cancelled; its stand, project name and scratch folder are kept'
        if (t.stand) heldStands.add(t.stand)
        runState.unsettled = true
      }
    }
    shutdown.signal.removeEventListener('abort', onShutdown)
    if (t.stand && settled) t.stand.ownerStopped = true
    if (t.stand && settled) {
      try {
        await t.stand.down()
      } catch (e) {
        row.teardownFailed = e.message
      }
    }
    if (project && settled) ctx.projects.release(project)
    if (settled && !o['keep-scratch'])
      rmSync(path.join(ctx.scratch, `${card.slug}-${card.platform}`), { recursive: true, force: true })
    row.seconds = Math.round((Date.now() - started) / 1000)
    say(log, `result ${row.status} in ${row.seconds}s`)
  }
  return row
}

export function summarize(rows) {
  const by = {}
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1
  return by
}

const within = (a, b) => a === b || a.startsWith(b + path.sep)

// realpath of the deepest part of `p` that exists, with the rest appended: lets a path be judged
// before anything is created.
function resolvedPath(p) {
  let cur = path.resolve(p)
  const tail = []
  while (!existsSync(cur)) {
    tail.unshift(path.basename(cur))
    cur = path.dirname(cur)
  }
  return path.join(realpathSync(cur), ...tail)
}

/** Judges the scratch base without creating anything: not in the repository, not the artifacts or inside them. */
export function checkScratchBase(base, artifacts, report) {
  const realBase = resolvedPath(base)
  const realArtifacts = resolvedPath(artifacts)
  if (within(realBase, realpathSync(REPO_ROOT)))
    throw failed('options', '--scratch must be outside the repository')
  // Under the artifacts is fine (only the run's own child folder is ever deleted); the artifacts themselves,
  // or a folder holding them, is not: evidence is never scratch.
  if (within(realArtifacts, realBase))
    throw failed('options', '--scratch must not be, or contain, --artifacts: evidence is never scratch')
  if (report && within(resolvedPath(report), realBase))
    throw failed('options', '--scratch must not contain --report')
  return realBase
}

/**
 * Each run owns a fresh folder made by mkdtemp under the scratch base; only that folder is ever
 * deleted. The base is judged before it is created, and again after (a symlink may have appeared).
 */
export function prepareScratch(base, artifacts, prefix, report) {
  checkScratchBase(base, artifacts, report)
  mkdirSync(base, { recursive: true })
  return mkdtempSync(path.join(checkScratchBase(base, artifacts, report), `${prefix}-scratch-`))
}

async function runBatch(command, o) {
  const mode = command === 'capture' ? 'deliver' : 'verify'
  const platforms = o.platform === 'all' ? Object.keys(PLATFORMS) : [o.platform]
  const scratchBase = o.scratch ?? path.join(o.artifacts, 'scratch')
  checkScratchBase(scratchBase, o.artifacts, o.report)
  if (o.cache) {
    // The download cache outlives the run (archives are sha256-checked on every use) and is never scratch.
    const realCache = resolvedPath(o.cache)
    if (within(realCache, realpathSync(REPO_ROOT)))
      throw failed('options', '--cache must be outside the repository')
    if (within(resolvedPath(o.artifacts), realCache) || within(resolvedPath(scratchBase), realCache))
      throw failed('options', '--cache must not be, or contain, --artifacts or --scratch')
    mkdirSync(o.cache, { recursive: true })
  }
  mkdirSync(o.artifacts, { recursive: true })
  const withoutCard = o['without-card']?.split(',') ?? []
  const disc = await discover({ repo: o.repo, baseline: o.baseline, platform: o.platform, withoutCard })
  const wanted = (list) => (list ? new Set(list.split(',')) : null)
  const only = wanted(o.only)
  const missing = disc.rows.filter((r) => r.state === 'missing' && (!only || only.has(r.slug)))
  if (only)
    for (const s of only)
      if (!disc.rows.some((r) => r.slug === s))
        throw failed('options', `--only names ${s}, which is not a card release in scope`)
  // Pilot templates go first; the rest run in the order of the release list.
  const pilot = wanted(o.pilot)
  const order = [...missing.filter((r) => pilot?.has(r.slug)), ...missing.filter((r) => !pilot?.has(r.slug))]
  // Nothing above made anything but the artifacts folder; from here the scratch folder is released by the
  // `finally` below, unless a target would not stop (its stand is still up, so its files stay too).
  const scratch = prepareScratch(scratchBase, o.artifacts, o['project-prefix'], o.report)
  runState.scratch = scratch
  runState.keepScratch = Boolean(o['keep-scratch'])
  try {
    return await runBatchIn(command, o, { mode, platforms, scratch, disc, order, pilot, only })
  } finally {
    if (!runState.keepScratch && !runState.unsettled && inflight.size === 0 && activeStands.size === 0) {
      rmSync(scratch, { recursive: true, force: true })
      // The lock folder of the pool goes when nothing in it is held.
      const locks = path.join(o.artifacts, `${o['project-prefix']}-locks`)
      if (existsSync(locks) && readdirSync(locks).length === 0)
        rmSync(locks, { recursive: true, force: true })
    }
    runState.scratch = null
  }
}

async function runBatchIn(command, o, { mode, platforms, scratch, disc, order, pilot, only }) {
  const cowork = await prepareCowork(o['cowork-source'], scratch, platforms)
  const coworkVersions = {}
  for (const p of platforms) {
    coworkVersions[p] = o['cowork-version'] ?? readCoworkVersion(cowork.src, p)
    if (!coworkVersions[p])
      throw failed('cowork', `cannot read the ${p} component version; pass --cowork-version`)
  }
  const projects = new ProjectPool(
    o['project-prefix'],
    o.capacityN,
    projectInUse,
    path.join(o.artifacts, `${o['project-prefix']}-locks`)
  )
  const ctx = {
    repo: o.repo,
    scratch,
    cache: o.cache ?? path.join(scratch, 'cache'),
    cowork,
    coworkVersions,
    projects,
    platforms,
    baselineEvidence: o['baseline-evidence']
  }
  const started = Date.now()
  const pilotRows = []
  const rows = []
  const pilotSet = order.filter((r) => pilot?.has(r.slug))
  const rest = order.filter((r) => !pilot?.has(r.slug))
  // The pilot runs alone first and must come back before the rest is started.
  for (const batch of [pilotSet, rest]) {
    const got = await pool(
      batch,
      o.jobsN,
      (card) => {
        const p = processTarget(card, o, ctx, mode)
        const drop = () => inflight.delete(p)
        inflight.add(p)
        p.then(drop, drop)
        return p
      },
      { onError: () => shutdown.abort() }
    )
    rows.push(...got)
    if (batch === pilotSet) pilotRows.push(...got)
  }
  for (const b of disc.broken.filter((x) => !only || only.has(x.slug))) {
    rows.push({
      template: b.slug,
      platform: b.platform,
      tag: b.tag,
      version: null,
      shape: null,
      status: 'blocked',
      capture: null,
      gate: null,
      bind: null,
      content: null,
      path: null,
      blocker: { step: 'discovery', kind: 'blocked', message: redact(b.reason).slice(0, 1200) },
      evidence: null,
      seconds: 0
    })
  }
  const leftover = await teardownAll()
  const report = {
    schema: 'tracy-batch-contracts-report/v1',
    command,
    repo: o.repo,
    baseline: o.baseline,
    platforms,
    releasesSeen: disc.releasesSeen,
    cardReleases: disc.rows.length + disc.broken.length,
    existing: disc.rows
      .filter((r) => r.state === 'exists')
      .map((r) => ({ template: r.slug, platform: r.platform, version: r.version })),
    excluded: disc.excluded.filter((e) => !e.reason.startsWith('out of scope')),
    coworkSource: cowork.fingerprint,
    coworkVersions,
    pilot: [...(pilot ?? [])],
    ...(o['without-card'] ? { withoutCard: o['without-card'].split(',') } : {}),
    rows,
    summary: summarize(rows),
    teardownFailures: leftover,
    seconds: Math.round((Date.now() - started) / 1000),
    projectPrefix: o['project-prefix']
  }
  if (mode === 'deliver' || mode === 'verify') {
    // The whole tree, once, after every placement: contracts for the profiles, and the two gates the
    // templates and questions share with them.
    try {
      report.finalGate = await runGate([
        'contracts',
        'questions',
        'design-templates',
        'wordpress-superseded',
        'wordpress-editions',
        'wordpress-demo-trim',
        'joomla-multilingual',
        'joomla-demo-trim'
      ])
    } catch (e) {
      report.finalGate = { ok: false, error: e.message }
    }
  }
  if (o.report) {
    mkdirSync(path.dirname(o.report), { recursive: true })
    writeFileSync(o.report, jsonStable(report))
  }
  return report
}

// ───────────────────────────── notes, journal, verify-report ─────────────────────────────

const cell = (v) => (v === null || v === undefined ? '—' : String(v)).replace(/\|/g, '\\|')

export function renderNotes(report) {
  const done = report.rows.filter((r) => r.status === 'delivered')
  const rest = report.rows.filter((r) => r.status !== 'delivered')
  const lines = [
    '# Batch content contracts for every template with a Design inspiration card',
    '',
    `Source: releases of \`${report.repo}\`, ${report.releasesSeen} releases read, ${report.cardReleases} releases with a card in scope (${report.platforms.join(', ')}). Baseline: \`${report.baseline}\`.`,
    `Components used to bind: ${Object.entries(report.coworkVersions)
      .map(([p, v]) => `${p} \`${v}\``)
      .join(
        ', '
      )} at \`${report.coworkSource.head}\` (read from the checkout's HEAD; ${report.coworkSource.uncommittedPaths} uncommitted paths not used).`,
    `Already present at the right version (${report.existing.length}): ${report.existing.map((e) => `${e.template}/${e.platform}@${e.version}`).join(', ') || '—'}.`,
    '',
    `Total: ${report.rows.length} rows — delivered ${done.length}, not delivered ${rest.length} (${Object.entries(
      report.summary
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}).`,
    '',
    '| template | platform | version | path | capture | gate | bind | content.read | time (s) | status | evidence |',
    '|---|---|---|---|---|---|---|---|---|---|---|'
  ]
  for (const r of report.rows) {
    const cap = r.capture
      ? `${r.capture.entities} items / ${r.capture.slots} slots / ${r.capture.files} files, 2 runs byte-identical`
      : '—'
    const gate = r.gate ? (r.gate.ok ? 'contracts pass' : 'red') : '—'
    const bind = r.bind ? `bound, inspect ${r.bind.inspect.slots} slots` : '—'
    const read = r.content ? `HTTP ${r.content.http}, ${r.content.contents} items` : '—'
    lines.push(
      `| ${[r.template, r.platform, r.version, r.shape, cap, gate, bind, read, r.seconds, r.status, r.evidence].map(cell).join(' | ')} |`
    )
  }
  lines.push('', '## Not delivered and why', '')
  if (rest.length === 0) lines.push('None.')
  for (const r of rest)
    lines.push(
      `- **${r.template}/${r.platform} ${cell(r.version)}** (${r.status}) — step \`${r.blocker?.step ?? '—'}\`: ${r.blocker?.message ?? r.status}`
    )
  lines.push('')
  return `${lines.join('\n')}\n`
}

const JOURNAL_LINE = /^- \*\*.+\*\* — .+ · .+ · `[^`]+` · \d{2}\/\d{2}\/\d{4}\s*$/m

export function checkJournal(text, fileName) {
  const problems = []
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(fileName))
    problems.push(`journal file name ${fileName} is not YYYY-MM-DD-<slug>.md`)
  else {
    const [y, m, d] = fileName.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
      problems.push(`journal date in ${fileName} does not exist`)
  }
  if (!JOURNAL_LINE.test(text))
    problems.push('journal has no entry line `- **<task>** — <who> · #<issue/PR> · `<branch>` · dd/mm/yyyy`')
  if (!/\*\*Chạm ai:\*\*/.test(text)) problems.push('journal has no `**Chạm ai:**` line')
  return problems
}

export function checkNotes(text, report) {
  const problems = []
  const rows = text.split('\n').filter((l) => /^\| [a-z][^|]* \| (joomla|wordpress) \|/.test(l))
  if (rows.length !== report.rows.length)
    problems.push(`notes table has ${rows.length} rows, the report has ${report.rows.length}`)
  for (const r of report.rows) {
    if (!rows.some((l) => l.startsWith(`| ${r.template} | ${r.platform} | ${cell(r.version)} |`)))
      problems.push(`notes table has no row for ${r.template}/${r.platform} ${cell(r.version)}`)
  }
  const done = report.rows.filter((r) => r.status === 'delivered').length
  if (!text.includes(`delivered ${done}, not delivered ${report.rows.length - done}`))
    problems.push('notes totals do not match the report')
  return problems
}

/** Staged paths allowed for this task: contract profiles, the tool and its tests, notes and journal. */
export function stagedScopeProblems(staged) {
  const allowed = [
    /^packages\/cms\/tracy-quickstart-tools\/(batch-contracts\.mjs|README\.md|test\/batch-contracts\.test\.mjs)$/,
    /^packages\/cms\/tracy-wordpress-quickstart\/scripts\/capture-[a-z-]+\.mjs$/,
    /^packages\/cms\/tracy-wordpress-quickstart\/test\/[a-z-]+\.test\.mjs$/,
    /^packages\/cms\/tracy-joomla-quickstart\/(test\/capture-contract\.test\.mjs|scripts\/capture-contract\.py)$/,
    /^packages\/cms\/tracy-(joomla|wordpress)-quickstart\/contracts\/[a-z][a-z0-9-]*\/(j6|wp7)\/\d+\.\d+\.\d+(\/[A-Za-z0-9._-]+|\.design\.json)$/,
    /^tasks\/batch-content-contracts\.md$/,
    /^tasks\/nhat-ky\/2026-\d{2}-\d{2}-batch-content-contracts\.md$/
  ]
  return staged
    .filter((f) => !allowed.some((re) => re.test(f)))
    .map((f) => `staged ${f} is outside this task's scope`)
}

async function verifyReport(o) {
  const problems = []
  const report = JSON.parse(readFileSync(o.report, 'utf8'))
  if (report.schema !== 'tracy-batch-contracts-report/v1')
    problems.push('report schema is not tracy-batch-contracts-report/v1')
  if (report.command !== 'verify') problems.push(`the report is from \`${report.command}\`, not \`verify\``)
  if (report.finalGate?.ok !== true)
    problems.push(`final gates did not pass: ${report.finalGate?.error ?? 'missing'}`)
  if ((report.teardownFailures ?? []).length > 0)
    problems.push(`teardown failures: ${report.teardownFailures.join('; ')}`)
  // Discovery again: every card release is existing, delivered, or blocked with a cause.
  const disc = await discover({
    repo: report.repo,
    baseline: o.baseline,
    platform: 'all',
    withoutCard: report.withoutCard ?? []
  }).catch((e) => ({
    error: e
  }))
  if (disc.error)
    problems.push(`discovery could not be repeated (unverified, not a pass): ${disc.error.message}`)
  else {
    const missing = [...disc.rows.filter((r) => r.state === 'missing'), ...disc.broken].map(
      (r) => `${r.platform}/${r.slug}`
    )
    const reported = report.rows.map((r) => `${r.platform}/${r.template}`)
    for (const m of missing)
      if (!reported.includes(m)) problems.push(`card release ${m} has no row in the report`)
    for (const m of reported)
      if (!missing.includes(m)) problems.push(`report row ${m} is no longer a missing card release`)
    for (const r of report.rows) {
      const card = disc.rows.find((c) => c.slug === r.template && c.platform === r.platform)
      if (card && card.version !== r.version)
        problems.push(
          `${r.template}/${r.platform}: release is now ${card.version}, the report verified ${r.version}`
        )
    }
  }
  for (const r of report.rows) {
    if (r.status === 'delivered') {
      const dir = PROFILE_DIR(r.platform, r.template, r.version)
      if (!hasProfile(dir))
        problems.push(
          `${r.template}/${r.platform}: reported delivered but ${path.relative(REPO_ROOT, dir)} is missing`
        )
      for (const need of ['capture', 'bind', 'content'])
        if (!r[need]) problems.push(`${r.template}/${r.platform}: delivered without ${need} evidence`)
      if (r.capture && r.capture.deterministic !== true)
        problems.push(`${r.template}/${r.platform}: capture was not reproducible`)
      if (r.content && !(r.content.http === 200 && r.content.contents > 0))
        problems.push(`${r.template}/${r.platform}: content.read evidence is not a success`)
    } else if (
      r.status === 'served-by-lower' ||
      (r.status === 'deliverable-not-delivered' &&
        nearestLowerProfile(r.platform, r.template, r.version) !== null)
    ) {
      // A patch release served by the nearest lower profile of its major (TCH #816): not a gap.
      const lower = r.servedBy ?? nearestLowerProfile(r.platform, r.template, r.version)
      if (lower === null || !hasProfile(PROFILE_DIR(r.platform, r.template, lower)))
        problems.push(`${r.template}/${r.platform}: served by a lower profile that is not in the tree`)
    } else if (['deliverable-not-delivered', 'failed', 'unknown'].includes(r.status)) {
      problems.push(
        `${r.template}/${r.platform}: status ${r.status} — ${r.blocker?.message ?? 'a profile could be delivered but is not'}`
      )
    } else if (r.status === 'blocked') {
      if (!r.blocker?.message) problems.push(`${r.template}/${r.platform}: blocked without a cause`)
      if (r.version && hasProfile(PROFILE_DIR(r.platform, r.template, r.version)))
        problems.push(`${r.template}/${r.platform}: blocked but a profile is in the tree`)
    }
  }
  if (!existsSync(o.notes)) problems.push(`${o.notes} does not exist`)
  else problems.push(...checkNotes(readFileSync(o.notes, 'utf8'), report))
  if (!existsSync(o.journal)) problems.push(`${o.journal} does not exist`)
  else problems.push(...checkJournal(readFileSync(o.journal, 'utf8'), path.basename(o.journal)))
  if (o['require-staged']) {
    const staged = (await must('git', 'git', ['diff', '--cached', '--name-only'], { cwd: REPO_ROOT })).stdout
      .split('\n')
      .filter(Boolean)
    problems.push(...stagedScopeProblems(staged))
    const unstaged = (await must('git', 'git', ['status', '--porcelain', '-uall'], { cwd: REPO_ROOT })).stdout
      .split('\n')
      .filter((l) => /^( M|\?\?|M |A | D)/.test(l) && !/^[AM] /.test(l))
      .map((l) => l.slice(3))
    for (const f of unstaged)
      if (stagedScopeProblems([f]).length === 0) problems.push(`${f} belongs to this task but is not staged`)
    for (const r of report.rows.filter((x) => x.status === 'delivered')) {
      const dir = path.relative(REPO_ROOT, PROFILE_DIR(r.platform, r.template, r.version))
      const here = existsSync(path.join(REPO_ROOT, dir)) ? readdirSync(path.join(REPO_ROOT, dir)).sort() : []
      for (const f of [...here.map((n) => `${dir}/${n}`), `${dir}.design.json`])
        if (!staged.includes(f) && !(await isCommitted(f))) problems.push(`${f} is not staged`)
    }
  }
  if (o['require-cleanup']) {
    const prefix = o['project-prefix'] ?? report.projectPrefix
    const left = []
    for (let i = 1; i <= 99; i++) {
      const name = `${prefix}-${String(i).padStart(2, '0')}`
      if (await projectInUse(name).catch(() => true)) left.push(name)
    }
    if (left.length > 0) problems.push(`compose projects with resources left: ${left.join(', ')}`)
    const base = o.scratch ?? (o.report ? path.join(path.dirname(o.report), 'scratch') : '/tmp')
    const mine = existsSync(base) ? readdirSync(base).filter((n) => n.startsWith(`${prefix}-scratch`)) : []
    for (const n of mine) problems.push(`scratch ${path.join(base, n)} still exists`)
  }
  return problems
}

async function isCommitted(rel) {
  const r = await run('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd: REPO_ROOT })
  return r.code === 0
}

// ───────────────────────────── main ─────────────────────────────

async function main(argv) {
  const [command, ...rest] = argv
  if (!command || !OPTIONS[command]) {
    console.error(`usage: batch-contracts.mjs <${Object.keys(OPTIONS).join('|')}> [options]`)
    return 2
  }
  let parsed
  try {
    parsed = parseArgs({ args: rest, options: OPTIONS[command], strict: true })
  } catch (e) {
    console.error(`batch-contracts: ${e.message}`)
    return 2
  }
  const { errors, value } = validateOptions(command, parsed.values)
  if (errors.length > 0) {
    for (const e of errors) console.error(`batch-contracts: ${e}`)
    return 2
  }
  let stopping = false
  const stop = async (signal) => {
    if (stopping) return
    stopping = true
    console.error(`batch-contracts: ${signal}, stopping the targets before their stands are taken down`)
    shutdown.abort()
    for (const c of children) c.kill('SIGKILL')
    // Stands and scratch go only after every target has stopped; a target that will not stop keeps its own.
    const stopped = await Promise.race([
      Promise.allSettled(inflight).then(() => true),
      sleep(180_000).then(() => false)
    ])
    if (!stopped) runState.unsettled = true
    const left = await teardownAll()
    for (const l of left) console.error(`batch-contracts: ${l}`)
    if (
      runState.scratch &&
      !runState.keepScratch &&
      !runState.unsettled &&
      inflight.size === 0 &&
      activeStands.size === 0
    )
      rmSync(runState.scratch, { recursive: true, force: true })
    process.exit(130)
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  try {
    if (command === 'discover') {
      const d = await discover({
        repo: value.repo,
        baseline: value.baseline,
        platform: value.platform,
        withoutCard: value['without-card']?.split(',') ?? []
      })
      const out = JSON.stringify(
        { ...d, rows: d.rows.map((r) => ({ ...r, assets: undefined, install: undefined })) },
        null,
        2
      )
      if (value.report) writeFileSync(value.report, `${out}\n`)
      else console.log(out)
      return 0
    }
    if (command === 'capture' || command === 'verify') {
      const report = await runBatch(command, value)
      console.log(
        JSON.stringify({ summary: report.summary, rows: report.rows.length, finalGate: report.finalGate?.ok })
      )
      const bad =
        report.rows.filter((r) => !['delivered', 'blocked', 'served-by-lower'].includes(r.status)).length +
        report.teardownFailures.length
      return bad > 0 || report.finalGate?.ok !== true ? 1 : 0
    }
    if (command === 'render-notes') {
      const extra = value.append ? `\n${readFileSync(value.append, 'utf8').trim()}\n` : ''
      writeFileSync(
        value.out,
        renderNotes(JSON.parse(readFileSync(value.report, 'utf8'))).trimEnd() + `\n${extra}`
      )
      return 0
    }
    if (command === 'verify-report') {
      const problems = await verifyReport(value)
      for (const p of problems) console.error(`batch-contracts: ${p}`)
      console.log(JSON.stringify({ ok: problems.length === 0, problems: problems.length }))
      return problems.length === 0 ? 0 : 1
    }
  } catch (e) {
    console.error(`batch-contracts: ${redact(e instanceof Error ? e.message : String(e))}`)
    await teardownAll()
    return e instanceof StepError && e.kind === 'unknown' ? 3 : 1
  } finally {
    await teardownAll()
  }
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
