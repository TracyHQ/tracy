// The pure parts of the export installer (`scripts/lib/export-installer.php`): the serialized-aware
// address replace, the SQL dump reader, tar member names and the configuration editors. The cases
// live in `export-installer-unit.php`; the end-to-end install on Apache + MariaDB is
// `e2e/export-installer/run.sh` (Docker, not part of this suite).
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const support = phpSupport()
let php
before(() => {
  if (!support.skip)
    php = startPhp({
      image: 'php:8.3-cli',
      files: {
        cwd: join(here, '..'),
        paths: ['test/export-installer-unit.php', 'scripts/lib/export-installer.php']
      }
    })
})
after(() => php?.stop())

test('export installer: serialized replace, dump reader, tar names and config editors', {
  skip: support.skip
}, () => {
  const [r] = php.run([{ args: [join(php.root, 'test/export-installer-unit.php')] }])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^all passed$/m)
})
