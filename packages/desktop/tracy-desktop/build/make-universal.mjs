#!/usr/bin/env node
/**
 * Merge an arm64 and an x64 `Tracy Cowork*.app` into ONE universal app — every Mach-O joined with
 * `lipo`, everything else taken once (it must be byte-identical in both). The install dmg is made from
 * it, so a person downloads one file whatever their chip; updates keep coming from the per-arch zips.
 *
 *   node build/make-universal.mjs <arm64 .app> <x64 .app> <out .app>
 *
 * Called by `build/package.sh` with TRACY_DESKTOP_ARCH=universal, on two UNSIGNED builds: a signature
 * (`_CodeSignature/CodeResources`) differs between the archs, which the merge refuses, and the lipo'd
 * binaries would break it anyway — package.sh signs the merged app afterwards.
 */
import path from 'node:path'

import { makeUniversalApp } from '@electron/universal'

const [arm64, x64, out] = process.argv.slice(2)
if (!arm64 || !x64 || !out) {
  process.stderr.write('usage: make-universal.mjs <arm64 .app> <x64 .app> <out .app>\n')
  process.exit(2)
}
await makeUniversalApp({
  arm64AppPath: path.resolve(arm64),
  x64AppPath: path.resolve(x64),
  outAppPath: path.resolve(out),
  force: true
})
process.stdout.write(`make-universal: ${path.resolve(out)}\n`)
