/**
 * Where the QA suite reads a root document it quotes or pins (CONTEXT.md, SYSTEM.md, DESIGN.md, CLAUDE.md).
 *
 * The public export replaces those files with their English copy under `scripts/opensource/overlay/`
 * (`OVERLAY_DIR` of scripts/opensource/export.mjs). Anchors quote that English copy and hashes pin it, so the
 * same oracle holds in this repository and in the exported one; a file with no overlay is read as it is.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export const OVERLAY_DIR = 'scripts/opensource/overlay'

/** @returns {string} the repo-relative path to read for `rel`: its overlay when one exists, else `rel`. */
export function docRel(root, rel) {
  const overlay = path.posix.join(OVERLAY_DIR, rel)
  return existsSync(path.join(root, overlay)) ? overlay : rel
}
