#!/usr/bin/env node
/**
 * Print a design system's fixture body the way a theme page carries it — what a seeder writes
 * into the home article (Joomla) or the home page (WordPress, wrapped in a core html block so the
 * editor leaves it verbatim). Words are the fixture's own; the seeder pours the customer's later.
 *
 *   node scripts/fixture-body.mjs brutalism          # Joomla: the wrapper and the body
 *   node scripts/fixture-body.mjs brutalism --wp     # WordPress: the same inside <!-- wp:html -->
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureSnippet } from '../lib/fixture.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const id = process.argv[2]
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('usage: fixture-body.mjs <design-system-id> [--wp]')
  process.exit(2)
}
const file = path.join(ROOT, 'vendor', 'tracy', 'od-design-system', 'systems', id, 'components.html')
if (!existsSync(file)) {
  console.error(`no fixture for ${id}`)
  process.exit(1)
}
const snippet = fixtureSnippet(readFileSync(file, 'utf8'), id)
process.stdout.write(
  process.argv.includes('--wp') ? `<!-- wp:html -->\n${snippet}<!-- /wp:html -->\n` : snippet
)
