/**
 * `@tracy/content-api`, reached the way this app reaches every other file it shares with
 * `packages/`: the image copies it beside `src/` (Dockerfile), a checkout reads the package in place.
 *
 * Not a `workspace:` dependency, because the image installs from `apps/tracy-web/pnpm-lock.yaml`,
 * generated with `--ignore-workspace`, and a workspace package has nothing there to resolve to.
 * Not a copy committed under `src/` either: a second copy is a second truth that needs a gate to
 * stay equal, while this one IS the package's bytes in both places. The schema, its validator and
 * the slot → block kind map are one implementation for the Claude Cowork plugins' fixtures and this relay.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IN_IMAGE = new URL('../content-api/', import.meta.url)
const IN_CHECKOUT = new URL('../../../../packages/cms/tracy-content-api/', import.meta.url)
const base = existsSync(fileURLToPath(new URL('describe-map.mjs', IN_IMAGE))) ? IN_IMAGE : IN_CHECKOUT

export const {
  CONTENT_TYPES,
  DEFAULT_MAX_BYTES,
  DESCRIBE_SCHEMA_VERSION,
  RELAY_EXTENSIONS,
  SCHEMA_VERSION,
  schema,
  validateContent,
  validateDescribe
} = await import(new URL('validate.mjs', base).href)
export const { emdashBlockKinds, joomlaSlotField, slotBlockKinds, wordpressSlotField } = await import(
  new URL('describe-map.mjs', base).href
)
