// The browser UI is served as is from ui/public/: every module it loads must be a relative file inside
// that folder, nothing on the page may load from another host, and its text must be public English.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'
import { uiDir } from '../ui/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UI = join(ROOT, 'ui')

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

function specifiers(source) {
  const found = []
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return
    if (/^(Import|Export(All|Named)?)Declaration$|^ImportExpression$/.test(node.type)) {
      if (node.source?.type === 'Literal') found.push(node.source.value)
      else if (node.type === 'ImportExpression') found.push('<computed import>')
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return found
}

test('uiDir is the served folder and holds the page', () => {
  assert.equal(resolve(uiDir), join(UI, 'public'))
  assert.ok(existsSync(join(uiDir, 'index.html')))
})

test('every module the page loads is a relative file inside the served folder', () => {
  const bad = []
  for (const file of files(uiDir).filter((f) => f.endsWith('.js'))) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), spec)
      if (!spec.startsWith('./') || relative(uiDir, target).startsWith('..') || !existsSync(target))
        bad.push(`${relative(ROOT, file)} → ${spec}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('the page loads scripts and styles from its own folder only', () => {
  const html = readFileSync(join(uiDir, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => !r.startsWith('#'))
  assert.deepEqual(
    refs.filter((r) => !r.startsWith('./') || !existsSync(join(uiDir, r))),
    []
  )
})

test('no non-English letters or internal names anywhere under ui/', () => {
  // Letters only Vietnamese uses (written as escapes so this file passes the same leak scan).
  const VIETNAMESE = /[\u0103\u0102\u0111\u0110\u01a1\u01a0\u01b0\u01af\u1ea0-\u1ef9]/
  const INTERNAL = new RegExp(
    [
      'joom' + 'lart',
      'tracy\\.test',
      'tracy\\.site',
      'cowork\\.tracy',
      '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b',
      '\\b(lee|brian|lucas|akemi|vincent)\\b'
    ].join('|'),
    'i'
  )
  const bad = []
  for (const file of files(UI)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (VIETNAMESE.test(line) || INTERNAL.test(line))
          bad.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
  }
  assert.deepEqual(bad, [])
})

test('the only outside address the UI links to is tracy.ai', () => {
  const hosts = new Set()
  for (const file of files(uiDir))
    for (const m of readFileSync(file, 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi))
      hosts.add(m[1].toLowerCase())
  // Chat hosts are where a draft opens, not addresses the UI calls; www.w3.org is the SVG namespace, never fetched.
  const allowed = new Set(['tracy.ai', 'wa.me', 'zalo.me', 'www.w3.org'])
  assert.deepEqual(
    [...hosts].filter((h) => !allowed.has(h)),
    []
  )
})
