#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/parse-html-bundle.mjs — WordPress changes: none (the WordPress vocabulary lives in lib/html-bundle.mjs).
import { parseBundle } from './lib/html-bundle.mjs'

const args = process.argv.slice(2)
const singleFlag = args.includes('--single')
const dir = args.find((a) => !a.startsWith('-'))

if (!dir) {
  console.error('usage: parse-html-bundle.mjs [--single] <bundle-dir>')
  console.error('')
  console.error('  <bundle-dir>  Path to the template directory.')
  console.error('  --single      Force raw/no-manifest ingestion even if manifest.json exists.')
  console.error('                Auto-detected (no flag needed) when manifest.json is absent.')
  process.exit(2)
}

const map = await parseBundle(dir, { single: singleFlag })
process.stdout.write(JSON.stringify(map, null, 2) + '\n')
