/**
 * REG-200: a thread card draws each @mention in its own span with the mention colour. S1/S2 run
 * the sidebar fork's vitest from its own folder (exit 0, 0 failed, the named tests passing); S3
 * reads the `.threadMention` rule of the sidebar's CSS module.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks } from './lib.mjs'
import { vitestRun } from './vitest.mjs'

const c = checks()
const PKG = 'vendor/tracy/dsh-better-sidebar'

// S1 + S2
const s1 = vitestRun(PKG, [
  'tests/thread-mention-parts.spec.ts',
  'tests/comment-people-layer.spec.tsx',
  '-t',
  'mention'
])
c.eq('S1: exit code', s1.status, 0)
c.eq('S1: failed', s1.counts.failed, 0)
if (s1.status !== 0) process.stdout.write(s1.output.slice(-2000))
for (const name of [
  'cuts every mention out of the words, in order',
  'a mention after text, and a trailing dot left out',
  'never an e-mail address, and plain words stay one part',
  'each mention in its own span with the mention class; an e-mail address stays plain'
])
  c.check(`S1: '${name}' passes`, s1.passed.includes(name) && !s1.failed.includes(name), {
    passed: s1.passed,
    failed: s1.failed
  })

// S3
const css = readFileSync(join(ROOT, PKG, 'src/client/sidebar.module.css'), 'utf8')
const rule = /\.threadMention\s*\{([^}]*)\}/.exec(css)
c.check('S3: sidebar.module.css has a .threadMention rule', rule !== null)
const body = rule?.[1] ?? ''
const color = /(?:^|;)\s*color\s*:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? null
c.check(
  'S3: .threadMention color mixes --primary with --dsw-alias-label-primary',
  color !== null &&
    color.startsWith('color-mix(') &&
    color.includes('var(--primary)') &&
    color.includes('var(--dsw-alias-label-primary)'),
  color
)
c.eq('S3: .threadMention font-weight', /font-weight\s*:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? null, '500')
c.done()
