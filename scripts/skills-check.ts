/**
 * Guards that the skill mirror does not drift from its source, and that nothing outside the whitelist enters git.
 *
 * Read-only — safe in CI. `pnpm skills:sync` is the version that fixes things.
 */
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  AGENTS_SKILLS_GITIGNORE,
  allMirroredSkillNames,
  buildAgentsSkillsGitignore,
  buildClaudeSkillsGitignore,
  CLAUDE_SKILLS_DIR,
  CLAUDE_SKILLS_GITIGNORE,
  claudeSymlinkTarget,
  listSkillNames,
  readFileSafe,
  ROOT_DIR,
  skillSourceDir
} from './skills-common'

const isReadme = (file: string, dir: string) =>
  new RegExp(`^${dir.replace('.', '\\.')}/README(?:\\.[a-z0-9-]+)?\\.md$`, 'i').test(file)

function checkGitignore(filePath: string, expected: string, display: string, errors: string[]) {
  const actual = readFileSafe(filePath)
  if (actual === null) errors.push(`${display} does not exist (run \`pnpm skills:sync\`)`)
  else if (actual !== expected) errors.push(`${display} is stale (run \`pnpm skills:sync\`)`)
}

function checkClaudeSkillSymlink(skillName: string, errors: string[]) {
  const linkPath = path.join(CLAUDE_SKILLS_DIR, skillName)
  const target = claudeSymlinkTarget(skillName)

  let stat: fs.Stats
  try {
    stat = fs.lstatSync(linkPath)
  } catch {
    errors.push(`.claude/skills/${skillName} does not exist (run \`pnpm skills:sync\`)`)
    return
  }

  if (!stat.isSymbolicLink()) {
    const kind = stat.isDirectory() ? 'folder' : 'file'
    errors.push(
      `.claude/skills/${skillName} must be a symlink, not a ${kind} — a copy drifts ` +
        'silently (run `pnpm skills:sync`)'
    )
    return
  }

  const actual = fs.readlinkSync(linkPath)
  if (actual !== target) {
    errors.push(`.claude/skills/${skillName} points to '${actual}', expected '${target}'`)
  }
}

/** No file outside the whitelist may be in git — private skills stay on the machine. */
function checkTrackedFilesAgainstWhitelist(skillNames: string[], errors: string[]) {
  const sharedAgents = new Set(['.agents/skills/.gitignore', '.agents/skills/public-skills.txt'])
  const sharedClaude = new Set(['.claude/skills/.gitignore'])
  const allowedSymlinks = new Set(allMirroredSkillNames(skillNames).map((n) => `.claude/skills/${n}`))

  let tracked: string[]
  try {
    tracked = execFileSync('git', ['ls-files', '--', '.agents/skills', '.claude/skills'], {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch (error) {
    errors.push(`cannot read the git file list: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  for (const file of tracked) {
    if (file.startsWith('.agents/skills/')) {
      if (sharedAgents.has(file) || isReadme(file, '.agents/skills')) continue
      if (skillNames.some((n) => file.startsWith(`.agents/skills/${n}/`))) continue
    } else if (file.startsWith('.claude/skills/')) {
      if (sharedClaude.has(file) || isReadme(file, '.claude/skills')) continue
      if (
        allowedSymlinks.has(file) ||
        allMirroredSkillNames(skillNames).some((n) => file.startsWith(`.claude/skills/${n}/`))
      )
        continue
    } else {
      continue
    }
    errors.push(`file outside the whitelist is tracked by git: ${file}`)
  }
}

function main() {
  let skillNames: string[]
  try {
    skillNames = listSkillNames()
  } catch (error) {
    console.error(`skills:check failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const errors: string[] = []
  checkGitignore(
    AGENTS_SKILLS_GITIGNORE,
    buildAgentsSkillsGitignore(skillNames),
    '.agents/skills/.gitignore',
    errors
  )
  checkGitignore(
    CLAUDE_SKILLS_GITIGNORE,
    buildClaudeSkillsGitignore(skillNames),
    '.claude/skills/.gitignore',
    errors
  )

  for (const name of allMirroredSkillNames(skillNames)) {
    const source = skillSourceDir(name)
    const display = path.relative(ROOT_DIR, source)
    if (!fs.existsSync(source)) {
      errors.push(`${display} is declared as a skill but is not on disk`)
      continue
    }
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      errors.push(`${display}/SKILL.md does not exist — a skill without SKILL.md cannot load`)
    }
    checkClaudeSkillSymlink(name, errors)
  }
  checkTrackedFilesAgainstWhitelist(skillNames, errors)

  if (errors.length > 0) {
    console.error('skills:check failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }

  console.log(`skills:check passed (${skillNames.length} skills).`)
}

main()
