'use strict'
// `node --test tests/qa/selftest/` (directory form) makes Node resolve the directory to this
// file and run it as the only test file; it loads every *.test.mjs beside it. The glob form
// `node --test 'tests/qa/selftest/*.test.mjs'` runs the same suites without this file.
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const names = fs
  .readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
;(async () => {
  for (const name of names) await import(pathToFileURL(path.join(__dirname, name)).href)
})()
