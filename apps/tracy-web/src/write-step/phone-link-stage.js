// Add callable links only through an advertised Claude Cowork plugin, exact-slot presentation operation. A missing capability
// leaves the page measurement responsible for callability; it is never permission to write HTML or scalar fields.
import { randomUUID } from 'node:crypto'
import { international, phonesOf } from './phone-links.js'
import { doorCall } from './settings-door.js'

const WHOLE_PHONE = /^\s*(?:\+|00)?[0-9(][0-9 ().-]*[0-9)]\s*$/
const SHA256 = /^[a-f0-9]{64}$/i

/** A whole numeric value matching exactly one on-site fact, without inventing a country prefix. */
function factPhone(value, phones) {
  if (typeof value !== 'string' || !WHOLE_PHONE.test(value)) return null
  const matches = phones.filter((phone) => phone.digits === international(value))
  return matches.length === 1 ? matches[0] : null
}

export async function runPhoneLinksStage({
  door,
  siteKey,
  contract,
  brief,
  written,
  ordered,
  admitted,
  isCancelled = async () => false
}) {
  const phones = phonesOf(brief)
  const wanted = [...written].filter((key) => factPhone(ordered[key], phones))
  const report = { supported: false, results: new Map(), skipped: [] }
  if (!wanted.length) return report
  if (admitted?.phoneLinks?.version !== 1) {
    report.reason = 'The Claude Cowork plugin does not advertise the exact-slot phone-link capability.'
    return report
  }
  const call = doorCall(door, siteKey)
  let reading
  try {
    reading = await call('content.contract', { operation: 'inspect' })
  } catch (error) {
    report.reason = 'Phone-link capability could not be read: ' + error.message
    return report
  }
  const capability = reading?.phoneLinks
  if (
    reading?.ok !== true ||
    reading.error != null ||
    capability?.version !== 1 ||
    capability.storage !== 'html' ||
    capability.match !== 'whole-slot' ||
    capability.scalar !== false ||
    !Array.isArray(capability.supportedKeys)
  ) {
    report.reason = 'The Claude Cowork plugin does not advertise the exact-slot phone-link capability.'
    return report
  }
  if (
    reading.contract !== contract ||
    !SHA256.test(String(reading.contractHash ?? '')) ||
    typeof reading.revision !== 'string' ||
    !reading.revision
  ) {
    report.reason = 'Phone-link contract identity, hash or revision could not be verified.'
    return report
  }
  report.supported = true
  const supported = new Set(capability.supportedKeys.filter((key) => typeof key === 'string'))
  const slots = Array.isArray(reading.slots) ? reading.slots : []
  let revision = reading.revision
  let stopped = null
  for (const key of wanted) {
    if (!supported.has(key)) {
      report.skipped.push({
        key,
        reason: 'The Claude Cowork plugin does not advertise this slot for phone links.'
      })
      continue
    }
    if (await isCancelled()) {
      report.cancelled = true
      break
    }
    if (stopped) {
      report.results.set(key, {
        status: 'failed',
        reason: 'Phone link not attempted after an unverified operation: ' + stopped
      })
      continue
    }
    const held = slots.filter((slot) => slot?.key === key)
    if (held.length !== 1 || held[0].current !== ordered[key]) {
      report.results.set(key, {
        status: 'failed',
        reason: 'The exact current phone text does not match the successful write.'
      })
      continue
    }
    const expected = held[0].current
    const phone = factPhone(expected, phones)
    if (!phone) continue
    const requestId = randomUUID()
    try {
      const answer = await call('content.contract', {
        operation: 'phone.link',
        contract,
        contract_hash: reading.contractHash,
        expected_revision: revision,
        key,
        expected,
        tel: phone.tel,
        apply_id: 'contract-' + requestId,
        request_id: requestId
      })
      if (
        answer?.ok !== true ||
        answer.error != null ||
        answer.key !== key ||
        typeof answer.afterRevision !== 'string' ||
        !answer.afterRevision ||
        answer.tel !== phone.tel ||
        answer.readBack?.text !== expected ||
        answer.readBack?.href !== 'tel:' + phone.tel ||
        typeof answer.already !== 'boolean'
      )
        throw new Error(
          'The Claude Cowork plugin did not verify the exact phone text, dial target and resulting revision.'
        )
      revision = answer.afterRevision
      report.results.set(key, {
        status: 'written',
        tel: phone.tel,
        already: answer.already,
        afterRevision: revision,
        requestId,
        readBack: answer.readBack
      })
    } catch (error) {
      stopped = error.message
      report.results.set(key, { status: 'failed', reason: stopped, requestId })
    }
  }
  return report
}

/** A failed presentation operation blocks read-back QA while retaining the original text-write evidence. */
export function withPhoneLinks(lines, report) {
  if (!report?.results?.size) return lines
  return lines.map((line) => {
    const result = line.status === 'written' && report.results.get(line.key)
    if (!result) return line
    return {
      ...line,
      phoneLink: result,
      ...(result.status === 'failed'
        ? { status: 'failed', reason: 'Phone link could not be verified: ' + result.reason }
        : {})
    }
  })
}
