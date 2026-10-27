import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { flushImportResults, reportImportResult } from '../src/host/operation-signal.ts'

for (const run of [crypto.randomUUID(), 'muqo145i6qa75r'])
  test(`import result ${run} survives an unavailable web, retries with its run ID and is removed only on acknowledgement`, async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'tracy-import-signal-'))
    const previousHome = process.env.DSH_HOME
    const previousFetch = globalThis.fetch
    process.env.DSH_HOME = home
    globalThis.fetch = async () => new Response('', { status: 503 })
    try {
      const notice = {
        origin: 'http://tracy-web:8080',
        siteKey: 'import.example.com',
        cookie: 'tracy_sess=private-fixture',
        result: { run_id: run, state: 'done', step: 'handing_over', reason: null, seconds: 12 }
      }
      await reportImportResult(notice)
      const dir = path.join(home, 'tracy-add-site', 'operation-results')
      assert.deepEqual(await readdir(dir), [`${run}.json`])
      assert.equal((await stat(path.join(dir, `${run}.json`))).mode & 0o777, 0o600)
      assert.deepEqual(JSON.parse(await readFile(path.join(dir, `${run}.json`), 'utf8')), notice)
      let deliveries = 0
      const accept = async (url, opts) => {
        deliveries++
        assert.equal(String(url), 'http://tracy-web:8080/api/sites/import.example.com/import-result')
        assert.equal(JSON.parse(opts.body).run_id, run)
        assert.equal(opts.headers.cookie, notice.cookie)
        return Response.json({ ok: true, recorded: false })
      }
      await Promise.all([flushImportResults(accept), flushImportResults(accept)])
      assert.equal(deliveries, 1)
      assert.deepEqual(await readdir(dir), [])
    } finally {
      globalThis.fetch = previousFetch
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(home, { recursive: true, force: true })
    }
  })
