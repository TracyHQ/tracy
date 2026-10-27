#!/usr/bin/env node
/**
 * The QA gate as a long-running service (LaunchAgent `com.tracy.qa-gate`, sample plist beside
 * this file). Reconciles `state/sites.jsonl` against the stand, then listens.
 *
 * Usage: node scripts/qa/gate/server.mjs [--config <file>]
 *   config (default `<QA_HOME>/gate.json`, optional): { listen: { host, port }, upstream: { host, port },
 *     stand: { container, context? }, mainHost?, siteDomain?, sitePrefix?, cookieDomain?,
 *     emailDomain?, fixedSites?, caps? }
 *
 * Exports: loadConfig(argv, env): object; main(argv, env): Promise<Gate>
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { qaHome, readJson } from '../lib/state.mjs'
import { GATE_DEFAULTS, createGate } from './gate.mjs'
import { dockerStand } from './stand.mjs'

export function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const home = qaHome(env)
  const i = argv.indexOf('--config')
  const file = i === -1 ? join(home, 'gate.json') : argv[i + 1]
  const cfg = readJson(file, {})
  return {
    ...cfg,
    home,
    listen: { host: '127.0.0.1', port: 36080, ...cfg.listen },
    upstream: { host: '127.0.0.1', port: 36081, ...cfg.upstream },
    stand: { container: 'tracy-qa-tracy-web-1', ...cfg.stand }
  }
}

export async function main(argv, env) {
  const cfg = loadConfig(argv, env)
  const stand = dockerStand({
    ...cfg.stand,
    upstream: cfg.upstream,
    mainHost: cfg.mainHost ?? GATE_DEFAULTS.mainHost
  })
  const gate = createGate({ ...cfg, stand })
  const { port, reconciled } = await gate.start(cfg.listen.port, cfg.listen.host)
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      listening: `${cfg.listen.host}:${port}`,
      reconciled: reconciled.resolved.length,
      orphans: reconciled.orphans,
      failed: reconciled.failed
    })
  )
  return gate
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err?.stack ?? String(err))
    process.exit(1)
  })
}
