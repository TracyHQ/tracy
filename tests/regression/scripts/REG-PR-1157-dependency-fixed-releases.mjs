/** No lockfile resolves a package to a release inside a published vulnerable range that has a fix. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// [package, lowest affected release, first fixed release] -- one row per major line, matching the
// `overrides` block of pnpm-workspace.yaml. A release is flagged when lowest <= release < fixed.
const FIXED = [
  ['@ai-sdk/provider-utils', '4.0.0', '4.0.33'],
  ['@modelcontextprotocol/client', '2.0.0', '2.2.0'],
  ['@modelcontextprotocol/sdk', '1.12.0', '1.31.0'],
  ['brace-expansion', '0.0.0', '1.1.21'],
  ['brace-expansion', '2.0.0', '2.1.7'],
  ['brace-expansion', '5.0.0', '5.0.12'],
  ['compression', '0.0.0', '1.8.2'],
  ['dompurify', '3.0.0', '3.4.16'],
  ['fast-uri', '3.0.0', '3.1.8'],
  ['fflate', '0.8.0', '0.8.3'],
  ['http-cache-semantics', '0.0.0', '4.2.1'],
  ['ip-address', '10.0.0', '10.7.1'],
  ['pnpm', '11.0.0', '11.11.0'],
  ['proxy-addr', '0.0.0', '2.0.8'],
  ['qs', '6.0.0', '6.16.0'],
  ['sharp', '0.35.0', '0.35.5'],
  ['source-map-js', '1.0.0', '1.2.2'],
  ['undici', '7.0.0', '7.29.1']
]

// apps/tracy-web installs from its own lockfile. `@ai-sdk/provider-utils` stays there: it is pinned
// exactly by `ai@6.0.33`, which `@scalar/agent-chat` pins in turn, and tracy-web serves only Scalar's
// prebuilt browser bundle, so that copy never runs on the server.
const LOCKFILES = {
  'pnpm-lock.yaml': [],
  'apps/tracy-web/pnpm-lock.yaml': ['@ai-sdk/provider-utils'],
  // The dsh image installs these two vendor trees from their own lockfiles (#1160).
  'vendor/tracy/dsh-better-sidebar/pnpm-lock.yaml': [],
  'vendor/tracy/dsh-passwords/npm-shrinkwrap.json': []
}

function parts(version) {
  return version.split(/[-+]/)[0].split('.').map(Number)
}

function below(a, b) {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
  return a.includes('-') && !b.includes('-')
}

function resolved(lockfile) {
  const found = new Set()
  if (lockfile.endsWith('.json')) {
    for (const [path, entry] of Object.entries(JSON.parse(readFileSync(lockfile, 'utf8')).packages))
      if (path && entry.version)
        found.add(`${path.slice(path.lastIndexOf('node_modules/') + 13)}@${entry.version}`)
    return found
  }
  for (const match of readFileSync(lockfile, 'utf8').matchAll(
    /^ {2}'?((?:@[^/\s']+\/)?[^@\s'/]+)@(\d[^('\s:]*)/gm
  ))
    found.add(`${match[1]}@${match[2]}`)
  return found
}

for (const [lockfile, exempt] of Object.entries(LOCKFILES)) {
  test(`${lockfile} resolves no release inside a fixed vulnerable range`, () => {
    const hits = []
    for (const entry of resolved(lockfile)) {
      const at = entry.lastIndexOf('@')
      const [name, version] = [entry.slice(0, at), entry.slice(at + 1)]
      if (exempt.includes(name)) continue
      for (const [pkg, lowest, fixed] of FIXED)
        if (pkg === name && !below(version, lowest) && below(version, fixed))
          hits.push(`${entry} (fixed in ${fixed})`)
    }
    assert.deepEqual(hits, [])
  })
}
