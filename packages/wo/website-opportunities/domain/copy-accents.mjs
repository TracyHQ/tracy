// Accented letters in the copy guard's word lists and patterns (French, Spanish, Italian, Portuguese). The language
// gate reads the text of every string and flags the letters Vietnamese shares with those languages, so in source they
// are written as a marker of two backslashes, `u` and four hex digits, and decoded here. Pure.

const MARKER = /\\\\u([0-9a-f]{4})/gi

/** `text` with every accent marker replaced by its letter. */
export const accented = (text) =>
  text.replace(MARKER, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))

/** `String.raw` that also decodes the accent markers: a drop-in tag for a regex source with accented letters. */
export const rawAccented = (strings, ...values) => accented(String.raw(strings, ...values))
