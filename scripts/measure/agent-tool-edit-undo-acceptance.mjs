#!/usr/bin/env node
/** Real writes and receipt Undo through the product tool runtime, on owned CMS fixtures only. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { authenticatedToolRelay } from './lib/authenticated-tool-relay.mjs'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
const args = process.argv.slice(2),
  arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const platform = arg('--platform', ''),
  fixture = JSON.parse(readFileSync(arg('--config', '')))
assert(['wordpress', 'joomla'].includes(platform))
assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
assert(
  platform === 'wordpress'
    ? /^toolbench-\d+-wp$/.test(fixture.wp)
    : fixture.name === 'toolbench-crosscms-joomla'
)
const out = resolve(arg('--out', '/tmp/tracy-agent-reader-acceptance'))
mkdirSync(out, { recursive: true })
const docker = (argv, input) =>
  execFileSync('docker', argv, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const snapshot = () => {
  const data =
    platform === 'wordpress'
      ? docker(
          ['exec', '-i', fixture.wp, 'php'],
          `<?php require '/var/www/html/wp-load.php'; if(!get_option('tracy_tool_benchmark_owned'))throw new Exception('Not owned');echo json_encode($GLOBALS['wpdb']->get_results("SELECT ID,post_type,post_title,post_content,post_excerpt,post_status,post_name FROM {$GLOBALS['wpdb']->posts} WHERE post_type NOT IN ('revision','auto-draft') ORDER BY ID",ARRAY_A));`
        )
      : docker(
          [
            'exec',
            '-i',
            fixture.db,
            'sh',
            '-c',
            'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names joomla'
          ],
          'SELECT id,title,alias,introtext,`fulltext`,state,language FROM jos_content ORDER BY id; SELECT id,title,link,published,language FROM jos_menu ORDER BY id;'
        )
  return createHash('sha256').update(data).digest('hex')
}
const relay = await authenticatedToolRelay({ platform, fixture }),
  before = snapshot(),
  observed = [],
  applyId = 'reader-acceptance-' + randomUUID()
let run
try {
  const a = await relay.send('content.read', { view: 'pages' })
  assert.equal(a.status, 200)
  const target = a.body.pages.find(
    (p) =>
      p.native?.[0]?.kind === (platform === 'wordpress' ? 'post' : 'article') &&
      p.title?.startsWith('Inventory')
  )
  assert(target)
  const title = target.title + ' acceptance edit'
  const calls = [
    { action: 'content.read', params: { view: 'pages', search: target.title } },
    {
      action: 'content.update',
      params: {
        kind: platform === 'wordpress' ? 'post' : 'article',
        id: target.native[0].id,
        fields: platform === 'wordpress' ? { post_title: title } : { title },
        apply_id: applyId
      }
    },
    { action: 'content.read', params: { view: 'pages', search: title } },
    { action: 'apply.list', params: { apply_id: applyId } },
    { action: 'apply.revert', params: { apply_id: applyId } },
    { action: 'content.read', params: { view: 'pages', search: target.title } }
  ]
  const respond = async (options, step) => {
    if (step > 1)
      observed.push({
        after: step - 1,
        hash: snapshot(),
        messages: options.messages.filter((m) => m.role === 'tool').map((m) => m.content)
      })
    return step <= calls.length ? { calls: [calls[step - 1]] } : { text: 'done' }
  }
  run = await runPageSearchHarness([], {
    platform,
    transport: relay.transport,
    actorMint: relay.actorMint,
    respond,
    userText: 'Change this fixture title, verify the receipt, undo it, then verify the original title.'
  })
  const after = snapshot(),
    messages = JSON.stringify(run.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')))
  const receipt = (await relay.send('apply.list', { apply_id: applyId })).body
  const changes = await relay.pool.query('select action,outcome from site_write order by id')
  const record = {
    platform,
    before,
    after,
    restored: before === after,
    actuallyChanged: observed.some((o) => o.hash !== before),
    applyId,
    receipt,
    changes: changes.rows,
    observed,
    sent: run.sent.map((s) => s.body),
    reads: relay.reads
  }
  writeFileSync(join(out, `${platform}-edit-undo.json`), JSON.stringify(record, null, 2) + '\n')
  assert(record.actuallyChanged, 'The real CMS must change')
  assert.equal(after, before, 'Undo must restore every measured content row')
  assert(messages.includes(title), 'Reader must observe the edit')
  console.log(
    JSON.stringify({
      platform,
      restored: record.restored,
      actuallyChanged: record.actuallyChanged,
      changes: record.changes
    })
  )
} finally {
  await relay.close()
}
