// Entry point for `node --test tests/qa/inventory/test/`. Node 24 resolves a directory argument as a
// module path rather than searching it, so this file loads every `*.test.mjs` in the folder (the files
// also run on their own: `node --test tests/qa/inventory/test/*.test.mjs`).
const { readdirSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

;(async () => {
  const files = readdirSync(__dirname)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
  for (const name of files) await import(pathToFileURL(join(__dirname, name)).href)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
