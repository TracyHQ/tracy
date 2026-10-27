// Dockerfile cases: runtime-user readability of COPY inputs under a restrictive build context
// (umask 077) and COPY sources that never reach the image. Static analysis of the Dockerfile text;
// a real `docker build` is not run (see README: image build is reported as an open obligation).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { analyzeStagePermissions, dockerInputItemId, readDockerfile } from './dockerfile.mjs'
import { isIgnored, loadDockerignore } from './dockerignore.mjs'
import { REPO, step } from './harness.mjs'
import { removeScratch, scratchDir } from './scratch.mjs'

/** Every Dockerfile the system builds, with the context root it is built from. */
export const DOCKERFILES = [
  {
    slug: 'host',
    file: 'apps/tracy-host/Dockerfile',
    context: '.',
    contextSource: 'deploy/compose.yml (context: ..)'
  },
  {
    slug: 'web',
    file: 'apps/tracy-web/Dockerfile',
    context: '.',
    contextSource: 'deploy/compose.yml (context: ..); .dockerignore comment'
  },
  {
    slug: 'dsh',
    file: 'packages/fleet/tracy-fleet-operation/dsh/Dockerfile',
    context: '.',
    contextSource: '.dockerignore header: build context for the dsh Dockerfile'
  },
  {
    slug: 'runner',
    file: 'packages/fleet/tracy-fleet-operation/runner/Dockerfile',
    context: 'packages/fleet/tracy-fleet-operation/runner',
    contextSource: 'assumed: COPY entrypoint.sh is relative to its own directory'
  },
  ...['base', 'business', 'saas'].map((name) => ({
    slug: `theme-${name}`,
    file: `packages/cms/tracy-emdash-theme-${name}/Dockerfile`,
    context: `packages/cms/tracy-emdash-theme-${name}`,
    contextSource: 'assumed: `COPY . .` copies the theme directory'
  }))
]

const WEB = 'apps/tracy-web/Dockerfile'
const DSH = 'packages/fleet/tracy-fleet-operation/dsh/Dockerfile'
const RUNNER = 'packages/fleet/tracy-fleet-operation/runner/Dockerfile'

export const DOCKER_MUTATIONS = [
  {
    id: 'docker-web-chown-dropped',
    tree: 'docker',
    file: WEB,
    find: ' && chown -R tracy-web:tracy-web /opt/tracy-web',
    replace: ''
  },
  {
    id: 'docker-host-runs-unprivileged',
    tree: 'docker',
    file: 'apps/tracy-host/Dockerfile',
    find: 'CMD ["node", "src/server.js"]',
    replace: 'USER node\nCMD ["node", "src/server.js"]'
  },
  {
    id: 'docker-dsh-entrypoint-fix',
    tree: 'docker',
    file: DSH,
    find: 'COPY packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh /usr/local/bin/tracy-dsh-entrypoint',
    replace:
      'COPY --chmod=0755 packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh /usr/local/bin/tracy-dsh-entrypoint',
    role: 'fix'
  },
  {
    id: 'docker-runner-entrypoint-fix',
    tree: 'docker',
    file: RUNNER,
    find: 'COPY entrypoint.sh /usr/local/bin/entrypoint.sh',
    replace: 'COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh',
    role: 'fix'
  },
  ...['base', 'business', 'saas'].map((name) => {
    const file = `packages/cms/tracy-emdash-theme-${name}/Dockerfile`
    return {
      id: `docker-theme-${name}-unowned-nonroot`,
      tree: 'docker',
      edits: [
        { file, find: 'COPY --chown=www-data:www-data . .', replace: 'COPY . .' },
        {
          file,
          find: ' && find /app -xdev -not -user www-data -exec chown www-data:www-data {} +',
          replace: ''
        },
        { file, find: 'ENTRYPOINT ["bash"', replace: 'USER www-data\nENTRYPOINT ["bash"' }
      ]
    }
  })
]
for (const d of DOCKERFILES) {
  DOCKER_MUTATIONS.push({
    id: `docker-copy-source-missing:${d.slug}`,
    tree: 'docker',
    file: d.file,
    find: /^COPY (?:--[^\s]+ )*(?!--)(\S+)/m,
    replace: 'COPY qa-source-that-does-not-exist-anywhere'
  })
}

/** Context-sourced COPY sources (relative to the context) of one Dockerfile. */
export function contextSources(parsed) {
  const out = []
  for (const stage of parsed.stages) {
    for (const i of stage.instructions) {
      if ((i.op === 'COPY' || i.op === 'ADD') && !i.flags.from) {
        for (const source of i.sources) out.push({ line: i.line, source })
      }
    }
  }
  return out
}

const hasGlob = (s) => /[*?[]/.test(s)

/**
 * A source that is not in the checkout is acceptable only as a BUILD OUTPUT named
 * by a producing step (workflow, script or package.json) other than the Dockerfile itself. The
 * producer is matched on the last two path segments because workflows write relative paths.
 */
export function isBuildOutput(repo, rel) {
  // Being git-ignored says the file is not a source; it does NOT say who produces it. Only a named
  // producer counts, so an ignored path with none is reported as an unproven build output.
  const tail = rel.split('/').slice(-2).join('/')
  const grep = spawnSync(
    'git',
    [
      '-C',
      repo,
      'grep',
      '-l',
      '-F',
      tail,
      '--',
      '.github',
      'scripts',
      'package.json',
      'packages/*/package.json',
      'apps/*/package.json',
      'packages/*/*/package.json'
    ],
    { encoding: 'utf8' }
  )
  return grep.status === 0 && grep.stdout.trim() !== ''
}

const CONTEXT_ENTRY_CAP = 4000

/**
 * A real scratch build context created under umask 077, mirroring the REAL source files and
 * directories of every resolved COPY source (regular files only, .dockerignore applied; contents are
 * empty, only the names and the modes matter). Returns what was observed on disk, not what was
 * intended: any entry whose mode is not owner-only is listed in `notPrivate`. Whatever could not be
 * mirrored (glob, `.`, symlink, over the cap, unreadable) is listed in `skipped`, never assumed fine.
 */
export function scratchContext(parsed, contextRoot) {
  const dir = scratchDir('qa-infra-context-')
  const previous = process.umask(0o077)
  const made = { files: 0, dirs: 0, notPrivate: [], skipped: [] }
  const ignore = loadDockerignore(path.join(contextRoot, '.dockerignore'))
  const mirror = (rel) => {
    if (made.files + made.dirs >= CONTEXT_ENTRY_CAP) {
      made.skipped.push(`${rel}: over the ${CONTEXT_ENTRY_CAP}-entry cap`)
      return
    }
    if (rel !== '' && isIgnored(ignore, rel)) return
    const real = path.join(contextRoot, rel)
    let info
    try {
      info = lstatSync(real)
    } catch (error) {
      made.skipped.push(`${rel}: ${error.code ?? error.message}`)
      return
    }
    const target = path.join(dir, rel)
    if (info.isSymbolicLink() || !(info.isFile() || info.isDirectory())) {
      made.skipped.push(`${rel}: symlink or special file, not followed`)
    } else if (info.isFile()) {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, '')
    } else {
      mkdirSync(target, { recursive: true })
      for (const name of readdirSync(real).sort()) mirror(path.join(rel, name))
    }
  }
  try {
    for (const { source } of contextSources(parsed)) {
      const rel = source.replace(/^\.\//, '').replace(/\/+$/, '')
      if (hasGlob(rel) || path.isAbsolute(rel) || rel.split('/').includes('..')) {
        made.skipped.push(`${source}: glob or outside the context`)
        continue
      }
      if (rel === '' || rel === '.') {
        made.skipped.push(`${source}: the whole context is not expanded`)
        continue
      }
      mirror(rel)
    }
    const visit = (at) => {
      for (const name of readdirSync(at)) {
        const full = path.join(at, name)
        const info = lstatSync(full)
        const mode = info.mode & 0o777
        if (info.isDirectory()) {
          made.dirs += 1
          if (mode & 0o077) made.notPrivate.push(`${path.relative(dir, full)}/ ${mode.toString(8)}`)
          visit(full)
        } else {
          made.files += 1
          if (mode & 0o077) made.notPrivate.push(`${path.relative(dir, full)} ${mode.toString(8)}`)
        }
      }
    }
    visit(dir)
  } finally {
    process.umask(previous)
    removeScratch(dir)
  }
  return made
}

export function dockerCases() {
  const cases = []
  for (const d of DOCKERFILES) {
    const item = `dockerfile:${d.file}`
    const inputs = [
      ...new Set(
        contextSources(readDockerfile(path.join(REPO, d.file))).map((c) =>
          dockerInputItemId(d.file, c.source)
        )
      )
    ].sort()
    const common = {
      itemIds: [item, ...inputs],
      targets: ['local'],
      effects: { reads: [d.file], writes: [], mail: false, model: false, containers: false },
      prerequisites: [],
      legacyIds: []
    }
    const fixMutation = DOCKER_MUTATIONS.find(
      (m) => m.role === 'fix' && (m.file === d.file || m.edits?.[0]?.file === d.file)
    )
    const redMutation = DOCKER_MUTATIONS.find(
      (m) =>
        m.role !== 'fix' &&
        (m.id === `docker-${d.slug}-chown-dropped` ||
          m.id === `docker-${d.slug}-unowned-nonroot` ||
          m.id === `docker-${d.slug}-runs-unprivileged`)
    )
    cases.push({
      ...common,
      id: `QA-INFRA-dockerfile-${d.slug}-disk-permission`,
      requirement: `${d.file}: every COPY from a build context that may have been created under umask 077 stays readable by the image's runtime user (chown/chmod/--chmod/--chown, or a root runtime)`,
      oracle: 'dockerfile-copy-semantics',
      edgeTags: ['disk-permission', 'version-mismatch'],
      assertionIds: ['context-copies-readable', 'scratch-context-private'],
      mutation: redMutation?.id ?? null,
      fixMutation: fixMutation?.id ?? null,
      redAssertion: 'context-copies-readable',
      async run({ root, repo }) {
        const parsed = readDockerfile(path.join(root, d.file))
        const final = parsed.stages.at(-1)
        const analysis = analyzeStagePermissions(final, parsed.stages)
        const context = scratchContext(parsed, path.join(repo, d.context))
        step('scratch-context-private', () =>
          assert.deepEqual(
            context.notPrivate,
            [],
            'the scratch context must be created owner-only (umask 077)'
          )
        )
        const unknown = analysis.rows.filter((r) => r.status === 'unknown')
        const contextOpen = analysis.rows.filter((r) => r.status === 'open' && r.source === 'context')
        const stageOpen = analysis.rows.filter((r) => r.status === 'open' && r.source !== 'context')
        step('context-copies-readable', () =>
          assert.deepEqual(
            contextOpen.map((r) => `line ${r.line} → ${r.dest}: ${r.via}`),
            [],
            `runtime user ${analysis.runtimeUser}: a 0600 file copied from the context stays unreadable`
          )
        )
        if (unknown.length > 0) {
          return {
            pendingReason: `the runtime user of ${d.file} is not stated (${unknown[0].via}); readability of ${unknown.length} COPY(s) is not judged. Scratch context built: ${context.files} files, ${context.dirs} directories, all owner-only`
          }
        }
        const unproven = analysis.rows.filter((r) => r.status === 'unproven')
        if (unproven.length > 0) {
          return {
            pendingReason: `${unproven.length} COPY(s) rely on a RUN chown/chmod that is only matched as text (${unproven.map((r) => `line ${r.line}`).join(', ')}); not proven to run or to leave every parent directory traversable`
          }
        }
        if (context.skipped.length > 0) {
          return {
            pendingReason: `${context.skipped.length} context source(s) were not mirrored into the scratch context (${context.skipped.slice(0, 3).join('; ')}); the permissions of those paths are not judged`
          }
        }
        if (stageOpen.length > 0) {
          return {
            pendingReason: `modes of ${stageOpen.length} stage-sourced COPY(s) are not traced (${stageOpen.map((r) => `line ${r.line} → ${r.dest}`).join('; ')}); the context-sourced COPYs are covered`
          }
        }
        return undefined
      }
    })

    cases.push({
      ...common,
      id: `QA-INFRA-dockerfile-${d.slug}-missing-asset`,
      requirement: `${d.file}: every COPY source from the build context exists (or is a documented build output) and is not excluded by .dockerignore`,
      oracle: 'dockerfile-copy-semantics',
      edgeTags: ['missing-asset', 'version-mismatch'],
      assertionIds: ['sources-reach-image'],
      mutation: `docker-copy-source-missing:${d.slug}`,
      redAssertion: 'sources-reach-image',
      async run({ root, repo }) {
        const parsed = readDockerfile(path.join(root, d.file))
        const contextRoot = path.join(repo, d.context)
        const ignore = loadDockerignore(path.join(contextRoot, '.dockerignore'))
        const missing = []
        const unproven = []
        for (const { line, source } of contextSources(parsed)) {
          const rel = source.replace(/^\.\//, '').replace(/\/+$/, '')
          const abs = path.join(contextRoot, rel)
          if (hasGlob(rel)) {
            if (!existsSync(path.dirname(abs))) missing.push(`line ${line}: ${source} (glob parent missing)`)
            continue
          }
          const ctxRel = path.relative(repo, abs)
          const present = existsSync(abs)
          const generated = !present && isBuildOutput(repo, ctxRel)
          if (generated) unproven.push(`line ${line}: ${source}`)
          if (!present && !generated)
            missing.push(
              `line ${line}: ${source} does not exist and no workflow, script or package.json names it`
            )
          else if (isIgnored(ignore, rel === '.' ? '' : rel) && rel !== '.' && rel !== '') {
            missing.push(`line ${line}: ${source} is excluded by .dockerignore`)
          }
        }
        step('sources-reach-image', () => assert.deepEqual(missing, []))
        if (unproven.length > 0)
          return {
            pendingReason: `${unproven.length} COPY source(s) are absent from the checkout and their producer is matched by file name only, not traced to a build step: ${unproven.join('; ')}`
          }
      }
    })
  }
  return cases
}

export { REPO }
