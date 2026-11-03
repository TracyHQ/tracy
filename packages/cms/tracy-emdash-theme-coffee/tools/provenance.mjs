#!/usr/bin/env node
// Refresh the hash table in src/components/ui/PROVENANCE.md after a deliberate `shadcn add`.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const md = readFileSync('src/components/ui/PROVENANCE.md', 'utf8')
const files = readdirSync('src/components/ui')
  .filter((f) => f.endsWith('.tsx'))
  .sort()
const rows = files.map(
  (f) =>
    `| \`${f}\` | \`${f.replace(/\.tsx$/, '')}\` | \`${createHash('sha256')
      .update(readFileSync(`src/components/ui/${f}`))
      .digest('hex')
      .slice(0, 16)}\` |`
)
const out = md.replace(
  /(\| File \| Registry item \| sha256 \(16\) \|\n\|---\|---\|---\|\n)[\s\S]*$/,
  `$1${rows.join('\n')}\n`
)
writeFileSync('src/components/ui/PROVENANCE.md', out)
console.log(`${rows.length} rows refreshed`)
