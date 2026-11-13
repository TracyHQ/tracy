// Whether a written price is proven by another text (ticket #592, moved out of `needs-profile-grounding.mjs` so the
// copy guard of the page writer, `page-writer-data-guard.mjs`, compares prices the same way). Pure.
//
// Money is an amount paired with ITS OWN currency. A currency sign, its ISO code and its word are one currency (`£45`,
// `45 pounds` and `GBP 45` are the same price; `1200 EUR`, `1 200 €` and `€1.200` too). A price is proven only by money
// of the same amount and the same currency (`$20` is `$20.00`, `€15` is `15,00 €`, never `$120`, never `€20`, never the
// 20 of "a 20 minute class", and `€45` is not proven by "£45, gift card €10").

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
const CODES = 'USD|EUR|GBP|AUD|CAD|CHF|JPY|AED|SGD|NZD|HKD|INR|VND|SEK|NOK|DKK|PLN|CZK|BRL|MXN|ZAR'
const CURRENCY = String.raw`\p{Sc}|(?<!\p{L})(?:${CODES})(?!\p{L})`
const CURRENCY_WORD = String.raw`(?:dollars?|euros?|pounds?|dirhams?|francs?|yen|rupees?|kronor|kroner|reais|dong)(?!\p{L})`
/** An amount written as money: a currency sign or code before or after it, or a currency word after it. */
export const MONEY = new RegExp(
  String.raw`(${CURRENCY})\s?(${NUMBER})|(${NUMBER})\s?(${CURRENCY}|${CURRENCY_WORD})`,
  'giu'
)

/** A sign or a word as its ISO code, so the three ways of writing one currency compare equal. */
const SAME_CURRENCY = {
  $: 'USD',
  dollar: 'USD',
  '€': 'EUR',
  euro: 'EUR',
  '£': 'GBP',
  pound: 'GBP',
  '¥': 'JPY',
  yen: 'JPY',
  '₹': 'INR',
  rupee: 'INR',
  '₫': 'VND',
  dong: 'VND',
  dirham: 'AED',
  franc: 'CHF',
  krona: 'SEK',
  kronor: 'SEK',
  reais: 'BRL'
}
/** The ISO code of a written currency (`£`, `GBP`, `pounds`), or the written form itself when it has none here. */
export function currencyOf(written) {
  const w = String(written).trim()
  if (/^[A-Z]{3}$/i.test(w)) return w.toUpperCase()
  const word = w.toLowerCase().replace(/s$/, '')
  return SAME_CURRENCY[w] ?? SAME_CURRENCY[word] ?? SAME_CURRENCY[w.toLowerCase()] ?? w.toLowerCase()
}

/** A space, a no-break space or a narrow no-break space may group thousands: `1 200 €` is `1200 €`. */
export const joinThousands = (text) => String(text).replace(/(?<=\d)[   ](?=\d{3}(?!\d))/gu, '')

/**
 * The value of one written number: one or two digits after the last separator are the decimals (`20.5`, `15,00`); a
 * group of exactly three digits after a separator groups thousands (`1,200`, `1.200`). Any other grouping (`1,2345`)
 * is no amount (NaN), so it proves nothing.
 */
export function amountOf(written) {
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
/**
 * The money `text` writes, thousands spaces joined: `{amount, currency, text}` for each match, `currency` the ISO code.
 */
export const moneyOf = (text) =>
  [...joinThousands(text).matchAll(MONEY)].map((m) => ({
    amount: amountOf(m[2] ?? m[3]),
    currency: currencyOf(m[1] ?? m[4]),
    text: m[0]
  }))
/** The amounts `text` writes as money only (`$35`, `15,00 €`, `20 EUR`, `20 dollars`). */
export const moneyIn = (text) => moneyOf(text).map((m) => m.amount)
/** `text` with every amount written as money taken out: a year or a name is never proven by a price. */
export const withoutMoney = (text) => joinThousands(text).replace(MONEY, ' ')
/** Whether two pieces of money are the same price: the same amount in the same currency. */
export const sameMoney = (a, b) => a.amount === b.amount && a.currency === b.currency

const CURRENCY_TOKEN = new RegExp(String.raw`^(?:${CODES}|${CURRENCY_WORD})$`, 'iu')

/**
 * Whether a price `value` is in `evidence`: each of its money written as the same money in the quote, each bare amount
 * of it (`20`) written as money of any currency there (never an equal number that is not a price, `20` in "a 20 minute
 * class"), and its other words.
 */
export function priceIn(rawValue, rawEvidence) {
  const [value, evidence] = [joinThousands(rawValue), joinThousands(rawEvidence)]
  const quoted = moneyOf(evidence)
  const money = moneyOf(value)
  const bare = amountsOf(withoutMoney(value))
  const words = tokenKey(evidence).split(' ')
  const ownWords = (tokenKey(value).match(/\p{L}+/gu) ?? []).filter((w) => !CURRENCY_TOKEN.test(w))
  return (
    money.length + bare.length > 0 &&
    money.every((m) => quoted.some((q) => sameMoney(m, q))) &&
    bare.every((a) => quoted.some((q) => q.amount === a)) &&
    currencies(withoutMoney(value)).length === 0 &&
    ownWords.every((w) => words.includes(w))
  )
}
