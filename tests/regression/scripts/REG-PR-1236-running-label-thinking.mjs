// The running status under the chat ("Thinking for 6s ···") must not carry DeepSeek's name or its
// "Deep diving" pun in any language the interface offers, in the sources or in the built bundles
// the dsh image copies.
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'ok' : 'not ok'} - ${label}`)
  if (!ok) failed += 1
}

const fork = read('vendor/tracy/deepseek-harness/packages/client/ui-chat/src/client/locale.ts')
check(fork.includes("'chat.deepDiving': 'Thinking',"), "fork en chat.deepDiving is 'Thinking'")
check(
  fork.includes("'chat.deepDivingFor': 'Thinking for {duration} ···',"),
  "fork en chat.deepDivingFor is 'Thinking for {duration} ···'"
)
check(
  fork.includes("'chat.deepDivingFor': '思考中，用时 {duration} ···',"),
  'fork zh chat.deepDivingFor is 思考中'
)

// The image starts only when dsh-passwords accepts the fork's version: a first cut of this fix,
// -tracy.40.1, built green and was refused at start on prod (exit 37, rolled back).
const forkVersion = JSON.parse(read('vendor/tracy/deepseek-harness/package.json')).version
const gate = read('vendor/tracy/dsh-passwords/src/tracy/dsh-runtime.ts').match(
  /const TRACY_DSH_RE = \/(.*)\/;/
)
// The dsh build refuses build metadata ("invalid version"), so the version is tested whole.
check(
  gate !== null && new RegExp(gate[1]).test(forkVersion),
  `fork version ${forkVersion} passes the dsh-passwords runtime gate`
)

const banned =
  /Deep diving|深度求索|lặn sâu|đào sâu|Tiefensuche|approfondi|Diep aan het graven|en profundidad/i
const keyLine = /['"]chat\.deepDiving(?:For)?['"]\s*:\s*['"][^\n]*/g
const sources = [
  'vendor/tracy/deepseek-harness/packages/client/ui-chat/src/client/locale.ts',
  'vendor/tracy/dsh-locale-vi/locales/chat.json',
  'packages/locale/tracy-locales/es/chat.json',
  ...['de', 'fr', 'it', 'nl', 'zh-TW', 'zh-HK', 'zh-MO'].map(
    (lang) => `vendor/tracy/dsh-better-locale/src/client/dictionaries/${lang}.ts`
  )
]
for (const path of sources) {
  const lines = read(path).match(keyLine) ?? []
  check(
    lines.length > 0 && lines.every((line) => !banned.test(line)),
    `${path}: running label free of the pun`
  )
}

const bundles = [
  'vendor/tracy/dsh-locale-vi/lib/client.js',
  'vendor/tracy/dsh-better-locale/lib/client.js',
  'packages/locale/tracy-locales/lib/client.js'
]
for (const path of bundles) {
  const lines = read(path).match(keyLine) ?? []
  check(
    lines.length > 0 && lines.every((line) => !banned.test(line)),
    `${path}: built running label free of the pun`
  )
}

process.exit(failed ? 1 : 0)
