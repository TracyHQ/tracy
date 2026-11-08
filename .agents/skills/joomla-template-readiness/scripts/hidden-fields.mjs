#!/usr/bin/env node
// Keep the hand-declared site fields of a template kit across a build into an EMPTY folder. `template-kit/cli.mjs build`
// and `assemble` keep them themselves when --out already holds a kit (lib/declared-site-fields.mjs); a build into an
// empty folder has no kit to keep them from, so save them from the kit beside the contract before the build and replay
// them after it, through the kit tool's own commands (so every rule of those commands still applies). The fields are the
// tool's own list (DECLARED_SITE_FIELDS), so a new declare command is saved and replayed with no change here.
//
//   node hidden-fields.mjs save --kit <template-kit.json> --to <saved.json>
//   node hidden-fields.mjs replay --from <saved.json> --kit <template-kit.json> [--dry-run]
//
// Run from the repository root. Exit 0 done, 1 a replayed command failed, 2 usage or read error.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  DECLARED_SITE_FIELDS,
  declaredOf
} from '../../../../packages/cms/tracy-quickstart-tools/template-kit/lib/declared-site-fields.mjs'

const CLI = 'packages/cms/tracy-quickstart-tools/template-kit/cli.mjs'

const valueAt = (o, path) =>
  path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o)

/** The declared fields of a kit, as the replay needs them (a part of its `site`). @param {any} kit */
export function savedOf(kit) {
  return declaredOf(kit)
}

/** The kit tool commands that declare `saved` again on `kitFile`, in the tool's field order. @param {any} saved */
export function commandsOf(saved, kitFile) {
  const out = []
  for (const { field, command, flag, list } of DECLARED_SITE_FIELDS) {
    // A file saved before the shared list held the legal layout under `legal`.
    const value = valueAt(saved, field) ?? (field === 'createdPageLayouts.legal' ? saved.legal : undefined)
    if (!list) {
      if (!value || typeof value.why !== 'string') continue
      if (value.articleLayout === null) out.push([command, '--kit', kitFile, '--none', '--why', value.why])
      else out.push([command, '--kit', kitFile, `--${flag}`, value.articleLayout, '--why', value.why])
      continue
    }
    const entries = Array.isArray(value) ? value : []
    for (const entry of entries)
      out.push([command, '--kit', kitFile, `--${flag}`, entry[flag], '--why', entry.why])
    const why = saved.noneWhy?.[field]
    if (entries.length === 0 && typeof why === 'string' && why.trim())
      out.push([command, '--kit', kitFile, '--none', '--why', why])
  }
  return out
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
    if (verb === 'replay' && values.kit && values.from) {
      const commands = commandsOf(JSON.parse(readFileSync(values.from, 'utf8')), values.kit)
      for (const args of commands) {
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
      '       hidden-fields.mjs replay --from <saved.json> --kit <template-kit.json> [--dry-run]\n'
  )
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2))
