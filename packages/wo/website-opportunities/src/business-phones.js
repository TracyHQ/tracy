/**
 * The phone numbers of a researched business (`domain/business-phones.mjs`), decided on every read from what its own
 * sources state, so profiles researched before the decision existed read the same way. The brief, the Details page and
 * the place profile all read `phone` (the main number) and `otherPhones`.
 */
import { decidePhones } from '../domain/business-phones.mjs'

/**
 * The profile with `phone` set to the main number, `phoneSources` (who states it), `phoneWhatsapp` when its source
 * says it is a WhatsApp number, and `otherPhones: [{phone, sources, whatsapp?}]`. A profile with no readable number
 * keeps the phone it had.
 * @param {any} profile @param {{ opportunity?: any }} [read]
 */
const heldSource = (s) => (s === 'google-places' ? 'google' : s)

export function withPhoneDecision(profile, { opportunity = null } = {}) {
  if (!profile || typeof profile !== 'object') return profile
  const { main, others } = decidePhones({ profile, opportunity })
  if (!main) return profile
  const { phoneWhatsapp: _was, ...rest } = profile
  return {
    ...rest,
    phone: main.phone,
    phoneSources: main.sources,
    ...(main.whatsapp ? { phoneWhatsapp: true } : {}),
    otherPhones: others.map((o) => ({
      phone: o.phone,
      sources: o.sources,
      ...(o.whatsapp ? { whatsapp: true } : {})
    })),
    // Where the main number came from; the stored one (with its date) when it named this number's source.
    provenance: {
      ...profile.provenance,
      phone: main.sources.includes(heldSource(profile.provenance?.phone?.source))
        ? profile.provenance.phone
        : { source: main.sources[0] }
    }
  }
}
