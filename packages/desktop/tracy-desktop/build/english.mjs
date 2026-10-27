/**
 * The one language test release text goes through: Vietnamese letters mean the line is not the
 * English a public surface needs. A regex, not a reader — someone fluent in Vietnamese does not
 * perceive it as the wrong language (CLAUDE.md "Public surfaces are English").
 *
 * The letter class is the one `scripts/check-language.ts` uses (`VIETNAMESE`), kept the same so the
 * two gates never disagree on a line. Text is NFC-normalised first: a mark typed as a combining
 * character is the same letter.
 */
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/

/**
 * @param {string} text
 * @returns {string[]} the lines that carry a Vietnamese letter, trimmed.
 */
export function nonEnglishLines(text) {
  return text
    .normalize('NFC')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => VIETNAMESE.test(line))
}
