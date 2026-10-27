#!/usr/bin/env node
// Whether a packed template answers Tracy's Content API and prints the provenance stamps Tracy's
// comment picker reads — from the packed bytes, so the answer is about what ships.
//
// 🔒 WHY THIS IS A GATE. Every piece fails silently when it is missing. A template without the
// reader builds, verifies and serves; Tracy then reads nothing of it and the agent edits blind. A
// template with the reader but an image that builds it off (the switch defaults to 0, or lives in
// an ARG only) answers /content.json with 404 HTML while its label says otherwise (measured
// 26/09/2026 on dev). A template without stamps renders the same page, and every element the
// customer points at resolves by value alone — ambiguous words (a menu item that equals a footer
// title) then resolve to the wrong field. Until 27/09/2026 only Tracy Business had all of it; the
// kit shipped the reader as an opt-in tool and nothing asked for the rest.
//
//   node tools/content-api-gate.mjs [<package dir>]   # exit 1 and one line per problem
//
// Used by tools/release.mjs. Pure: reads files, returns sentences, decides nothing.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The build-time switch astro.config.mjs reads (tools/content-api/integration.mjs). */
export const CONTENT_API_FLAG = 'TRACY_CONTENT_API_SCALARS'

/** What a package must carry: the reader and its two inputs, the stamps and the page owner. */
export const CONTENT_API_FILES = [
  'tools/content-api/integration.mjs',
  'seed/content-api-map.json',
  'seed/site-model.json',
  'src/lib/stamps.ts',
  'src/components/site/PageOwner.astro'
]

const readJson = (file) => {
  try {
    return { json: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * @param {string} dir a template package, packed or not
 * @returns {string[]} what is missing or wrong; empty means Tracy can read the site and resolve its stamps.
 */
export function contentApiProblems(dir) {
  const at = (rel) => path.join(dir, rel)
  const missing = CONTENT_API_FILES.filter((f) => !existsSync(at(f)))
  if (missing.length > 0)
    return [
      `the template cannot answer Tracy's Content API or print provenance stamps: ${missing.join(', ')} missing. ` +
        'Copy scripts/tools/content-api/ and scripts/src/ from the kit, write seed/content-api-map.json ' +
        '(assets/seed-starter/) and seed/site-model.json (tools/from-emdash-seed.mjs for a template built before the contract).'
    ]
  const problems = []

  const config = existsSync(at('astro.config.mjs')) ? readFileSync(at('astro.config.mjs'), 'utf8') : ''
  if (!config.includes('./tools/content-api/integration.mjs') || !config.includes('contentApi('))
    problems.push(
      'astro.config.mjs does not add the contentApi integration (tools/content-api/integration.mjs)'
    )
  else if (!config.includes(`process.env.${CONTENT_API_FLAG}`))
    problems.push(
      `astro.config.mjs adds contentApi without reading ${CONTENT_API_FLAG}; the image cannot say whether it is on`
    )

  // The fleet builds a template's own Dockerfile with no build argument, so the ARG default IS
  // what every customer site gets; ENV carries it to the rebuilds a site runs in its container.
  const dockerfile = existsSync(at('Dockerfile')) ? readFileSync(at('Dockerfile'), 'utf8') : ''
  const args = [...dockerfile.matchAll(new RegExp(`^\\s*ARG\\s+${CONTENT_API_FLAG}(?:=(\\S*))?\\s*$`, 'gm'))]
  const envs =
    dockerfile.match(
      new RegExp(`^\\s*ENV\\s+${CONTENT_API_FLAG}=\\$\\{?${CONTENT_API_FLAG}\\}?\\s*$`, 'gm')
    ) ?? []
  if (args.length === 0)
    problems.push(
      `the Dockerfile declares no ARG ${CONTENT_API_FLAG}; the fleet's build leaves the reader out`
    )
  else if (args.some((m) => m[1] !== '1'))
    problems.push(`ARG ${CONTENT_API_FLAG} must default to 1 in every stage: the fleet passes no build arg`)
  if (args.length > 0 && envs.length < args.length)
    problems.push(
      `every stage that declares ARG ${CONTENT_API_FLAG} must also set ENV ${CONTENT_API_FLAG}=$${CONTENT_API_FLAG}; a rebuild inside the site container sees only ENV`
    )

  const middleware = existsSync(at('src/middleware.ts')) ? readFileSync(at('src/middleware.ts'), 'utf8') : ''
  if (!middleware.includes('keepPickPrivate('))
    problems.push(
      'src/middleware.ts does not call keepPickPrivate (src/lib/stamps.ts): a stamped page could land in a shared cache'
    )

  const map = readJson(at('seed/content-api-map.json'))
  const model = readJson(at('seed/site-model.json'))
  if (map.error) problems.push(`seed/content-api-map.json is not readable JSON: ${map.error}`)
  if (model.error) problems.push(`seed/site-model.json is not readable JSON: ${model.error}`)
  if (map.json && model.json) {
    const mapped = new Set(Object.keys(map.json.collections ?? {}))
    const unmapped = (model.json.types ?? []).map((t) => t.name).filter((n) => !mapped.has(n))
    if (unmapped.length > 0)
      problems.push(
        `seed/content-api-map.json maps no ${unmapped.join(', ')}; the reader skips a collection it has no type for`
      )
    for (const binding of [map.json.chrome ?? []].flat()) {
      const chrome = binding?.collection
      if (chrome && !mapped.has(chrome))
        problems.push(`seed/content-api-map.json names chrome collection ${chrome}, which it does not map`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = contentApiProblems(path.resolve(process.argv[2] ?? '.'))
  for (const p of problems) console.error(`content-api-gate: ${p}`)
  if (problems.length === 0)
    console.log('content-api-gate: the package answers the Content API and prints provenance stamps')
  process.exit(problems.length > 0 ? 1 : 0)
}
