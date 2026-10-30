#!/usr/bin/env node
/**
 * Write the text made from the site build rules registry (`packages/wo/website-opportunities/domain/build-rules.mjs`):
 * the reference doc `docs/references/site-build-rules.md`, the generated block of the quickstart-contract skill, and the
 * in-site editing agent's skill `packages/design/tracy-design-skill/skills/site-build-rules/SKILL.md`.
 *
 *   node scripts/build-rules/gen.mjs           write both
 *   node scripts/build-rules/gen.mjs --check   exit 1 when either is not what the registry says
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  renderAgentSkill,
  renderRulesDoc,
  withContractBlock
} from '../../packages/wo/website-opportunities/domain/build-rules-render.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DOC = 'docs/references/site-build-rules.md'
const SKILL = '.agents/skills/quickstart-contract/SKILL.md'
/** The in-site editing agent's copy, installed by the dsh image for the Developer and Writer presets. */
const AGENT_SKILL = 'packages/design/tracy-design-skill/skills/site-build-rules/SKILL.md'
/** Where the block goes in a skill that has none yet: before the item that follows the declaration rules. */
const SKILL_ANCHOR = '9. **The first T3 template run through this skill:**'

/** The files the registry owns, each with the text it must hold. */
export function generatedFiles(root = ROOT) {
  const skillPath = path.join(root, SKILL)
  const skill = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : ''
  return [
    { file: DOC, text: renderRulesDoc() },
    { file: SKILL, text: withContractBlock(skill, SKILL_ANCHOR) },
    { file: AGENT_SKILL, text: renderAgentSkill() }
  ]
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  let stale = 0
  for (const { file, text } of generatedFiles()) {
    const full = path.join(ROOT, file)
    const now = existsSync(full) ? readFileSync(full, 'utf8') : null
    if (now === text) continue
    if (check) {
      stale += 1
      console.error(
        `${file} is not what the site build rules registry says: run node scripts/build-rules/gen.mjs`
      )
    } else {
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, text)
      console.log(`wrote ${file}`)
    }
  }
  process.exit(stale ? 1 : 0)
}
