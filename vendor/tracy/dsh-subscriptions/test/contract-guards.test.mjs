import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// #301: contract guards automate the manual audits. A failure here means
// a documented invariant was broken - fix the code or consciously update
// the exception list in this test and DESIGN.md.

const ROOT = new URL('..', import.meta.url).pathname
const libFiles = []
for (const entry of readdirSync(ROOT + 'lib', { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) libFiles.push('lib/' + entry.name)
  if (entry.isDirectory()) {
    for (const f of readdirSync(ROOT + 'lib/' + entry.name)) {
      if (f.endsWith('.js')) libFiles.push('lib/' + entry.name + '/' + f)
    }
  }
}

test('package identity matches in all three places', () => {
  const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8')).name
  const patch = readFileSync(ROOT + 'cordis.patch.yml', 'utf8')
  const client = readFileSync(ROOT + 'lib/client.js', 'utf8')
    const q = String.fromCharCode(39)
  assert.ok(patch.includes('name: ' + q + pkg + q), 'cordis.patch.yml name must equal the package name')
  assert.ok(client.includes("id: '" + pkg + "'"), 'loader id must equal the package name')
})

test('no orphan exports: every lib export is referenced outside its own declaration', () => {
  const sources = new Map(libFiles.map((f) => [f, readFileSync(ROOT + f, 'utf8')]))
  const tests = readdirSync(ROOT + 'test').filter((f) => f.endsWith(('.mjs')) || f.endsWith('.js'))
    .map((f) => readFileSync(ROOT + 'test/' + f, 'utf8')).join(String.fromCharCode(10))
  const orphans = []
  for (const [f, src] of sources) {
    if (f === 'lib/client.js' || f === 'lib/index.js') continue
    for (const m of src.matchAll(/^export (?:async )?(?:function|const|class|let|var) ([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1]
      const own = (src.match(new RegExp('[^A-Za-z_$]' + name + '[^A-Za-z0-9_$]', 'g')) || []).length
      let ext = 0
      for (const [f2, src2] of sources) {
        if (f2 === f) continue
        ext += (src2.match(new RegExp('[^A-Za-z_$]' + name + '[^A-Za-z0-9_$]', 'g')) || []).length
      }
      ext += (tests.match(new RegExp('[^A-Za-z_$]' + name + '[^A-Za-z0-9_$]', 'g')) || []).length
      if (ext === 0 && own <= 1) orphans.push(f + ' -> ' + name)
    }
  }
  assert.deepEqual(orphans, [], 'orphan exports found: ' + orphans.join(', '))
})

const CYR_ALLOWED = new Set([
  // Strict 0-Cyrillic policy: all Russian strings live externally in dsh-russian-lang
])

const CYR = new RegExp('[' + String.fromCharCode(0x410) + '-' + String.fromCharCode(0x44F) + String.fromCharCode(0x401) + String.fromCharCode(0x451) + ']')

test('cyrillic in lib stays within the documented locale exceptions', () => {
  const offenders = []
  for (const f of libFiles) {
    if (CYR_ALLOWED.has(f)) continue
    if (CYR.test(readFileSync(ROOT + f, 'utf8'))) offenders.push(f)
  }
  assert.deepEqual(offenders, [], 'cyrillic found outside exceptions: ' + offenders.join(', ') + ' - translate it or update DESIGN.md and this allowlist')
})

test('#318: 0 Cyrillic characters across all lib/ files', () => {
  const offenders = []
  for (const f of libFiles) {
    const fileContent = readFileSync(ROOT + f, 'utf8')
    const matches = fileContent.match(CYR)
    if (matches) offenders.push(`${f}: ${matches.length} Cyrillic characters`)
  }
  assert.deepEqual(offenders, [], 'Cyrillic characters found in lib/: ' + offenders.join(', '))
})
