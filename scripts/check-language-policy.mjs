#!/usr/bin/env node
/**
 * English contributions, checked without installing dependencies or executing contributor code.
 * Read this script and its policy from a trusted checkout; --repo is Git data only. Inspect added
 * lines of EVERY new commit, including merges and changes later reverted, plus the final PR diff.
 * Existing text is not a mutable numeric allowance. Moving an old line also requires English.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { englishProblem } from './lib/english-policy.mjs'

const DEFAULT_POLICY = fileURLToPath(new URL('./language-policy.json', import.meta.url))
const ZERO = '0'.repeat(40)
const HASH = /^[a-f0-9]{40}$/
const DIGEST = /^[a-f0-9]{64}$/
const MAX_BLOB = 16 * 1024 * 1024
const MEDIA = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.avif',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf'
])
const ARCHIVES = new Set(['.zip', '.gz', '.tgz', '.tar', '.bz2', '.xz', '.7z', '.pdf', '.jpa', '.jps'])
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function isMedia(bytes, extension) {
  const hex = bytes.subarray(0, 12).toString('hex')
  const ascii = bytes.subarray(0, 12).toString('latin1')
  if (extension === '.png') return hex.startsWith('89504e470d0a1a0a')
  if (['.jpg', '.jpeg'].includes(extension)) return hex.startsWith('ffd8ff')
  if (extension === '.gif') return /^GIF8[79]a/.test(ascii)
  if (extension === '.webp') return ascii.startsWith('RIFF') && ascii.endsWith('WEBP')
  if (extension === '.wav') return ascii.startsWith('RIFF') && ascii.endsWith('WAVE')
  if (extension === '.ico') return hex.startsWith('00000100')
  if (extension === '.woff') return ascii.startsWith('wOFF')
  if (extension === '.woff2') return ascii.startsWith('wOF2')
  if (extension === '.otf') return ascii.startsWith('OTTO')
  if (extension === '.ttf') return hex.startsWith('00010000') || ascii.startsWith('ttcf')
  if (['.avif', '.mp4'].includes(extension)) return ascii.slice(4, 8) === 'ftyp'
  if (extension === '.webm') return hex.startsWith('1a45dfa3')
  if (extension === '.ogg') return ascii.startsWith('OggS')
  if (extension === '.mp3') return ascii.startsWith('ID3') || /^ff[feb][0-9a-f]/.test(hex)
  return false
}

function validPath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.split('/').some((part) => part === '..' || part === '.' || part === '') &&
    !/[\0\r\n\\]/.test(path)
  )
}

function pathPattern(pattern) {
  // Single-segment wildcards only. No directory-wide or recursive exemptions.
  return new RegExp(
    `^${pattern
      .split('*')
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`
  )
}

export function readPolicy(file) {
  const policy = JSON.parse(readFileSync(file, 'utf8'))
  if (policy.version !== 1 || !['translations', 'lines', 'objects'].every((k) => Array.isArray(policy[k])))
    throw new Error('invalid language policy')
  for (const kind of ['translations', 'lines', 'objects']) {
    const seen = new Set()
    for (const rule of policy[kind]) {
      if (!validPath(rule.path) || typeof rule.reason !== 'string' || rule.reason.trim().length < 15)
        throw new Error(`invalid ${kind} exception: path and specific reason required`)
      if (kind === 'translations') {
        if (!rule.path.endsWith('.json') || rule.path.includes('**'))
          throw new Error('translation exceptions must be specific JSON paths')
      } else if (
        rule.path.includes('*') ||
        (kind === 'objects' ? !HASH.test(rule.oid) : !DIGEST.test(rule.sha256)) ||
        (kind === 'lines' && (!Number.isSafeInteger(rule.count) || rule.count < 1))
      ) {
        throw new Error(`invalid ${kind} exception: exact path, SHA256 and count required`)
      }
      const key = `${rule.path}:${rule.sha256 ?? rule.oid ?? ''}`
      if (seen.has(key)) throw new Error(`duplicate ${kind} exception`)
      seen.add(key)
    }
  }
  return policy
}

export function addedLines(diff) {
  const lines = []
  let number = null
  for (const row of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row)
    if (hunk) number = Number(hunk[1])
    else if (number !== null && row.startsWith('+')) lines.push({ line: number++, text: row.slice(1) })
    else if (number !== null && row.startsWith(' ')) number++
  }
  return lines
}

function translationProblem(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return 'translation is not valid JSON'
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'translation must be a JSON object'
  // Inspect original tokens: JSON.parse discards shadowed keys and their values.
  const strings = /"(?:[^"\\]|\\.)*"/g
  for (const match of text.matchAll(strings)) {
    if (/^\s*:/.test(text.slice(match.index + match[0].length)) && englishProblem(JSON.parse(match[0])))
      return 'translation keys must be English identifiers'
  }
  if (/[^\s{}[\],:]/.test(text.replace(strings, ''))) return 'translation leaves must be strings'
  return null
}

export function checkRange({ repo, base, head, policy, pull = null }) {
  const git = (...args) =>
    execFileSync('git', ['-C', repo, ...args], {
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1' }
    })
  if (!HASH.test(base) || !HASH.test(head)) throw new Error('base and head must be full commit SHAs')
  if (git('rev-parse', '--is-shallow-repository').toString().trim() !== 'false')
    throw new Error('full history required; refusing a shallow scan')
  for (const sha of [base, head]) {
    if (git('cat-file', '-t', sha).toString().trim() !== 'commit') throw new Error('expected commit object')
  }
  const mergeBases = git('merge-base', '--all', base, head).toString().trim().split('\n')
  if (mergeBases.length !== 1 || !HASH.test(mergeBases[0])) throw new Error('one merge base required')
  const commits = git('rev-list', '--reverse', '--topo-order', head, '--not', base)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
  if (commits.length > 2000) throw new Error('more than 2000 new commits; split the pull request')
  const findings = []
  const report = (commit, path, line, problem) => {
    if (findings.length >= 200) throw new Error('at least 200 language findings; scan failed')
    findings.push({ commit, path, line, problem })
  }
  if (pull) {
    if (pull.base.sha !== base || pull.head.sha !== head) throw new Error('event SHA does not match scan')
    for (const [field, text] of [
      ['PR title', pull.title],
      ['PR description', pull.body ?? '']
    ]) {
      const problem = englishProblem(text)
      if (problem) report(head, field, 1, problem)
    }
  }
  const blobs = new Map()
  const readBlob = (oid) => {
    if (oid === ZERO) return Buffer.alloc(0)
    if (blobs.has(oid)) return blobs.get(oid)
    const size = Number(git('cat-file', '-s', oid).toString().trim())
    if (!Number.isSafeInteger(size) || size > MAX_BLOB)
      throw new Error(`text blob exceeds ${MAX_BLOB} bytes; review explicitly`)
    const bytes = git('cat-file', 'blob', oid)
    if (blobs.size > 128) blobs.clear()
    blobs.set(oid, bytes)
    return bytes
  }
  const decode = (bytes) => {
    if (bytes.includes(0)) throw new Error('unexpected NUL in text; binary content needs explicit review')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  const patterns = policy.translations.map((r) => pathPattern(r.path))
  const checked = new Set()
  let files = 0
  const scanDiff = (from, to) => {
    const raw = new TextDecoder('utf-8', { fatal: true })
      .decode(
        git(
          'diff',
          '--raw',
          '--no-abbrev',
          '-z',
          '--no-renames',
          '--no-ext-diff',
          '--no-textconv',
          from,
          to,
          '--'
        )
      )
      .split('\0')
    for (let i = 0; i < raw.length - 1; i += 2) {
      const entry = /^:(\d+) (\d+) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])$/.exec(raw[i])
      if (!entry) throw new Error('unexpected raw diff record')
      const [, , mode, oldOid, oid, status] = entry
      const path = raw[i + 1]
      if (status === 'D') continue
      if (!validPath(path)) throw new Error('unsupported Git path')
      const key = `${path}:${oldOid}:${oid}`
      if (checked.has(key)) continue
      checked.add(key)
      files++
      const pathProblem = englishProblem(path)
      if (oldOid === ZERO && pathProblem) report(to, path, 0, 'new paths must use English names')
      // Pins, archives and large opaque assets are a separate review boundary, never text success.
      if (policy.objects.some((r) => r.path === path && r.oid === oid)) continue
      if (mode === '160000') {
        report(to, path, 0, 'submodule update needs an exact reviewed object exception')
        continue
      }
      const extension = extname(path).toLowerCase()
      try {
        const bytes = readBlob(oid)
        if (MEDIA.has(extension) && mode !== '120000' && isMedia(bytes, extension)) continue
        if (ARCHIVES.has(extension)) {
          report(to, path, 0, 'archive/document needs an exact reviewed object exception')
          continue
        }
        const text = decode(bytes)
        if (mode !== '120000' && patterns.some((p) => p.test(path))) {
          const problem = translationProblem(text)
          if (problem) report(to, path, 1, problem)
          continue
        }
        decode(readBlob(oldOid))
        const changes =
          oldOid === ZERO
            ? text.split('\n').map((text, index) => ({ line: index + 1, text }))
            : addedLines(
                git(
                  'diff',
                  '--no-ext-diff',
                  '--no-textconv',
                  '--no-color',
                  '--no-renames',
                  '--text',
                  '--unified=0',
                  oldOid,
                  oid,
                  '--'
                ).toString('utf8')
              )
        // Enforce exception cardinality on the whole candidate, not just its newly added lines.
        const counts = new Map()
        for (const line of text.split('\n')) {
          const hash = sha256(line)
          counts.set(hash, (counts.get(hash) ?? 0) + 1)
        }
        for (const { line, text: content } of changes) {
          const problem = englishProblem(content)
          if (!problem) continue
          const hash = sha256(content)
          if (policy.lines.some((r) => r.path === path && r.sha256 === hash && counts.get(hash) <= r.count))
            continue
          report(to, path, line, problem)
        }
      } catch (error) {
        report(to, path, 0, `not scanned: ${error.message}`)
      }
    }
  }
  for (const commit of commits) {
    const message = git('show', '-s', '--format=%B', commit).toString('utf8')
    const problem = englishProblem(message)
    if (problem) report(commit, 'commit message', 1, problem)
    const parents = git('show', '-s', '--format=%P', commit).toString().trim().split(' ').filter(Boolean)
    if (!parents.length) throw new Error('unexpected root commit in contribution range')
    scanDiff(parents[0], commit)
  }
  // Also inspect the final contribution relative to the merge base, including merge resolutions.
  scanDiff(mergeBases[0], head)
  return { commits: commits.length, files, findings }
}

export function main(args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({
      args,
      options: {
        repo: { type: 'string', default: '.' },
        base: { type: 'string' },
        head: { type: 'string' },
        policy: { type: 'string', default: DEFAULT_POLICY },
        event: { type: 'string' }
      }
    })
    const pull = values.event ? JSON.parse(readFileSync(values.event, 'utf8')).pull_request : null
    if (values.event && !pull) throw new Error('pull_request event required')
    const result = checkRange({
      repo: resolve(values.repo),
      base: values.base,
      head: values.head,
      policy: readPolicy(values.policy),
      pull
    })
    console.log(JSON.stringify(result, null, 2))
    return result.findings.length ? 1 : 0
  } catch (error) {
    console.error(`English contribution check could not complete: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
