// A small valid webroot archive (tar.gz) for tests that hand a pack to release.mjs: a wp-config.php and
// whatever else the test names. `acceptedConfig` is the official image's wp-config-docker.php rendered the way pack.mjs ships it.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { renderQuickstartConfig } from '../../quickstart/lib.mjs'

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quickstart')
export const dockerConfig = readFileSync(path.join(FX, 'wp-config.docker.php'), 'utf8')
export const officialConfig = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', 'quickstart', 'wp-config-docker.php'), 'utf8')
export const acceptedConfig = renderQuickstartConfig(officialConfig, { prefix: 'tr_' }).source

function header(name, size, type = '0', linkname = '') {
  const h = Buffer.alloc(512)
  h.write(name, 0, 100, 'utf8')
  h.write('0000644\0', 100)
  h.write('0000000\0', 108)
  h.write('0000000\0', 116)
  h.write(size.toString(8).padStart(11, '0') + '\0', 124)
  h.write('00000000000\0', 136)
  h.write('        ', 148)
  h.write(type, 156)
  h.write(linkname, 157, 100, 'utf8')
  h.write('ustar\0', 257)
  h.write('00', 263)
  let sum = 0
  for (const b of h) sum += b
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return h
}

/** The tar.gz bytes of `files` ({name: text}); wp-config.php defaults to the accepted form, null leaves a file out, {type, linkname} writes a member of that tar type (`2` symlink, `5` directory) with no content. */
export function webrootTar(files = {}) {
  const all = { 'wp-config.php': acceptedConfig, ...files }
  const parts = []
  for (const [name, text] of Object.entries(all)) {
    if (text === null) continue
    if (text !== null && typeof text === 'object' && !Buffer.isBuffer(text)) {
      parts.push(header(name, 0, text.type, text.linkname))
      continue
    }
    const body = Buffer.from(text)
    parts.push(header(name, body.length), body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts), { level: 6 })
}
