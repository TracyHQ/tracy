/**
 * What a committed plugin build imports from `@tracy/*`, against what the dsh image installs.
 *
 * The image copies each plugin folder as-is and runs no `pnpm install` for it (CLAUDE.md, rule 3),
 * so the only `@tracy/*` packages a bundle may import at runtime are the ones the Dockerfile itself
 * COPYs into `…/node_modules/@tracy/<name>`. Anything else must be bundled in. Read from the
 * Dockerfile rather than typed here: a package the image starts installing is allowed the moment
 * the COPY line exists, and a list kept by hand would drift from it silently.
 */

/**
 * The `@tracy/*` packages the dsh image puts in a profile's `node_modules`.
 * @param {string} dockerfile the text of `packages/fleet/tracy-fleet-operation/dsh/Dockerfile`
 * @returns {Set<string>}
 */
export function installedTracyPackages(dockerfile) {
  const out = new Set()
  for (const line of dockerfile.split('\n')) {
    if (!/^\s*COPY\s/.test(line)) continue
    const m = /node_modules\/(@tracy\/[a-z0-9][a-z0-9.-]*)\s*$/.exec(line.trim())
    if (m) out.add(m[1])
  }
  return out
}

/**
 * The `@tracy/*` packages a bundle imports that the image does not install, sorted, each once.
 * Static `import … from`, `export … from` and dynamic `import("…")` are read; a subpath names its
 * package (`@tracy/site-build-core/design-check` → `@tracy/site-build-core`).
 * @param {string} text the bundle
 * @param {Set<string>} installed from `installedTracyPackages`
 * @returns {string[]}
 */
export function bareImports(text, installed) {
  const found = new Set()
  // Comments first: esbuild keeps JSDoc, and a JSDoc type is written `import('@tracy/…').Name` —
  // a type, not a module load. A line comment is dropped only where `//` starts the comment, not
  // inside a URL string (`https://…`).
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](@tracy\/[a-z0-9][a-z0-9.-]*)(?:\/[^"']*)?["']/g
  for (const m of code.matchAll(re)) if (!installed.has(m[1])) found.add(m[1])
  return [...found].sort()
}
