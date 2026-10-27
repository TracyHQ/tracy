#!/usr/bin/env node
/**
 * Pack `plg_system_tracyidentity` into a zip Joomla installs (`php cli/joomla.php extension:install
 * --path=<zip>`), for the disposable install a Tracy quickstart archive is cut from.
 *
 * The plugin ships INSIDE the archive, not with Tracy's Cowork component: someone restoring the
 * quickstart by hand has no Cowork, and a customer who removes Cowork must keep a working site
 * (tasks/todo-danh-tinh-site.md). The version in the zip is the one in the manifest, so a cut names
 * which plugin it carries.
 *
 * Run: node packages/cms/tracy-joomla-quickstart/scripts/pack-identity-plugin.mjs <out-dir>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../plugins/plg_system_tracyidentity', import.meta.url))
const out = path.resolve(process.argv[2] ?? '.')
const version = /<version>([^<]+)<\/version>/.exec(
  readFileSync(path.join(PLUGIN, 'tracyidentity.xml'), 'utf8')
)?.[1]
if (!version) throw new Error('tracyidentity.xml names no <version>')

mkdirSync(out, { recursive: true })
const zip = path.join(out, `plg_system_tracyidentity-${version}.zip`)
rmSync(zip, { force: true })
// -X leaves out extra file attributes, so two packs of the same tree differ only by timestamps.
execFileSync('zip', ['-X', '-q', '-r', zip, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: PLUGIN })
console.log(zip)
