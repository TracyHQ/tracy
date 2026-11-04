// The frozen input files of one write (ADR 0044): read, hashed and parsed before anything is asked of a site. Only a
// file's name goes in the report, never its path, since a path names the machine.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {Record<string, string>} files role ("plan", "copy", ...) to path
 * @returns {Promise<{ inputs: Record<string, { file: string, sha256: string }>, values: Record<string, any>,
 *   stop?: { code: string, reason: string } }>} `stop` names the first file that cannot be used
 */
export async function readFrozenFiles(files) {
  const inputs = {}
  const values = {}
  for (const [role, where] of Object.entries(files)) {
    const file = path.basename(where)
    let bytes
    try {
      bytes = await readFile(where)
    } catch (error) {
      const reason = `The ${role} file ${file} cannot be read (${error.code ?? 'error'}).`
      return { inputs, values, stop: { code: 'MISSING_FILE', reason } }
    }
    inputs[role] = { file, sha256: createHash('sha256').update(bytes).digest('hex') }
    try {
      values[role] = JSON.parse(bytes.toString('utf8'))
    } catch {
      return { inputs, values, stop: { code: 'BAD_FILE', reason: `The ${role} file ${file} is not JSON.` } }
    }
  }
  return { inputs, values }
}
