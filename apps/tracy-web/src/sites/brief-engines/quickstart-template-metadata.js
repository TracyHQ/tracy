/** Repair only template titles reset to their slug by a verified native content write. */
import { qualityHash } from '../../lib/quality-hash.js'

export function quickstartTemplateTitleProjection(records, filled, held) {
  const originals = new Map((filled.initialStructure ?? []).map((item) => [item.key, item]))
  const projected = structuredClone(records),
    candidates = []
  for (const record of projected) {
    if (!['template', 'templatePart'].includes(record.identity?.kind)) continue
    const expected = originals.get(record.key)?.shape?.title
    if (expected === record.data.title) continue
    const receipt = held[`quickstart:copy:${record.key}`]
    if (
      typeof expected !== 'string' ||
      !expected ||
      record.data.title !== record.identity.key ||
      receipt?.state !== 'verified' ||
      receipt.beforeData?.title !== expected ||
      !receipt.after?.item ||
      typeof receipt.after.body_revision !== 'string' ||
      !receipt.after.body_revision ||
      receipt.after.body_revision !== record.bodyRevision ||
      qualityHash(receipt.after.item) !== qualityHash(record.raw)
    )
      return null
    candidates.push({ key: record.key, title: expected, sourceReceiptHash: qualityHash(receipt) })
    record.data.title = expected
  }
  return candidates.length ? { records: projected, candidates } : null
}

export async function reconcileQuickstartTemplateTitles({ adapter, plan, checkpoint }) {
  for (const item of plan.candidates) {
    const record = adapter.records.find((record) => record.key === item.key)
    await adapter.write(record, { ...record.data, title: item.title }, (receipt) =>
      checkpoint(`template-title:${item.key}`, {
        version: 'native-template-title/1',
        sourceReceiptHash: item.sourceReceiptHash,
        expectedTitle: item.title,
        ...receipt
      })
    )
  }
}
