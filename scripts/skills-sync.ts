/**
 * Regenerates the skill plumbing: the two whitelist `.gitignore` files and the `.claude/skills/` symlink mirror.
 *
 * Run after adding/removing a line in `.agents/skills/public-skills.txt`. `pnpm skills:check`
 * (part of `build:check`) goes red if you forget.
 */
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
  ROOT_DIR,
  skillSourceDir,
  writeFileIfChanged
} from './skills-common'

/** Ensures `.claude/skills/<name>` is a symlink to the source. Returns true if anything changed. */
function ensureClaudeSkillSymlink(skillName: string): boolean {
  const source = skillSourceDir(skillName)
  if (!fs.existsSync(source)) {
    throw new Error(
      `${path.relative(ROOT_DIR, source)} does not exist — the skill is declared but not on disk`
    )
  }

  const linkPath = path.join(CLAUDE_SKILLS_DIR, skillName)
  const target = claudeSymlinkTarget(skillName)

  let existing: fs.Stats | null = null
  try {
    existing = fs.lstatSync(linkPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (existing !== null) {
    if (existing.isSymbolicLink() && fs.readlinkSync(linkPath) === target) return false
    // A real folder here is a copy that has drifted — delete it, do not try to reconcile.
    fs.rmSync(linkPath, { force: true, recursive: true })
  }

  fs.mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true })
  fs.symlinkSync(target, linkPath)
  return true
}

function main() {
  let skillNames: string[]
  try {
    skillNames = listSkillNames()
  } catch (error) {
    console.error(`skills:sync failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  const changed: string[] = []
  if (writeFileIfChanged(AGENTS_SKILLS_GITIGNORE, buildAgentsSkillsGitignore(skillNames))) {
    changed.push('.agents/skills/.gitignore')
  }
  if (writeFileIfChanged(CLAUDE_SKILLS_GITIGNORE, buildClaudeSkillsGitignore(skillNames))) {
    changed.push('.claude/skills/.gitignore')
  }
  for (const name of allMirroredSkillNames(skillNames)) {
    if (ensureClaudeSkillSymlink(name)) changed.push(`.claude/skills/${name}`)
  }

  if (changed.length === 0) {
    console.log(`skills:sync: nothing to fix (${skillNames.length} skills).`)
    return
  }
  console.log(`skills:sync updated ${changed.length} entries:`)
  for (const file of changed) console.log(`- ${file}`)
}

main()
