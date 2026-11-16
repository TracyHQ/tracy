// The recorded template patches of an AI quickstart (ADR 0045 decision 4, ticket #588): a fix that needs a template
// file to change is a patch the production step applies to its copy of the template, kept in the kit as
// `template-patches.json` (`{"schema": "tracy-ai-quickstart-template-patches/v1", "patches": [{id, file, find,
// replace, why}]}`, `file` a path inside the template release). No file is no patch. When the template releases a new
// version, each patch is judged against that version's file:
//   applies           `find` is there exactly once (and the patch is not already in it);
//   already_applied   the template now holds `replace` itself: the patch can be dropped;
//   no_longer_applies the file is gone, or holds neither text, or holds `find` more than once: rewrite the patch.
// Pure: the template's files are read through `readFile(path) => string | null`.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const PATCHES_FILE = 'template-patches.json'
export const PATCHES_SCHEMA = 'tracy-ai-quickstart-template-patches/v1'

/** The patches a kit records: `{patches, problems}`; no file is none. */
export function readPatches(folder) {
  const file = path.join(folder, PATCHES_FILE)
  if (!existsSync(file)) return { patches: [], problems: [] }
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const problems = []
  if (doc.schema !== PATCHES_SCHEMA) problems.push(PATCHES_FILE + ' schema must be ' + PATCHES_SCHEMA)
  const patches = Array.isArray(doc.patches) ? doc.patches : []
  for (const p of patches)
    for (const key of ['id', 'file', 'find', 'replace'])
      if (typeof p?.[key] !== 'string' || p[key] === '') problems.push('a patch has no ' + key)
  return { patches, problems }
}

const count = (text, part) => text.split(part).length - 1

/** One patch judged against a template version. */
export function patchStatus(patch, readFile) {
  const at = { id: patch.id, file: patch.file }
  const text = readFile(patch.file)
  if (text == null) return { ...at, status: 'no_longer_applies', reason: 'file_missing' }
  const finds = count(text, patch.find)
  if (text.includes(patch.replace) && (finds === 0 || patch.replace.includes(patch.find)))
    return { ...at, status: 'already_applied', reason: 'the template holds the patched text' }
  if (finds === 1) return { ...at, status: 'applies', reason: 'the text to replace is there once' }
  return { ...at, status: 'no_longer_applies', reason: finds ? 'text_ambiguous' : 'text_changed' }
}
