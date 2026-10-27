// Scripts: root npm commands, scripts/**, and the fleet operation scripts. A file is listed as a file;
// that it is an entrypoint someone runs is recorded only for what the name and place support.
import { cli, isMain, listFiles, parseJson, readSource, record, SourceError } from './common.mjs'

const FLEET = 'packages/fleet/tracy-fleet-operation/scripts'

const roleOf = (rel) =>
  /(^|\/)test[^/]*\/|\.test\.[a-z]+$|\/test[-_][^/]*$/.test(rel)
    ? 'test'
    : /\/lib\//.test(rel)
      ? 'library'
      : 'entrypoint-candidate'

export const def = {
  sourcePath: 'package.json + scripts/** + fleet scripts',
  extractionKind: 'json + directory-listing',
  extract(root) {
    const pkg = readSource(root, 'package.json')
    const json = parseJson(pkg)
    if (!json.scripts || typeof json.scripts !== 'object')
      throw new SourceError('package.json has no scripts')
    const read = [pkg]
    const items = Object.entries(json.scripts).map(([name, cmd]) => ({
      id: `npm-script:${name}`,
      kind: 'npm-script',
      name,
      command: cmd
    }))
    const unresolved = []
    const top = listFiles(root, 'scripts', (f) => /\.(ts|mjs|js|sh)$/.test(f))
    for (const rel of top.files) {
      read.push(readSource(root, rel))
      items.push({
        id: `script-file:${rel}`,
        kind: 'script-file',
        file: rel,
        depth: rel.split('/').length === 2 ? 'top' : 'nested',
        role: roleOf(rel)
      })
    }
    const fleet = listFiles(root, FLEET, (f) => /\.(sh|py|mjs)$/.test(f))
    for (const rel of fleet.files) {
      read.push(readSource(root, rel))
      items.push({ id: `fleet-script:${rel}`, kind: 'fleet-script', file: rel, role: roleOf(rel) })
    }
    for (const s of [...top.skipped, ...fleet.skipped])
      unresolved.push({ kind: 'symlink-skipped', detail: s })
    return record({
      sourcePath: this.sourcePath,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: {
        fleetFilesAreNotEntrypoints:
          'a file under the fleet scripts folder is not proof that a host operation calls it'
      }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
