// E13 — the demo as a visitor meets it, on every demo site this run judged (E1–E10 leave the profile each was
// built from in the run's evidence): every page the home links to, desktop and mobile, opened and reloaded, with
// every page check of `judge-demo.mjs` (orphan currency, `—` never `0`, picture frames, CTAs, fabrication), and
// every CTA pressed answering below 400. Runs last; with no judged demo in the run it is BLOCKED.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { siteOrigin } from '../lib/env.mjs'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { judgeSite } from '../lib/place-profile/judge-demo.mjs'
import { PROBE_EXPRESSION } from '../lib/place-profile/page-probe.mjs'
import { profileFacts } from '../lib/place-profile/profile-facts.mjs'
import { watchedRole } from '../lib/watched-browser.mjs'

test('E13 every demo of the run, as a visitor', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E13' }, async ({ details }) => {
    const sites = run.manifest
      .read()
      .resources.filter((r) => r.kind === 'site' && r.state === 'created' && r.data?.wo)
      .map((r) => r.id)
      .filter((key) => existsSync(join(run.runDir, 'evidence', `profile-${key}.json`)))
    if (sites.length === 0)
      throw new Blocked('no judged demo site in this run (run E1–E10 first)', 'environment')
    const visitor = await watchedRole({ name: 'visitor' })
    const reader = new Client({ name: 'visitor' })
    details.sites = []
    const failed = []
    try {
      for (const siteKey of sites) {
        const origin = siteOrigin(siteKey.split('.')[0])
        const profile = JSON.parse(
          readFileSync(join(run.runDir, 'evidence', `profile-${siteKey}.json`), 'utf8')
        )
        const s = { siteKey, ctas: [] }
        details.sites.push(s)
        await visitor.viewport('desktop')
        await visitor.goto(`${origin}/`)
        const home = await visitor.evaluate(PROBE_EXPRESSION)
        const paths = [
          '/',
          ...new Set(home.links.map((u) => new URL(u).pathname).filter((p) => p !== '/'))
        ].slice(0, 12)
        const judged = await judgeSite(visitor, {
          origin,
          paths,
          facts: profileFacts(profile),
          baseline: null,
          runDir: run.runDir,
          tag: `E13-${siteKey.split('.')[0]}`
        })
        s.pages = judged.pages.map(({ links: _links, ...p }) => p)
        failed.push(...judged.failed)
        for (const cta of home.ctas.slice(0, 20)) {
          const href = cta.href ?? ''
          if (!href || /^(tel|mailto):/i.test(href) || href.startsWith('#')) continue
          const url = new URL(href, origin).href
          const res = await reader
            .get(url, { headers: { accept: 'text/html' }, redirect: 'follow' })
            .catch((e) => ({ status: String(e.message) }))
          s.ctas.push({ text: cta.text, url, status: res.status })
        }
      }
    } finally {
      visitor.detach()
    }
    const dead = details.sites.flatMap((s) =>
      s.ctas.filter((c) => typeof c.status !== 'number' || c.status >= 400)
    )
    check(
      dead.length === 0,
      `CTAs that lead nowhere: ${dead.map((c) => `${c.text} → ${c.url} (${c.status})`).join(' | ')}`
    )
    check(failed.length === 0, `${failed.length} page check(s) failed: ${failed.slice(0, 6).join(' | ')}`)
  })
})
