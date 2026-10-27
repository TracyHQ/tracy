#!/usr/bin/env node
/**
 * Print a design system's engine artifact the way a theme page carries it — what a seeder writes
 * into the landing article (Joomla) or page (WordPress). Words are the engine's own; the seeder
 * pours the customer's later.
 *
 *   node scripts/artifact-body.mjs brutalism landing          # Joomla: the wrapper and the body
 *   node scripts/artifact-body.mjs brutalism landing --wp     # WordPress: inside <!-- wp:html -->
 *   node scripts/artifact-body.mjs brutalism landing --doc    # the whole document (parity reference)
 */
import { ARTIFACT_KINDS, artifactSnippet, buildArtifactDocsFor } from '../lib/artifacts.mjs'

const [id, kind] = process.argv.slice(2)
if (!id || !/^[a-z0-9-]+$/.test(id) || !ARTIFACT_KINDS.includes(kind ?? '')) {
  console.error(`usage: artifact-body.mjs <design-system-id> <${ARTIFACT_KINDS.join('|')}> [--wp|--doc]`)
  process.exit(2)
}
const doc = buildArtifactDocsFor(id)[kind]
if (process.argv.includes('--doc')) {
  process.stdout.write(doc)
} else {
  const snippet = artifactSnippet(doc, id, kind)
  process.stdout.write(
    process.argv.includes('--wp') ? `<!-- wp:html -->\n${snippet}<!-- /wp:html -->\n` : snippet
  )
}
