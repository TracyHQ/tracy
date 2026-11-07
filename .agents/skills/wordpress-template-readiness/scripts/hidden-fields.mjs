#!/usr/bin/env node
// Keep the five hand-declared hidden fields of a WordPress template kit across a rebuild (references/kit-rebuild.md).
// The save and the replay are the Joomla skill's own (`joomla-template-readiness/scripts/hidden-fields.mjs`: the five
// fields and the kit tool commands are the same on both platforms); one thing differs on WordPress: `legal-layout`
// checks a named block template against the theme's `templates` folder, so a replayed `--layout` needs `--webroot`.
//
//   node hidden-fields.mjs save --kit <template-kit.json> --to <saved.json>
//   node hidden-fields.mjs replay --from <saved.json> --kit <template-kit.json> --webroot <dir holding the theme> [--dry-run]
//
// Run from the repository root. Exit 0 done, 1 a replayed command failed, 2 usage or read error.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { commandsOf, savedOf } from '../../joomla-template-readiness/scripts/hidden-fields.mjs'

export { savedOf }

const CLI = 'packages/cms/tracy-quickstart-tools/template-kit/cli.mjs'

/**
 * The kit tool commands that declare `saved` again on `kitFile`: the Joomla ones, with `--webroot` on a legal layout that
 * names a block template (a `--none` checks nothing and needs none).
 * @param {any} saved @param {string} kitFile @param {string} webroot
 */
export function wordpressCommandsOf(saved, kitFile, webroot) {
  return commandsOf(saved, kitFile).map((args) =>
    args[0] === 'legal-layout' && args.includes('--layout') ? [...args, '--webroot', webroot] : args
  )
}

/** @param {string[]} argv @returns {number} */
export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      kit: { type: 'string' },
      to: { type: 'string' },
      from: { type: 'string' },
      webroot: { type: 'string' },
      'dry-run': { type: 'boolean' }
    }
  })
  const [verb] = positionals
  try {
    if (verb === 'save' && values.kit && values.to) {
      const saved = savedOf(JSON.parse(readFileSync(values.kit, 'utf8')))
      writeFileSync(values.to, `${JSON.stringify(saved, null, 2)}\n`)
      process.stdout.write(`saved ${Object.keys(saved).join(', ') || 'nothing (no field declared)'}\n`)
      return 0
    }
    if (verb === 'replay' && values.kit && values.from && values.webroot) {
      const saved = JSON.parse(readFileSync(values.from, 'utf8'))
      for (const args of wordpressCommandsOf(saved, values.kit, values.webroot)) {
        process.stdout.write(`node ${CLI} ${args.map((a) => JSON.stringify(a)).join(' ')}\n`)
        if (!values['dry-run']) execFileSync(process.execPath, [CLI, ...args], { stdio: 'inherit' })
      }
      return 0
    }
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    return e && typeof e === 'object' && 'status' in e ? 1 : 2
  }
  process.stderr.write(
    'usage: hidden-fields.mjs save --kit <template-kit.json> --to <saved.json>\n' +
      '       hidden-fields.mjs replay --from <saved.json> --kit <template-kit.json> --webroot <dir> [--dry-run]\n'
  )
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2))
