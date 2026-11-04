#!/usr/bin/env node
// Freeze an allowlisted source directory. The output is the actual installable artifact.
// node tools/distribution.mjs pack <contract> <new-directory>
// node tools/distribution.mjs verify <artifact-directory>
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync, lstatSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash, filesUnder, relativeFile, contractHash, validateContract } from './qa-contract.mjs'

export function forbidden(file) {
  return file
    .split('/')
    .some(
      (part) =>
        /^(?:node_modules|data|uploads|backups|evidence|\.git|\.astro|dist)$/.test(part) ||
        /before-restore|\.(?:token|db|sqlite|sqlite3|log|pem|key)$/.test(part) ||
        (/^\.env(?:\.|$)/.test(part) && part !== '.env.example')
    )
}
export function distributionFiles(root, contract) {
  const files = new Set()
  for (const entry of contract.distribution.include) {
    if (!relativeFile(entry) || forbidden(entry)) throw new Error(`Unsafe include: ${entry}`)
    const full = path.join(root, entry)
    if (!existsSync(full)) throw new Error(`Include path missing: ${entry}`)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) throw new Error(`Symlink include: ${entry}`)
    for (const file of stat.isDirectory() ? filesUnder(root, entry) : [entry]) {
      if (forbidden(file)) throw new Error(`Runtime or secret file in distribution: ${file}`)
      if (file === 'distribution.json') throw new Error('distribution.json is generated')
      files.add(file)
    }
  }
  for (const required of contract.distribution.required)
    if (!files.has(required)) throw new Error(`Required asset omitted: ${required}`)
  return [...files].sort()
}
// One definition of "the artifact hash": qa.mjs reports it from the source tree, pack() writes it
// into distribution.json, and a clean-install receipt must quote the same value.
export function manifestFor(root, contract) {
  const files = distributionFiles(root, contract)
  const checksums = Object.fromEntries(files.map((f) => [f, hash(readFileSync(path.join(root, f)))]))
  // The artifact hash identifies the shipped BYTES only; the contract hash is recorded next to it
  // for the record. Revising acceptance criteria must not turn a verified artifact into a new one.
  const manifest = { schemaVersion: 1, contractHash: contractHash(contract), checksums }
  return { manifest, files, artifactHash: hash(JSON.stringify(checksums)) }
}
export function pack(root, contract, destination) {
  const errors = validateContract(contract)
  if (errors.length) throw new Error(errors.join('\n'))
  const dest = path.resolve(destination),
    source = path.resolve(root)
  if (existsSync(dest) || dest === source || dest.startsWith(`${source}/`) || source.startsWith(`${dest}/`))
    throw new Error('Artifact destination must be new and outside the source')
  const { manifest, files, artifactHash } = manifestFor(root, contract)
  mkdirSync(dest, { recursive: true })
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dest, file)), { recursive: true })
    copyFileSync(path.join(root, file), path.join(dest, file))
  }
  writeFileSync(
    path.join(dest, 'distribution.json'),
    JSON.stringify({ ...manifest, artifactHash }, null, 2) + '\n'
  )
  return { artifactHash, files: files.length, destination: dest }
}
export function verifyDistribution(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'distribution.json'), 'utf8'))
  const { artifactHash } = manifest
  const errors = []
  if (hash(JSON.stringify(manifest.checksums ?? {})) !== artifactHash) errors.push('manifest hash mismatch')
  const expected = Object.keys(manifest.checksums ?? {}).sort()
  if (!expected.length) errors.push('empty artifact')
  // filesUnder walks directory by directory; the manifest keys are sorted globally (`b.ts` < `b/x.ts`).
  const actual = filesUnder(root)
    .filter((f) => f !== 'distribution.json')
    .sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push('artifact file set changed')
  for (const file of expected) {
    if (!relativeFile(file) || forbidden(file)) {
      errors.push(`unsafe artifact file: ${file}`)
      continue
    }
    try {
      if (hash(readFileSync(path.join(root, file))) !== manifest.checksums[file])
        errors.push(`artifact bytes changed: ${file}`)
    } catch {
      errors.push(`artifact file missing: ${file}`)
    }
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    artifactHash,
    contractHash: manifest.contractHash,
    files: expected.length,
    errors
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, input, dest] = process.argv.slice(2)
    if (!['pack', 'verify'].includes(command))
      throw new Error('usage: distribution.mjs pack <contract> <new-directory> | verify <directory>')
    const result =
      command === 'pack'
        ? pack(process.cwd(), JSON.parse(readFileSync(input, 'utf8')), dest)
        : verifyDistribution(input)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status === 'fail' ? 1 : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
