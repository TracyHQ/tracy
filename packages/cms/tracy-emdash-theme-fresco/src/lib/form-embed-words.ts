// The Forms plugin (`@emdash-cms/plugin-forms`, FormEmbed.astro) prints three words of its own in
// English on every locale: the honeypot's label "Leave blank", and "Previous" / "Next" when a form
// sets no step labels. The plugin is an npm package, so a template renders it through
// `src/components/site/FormWords.astro`, which swaps those three fallbacks for the page language's
// words below (TCH #1013, LANG-2). Anything the form itself sets (submit label, step labels, field
// labels) is left alone.
//
// Shared by every Tracy EmDash template: the kit ships this file and `FormWords.astro`, and
// `check-kit-sync.mjs` keeps each template's copy byte-identical. The words live here, not in a
// template's own word list, because the plugin is the same in every template.

export interface FormWords {
  leaveBlank: string
  previous: string
  next: string
}

/** By language tag: an exact tag first (`zh-tw`, `pt-pt`), then its language, then English. */
export const FORM_WORDS: Record<string, FormWords> = {
  en: { leaveBlank: 'Leave blank', previous: 'Previous', next: 'Next' },
  af: { leaveBlank: 'Laat leeg', previous: 'Vorige', next: 'Volgende' },
  be: { leaveBlank: 'Пакіньце пустым', previous: 'Назад', next: 'Далей' },
  bg: { leaveBlank: 'Оставете празно', previous: 'Назад', next: 'Напред' },
  ca: { leaveBlank: 'Deixeu-ho en blanc', previous: 'Anterior', next: 'Següent' },
  cs: { leaveBlank: 'Ponechte prázdné', previous: 'Zpět', next: 'Další' },
  cy: { leaveBlank: 'Gadewch yn wag', previous: 'Blaenorol', next: 'Nesaf' },
  da: { leaveBlank: 'Lad feltet være tomt', previous: 'Forrige', next: 'Næste' },
  de: { leaveBlank: 'Bitte leer lassen', previous: 'Zurück', next: 'Weiter' },
  el: { leaveBlank: 'Αφήστε το κενό', previous: 'Προηγούμενο', next: 'Επόμενο' },
  es: { leaveBlank: 'Déjelo en blanco', previous: 'Anterior', next: 'Siguiente' },
  et: { leaveBlank: 'Jätke tühjaks', previous: 'Eelmine', next: 'Järgmine' },
  fi: { leaveBlank: 'Jätä tyhjäksi', previous: 'Edellinen', next: 'Seuraava' },
  fr: { leaveBlank: 'Laisser vide', previous: 'Précédent', next: 'Suivant' },
  ga: { leaveBlank: 'Fág folamh', previous: 'Roimhe seo', next: 'Ar aghaidh' },
  hr: { leaveBlank: 'Ostavite prazno', previous: 'Prethodno', next: 'Sljedeće' },
  hu: { leaveBlank: 'Hagyja üresen', previous: 'Előző', next: 'Következő' },
  it: { leaveBlank: 'Lasciare vuoto', previous: 'Indietro', next: 'Avanti' },
  ja: { leaveBlank: '空欄のままにしてください', previous: '戻る', next: '次へ' },
  ka: { leaveBlank: 'დატოვეთ ცარიელი', previous: 'წინა', next: 'შემდეგი' },
  lo: { leaveBlank: 'ປ່ອຍຫວ່າງໄວ້', previous: 'ກ່ອນໜ້າ', next: 'ຖັດໄປ' },
  lt: { leaveBlank: 'Palikite tuščią', previous: 'Ankstesnis', next: 'Kitas' },
  lv: { leaveBlank: 'Atstājiet tukšu', previous: 'Iepriekšējais', next: 'Nākamais' },
  ms: { leaveBlank: 'Biarkan kosong', previous: 'Sebelumnya', next: 'Seterusnya' },
  nb: { leaveBlank: 'La feltet stå tomt', previous: 'Forrige', next: 'Neste' },
  nl: { leaveBlank: 'Leeg laten', previous: 'Vorige', next: 'Volgende' },
  pl: { leaveBlank: 'Pozostaw puste', previous: 'Wstecz', next: 'Dalej' },
  pt: { leaveBlank: 'Deixe em branco', previous: 'Anterior', next: 'Próximo' },
  'pt-pt': { leaveBlank: 'Deixe em branco', previous: 'Anterior', next: 'Seguinte' },
  ro: { leaveBlank: 'Lăsați necompletat', previous: 'Înapoi', next: 'Înainte' }, // language-allow
  ru: { leaveBlank: 'Оставьте пустым', previous: 'Назад', next: 'Далее' },
  sk: { leaveBlank: 'Nechajte prázdne', previous: 'Späť', next: 'Ďalej' },
  sl: { leaveBlank: 'Pustite prazno', previous: 'Nazaj', next: 'Naprej' },
  sr: { leaveBlank: 'Оставите празно', previous: 'Претходно', next: 'Следеће' },
  sv: { leaveBlank: 'Lämna tomt', previous: 'Föregående', next: 'Nästa' },
  ta: { leaveBlank: 'காலியாக விடவும்', previous: 'முந்தையது', next: 'அடுத்தது' },
  th: { leaveBlank: 'เว้นว่างไว้', previous: 'ก่อนหน้า', next: 'ถัดไป' },
  tr: { leaveBlank: 'Boş bırakın', previous: 'Geri', next: 'İleri' },
  uk: { leaveBlank: 'Залиште порожнім', previous: 'Назад', next: 'Далі' },
  vi: { leaveBlank: 'Để trống ô này', previous: 'Quay lại', next: 'Tiếp theo' }, // language-allow
  zh: { leaveBlank: '请留空', previous: '上一步', next: '下一步' },
  'zh-tw': { leaveBlank: '請留空', previous: '上一步', next: '下一步' }
}

/** The form words of a language tag (`vi`, `vi-VN`, `zh-TW`); English when the language is not listed. */
export function formWordsFor(tag: string | null | undefined): FormWords {
  const t = String(tag ?? '').toLowerCase()
  return FORM_WORDS[t] ?? FORM_WORDS[t.split('-')[0]] ?? FORM_WORDS.en
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The plugin's HTML with its English fallbacks in the page's language. */
export function localizeFormEmbed(html: string, words: FormWords): string {
  return html
    .replace(
      /(<label\b[^>]*\bfor="[^"]*-_hp"[^>]*>)\s*Leave blank\s*(<\/label>)/g,
      `$1${escapeHtml(words.leaveBlank)}$2`
    )
    .replace(
      /(<button\b[^>]*\bdata-ec-prev\b[^>]*>)\s*Previous\s*(<\/button>)/g,
      `$1${escapeHtml(words.previous)}$2`
    )
    .replace(/(<button\b[^>]*\bdata-ec-next\b[^>]*>)\s*Next\s*(<\/button>)/g, `$1${escapeHtml(words.next)}$2`)
}
