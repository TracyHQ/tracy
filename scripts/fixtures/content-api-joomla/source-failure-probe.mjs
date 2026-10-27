// Run only after the main runtime suite releases the isolated fixture.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { validateContent } from '../../../packages/cms/tracy-content-api/validate.mjs'
const privatePath = process.env.CONTENT_API_PILOT_PRIVATE
assert.equal(privatePath, '/tmp/content-api-p2-runtime/private.json')
assert.equal(fs.existsSync('/tmp/content-api-p2-runtime/fixture-dirty'), false, 'main suite must be idle')
const { token } = JSON.parse(fs.readFileSync(privatePath))
const sql = (query) => {
  try {
    return execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'content-api-p2-db-1',
        'sh',
        '-c',
        'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names joomla'
      ],
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
  } catch {
    throw new Error('Private fixture SQL failed; output withheld')
  }
}
const recovery = '/tmp/content-api-p2-runtime/source-probe-dirty.json'
if (fs.existsSync(recovery)) {
  const { maxStatementTime } = JSON.parse(fs.readFileSync(recovery))
  assert.match(maxStatementTime, /^\d+(\.\d+)?$/)
  sql(`SET GLOBAL max_statement_time=${maxStatementTime}`)
  if (
    sql(
      "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='joomla' AND TABLE_NAME='ng_claudecowork_content_reader_probe'"
    ) === '1'
  )
    sql('RENAME TABLE ng_claudecowork_content_reader_probe TO ng_claudecowork_content_reader')
  sql(fs.readFileSync('/tmp/content-api-p2-runtime/checkpoint.sql', 'utf8'))
  fs.rmSync(recovery)
}
const maxStatementTime = sql('SELECT @@GLOBAL.max_statement_time')
assert.match(maxStatementTime, /^\d+(\.\d+)?$/)
fs.writeFileSync(recovery, JSON.stringify({ maxStatementTime }), { mode: 0o600 })
const read = async () => {
  const response = await fetch('http://127.0.0.1:52122/content.json?limit=1', {
    headers: { authorization: 'Bearer ' + token }
  })
  const raw = await response.text()
  assert.ok(!raw.includes(token), 'no credential in response')
  const body = JSON.parse(raw)
  assert.deepEqual(validateContent(body), [])
  return { status: response.status, body }
}
let renamed = false
try {
  assert.equal((await read()).status, 200)
  sql('RENAME TABLE ng_claudecowork_content_reader TO ng_claudecowork_content_reader_probe')
  renamed = true
  assert.equal((await read()).status, 501, 'missing opt-in metadata is unsupported')
  sql('RENAME TABLE ng_claudecowork_content_reader_probe TO ng_claudecowork_content_reader')
  renamed = false
  const writer = spawn(
    'docker',
    [
      'exec',
      '-i',
      'content-api-p2-db-1',
      'sh',
      '-c',
      'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --unbuffered joomla'
    ],
    { stdio: ['pipe', 'pipe', 'ignore'] }
  )
  const ready = new Promise((resolve, reject) => {
    writer.stdout.on('data', (data) => {
      if (data.toString().includes('locked')) resolve()
    })
    writer.on('error', reject)
    writer.on('exit', (code) => {
      if (code) reject(new Error('Fixture lock failed'))
    })
  })
  const done = new Promise((resolve, reject) => {
    writer.on('error', reject)
    writer.on('exit', (code) => (code ? reject(new Error('Fixture lock failed')) : resolve()))
  })
  writer.stdin.end(
    "LOCK TABLES ng_claudecowork_content_reader WRITE; SELECT 'locked'; DO SLEEP(4); UNLOCK TABLES;"
  )
  try {
    await ready
    sql('SET GLOBAL max_statement_time=1')
    const failed = await read()
    assert.equal(failed.status, 503, 'real DB statement timeout is unavailable, not unsupported')
    assert.equal(failed.body.error.code, 'CONTENT_SOURCE_UNAVAILABLE')
  } finally {
    await done
    sql(`SET GLOBAL max_statement_time=${maxStatementTime}`)
  }
  assert.equal((await read()).status, 200)
  const evidence = new URL('../../../tasks/evidence/content-api-p2/', import.meta.url)
  fs.mkdirSync(evidence, { recursive: true })
  fs.writeFileSync(
    new URL('source-failure.json', evidence),
    JSON.stringify(
      {
        missingMetadata: 501,
        lockedMetadataStatementTimeout: 503,
        recoveredRead: 200,
        method: 'real MariaDB WRITE lock and max_statement_time=1; restored in finally'
      },
      null,
      2
    ) + '\n'
  )
  console.log('PASS real missing metadata 501, DB timeout 503, recovered read 200')
} finally {
  sql(`SET GLOBAL max_statement_time=${maxStatementTime}`)
  if (renamed) sql('RENAME TABLE ng_claudecowork_content_reader_probe TO ng_claudecowork_content_reader')
  sql(fs.readFileSync('/tmp/content-api-p2-runtime/checkpoint.sql', 'utf8'))
  fs.rmSync(recovery)
}
