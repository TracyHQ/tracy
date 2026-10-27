#!/usr/bin/env node
// Export packages/wo/website-opportunities as the tree of the public repo (ADR 0036), never with TCH history.
//   First commit: node scripts/wo-export-public.mjs --out <empty dir> [--ref HEAD] [--remote <url> --push [--replace]]
//   Later:        node scripts/wo-export-public.mjs --out <empty dir> --sync <url> [--ref HEAD] [--push]
// --replace force-pushes the single first commit: only while the repo is private and unused.
// --sync clones the public main, lays the export over it and adds ONE ordinary commit on top (never forced).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PKG = 'packages/wo/website-opportunities'
// Files that only make sense inside TCH.
const TCH_ONLY = ['turbo.json']
const AUTHOR = ['-c', 'user.name=Tracy', '-c', 'user.email=noreply@tracy.ai']

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
const out = opt('--out')
const ref = opt('--ref') ?? 'HEAD'
const remote = opt('--remote')
const sync = opt('--sync')
const push = args.includes('--push')
const replace = args.includes('--replace')
if (!out) throw new Error('--out <empty dir> is required')
if (existsSync(out) && readdirSync(out).length) throw new Error(`${out} is not empty`)
if (push && !remote && !sync) throw new Error('--push needs --remote or --sync')
if (replace && (!push || sync)) throw new Error('--replace needs --push and never goes with --sync')

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString()
const sha = run('git', ['rev-parse', '--short', ref]).trim()

if (sync) {
  run('git', ['clone', '-q', '--branch', 'main', sync, out])
  // Every tracked file goes; the export below brings back what still exists.
  for (const f of run('git', ['ls-files', '-z'], out).split('\0').filter(Boolean))
    rmSync(path.join(out, f), { force: true })
} else {
  execFileSync('mkdir', ['-p', out])
}

const tar = execFileSync('git', ['archive', ref, PKG], { maxBuffer: 512 * 1024 * 1024 })
execFileSync('tar', ['-x', '-C', out, `--strip-components=${PKG.split('/').length}`], { input: tar })
for (const f of TCH_ONLY) rmSync(path.join(out, f), { force: true })
const pkgFile = path.join(out, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
delete pkg.scripts['test:ci']
writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
writeFileSync(path.join(out, '.gitignore'), 'node_modules/\n.env\n.env.*\n!.env.example\ndata/\n*.tgz\n')
rmSync(path.join(out, 'package-lock.json'), { force: true })
run('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], out)
// The scan gates the commit: nothing leaves unless the exported tree is clean.
run('node', ['scripts/check-public.mjs', '--dir', '.'], out)

if (sync) {
  run('git', ['add', '-A'], out)
  if (!run('git', ['status', '--porcelain'], out).trim()) {
    console.log(`nothing to sync: the public main already matches ${PKG}@${sha}`)
    process.exit(0)
  }
  run('git', [...AUTHOR, 'commit', '-q', '-m', `chore: sync from upstream at ${sha}`], out)
  run('node', ['scripts/check-public.mjs', '--history', 'HEAD~1..HEAD'], out)
  console.log(`synced ${PKG}@${sha} onto the public main in ${out}`)
  if (push) {
    run('git', ['push', '-q', 'origin', 'main'], out)
    console.log(`pushed to ${sync}`)
  }
} else {
  run('git', ['init', '-q', '-b', 'main'], out)
  run('git', ['add', '-A'], out)
  run('git', [...AUTHOR, 'commit', '-q', '-m', 'feat: initial public tree of website-opportunities'], out)
  run('node', ['scripts/check-public.mjs', '--history', 'HEAD'], out)
  console.log(`exported ${PKG}@${sha} to ${out}`)
  if (push) {
    run('git', ['remote', 'add', 'origin', remote], out)
    run('git', ['push', '-q', ...(replace ? ['--force'] : []), '-u', 'origin', 'main'], out)
    console.log(`pushed to ${remote}`)
  }
}
