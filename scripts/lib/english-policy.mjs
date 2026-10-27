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
