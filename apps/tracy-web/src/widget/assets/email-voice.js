/** Spoken email candidates must be confirmed by the person before any code is requested. */
const NATO = {
  a: 'Alpha',
  b: 'Bravo',
  c: 'Charlie',
  d: 'Delta',
  e: 'Echo',
  f: 'Foxtrot',
  g: 'Golf',
  h: 'Hotel',
  i: 'India',
  j: 'Juliett',
  k: 'Kilo',
  l: 'Lima',
  m: 'Mike',
  n: 'November',
  o: 'Oscar',
  p: 'Papa',
  q: 'Quebec',
  r: 'Romeo',
  s: 'Sierra',
  t: 'Tango',
  u: 'Uniform',
  v: 'Victor',
  w: 'Whiskey',
  x: 'X-ray',
  y: 'Yankee',
  z: 'Zulu'
}
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const EMAIL =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
export function normalizeSpeech(text) {
  return String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim()
}
/** Shared normalization for provider ISO codes and browser BCP 47 tags. */
export function speechLanguageCode(value) {
  if (typeof value !== 'string' || value.length > 40) return null
  const code = value.toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2,3}$/.test(code) ? { eng: 'en', vie: 'vi', cmn: 'zh', zho: 'zh' }[code] || code : null
}
/** Convert any Unicode decimal digit without interpreting surrounding words. */
export function decimalDigits(text) {
  return String(text).replace(/\p{Nd}/gu, (char) => {
    const cp = char.codePointAt(0)
    let start = cp
    while (cp - start < 50 && start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
    return String((cp - start) % 10)
  })
}
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function spokenEmail(text, lexicon = null) {
  text = decimalDigits(text)
  if (lexicon) {
    text = normalizeSpeech(text)
    for (const prefix of [...(lexicon.emailPrefix || [])].sort((a, b) => b.length - a.length)) {
      const normalized = normalizeSpeech(prefix)
      if (text.startsWith(normalized)) {
        text = text.slice(normalized.length).trim()
        break
      }
    }
    const pairs = [
      ...Object.entries(lexicon.symbols || {}).map(([symbol, word]) => [word, symbol]),
      ...(lexicon.digits || []).map((word, i) => [word, String(i)])
    ].sort((a, b) => b[0].length - a[0].length)
    for (const [word, replacement] of pairs) {
      const normalized = normalizeSpeech(word)
      const boundary = /[a-z]/.test(normalized)
      text = text.replace(
        new RegExp(
          (boundary ? '(?<![\\p{L}\\p{N}])' : '') +
            escaped(normalized) +
            (boundary ? '(?![\\p{L}\\p{N}])' : ''),
          'gu'
        ),
        replacement
      )
    }
  }
  const literals =
    String(text)
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}/g) || []
  if (literals.length) return literals.length === 1 && EMAIL.test(literals[0]) ? literals[0] : null
  let value = normalizeSpeech(text).replace(
    /^(?:my email(?: address)? is|email(?: address)?(?: cua toi)?(?: la)?|dia chi email(?: cua toi)? la)\s+/,
    ''
  )
  value = value.replace(/\b([a-z])\s+as\s+in\s+[a-z]+(?:-ray)?\b/g, '$1')
  const names = Object.fromEntries(Object.entries(NATO).map(([letter, name]) => [name.toLowerCase(), letter]))
  const local = value.split(/\s+(?:at sign|at|a cong|a vong)\s+/)[0].split(/\s+/)
  if (local.length > 1 && local.every((w) => names[w]))
    value = local.map((w) => names[w]).join('') + value.slice(local.join(' ').length)
  value = value
    .replace(/\b(?:at sign|a cong|a vong|at)\b/g, '@')
    .replace(/\b(?:dot|cham|point)\b/g, '.')
    .replace(/\b(?:underscore|gach duoi)\b/g, '_')
    .replace(/\b(?:hyphen|dash|gach ngang)\b/g, '-')
    .replace(/\b(?:plus|dau cong)\b/g, '+')
  value = value.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (word) =>
    String(DIGITS.indexOf(word))
  )
  value = value.replace(/[\s,]+/g, '').replace(/[.!?]+$/, '')
  return value.length <= 254 && EMAIL.test(value) && !value.includes('..') ? value : null
}
export function phoneticEmail(email, lexicon = null) {
  const [local, domain] = email.toLowerCase().split('@')
  const spell = (text) =>
    [...text]
      .map((char) =>
        NATO[char]
          ? (lexicon?.letterPattern || '{letter} as in {word}')
              .replace('{letter}', char.toUpperCase())
              .replace('{word}', NATO[char])
          : /\d/.test(char)
            ? (lexicon?.digits || DIGITS)[Number(char)]
            : lexicon?.symbols?.[char] ||
              { '.': 'dot', '-': 'dash', _: 'underscore', '+': 'plus', '%': 'percent' }[char] ||
              char
      )
      .join('. ')
  const known = new Set([
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'yahoo.com',
    'icloud.com',
    'proton.me',
    'protonmail.com'
  ])
  return (
    spell(local) +
    '. ' +
    (lexicon?.symbols?.['@'] || 'At') +
    '. ' +
    (known.has(domain)
      ? domain.split('.').join('. ' + (lexicon?.symbols?.['.'] || 'Dot') + '. ')
      : domain
          .split('.')
          .map(spell)
          .join('. ' + (lexicon?.symbols?.['.'] || 'Dot') + '. ')) +
    '.'
  )
}
export function speechParts(text, maxChars = 600) {
  const parts = []
  let rest = text
  while (rest.length > maxChars) {
    const split = rest.lastIndexOf(' ', maxChars)
    const end = split > 0 ? split : maxChars
    parts.push(rest.slice(0, end))
    rest = rest.slice(end).trimStart()
  }
  if (rest) parts.push(rest)
  return parts
}
