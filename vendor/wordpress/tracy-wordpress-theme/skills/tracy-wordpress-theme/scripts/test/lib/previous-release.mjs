// A completed release directory for tests that name one as --previous: manifest.json, VERIFICATION.json, README.md, the assets and a SHA256SUMS that holds.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const sha = (text) => createHash('sha256').update(text).digest('hex')

/** Writes the release into `dir`; `files` adds assets ({name: text}), `metadata` files that are listed in SHA256SUMS but are not assets. → the manifest. */
export function writePreviousRelease(dir, { id = 'quickstart/x/wp7', theme = 'wp-x', version = '1.0.0', files = {}, metadata = {}, themeZipText = 'z' } = {}) {
  mkdirSync(dir, { recursive: true })
  const webroot = `x-webroot-${version}.tar.gz`
  const database = `x-database-${version}.sql.gz`
  const zip = `${theme}-${version}.zip`
  const all = { [webroot]: 'w', [database]: 'd', [zip]: themeZipText, ...files }
  const manifest = {
    id, release: id, version, theme: { name: theme, version }, webroot: { file: webroot, sha256: sha('w') }, database: { file: database, sha256: sha('d') },
    assets: [webroot, database, zip, ...Object.keys(files)]
  }
  const written = { 'manifest.json': JSON.stringify(manifest, null, 2) + '\n', 'VERIFICATION.json': JSON.stringify({ release: id }) + '\n', 'README.md': '# release\n', ...all, ...metadata }
  for (const [name, text] of Object.entries(written)) writeFileSync(path.join(dir, name), text)
  writeFileSync(path.join(dir, 'SHA256SUMS'), Object.entries(written).map(([n, t]) => `${sha(t)}  ${n}\n`).join(''))
  return manifest
}
