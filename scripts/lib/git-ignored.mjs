/** Ask Git about files reached through symlink mirrors without aborting the entire ignore batch. */
import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export function gitIgnoredFiles(root, files) {
  // Git refuses a path below a symlink. Ask about that link, while still checking the document
  // reached through it whenever the link itself is not ignored (the tracked skills mirror).
  const keys = files.map((file) => {
    const parts = relative(root, resolve(root, file)).split(sep)
    let key = ''
    for (const part of parts) {
      key = join(key, part)
      if (lstatSync(resolve(root, key)).isSymbolicLink()) return key
    }
    return key
  })
  if (!keys.length) return new Set()
  let output
  try {
    output = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: root,
      input: [...new Set(keys)].join('\n'),
      encoding: 'utf8'
    })
  } catch (error) {
    if (error.status === 1) return new Set()
    throw error
  }
  const ignored = new Set(output.split('\n').filter(Boolean))
  return new Set(files.filter((_, i) => ignored.has(keys[i])).map((file) => resolve(root, file)))
}
