/**
 * WHAT A CONFIRM CARD SAYS, READ BY ITS MEANING (council 20/10/2026, D5.2 of the live run). The agent
 * puts the door's question in the person's language, so the door cannot hold the words — dsh's
 * `tools/pre-execute` can allow or deny a card, not rewrite it. What the door CAN hold is the meaning:
 * the first option says yes, the second says no, and a delete is called a delete, a hide a hide. A
 * card that swaps the buttons, or asks "hide it?" for a call that deletes, is refused before the
 * person sees it (`call-memory.mjs` `confirmCardRefusal`).
 *
 * 🔒 THE WORDS ARE PATTERNS, NOT SENTENCES. Each language's words stand in regex literals, as
 * `voice-turn-taking.mjs` keeps them (gate `language` reads them as patterns). A language with no row
 * here is not checked: an unknown language never refuses a card.
 *
 * Kept pure so `test/confirm-words.test.mjs` holds every row.
 */

/** How a yes button starts, per language ("Yes, go ahead" in English). */
const YES = Object.freeze({
  English: /^(?:yes|ok(?:ay)?|go ahead|sure|confirm|do it|delete|hide|remove)(?![\p{L}\p{N}])/iu,
  Vietnamese: /^(?:có|đồng ý|vâng|dạ|được|ok|xác nhận|xoá|xóa|ẩn|gỡ|làm đi|tiếp tục)/iu,
  German: /^(?:ja|ok|bestätigen|weiter|löschen|ausblenden|entfernen|einverstanden)(?![\p{L}\p{N}])/iu,
  French: /^(?:oui|ok|d'accord|confirmer|continuer|supprimer|masquer|retirer|vas-y|allez-y)/iu,
  Italian: /^(?:sì|si|ok|conferma|procedi|elimina|nascondi|rimuovi|va bene)(?![\p{L}\p{N}])/iu,
  Spanish: /^(?:sí|si|ok|confirmar|adelante|eliminar|borrar|ocultar|quitar|de acuerdo)(?![\p{L}\p{N}])/iu,
  Dutch: /^(?:ja|ok|bevestig|doorgaan|verwijder|verberg|akkoord|ga door)(?![\p{L}\p{N}])/iu,
  Chinese: /^(?:是|好|确定|确认|同意|继续|删除|隐藏|可以)/u
})

/** How a no button starts, per language ("No, keep it" in English). */
const NO = Object.freeze({
  English: /^(?:no|cancel|keep|don't|do not|stop)(?![\p{L}\p{N}])/iu,
  Vietnamese: /^(?:không|thôi|giữ|huỷ|hủy|đừng)/iu,
  German: /^(?:nein|abbrechen|behalten|nicht)(?![\p{L}\p{N}])/iu,
  French: /^(?:non|annuler|garder|conserver|ne pas)(?![\p{L}\p{N}])/iu,
  Italian: /^(?:no|annulla|mantieni|tieni|non)(?![\p{L}\p{N}])/iu,
  Spanish: /^(?:no|cancelar|mantener|conservar)(?![\p{L}\p{N}])/iu,
  Dutch: /^(?:nee|annuleer|behoud|houd|niet)(?![\p{L}\p{N}])/iu,
  Chinese: /^(?:不|否|取消|保留|别)/u
})

/** A word that deletes, in the question: the card of a delete must say so. */
const DELETES = Object.freeze({
  English: /(?<![\p{L}\p{N}])(?:delete[sd]?|deleting|remove[sd]?|erase[sd]?|trash)(?![\p{L}\p{N}])/iu,
  Vietnamese: /(?:xoá|xóa|thùng rác)/iu,
  German: /(?:lösch|entfern|papierkorb)/iu,
  French: /(?:supprim|effac|corbeille)/iu,
  Italian: /(?:elimin|cancell|cestino)/iu,
  Spanish: /(?:elimin|borr|papelera)/iu,
  Dutch: /(?:verwijder|prullenbak)/iu,
  Chinese: /(?:删除|删掉|移除|回收站)/u
})

/** A word that hides, in the question: the card of a hide says the record leaves the pages. */
const HIDES = Object.freeze({
  English:
    /(?<![\p{L}\p{N}])(?:hide[sd]?|hiding|unpublish(?:e[sd])?|off (?:your|the) (?:site|pages?)|draft|private)(?![\p{L}\p{N}])/iu,
  Vietnamese: /(?:ẩn|gỡ|nháp|ngừng hiển thị|không (?:còn )?hiển thị|khỏi trang)/iu,
  German: /(?:ausblend|verberg|versteck|entwurf|unveröffentlich|depublizier)/iu,
  French: /(?:masqu|cach|brouillon|dépubli)/iu,
  Italian: /(?:nascond|bozza|non pubblic|ritir)/iu,
  Spanish: /(?:ocult|borrador|despublic|retir)/iu,
  Dutch: /(?:verberg|concept|depubliceer|offline)/iu,
  Chinese: /(?:隐藏|下线|草稿|取消发布)/u
})

/**
 * Why a card in `language` does not say what the door asks, or null when it does (or the language is
 * not one these rows read). `intent`: what the refused call does to the site — `delete` or `hide`; any
 * other is checked for its buttons only.
 * @param {{ question?: unknown, header?: unknown, options?: unknown }} q - one question of the card
 * @param {string} language - a language name (`languageName`), e.g. "Vietnamese"
 * @param {'delete' | 'hide' | null} intent
 * @returns {string | null}
 */
export function cardMeaningProblem(q, language, intent) {
  if (!Object.hasOwn(YES, language)) return null
  const lang = /** @type {keyof typeof YES} */ (language)
  const labels = Array.isArray(q?.options)
    ? q.options.map((/** @type {any} */ o) =>
        String(o?.label ?? '')
          .normalize('NFC')
          .trim()
      )
    : []
  if (labels.length < 2)
    return 'it needs two options: the go-ahead first, then the one that keeps things as they are'
  if (!YES[lang].test(labels[0]) || NO[lang].test(labels[0]))
    return `its first option must say yes (go ahead), in ${language}`
  if (!NO[lang].test(labels[1])) return `its second option must say no (keep it as it is), in ${language}`
  const said = `${String(q?.header ?? '')} ${String(q?.question ?? '')}`.normalize('NFC')
  if (intent === 'delete' && !DELETES[lang].test(said))
    return `the call deletes, and the question must say so (delete), in ${language}`
  if (intent === 'hide' && (!HIDES[lang].test(said) || DELETES[lang].test(said)))
    return `the call takes the record off the pages without deleting it, and the question must say that (hide), not delete, in ${language}`
  return null
}
