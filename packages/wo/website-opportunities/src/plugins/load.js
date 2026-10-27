/** Plugin files on disk: each `.js` or `.mjs` file of a folder, in name order, by its default export. */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** @returns {Promise<{ file: string, plugin: unknown }[]>} a TypeError names a file without a default export. */
export async function loadPluginFiles(dir) {
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && /\.m?js$/.test(e.name))
    .map((e) => e.name)
    .sort()
  const out = []
  for (const name of names) {
    const file = join(dir, name)
    const mod = await import(pathToFileURL(file).href)
    if (mod.default === undefined) throw new TypeError(`plugin file ${name} has no default export`)
    out.push({ file, plugin: mod.default })
  }
  return out
}
