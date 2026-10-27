/**
 * The phone rows of the Details Profile card, from the server's decision (`website-opportunities/src/business-phones.js`):
 * `profile.phone` is the main number (Google's, else the one most of the business's own sources state), and
 * `profile.otherPhones` the rest, each with the sources that state it. Nothing is decided here.
 */
type Rec = Record<string, unknown>

export interface OtherPhoneView {
  phone: string
  /** Who states it: `google`, `website`, `instagram`, `listing`… */
  sources: string[]
  whatsapp: boolean
}

export interface PhonesView {
  /** The main number, as the site shows it. */
  main: string
  /** Its source says it is a WhatsApp number. */
  mainWhatsapp: boolean
  /** The other numbers; the site lists them in its Contact section only. */
  others: OtherPhoneView[]
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The phones, or null when the profile holds no main number. */
export function phonesView(profile: unknown): PhonesView | null {
  const p = rec(profile)
  const main = text(p.phone)
  if (main === null) return null
  const others = (Array.isArray(p.otherPhones) ? p.otherPhones : []).flatMap((o): OtherPhoneView[] => {
    const phone = text(rec(o).phone)
    if (phone === null || phone === main) return []
    const sources = rec(o).sources
    return [
      {
        phone,
        sources: Array.isArray(sources) ? sources.filter((s): s is string => text(s) !== null) : [],
        whatsapp: rec(o).whatsapp === true
      }
    ]
  })
  return { main, mainWhatsapp: p.phoneWhatsapp === true, others }
}
