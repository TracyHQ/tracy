// Module customization hooks for the legacy dev E2E suite (see transport.mjs).
//   resolve: tests/e2e-dev/lib/env.mjs → adapter/local-env.mjs
//   load:    apply the checked source patches to dev.mjs, browser.mjs and J11
// The hooks read the transport description from QA_FLOWS_TRANSPORT (path of a JSON file). When
// it is unset they do nothing, so importing the legacy suite stays possible for its own tests.

import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PATCHES, applyPatches } from './transport.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_ENV = pathToFileURL(path.join(HERE, 'local-env.mjs')).href
const ENV_SUFFIX = '/tests/e2e-dev/lib/env.mjs'

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context)
  if (process.env.QA_FLOWS_TRANSPORT && resolved.url.endsWith(ENV_SUFFIX))
    return { ...resolved, url: LOCAL_ENV, shortCircuit: true }
  return resolved
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (!process.env.QA_FLOWS_TRANSPORT || !url.startsWith('file:') || result.format !== 'module') return result
  const file = fileURLToPath(url).split(path.sep).join('/')
  if (!PATCHES.some((p) => p.file.test(file))) return result
  const original = String(result.source)
  const { source, applied } = applyPatches(file, original)
  const log = process.env.QA_FLOWS_PROVENANCE
  if (log)
    appendFileSync(
      log,
      `${JSON.stringify({ file: file.replace(/^.*\/tests\/e2e-dev\//, 'tests/e2e-dev/'), applied })}\n`
    )
  return { ...result, source }
}
