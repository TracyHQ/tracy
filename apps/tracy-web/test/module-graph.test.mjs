import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'

const SRC = resolve(new URL('../src/', import.meta.url).pathname)
const SHARED = new Set(['lib', 'db'])

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []
  })
}

test('a domain directory imports only lib/ and db/, never another domain', () => {
  const bad = []
  for (const file of files(SRC)) {
    const from = relative(SRC, file).split('/')[0]
    if (from.endsWith('.js') || SHARED.has(from)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const to = relative(SRC, resolve(dirname(file), m[1])).split('/')[0]
      if (to !== from && !SHARED.has(to)) bad.push(`${relative(SRC, file)} → ${m[1]}`)
    }
  }
  assert.deepEqual(bad, [])
})
