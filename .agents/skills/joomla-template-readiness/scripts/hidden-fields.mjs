#!/usr/bin/env node
// Keep the five hidden-by-CSS fields of a template kit across a rebuild. `template-kit/cli.mjs build` writes the kit's
// whole `site` part again from what it reads on the site (lib/kit-site.mjs `mergeSite`), so the five fields a person
// declared by hand (README "Make a kit for a new template", steps 8 and 9) are gone after it, and the verdict reads
// `kit-hidden-field-missing` again. Save them before the build, replay them after it, through the kit tool's own
// commands (so every rule of those commands still applies).
//
//   node hidden-fields.mjs save --kit <template-kit.json> --to <saved.json>
//   node hidden-fields.mjs replay --from <saved.json> --kit <template-kit.json> [--dry-run]
//
// Run from the repository root. Exit 0 done, 1 a replayed command failed, 2 usage or read error.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const CLI = 'packages/cms/tracy-quickstart-tools/template-kit/cli.mjs'

/** The list fields: kit key, the kit tool command that writes it, and the flag naming one entry. */
const LISTS = Object.freeze([
  { field: 'emptyVideoButtons', command: 'video-buttons', key: 'selector' },
  { field: 'selfLinkButtons', command: 'self-link-buttons', key: 'container' },
  { field: 'hiddenPageLinks', command: 'hidden-page-links', key: 'container' },
  { field: 'createdPageHide', command: 'created-page-hide', key: 'selector' }
])

/** The five fields of a kit, as the replay needs them. @param {any} kit */
export function savedOf(kit) {
  const site = kit?.site ?? {}
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const { field } of LISTS) if (Array.isArray(site[field])) out[field] = site[field]
  if (site.noneWhy && typeof site.noneWhy === 'object') out.noneWhy = site.noneWhy
  if (site.createdPageLayouts?.legal) out.legal = site.createdPageLayouts.legal
  return out
}

/** The kit tool commands that declare `saved` again on `kitFile`, in field order. @param {any} saved */
export function commandsOf(saved, kitFile) {
  const out = []
  for (const { field, command, key } of LISTS) {
    const list = Array.isArray(saved[field]) ? saved[field] : []
    for (const entry of list)
      out.push([command, '--kit', kitFile, `--${key}`, entry[key], '--why', entry.why])
    const why = saved.noneWhy?.[field]
    if (list.length === 0 && typeof why === 'string' && why.trim())
      out.push([command, '--kit', kitFile, '--none', '--why', why])
  }
  const legal = saved.legal
  if (legal && typeof legal.why === 'string') {
    if (legal.articleLayout === null)
      out.push(['legal-layout', '--kit', kitFile, '--none', '--why', legal.why])
    else out.push(['legal-layout', '--kit', kitFile, '--layout', legal.articleLayout, '--why', legal.why])
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
