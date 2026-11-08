// The content API reader is a build-time switch: astro.config.mjs adds the `contentApi`
// integration only when TRACY_CONTENT_API_SCALARS=1 is in the environment of `astro build`. An
// image built with the switch on therefore has to keep it for EVERY later build, not just its own.
//
// 🔒 WHY THIS IS A TEST. A site rebuilds its own dist inside its container (`site.rebuild`, a
// maintenance script, the owner's agent after editing /app). That build sees the container's
// environment, which is the final stage's ENV and nothing else: a build ARG is gone once the
// stage that declared it ends, and a LABEL is not an environment variable. The Business image
// declared the switch as ARG + LABEL only, so its first rebuild dropped the reader route and
// `/content.json` answered 404 HTML, while the label still said `scalars=1` (measured 26/09/2026
// on dev, site ge2357: rebuilt at 09:39Z, `printenv` empty, no chunk containing `tracy-content`).
// Nothing errors when this breaks; the route simply is not there.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const FLAG = 'TRACY_CONTENT_API_SCALARS'
const root = new URL('../', import.meta.url)

/**
 * The stages of a Dockerfile: `{ from, name, steps: [{ op, rest }] }`, comments dropped and
 * continuation lines joined.
 * @param {string} text
 */
export function stages(text) {
  const joined = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replace(/\\\r?\n/g, ' ')
  /** @type {{ from: string, name: string | undefined, steps: { op: string, rest: string }[] }[]} */
  const out = []
  for (const raw of joined.split('\n')) {
    const m = /^\s*([A-Za-z]+)\s+(.*)$/.exec(raw)
    if (!m) continue
    const op = m[1].toUpperCase()
    const rest = m[2].trim()
    if (op === 'FROM') {
      const f = /^(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(rest)
      out.push({ from: f?.[1] ?? '', name: f?.[2]?.toLowerCase(), steps: [] })
    } else out.at(-1)?.steps.push({ op, rest })
  }
  return out
}

/** @param {string} rest the text after ENV */
function envPairs(rest) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(rest)) {
    const [key, ...value] = rest.split(/\s+/)
    return [[key, value.join(' ')]]
  }
  return [...rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|\S*)/g)].map((m) => [
    m[1],
    m[2].replace(/^"|"$/g, '')
  ])
}

/** @param {string} rest the text after ARG */
const argName = (rest) => rest.split('=')[0].trim()

/** True when a value is the build arg of the same name, as Docker expands it. */
const fromArg = (value) => value === `$${FLAG}` || value === `\${${FLAG}}`

/**
 * What a build of the site sees of the switch, once in the image and once in a container made
 * from it.
 * @param {string} text the Dockerfile
 * @returns {{ declared: boolean, imageBuild: boolean, runtime: boolean }}
 */
export function flagReach(text) {
  const all = stages(text)
  /** @type {Map<string, Map<string, string>>} */
  const envOf = new Map()
  let imageBuild = false
  /** @type {Map<string, string>} */
  let env = new Map()
  let runtimeFromArg = false
  for (const [i, stage] of all.entries()) {
    // ENV is inherited from an earlier stage used as a base; ARG never is.
    env = new Map(envOf.get(stage.from.toLowerCase()) ?? [])
    const args = new Set()
    runtimeFromArg = env.has(FLAG)
    for (const { op, rest } of stage.steps) {
      if (op === 'ARG') args.add(argName(rest))
      if (op === 'ENV')
        for (const [key, value] of envPairs(rest))
          if (key === FLAG) {
            env.set(key, value)
            runtimeFromArg = fromArg(value) && args.has(FLAG)
          }
      if (op === 'RUN' && /\b(pnpm|npm run|astro)\s+build\b/.test(rest))
        imageBuild = env.has(FLAG) || args.has(FLAG) || rest.includes(`${FLAG}=`)
    }
    envOf.set(String(i), env)
    if (stage.name) envOf.set(stage.name, env)
  }
  return { declared: text.includes(FLAG), imageBuild, runtime: env.has(FLAG) && runtimeFromArg }
}

const OLD = `FROM node:24 AS build
COPY . .
ARG ${FLAG}=0
RUN ${FLAG}=$${FLAG} pnpm build

FROM node:24
ARG ${FLAG}=0
LABEL io.tracy.content-api.scalars="$${FLAG}"
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
`

const FIXED = `FROM node:24 AS build
COPY . .
ARG ${FLAG}=0
ENV ${FLAG}=$${FLAG}
RUN pnpm build

FROM node:24
ARG ${FLAG}=0
ENV ${FLAG}=$${FLAG}
LABEL io.tracy.content-api.scalars="$${FLAG}"
COPY --from=build /app/dist ./dist
`

test('the reach check tells an ARG-only switch from one the container keeps', () => {
  assert.deepEqual(flagReach(OLD), { declared: true, imageBuild: true, runtime: false })
  assert.deepEqual(flagReach(FIXED), { declared: true, imageBuild: true, runtime: true })
  // An ENV without its ARG in the same stage would be the literal text "$TRACY_…", not the value.
  assert.equal(flagReach(FIXED.replace(/FROM node:24\nARG .*\n/, 'FROM node:24\n')).runtime, false)
  // A stage built on an earlier one inherits its ENV.
  const inherited = `FROM node:24 AS base\nARG ${FLAG}=0\nENV ${FLAG}=$${FLAG}\nRUN pnpm build\nFROM base\nCMD ["node"]\n`
  assert.deepEqual(flagReach(inherited), { declared: true, imageBuild: true, runtime: true })
})

test('a rebuild inside the container sees the content API switch the image was built with', (t) => {
  const dockerfile = new URL('Dockerfile', root)
  const config = new URL('astro.config.mjs', root)
  if (!existsSync(dockerfile)) return t.skip('this template ships no Dockerfile')
  const text = readFileSync(dockerfile, 'utf8')
  const reads = existsSync(config) && readFileSync(config, 'utf8').includes(`process.env.${FLAG}`)
  const reach = flagReach(text)
  if (!reach.declared && !reads) return t.skip(`neither the Dockerfile nor astro.config.mjs uses ${FLAG}`)
  assert.ok(reach.declared, `astro.config.mjs reads ${FLAG} but the Dockerfile never sets it`)
  assert.ok(reach.imageBuild, `the image's own build does not see ${FLAG}`)
  assert.ok(
    reach.runtime,
    `the final stage must carry ${FLAG} as ENV (ARG ${FLAG} then ENV ${FLAG}=$${FLAG}): ` +
      'an ARG or a LABEL is gone by the time the site rebuilds inside its container, and the ' +
      'rebuild silently drops /content.json'
  )
})

test('the Content API is on in an image built without build args, which is how the fleet builds', (t) => {
  const dockerfile = new URL('Dockerfile', root)
  if (!existsSync(dockerfile)) return t.skip('this template ships no Dockerfile')
  const all = stages(readFileSync(dockerfile, 'utf8'))
  const defaults = all.flatMap((s) =>
    s.steps.filter((x) => x.op === 'ARG' && argName(x.rest) === FLAG).map((x) => x.rest.split('=')[1]?.trim())
  )
  assert.ok(defaults.length > 0, `the Dockerfile declares no ARG ${FLAG}`)
  // The fleet passes no build arg to a template's own Dockerfile (quickstart-restore.sh), so the
  // default IS what every customer site gets; Tracy's comment picker needs the reader to resolve
  // the page's provenance stamps.
  for (const d of defaults) assert.equal(d, '1', `ARG ${FLAG} defaults to ${d ?? 'nothing'}, not 1`)
})
