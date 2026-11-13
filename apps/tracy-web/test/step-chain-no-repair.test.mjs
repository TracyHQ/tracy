// The new build path has no repair pass and no site check inside a build (ADR 0047, decisions 1 and 3; #591): the chain's
// real steps reach neither through any import, so no build can start a repair agent or let a check decide its outcome.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const SOURCES = ['../src/step-chain-steps.js', '../src/sites/brief-engines/step-chain.js']
const importsOf = async (file) =>
  [...(await readFile(new URL(file, import.meta.url), 'utf8')).matchAll(/^import .* from '([^']+)'/gm)].map(
    (m) => m[1]
  )

test('the chain wiring imports no repair pass, no repair agent and no site check', async () => {
  for (const file of SOURCES) {
    const imports = await importsOf(file)
    for (const banned of [/write-step-nine/, /repair-pass/, /repair-agent/, /site-check\//])
      assert.ok(
        !imports.some((i) => banned.test(i)),
        `${file} imports ${imports.find((i) => banned.test(i))}`
      )
  }
})

test('the Write step of the chain is the write step alone', async () => {
  assert.ok((await importsOf(SOURCES[0])).includes('./write-step/write-step.js'))
})
