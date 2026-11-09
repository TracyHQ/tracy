/** Deterministic English prose checks. ASCII alone is not proof of English; review still matters. */
const FOREIGN_LETTER = /(?![a-zA-Z])\p{L}|\p{M}/u

// High-confidence phrases, not individual words that may also be English identifiers or names.
const FOREIGN_PHRASES =
  /\b(?:dang\x20nhap|dang\x20xuat|nguoi\x20dung|cau\x20hinh|kiem\x20tra|sua\x20loi|cap\x20nhat|tieng\x20viet|xin\x20chao|thanh\x20cong|khong\x20the|hola\x20mundo|por\x20favor|iniciar\x20sesion|cerrar\x20sesion|bonjour\x20le\x20monde|s\x20il\x20vous\x20plait)\b/i

export function englishProblem(text) {
  const normalized = text.normalize('NFC')
  const letters = normalized
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0E\uFE0F\u{E0100}-\u{E01EF}]/gu, '')
    .replace(/[0-9#*]\u20E3/gu, '')
  if (FOREIGN_LETTER.test(letters)) return 'non-English letters in contributor-facing text'
  // Separators also cover prose accidentally used as a filename or identifier.
  if (FOREIGN_PHRASES.test(normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')))
    return 'recognizable non-English phrase; write English'
  return null
}

// Vietnamese-only letters: the tone block of Latin Extended Additional plus the letters it lacks.
// Combining tone marks that survive NFC (no precomposed form) are caught too.
const VIETNAMESE_LETTER = /[\u1ea0-\u1ef9\u0102\u0103\u0110\u0111\u01a0\u01a1\u01af\u01b0]/u
const VIETNAMESE_TONE_MARK = /\u0300|\u0301|\u0303|\u0309|\u0323/u

/**
 * For verbatim third-party captures (accented demo place names, for example): only
 * Vietnamese is refused, so no team-written Vietnamese can hide inside captured data.
 */
export function vietnameseProblem(text) {
  const normalized = text.normalize('NFC')
  if (VIETNAMESE_LETTER.test(normalized) || VIETNAMESE_TONE_MARK.test(normalized))
    return 'Vietnamese text in captured content'
  return null
}
