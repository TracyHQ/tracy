#!/usr/bin/env node
import { parseBundle } from './lib/html-bundle.mjs';

const args = process.argv.slice(2);
const singleFlag = args.includes('--single');
const dir = args.find(a => !a.startsWith('-'));

if (!dir) {
  console.error('usage: parse-html-bundle.mjs [--single] <bundle-dir>');
  console.error('');
  console.error('  <bundle-dir>  Path to the template directory.');
  console.error('  --single      Force raw/no-manifest ingestion even if manifest.json exists.');
  console.error('                Auto-detected (no flag needed) when manifest.json is absent.');
  process.exit(2);
}

const map = await parseBundle(dir, { single: singleFlag });
process.stdout.write(JSON.stringify(map, null, 2) + '\n');
