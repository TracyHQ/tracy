// Input methods that rewrite a word in place (Vietnamese Telex/VNI through EVKey, OpenKey,
// Unikey) send one Backspace per replaced character, then the new text without a keydown.
// Lexical drops that text after a handled Backspace (lexical#8417, kept on macOS Chrome by
// #9251), so Telex "toi" + "o" left "t" in the chat. The pinned fork's composer must insert it;
// this reads the pin's source and runs the fork's own spec against it.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../../', import.meta.url)
const fork = 'vendor/tracy/deepseek-harness'
const runtimePath = `${fork}/packages/client/ui-conversation/src/client/input/editor/runtime.ts`
const specPath = 'packages/client/ui-conversation/tests/type-after-backspace.client.spec.ts'
const read = (path) => readFileSync(new URL(path, root), 'utf8')
let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'ok' : 'not ok'} - ${label}`)
  if (!ok) failed += 1
}

const runtime = read(runtimePath)
check(
  /function registerTypeAfterBackspace\(editor: LexicalEditor\)/.test(runtime),
  'the composer runtime defines registerTypeAfterBackspace'
)
check(
  /registerPlainText\(this\.editor\),\s*registerTypeAfterBackspace\(this\.editor\),/.test(runtime),
  'register() installs it next to the plain-text bindings'
)
check(
  runtime.includes('ranges.some(range => !range.collapsed)'),
  'a replacement over a non-empty range is left to Lexical'
)

const version = JSON.parse(read(`${fork}/package.json`)).version
const tracyN = Number(/-tracy\.(\d+)$/.exec(version)?.[1])
check(tracyN >= 47, `fork version ${version} is tracy.47 or later`)

const forkDir = fileURLToPath(new URL(`${fork}/`, root))
const vitest = `${forkDir}node_modules/.bin/vitest`
check(existsSync(new URL(`${fork}/${specPath}`, root)), `the fork carries ${specPath}`)
if (existsSync(vitest)) {
  const run = spawnSync(vitest, ['run', specPath], { cwd: forkDir, encoding: 'utf8' })
  const output = `${run.stdout}${run.stderr}`
  check(run.status === 0 && /Tests\s+3 passed/.test(output), 'the fork spec passes: 3 of 3')
  if (run.status !== 0) console.log(output.slice(-2000))
} else {
  check(false, `vitest is installed in the fork (${vitest}); run pnpm dsh:build && pnpm install first`)
}

process.exit(failed ? 1 : 0)
