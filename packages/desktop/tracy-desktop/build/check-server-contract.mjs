#!/usr/bin/env node
/**
 * Prove that an origin still answers every door the desktop shell calls, in the shape the shell
 * reads — not merely "not 404". The doors and their probes live in `server-contract.json`.
 *
 *   node build/check-server-contract.mjs <origin> [--scope packaged|all] [--contract <file>]
 *
 * One PASS/FAIL line per door; exit 1 when any door fails, 2 on bad usage.
 *
 * `--scope packaged` (default) checks the doors a packaged app calls — what a release needs.
 * `--scope all` adds the doors only a source run with its own dsh calls.
 *
 * 🔒 PROBES MUST NOT CREATE STATE. Each probe in the contract is a request the server refuses or
 * answers without writing (bad nonce, malformed secret, signed out). A probe that opens a round or a
 * session would run against production on every release.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const DEFAULT_CONTRACT = fileURLToPath(new URL('../server-contract.json', import.meta.url))
const PROBE_TIMEOUT_MS = 15_000

/**
 * @param {string} file
 * @returns {{ doors: object[] }}
 */
export function loadContract(file = DEFAULT_CONTRACT) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The request a door's probe makes against `origin`, with the door's own method. `{origin}` in a
 * header value is replaced.
 * @param {{ method: string, probe: { path: string, headers?: Record<string, string>, body?: unknown } }} door
 * @param {string} origin
 * @returns {{ url: string, init: RequestInit & { headers: Record<string, string> } }}
 */
export function probeRequest(door, origin) {
  const home = origin.replace(/\/+$/, '')
  const { path: target, headers = {}, body } = door.probe
  const filled = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, String(value).replaceAll('{origin}', home)])
  )
  return {
    url: `${home}${target}`,
    init: {
      method: door.method,
      headers: filled,
      // A redirect IS the answer for some doors; following it would judge the page behind it.
      redirect: 'manual',
      cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string} `null`, `array`, or the `typeof`.
 */
const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/**
 * Whether one value matches one field expectation: a literal, `{type}` or `{startsWith}`.
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 * @throws on an expectation object of any other shape: a typo in the contract must stop the check,
 *   not read as a door that answered wrong.
 */
function matches(actual, expected) {
  if (expected !== null && typeof expected === 'object') {
    if (!Array.isArray(expected) && Object.keys(expected).length === 1) {
      if ('type' in expected) return typeOf(actual) === expected.type
      if ('startsWith' in expected)
        return typeof actual === 'string' && actual.startsWith(expected.startsWith)
    }
    throw new Error(`unknown expectation ${JSON.stringify(expected)}`)
  }
  return actual === expected
}

/**
 * Judge one answer against a door's expectation. Pure: the answer is plain data.
 * @param {{ id: string, expect: {
 *   status: number,
 *   contentType?: string,
 *   headers?: Record<string, string>,
 *   json?: Record<string, unknown>,
 *   location?: { pathname?: string, query?: Record<string, unknown> }
 * } }} door
 * @param {{ status: number, headers: Record<string, string>, body: string }} response - header names lower-case.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function judgeDoor(door, response) {
  const { expect } = door
  const reasons = []
  const header = (name) => response.headers[name.toLowerCase()] ?? ''

  if (response.status !== expect.status) reasons.push(`status ${response.status}, expected ${expect.status}`)

  if (expect.contentType !== undefined) {
    const type = header('content-type').split(';')[0].trim().toLowerCase()
    if (type !== expect.contentType) reasons.push(`content-type "${type}", expected "${expect.contentType}"`)
  }

  for (const [name, value] of Object.entries(expect.headers ?? {})) {
    if (!header(name).toLowerCase().includes(value.toLowerCase()))
      reasons.push(`header ${name} "${header(name)}", expected "${value}"`)
  }

  if (expect.json !== undefined) {
    let parsed
    try {
      parsed = JSON.parse(response.body)
    } catch {
      parsed = undefined
    }
    if (typeOf(parsed) !== 'object') reasons.push(`body is not a JSON object: ${response.body.slice(0, 80)}`)
    else
      for (const [key, expected] of Object.entries(expect.json)) {
        if (!Object.hasOwn(parsed, key)) reasons.push(`field "${key}" missing`)
        else if (!matches(parsed[key], expected))
          reasons.push(
            `field "${key}" is ${JSON.stringify(parsed[key])}, expected ${JSON.stringify(expected)}`
          )
      }
  }

  if (expect.location !== undefined) {
    const raw = header('location')
    let to
    try {
      to = new URL(raw, 'http://relative.invalid')
    } catch {
      to = undefined
    }
    if (raw === '' || to === undefined) reasons.push('no Location header')
    else {
      if (expect.location.pathname !== undefined && to.pathname !== expect.location.pathname)
        reasons.push(`redirects to ${to.pathname}, expected ${expect.location.pathname}`)
      for (const [name, expected] of Object.entries(expect.location.query ?? {})) {
        const value = to.searchParams.get(name)
        if (value === null || !matches(value, expected))
          reasons.push(
            `redirect query ${name}=${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`
          )
      }
    }
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * Probe every door of the contract in scope against `origin`.
 * @param {string} origin
 * @param {{ doors: object[] }} contract
 * @param {{ fetch?: typeof fetch, scope?: 'packaged' | 'all', timeoutMs?: number }} [options]
 * @returns {Promise<{ id: string, method: string, path: string, ok: boolean, reasons: string[] }[]>}
 */
export async function checkServerContract(origin, contract, options = {}) {
  const { fetch: get = fetch, scope = 'packaged', timeoutMs = PROBE_TIMEOUT_MS } = options
  const doors = contract.doors.filter((door) => scope === 'all' || (door.usedBy ?? 'packaged') === 'packaged')
  const results = []
  for (const door of doors) {
    const { url, init } = probeRequest(door, origin)
    let answer
    try {
      const response = await get(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      answer = {
        status: response.status,
        headers: Object.fromEntries(
          [...response.headers].map(([name, value]) => [name.toLowerCase(), value])
        ),
        body: await response.text()
      }
    } catch (error) {
      answer = { lost: String(error?.cause?.message ?? error?.message ?? error) }
    }
    let verdict
    if (answer.lost !== undefined) verdict = { ok: false, reasons: [`request failed: ${answer.lost}`] }
    else
      try {
        verdict = judgeDoor(door, answer)
      } catch (error) {
        verdict = { ok: false, reasons: [`contract error: ${error.message}`] }
      }
    results.push({ id: door.id, method: door.method, path: door.path, ...verdict })
  }
  return results
}

/**
 * @param {{ id: string, method: string, path: string, ok: boolean, reasons: string[] }} result
 * @returns {string}
 */
export function formatResult(result) {
  const head = `${result.ok ? 'PASS' : 'FAIL'}  ${result.method} ${result.path} (${result.id})`
  return result.ok ? head : `${head} — ${result.reasons.join('; ')}`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage = 'usage: check-server-contract.mjs <origin> [--scope packaged|all] [--contract <file>]\n'
  let parsed
  try {
    // Strict: a mistyped option must stop the run, not quietly check less than was asked.
    parsed = parseArgs({
      options: {
        scope: { type: 'string', default: 'packaged' },
        contract: { type: 'string', default: DEFAULT_CONTRACT }
      },
      strict: true,
      allowPositionals: true
    })
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}`)
    process.exit(2)
  }
  const { scope, contract: file } = parsed.values
  const [origin, ...extra] = parsed.positionals
  if (
    !origin ||
    extra.length > 0 ||
    !/^https?:\/\/[^/\s]+\/?$/.test(origin) ||
    !['packaged', 'all'].includes(scope)
  ) {
    process.stderr.write(usage)
    process.exit(2)
  }
  const results = await checkServerContract(origin, loadContract(file), { scope })
  for (const result of results) process.stdout.write(`${formatResult(result)}\n`)
  const failed = results.filter((r) => !r.ok).length
  process.stdout.write(
    `server contract on ${origin} (scope ${scope}): ${results.length - failed} passed, ${failed} failed\n`
  )
  process.exit(failed === 0 ? 0 : 1)
}
