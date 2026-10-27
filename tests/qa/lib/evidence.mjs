// One check of a PASS case's proof log and evidence files, shared by the runner (at publication,
// which records receipts) and coverage (which re-verifies them before crediting anything).
// This proves the files exist, are regular, non-empty where required and unchanged since the run.
// It does not read the log's meaning: that RED is genuine stays a human review question.
import { containedPath, lstatOrNull, readRegularFile, sha256 } from './fsafe.mjs'

const MAX_PROOF_BYTES = 256 * 1024 * 1024
const MAX_EVIDENCE_BYTES = 512 * 1024 * 1024

// → { problem } | { root: 'run' | 'repo', path, sha256, bytes }
export async function receiptForProof(proof, assertionIds, outDir, repoRoot) {
  if (!proof) return { problem: 'no redProof recorded' }
  if (!assertionIds.includes(proof.assertionId))
    return { problem: `redProof.assertionId "${proof.assertionId}" is not among the case's assertion ids` }
  for (const [name, root] of [
    ['run', outDir],
    ['repo', repoRoot]
  ]) {
    let resolved
    try {
      resolved = await containedPath(root, proof.log)
    } catch {
      continue
    }
    try {
      const buffer = await readRegularFile(resolved, { maxBytes: MAX_PROOF_BYTES })
      if (buffer === null) continue
      if (buffer.length === 0) return { problem: 'redProof log is empty' }
      return { root: name, path: proof.log, sha256: sha256(buffer), bytes: buffer.length }
    } catch (error) {
      return { problem: `redProof log unreadable: ${error.message}` }
    }
  }
  return { problem: `redProof log "${proof.log}" not found under the run directory or the repository` }
}

// → { problem } | { receipts: [{ path, sha256, bytes }] }; evidence lives under the run directory.
export async function receiptsForEvidence(files, outDir) {
  const receipts = []
  for (const file of files) {
    try {
      const info = await lstatOrNull(await containedPath(outDir, file))
      if (!info) return { problem: `evidence file "${file}" is missing` }
      if (!info.isFile()) return { problem: `evidence "${file}" is not a regular file` }
      const buffer = await readRegularFile(await containedPath(outDir, file), {
        maxBytes: MAX_EVIDENCE_BYTES
      })
      if (buffer === null) return { problem: `evidence file "${file}" is missing` }
      receipts.push({ path: file, sha256: sha256(buffer), bytes: buffer.length })
    } catch (error) {
      return { problem: `evidence "${file}" unreadable: ${error.message}` }
    }
  }
  return { receipts }
}

// Re-checks a published PASS entry against the disk. → null when sound, else the problem.
export async function verifyEntryReceipts(entry, manifest, runDir, repoRoot) {
  const receipts = entry.receipts
  if (!receipts?.proof || !Array.isArray(receipts.evidence))
    return `${entry.id}: no proof receipt recorded; rerun the layer`
  if (!entry.redProof) return `${entry.id}: PASS without RED-proof metadata`
  if (!manifest.assertionIds.includes(entry.redProof.assertionId))
    return `${entry.id}: redProof assertion is not declared in the case manifest`
  if (!entry.assertionIds?.includes(entry.redProof.assertionId))
    return `${entry.id}: redProof assertion is not among the assertions the run reported`
  const now = await receiptForProof(entry.redProof, entry.assertionIds, runDir, repoRoot)
  if (now.problem) return `${entry.id}: ${now.problem}`
  const was = receipts.proof
  if (now.root !== was.root || now.path !== was.path || now.sha256 !== was.sha256 || now.bytes !== was.bytes)
    return `${entry.id}: redProof log changed since the run`
  const listed = [...entry.evidence].sort()
  const receipted = receipts.evidence.map((e) => e.path).sort()
  if (JSON.stringify(listed) !== JSON.stringify(receipted))
    return `${entry.id}: evidence receipts do not match the evidence list`
  const evidence = await receiptsForEvidence(entry.evidence, runDir)
  if (evidence.problem) return `${entry.id}: ${evidence.problem}`
  for (const now of evidence.receipts) {
    const was = receipts.evidence.find((e) => e.path === now.path)
    if (was.sha256 !== now.sha256 || was.bytes !== now.bytes)
      return `${entry.id}: evidence "${now.path}" changed since the run`
  }
  return null
}
