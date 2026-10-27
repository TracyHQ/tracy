// Opt-in destructive fixture tests: only the dedicated content-api-p2 containers are accepted.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { hostCall, hostJob } from '../../apps/tracy-web/src/host/client.js'
import { buildApp } from '../../apps/tracy-web/src/app.js'
import { readConfig } from '../../apps/tracy-web/src/config.js'
import { mintSession } from '../../apps/tracy-web/src/lib/session.js'
import { writeRolePolicy } from '../../apps/tracy-web/src/seats/store.js'
import { writeComponent } from '../../apps/tracy-web/src/sites/store.js'
import { freshPool } from '../../apps/tracy-web/test/_db.mjs'
import { validateContent, validateContentGraph } from '../../packages/cms/tracy-content-api/validate.mjs'
const require = createRequire(new URL('../../apps/tracy-web/package.json', import.meta.url))
const { serve } = require('@hono/node-server')
const enabled = process.env.CONTENT_API_PILOT_PRIVATE && process.env.TEST_DATABASE_URL

// Asked for by naming the fixture, and unable to run without a database: that is a failure, not a
// skip. Without `CONTENT_API_PILOT_PRIVATE` the test is skipped and the tests gate lists it by name.
if (process.env.CONTENT_API_PILOT_PRIVATE && !process.env.TEST_DATABASE_URL) {
  test('the Joomla pilot was asked for (CONTENT_API_PILOT_PRIVATE) and has a database', () => {
    assert.fail(
      'CONTENT_API_PILOT_PRIVATE is set but TEST_DATABASE_URL is not: the test cannot run, and that is not a skip'
    )
  })
}
const evidence = new URL('../../tasks/evidence/content-api-p2/', import.meta.url)
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
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
    ).trim()
  } catch (error) {
    throw new Error(`Private fixture SQL failed (status ${error.status ?? error.code}); output withheld`)
  }
}
const tableHash = () =>
  sql('SELECT SHA2(GROUP_CONCAT(SHA2(binding,256) ORDER BY id),256) FROM ng_claudecowork_content_contract')

test('Joomla pilot over real HTTP, MariaDB and Tracy seat relay', {
  skip: !enabled,
  timeout: 900000
}, async () => {
  // The evidence folder is internal (`tasks/`); a tree without it gets a fresh one.
  fs.mkdirSync(evidence, { recursive: true })
  const { token } = JSON.parse(fs.readFileSync(process.env.CONTENT_API_PILOT_PRIVATE, 'utf8'))
  const privateRoot = path.dirname(process.env.CONTENT_API_PILOT_PRIVATE)
  assert.equal(privateRoot, '/tmp/content-api-p2-runtime')
  const project = execFileSync(
    'docker',
    ['inspect', 'content-api-p2-db-1', '--format', '{{index .Config.Labels "com.docker.compose.project"}}'],
    { encoding: 'utf8' }
  ).trim()
  assert.equal(project, 'content-api-p2')
  const checkpoint = path.join(privateRoot, 'checkpoint.sql')
  const dirty = path.join(privateRoot, 'fixture-dirty')
  const fileCheckpoint = path.join(privateRoot, 'checkpoint-files.json')
  const restore = () => sql(fs.readFileSync(checkpoint, 'utf8'))
  if (fs.existsSync(dirty)) {
    restore()
    if (!fs.existsSync(fileCheckpoint)) throw new Error('Recover fixture files before rerunning')
    for (const file of JSON.parse(fs.readFileSync(fileCheckpoint, 'utf8'))) {
      const name = path.join(privateRoot, 'webroot', file.name)
      if (file.bytes === null) fs.rmSync(name, { force: true })
      else fs.writeFileSync(name, Buffer.from(file.bytes, 'base64'))
    }
    fs.rmSync(dirty)
  }
  const dump = execFileSync(
    'docker',
    [
      'exec',
      'content-api-p2-db-1',
      'sh',
      '-c',
      'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --skip-comments --skip-dump-date joomla'
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  )
  fs.writeFileSync(checkpoint, dump, { mode: 0o600 })
  const webroot = path.join(privateRoot, 'webroot')
  const files = [
    'images/content-api-pilot.txt',
    'images/content-api-visible.png',
    'images/content-api-unrelated.png',
    'content.json',
    'configuration.php',
    'tracy-changed.json',
    'tracy-changed.json.tmp'
  ].map((name) => ({
    name,
    bytes: fs.existsSync(path.join(webroot, name)) ? fs.readFileSync(path.join(webroot, name)) : null
  }))
  fs.writeFileSync(
    fileCheckpoint,
    JSON.stringify(files.map((f) => ({ name: f.name, bytes: f.bytes?.toString('base64') ?? null }))),
    { mode: 0o600 }
  )
  fs.writeFileSync(dirty, 'Restore checkpoint.sql and checkpoint-files.json before reuse.\n', { mode: 0o600 })
  try {
    const base = 'http://127.0.0.1:52122'
    const results = []
    let imageUsagesChecked = 0
    const request = async (path = '', auth = token, init = {}) => {
      const start = performance.now()
      const response = await fetch(`${base}/content.json${path}`, {
        ...init,
        headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...init.headers }
      })
      const text = await response.text()
      assert.ok(!text.includes(token), 'credential never appears in response')
      const body = JSON.parse(text)
      assert.deepEqual(validateContent(body), [], 'live response conforms to P1')
      // A picture read from a slot names the block that slot is (25/09, dev `capij1600`: every
      // usage said blockId null, so "which block is this image in" had no answer).
      // Only an unpaginated detail holds every block: a block segment (blockId / blocksCursor,
      // or any page of a paginated detail, the last one included) carries the whole image list
      // beside one slice of the blocks.
      for (const content of body.contents ?? [])
        for (const image of content.images ?? [])
          for (const usage of image.usages)
            if (
              usage.contentId === content.id &&
              !content.blocksPagination &&
              (content.blocks ?? []).length > 0
            ) {
              assert.ok(
                content.blocks.some((b) => b.id === usage.blockId),
                `image ${image.src} names a block of ${content.id}`
              )
              imageUsagesChecked++
            }
      results.push({
        kind: path.includes('id=') ? 'detail' : 'list',
        status: response.status,
        bytes: Buffer.byteLength(text),
        ms: +(performance.now() - start).toFixed(2)
      })
      return { status: response.status, body, headers: response.headers }
    }
    const readTablesHash = () =>
      createHash('sha256')
        .update(
          execFileSync(
            'docker',
            [
              'exec',
              'content-api-p2-db-1',
              'sh',
              '-c',
              'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --skip-comments --skip-dump-date --compact joomla ng_content ng_menu ng_modules ng_modules_menu ng_assets ng_categories ng_associations ng_claudecowork_content_contract ng_claudecowork_content_identity ng_claudecowork_content_reader'
            ],
            { maxBuffer: 64 * 1024 * 1024 }
          )
        )
        .digest('hex')
    const readBefore = readTablesHash()
    const before = tableHash()
    const cursorStarted = Date.now()
    const initial = await request('?limit=2')
    assert.equal(initial.status, 200)
    fs.writeFileSync(new URL('list.json', evidence), JSON.stringify(initial.body, null, 2) + '\n')
    for (const auth of [null, '', 'incorrect-token-that-is-long'])
      assert.equal((await request('', auth)).status, 401)
    assert.equal((await request('?token=not-a-credential', null)).status, 401)
    assert.equal((await request('?token=not-a-credential')).status, 400)
    assert.equal((await request('', null, { headers: { 'if-none-match': '*' } })).status, 401)
    assert.equal(initial.headers.get('cache-control'), 'private, no-store')
    for (const query of [
      '?unknown=x',
      '?limit=0',
      '?limit=101',
      '?limit=NaN',
      '?limit=2&limit=3',
      '?limit[]=2',
      '?id=x&cursor=y'
    ]) {
      assert.equal((await request(query)).status, 400, query)
    }
    const missing = await request('?id=content_missing')
    assert.equal(missing.status, 404)
    const firstCursor = initial.body.pagination.nextCursor
    assert.equal(
      (
        await request(
          '?limit=2&cursor=' +
            encodeURIComponent(firstCursor.slice(0, -1) + (firstCursor.endsWith('a') ? 'b' : 'a'))
        )
      ).status,
      400
    )
    assert.equal((await request('?limit=3&cursor=' + encodeURIComponent(firstCursor))).status, 400)
    const all = []
    let page = await request('?limit=100')
    while (true) {
      all.push(...page.body.contents)
      if (!page.body.pagination.nextCursor) break
      page = await request('?limit=100&cursor=' + encodeURIComponent(page.body.pagination.nextCursor))
    }
    assert.equal(new Set(all.map((c) => c.id)).size, all.length)
    assert.equal(all.length, page.body.pagination.total)
    const details = []
    for (const kind of ['page', 'article', 'shared']) {
      const summary = all.find((c) => c.type === kind)
      assert.ok(summary, kind)
      const detail = await request('?id=' + summary.id)
      details.push(detail.body.contents[0])
      fs.writeFileSync(new URL(`detail-${kind}.json`, evidence), JSON.stringify(detail.body, null, 2) + '\n')
    }
    assert.equal(tableHash(), before, 'GET leaves contract binding and job unchanged')
    assert.equal(
      readTablesHash(),
      readBefore,
      'GET leaves customer content, assets, binding and identity byte-identical'
    )
    console.log(
      `PASS auth/query/list/details and read-only DB hash (${imageUsagesChecked} image usages name their block)`
    )
    // Select the exact mapped response, not an assumed archive/native identity.
    const article = all.find((c) => c.type === 'article')
    assert.ok(article, 'mapped live article selected')
    const articleNative = new URL(article.url).searchParams.get('id')
    assert.match(articleNative, /^\d+$/)
    const priorTitle = sql(`SELECT HEX(title) FROM ng_content WHERE id=${articleNative}`)
    const priorAlias = sql(`SELECT HEX(alias) FROM ng_content WHERE id=${articleNative}`)
    sql(
      `UPDATE ng_content SET title='Content API live admin edit',alias='content-api-new-slug' WHERE id=${articleNative}`
    )
    assert.equal((await request('?limit=2&cursor=' + encodeURIComponent(firstCursor))).status, 409)
    const edited = await request('?id=' + article.id)
    assert.equal(edited.body.contents[0].title, 'Content API live admin edit')
    assert.equal(edited.body.contents[0].slug, 'content-api-new-slug')
    sql(
      `UPDATE ng_content SET title=UNHEX('${priorTitle}'),alias=UNHEX('${priorAlias}') WHERE id=${articleNative}`
    )
    const invalidates = async (change, restore) => {
      const head = await request('?limit=2')
      try {
        sql(change)
        assert.equal(
          (await request('?limit=2&cursor=' + encodeURIComponent(head.body.pagination.nextCursor))).status,
          409
        )
      } finally {
        sql(restore)
      }
    }
    const oldAccess = sql(`SELECT access FROM ng_content WHERE id=${articleNative}`)
    const aclHead = await request('?limit=2')
    sql(`UPDATE ng_content SET access=999999 WHERE id=${articleNative}`)
    assert.equal((await request('?id=' + article.id)).status, 404)
    assert.deepEqual((await request('?id=' + article.id)).body, missing.body)
    assert.equal(
      (await request('?limit=2&cursor=' + encodeURIComponent(aclHead.body.pagination.nextCursor))).status,
      409
    )
    sql(`UPDATE ng_content SET access=${oldAccess} WHERE id=${articleNative}`)
    const unchanged = async (change, reset) => {
      const head = await request('?limit=2')
      try {
        sql(change)
        const after = await request('?limit=2')
        assert.equal(after.body.snapshot.revision, head.body.snapshot.revision)
        assert.equal(
          (await request('?cursor=' + encodeURIComponent(head.body.pagination.nextCursor))).status,
          200
        )
      } finally {
        sql(reset)
      }
    }
    await unchanged(
      "UPDATE ng_viewlevels SET title=CONCAT(title,' pilot') WHERE id=1",
      "UPDATE ng_viewlevels SET title=REPLACE(title,' pilot','') WHERE id=1"
    )
    try {
      sql(`UPDATE ng_content SET access=999999 WHERE id=${articleNative}`)
      await unchanged(
        `UPDATE ng_content SET title='Hidden change' WHERE id=${articleNative}`,
        `UPDATE ng_content SET title=UNHEX('${priorTitle}') WHERE id=${articleNative}`
      )
    } finally {
      sql(`UPDATE ng_content SET access=${oldAccess} WHERE id=${articleNative}`)
    }
    // A real wall clock boundary, no mocked clock and no updated timestamp change.
    const oldDown = sql(`SELECT IFNULL(HEX(publish_down),'NULL') FROM ng_content WHERE id=${articleNative}`)
    sql(`UPDATE ng_content SET publish_down=UTC_TIMESTAMP()+INTERVAL 3 SECOND WHERE id=${articleNative}`)
    const scheduled = await request('?limit=2')
    await new Promise((resolve) => setTimeout(resolve, 3200))
    assert.equal(
      (await request('?limit=2&cursor=' + encodeURIComponent(scheduled.body.pagination.nextCursor))).status,
      409
    )
    sql(
      `UPDATE ng_content SET publish_down=${oldDown === 'NULL' ? 'NULL' : `UNHEX('${oldDown}')`} WHERE id=${articleNative}`
    )
    const moduleNative = sql(
      "SELECT id FROM ng_modules WHERE module='mod_custom' AND published=1 AND access=1 ORDER BY id LIMIT 1"
    )
    const oldContent = sql(`SELECT HEX(content) FROM ng_modules WHERE id=${moduleNative}`)
    await invalidates(
      `UPDATE ng_modules SET content=CONCAT(content,'<!-- pilot -->') WHERE id=${moduleNative}`,
      `UPDATE ng_modules SET content=UNHEX('${oldContent}') WHERE id=${moduleNative}`
    )
    // Permission dependencies, exercised directly in the isolated DB; not CMS lifecycle evidence.
    const categoryId = sql(`SELECT catid FROM ng_content WHERE id=${articleNative}`)
    const categoryAccess = sql(`SELECT access FROM ng_categories WHERE id=${categoryId}`)
    await invalidates(
      `UPDATE ng_categories SET access=999999 WHERE id=${categoryId}`,
      `UPDATE ng_categories SET access=${categoryAccess} WHERE id=${categoryId}`
    )
    const publicRules = sql('SELECT HEX(rules) FROM ng_viewlevels WHERE id=1')
    await invalidates(
      "UPDATE ng_viewlevels SET rules='[2]' WHERE id=1",
      `UPDATE ng_viewlevels SET rules=UNHEX('${publicRules}') WHERE id=1`
    )
    try {
      sql(`UPDATE ng_modules SET access=999999 WHERE id=${moduleNative}`)
      await unchanged(
        `UPDATE ng_modules SET content=CONCAT(content,'<!-- hidden edit -->') WHERE id=${moduleNative}`,
        `UPDATE ng_modules SET content=UNHEX('${oldContent}') WHERE id=${moduleNative}`
      )
    } finally {
      sql(`UPDATE ng_modules SET access=1 WHERE id=${moduleNative}`)
    }
    const oldOrder = sql(`SELECT ordering FROM ng_modules WHERE id=${moduleNative}`)
    await invalidates(
      `UPDATE ng_modules SET ordering=ordering+1000 WHERE id=${moduleNative}`,
      `UPDATE ng_modules SET ordering=${oldOrder} WHERE id=${moduleNative}`
    )
    const mediaHead = await request('?limit=2')
    execFileSync('docker', [
      'exec',
      'content-api-p2-web-1',
      'sh',
      '-c',
      'printf pilot > /var/www/html/images/content-api-pilot.txt'
    ])
    assert.equal(
      (await request('?limit=2&cursor=' + encodeURIComponent(mediaHead.body.pagination.nextCursor))).status,
      200
    )
    execFileSync('docker', [
      'exec',
      'content-api-p2-web-1',
      'rm',
      '/var/www/html/images/content-api-pilot.txt'
    ])
    // Native DELETE/INSERT with the exact same primary key and slug must mint another identity.
    const identityBefore = sql(
      `SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${articleNative}`
    )
    sql(
      `CREATE TEMPORARY TABLE pilot_copy AS SELECT * FROM ng_content WHERE id=${articleNative}; DELETE FROM ng_content WHERE id=${articleNative}; INSERT INTO ng_content SELECT * FROM pilot_copy; DROP TEMPORARY TABLE pilot_copy;`
    )
    const identityAfter = sql(
      `SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${articleNative}`
    )
    assert.notEqual(identityAfter, identityBefore)
    assert.equal((await request('?id=' + article.id)).status, 404)
    // Restore only the pilot metadata so repeated fixture runs stay comparable.
    sql(
      `UPDATE ng_claudecowork_content_identity SET uid='${identityBefore}' WHERE kind='article' AND native_id=${articleNative}`
    )

    console.log('PASS SQL revision/ACL/schedule/shared/media/identity cases')
    // Joomla's native write door: fresh inspect revision, mapped apply, live read, revert.
    const native = async (action, params) => {
      const start = performance.now()
      const response = await fetch(base + '/index.php?option=com_claudecowork&task=api.exec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, action, params })
      })
      const text = await response.text()
      assert.ok(!text.includes(token))
      const body = JSON.parse(text)
      results.push({
        kind: 'native-' + action,
        bytes: Buffer.byteLength(text),
        ms: +(performance.now() - start).toFixed(2),
        status: response.status
      })
      return body
    }
    const inspect = await native('content.contract', { operation: 'inspect' })
    assert.equal(inspect.ok, true, JSON.stringify(inspect).slice(0, 200))
    fs.writeFileSync(path.join(privateRoot, 'native-inspect.json'), JSON.stringify(inspect), { mode: 0o600 })
    const shared = details.find((c) => c.type === 'shared')
    const field = shared.blocks
      .flatMap((b) => b.fields)
      .find(
        (f) =>
          f.type === 'text' &&
          inspect.slots.some(
            (slot) =>
              slot.key === f.slotKey && !slot.derived && slot.maxCharacters >= 20 && !slot.requiresEvidence
          )
      )
    assert.ok(field, 'a visible native source slot is available')
    const apply = await native('content.contract', {
      operation: 'apply',
      apply_id: 'contract-content-api-p2',
      request_id: 'content-api-p2',
      expected_revision: inspect.revision,
      changes: { [field.slotKey]: 'Pilot read check' },
      evidence: {}
    })
    assert.equal(apply.ok, true, JSON.stringify(apply).slice(0, 200))
    const applied = await request('?id=' + shared.id)
    assert.equal(
      applied.body.contents[0].blocks.flatMap((b) => b.fields).find((f) => f.slotKey === field.slotKey).value,
      'Pilot read check'
    )
    const reverted = await native('apply.revert', { apply_id: 'contract-content-api-p2' })
    assert.equal(reverted.ok, true, JSON.stringify(reverted).slice(0, 200))
    const restored = await request('?id=' + shared.id)
    assert.equal(
      restored.body.contents[0].blocks.flatMap((b) => b.fields).find((f) => f.slotKey === field.slotKey)
        .value,
      field.value
    )
    fs.writeFileSync(
      new URL('native-write-regression.json', evidence),
      JSON.stringify(
        {
          inspect: { ok: inspect.ok, revision: inspect.revision },
          apply: { ok: apply.ok },
          revert: { ok: reverted.ok },
          slotKey: field.slotKey,
          readAfterApply: true,
          readAfterRevert: true
        },
        null,
        2
      ) + '\n'
    )

    // Credential provisioning is SQL fixture setup. The article mutations below are REAL HTTP
    // requests to Joomla's API controller/model/Table/plugin lifecycle, not SQL masquerading as API.
    execFileSync('docker', [
      'cp',
      new URL('../fixtures/content-api-joomla/setup-api-token.php', import.meta.url).pathname,
      'content-api-p2-web-1:/tmp/content-api-setup-api.php'
    ])
    execFileSync('docker', ['exec', 'content-api-p2-web-1', 'php', '/tmp/content-api-setup-api.php'])
    const cmsToken = JSON.parse(
      execFileSync('docker', ['exec', 'content-api-p2-web-1', 'cat', '/tmp/content-api-cms-token.json'], {
        encoding: 'utf8'
      })
    ).token
    const cms = async (method, route, body) => {
      const response = await fetch(base + '/api/index.php/v1/' + route, {
        method,
        headers: {
          'X-Joomla-Token': cmsToken,
          'content-type': 'application/json',
          accept: 'application/vnd.api+json'
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      const raw = await response.text()
      assert.ok(!raw.includes(cmsToken))
      assert.ok(!raw.includes(token))
      const answer = raw ? JSON.parse(raw) : null
      assert.ok(response.ok, 'Joomla API status ' + response.status + ': ' + raw.slice(0, 150))
      return answer
    }
    const apiBefore = await request('?limit=2')
    const oldVersion = sql(`SELECT version FROM ng_content WHERE id=${articleNative}`)
    await cms('PATCH', 'content/articles/' + articleNative, {
      title: 'Joomla API lifecycle edit',
      alias: 'joomla-api-lifecycle-edit'
    })
    const apiAfter = await request('?id=' + article.id)
    assert.equal(apiAfter.body.contents[0].title, 'Joomla API lifecycle edit')
    assert.equal(apiAfter.body.contents[0].slug, 'joomla-api-lifecycle-edit')
    assert.equal(apiAfter.body.contents[0].id, article.id)
    assert.notEqual(
      sql(`SELECT version FROM ng_content WHERE id=${articleNative}`),
      oldVersion,
      'CMS model/Table save increments article version'
    )
    assert.equal(
      (await request('?limit=2&cursor=' + encodeURIComponent(apiBefore.body.pagination.nextCursor))).status,
      409
    )
    fs.writeFileSync(new URL('cms-api-edit.json', evidence), JSON.stringify(apiAfter.body, null, 2) + '\n')
    await cms('PATCH', 'content/articles/' + articleNative, { state: 0 })
    assert.equal((await request('?id=' + article.id)).status, 404)
    await cms('PATCH', 'content/articles/' + articleNative, {
      state: 1,
      title: article.title,
      alias: article.slug
    })
    await cms('PATCH', 'content/articles/' + articleNative, { access: 2 })
    assert.equal((await request('?id=' + article.id)).status, 404)
    await cms('PATCH', 'content/articles/' + articleNative, { access: Number(oldAccess) })
    // Real Joomla media controller/model upload, then expose the asset through a native article save.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII='
    await cms('POST', 'media/files', {
      path: 'local-images:/content-api-visible.png',
      content: png,
      override: true
    })
    const nativeMarkup = Buffer.from(
      sql(`SELECT HEX(CONCAT(introtext,\`fulltext\`)) FROM ng_content WHERE id=${articleNative}`),
      'hex'
    ).toString()
    await cms('PATCH', 'content/articles/' + articleNative, {
      introtext: nativeMarkup + '<img src="images/content-api-visible.png" alt="Visible API image">',
      fulltext: ''
    })
    assert.ok(
      (await request('?id=' + article.id)).body.contents[0].bodyHtml.includes('content-api-visible.png'),
      'CMS API saved visible image reference'
    )
    const mediaBytesBefore = fs.readFileSync(path.join(webroot, 'images/content-api-visible.png'))
    const visibleMediaHead = await request('?limit=2')
    await cms('POST', 'media/files', {
      path: 'local-images:/content-api-visible.png',
      content: Buffer.concat([Buffer.from(png, 'base64'), Buffer.from('visible change')]).toString('base64'),
      override: true
    })
    assert.notDeepEqual(
      fs.readFileSync(path.join(webroot, 'images/content-api-visible.png')),
      mediaBytesBefore,
      'CMS media API changed file bytes'
    )
    assert.equal(
      (await request('?cursor=' + encodeURIComponent(visibleMediaHead.body.pagination.nextCursor))).status,
      409
    )
    const altHead = await request('?limit=2')
    await cms('PATCH', 'content/articles/' + articleNative, {
      introtext: nativeMarkup + '<img src="images/content-api-visible.png" alt="Changed API alt">',
      fulltext: ''
    })
    assert.ok((await request('?id=' + article.id)).body.contents[0].bodyHtml.includes('Changed API alt'))
    assert.equal(
      (await request('?cursor=' + encodeURIComponent(altHead.body.pagination.nextCursor))).status,
      409
    )
    const unrelatedHead = await request('?limit=2')
    await cms('POST', 'media/files', {
      path: 'local-images:/content-api-unrelated.png',
      content: png,
      override: true
    })
    assert.equal(
      (await request('?cursor=' + encodeURIComponent(unrelatedHead.body.pagination.nextCursor))).status,
      200
    )
    await cms('PATCH', 'content/articles/' + articleNative, { access: 2 })
    const hiddenMediaHead = await request('?limit=2')
    await cms('POST', 'media/files', {
      path: 'local-images:/content-api-visible.png',
      content: png,
      override: true
    })
    await cms('PATCH', 'content/articles/' + articleNative, { title: 'Hidden native API edit' })
    assert.equal((await request('?limit=2')).body.snapshot.revision, hiddenMediaHead.body.snapshot.revision)
    assert.equal(
      (await request('?cursor=' + encodeURIComponent(hiddenMediaHead.body.pagination.nextCursor))).status,
      200
    )
    await cms('PATCH', 'content/articles/' + articleNative, {
      access: Number(oldAccess),
      title: article.title,
      introtext: nativeMarkup,
      fulltext: ''
    })
    fs.writeFileSync(
      new URL('authorized-revision-media.json', evidence),
      JSON.stringify(
        {
          status: 'PASS',
          method:
            'Joomla API article PATCH and media POST/override; SQL ACL-label negative control separately',
          visibleMediaChange: 409,
          nativeImageAltChange: 409,
          unreferencedUpload: 200,
          hiddenTitleAndMedia: 200
        },
        null,
        2
      ) + '\n'
    )
    console.log('PASS native inspect/apply/revert and Joomla API edit/draft/ACL')
    const translated = all.find((c) => c.type === 'article' && c.translationGroupId && c.locale)
    const translation = all.find(
      (c) =>
        c.type === 'article' &&
        c.id !== translated?.id &&
        c.translationGroupId === translated?.translationGroupId &&
        c.locale !== translated?.locale
    )
    assert.ok(translated && translation, 'readable native article association pair')
    const firstNative = new URL(translated.url).searchParams.get('id')
    const secondNative = new URL(translation.url).searchParams.get('id')
    await cms('PATCH', 'content/articles/' + secondNative, { state: 0 })
    const noDraft = await request('?id=' + translated.id)
    assert.ok(!noDraft.body.contents[0].relations.some((r) => r.contentId === translation.id))
    const hiddenTranslationHead = await request('?limit=2')
    await cms('PATCH', 'content/articles/' + secondNative, { title: 'Hidden translation edit' })
    assert.equal(
      (await request('?limit=2')).body.snapshot.revision,
      hiddenTranslationHead.body.snapshot.revision
    )
    assert.equal((await request('?id=' + translation.id)).status, 404)
    await cms('PATCH', 'content/articles/' + firstNative, { alias: 'content-api-same-locale-slug' })
    await cms('PATCH', 'content/articles/' + secondNative, {
      alias: 'content-api-same-locale-slug',
      state: 1,
      title: translation.title
    })
    const firstTranslated = await request('?id=' + translated.id)
    const secondTranslated = await request('?id=' + translation.id)
    assert.equal(firstTranslated.body.contents[0].slug, secondTranslated.body.contents[0].slug)
    assert.notEqual(firstTranslated.body.contents[0].locale, secondTranslated.body.contents[0].locale)
    assert.notEqual(firstTranslated.body.contents[0].id, secondTranslated.body.contents[0].id)
    await cms('PATCH', 'content/articles/' + firstNative, { alias: translated.slug })
    await cms('PATCH', 'content/articles/' + secondNative, { alias: translation.slug })
    fs.writeFileSync(
      new URL('cms-api-translations.json', evidence),
      JSON.stringify(
        {
          status: 'PASS',
          method: 'native Joomla article PATCH',
          draftNotReferenced: true,
          hiddenEditDoesNotChangeRevision: true,
          sameSlugSeparateLocaleAndId: true
        },
        null,
        2
      ) + '\n'
    )
    const catid = Number(sql(`SELECT catid FROM ng_content WHERE id=${articleNative}`))
    const created = await cms('POST', 'content/articles', {
      title: 'Content API lifecycle fixture',
      alias: 'content-api-lifecycle-fixture',
      catid,
      articletext: '<p>Temporary lifecycle fixture</p>',
      language: article.locale,
      state: 1
    })
    const createdId = Number(created.data.id)
    assert.ok(createdId > 0)
    const createdUid = sql(
      `SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${createdId}`
    )
    assert.match(createdUid, /^[a-f0-9]{32}$/)
    await cms('PATCH', 'content/articles/' + createdId, { alias: 'content-api-lifecycle-renamed' })
    assert.equal(
      sql(`SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${createdId}`),
      createdUid
    )
    await cms('PATCH', 'content/articles/' + createdId, { state: -2 })
    await cms('DELETE', 'content/articles/' + createdId)
    assert.equal(
      sql(`SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${createdId}`),
      ''
    )
    const recreated = await cms('POST', 'content/articles', {
      title: 'Content API lifecycle fixture',
      alias: 'content-api-lifecycle-renamed',
      catid,
      articletext: '<p>New incarnation</p>',
      language: article.locale,
      state: 1
    })
    const recreatedId = Number(recreated.data.id)
    assert.notEqual(
      sql(
        `SELECT uid FROM ng_claudecowork_content_identity WHERE kind='article' AND native_id=${recreatedId}`
      ),
      createdUid
    )
    await cms('PATCH', 'content/articles/' + recreatedId, { state: -2 })
    await cms('DELETE', 'content/articles/' + recreatedId)
    fs.writeFileSync(
      new URL('cms-api-lifecycle.json', evidence),
      JSON.stringify(
        {
          transport: 'Joomla HTTP API',
          articleSaveIncrementsVersion: true,
          aliasKeepsIdentity: true,
          insertCreatesRegistryIdentity: true,
          deleteRemovesIdentity: true,
          recreateChangesIdentity: true
        },
        null,
        2
      ) + '\n'
    )
    console.log('PASS Joomla API create/rename/delete/recreate registry lifecycle')
    // Restore the full checkpoint too: Joomla save also writes assets/history/tags, which restoring
    // only title and alias would leave behind and invalidate later native contract measurements.
    restore()
    execFileSync('docker', [
      'exec',
      'content-api-p2-web-1',
      'rm',
      '-f',
      '/tmp/content-api-cms-token.json',
      '/tmp/content-api-setup-api.php'
    ])

    // Real credential rotation: the old service credential is revoked, never put in a URL.
    const tokenCursor = (await request('?limit=2')).body.pagination.nextCursor
    const rotated = randomBytes(32).toString('hex')
    try {
      sql(
        `UPDATE ng_extensions SET params=JSON_SET(params,'$.token','${rotated}') WHERE element='com_claudecowork' AND type='component'`
      )
      assert.equal((await request('?limit=2&cursor=' + encodeURIComponent(tokenCursor))).status, 401)
      assert.equal((await request('?limit=2&cursor=' + encodeURIComponent(tokenCursor), rotated)).status, 400)
      assert.equal((await request('?limit=2', rotated)).status, 200)
    } finally {
      restore()
    }
    console.log('PASS revoked service token and cursor principal epoch')

    execFileSync('docker', [
      'cp',
      '/tmp/cowork-content-api-p2/joomla/cowork/tools/enable-content-reader.php',
      'content-api-p2-web-1:/tmp/content-api-enable.php'
    ])
    const originalIdentityRead = await request('?limit=1')
    const originalSiteId = originalIdentityRead.body.site.id
    try {
      execFileSync('docker', [
        'exec',
        'content-api-p2-web-1',
        'php',
        '/tmp/content-api-enable.php',
        '--root=/var/www/html'
      ])
      assert.equal(
        (await request('?limit=1')).body.site.id,
        originalSiteId,
        'same-site setup preserves identity'
      )
      execFileSync('docker', [
        'exec',
        'content-api-p2-web-1',
        'php',
        '/tmp/content-api-enable.php',
        '--root=/var/www/html',
        '--new-site'
      ])
      const imported = await request('?limit=1')
      assert.notEqual(imported.body.site.id, originalSiteId)
      assert.equal(
        (await request('?cursor=' + encodeURIComponent(originalIdentityRead.body.pagination.nextCursor)))
          .status,
        400,
        'rekey invalidates old cursor'
      )
      assert.equal((await request('?id=' + article.id)).status, 404, 'import rekey separates identities')
    } finally {
      restore()
      execFileSync('docker', ['exec', 'content-api-p2-web-1', 'rm', '-f', '/tmp/content-api-enable.php'])
    }
    console.log('PASS opt-in CLI idempotence and explicit imported-site rekey')

    // Real concurrent MariaDB transaction; neither projection may mix the two commits.
    const pair = all.filter((c) => c.type === 'article').slice(0, 2)
    const pairIds = pair.map((c) => new URL(c.url).searchParams.get('id'))
    const writer = spawn(
      'docker',
      [
        'exec',
        '-i',
        'content-api-p2-db-1',
        'sh',
        '-c',
        'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" joomla'
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] }
    )
    const writerDone = new Promise((resolve, reject) => {
      writer.on('error', reject)
      writer.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Concurrent fixture writer failed'))
      )
    })
    writer.stdin.end(
      `START TRANSACTION; UPDATE ng_content SET title='Concurrent A' WHERE id=${pairIds[0]}; DO SLEEP(2); UPDATE ng_content SET title='Concurrent B' WHERE id=${pairIds[1]}; COMMIT;`
    )
    try {
      for (let pass = 0; pass < 4; pass++) {
        const scan = await request('?type=article&limit=100')
        const titles = pair.map((c) => scan.body.contents.find((row) => row.id === c.id)?.title)
        assert.ok(
          JSON.stringify(titles) === JSON.stringify(pair.map((c) => c.title)) ||
            JSON.stringify(titles) === JSON.stringify(['Concurrent A', 'Concurrent B']),
          'snapshot never mixes the two commits'
        )
      }
      await writerDone
    } finally {
      await writerDone
      restore()
    }
    console.log('PASS concurrent two-row DB transaction snapshot')

    // SQL stress fixture, not an admin save: expose existing mapped modules on one page.
    // No schema widening: Joomla modules are TEXT; article introtext is MEDIUMTEXT.
    const pageContent = details.find((c) => c.type === 'page')
    const pageNative = new URL(pageContent.url).searchParams.get('Itemid')
    assert.match(pageNative, /^\d+$/)
    try {
      sql(
        `UPDATE ng_modules SET language='*',access=1,published=1,publish_up=NULL,publish_down=NULL; DELETE FROM ng_modules_menu; INSERT INTO ng_modules_menu(moduleid,menuid) SELECT id,${pageNative} FROM ng_modules`
      )
      let partial = await request('?id=' + pageContent.id)
      assert.equal(partial.body.contents[0].detailState, 'partial')
      const blocks = []
      let segments = 0
      while (true) {
        const content = partial.body.contents[0]
        blocks.push(...content.blocks)
        segments++
        if (!content.links.next) break
        partial = await request(new URL(content.links.next).search)
      }
      assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length)
      assert.deepEqual(
        blocks.map((b) => b.position),
        blocks.map((_, i) => i)
      )
      assert.ok(blocks.length > 100)
      sql('UPDATE ng_modules SET ordering=100000-id')
      const reordered = []
      let reorderedPage = await request('?id=' + pageContent.id)
      while (true) {
        reordered.push(...reorderedPage.body.contents[0].blocks)
        const next = reorderedPage.body.contents[0].links.next
        if (!next) break
        reorderedPage = await request(new URL(next).search)
      }
      assert.deepEqual(
        reordered.map((b) => b.id).sort(),
        blocks.map((b) => b.id).sort(),
        'occurrence IDs survive module reorder'
      )
      assert.ok(
        reordered.some((b, index) => b.id !== blocks[index].id),
        'current order is reflected'
      )
      sql(`UPDATE ng_content SET \`fulltext\`=REPEAT('P',270000) WHERE id=${articleNative}`)
      const tooLarge = await request('?id=' + article.id)
      assert.equal(tooLarge.status, 413)
      assert.equal(tooLarge.body.error.field.contentId, article.id)
      assert.ok(tooLarge.body.error.links.firstBlock)
      const firstBlockQuery = Object.fromEntries(new URL(tooLarge.body.error.links.firstBlock).searchParams)
      const otherPrincipal = await fetch(base + '/index.php?option=com_claudecowork&task=api.exec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'content.read',
          params: firstBlockQuery,
          contentPrincipal: 'seat:' + 'a'.repeat(64),
          contentScope: 'published'
        })
      })
      assert.equal(otherPrincipal.status, 400)
      assert.deepEqual(validateContent(await otherPrincipal.json()), [])
      assert.equal((await request(new URL(tooLarge.body.error.links.firstBlock).search, null)).status, 401)
      const discoveryRevision = tooLarge.body.error.snapshot.revision
      let discoveryUrl = tooLarge.body.error.links.firstBlock
      const discovered = []
      while (discoveryUrl) {
        const blockResponse = await request(new URL(discoveryUrl).search)
        assert.equal(blockResponse.status, 200)
        assert.equal(blockResponse.body.snapshot.revision, discoveryRevision)
        const content = blockResponse.body.contents[0]
        assert.equal(Object.hasOwn(content, 'bodyHtml'), false)
        discovered.push(...content.blocks)
        discoveryUrl = content.blocksPagination.nextCursor ? content.links.next : null
      }
      assert.ok(discovered.length > 0)
      assert.equal(new Set(discovered.map((b) => b.id)).size, discovered.length)
      assert.deepEqual(
        discovered.map((b) => b.position),
        discovered.map((_, i) => i)
      )
      sql(`UPDATE ng_content SET title='Discovery changed' WHERE id=${articleNative}`)
      assert.equal((await request(new URL(tooLarge.body.error.links.firstBlock).search)).status, 409)
      fs.writeFileSync(
        new URL('first-block.json', evidence),
        JSON.stringify(
          {
            status: 'PASS',
            blocks: discovered.length,
            firstError: tooLarge.body,
            snapshotChanged: 409,
            terminalLoop: false,
            stress400: 'unit only'
          },
          null,
          2
        ) + '\n'
      )
      fs.writeFileSync(
        new URL('payload.json', evidence),
        JSON.stringify(
          {
            mutation: 'SQL fixture stress, no CMS save claim',
            segments,
            blocks: blocks.length,
            maxBytes: 262144,
            scalarOverflowStatus: tooLarge.status
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      restore()
    }

    console.log('PASS block continuation and scalar 413')
    const articleDetail = details.find((c) => c.type === 'article')
    const articleSlot = inspect.slots.find(
      (slot) =>
        slot.column === 'introtext' &&
        slot.xpath &&
        slot.type === 'text' &&
        articleDetail.blocks.some((b) => b.fields.some((f) => f.slotKey === slot.key))
    )
    assert.ok(articleSlot, 'mapped article text slot for byte-budget stress')
    execFileSync('docker', [
      'cp',
      new URL('../fixtures/content-api-joomla/inflate-article.php', import.meta.url).pathname,
      'content-api-p2-web-1:/tmp/content-api-inflate-article.php'
    ])
    try {
      execFileSync(
        'docker',
        ['exec', '-i', 'content-api-p2-web-1', 'php', '/tmp/content-api-inflate-article.php'],
        {
          input: JSON.stringify({
            id: articleNative,
            original: sql(`SELECT HEX(introtext) FROM ng_content WHERE id=${articleNative}`),
            changes: [{ xpath: articleSlot.xpath, value: 'B'.repeat(180000) }]
          }),
          stdio: ['pipe', 'pipe', 'pipe']
        }
      )
      let segment = await request('?id=' + article.id)
      assert.equal(segment.status, 200)
      assert.equal(segment.body.contents[0].detailState, 'partial')
      assert.equal(Object.hasOwn(segment.body.contents[0], 'bodyHtml'), false)
      const loadedBlocks = []
      let loadedBody
      let segments = 0
      while (true) {
        const content = segment.body.contents[0]
        segments++
        loadedBlocks.push(...content.blocks)
        if (Object.hasOwn(content, 'bodyHtml')) loadedBody = content.bodyHtml
        if (!content.links.next) break
        segment = await request(new URL(content.links.next).search)
      }
      assert.ok(loadedBody.includes('B'.repeat(180000)))
      assert.equal(
        loadedBlocks.flatMap((b) => b.fields).find((f) => f.slotKey === articleSlot.key).value,
        'B'.repeat(180000)
      )
      fs.writeFileSync(
        new URL('payload-body.json', evidence),
        JSON.stringify(
          {
            mutation: 'SQL DOM-preserving article stress',
            scalarBytes: 180000,
            bodyBytes: Buffer.byteLength(loadedBody),
            segments,
            completeReadback: true,
            maxResponseBytes: 262144
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      restore()
      execFileSync('docker', [
        'exec',
        'content-api-p2-web-1',
        'rm',
        '-f',
        '/tmp/content-api-inflate-article.php'
      ])
    }
    console.log('PASS byte-budget partial body/field continuation without truncation')

    // Reference closure for a real page, its shared sources and confirmed translations.
    const scope = new Map()
    const queue = [details.find((c) => c.type === 'page').id]
    while (queue.length) {
      const id = queue.shift()
      if (scope.has(id)) continue
      let segment = await request('?id=' + id)
      const content = structuredClone(segment.body.contents[0])
      const blocks = []
      while (true) {
        blocks.push(...segment.body.contents[0].blocks)
        const next = segment.body.contents[0].links.next
        if (!next) break
        segment = await request(new URL(next).search)
      }
      content.blocks = blocks
      content.detailState = 'complete'
      delete content.blocksPagination
      delete content.links.next
      scope.set(id, content)
      for (const block of content.blocks)
        if (block.sharedContentId) {
          assert.equal(block.visibility, 'unknown')
          queue.push(block.sharedContentId)
        }
      for (const relation of content.relations) queue.push(relation.contentId)
      assert.ok(scope.size < 200, 'bounded reference fixture')
    }
    assert.deepEqual(validateContentGraph([...scope.values()]), [])
    assert.ok([...scope.values()].some((c) => c.type === 'shared'))
    for (const locale of initial.body.site.locales) {
      const filtered = await request('?type=article&locale=' + encodeURIComponent(locale))
      assert.ok(filtered.body.contents.every((c) => c.type === 'article' && c.locale === locale))
    }
    fs.writeFileSync(new URL('graph.json', evidence), JSON.stringify([...scope.values()], null, 2) + '\n')

    console.log('PASS authorized graph closure and locale filters')
    try {
      sql('UPDATE ng_claudecowork_content_reader SET enabled=0 WHERE id=1')
      assert.equal((await request('?limit=1')).status, 501)
    } finally {
      restore()
    }
    try {
      sql(
        "UPDATE ng_claudecowork_content_contract SET binding=JSON_SET(binding,'$.contractHash','invalid') WHERE id=1"
      )
      const brokenHash = tableHash()
      assert.equal((await request('?limit=1')).status, 503)
      assert.equal(tableHash(), brokenHash, 'GET does not repair broken binding')
    } finally {
      restore()
    }
    console.log('PASS disabled capability and broken binding fail closed')

    try {
      sql(`UPDATE ng_menu SET path='content.json' WHERE id=${pageNative}`)
      assert.equal((await request('?limit=1')).status, 501)
    } finally {
      restore()
    }

    // Route collision is detected by the read relay as well as the reader; a static file keeps its door.
    fs.writeFileSync(path.join(webroot, 'content.json'), 'existing-resource')
    const collision = await native('content.read', { limit: 1 })
    assert.equal(collision.error.code, 'CONTENT_ADAPTER_UNSUPPORTED')
    assert.equal(await (await fetch(base + '/content.json')).text(), 'existing-resource')
    fs.rmSync(path.join(webroot, 'content.json'))
    // Docker Desktop bind-mount unlink propagation: avoid Apache seeing stale -f metadata.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const configPath = path.join(webroot, 'configuration.php')
    const configuration = fs.readFileSync(configPath)
    try {
      fs.writeFileSync(
        configPath,
        configuration.toString().replace(/public \$offline\s*=.*?;/, 'public $offline = true;')
      )
      assert.equal((await request('?limit=1')).status, 200)
    } finally {
      fs.writeFileSync(configPath, configuration)
    }

    const subdirBase = 'http://127.0.0.1:52126/pilot'
    for (const authorized of [false, true]) {
      const response = await fetch(subdirBase + '/content.json?limit=1', {
        headers: authorized ? { authorization: 'Bearer ' + token } : {}
      })
      const body = await response.json()
      assert.equal(response.status, authorized ? 200 : 401)
      assert.deepEqual(validateContent(body), [])
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      if (authorized) assert.ok(body.contents[0].links.self.startsWith(subdirBase + '/content.json?'))
    }
    console.log('PASS static collision, Joomla offline and real subdirectory alias')

    // Real Tracy app over a listening HTTP socket, fresh Postgres schema, no fetch or seat mocks.
    const { pool, close } = await freshPool()
    const siteKey = 'joomlap2.localhost'
    const config = readConfig({
      TRACY_ORIGIN: 'http://127.0.0.1:52123',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: randomBytes(32).toString('hex'),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://127.0.0.1:52124',
      HOST_local_DSH_ORIGIN: 'http://127.0.0.1:52125',
      HOST_local_SECRET: 'pilot',
      SEAT_local_SECRET: 'pilot'
    })
    const app = buildApp({ config, pool, host: { hostCall, hostJob }, mail: { send: async () => {} } })
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 52123 })
    try {
      await pool.query('insert into site(site_key,label,host) values($1,$2,$3)', [
        siteKey,
        'joomlap2',
        'local'
      ])
      const accounts = {}
      for (const [who, role] of [
        ['owner', 'owner'],
        ['second', 'admin'],
        ['editor', 'editor']
      ]) {
        const account = (
          await pool.query('insert into account(email) values($1) returning id', [who + '@pilot.invalid'])
        ).rows[0].id
        accounts[who] = account
        await pool.query(
          'insert into seat(site_key,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
          [siteKey, account, role]
        )
      }
      await pool.query('insert into site(site_key,label,host) values($1,$2,$3)', [
        'otherpilot.localhost',
        'otherpilot',
        'local'
      ])
      const outsider = (
        await pool.query('insert into account(email) values($1) returning id', ['stranger@pilot.invalid'])
      ).rows[0].id
      await pool.query(
        'insert into seat(site_key,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
        ['otherpilot.localhost', outsider, 'owner']
      )
      await pool.query('update seat set accepted_at=NULL where account_id=$1', [accounts.editor])
      await writeComponent(
        pool,
        siteKey,
        { endpoint: base + '/index.php?option=com_claudecowork&task=api.exec', token },
        'owner@pilot.invalid'
      )
      const relay = async (who, params = {}, action = 'content.read') => {
        const cookie = `tracy_sess=${await mintSession(who + '@pilot.invalid', config.sessionSecret)}`
        const response = await fetch(`http://127.0.0.1:52123/api/sites/${siteKey}/apply`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ action, params, contentPrincipal: 'service' })
        })
        const text = await response.text()
        assert.ok(!text.includes(token))
        return { status: response.status, body: JSON.parse(text), headers: response.headers }
      }
      const read = await relay('owner', { limit: 2 })
      assert.equal(read.status, 200, JSON.stringify(read.body))
      assert.deepEqual(validateContent(read.body), [])
      assert.equal(read.headers.get('cache-control'), 'private, no-store')
      fs.writeFileSync(new URL('relay.json', evidence), JSON.stringify(read.body, null, 2) + '\n')
      assert.equal((await relay('owner', { cursor: read.body.pagination.nextCursor })).status, 200)
      for (const injected of [{ scope: 'editorial' }, { principal: 'service' }, { query: { limit: 1 } }]) {
        assert.equal((await relay('owner', injected)).status, 400)
      }
      assert.equal((await relay('stranger')).status, 403)
      assert.equal((await relay('editor')).status, 403, 'pending seat')
      await pool.query('update seat set accepted_at=now() where account_id=$1', [accounts.editor])
      assert.equal((await relay('editor')).status, 403, 'editor policy')
      assert.equal((await relay('second', { limit: 2, cursor: read.body.pagination.nextCursor })).status, 400)
      assert.equal(
        (await request('?limit=2&cursor=' + encodeURIComponent(read.body.pagination.nextCursor))).status,
        400
      )
      const secondPage = await relay('second', { limit: 2 })
      assert.equal(secondPage.status, 200)
      await writeRolePolicy(
        pool,
        siteKey,
        { admin: { content: true, code: false, site: true, lifecycle: false } },
        accounts.owner
      )
      assert.equal(
        (await relay('second', { cursor: secondPage.body.pagination.nextCursor })).status,
        403,
        'policy narrowed after page one'
      )
      assert.equal(
        (await relay('owner', { cursor: read.body.pagination.nextCursor })).status,
        200,
        'unrelated role policy does not invalidate owner cursor'
      )
      await pool.query('delete from site_role_policy where site_key=$1', [siteKey])
      await pool.query('delete from seat where account_id=$1', [accounts.second])
      assert.equal(
        (await relay('second', { limit: 2, cursor: secondPage.body.pagination.nextCursor })).status,
        403
      )
      // Integration acceptance: seat-authorized live read -> existing native write -> live read.
      const relayInspect = await relay('owner', { operation: 'inspect' }, 'content.contract')
      assert.equal(relayInspect.body.ok, true)
      const nativeParams = {
        operation: 'apply',
        apply_id: 'contract-content-api-p2-relay',
        request_id: 'content-api-p2-relay',
        expected_revision: relayInspect.body.revision,
        changes: { [field.slotKey]: 'Seat live read check' },
        evidence: {}
      }
      const staleWrite = await relay(
        'owner',
        { ...nativeParams, expected_revision: 'stale-native-revision' },
        'content.contract'
      )
      assert.equal(staleWrite.body.ok, false, 'native revision rejects stale write')
      assert.equal((await relay('editor', nativeParams, 'content.contract')).status, 403)
      const relayApplied = await relay('owner', nativeParams, 'content.contract')
      assert.equal(relayApplied.body.ok, true)
      const relayReadback = await relay('owner', { id: shared.id })
      assert.equal(
        relayReadback.body.contents[0].blocks
          .flatMap((b) => b.fields)
          .find((f) => f.slotKey === field.slotKey).value,
        'Seat live read check'
      )
      fs.writeFileSync(
        new URL('relay-native-write.json', evidence),
        JSON.stringify(
          {
            liveRead: true,
            freshNativeInspect: true,
            staleRevisionRefused: true,
            editorWriteRefused: true,
            ownerApply: true,
            liveReadback: true,
            cleanup: 'full fixture checkpoint in finally; existing revert covered separately as regression'
          },
          null,
          2
        ) + '\n'
      )
      // Read never owns a write lease; the Claude Cowork plugin under test still refuses a native write on a
      // bound site with `content_only` — its own code, from before ADR 0022 made the design a
      // content recommendation.
      const refused = await relay(
        'owner',
        { kind: 'article', id: +articleNative, fields: { title: 'forbidden' }, apply_id: 'pilot-no-write' },
        'content.update'
      )
      assert.equal(refused.body.error, 'content_only')
      // The same discovery error/continuation must survive the real seat relay envelope.
      sql(`UPDATE ng_content SET \`fulltext\`=REPEAT('R',270000) WHERE id=${articleNative}`)
      const relayLarge = await relay('owner', { id: article.id })
      assert.equal(relayLarge.status, 413)
      assert.deepEqual(validateContent(relayLarge.body), [])
      let blockQuery = Object.fromEntries(new URL(relayLarge.body.error.links.firstBlock).searchParams)
      const relayBlocks = []
      while (blockQuery) {
        const next = await relay('owner', blockQuery)
        assert.equal(next.status, 200)
        assert.deepEqual(validateContent(next.body), [])
        assert.equal(next.body.snapshot.revision, relayLarge.body.error.snapshot.revision)
        const content = next.body.contents[0]
        relayBlocks.push(...content.blocks)
        blockQuery = content.blocksPagination.nextCursor
          ? Object.fromEntries(new URL(content.links.next).searchParams)
          : null
      }
      assert.ok(relayBlocks.length > 0)
      const firstQuery = Object.fromEntries(new URL(relayLarge.body.error.links.firstBlock).searchParams)
      await pool.query('delete from seat where account_id=$1', [accounts.owner])
      assert.equal((await relay('owner', firstQuery)).status, 403, 'firstBlock rechecks revoked seat')
      fs.writeFileSync(
        new URL('relay-first-block.json', evidence),
        JSON.stringify(
          {
            status: 'PASS',
            errorStatus: 413,
            blocks: relayBlocks.length,
            sameSnapshot: true,
            terminalNextCursor: null,
            revokedSeatStatus: 403
          },
          null,
          2
        ) + '\n'
      )
      const audit = (await pool.query('select detail from audit')).rows
      assert.ok(!JSON.stringify(audit).includes(token))
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await close()
    }
    console.log('PASS real Tracy seat relay, revocation and content_only')
    restore()
    const costs = []
    for (const [kind, query] of [
      ['list', '?limit=30'],
      ['detail', '?id=' + article.id]
    ]) {
      for (let sample = 0; sample < 5; sample++) {
        const questions = () => Number(sql("SHOW GLOBAL STATUS LIKE 'Questions'").split('\t')[1])
        const startQuestions = questions()
        const response = await request(query)
        assert.equal(response.status, 200)
        costs.push({ kind, ...results.at(-1), databaseStatements: questions() - startQuestions - 1 })
      }
    }
    fs.writeFileSync(
      new URL('fingerprint-cost.json', evidence),
      JSON.stringify(
        {
          method:
            'MariaDB global Questions delta minus trailing probe; isolated DB, five sequential samples per operation; HTTP time excludes SQL probe overhead',
          costs
        },
        null,
        2
      ) + '\n'
    )
    const expiryCheck = await request('?limit=2')
    assert.equal(
      expiryCheck.body.snapshot.revision,
      initial.body.snapshot.revision,
      'same source revision before expiry measurement'
    )
    const remaining = cursorStarted + 302000 - Date.now()
    if (remaining > 0) {
      console.log('Waiting for real 300s cursor TTL')
      await new Promise((resolve) => setTimeout(resolve, remaining))
    }
    assert.equal((await request('?limit=2&cursor=' + encodeURIComponent(firstCursor))).status, 409)
    console.log('PASS real cursor expiry with unchanged source revision')
    fs.writeFileSync(
      new URL('measurements.json', evidence),
      JSON.stringify(
        {
          fixture: 'isolated clone of local j-6odndj Business',
          cms: '6.1.1',
          contentCount: all.length,
          requests: results
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    restore()
    for (const file of files) {
      const name = path.join(webroot, file.name)
      if (file.bytes === null) fs.rmSync(name, { force: true })
      else fs.writeFileSync(name, file.bytes)
    }
    execFileSync('docker', [
      'exec',
      'content-api-p2-web-1',
      'rm',
      '-f',
      '/tmp/content-api-cms-token.json',
      '/tmp/content-api-setup-api.php',
      '/tmp/content-api-inflate.php'
    ])
    fs.rmSync(dirty, { force: true })
  }
})
