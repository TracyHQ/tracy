// Loads the pinned schemas from tests/qa/contracts, checking them against SOURCE.md-independent
// invariants (valid JSON, compilable, only supported keywords).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonFile } from './fsafe.mjs'
import { compileSchema, validate } from './schema.mjs'

export const CONTRACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../contracts')
const cache = new Map()

export async function loadSchema(name, dir = CONTRACTS_DIR) {
  const key = `${dir}\0${name}`
  if (cache.has(key)) return cache.get(key)
  const schema = await readJsonFile(path.join(dir, name))
  if (schema === null) throw new Error(`contract ${name} is missing from ${dir}`)
  compileSchema(schema)
  cache.set(key, schema)
  return schema
}

export async function validateAgainst(name, value, dir) {
  return validate(await loadSchema(name, dir), value)
}
