// J13 — deploy smoke. The read-only health script of the stack, and the manifest of what is
// deployed: the three image tags, the source commit dsh says it was built from, the sidebar fork
// version actually installed in the dsh profile, and how many templates the catalogue offers.
// The manifest is "the version this run judged" at the top of the report; it is not compared
// with the newest commit on develop (web/host and dsh are two build lines).

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { devExec } from '../lib/dev.mjs'
import { ENV } from '../lib/env.mjs'
import { check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { redact } from '../lib/redact.mjs'

test('J13 deploy smoke', async (t) => {
  const { runDir } = runContext()
  await journey(t, { id: 'J13', retries: 1 }, async ({ attempt, details }) => {
    // A check that failed while a deploy was replacing the stack is asked once more, after the
    // new containers had time to settle; the first answer stays in the report as the retry's reason.
    if (attempt > 0) await new Promise((r) => setTimeout(r, 120_000))
    const deploy = {
      measuredAt: new Date().toISOString(),
      images: {},
      env: {},
      plugins: {},
      templates: null,
      checkServer: null
    }
    const save = () =>
      writeFileSync(join(runDir, 'deploy.json'), `${JSON.stringify(redact(deploy), null, 2)}\n`)

    deploy.images = await devExec.images()
    // How long each stack container has been up: "Up 3 minutes" during a check means a deploy just ran.
    const stack = new Set(Object.values(ENV.containers))
    deploy.uptime = Object.fromEntries(
      (await devExec.ps()).filter((r) => stack.has(r.Names)).map((r) => [r.Names, r.Status])
    )
    deploy.env.APP_IMAGE_TAG = await devExec.env(ENV.containers.web, 'APP_IMAGE_TAG')
    deploy.env.DSH_SOURCE_COMMIT = await devExec.env(ENV.containers.dsh, 'TRACY_SOURCE_COMMIT')
    for (const name of Object.keys(ENV.dshPlugins))
      deploy.plugins[name] = await devExec.dshPluginVersion(name)
    const templates = await new Client({ name: 'public' }).get('/api/templates')
    deploy.templates = Array.isArray(templates.json?.templates) ? templates.json.templates.length : null
    save()

    const health = await devExec.checkServer()
    const lines = health.output.split('\n')
    // `✓` passed, `✗` failed, `•` a warning the script itself does not count as red.
    const failed = lines.filter((l) => l.startsWith('✗'))
    const warned = lines.filter((l) => l.startsWith('•'))
    deploy.checkServer = {
      ok: health.code === 0 && failed.length === 0,
      exit: health.code,
      passed: lines.filter((l) => l.startsWith('✓')).length,
      failed: failed.length,
      warnings: warned,
      ms: health.ms
    }
    save()
    writeEvidence(runDir, 'J13-check-server.txt', health.output)
    Object.assign(details, deploy)

    for (const c of Object.values(ENV.containers))
      check(deploy.images[c], `container ${c} not found on the dev host`)
    check(deploy.plugins['dsh-better-sidebar'], 'dsh-better-sidebar not found in the dsh profile')
    check(
      deploy.templates && deploy.templates > 0,
      `GET /api/templates answered ${templates.status} with no templates`
    )
    check(
      deploy.checkServer.ok,
      `check-server.sh: ${failed.length} failed (exit ${health.code}): ${failed.join(' | ').slice(0, 300)}`
    )
  })
})
