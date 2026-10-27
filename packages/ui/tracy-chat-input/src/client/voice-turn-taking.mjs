/**
 * Turn-taking in a voice conversation (`voice-mode.mjs`), as a person listening would do it
 * (16/10/2026: "handle it like the behaviour of a real consultant"):
 *
 * - "Mm-hmm", "ừ", "okay" said while Tracy talks are the person listening, not a new request: Tracy
 *   goes on, and nothing is sent ({@link isBackchannel}).
 * - "Um…" on its own is never a message ({@link isFillerOnly}).
 * - Over Tracy's voice, two words or one that asks it to stop make it stop; one sound it cannot make
 *   out does not ({@link stopsTracy}).
 * - A phrase that stops on "and…", "và…", "weil…" is not over: the person is thinking, so it waits
 *   longer before it goes ({@link soundsUnfinished}); a question is answered sooner
 *   ({@link endsAsQuestion}).
 *
 * The words are the eight interface languages' (`@tracy/core/interface-languages`): en, vi, de, it,
 * fr, nl, zh, es — one list of each kind per language, all of them read, since the language heard
 * may not be the interface's; a word shared by two languages costs at most a slower send, never a
 * lost request, because only a phrase made of nothing else counts. Written as regular expressions,
 * as `@tracy/core/language` writes its Vietnamese letters: they are data to match, not text shown.
 *
 * Kept free of React so `test/voice-turn-taking.test.mjs` can hold it.
 */

/** Hesitation sounds: never a request on their own ("em" is left out: a Vietnamese word). */
const FILLERS = [
  /^(?:uh|uhh|um|umm|uhm|hmm|hm|mm|mmm|er|erm|ah|eh|oh)$/u, // en
  /^(?:ừm|ừmm|ờm|ờ|à|ơ|hừm|ầm|ưm)$/u, // vi
  /^(?:äh|ähm|öh|öhm)$/u, // de
  /^(?:euh|heu|bah|ben|hein)$/u, // fr
  /^(?:ehm|mah)$/u, // it
  /^(?:ehh)$/u, // es, nl
  /^(?:嗯|呃|额|啊|唔)$/u, // zh
  // Laughter, in any language: "haha", "hihi", "hì", "kkk", "jaja", "哈哈" — never a request.
  /^(?:(?:ha|he|hi|ho|há|hé|hí|hì|khà){2,}|hì|k{3,}|(?:ja|je){2,}|lol|mdr|哈{2,}|呵{2,}|嘿{2,})$/u
]

/**
 * A sound the speech service writes as a tag, not words: "(laughs)", "[music]", "(tiếng cười)". Taken
 * out of what is heard before anything else reads it.
 */
const SOUND_TAG = /\([^)]{0,40}\)|\[[^\]]{0,40}\]|（[^）]{0,40}）/gu

/**
 * What the person said, without the sound tags the service may write ("(laughs)", "[music]").
 * @param {string} text
 */
export function withoutSoundTags(text) {
  return String(text).replace(SOUND_TAG, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Hesitation and humming as a speech service spells it out, drawn long or short: "uuuh" (heard on
 * the stand 16/10/2026 for a Vietnamese "ừ ừ"), "hmmm", "ừm", "ờm", "ähm", "euh". Not "ừ", which says
 * yes (an answer to a question card), nor "ạ", which ends a polite Vietnamese sentence, nor "ô", a word.
 */
const HUM = /^h?(?:u+h*|u+m+|ư+m*|ừ+m+|ờ+m*|ơ+|ồ+|o+h+|à+|a+h+|e+h+|ä+h*m*|ö+h*m*|eu+h*|m+(?:h?m+)*)$/u

/** Words that say "I am listening" or "agreed", alone or together ("dạ vâng", "okay okay"). */
const ACKS = [
  /^(?:ok|okay|okey|k|yes|yeah|yep|yup|sure|right|alright|mhm|mm-hmm|mmhmm|uh-huh|uhhuh|cool|great|fine|gotcha|exactly|perfect)$/u, // en
  /^(?:ừ+|ừa|ờ|vâng|dạ|oke|okê|ô-kê|được|rồi|đúng|ừ-ừ|ok-ok)$/u, // vi
  /^(?:ja|jaja|genau|gut|stimmt|klar|aha|achso|richtig|prima|super)$/u, // de
  /^(?:oui|ouais|d'accord|daccord|voilà|bien|entendu|parfait|exact)$/u, // fr
  /^(?:sì|si|certo|giusto|capito|esatto|perfetto|bene)$/u, // it
  /^(?:sí|vale|claro|entiendo|ajá|aja|perfecto|exacto)$/u, // es
  /^(?:oké|goed|precies|klopt|top|juist)$/u, // nl
  /^(?:好|好的|对|对对|对的|是|是的|嗯嗯|行|明白|明白了|知道了|可以|没问题|哦|噢)$/u // zh
]

/** Several words that say the same, read as one ("got it", "đúng rồi", "va bene"). */
const ACK_PHRASES = [
  /(?<= )(?:got it|i see|all right|sounds good|makes sense|of course|go on|go ahead)(?= )/gu, // en
  /(?<= )(?:đúng rồi|hiểu rồi|ra vậy|vậy à|thế à|được rồi|ok rồi)(?= )/gu, // vi
  /(?<= )(?:alles klar|ach so|na klar)(?= )/gu, // de
  /(?<= )(?:je vois|très bien|bien sûr)(?= )/gu, // fr
  /(?<= )(?:va bene|ho capito)(?= )/gu, // it
  /(?<= )(?:de acuerdo|ya veo|está bien)(?= )/gu, // es
  /(?<= )(?:ik snap het|oké dan)(?= )/gu // nl
]

/**
 * Words that only soften an acknowledgement ("dạ vâng ạ", "ok em", "ok nhé"): allowed beside one,
 * never one on their own.
 */
const SOFTENERS = /^(?:ạ|nhé|nha|nhá|em|anh|chị|bạn|thôi|ha)$/u

/** One word that is enough to stop Tracy talking: the person asks it to stop or wait. */
const STOP_WORDS = [
  /^(?:stop|wait|hold|sorry|no)$/u, // en
  /^(?:dừng|khoan|đợi|chờ|thôi|không|ơi)$/u, // vi
  /^(?:halt|stopp|warte|moment|nein)$/u, // de
  /^(?:attends|arrête|arrêtez|non)$/u, // fr
  /^(?:aspetta|ferma|basta)$/u, // it
  /^(?:espera|para|alto)$/u, // es
  /^(?:wacht|nee)$/u, // nl
  /(?:停|等等|等一下|别说了|不对|不是)/u // zh, inside a run of characters
]

/**
 * Words that, said on their own, ask the work itself to stop, not only Tracy's talking
 * (`isStopCommand`). "Khoan", "đợi đã", "wait" are among them (council 17/10/2026, twice: a shop owner
 * says "khoan" to stop a change, not only a voice); said with more ("khoan đã, để màu đỏ") they are a
 * correction, steered into the work.
 */
const STOP_WORK = [
  /^(?:stop|halt|cancel|wait|hold)$/u, // en
  /^(?:dừng|huỷ|hủy|khoan|đợi|chờ)$/u, // vi
  /^(?:stopp|abbrechen|warte|moment)$/u, // de
  /^(?:arrête|arrêtez|annule|annulez|attends|attendez)$/u, // fr
  /^(?:ferma|fermati|annulla|aspetta)$/u, // it
  /^(?:para|detente|detén|cancela|espera)$/u, // es
  /^(?:stoppen|annuleer|wacht)$/u, // nl
  /^(?:停|停下|停止|停下来|别做了|取消|等等|等一下)(?:吧|了|一下)*$/u // zh, a run of characters
]

/** Words beside a stop that leave it a stop ("dừng lại đi", "stop it now", "please stop"). */
const STOP_FILL =
  /^(?:lại|đi|ngay|luôn|đã|chút|việc|it|now|please|right|that|on|a|second|minute|tracy|sofort|bitte|mal|tout|de|suite|subito|un|attimo|ya|ahora|momento|nu|even|alsjeblieft|maintenant)$/u

/** Last words of a phrase that is not over yet: the sentence goes on after them. */
const TRAILING = [
  /^(?:and|but|or|because|the|a|an|to|of|with|for|if|my|your|our)$/u, // en
  /^(?:và|với|nhưng|mà|thì|là|hoặc|hay|của|cho|để|nếu|khi|vì|tại|kiểu|còn|những|các|cái)$/u, // vi
  /^(?:und|aber|oder|weil|dass|der|die|das|den|dem|ein|eine|mit|für|wenn)$/u, // de
  /^(?:et|mais|ou|parce|que|qui|le|les|un|une|des|du|avec|pour|donc)$/u, // fr
  /^(?:e|ma|o|perché|che|il|lo|gli|di|con|per|se|quindi)$/u, // it
  /^(?:y|pero|porque|el|los|las|una|de|para|entonces)$/u, // es
  /^(?:en|maar|of|omdat|dat|het|een|met|voor|als|dus)$/u, // nl
  /(?:和|但是|然后|因为|所以|那个|就是|还有|或者|的|跟|而且)$/u // zh, the end of a run of characters
]

/** Punctuation the speech service writes, turned into spaces (an apostrophe inside a word stays). */
const PUNCTUATION = /[.,!?;:…。，！？、；：“”"«»()[\]{}–—]+/gu

/** @param {readonly RegExp[]} lists @param {string} word */
const inAny = (lists, word) => lists.some((list) => list.test(word))

/** Typographic apostrophes, written as the plain one ("j’approuve", "s’il"). */
const APOSTROPHES = /[’‘ʼ]/gu

/**
 * Lower case, one way of writing each letter (NFC) and each apostrophe, no punctuation, single spaces:
 * the words as compared here. @param {string} text
 */
function normal(text) {
  return String(text)
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text @returns {string[]} */
const wordsOf = (text) => {
  const plain = normal(text)
  return plain === '' ? [] : plain.split(' ')
}

/** @param {string} word */
const isFiller = (word) => inAny(FILLERS, word) || HUM.test(word)

/**
 * Chinese "yes" said again and again as one run of characters ("对对对", "好好好", "是的是的", "嗯嗯嗯"):
 * the same listening as one, never two words to stop Tracy (council 18/10/2026: by the whole phrase,
 * as "ừ ừ" and "ok ok" already are).
 */
const ZH_ACK_RUN = /^(?:好的|对的|是的|没问题|知道了|明白了|明白|可以|对|好|是|行|嗯|哦|噢)+$/u

/** @param {string} word */
const isAck = (word) => word === '✓' || inAny(ACKS, word) || ZH_ACK_RUN.test(word)

/** The words of a phrase, its acknowledgements of several words each read as one ("✓"). @param {string} text */
function listened(text) {
  let plain = ` ${normal(text)} `
  for (const phrase of ACK_PHRASES) plain = plain.replace(phrase, '✓')
  const words = plain.trim()
  return words === '' ? [] : words.split(/\s+/)
}

/**
 * Only hesitation: "um", "ừm…", "呃". Such a phrase is never sent.
 * @param {string} text
 */
export function isFillerOnly(text) {
  const words = wordsOf(text)
  return words.length > 0 && words.every(isFiller)
}

/**
 * The person listening, not asking: only acknowledgements and hesitation ("mm-hmm", "dạ vâng ạ",
 * "okay okay", "ja genau", "好的"). Said over Tracy, it lets Tracy go on.
 * @param {string} text
 */
export function isBackchannel(text) {
  let heard = false
  for (const word of listened(text)) {
    if (isAck(word) || isFiller(word)) heard = true
    else if (!SOFTENERS.test(word)) return false
  }
  return heard
}

/**
 * Words over Tracy's voice that make it stop, as a person talking stops for someone who speaks up:
 * two words or more besides listening sounds, or one that asks it to stop ("khoan", "wait", "停").
 * One sound it cannot make out is not enough, nor a lone letter or number: on the stand (16/10/2026)
 * the speech service wrote a hummed "ừ ừ" as "Dzuiii." and an "ừ" as "Du. 2.". Tracy goes on, as
 * voice agents do with a minimum of words to interrupt.
 * @param {string} text
 */
export function stopsTracy(text) {
  const heard = listened(text)
  // A softener only softens a "yes" ("ok thôi", "dạ vâng ạ"): said alone or again ("thôi",
  // "thôi thôi"), "thôi" is the person asking Tracy to stop (it never stopped it, filtered out first).
  const beside = heard.some(isAck)
  const words = heard.filter((word) => !isAck(word) && !isFiller(word) && !(beside && SOFTENERS.test(word)))
  if (words.some((word) => inAny(STOP_WORDS, word))) return true
  // Chinese runs its words together: a run of three characters or more is words enough.
  const count = words.reduce(
    (n, word) =>
      n + (/^\p{Script=Han}{3,}$/u.test(word) ? 2 : (word.match(/\p{L}/gu)?.length ?? 0) >= 2 ? 1 : 0),
    0
  )
  return count >= 2
}

/**
 * The person asks the work itself to stop: "dừng lại", "stop", "khoan đã", "wait a second", "停下来" —
 * the stop word and only words that leave it a stop. With anything more it is a request.
 * @param {string} text
 */
export function isStopCommand(text) {
  let stop = false
  for (const word of listened(text)) {
    if (inAny(STOP_WORK, word)) stop = true
    else if (!STOP_FILL.test(word) && !SOFTENERS.test(word) && !isFiller(word)) return false
  }
  return stop
}

/**
 * The phrase stops where the sentence goes on: on "and", "và", "weil", on a comma or a dash, or on
 * hesitation — even when the service put a full stop after it. The person is thinking; it waits.
 * @param {string} text
 */
export function soundsUnfinished(text) {
  const raw = String(text).normalize('NFC').trim()
  if (raw === '' || /[?!？！]$/u.test(raw)) return false
  if (/(?:,|，|、|…|\.\.\.|-|–|—)$/u.test(raw)) return true
  const last = wordsOf(raw).at(-1)
  return last !== undefined && (inAny(TRAILING, last) || isFiller(last))
}

/**
 * The person asked something ("…được không?", "¿…?", "…吗？"): Tracy answers sooner.
 * @param {string} text
 */
export function endsAsQuestion(text) {
  return /[?？]\s*$/u.test(String(text))
}

/**
 * ENDING VOICE BY VOICE (council 19/10/2026): a whole phrase that asks to leave Voice, or says goodbye,
 * takes the person back to the chat — never a partial, never words inside a longer sentence
 * ("đổi chữ tạm biệt thành xin chào" is a request). Each list is the phrase alone, words one space apart;
 * the words in {@link AROUND} may stand before or after it ("tắt voice đi", "bye Tracy", "ok tạm biệt").
 * Formal and informal forms both (council 20/10/2026, D4: "schalten Sie den Sprachmodus aus",
 * "spegni la modalità vocale", "schakel de spraakmodus uit"): a way out costs little when heard wrong.
 */
const VOICE_OFF = [
  /^(?:(?:turn|switch) off (?:the )?voice(?: mode)?|(?:turn|switch) (?:the )?voice(?: mode)? off|(?:exit|stop|end|leave|close|quit) (?:the )?voice mode|(?:exit|leave|quit) voice|voice mode off)$/u, // en
  /^(?:(?:tắt|thoát) (?:chế độ )?(?:voice|giọng nói)|(?:thoát|ra) khỏi (?:chế độ )?(?:voice|giọng nói))$/u, // vi
  /^(?:(?:den )?(?:sprachmodus|voice modus) (?:beenden|ausschalten|ausmachen|aus|verlassen)|(?:beende|beenden sie|verlasse|verlassen sie) (?:den )?(?:sprachmodus|voice modus)|(?:schalte?|schalten sie|mach|machen sie) (?:den )?(?:sprachmodus|voice modus) aus|voice (?:ausschalten|beenden))$/u, // de
  /^(?:(?:désactive[rz]?|quitte[rz]?|arrête[rz]?|ferme[rz]?|éteins|éteignez|éteindre) (?:le )?mode vocal|(?:sors|sortez|sortir) du mode vocal)$/u, // fr
  /^(?:(?:disattiva(?:re)?|spegn(?:i|ere)|chiud(?:i|ere)|termina(?:re)?) (?:la )?modalità vocale|esci(?:re)? dalla modalità vocale)$/u, // it
  /^(?:(?:desactiva(?:r)?|apaga(?:r)?|cierra|cerrar|termina(?:r)?) el modo (?:de )?voz|sal(?:ir)? del modo (?:de )?voz)$/u, // es
  /^(?:(?:zet )?(?:de )?spraakmodus (?:uit|uitzetten|uitschakelen|afsluiten|stoppen)|(?:stop|sluit|beëindig) (?:de )?spraakmodus(?: af)?|schakel (?:de )?spraakmodus uit)$/u, // nl
  /^(?:关闭|退出|关掉|结束)语音(?:模式|对话)?(?:吧|了|啦)?$/u // zh, one run of characters
]

/**
 * A goodbye said alone, kept narrow (council 20/10/2026, D4), and never while a question card waits
 * (`voice-mode.mjs`). Not "ciao": Italians say it on arriving too, and it ends many an Italian
 * sentence that is no farewell.
 */
const GOODBYES = [
  /^(?:goodbye|good bye|bye|bye bye)$/u, // en
  /^(?:chào )?tạm biệt$/u, // vi
  /^(?:tschüss|tschüs|auf wiedersehen)$/u, // de
  /^au revoir$/u, // fr
  /^arrivederci$/u, // it
  /^(?:adiós|adios)$/u, // es
  /^tot ziens$/u, // nl
  /^(?:再见|拜拜)(?:了|啦)?$/u // zh
]

/**
 * What may stand around a way out of Voice without making it a request: the name, a softener, thanks
 * — one word or a set phrase ("cảm ơn", "s'il te plaît", "per favore"), taken off the two edges only
 * ({@link edges}), never from inside.
 */
const AROUND =
  /^(?:tracy|ok|okay|ạ|nhé|nha|nhá|đi|thôi|em|anh|chị|bạn|cảm ơn|please|thanks|thank you|bitte|danke|merci|s'il (?:te|vous) plaît|grazie|per favore|gracias|por favor|alsjeblieft|bedankt|谢谢)$/u

/** The longest set phrase an edge list holds, in words ("s'il vous plaît"). */
const EDGE_WORDS = 3

/**
 * The phrase without what may stand at its two edges (`around`), or '' when nothing else is said: a
 * word or set phrase is taken off the start or the end again and again, never out of the middle
 * ("turn off tracy voice" keeps its "tracy", and is no way out). A dash is a space ("bye-bye").
 * @param {string} text
 * @param {RegExp} around - one word or set phrase, whole
 */
function edges(text, around) {
  const words = wordsOf(String(text).replace(/-/g, ' '))
  let from = 0
  let to = words.length
  /** @param {number} at @param {number} n */
  const is = (at, n) => around.test(words.slice(at, at + n).join(' '))
  for (let moved = true; moved; ) {
    moved = false
    for (let n = Math.min(EDGE_WORDS, to - from); n > 0 && !moved; n -= 1)
      if (is(from, n)) {
        from += n
        moved = true
      }
  }
  for (let moved = true; moved; ) {
    moved = false
    for (let n = Math.min(EDGE_WORDS, to - from); n > 0 && !moved; n -= 1)
      if (is(to - n, n)) {
        to -= n
        moved = true
      }
  }
  return words.slice(from, to).join(' ')
}

/** The phrase as the ways out of Voice read it ({@link edges}, {@link AROUND}). @param {string} text */
const core = (text) => edges(text, AROUND)

/**
 * The whole phrase asks to leave Voice: "tắt Voice", "turn off voice mode", "关闭语音模式",
 * "désactiver le mode vocal" — in any of the eight languages, whatever the interface's is. Said while a question card
 * waits, it still counts: it cannot be the card's answer.
 * @param {string} text - a FINISHED phrase, all of what was heard
 */
export function isVoiceOff(text) {
  const said = core(text)
  return said !== '' && inAny(VOICE_OFF, said)
}

/**
 * The whole phrase is a goodbye: "tạm biệt", "bye", "再见", "tschüss", "au revoir". Not while a question
 * card waits: there it may be the answer.
 * @param {string} text - a FINISHED phrase, all of what was heard
 */
export function isGoodbye(text) {
  const said = core(text)
  return said !== '' && inAny(GOODBYES, said)
}

/**
 * A SPOKEN YES OR NO TO TRACY'S OWN CONFIRMATION CARD (council 20/10/2026, D5.1; `voice-answer.mjs`
 * `spokenAnswer`): on the stand (20/10/2026) "Đồng ý." to a `confirm-…` card offering "Yes, go
 * ahead" / "No, keep it" named neither choice, and the agent opened a card of its own. The whole
 * finished phrase, in any of the eight languages, is a clear yes or a clear no — or parts the service
 * set apart with a comma or a stop, every one of the same kind ("Vâng, đồng ý.", "No, keep it.",
 * "不，保留。"). Only explicit words: never "ừ", "uh", "ok" or "好的" alone, which are listening as often
 * as agreeing; never a yes beside a no; a negation or a condition is never taken off to make it fit
 * ("không đồng ý" is a no; "don't keep it", "không giữ lại", "if so, yes" are neither). Never read for
 * a plan: that keeps its own phrases ({@link isPlanApproval}). A cancel word ("huỷ", "cancel", "取消")
 * is a no here, as a press on "Huỷ" is (council 18/10/2026, #1430): said to such a card it keeps
 * things as they are, and never stops the whole turn (`voice-mode.mjs`).
 */
const CONFIRM_YES = [
  /^(?:yes|yeah|yep|sure|go ahead|do it|i'm sure|i am sure|i confirm|confirm|confirmed|i agree|agreed|yes (?:go ahead|do it|i'm sure|i am sure|sure|confirm|i confirm))$/u, // en
  /^(?:có|vâng|được|đồng ý|(?:tôi|mình|em|anh|chị) đồng ý|(?:cứ )?làm đi|tiếp tục(?: đi)?|chắc chắn(?: rồi)?|(?:có|vâng) (?:đồng ý|làm đi|tiếp tục(?: đi)?))$/u, // vi
  /^(?:ja|jawohl|genau|klar|sicher|mach (?:das|weiter|es)|machen sie (?:das|weiter)|einverstanden|ich bin einverstanden|ich stimme zu|bestätigt|ich bestätige|ja (?:genau|klar|sicher|mach (?:das|weiter|es)|einverstanden|ich bestätige))$/u, // de
  /^(?:oui|vas y|allez y|je confirme|confirmé|d'accord|je suis d'accord|j'accepte|bien sûr|oui (?:vas y|allez y|je confirme|d'accord|bien sûr))$/u, // fr
  /^(?:sì|si|procedi|proceda|vai|confermo|confermato|d'accordo|sono d'accordo|certo|(?:sì|si) (?:procedi|proceda|vai|confermo|certo|d'accordo))$/u, // it
  /^(?:sí|si|adelante|hazlo|confirmo|confirmado|de acuerdo|estoy de acuerdo|claro|claro que sí|(?:sí|si) (?:adelante|hazlo|confirmo|claro|de acuerdo))$/u, // es
  /^(?:ja|doe maar|ga je gang|ga door|akkoord|ik ga akkoord|bevestigd|ik bevestig|ja (?:graag|hoor|doe maar|ga door|akkoord))$/u, // nl
  /^(?:是|是的|对|对的|要|要的|确定|确认|同意|我同意|继续|可以)(?:吧|啊|呀)?$/u // zh, one run of characters
]

const CONFIRM_NO = [
  /^(?:no|nope|keep it|don't|do not|don't do it|do not do it|leave it|not now|no way|cancel|cancel it|no (?:keep it|don't|do not|leave it|not now|cancel))$/u, // en
  /^(?:không|không được|không đồng ý|(?:tôi|mình|em|anh|chị) không đồng ý|không cần|đừng|đừng làm|giữ lại|giữ nguyên|thôi khỏi|thôi đừng|khỏi|huỷ|hủy|huỷ bỏ|hủy bỏ)$/u, // vi
  /^(?:nein|nicht|lieber nicht|nicht machen|mach das nicht|behalten|behalte (?:es|das)|auf keinen fall|abbrechen|abbruch|nein (?:lieber nicht|nicht|behalten|behalte (?:es|das)|abbrechen))$/u, // de
  /^(?:non|garde le|gardez le|surtout pas|pas question|ne le fais pas|ne fais rien|annuler|annule|annulez|non (?:garde le|gardez le|surtout pas|pas question|annule|annulez))$/u, // fr
  /^(?:no|lascia stare|lascia perdere|tienilo|non farlo|assolutamente no|annulla|annullare|no (?:lascia stare|lascia perdere|tienilo|non farlo|annulla))$/u, // it
  /^(?:no|no lo hagas|déjalo|déjalo así|mantenlo|de ninguna manera|cancelar|cancela|cancélalo|no (?:déjalo|mantenlo|cancela))$/u, // es
  /^(?:nee|niet doen|laat maar|liever niet|houd het|hou het|behouden|annuleer|annuleren|nee (?:niet doen|laat maar|liever niet|houd het|hou het|annuleer))$/u, // nl
  /^(?:不|不要|不用|不是|不行|不了|别|保留|算了|不同意|我不同意|取消)(?:吧|啊|了)?$/u // zh, one run of characters
]

/**
 * What may stand around a yes or a no: the name, a polite word, thanks ("dạ có ạ", "no thanks") — not
 * "thôi", which turns "ok thôi" into a yes and stands for a no alone.
 */
const CONFIRM_AROUND =
  /^(?:tracy|ok|okay|ạ|nhé|nha|nhá|dạ|please|thanks|thank you|bitte|danke|merci|s'il (?:te|vous) plaît|grazie|per favore|gracias|por favor|alsjeblieft|bedankt|dank je|dank u|谢谢)$/u

/**
 * Nothing but what may stand around a yes or a no ({@link CONFIRM_AROUND}): "", "please", "dạ … ạ".
 * @param {string} text
 */
export const isPoliteOnly = (text) =>
  withoutSoundTags(text)
    .split(CLAUSES)
    .every((part) => edges(part, CONFIRM_AROUND) === '')

/** Where the service set a phrase's parts apart: a comma or a stop, in either script. */
const CLAUSES = /[,.;:!…，。；：！、]+/u

/** The most words a yes or a no is read in: past that it is a request, not an answer. */
const CONFIRM_WORDS = 6

/**
 * The whole finished phrase is a clear yes or a clear no ({@link CONFIRM_YES}, {@link CONFIRM_NO}),
 * or null — then it is neither, and nothing may be made of it. For Tracy's `confirm-…` cards only.
 * @param {string} text - a FINISHED phrase, all of what was heard
 * @returns {'yes' | 'no' | null}
 */
export function confirmReply(text) {
  if (endsAsQuestion(text)) return null
  /** @type {'yes' | 'no' | null} */
  let kind = null
  let count = 0
  for (const part of withoutSoundTags(text).split(CLAUSES)) {
    const said = edges(part, CONFIRM_AROUND)
    if (said === '') continue
    count += said.split(' ').length
    const each = inAny(CONFIRM_YES, said) ? 'yes' : inAny(CONFIRM_NO, said) ? 'no' : null
    if (each === null || (kind !== null && each !== kind)) return null
    kind = each
  }
  return count > CONFIRM_WORDS ? null : kind
}

/**
 * 🔒 THE LOCALES WHOSE PLAN PHRASES MAY APPROVE A PLAN BY VOICE (council 20/10/2026, D4), read beside
 * the operator's switch `voice-plan-approval` (`voice-mode.mjs` `planByVoice`). A locale is added here
 * only after a native speaker checked its phrases below — approvals, changes, and the negated,
 * conditional and quoted sentences that must not approve — AND a run through the real speech service
 * passed. Empty: no plan is approved by voice in any language; it goes to the chat, as before. The
 * interface's locale must be one of these, and only these locales' phrases are read.
 * @type {readonly string[]}
 */
export const PLAN_VOICE_LOCALES = Object.freeze([])

/**
 * APPROVING A PLAN BY VOICE (council 19/10/2026, A6; `voice-mode.mjs`): only a whole finished phrase
 * that names the plan and approves it — "duyệt kế hoạch này", "approve this plan", "批准这个计划" — in
 * the locales verified ({@link PLAN_VOICE_LOCALES}). Never "ừ", "ok", "yes" or "được" alone, and never
 * the word inside a longer sentence ("đừng duyệt kế hoạch này", "approve this plan but make it blue"
 * are not approval: the whole phrase must be the approval). Narrowed to the clear forms (council
 * 20/10/2026, D4): a first person, an imperative or "plan approved", not the bare infinitive ("approuver
 * le plan", "den Plan genehmigen" — a cautious product choice, not a claim they are wrong); and a
 * phrase heard as a question is none. Only the name and a polite word may stand around it
 * ({@link PLAN_AROUND}): not "ok", "đi" or "thôi", which may say something else.
 */
const PLAN_APPROVALS = /** @type {Record<string, RegExp>} */ ({
  en: /^(?:(?:i )?approve (?:this|the) plan|(?:the )?plan (?:is )?approved|go ahead with (?:this|the) plan)$/u,
  vi: /^(?:(?:tôi|mình|em|anh|chị) )?(?:duyệt|phê duyệt|chấp thuận|đồng ý(?: với)?) (?:bản )?kế hoạch(?: này)?$/u,
  de: /^(?:(?:ich )?(?:genehmige|bestätige|akzeptiere) (?:den|diesen) plan|plan genehmigt)$/u,
  fr: /^(?:(?:j'approuve|je valide|approuve|approuvez|valide|validez) (?:ce|le) plan|plan approuvé)$/u,
  it: /^(?:(?:approva|approvo|approviamo) (?:questo|il) piano|piano approvato)$/u,
  es: /^(?:(?:apruebo|aprueba|aprobamos) (?:este|el) plan|plan aprobado)$/u,
  nl: /^(?:(?:ik )?keur (?:dit|het) plan goed|plan goedgekeurd)$/u,
  zh: /^(?:我)?(?:批准|同意|通过)(?:这个|该|此)?(?:计划|方案)(?:吧|了)?$/u // one run of characters
})

/**
 * The words that open a change to the plan: "sửa kế hoạch …", "change the plan …", "修改计划…". Said
 * with what to change after them, the whole phrase is the person's feedback on the plan (Keep
 * planning, the phrase as their words); said alone, or with only a joining word after them ("change
 * the plan to"), Tracy asks what to change ({@link planChange}). A verb in two parts takes its second
 * part before the feedback ("pas het plan aan …", "passe den Plan an …"), so "aan" is never the change.
 */
const PLAN_CHANGES = /** @type {Record<string, RegExp>} */ ({
  en: /^(?:please )?(?:change|edit|revise|update|modify|adjust) (?:this|the) plan(?: (.*))?$/u,
  vi: /^(?:(?:tôi|mình|em|anh|chị) )?(?:sửa|đổi|chỉnh|chỉnh sửa|thay đổi) (?:lại )?(?:bản )?kế hoạch(?: này)?(?: (.*))?$/u,
  de: /^(?:(?:ändere|ändern sie|überarbeite|bearbeite) (?:den|diesen) plan|passe (?:den|diesen) plan an|(?:den |diesen )?plan ändern)(?: (.*))?$/u,
  fr: /^(?:modifie|modifiez|change|changez|ajuste|ajustez) (?:ce|le) plan(?: (.*))?$/u,
  it: /^(?:modifica|cambia) (?:questo|il) piano(?: (.*))?$/u,
  es: /^(?:cambia|modifica|ajusta) (?:este|el) plan(?: (.*))?$/u,
  nl: /^(?:pas (?:dit|het) plan aan|(?:wijzig|verander) (?:dit|het) plan)(?: (.*))?$/u,
  zh: /^(?:修改|更改|改一下|调整|改)(?:一下)?(?:这个|该)?(?:计划|方案)\s*(.*)$/u
})

/** Joining words only, after the words that open a change: no change said yet ("change the plan to"). */
const PLAN_JOINERS =
  /^(?:(?:to|so|so that|and|with|by|that|là|thành|để|cho|rằng|so dass|damit|und|mit|dass|pour|pour que|et|avec|que|per|perché|e|con|che|para|para que|y|zodat|en|met|dat|om|把|让|成)\s*)+$/u

/** What may stand around a plan's approval or change: the name, a polite word ({@link isPlanApproval}). */
const PLAN_AROUND =
  /^(?:tracy|ạ|nhé|please|bitte|s'il (?:te|vous) plaît|per favore|por favor|alsjeblieft|请)$/u

/**
 * The phrase as the plan matchers read it ({@link edges}, {@link PLAN_AROUND}). @param {string} text
 */
const planWords = (text) => edges(text, PLAN_AROUND)

/**
 * The lists of the locales given, those known. @param {Record<string, RegExp>} lists
 * @param {readonly string[]} locales
 */
const listsOf = (lists, locales) =>
  locales.flatMap((locale) => (Object.hasOwn(lists, locale) ? [/** @type {RegExp} */ (lists[locale])] : []))

/** The eight interface languages, every list: what the words say, before any locale is verified. */
export const PLAN_LOCALES = Object.freeze(Object.keys(PLAN_APPROVALS))

/**
 * The whole phrase approves the plan being reviewed, in one of the locales given.
 * @param {string} text - a FINISHED phrase, all of what was heard
 * @param {readonly string[]} [locales] - whose phrases are read; every list when left out (the words
 *   alone — `voice-mode.mjs` passes the locales verified)
 */
export function isPlanApproval(text, locales = PLAN_LOCALES) {
  if (endsAsQuestion(text)) return false
  const said = planWords(text)
  return said !== '' && inAny(listsOf(PLAN_APPROVALS, locales), said)
}

/**
 * What the phrase says of the plan, as a change: `'feedback'` — a change and what to change, the
 * person's feedback; `'what'` — a change and nothing else ("sửa kế hoạch", "change the plan to"):
 * Tracy keeps planning and asks what to change, never taking an empty change for one; null — no
 * change, or an approval.
 * @param {string} text - a FINISHED phrase, all of what was heard
 * @param {readonly string[]} [locales] - as {@link isPlanApproval}
 * @returns {'feedback' | 'what' | null}
 */
export function planChange(text, locales = PLAN_LOCALES) {
  const said = planWords(text)
  if (said === '' || isPlanApproval(text, locales)) return null
  let lead = false
  for (const list of listsOf(PLAN_CHANGES, locales)) {
    const found = list.exec(said)
    if (found === null) continue
    lead = true
    const rest = (found[1] ?? '').trim()
    if (rest !== '' && !PLAN_JOINERS.test(rest)) return 'feedback'
  }
  return lead ? 'what' : null
}

/**
 * The phrase asks for a change to the plan and says what: the person's feedback, never an approval.
 * @param {string} text - a FINISHED phrase, all of what was heard
 * @param {readonly string[]} [locales] - as {@link isPlanApproval}
 */
export function asksPlanChange(text, locales = PLAN_LOCALES) {
  return planChange(text, locales) === 'feedback'
}
