#!/usr/bin/env node
// A `docker` stand-in for the --capture step of joomla-dump.mjs (#73): the web container's file listing and its
// `tar -cf -`, served from the directory $FAKE_WEB_ROOT; every other command (the database statements, the php
// that reads configuration.php) goes to the fake of #41 unchanged.
//   sh -c '<listing script>' sh <web root> <dir>…   → the dirs (of <dir>…) that exist under $FAKE_WEB_ROOT and are not links
//   tar -C <web root> -cf - <dir>…                  → a tar of them (bsdtar/GNU tar on this host, AppleDouble files off)
// $FAKE_CAPTURE_LOG (a file) gets one line per listing or tar it answered.
import { lstatSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const root = process.env.FAKE_WEB_ROOT
const log = (line) => process.env.FAKE_CAPTURE_LOG && appendFileSync(process.env.FAKE_CAPTURE_LOG, `${line}\n`)
const sh = argv.indexOf('sh')
if (root && sh !== -1 && argv[sh + 1] === '-c') {
  const dirs = argv.slice(sh + 5)
  log(`ls ${dirs.join(' ')}`)
  for (const d of dirs) {
    try {
      const st = lstatSync(join(root, d))
      if (st.isDirectory() && !st.isSymbolicLink()) process.stdout.write(`${d}\n`)
    } catch {}
  }
  process.exit(0)
}
const tar = argv.indexOf('tar')
if (root && tar !== -1) {
  const names = argv.slice(argv.indexOf('-', tar) + 1)
  log(`tar ${names.join(' ')}`)
  const r = spawnSync('tar', ['-cf', '-', '-C', root, ...names], { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 1 << 28 })
  process.stdout.write(r.stdout)
  process.exit(r.status ?? 1)
}
const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, '..', 'issue41', 'fake-docker.mjs'), ...argv], { stdio: 'inherit', env: process.env })
process.exit(r.status ?? 1)
