// Prerequisite probes of the related layer. A probe that looked and found the dependency missing makes a case ENV.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { probes as cmsProbes } from '../../cms/lib/probes.mjs'
import { cloneHas, isDirectory, resolveRoot, snapshotClone } from './clone.mjs'
import { PINS } from '../specs/chain.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

export const probes = {
  'tool:python3': cmsProbes['tool:python3'],
  'tool:php': cmsProbes['tool:php'],
  async 'config:related-root'(ctx) {
    const where = resolveRoot(ctx.env)
    if (!where.root)
      return {
        probe: 'config:related-root',
        reason: `no sibling-repo root is configured (${where.problem}); set QA_RELATED_ROOT or QA_RELATED_CONFIG`
      }
    if (!isDirectory(where.root))
      return {
        probe: 'config:related-root',
        reason: `the configured root ${where.root} (from ${where.from}) is not a directory`
      }
    return null
  },
  async 'clone:tracy-wordpress-theme'(ctx) {
    return cloneProbe(ctx, 'tracy-wordpress-theme')
  },
  async 'clone:tracy-joomla-template'(ctx) {
    return cloneProbe(ctx, 'tracy-joomla-template')
  },
  async 'clone:tracy-emdash-template'(ctx) {
    return cloneProbe(ctx, 'tracy-emdash-template')
  },
  async 'clone:tracy-fleet'(ctx) {
    return cloneProbe(ctx, 'tracy-fleet')
  },
  async 'clone:tracy-infra'(ctx) {
    return cloneProbe(ctx, 'tracy-infra')
  },
  async 'clone:tracy-docs'(ctx) {
    return cloneProbe(ctx, 'tracy-docs')
  }
}

for (const [key, pin] of Object.entries(PINS)) {
  probes[`pin-in-clone:${key}`] = async (ctx) => {
    const note = existsSync(path.join(ctx.repoRoot, pin.note))
      ? readTextSync(path.join(ctx.repoRoot, pin.note))
      : ''
    const sha = pin.re.exec(note)?.[1]
    if (!sha) return null // an unnamed pin is the assertion's finding, not a missing dependency
    const dir = path.join(resolveRoot(ctx.env).root ?? '', pin.repo)
    if (await cloneHas(dir, sha)) return null
    const snap = await snapshotClone(dir)
    return {
      probe: `pin-in-clone:${key}`,
      reason: `${pin.repo} is at ${snap.ok ? snap.short : 'an unknown commit'} and does not contain ${sha}, the commit TCH pins; the clone is read-only here and may be older than the pin`
    }
  }
}

async function cloneProbe(ctx, repo) {
  const where = resolveRoot(ctx.env)
  if (!where.root) return { probe: `clone:${repo}`, reason: `no sibling-repo root is configured` }
  const dir = path.join(where.root, repo)
  if (!isDirectory(dir))
    return { probe: `clone:${repo}`, reason: `${dir} does not exist (root from ${where.from})` }
  const snap = await snapshotClone(dir)
  if (snap.ok) return null
  // An unfinished git snapshot (timeout, cut off, failed status) is not a missing clone.
  return { probe: `clone:${repo}`, inconclusive: Boolean(snap.invalid), reason: `${dir}: ${snap.reason}` }
}
