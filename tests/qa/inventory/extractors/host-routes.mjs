// Host doors: routes registered on `app` in apps/tracy-host/src/app.js. Middleware (`app.use`) is not a route.
import { cli, isMain, record } from './common.mjs'
import { scanFromRoot } from './route-scan.mjs'

const SRC = 'apps/tracy-host/src/app.js'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-route-registrations',
  extract(root) {
    const { routes, unresolved, read } = scanFromRoot(root, SRC)
    const items = []
    for (const r of routes)
      for (const method of r.methods)
        items.push({
          id: `host-route:${method} ${r.path}`,
          kind: 'host-route',
          method,
          path: r.path,
          loc: r.loc,
          ...(r.conditional ? { conditional: true } : {})
        })
    return record({ sourcePath: SRC, read, extractionKind: this.extractionKind, items, unresolved, root })
  }
}
if (isMain(import.meta.url)) cli(def)
