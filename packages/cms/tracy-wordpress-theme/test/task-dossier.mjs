// A template's working dossier (`tasks/<name>/`: spec, tools, release records). It lives only in the
// private repository; the public export leaves `tasks/` out, so the tests that read it skip there.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** `{ dir, skip }` — `skip` is false when the dossier is present, else the reason to pass to `test()`. */
export function taskDossier(name) {
  const dir = path.join(ROOT, 'tasks', name)
  return { dir, skip: existsSync(dir) ? false : `tasks/${name} is internal and not in this tree` }
}
