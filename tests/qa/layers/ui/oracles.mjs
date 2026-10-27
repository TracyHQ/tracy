// Loading and checking the ui layer's oracles: document pins, the banned vocabulary and the key set
// of the English dictionaries. Everything an assertion compares against is read here, from files the
// repo owns, never from the page under test.

import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { REPO_ROOT, readJson, readRegular, sha256 } from './artifacts.mjs'
import { docRel } from '../../lib/doc-source.mjs'

const run = promisify(execFile)
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'))

export const PINS_PATH = path.join(REPO_ROOT, 'tests/qa/oracles/ui/pins.json')
export const BANNED_PATH = path.join(REPO_ROOT, 'tests/qa/oracles/ui/banned-vocabulary.json')

/** @returns {Promise<{ pins: Map<string, object>, drift: Map<string, string> }>} drift: oracle id -> reason */
export async function loadPins(root = REPO_ROOT, pinsPath = PINS_PATH) {
  const doc = await readJson(pinsPath)
  const pins = new Map(doc.pins.map((p) => [p.id, p]))
  const drift = new Map()
  for (const pin of pins.values()) {
    let text
    try {
      text = await readRegular(path.join(root, docRel(root, pin.file)), { root })
    } catch (error) {
      drift.set(pin.id, `oracle file ${pin.file} unreadable (${error.code ?? error.message})`)
      continue
    }
    if (sha256(text) !== pin.sha256)
      drift.set(pin.id, `oracle file ${pin.file} changed since the pin (${pin.sha256.slice(0, 12)})`)
    else if (!text.includes(pin.anchor)) drift.set(pin.id, `anchor of ${pin.id} no longer in ${pin.file}`)
  }
  return { pins, drift }
}

export async function loadBanned(file = BANNED_PATH) {
  const doc = await readJson(file)
  if (!Array.isArray(doc.banned) || doc.banned.length === 0)
    throw new Error(`${file}: banned list missing or empty`)
  for (const b of doc.banned) {
    try {
      new RegExp(b.pattern, b.flags)
    } catch (error) {
      throw new Error(`${file}: bad pattern ${b.id}: ${error.message}`)
    }
  }
  return doc.banned
}

/** Keys of an `export const <x> = { ... }` dictionary; spreads are reported, not guessed. */
export function dictionaryKeys(file, text) {
  const ts = requireFromRepo('typescript')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const keys = []
  const unresolved = []
  sf.forEachChild((node) => {
    if (!ts.isVariableStatement(node) || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      return
    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !/^(en|baseEn|\w+En)$/.test(decl.name.text) || !decl.initializer)
        continue
      let init = decl.initializer
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))
        init = init.expression
      if (!ts.isObjectLiteralExpression(init)) {
        unresolved.push(`${file}: ${decl.name.text} is not an object literal`)
        continue
      }
      for (const prop of init.properties) {
        if (ts.isSpreadAssignment(prop))
          unresolved.push(`${file}: spread ${prop.expression.getText(sf)} not expanded`)
        else if (prop.name && (ts.isStringLiteralLike(prop.name) || ts.isIdentifier(prop.name)))
          keys.push(prop.name.text)
        else unresolved.push(`${file}: computed key`)
      }
    }
  })
  return { keys, unresolved }
}

/** The union of keys of every strings.ts dictionary in the repo, with what could not be read. */
export async function loadKeySet(root = REPO_ROOT) {
  const { stdout } = await run(
    'git',
    ['ls-files', '-z', '--', 'packages/**/strings.ts', 'packages/**/strings.tsx'],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 }
  )
  const files = stdout.split('\0').filter(Boolean).sort()
  const all = new Set()
  const unresolved = []
  let skippedPlain = 0
  for (const file of files) {
    const text = await readRegular(path.join(root, file), { root })
    const r = dictionaryKeys(file, text)
    for (const k of r.keys) {
      // A single plain word ("save") is indistinguishable from copy, so only keys with a separator count.
      if (/^[A-Za-z0-9]+([._-][A-Za-z0-9]+)+$/.test(k)) all.add(k)
      else skippedPlain++
    }
    unresolved.push(...r.unresolved)
  }
  return { keys: all, files: files.length, unresolved, skippedPlain }
}
