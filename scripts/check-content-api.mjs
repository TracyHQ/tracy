/**
 * Content API producer drift is invisible to each CMS's own tests. Run the shared schema,
 * invariants and source-pinned fixtures together; this is not a runtime adapter/auth gate.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const result = spawnSync(
  process.execPath,
  [
    '--test',
    fileURLToPath(new URL('../packages/cms/tracy-content-api/test/content-api.test.mjs', import.meta.url))
  ],
  { stdio: 'inherit' }
)
process.exit(result.status ?? 1)
