// Number words of the six site languages (en, de, fr, es, it, pt) for the copy guard (ticket #594): one to twenty and
// the round tens, hundreds and thousands, so "fifty members" is held to the plan data as "50 members" is. One alone is
// English only: `ein`, `un`, `uno`, `um` are also articles. Pure.

const WORDS = {
  1: ['one'],
  2: ['two', 'zwei', 'deux', 'dos', 'due', 'dois', 'duas'],
  3: ['three', 'drei', 'trois', 'tres', 'tre', 'três'],
  4: ['four', 'vier', 'quatre', 'cuatro', 'quattro', 'quatro'],
  5: ['five', 'fünf', 'cinq', 'cinco', 'cinque'],
  6: ['six', 'sechs', 'seis', 'sei'],
  7: ['seven', 'sieben', 'sept', 'siete', 'sette', 'sete'],
  8: ['eight', 'acht', 'huit', 'ocho', 'otto', 'oito'],
  9: ['nine', 'neun', 'neuf', 'nueve', 'nove'],
  10: ['ten', 'zehn', 'dix', 'diez', 'dieci', 'dez'],
  11: ['eleven', 'elf', 'onze', 'once', 'undici'],
  12: ['twelve', 'zwölf', 'douze', 'doce', 'dodici', 'doze'],
  13: ['thirteen', 'dreizehn', 'treize', 'trece', 'tredici', 'treze'],
  14: ['fourteen', 'vierzehn', 'quatorze', 'catorce', 'quattordici', 'catorze'],
  15: ['fifteen', 'fünfzehn', 'quinze', 'quince', 'quindici'],
  16: ['sixteen', 'sechzehn', 'seize', 'dieciséis', 'sedici', 'dezesseis', 'dezasseis'],
  17: ['seventeen', 'siebzehn', 'dix-sept', 'diecisiete', 'diciassette', 'dezessete', 'dezassete'],
  18: ['eighteen', 'achtzehn', 'dix-huit', 'dieciocho', 'diciotto', 'dezoito'],
  19: ['nineteen', 'neunzehn', 'dix-neuf', 'diecinueve', 'diciannove', 'dezenove', 'dezanove'],
  20: ['twenty', 'zwanzig', 'vingt', 'veinte', 'venti', 'vinte'],
  30: ['thirty', 'dreißig', 'trente', 'treinta', 'trenta', 'trinta'],
  40: ['forty', 'vierzig', 'quarante', 'cuarenta', 'quaranta', 'quarenta'],
  50: ['fifty', 'fünfzig', 'cinquante', 'cincuenta', 'cinquanta', 'cinquenta'],
  60: ['sixty', 'sechzig', 'soixante', 'sesenta', 'sessanta', 'sessenta'],
  70: ['seventy', 'siebzig', 'soixante-dix', 'setenta', 'settanta'],
  80: ['eighty', 'achtzig', 'quatre-vingts', 'ochenta', 'ottanta', 'oitenta'],
  90: ['ninety', 'neunzig', 'quatre-vingt-dix', 'noventa', 'novanta'],
  100: ['hundred', 'hundert', 'cent', 'cien', 'ciento', 'cento', 'cem'],
  1000: ['thousand', 'tausend', 'mille', 'mil']
}

const VALUE = new Map(Object.entries(WORDS).flatMap(([n, words]) => words.map((w) => [w, Number(n)])))

/** An alternation of every number word, longest first so `dix-sept` wins over `dix`. */
export const NUMBER_WORD = [...VALUE.keys()].sort((a, b) => b.length - a.length).join('|')

/** The value of a number word, any case; undefined for any other word. */
export const numberWordValue = (word) => VALUE.get(String(word).toLowerCase())
