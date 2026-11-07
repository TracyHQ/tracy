// The version stamp of a kit: the template version measured on the site, the quickstart version of the
// contract, and the sha256 of every image, so a kit can be checked against the release it was made from.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** `<version>` of a Joomla `templateDetails.xml`, or null. */
/** The `Version:` line of a WordPress theme's `style.css` header, or null. */
export function themeVersionOf(css) {
  const head = /\/\*[\s\S]*?\*\//.exec(String(css ?? ''))?.[0] ?? ''
  return /^[\s*]*Version:\s*([^\s*]+)/im.exec(head)?.[1] ?? null
}

export function templateVersionOf(xml) {
  const m = String(xml ?? '').match(/<extension\b[\s\S]*?<version>\s*([^<\s]+)\s*<\/version>/i)
  return m ? m[1] : null
}

/** Every image under `dir` with its sha256 and size, sorted by path (paths use `/`). */
export function imageChecksums(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(jpe?g|png|webp)$/i.test(name)) {
        const buf = readFileSync(p)
        out.push({
          file: relative(dir, p).split('\\').join('/'),
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex')
        })
      }
    }
  }
  walk(dir)
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

/**
 * @param {{manifest: object, templateVersion: string|null, templateVersionFrom: string, images: object[], tool: string}} o
 */
export function buildStamp({ manifest, templateVersion, templateVersionFrom, images, tool }) {
  const q = manifest?.quickstart ?? {}
  return {
    kit: 'tracy-template-kit/1',
    tool,
    contract: manifest?.id ?? null,
    template: {
      // A WordPress contract names its template a theme.
      name: manifest?.template ?? q.template ?? manifest?.theme ?? q.theme ?? null,
      version: templateVersion,
      measuredFrom: templateVersionFrom
    },
    quickstart: {
      // A WordPress contract names no product: it is the slug of its release tag (`quickstart/<product>/wp7`).
      product: q.product ?? /^quickstart\/([^/]+)\//.exec(q.release ?? '')?.[1] ?? null,
      version: q.version ?? null,
      cms: q.cms?.version ?? q.platformVersion ?? null
    },
    images: { count: images.length, files: images }
  }
}
