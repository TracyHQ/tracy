/** Completion covers the source inventory, not only the fields a model happened to return. */
import { quickstartTextRanges } from './quickstart-editorial.js'
const normalized = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
export function quickstartDemoResidue(records, demoName, businessName) {
  const demo = normalized(demoName)
  if (!demo || normalized(businessName).includes(demo)) return []
  const escaped = demo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u')
  const remaining = []
  for (const record of records)
    for (const [field, value] of Object.entries(record.copy ?? {})) {
      if (quickstartTextRanges(value).some((range) => pattern.test(normalized(range.sample))))
        remaining.push({ record: record.key, field, reason: 'demo-identity-remains' })
    }
  return remaining
}
