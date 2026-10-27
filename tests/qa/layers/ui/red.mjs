// RED proofs: the same assertion that judges a case must go red on a deliberately broken copy of the
// product and stay green on the real one.
//
// Everything broken lives in a SCRATCH copy under the output directory. The real tree is never
// written: before an edit is applied the target's real path is checked to sit inside the scratch
// root and not be a symlink, and the edit must change the file (its `find` text occurs exactly once).
// The scratch tree is a copy of the three packages that carry mutants (the bench, @tracy/ui and
// @tracy/dsh-ask-form) plus symlinks to every other package, so a story imports the mutated source
// where it should and the untouched source everywhere else.

import { execFile } from 'node:child_process'
import { copyFile, lstat, mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  REPO_ROOT,
  UnsafePathError,
  assertOutsideRepo,
  ensureDir,
  readRegular,
  sha256,
  writeAtomic
} from './artifacts.mjs'
import { EnvError, entryFor, indexStories, measureStory, startStorybook } from './browser.mjs'
import { NEEDS, caseIdFor, evaluate } from './families.mjs'
import { FAMILIES } from './tables.mjs'

const run = promisify(execFile)

export const COPIED = [
  ['dev', 'tracy-design'],
  ['ui', 'tracy-ui'],
  ['ui', 'tracy-ask-form']
]

const BUTTON = 'packages/ui/tracy-ui/src/components/ui/button.tsx'
const INPUT = 'packages/ui/tracy-ui/src/components/ui/input.tsx'
const CARD = 'packages/ui/tracy-ui/src/components/ui/card.tsx'
const BADGE = 'packages/ui/tracy-ui/src/components/ui/badge.tsx'
const DIALOG = 'packages/ui/tracy-ui/src/components/ui/dialog.tsx'
const ASK_STRINGS = 'packages/ui/tracy-ask-form/src/client/strings.ts'
const stories = (name) => `packages/ui/tracy-ui/src/components/ui/${name}.stories.tsx`
const ASK_STORIES = 'packages/dev/tracy-design/src/pages/in-dsh/AskForm.stories.tsx'

/**
 * Story-level mutants. Each edit's `find` must occur exactly once in the real file; the target says
 * which story and which family's assertion must turn red, and with what kind of message.
 */
export const STORY_MUTANTS = Object.freeze([
  {
    id: 'button-drops-aria-label-and-leaves-tab-order',
    description: 'Button swallows aria-label (icon-only buttons lose their name) and takes tabindex=-1.',
    edits: [
      {
        file: BUTTON,
        find: '      data-slot="button"\n',
        replace: '      data-slot="button"\n      tabIndex={-1}\n'
      },
      {
        file: BUTTON,
        find: '      {...props}\n    />\n  )\n}\n\nexport { Button, buttonVariants }',
        replace:
          '      {...props}\n      aria-label={undefined}\n    />\n  )\n}\n\nexport { Button, buttonVariants }'
      }
    ],
    targets: [
      {
        family: 'accessible-name',
        variant: '1440',
        story: { file: stories('button'), exportName: 'IconOnly' },
        expect: /no accessible name/
      },
      {
        family: 'tab-reach',
        variant: '1440',
        story: { file: stories('button'), exportName: 'Default' },
        expect: /tabindex=-1|not reached/
      }
    ]
  },
  {
    id: 'input-focus-draws-ring-halo',
    description: 'Input gets focus-visible:ring-3 ring-ring/50: a halo around the field on focus.',
    edits: [
      {
        file: INPUT,
        find: 'focus-visible:border-ring',
        replace: 'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
      }
    ],
    targets: [
      {
        family: 'focus-stroke',
        variant: '1440',
        story: { file: stories('input'), exportName: 'Default' },
        expect: /halo/
      }
    ]
  },
  {
    id: 'card-forces-700px-min-width',
    description: 'Card gets min-width 700px: horizontal overflow on a 390px phone.',
    edits: [
      {
        file: CARD,
        find: '      data-slot="card"\n',
        replace: '      data-slot="card"\n      style={{ minWidth: 700 }}\n'
      }
    ],
    targets: [
      {
        family: 'overflow',
        variant: '390',
        story: { file: stories('card'), exportName: 'Default' },
        expect: /horizontal overflow/
      }
    ]
  },
  {
    id: 'badge-logs-a-console-error',
    description: 'Badge calls console.error while rendering.',
    edits: [
      {
        file: BADGE,
        find: "}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {\n  return useRender({",
        replace:
          "}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {\n  console.error('qa-red-mutant: badge rendered')\n  return useRender({"
      }
    ],
    targets: [
      {
        family: 'console-network',
        variant: '1440',
        story: { file: stories('badge'), exportName: 'Default' },
        expect: /console error/
      }
    ]
  },
  {
    id: 'dialog-ignores-escape',
    description: 'Dialog popup stops Escape from reaching the dismiss handler.',
    edits: [
      {
        file: DIALOG,
        find: '        data-slot="dialog-content"\n',
        replace:
          '        data-slot="dialog-content"\n        onKeyDownCapture={(e) => { if (e.key === \'Escape\') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() } }}\n'
      }
    ],
    targets: [
      {
        family: 'dialog-recovery',
        variant: '1440',
        story: { file: stories('dialog'), exportName: 'Default' },
        expect: /Escape did not close/
      }
    ]
  },
  {
    id: 'ask-form-drops-a-key-and-says-creator-mode',
    description:
      "tracy-ask-form's English dictionary loses 'action.submit' and calls 'Decide for me' \"Creator mode\".",
    edits: [
      { file: ASK_STRINGS, find: "  'action.submit': 'Send answer',\n", replace: '' },
      {
        file: ASK_STRINGS,
        find: "'action.decide': 'Decide for me'",
        replace: "'action.decide': 'Creator mode'"
      }
    ],
    targets: [
      {
        family: 'raw-keys',
        variant: '1440',
        story: { file: ASK_STORIES, exportName: 'Pending' },
        expect: /raw translation key/
      },
      {
        family: 'vocabulary',
        variant: '1440',
        story: { file: ASK_STORIES, exportName: 'Pending' },
        expect: /banned vocabulary/
      }
    ]
  }
])

/** The case id a story-mutant target proves, or null when the story is not in the denominator. */
export function targetCaseId(storyDetails, target) {
  const detail = Object.values(storyDetails).find(
    (d) => d.file === target.story.file && d.exportName === target.story.exportName
  )
  const family = FAMILIES.find((f) => f.key === target.family)
  return detail && family ? caseIdFor(detail.key, family, target.variant) : null
}

const exists = async (p) => {
  try {
    await lstat(p)
    return true
  } catch {
    return false
  }
}

const WRITE_PATHS = new Set(['.vite-temp', '.vite', '.cache'])

async function linkNodeModules(realDir, scratchDir, overrides = {}) {
  const real = path.join(realDir, 'node_modules')
  if (!(await exists(real))) return
  const dest = path.join(scratchDir, 'node_modules')
  await mkdir(dest, { recursive: true })
  for (const name of await readdir(real)) {
    // Tool write paths stay out of the link farm: a linked `.vite-temp` or `.cache` would send
    // Vite's and Storybook's writes through the symlink into the repository's own node_modules.
    if (WRITE_PATHS.has(name)) continue
    const from = path.join(real, name)
    const target = await realpath(from).catch(() => null)
    if (!target) continue
    if (name.startsWith('@') && (await lstat(target)).isDirectory()) {
      await mkdir(path.join(dest, name), { recursive: true })
      for (const child of await readdir(target)) {
        const key = `${name}/${child}`
        const childTarget = overrides[key] ?? (await realpath(path.join(target, child)).catch(() => null))
        if (childTarget) await symlink(childTarget, path.join(dest, name, child))
      }
    } else {
      await symlink(name === '.bin' ? from : target, path.join(dest, name))
    }
  }
}

/** A tool write path (`.vite-temp`, `.vite`, `.cache`) that is a link would send writes into the repository. */
async function assertNoWriteLinks(scratchRoot, copied, extra = []) {
  const dirs = [
    ...copied.map(([group, pkg]) => path.join(scratchRoot, 'packages', group, pkg)),
    ...extra.map(() => scratchRoot)
  ]
  for (const dir of dirs) {
    for (const name of WRITE_PATHS) {
      const file = path.join(dir, 'node_modules', name)
      const info = await lstat(file).catch(() => null)
      if (info?.isSymbolicLink())
        throw new UnsafePathError(`${file} is a symlink; a tool write would reach the repository`, 'SYMLINK')
    }
  }
}

/** Build the scratch tree. Returns the scratch root. Refuses to build over an existing path. */
export async function buildScratch(scratchRoot, { copied = COPIED, patchBench = true } = {}) {
  assertOutsideRepo(scratchRoot, 'scratch root')
  if (await exists(scratchRoot)) throw new UnsafePathError(`${scratchRoot} already exists`, 'EXISTS')
  await mkdir(scratchRoot, { recursive: true })
  for (const f of ['pnpm-workspace.yaml', 'tsconfig.base.json', 'package.json'])
    await copyFile(path.join(REPO_ROOT, f), path.join(scratchRoot, f))
  // The root node_modules is a farm of links like the packages' own, never one link to the real folder:
  // a write path (.vite-temp, .cache) at its top would otherwise land inside the repository.
  await linkNodeModules(REPO_ROOT, scratchRoot)
  // Stories import app and vendored code by relative path (apps/tracy-web/src/...,
  // vendor/tracy/od-design-system/...): the scratch needs both trees too.
  for (const top of ['apps', 'vendor']) {
    if (!(await exists(path.join(REPO_ROOT, top)))) continue
    await mkdir(path.join(scratchRoot, top), { recursive: true })
    for (const name of await readdir(path.join(REPO_ROOT, top))) {
      const real = path.join(REPO_ROOT, top, name)
      if ((await lstat(real)).isDirectory()) await symlink(real, path.join(scratchRoot, top, name))
    }
  }
  const copiedSet = new Set(copied.map(([g, p]) => `${g}/${p}`))
  for (const group of await readdir(path.join(REPO_ROOT, 'packages'))) {
    const groupDir = path.join(REPO_ROOT, 'packages', group)
    if (!(await lstat(groupDir)).isDirectory()) continue
    await mkdir(path.join(scratchRoot, 'packages', group), { recursive: true })
    for (const pkg of await readdir(groupDir)) {
      const realPkg = path.join(groupDir, pkg)
      if (!(await lstat(realPkg)).isDirectory()) continue
      if (!copiedSet.has(`${group}/${pkg}`))
        await symlink(realPkg, path.join(scratchRoot, 'packages', group, pkg))
    }
  }
  for (const [group, pkg] of copied) {
    const from = path.join(REPO_ROOT, 'packages', group, pkg)
    const to = path.join(scratchRoot, 'packages', group, pkg)
    await run('rsync', [
      '-a',
      '--exclude',
      'node_modules',
      '--exclude',
      'storybook-static',
      `${from}/`,
      `${to}/`
    ]).catch((error) => {
      if (error.code === 'ENOENT') throw new EnvError('rsync is missing', { probe: 'rsync' })
      throw error
    })
  }
  const scratchUi = path.join(scratchRoot, 'packages/ui/tracy-ui')
  for (const [group, pkg] of copied) {
    await linkNodeModules(
      path.join(REPO_ROOT, 'packages', group, pkg),
      path.join(scratchRoot, 'packages', group, pkg),
      { '@tracy/ui': scratchUi }
    )
  }
  await assertNoWriteLinks(scratchRoot, copied, [['', '']])
  if (!patchBench) return scratchRoot
  // The bench must serve files that live outside its own root (the symlinked real packages).
  const mainTs = path.join(scratchRoot, 'packages/dev/tracy-design/.storybook/main.ts')
  const text = await readRegular(mainTs, { root: scratchRoot })
  const patched = text.replace(
    'viteFinal: async (config) => ({\n    ...config,',
    'viteFinal: async (config) => ({\n    ...config,\n    server: { ...config.server, fs: { strict: false } },'
  )
  if (patched === text) throw new Error('could not patch the scratch bench config (server.fs)')
  await writeAtomic(mainTs, patched)
  return scratchRoot
}

/** Edit a scratch file. The path must be a regular file inside the scratch root. */
export async function applyEdit(scratchRoot, edit) {
  const file = path.join(scratchRoot, edit.file)
  const info = await lstat(file)
  if (info.isSymbolicLink())
    throw new UnsafePathError(
      `${edit.file} is a symlink in the scratch tree; refusing to edit through it`,
      'SYMLINK'
    )
  const [realScratch, realFile] = await Promise.all([realpath(scratchRoot), realpath(file)])
  if (!realFile.startsWith(`${realScratch}${path.sep}`))
    throw new UnsafePathError(`${edit.file} resolves outside the scratch root`, 'ESCAPE')
  // the real parents of a copied package must not be symlinks into the repo either
  const realRepo = await realpath(REPO_ROOT)
  if (realFile.startsWith(`${realRepo}${path.sep}`))
    throw new UnsafePathError(`${edit.file} resolves into the real repo`, 'ESCAPE')
  const before = await readRegular(file, { root: scratchRoot })
  const parts = before.split(edit.find)
  if (parts.length !== 2) {
    const bad = new Error(
      `mutation anchor for ${edit.file} occurs ${parts.length - 1} times (needs exactly 1): ${JSON.stringify(edit.find.slice(0, 80))}`
    )
    bad.code = 'ANCHOR'
    throw bad
  }
  const after = parts.join(edit.replace)
  await writeAtomic(file, after)
  return { file: edit.file, before: sha256(before), after: sha256(after), changed: before !== after }
}

/** Remove a scratch tree this module built: only inside outDir, and symlinks are unlinked, never followed. */
export async function removeScratch(outDir, scratchRoot) {
  const rel = path.relative(path.resolve(outDir), path.resolve(scratchRoot))
  if (rel.startsWith('..') || path.isAbsolute(rel) || !rel.startsWith('scratch-')) {
    throw new UnsafePathError(
      `refusing to remove ${scratchRoot}: not a scratch-* directory of ${outDir}`,
      'ESCAPE'
    )
  }
  await rm(scratchRoot, { recursive: true, force: true })
}

const summarize = (check) => ({
  ok: check.ok,
  vacuous: check.vacuous,
  violations: check.violations.map((v) => v.message).slice(0, 8)
})

/**
 * Prove the story-level mutants. `real` and `mutant` are `{ baseUrl, storyMap }`.
 * Returns { proofs: Map<caseId, proof>, notes: [...] } where a proof is
 * { kind, ref, assertionId, log, valid, reason }.
 */
export async function proveStoryMutants({ outDir, ledger, browser, real, storyDetails, ctx, only = null }) {
  const redDir = path.join(outDir, 'red')
  await ensureDir(redDir)
  const proofs = new Map()
  const notes = []
  const scratchRoot = path.join(outDir, 'scratch-bench')
  let mutantSb = null
  try {
    await buildScratch(scratchRoot)
    const applied = []
    const invalid = new Map()
    for (const mutant of STORY_MUTANTS) {
      if (only && !only.includes(mutant.id)) continue
      try {
        const edits = []
        for (const e of mutant.edits) edits.push(await applyEdit(scratchRoot, e))
        applied.push({ mutant, edits })
      } catch (error) {
        invalid.set(mutant.id, error.message)
      }
    }
    mutantSb = await startStorybook({
      benchDir: path.join(scratchRoot, 'packages/dev/tracy-design'),
      outDir,
      ledger,
      label: 'storybook-mutant'
    })
    const mutantSide = { baseUrl: mutantSb.baseUrl, storyMap: indexStories(mutantSb.index) }
    for (const { mutant, edits } of applied) {
      for (const target of mutant.targets) {
        const family = FAMILIES.find((f) => f.key === target.family)
        const detail = Object.values(storyDetails).find(
          (d) => d.file === target.story.file && d.exportName === target.story.exportName
        )
        const caseId = detail ? caseIdFor(detail.key, family, target.variant) : null
        const base = {
          kind: 'mutation',
          ref: `${mutant.id}@${sha256(edits.map((e) => `${e.file}:${e.before}>${e.after}`).join('|')).slice(0, 12)}`,
          assertionId: family.assertionId,
          caseId
        }
        if (!detail) {
          notes.push(
            `${mutant.id}: story ${target.story.file}#${target.story.exportName} is not in the denominator`
          )
          continue
        }
        const wants = new Set(NEEDS[family.key](target.variant))
        const measureOn = async (side) => {
          const entry = entryFor(side.storyMap, detail)
          if (!entry)
            return {
              harness: `story ${detail.exportName} missing from the ${side === real ? 'real' : 'mutant'} Storybook index`
            }
          let m
          try {
            m = await measureStory(browser, { baseUrl: side.baseUrl, storyId: entry.id, wants })
          } catch (error) {
            return { harness: `measurement threw: ${String(error.message).split('\n')[0]}` }
          }
          const verdict = evaluate(family.key, target.variant, m, ctx)
          return verdict.kind === 'harness' ? { harness: verdict.reason } : { check: verdict.result }
        }
        const baseline = await measureOn(real)
        const broken = await measureOn(mutantSide)
        const lines = [
          `mutant: ${mutant.id}`,
          `description: ${mutant.description}`,
          `case: ${caseId}`,
          `assertion: ${family.assertionId}`,
          `story: ${target.story.file}#${target.story.exportName} (viewport ${target.variant})`,
          ...edits.map(
            (e) => `edit: ${e.file} ${e.before.slice(0, 12)} -> ${e.after.slice(0, 12)} changed=${e.changed}`
          ),
          `baseline (real tree): ${JSON.stringify(baseline.harness ? { harness: baseline.harness } : summarize(baseline.check))}`,
          `mutant (scratch copy): ${JSON.stringify(broken.harness ? { harness: broken.harness } : summarize(broken.check))}`
        ]
        let valid = false
        let reason = ''
        if (baseline.harness || broken.harness) reason = `HARNESS: ${baseline.harness ?? broken.harness}`
        else if (!edits.every((e) => e.changed))
          reason = 'MUTATION_UNCHANGED: an edit did not change the source'
        else if (baseline.check.vacuous) reason = 'VACUOUS_BASELINE: the baseline had nothing to judge'
        else if (!baseline.check.ok)
          reason = `BASELINE_RED: the real tree already violates the assertion (${baseline.check.violations[0]?.message ?? ''})`
        else if (broken.check.ok) reason = 'MUTANT_GREEN: the assertion stayed green on the broken copy'
        else if (!broken.check.violations.some((v) => target.expect.test(v.message)))
          reason = `WRONG_SIGNAL: red, but not for the targeted reason (${broken.check.violations[0]?.message})`
        else valid = true
        lines.push(`result: ${valid ? 'RED proven' : `NOT proven — ${reason}`}`)
        const log = path.join('red', `${caseId ?? mutant.id}.log`)
        await writeAtomic(path.join(outDir, log), `${lines.join('\n')}\n`)
        if (caseId) proofs.set(caseId, { ...base, log, valid, reason, familyKey: family.key })
      }
    }
    for (const [id, why] of invalid) notes.push(`${id}: mutation not applied — ${why}`)
  } finally {
    if (mutantSb) await mutantSb.stop()
    await removeScratch(outDir, scratchRoot)
  }
  return { proofs, notes }
}

// ---------------------------------------------------------------------------------------------
// Switch mutants: scratch copies of @tracy/core/ui-switches, bundled and measured in the browser.
// ---------------------------------------------------------------------------------------------

export const SWITCH_MUTANTS = Object.freeze([
  {
    id: 'switch-attribute-never-written',
    description: 'ui-switches writes an empty data-tracy-hide: the binding to <html> is broken.',
    edits: [
      {
        find: "root?.setAttribute(HIDE_ATTRIBUTE, hidden.join(' '))",
        replace: "root?.setAttribute(HIDE_ATTRIBUTE, '')"
      }
    ],
    targets: [
      { family: 'binding', switchId: 'model-picker' },
      { family: 'binding', switchId: 'tab-git' }
    ]
  },
  {
    id: 'switch-door-failure-hides-everything',
    description: 'ui-switches hides every switch when the door fails instead of keeping the defaults.',
    edits: [
      {
        find: 'if (hidden === null) return\n',
        replace:
          'if (hidden === null) {\n      for (const id of DEFAULTS.keys()) shown.set(id, false)\n      mark()\n      return\n    }\n'
      }
    ],
    targets: [{ family: 'door-down', switchId: 'model-picker' }]
  },
  {
    id: 'switch-tab-policy-ignores-switches',
    description: 'tabPolicy() allows and lists every tab whatever the switches say.',
    edits: [
      {
        find: 'const ask = (map, tabId) => (map.has(tabId) ? shown.get(map.get(tabId)) !== false : true)',
        replace: 'const ask = () => true'
      }
    ],
    targets: [
      { family: 'tab-policy', switchId: 'tab-git' },
      { family: 'tab-policy', switchId: 'launch-git' }
    ]
  }
])
