#!/usr/bin/env node
/**
 * FS_TOOL_ARGS is a copy of somebody else's schemas, and a copy goes stale in silence.
 *
 * The fence in `src/route.mjs` names dsh's file tools and their path-bearing arguments. dsh is
 * `vendor/tracy/deepseek-harness`, pinned by subtree — it moves when Tracy pulls it. A renamed tool, a
 * renamed argument, or a NEW tool that takes a path would leave the fence quietly degraded to its
 * existence heuristic: a real path outside the site would still be caught, but a path that does not
 * exist YET (the `write` case, which is how `/desk-home/cordis.patch.yml` gets created) would not.
 *
 * So this test reads the vendor's own tool definitions and asserts the table still covers them.
 * It parses the source text rather than importing it: those modules are TypeScript and pull in
 * cordis, which this package's tree does not have.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/fs-tool-schemas.test.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { FS_TOOL_ARGS, RG_HARNESS_FLAGS, RG_HARNESS_VALUE_FLAGS, WORKDIR_ARG } from '../src/route.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const VENDOR = join(REPO, 'vendor', 'tracy', 'deepseek-harness', 'packages')

/** The files that register a tool the agent can hand a path to. */
const SOURCES = [
  'fs/tool-fs/src/read.ts',
  'fs/tool-fs/src/write.ts',
  'fs/tool-fs/src/edit.ts',
  'fs/tool-fs/src/read-image.ts',
  'fs/tool-fs-search/src/glob.ts',
  'fs/tool-fs-search/src/grep.ts',
  'fs/tool-str-replace-editor/src/index.ts',
  'shell/tool-bash/src/index.ts',
  'shell/tool-pwsh/src/index.ts',
  'terminal/tool-terminal/src/index.ts'
]

/** An argument whose NAME says it is a path, whatever its description says. */
const PATH_NAME = /^(file_path|path|paths|cwd|workdir|dir|directory|target_path|destination)$/

/** An argument whose DESCRIPTION says it is a path. Deliberately loose: over-matching costs a row in the table, under-matching costs the fence. */
const PATH_DESCRIPTION = /\b(path|directory|folder)\b/i

/**
 * Take the balanced `{ … }` block that starts at `from`.
 * @param {string} text
 * @param {number} from - index of the opening brace.
 * @returns {string}
 */
function block(text, from) {
  let depth = 0
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  throw new Error('unbalanced block')
}

/**
 * Every tool a source file registers, with the arguments that look like paths.
 * @param {string} text - the file's source.
 * @returns {{ tool: string, args: string[] }[]}
 */
function toolsIn(text) {
  const found = []
  const nameAt = /\bname: '([a-z][a-z0-9_]*)',/g
  for (const match of text.matchAll(nameAt)) {
    const parametersAt = text.indexOf('parameters: {', match.index)
    if (parametersAt === -1) continue
    // The `parameters` block must belong to THIS registration, not to one far below it.
    const nextName = nameAt.lastIndex
    if (parametersAt - match.index > 4000) continue
    const params = block(text, parametersAt + 'parameters: '.length)
    const args = []
    // Top-level keys of the parameters object, each with its own `{ … }` value.
    for (const key of params.matchAll(/\n\s{6}([a-z_][a-z0-9_]*): \{/g)) {
      const value = block(params, params.indexOf('{', key.index + key[0].length - 1))
      if (PATH_NAME.test(key[1]) || PATH_DESCRIPTION.test(value)) args.push(key[1])
    }
    found.push({ tool: match[1], args, at: nextName })
  }
  return found
}

test('FS_TOOL_ARGS still matches the tool definitions dsh actually registers', async (t) => {
  if (!existsSync(VENDOR)) {
    t.skip(`vendor tree absent at ${VENDOR}`)
    return
  }
  const gaps = []
  const seen = []
  for (const relative of SOURCES) {
    const file = join(VENDOR, relative)
    if (!existsSync(file)) {
      gaps.push(
        `${relative}: gone from the vendor tree — the fence may be naming a tool that no longer exists`
      )
      continue
    }
    for (const { tool, args } of toolsIn(await readFile(file, 'utf8'))) {
      if (args.length === 0) continue
      seen.push(`${tool}(${args.join(',')})`)
      const declared = FS_TOOL_ARGS[tool]
      if (declared === undefined) {
        gaps.push(`${tool} (${relative}) takes ${args.join(', ')} but is not in FS_TOOL_ARGS`)
        continue
      }
      for (const arg of args) {
        // `content` is a deliberate "this one is NOT a path" — grep's regex `pattern`, for
        // instance. Either list is a decision; absence from both is an oversight.
        if (!declared.paths.includes(arg) && !declared.content.includes(arg)) {
          gaps.push(`${tool}.${arg} (${relative}) looks like a path and is in neither paths nor content`)
        }
      }
    }
  }
  assert.deepEqual(
    gaps,
    [],
    `the fence table has drifted from dsh:\n${gaps.join('\n')}\nseen: ${seen.join(' ')}`
  )
  // A canary on the canary: if the parse stops finding anything, the assertion above passes for
  // the wrong reason.
  assert.ok(seen.length >= 8, `parsed too few tools (${seen.length}): ${seen.join(' ')}`)
})

test('every ripgrep argument dsh builds is on the list the dsh process runs', async (t) => {
  // The same drift, on the argv side: `runsOnHarness` refuses any ripgrep argument it does not list,
  // so a flag dsh adds to grep or glob would make every search fail until the list learns it.
  if (!existsSync(VENDOR)) {
    t.skip(`vendor tree absent at ${VENDOR}`)
    return
  }
  const built = []
  for (const [relative, fn] of [
    ['fs/tool-fs-search/src/grep.ts', 'buildGrepCommand'],
    ['fs/tool-fs-search/src/glob.ts', 'buildGlobCommand'],
    ['fs/tool-fs-search/src/search-core.ts', 'runRipgrep']
  ]) {
    const text = await readFile(join(VENDOR, relative), 'utf8')
    const at = text.indexOf(`function ${fn}(`)
    assert.notEqual(at, -1, `${fn} is gone from ${relative}`)
    // Every `--flag` literal in the body; a `--flag=${value}` template yields its `--flag=` prefix.
    for (const match of block(text, text.indexOf('{', at)).matchAll(/['`](--[a-z][a-z-]*(?:=[a-z]*)?)/g)) {
      built.push(match[1])
    }
  }
  const unlisted = built.filter((flag) =>
    flag.endsWith('=') ? !RG_HARNESS_VALUE_FLAGS.includes(flag) : !RG_HARNESS_FLAGS.includes(flag)
  )
  assert.deepEqual(
    unlisted,
    [],
    `dsh builds ripgrep arguments runsOnHarness would refuse: ${unlisted.join(' ')}`
  )
  // A canary on the canary: a parse that finds nothing passes the assertion above for the wrong reason.
  for (const flag of ['--no-config', '--json', '--files', '--regexp=', '--glob=']) {
    assert.ok(built.includes(flag), `parsed ${built.join(' ')} — expected ${flag}`)
  }
})

test('every tool with a working directory is in BOTH tables', () => {
  // WORKDIR_ARG is the cheap label check, FS_TOOL_ARGS the realpath one. A tool in one and not the
  // other is fenced by half of what it should be.
  for (const [tool, arg] of Object.entries(WORKDIR_ARG)) {
    assert.ok(FS_TOOL_ARGS[tool] !== undefined, `${tool} is in WORKDIR_ARG but not FS_TOOL_ARGS`)
    assert.ok(
      FS_TOOL_ARGS[tool].paths.includes(arg),
      `${tool}.${arg} is the workdir guard's argument but not a fenced path`
    )
  }
})
