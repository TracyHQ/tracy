// Whether a written price is proven by another text (ticket #592, moved out of `needs-profile-grounding.mjs` so the
// copy guard of the page writer, `page-writer-data-guard.mjs`, compares prices the same way). Pure.
//
// A price compares by amount against the amounts the other text writes as MONEY (`$20` is `$20.00`, `€15` is
// `15,00 €`, `€1.200` is `€1,200`, never `$120`, never the 20 of "a 20 minute class"), its currency signs and
// words inside the other text too.

export const currencies = (value) => String(value).match(/\p{Sc}/gu) ?? []

/**
 * The words of a text as whole tokens: a number keeps its separators (`18:00`, `7.30`, `1,200`), so part of a number is
 * never a token of its own (`00 to 20` is not inside `18:00 to 20:00`). Case, accents and other punctuation aside.
 */
export const tokenKey = (value) =>
  (
    String(value)
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .match(/\p{N}+(?:[:.,]\p{N}+)*|\p{L}+/gu) ?? []
  ).join(' ')
const NUMBER = String.raw`\d+(?:[.,']\d+)*`
const CURRENCY = String.raw`\p{Sc}|(?<!\p{L})(?:USD|EUR|GBP|AUD|CAD|CHF|JPY|AED|SGD|NZD|HKD|INR|VND|SEK|NOK|DKK|PLN|CZK|BRL|MXN|ZAR)(?!\p{L})`
const CURRENCY_WORD = String.raw`(?:dollars?|euros?|pounds?|dirhams?|francs?|yen|rupees?|kronor|kroner|reais|dong)(?!\p{L})`
/** An amount written as money: a currency sign or code before or after it, or a currency word after it. */
export const MONEY = new RegExp(
  String.raw`(?:${CURRENCY})\s?(${NUMBER})|(${NUMBER})\s?(?:${CURRENCY}|${CURRENCY_WORD})`,
  'giu'
)

/**
 * The value of one written number: one or two digits after the last separator are the decimals (`20.5`, `15,00`); a
 * group of exactly three digits after a separator groups thousands (`1,200`, `1.200`). Any other grouping (`1,2345`)
 * is no amount (NaN), so it proves nothing.
 */
function amountOf(written) {
  const groups = written.split(/[.,']/)
  if (groups.length === 1) return Number(written)
  const last = groups.at(-1)
  const decimals = last.length <= 2
  const whole = decimals ? groups.slice(0, -1) : groups
  const grouped = whole.length === 1 || (whole[0].length <= 3 && whole.slice(1).every((g) => g.length === 3))
  if (!grouped || (!decimals && last.length !== 3)) return Number.NaN
  return Number(whole.join('')) + (decimals ? Number(last) / 10 ** last.length : 0)
}

/** Every number written in `text`, as an amount. */
const amountsOf = (text) => (String(text).match(new RegExp(NUMBER, 'g')) ?? []).map(amountOf)
/** The amounts `text` writes as money only (`$35`, `15,00 €`, `20 EUR`, `20 dollars`). */
export const moneyIn = (text) => [...String(text).matchAll(MONEY)].map((m) => amountOf(m[1] ?? m[2]))
/** `text` with every amount written as money taken out: a year or a name is never proven by a price. */
export const withoutMoney = (text) => String(text).replace(MONEY, ' ')

/**
 * Whether a price `value` is in `evidence`: each of its amounts written as MONEY in the quote (never an equal number
 * that is not a price, `20` in "a 20 minute class"), its currency signs and its words.
 */
export function priceIn(rawValue, rawEvidence) {
  // A space, a no-break space or a narrow no-break space may group thousands (`1 200 €` is `€1,200`).
  const joined = (text) => String(text).replace(/(?<=\d)[ \u00a0\u202f](?=\d{3}(?!\d))/gu, '')
  const [value, evidence] = [joined(rawValue), joined(rawEvidence)]
  const amounts = amountsOf(value)
  const quoted = new Set(moneyIn(evidence))
  const words = tokenKey(evidence).split(' ')
  const ownWords = tokenKey(value).match(/\p{L}+/gu) ?? []
  return (
    amounts.length > 0 &&
    amounts.every((a) => quoted.has(a)) &&
    currencies(value).every((c) => evidence.includes(c)) &&
    ownWords.every((w) => words.includes(w))
  )
}
