/** Execute the Joomla plugin's actual PHP rules; no JavaScript copy of its decisions. */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const pluginSource = JSON.parse(
  readFileSync(new URL('./fixtures/joomla-plugin-validation/source.json', import.meta.url), 'utf8')
)
const entry = fileURLToPath(new URL('./fixtures/joomla-plugin-validation/validate.php', import.meta.url))

/**
 * `files` contains the fake site's actual media bytes (base64), `html` its known record bodies and writes.
 * Missing PHP or extensions is a test setup failure, never a silent skip or a permissive fallback.
 * @param {{slots: any[], params: any, files?: Record<string, string>, html?: any[], rows?: Record<string, any>, inspect?: boolean, sources?: Record<string, string>}} input
 * @returns {{errors: any[], html: string[], rows: Record<string, any>}}
 */
export function applyContractWrite(input) {
  const result = spawnSync('php', [entry], {
    input: JSON.stringify({ sources: pluginSource.files, ...input }),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10_000
  })
  if (result.error || result.status !== 0)
    throw new Error(`Joomla PHP validator could not run: ${result.error?.message ?? result.stderr}`)
  return JSON.parse(result.stdout)
}

/** @param {Parameters<typeof applyContractWrite>[0]} input */
export function validateContractWrite(input) {
  return applyContractWrite(input).errors
}
