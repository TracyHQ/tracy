// Stand services: `services:` of deploy/compose.yml plus the services the override files ADD.
// One-shot init services (`*-init`, `restart: "no"`) are kept apart from permanent ones. Profiles
// are recorded as declared; which ones a given host starts is NOT resolved here.
import { load } from 'js-yaml'
import { cli, isMain, readSource, record, SourceError } from './common.mjs'

const BASE = 'deploy/compose.yml'
const OVERRIDES = [
  'deploy/compose.macos.yml',
  'deploy/compose.server.yml',
  'deploy/compose.emdash-business.local.yml'
]

// Compose merge tags (`!override`, `!reset`) change how files merge, not what a service is called:
// they are removed before parsing so the plain YAML loader accepts the file.
const withoutMergeTags = (text) => text.replace(/(\s)!(?:override|reset)(?=[\s[{]|$)/g, '$1')

function services(src) {
  let doc
  try {
    doc = load(withoutMergeTags(src.text), { filename: src.rel })
  } catch (error) {
    throw new SourceError(`invalid YAML in ${src.rel}: ${error.message}`)
  }
  if (!doc || typeof doc !== 'object' || !doc.services || typeof doc.services !== 'object')
    throw new SourceError(`${src.rel}: no services mapping`)
  return doc.services
}

export const def = {
  sourcePath: BASE,
  extractionKind: 'yaml',
  extract(root) {
    const base = readSource(root, BASE)
    const read = [base]
    const items = []
    const byName = new Map()
    for (const [name, svc] of Object.entries(services(base))) {
      const item = {
        id: `compose-service:${name}`,
        kind: 'compose-service',
        service: name,
        lifecycle: name.endsWith('-init') || String(svc?.restart) === 'no' ? 'one-shot-init' : 'permanent',
        profiles: svc?.profiles ?? [],
        file: BASE,
        addedBy: null,
        overriddenIn: []
      }
      byName.set(name, item)
      items.push(item)
    }
    const unresolved = []
    for (const rel of OVERRIDES) {
      let src
      try {
        src = readSource(root, rel)
      } catch (error) {
        unresolved.push({
          kind: 'override-file-unreadable',
          detail: `${rel}: ${error.message}`,
          blocksComplete: true
        })
        continue
      }
      read.push(src)
      for (const [name, svc] of Object.entries(services(src))) {
        const known = byName.get(name)
        if (known) {
          known.overriddenIn.push(rel)
          continue
        }
        const item = {
          id: `compose-service:${name}`,
          kind: 'compose-service',
          service: name,
          lifecycle: name.endsWith('-init') || String(svc?.restart) === 'no' ? 'one-shot-init' : 'permanent',
          profiles: svc?.profiles ?? [],
          file: rel,
          addedBy: rel,
          overriddenIn: []
        }
        byName.set(name, item)
        items.push(item)
      }
    }
    return record({
      sourcePath: BASE,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: {
        profilesNotResolved:
          'which services a host starts depends on --profile and the override files it passes'
      }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
