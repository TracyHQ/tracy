#!/usr/bin/env node
/** Real-model paired experiment on an explicitly owned disposable WordPress site. */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planReplace } from '../../packages/tools/tracy-site-tools/src/host/replace.mjs'
import { planCall } from '../../packages/tools/tracy-site-tools/src/host/site.mjs'
import { createCallMemory } from '../../packages/tools/tracy-site-tools/src/host/call-memory.mjs'
import { walkListing, pagesDocument } from '../../apps/tracy-web/src/sites/content-pages.js'
import { parsePage, pageAnswer } from '../../packages/tools/tracy-site-tools/src/host/page.mjs'

const args = process.argv.slice(2),
  arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const config = JSON.parse(readFileSync(arg('--config', '/tmp/tracy-tool-bench-owned.json'), 'utf8'))
if (!/^toolbench-\d+-wp$/.test(config.wp) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(config.origin))
  throw new Error('Requires an owned, loopback-only toolbench WordPress fixture')
const repeats = Number(arg('--repeats', '6')),
  maxSteps = 8,
  baselineRef = arg('--baseline-ref', '76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e')
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 100) throw new Error('repeats must be 1..100')
const out = resolve(arg('--out', '/tmp/tracy-live-tool-benchmark'))
mkdirSync(out, { recursive: true })
const host = resolve('packages/tools/tracy-site-tools/src/host'),
  temporary = mkdtempSync(join(tmpdir(), 'tracy-live-baseline-'))
const files = ['replace-wordpress.mjs', 'site-call.mjs', 'read-compact.mjs', 'surface.mjs']
const baselineDir = arg('--baseline-dir', null)
const hash = (source) => createHash('sha256').update(source).digest('hex'),
  hashes = { baseline: {}, candidate: {} }
for (const file of files) {
  const src = baselineDir
    ? readFileSync(join(resolve(baselineDir), file), 'utf8')
    : execFileSync('git', ['show', `${baselineRef}:packages/tools/tracy-site-tools/src/host/${file}`], {
        encoding: 'utf8'
      })
  hashes.baseline[file] = hash(src)
  hashes.candidate[file] = hash(readFileSync(join(host, file)))
  writeFileSync(
    join(temporary, file),
    src.replace(/from '(\.[^']+)'/g, (_m, rel) => {
      const dest = resolve(host, rel)
      return `from '${pathToFileURL(files.includes(rel.replace(/^\.\//, '')) ? join(temporary, rel) : dest).href}'`
    })
  )
}
const engines = await Promise.all(
  [temporary, host].map(async (root) => ({
    replace: (await import(pathToFileURL(join(root, 'replace-wordpress.mjs')))).replaceOnWordPress,
    site: (await import(pathToFileURL(join(root, 'site-call.mjs')))).runSiteCall,
    surface: await import(pathToFileURL(join(root, 'surface.mjs')))
  }))
)
const docker = (a, input) =>
  execFileSync('docker', a, {
    input,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim()
const php = (code) =>
  docker(
    ['exec', '-i', config.wp, 'php'],
    `<?php require '/var/www/html/wp-load.php'; if(!get_option('tracy_tool_benchmark_owned'))throw new Exception('Not owned'); ${code}`
  )
const reset = () =>
  php(
    `foreach(get_posts(['post_type'=>'wp_template','post_status'=>'any','numberposts'=>-1]) as $p)wp_delete_post($p->ID,true);wp_update_post(['ID'=>${config.pageId},'post_content'=>'<!-- wp:paragraph --><p>Keep this short line.</p><!-- /wp:paragraph -->']);file_put_contents(WP_CONTENT_DIR.'/themes/tool-benchmark/templates/index.html','<!-- wp:post-content /-->');echo 'reset';`
  )
const snapshot = () =>
  JSON.parse(
    php(
      `$rows=$GLOBALS['wpdb']->get_results("SELECT ID,post_type,post_content,post_title FROM {$GLOBALS['wpdb']->posts} WHERE post_type IN ('page','wp_template','wp_template_part') ORDER BY ID",ARRAY_A);echo json_encode(['hash'=>hash('sha256',json_encode($rows)),'rows'=>$rows]);`
    )
  )
const originalTemplate = php(
  "echo file_get_contents(WP_CONTENT_DIR.'/themes/tool-benchmark/templates/page.html');"
)
let backend = []
async function component(action, params = {}) {
  const start = performance.now()
  const response = await fetch(config.origin + '/wp-admin/admin-ajax.php?action=claude_cowork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: config.token, action, params }),
    signal: AbortSignal.timeout(30000)
  })
  const answer = await response.json()
  backend.push({ action, ms: performance.now() - start, status: response.status })
  return answer
}
async function send(action, params = {}) {
  if (action === 'content.read' && params.view === 'pages') {
    const { url, ...filter } = params
    for (const key of ['view', 'full', 'search', 'offset', 'limit']) delete filter[key]
    const walked = await walkListing((p) => component('content.read', p), filter)
    if (walked.refusal) return walked.refusal
    return pagesDocument(walked.listings, {
      truncated: walked.truncated,
      link: url ?? null,
      alternates: true
    })
  }
  return component(action, params)
}
const pageHtml = async (path) => {
  const r = await fetch(config.origin + path, { signal: AbortSignal.timeout(30000) })
  return { ok: r.ok, status: r.status, html: await r.text() }
}
const preflight = await send('content.read', { view: 'pages', url: '/?page_id=' + config.targetId })
const expectedPage = preflight.pages?.[0]
const inventory = await send('content.read', { view: 'pages' })
const groupTargets = [3, 2, 1, 0].map((delta) =>
  inventory.pages?.find((p) => p.native?.some((r) => r.kind === 'post' && r.id === config.targetId - delta))
)
if (groupTargets.some((p) => !p)) throw new Error('Grouped lookup targets missing')
if (!expectedPage || expectedPage.native?.[0]?.id !== config.targetId)
  throw new Error('Fixture Content API identity/target preflight failed; no paid runs started')
const modelKey = docker([
  'exec',
  'tracy-dsh',
  'node',
  '-e',
  'process.stdout.write(process.env.DEEPSEEK_API_KEY ?? "")'
])
if (!modelKey) throw new Error('Configured DeepSeek key unavailable')
const toolsByArm = engines.map(({ surface }) => ({
  type: 'function',
  function: {
    name: 'tracy_site',
    description: surface.siteToolDescription('wordpress'),
    parameters: surface.siteToolParameters('wordpress')
  }
}))
const toolHashes = toolsByArm.map((tool) => hash(JSON.stringify(tool)))
const system =
  'You are a website assistant working only on this disposable WordPress site. Use tracy_site to complete the requested task. Use the native content.replace operation for wording edits. Do not change anything else. Return a concise JSON answer after using tools. For a lookup return {"id":"the content id","path":"the page path"}. A content ID is the opaque Content API id, not a numeric WordPress post id. Never invent an id. When a tool refuses, follow its supported recovery. Do not claim a successful write unless the tool confirms it.'
const tasks = [
  {
    id: 'template-replace',
    prompt: `On page /?page_id=${config.pageId}, change "Built with Tracy on WordPress" to "Made with Tracy".`,
    write: true,
    wide: true
  },
  {
    id: 'page-replace-control',
    prompt: `On page /?page_id=${config.pageId}, change "Keep this short line." to "Keep this fresh line.".`,
    write: true,
    wide: false
  },
  {
    id: 'title-lookup',
    prompt: `Find the page titled "${config.targetTitle}". Return its content ID and path. Do not edit the site.`,
    write: false
  },
  {
    id: 'title-group',
    write: false,
    batch: true,
    prompt: `Find the pages titled ${groupTargets.map((p) => JSON.stringify(p.title)).join(', ')}. Return {"pages":[{"id":"the opaque Content API id","path":"the page path"}]} with every matching page. Do not edit the site.`
  },
  {
    id: 'known-url-control',
    prompt: `Find the content ID and path for the existing page /?page_id=${config.targetId}. Do not edit the site.`,
    write: false
  }
].filter((t) => !arg('--task', null) || t.id === arg('--task', null))
const nativeOnly = args.includes('--native-only')
const rows = []
const metadata = {
  startedAt: new Date().toISOString(),
  driver:
    'bounded real DeepSeek tool loop using production site-tool schemas and native executors; not the complete dsh customer profile',
  baselineRef,
  baselineSnapshot: baselineDir
    ? JSON.parse(readFileSync(join(resolve(baselineDir), 'metadata.json'), 'utf8'))
    : null,
  candidateWorkingTree: true,
  hashes,
  model: 'deepseek-flash',
  thinking: 'disabled',
  temperature: 0,
  toolSchemaHash: toolHashes[0] === toolHashes[1] ? toolHashes[0] : null,
  toolSchemaHashes: { baseline: toolHashes[0], candidate: toolHashes[1] },
  toolDescriptionChars: Object.fromEntries(
    ['baseline', 'candidate'].map((arm, i) => [arm, toolsByArm[i].function.description.length])
  ),
  systemPrompt: system,
  tasks,
  maxSteps,
  maxOutputTokens: 1200,
  driverHash: hash(readFileSync(new URL(import.meta.url))),
  fixture: {
    wordpress: config.wordpress,
    component: config.component,
    pages: 401,
    wpImage: docker(['inspect', '--format', '{{.Image}}', config.wp]),
    dbImage: docker(['inspect', '--format', '{{.Image}}', config.db])
  },
  repeats,
  nativeOnly,
  injectedDelayMs: 0,
  settledCostUsd: null
}
try {
  for (const task of tasks) {
    if (nativeOnly && !task.write) continue
    for (let repeat = 0; repeat < repeats; repeat++)
      for (const arm of repeat % 2 ? [1, 0] : [0, 1]) {
        reset()
        const before = snapshot(),
          memory = createCallMemory(),
          engine = engines[arm],
          calls = [],
          requests = [],
          applyIds = []
        backend = []
        const state = {
          sessionId: randomUUID(),
          label: 'owned-benchmark',
          actorKey: 'benchmark@example.test',
          facts: { platform: 'wordpress', sealed: false },
          memory,
          send,
          sleep: async () => {}
        }
        async function execute(args) {
          const action = args.action,
            params = args.params ?? {}
          const start = performance.now()
          let result
          if (action === 'page.text') {
            const path = params.path ?? '/'
            const read = await pageHtml(path)
            const parsed = parsePage(read.html, path, 'content.read')
            result = parsed.ok
              ? pageAnswer(parsed.page, {
                  url: config.origin + path,
                  path,
                  params,
                  html: parsed.html,
                  raw: read.html,
                  status: read.status,
                  cap: 2000
                })
              : parsed.answer
          } else if (action === 'content.replace') {
            result = await engine.replace({
              plan: planReplace(params),
              read: component,
              write: async (a, p) => {
                if (p.apply_id) applyIds.push(p.apply_id)
                return component(a, p)
              },
              pageHtml,
              mintApplyId: () => randomUUID(),
              verify: true
            })
          } else if (['content.read', 'content.list', 'content.get', 'info', 'apply.list'].includes(action)) {
            const plan = planCall(args)
            result = plan.ok ? await engine.site({ ...state, plan }) : plan
          } else
            result = {
              ok: false,
              code: 'BENCHMARK_ACTION_UNAVAILABLE',
              error: 'This focused benchmark supports content reads and native wording replacement only.'
            }
          calls.push({
            action,
            params,
            ms: performance.now() - start,
            chars: JSON.stringify(result).length,
            ok: result?.ok ?? null,
            code: result?.code ?? null,
            result
          })
          return result
        }
        const startedAt = new Date().toISOString()
        const started = performance.now()
        let final = '',
          failure = null
        try {
          if (nativeOnly) {
            await execute({
              action: 'content.replace',
              params: {
                path: '/?page_id=' + config.pageId,
                find: task.wide ? 'Built with Tracy on WordPress' : 'Keep this short line.',
                replace: task.wide ? 'Made with Tracy' : 'Keep this fresh line.'
              }
            })
          } else {
            const messages = [
              { role: 'system', content: system },
              { role: 'user', content: `Benchmark pair ${task.id}-${repeat}. ${task.prompt}` }
            ]
            for (let step = 0; step < maxSteps; step++) {
              const requestedAt = new Date().toISOString()
              const at = performance.now()
              const r = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + modelKey, 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: 'deepseek-flash',
                  messages,
                  tools: [toolsByArm[arm]],
                  thinking: { type: 'disabled' },
                  temperature: 0,
                  max_tokens: 1200,
                  stream: false
                }),
                signal: AbortSignal.timeout(90000)
              })
              const data = await r.json()
              requests.push({
                requestedAt,
                ms: performance.now() - at,
                status: r.status,
                model: data.model,
                usage: data.usage ?? null,
                requestId: data.id ?? null
              })
              if (!r.ok) throw new Error(`Model HTTP ${r.status}: ${data.error?.type ?? 'unknown'}`)
              const message = data.choices?.[0]?.message
              if (!message) throw new Error('Missing model message')
              messages.push(message)
              if (!message.tool_calls?.length) {
                final = message.content ?? ''
                break
              }
              for (const call of message.tool_calls) {
                let result
                try {
                  result = await execute(JSON.parse(call.function.arguments))
                } catch (e) {
                  result = { ok: false, code: 'BENCHMARK_EXCEPTION', error: e.message }
                }
                messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
              }
            }
            if (!final) throw new Error('Model step limit exceeded')
          }
        } catch (e) {
          failure = e.message
        }
        const after = snapshot()
        const measuredBackend = [...backend]
        let verified = false,
          undoVerified = null
        if (task.write) {
          const target = after.rows.find((r) => Number(r.ID) === config.pageId)
          const templates = after.rows.filter((r) => r.post_type === 'wp_template')
          const exact = task.wide
            ? templates.length === 1 &&
              templates[0].post_content ===
                originalTemplate.replace('Built with Tracy on WordPress', 'Made with Tracy')
            : target.post_content ===
              '<!-- wp:paragraph --><p>Keep this fresh line.</p><!-- /wp:paragraph -->'
          const unrelated = before.rows.filter((r) => !(!task.wide && Number(r.ID) === config.pageId))
          verified =
            !failure &&
            exact &&
            unrelated.every(
              (row) => JSON.stringify(after.rows.find((r) => r.ID === row.ID)) === JSON.stringify(row)
            ) &&
            calls.some((c) => c.result?.ok === true)
        } else {
          const resultText = JSON.stringify(calls.map((c) => c.result))
          let answer = null
          try {
            answer = JSON.parse(final.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
          } catch {
            /* Invalid answer fails verification. */
          }
          const expected = task.batch ? groupTargets : [expectedPage]
          const answers = task.batch ? answer?.pages : [answer]
          verified =
            !failure &&
            Array.isArray(answers) &&
            answers.length === expected.length &&
            expected.every(
              (page) =>
                answers.some((a) => a?.id === page.id && a?.path === page.path) &&
                resultText.includes(page.id)
            ) &&
            before.hash === after.hash
        }
        const elapsedMs = performance.now() - started
        if (task.write) {
          for (const id of [...new Set(applyIds)].reverse()) await component('apply.revert', { apply_id: id })
          undoVerified = snapshot().hash === before.hash
        }
        const row = {
          task: task.id,
          startedAt,
          contentBeforeHash: before.hash,
          contentAfterHash: after.hash,
          verificationFailure: verified
            ? null
            : (failure ??
              (task.write
                ? 'Exact content, unrelated-record integrity or receipt check failed'
                : 'Opaque content ID, path, returned evidence or record integrity check failed')),
          repeat,
          arm: arm ? 'candidate' : 'baseline',
          verified,
          undoVerified,
          failure,
          elapsedMs,
          steps: requests.length,
          modelMs: requests.reduce((s, r) => s + r.ms, 0),
          toolMs: calls.reduce((s, c) => s + c.ms, 0),
          backendCalls: measuredBackend.length,
          backendMs: measuredBackend.reduce((s, c) => s + c.ms, 0),
          backendReads: measuredBackend.filter((c) =>
            ['content.get', 'content.list', 'content.read'].includes(c.action)
          ).length,
          resultChars: calls.reduce((s, c) => s + c.chars, 0),
          requests,
          calls: calls.map(({ result: _result, ...rest }) => rest),
          final
        }
        rows.push(row)
        writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
        console.log(
          JSON.stringify({
            task: row.task,
            repeat,
            arm: row.arm,
            verified,
            undoVerified,
            failure,
            seconds: Number((elapsedMs / 1000).toFixed(3)),
            steps: row.steps,
            backendReads: row.backendReads
          })
        )
      }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
