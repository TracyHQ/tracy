#!/usr/bin/env node
/**
 * Refuse a quickstart pack whose webroot archive holds members the site cannot read once unpacked.
 *
 *   node scripts/check-pack-modes.mjs <pack dir | webroot .tar.gz>...
 *
 * A pack dir is read through its `tracy_setting.json` (`install.webroot.file`); a pack without a
 * webroot (a bundle, an EmDash source) has nothing to check and passes with a note. Exit 0 when every
 * file is 0644 or 0755 and every directory 0755, 1 when one is not, 2 when an argument cannot be read.
 *
 * WHY (12/10/2026): eight WordPress quickstarts were packed from sites restored under `umask 077`.
 * Their webroots held 0600/0700 members, provision unpacks with `tar -xm` (modes kept), and every new
 * site failed at its first wp-cli call. The same reader backs STAB-1 of the Template Customization
 * Question Readiness check (`readers/webroot-modes.js`); this script is for the steps that hold a
 * pack before any release exists: packing (skill `quickstart-contract`) and uploading.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  webrootModeProblem,
  webrootModes
} from '../apps/tracy-web/src/lib/template-customization-question-readiness/readers/webroot-modes.js'

/** The webroot archive an argument names, or null when the pack carries none. */
function webrootOf(/** @type {string} */ arg) {
  if (!statSync(arg).isDirectory()) return arg
  const setting = JSON.parse(readFileSync(path.join(arg, 'tracy_setting.json'), 'utf8'))
  const file = setting.install?.webroot?.file
  return file ? path.join(arg, file) : null
}

function main(/** @type {string[]} */ args) {
  if (args.length === 0 || args.some((a) => a.startsWith('-'))) {
    console.error('usage: check-pack-modes.mjs <pack dir | webroot .tar.gz>...')
    return 2
  }
  let failed = false
  for (const arg of args) {
    let file
    let result
    try {
      file = webrootOf(arg)
      if (file === null) {
        console.log(`OK   ${arg}: no webroot archive to check`)
        continue
      }
      result = webrootModes(readFileSync(file))
    } catch (e) {
      console.error(`ERR  ${arg}: ${e instanceof Error ? e.message : String(e)}`)
      return 2
    }
    const problem = webrootModeProblem(path.basename(file), result)
    if (problem) {
      failed = true
      console.log(`FAIL ${problem}`)
    } else
      console.log(
        `OK   ${path.basename(file)}: ${String(result.members)} members, files 0644/0755, directories 0755`
      )
  }
  return failed ? 1 : 0
}

process.exitCode = main(process.argv.slice(2))
