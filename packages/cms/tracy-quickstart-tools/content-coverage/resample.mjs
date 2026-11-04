#!/usr/bin/env node
// Resample a Joomla contract's text samples from the demo database, no stand and no browser (lib/inline-markup.mjs).
// A whole-unit slot captured before `capture-contract.py --inline-markup` holds its words only ("More Blogs" for
// "More<br><span>Blogs</span>"); this reads each text slot's stored value from the quickstart's dump (the installer's
// `installation/sql/mysql/custom.sql`, or a `database.sql[.gz]`, its UPDATE and DELETE fixes applied) and measures
// `inlineMarkupLost`. With --write it rewrites only the `sample` of the slots whose markup reads as the same words
// (keys, roles, groups, limits and fits stay), and writes the `inlineMarkup` block into content-coverage.json beside the
// contract, which the template kit's self-check `inlineMarkupLost` reads. A coverage file that was current for the map
// keeps being current: the samples changed in markup only, and the audit compares samples by their words (normText).
//
//   node packages/cms/tracy-quickstart-tools/content-coverage/resample.mjs \
//     --contract <contract dir> --db-dump <custom.sql | database.sql[.gz]> [--write] [--sidecar]
//
// --sidecar is for a RELEASED contract, whose content map is sealed (the Claude Cowork plugin binds every site to its
// hash; ADR 0038 decision 6, ADR 0044): the map is never written, the markup samples go into the coverage file's
// `inlineMarkup.samples` (slot key -> sample), which the template kit reads after the map's own sample
// (`template-kit/lib/contract-read.mjs`), and `lost` counts the slots neither carries. The next contract version takes
// the markup into its map at capture (`capture-contract.py --inline-markup`).
//
// Then settle the kit beside it: `template-kit/cli.mjs samples` (its README). Needs `php` (unit-markup.php).
// Exit: 0 nothing lost · 1 a slot still loses its inline markup, or a stored value is not the slot's words ·
// 2 usage or file error.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { COVERAGE_FILE } from './lib/coverage-file.mjs'
import { inlineMarkupBlock, inlineMarkupOf } from './lib/inline-markup.mjs'
import { readDump } from './lib/sql-dump.mjs'

const USAGE = 'usage: resample.mjs --contract <dir> --db-dump <sql[.gz]> [--write] [--sidecar]'

function parseArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  return o
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const json = (doc) => `${JSON.stringify(doc, null, 2)}\n`

function main(argv) {
  const o = parseArgs(argv)
  if (typeof o.contract !== 'string' || typeof o['db-dump'] !== 'string') {
    console.error(USAGE)
    return 2
  }
  const mapFile = join(resolve(o.contract), 'content-map.json')
  const dumpFile = resolve(o['db-dump'])
  if (!existsSync(mapFile) || !existsSync(dumpFile)) {
    console.error(`missing ${existsSync(mapFile) ? dumpFile : mapFile}`)
    return 2
  }
  const mapBytes = readFileSync(mapFile)
  const map = JSON.parse(mapBytes.toString('utf8'))
  const { tables, changes } = readDump(dumpFile, { changes: true })
  const sidecar = o.sidecar === true
  // A sealed map is resampled on a copy: what the copy's slots read is what the sidecar carries.
  const target = sidecar ? structuredClone(map) : map
  const r = inlineMarkupOf({ map: target, tables, write: sidecar || o.write === true })
  const bySlot = new Map((target.slots ?? []).map((s) => [s.key, s]))
  const samples = sidecar
    ? Object.fromEntries([...r.resampled].sort().map((key) => [key, bySlot.get(key).sample]))
    : undefined
  const block = inlineMarkupBlock(r, {
    dump: { file: basename(dumpFile), sha256: sha(readFileSync(dumpFile)) },
    samples
  })
  console.log(
    JSON.stringify({
      checked: r.checked,
      unread: r.unread,
      resampled: r.resampled.length,
      inlineMarkupLostBefore: r.lostBefore.length,
      inlineMarkupLost: r.lost.length,
      mismatched: r.mismatched,
      dumpChanges: changes
    })
  )
  for (const key of r.lost)
    console.error(`slot ${key}: its stored value marks words inline, its sample does not`)
  if (o.write === true) {
    const newBytes = sidecar ? mapBytes : Buffer.from(json(map))
    if (!sidecar) writeFileSync(mapFile, newBytes)
    const coverageFile = join(resolve(o.contract), COVERAGE_FILE)
    if (existsSync(coverageFile)) {
      const doc = JSON.parse(readFileSync(coverageFile, 'utf8'))
      // Restamped only when the coverage was measured on the map as it was: the words of every slot are unchanged, so
      // a new audit can only match more (a marked sample also indexes each of its pieces). The old digest is named.
      const was = sha(mapBytes)
      const now = sha(newBytes)
      const restamp = doc.contract?.contentMapSha256 === was && was !== now
      if (restamp) doc.contract.contentMapSha256 = now
      const from = restamp ? was : was === now ? doc.inlineMarkup?.restampedFrom : undefined
      doc.inlineMarkup = { ...block, ...(from ? { restampedFrom: from } : {}) }
      writeFileSync(coverageFile, json(doc))
    } else console.error(`no ${COVERAGE_FILE} beside the contract: the inlineMarkup block was not written`)
  }
  return r.lost.length || r.mismatched.length ? 1 : 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
