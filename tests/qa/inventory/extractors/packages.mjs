// Packages and dsh plugins: every packages/**/package.json (the fleet profile included), the plugins
// declared by cordis.patch.yml, and which bundles NAME them. "Declared in a bundle" is NOT "loaded at
// runtime": the dsh runtime graph is not collected here and is reported as unresolved.
import { load } from 'js-yaml'
import { cli, isMain, listFiles, parseJson, readSource, record, SourceError } from './common.mjs'

const BUNDLES = ['packages/bundle/tracy-native', 'packages/bundle/tracy-cowork']
const dirOf = (rel) => rel.slice(0, rel.lastIndexOf('/'))

function cordisRows(src) {
  let doc
  try {
    doc = load(src.text, { filename: src.rel })
  } catch (error) {
    throw new SourceError(`invalid YAML in ${src.rel}: ${error.message}`)
  }
  if (!Array.isArray(doc)) throw new SourceError(`${src.rel}: cordis patch is not a list`)
  const rows = { ids: [], insertedNames: [], disabled: [] }
  for (const row of doc) {
    if (row && Array.isArray(row.insert)) {
      for (const ins of row.insert) {
        if (ins?.id) rows.ids.push(String(ins.id))
        if (ins?.name) rows.insertedNames.push(String(ins.name))
      }
    } else if (row && typeof row === 'object' && row.id) {
      rows.ids.push(String(row.id))
      if (row.disabled === true) rows.disabled.push(String(row.id))
    }
  }
  return rows
}

export const def = {
  sourcePath: 'packages/**/package.json + cordis.patch.yml',
  extractionKind: 'json + yaml + directory-listing',
  extract(root) {
    const { files, skipped } = listFiles(root, 'packages', (f) =>
      /\/(package\.json|cordis\.patch\.yml)$/.test(f)
    )
    const read = []
    const manifests = []
    const cordis = new Map()
    const unresolved = skipped.map((s) => ({ kind: 'symlink-skipped', detail: s }))
    for (const rel of files) {
      const src = readSource(root, rel)
      read.push(src)
      if (rel.endsWith('package.json')) manifests.push({ rel, json: parseJson(src) })
      else cordis.set(dirOf(rel), cordisRows(src))
    }
    const bundleDeps = new Map()
    for (const dir of BUNDLES) {
      const m = manifests.find((x) => dirOf(x.rel) === dir)
      if (!m) {
        unresolved.push({ kind: 'bundle-manifest-missing', detail: dir, blocksComplete: true })
        continue
      }
      bundleDeps.set(m.json.name, new Set(Object.keys({ ...m.json.dependencies, ...m.json.devDependencies })))
    }
    const profileBundles = new Map()
    for (const m of manifests)
      for (const b of m.json.dsh?.profile?.bundles ?? [])
        profileBundles.set(b, [...(profileBundles.get(b) ?? []), m.json.name])
    const items = []
    for (const m of manifests) {
      const dir = dirOf(m.rel)
      const name = m.json.name
      const rows = cordis.get(dir)
      items.push({
        id: `package:${dir}`,
        kind: 'package',
        name: name ?? null,
        dir,
        version: m.json.version ?? null,
        private: m.json.private === true,
        hasCordis: Boolean(rows),
        isBundle: BUNDLES.includes(dir),
        declaresDshBundle: Boolean(m.json.dsh?.bundle),
        declaredInBundles: [...bundleDeps]
          .filter(([, deps]) => deps.has(name))
          .map(([b]) => b)
          .sort(),
        namedByProfiles: m.json.dsh?.profile ? [] : undefined
      })
      if (!name) unresolved.push({ kind: 'package-without-name', detail: m.rel })
      if (rows)
        items.push({
          id: `dsh-plugin:${dir}`,
          kind: 'dsh-plugin',
          dir,
          packageName: name ?? null,
          rowIds: rows.ids,
          insertedNames: rows.insertedNames,
          disabledIds: rows.disabled
        })
    }
    for (const it of items) if (it.namedByProfiles === undefined) delete it.namedByProfiles
    for (const [bundle, profiles] of profileBundles) {
      const it = items.find((i) => i.kind === 'package' && i.name === bundle)
      if (it) it.namedByProfiles = profiles.sort()
    }
    unresolved.push({
      kind: 'runtime-graph-not-collected',
      detail:
        'which plugins dsh loads for native/web/desktop is not read here; bundle membership is declared, not loaded'
    })
    return record({
      sourcePath: this.sourcePath,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root
    })
  }
}
if (isMain(import.meta.url)) cli(def)
