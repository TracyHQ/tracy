// What a place profile (ADR 0037, `website-opportunities/place-profile` 1.0.0) lets a demo print: the facts the
// page assertions compare against. Anything a demo shows that is not here was not sourced.

/** A printed amount as a comparable key: `125.000` → `125000`, `9,50` → `9.5`, `$12` → `12`. */
export function amountKey(text) {
  const s = String(text ?? '').replace(/[^\d.,]/g, '')
  if (!s || !/\d/.test(s)) return null
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return String(Number(s.replace(/[.,]/g, '')))
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? String(n) : null
}

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const valueOf = (fact) => (fact && typeof fact === 'object' && 'value' in fact ? fact.value : undefined)

/**
 * @param {any} profile
 * @returns {{ trade: string | null, name: string | null, phoneDigits: string | null, email: string | null,
 *   priceDigits: Set<string>, people: string[], statistics: number[], hasBooking: boolean, offerings: string[],
 *   values: Set<string> }}
 */
export function profileFacts(profile) {
  const b = profile?.business ?? {}
  const trade =
    (profile?.classification?.derivedCategories ?? []).map(valueOf).find((v) => v?.taxonomy === 'tracy-trade')
      ?.code ?? null
  const priceDigits = new Set()
  const offerings = []
  for (const o of profile?.offerings ?? []) {
    const v = valueOf(o)
    if (v?.name) offerings.push(v.name)
    for (const variant of v?.variants ?? []) {
      const p = variant?.price
      if (!p || p.kind === 'unknown') continue
      const key = amountKey(p.raw)
      if (key) {
        priceDigits.add(key)
        if (p.priceScale) priceDigits.add(String(Number(key) * p.priceScale))
      }
      for (const n of [p.amount, p.minAmount, p.maxAmount])
        if (typeof n === 'number') priceDigits.add(String(n))
    }
  }
  const people = (profile?.people ?? []).map((p) => valueOf(p)?.name).filter(Boolean)
  const statistics = (profile?.claims?.statistics ?? [])
    .map((s) => valueOf(s)?.amount)
    .filter((n) => typeof n === 'number')
  const hasBooking = (profile?.links ?? []).some((l) => valueOf(l)?.kind === 'booking')
  const phone =
    valueOf(b.phone) ?? valueOf(b.internationalPhoneNumber) ?? valueOf(b.nationalPhoneNumber) ?? null
  const values = new Set(
    [valueOf(b.name), valueOf(b.address), phone, valueOf(b.email), ...offerings, ...people]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim().toLowerCase())
  )
  return {
    trade,
    name: valueOf(b.name) ?? null,
    phoneDigits: phone ? digits(phone) : null,
    email: valueOf(b.email) ?? null,
    priceDigits,
    people,
    statistics,
    hasBooking,
    offerings,
    values
  }
}
