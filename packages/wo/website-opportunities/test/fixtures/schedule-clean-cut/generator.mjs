// A seeded generator of one part schedule rows (ticket #615) for the property test: day groups, connectors, time
// expressions, joiners and noise words of six languages put together at random. Invented text, no real business.
// Written with escapes so the source holds no dash and no accent.

const EN_DASH = '\u2013'
const LANGUAGES = {
  en: {
    days: [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
      'Monday',
      'Friday',
      'Daily',
      'Weekdays',
      'Weekends'
    ],
    joins: ['-', ' to ', ' & ', ', ', ' and ', '/', ' thru ', EN_DASH],
    clocks: ['9', '10am', '6 pm', '7.30 pm', '18:00', '9:30', 'noon', 'midnight', '11 a.m.', '1800'],
    ranges: ['-', ' to ', ' - ', ' till ', EN_DASH],
    links: ['from ', 'at ', 'until ', 'after ', 'before '],
    joiners: [', ', '; ', ' and ', ' & '],
    noise: [
      'closed',
      'by appointment',
      'kids 6 to 12',
      'room 2',
      'open gym',
      'max 12 people',
      '(lunch 12-13)',
      'only'
    ]
  },
  fr: {
    days: [
      'Lun',
      'Mar',
      'Mer',
      'Jeu',
      'Ven',
      'Sam',
      'Dim',
      'Lundi',
      'Vendredi',
      'Tous les jours',
      'Week-end'
    ],
    joins: ['-', ' au ', ' et ', ', ', '/'],
    clocks: ['9h', '18h30', '20h', '7h', 'midi', 'minuit', '10:00', '1830'],
    ranges: ['-', ' \u00e0 ', ' - '],
    links: ['de ', 'd\u00e8s ', '\u00e0 partir de ', 'jusqu\u2019\u00e0 '],
    joiners: [' et ', ', ', '; '],
    noise: ['ferm\u00e9', 'sur rendez-vous', 'enfants 6 \u00e0 12 ans', 'salle 3', 'cours libre']
  },
  de: {
    days: [
      'Mo',
      'Di',
      'Mi',
      'Do',
      'Fr',
      'Sa',
      'So',
      'Montag',
      'Montags',
      'T\u00e4glich',
      'Werktags',
      'Wochenende'
    ],
    joins: ['-', ' bis ', ' und ', ', ', '/', ' + ', EN_DASH],
    clocks: ['9', '18 Uhr', '7.30 Uhr', '19:30', '22 Uhr', 'Mittag', 'Mitternacht', '1800'],
    ranges: ['-', ' bis ', ' - ', EN_DASH],
    links: ['ab ', 'bis ', 'um ', 'von '],
    joiners: [', ', ' und ', '; '],
    noise: ['geschlossen', 'nach Vereinbarung', 'Kinder 6 bis 12', 'Raum 2', 'mittags']
  },
  es: {
    days: [
      'Lun',
      'Mar',
      'Mi\u00e9',
      'Jue',
      'Vie',
      'S\u00e1b',
      'Dom',
      'Lunes',
      'Viernes',
      'Todos los d\u00edas'
    ],
    joins: ['-', ' a ', ' y ', ', ', '/'],
    clocks: ['9', '18h', '19 h', '10:00', '17:00', 'mediod\u00eda', 'medianoche', '1900'],
    ranges: ['-', ' a ', ' - '],
    links: ['de ', 'desde ', 'hasta ', 'a partir de las '],
    joiners: [' y ', ', ', '; '],
    noise: ['cerrado', 'con cita previa', 'ni\u00f1os 6 a 12', 'sala 1']
  },
  it: {
    days: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom', 'Luned\u00ec', 'Venerd\u00ec', 'Tutti i giorni'],
    joins: ['-', ' al ', ' e ', ', ', '/'],
    clocks: ['9', '18', '18:30', '20', 'mezzogiorno', 'mezzanotte', '7'],
    ranges: ['-', ' alle ', ' - '],
    links: ['dalle ', 'alle ', 'ore ', 'fino alle '],
    joiners: [' e ', ', ', '; '],
    noise: ['chiuso', 'su prenotazione', 'bambini 6-12', 'sala 2']
  },
  pt: {
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b', 'Dom', 'Segunda', 'Sexta', 'Todos os dias'],
    joins: ['-', ' a ', ' e ', ', ', '/'],
    clocks: ['9h', '18h', '19h30', '20h', 'meio-dia', 'meia-noite', '10:00'],
    ranges: ['-', ' \u00e0s ', ' a ', ' - '],
    links: ['das ', 'a partir das ', 'at\u00e9 ', 'desde '],
    joiners: [' e ', ', ', '; '],
    noise: ['fechado', 'com marca\u00e7\u00e3o', 'crian\u00e7as 6 a 12', 'sala 4']
  }
}
const SEPARATORS = [' ', ' ', ' ', ': ', ', ', ' - ']

/** A small seeded random source (mulberry32): the same seed gives the same strings. */
function randomOf(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `count` generated one part schedule rows, with the language each one was drawn from. */
export function generatedRows(count, seed = 615) {
  const random = randomOf(seed)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const names = Object.keys(LANGUAGES)
  const rows = []
  for (let n = 0; n < count; n++) {
    const lang = LANGUAGES[pick(names)]
    const group = () =>
      random() < 0.5 ? pick(lang.days) : `${pick(lang.days)}${pick(lang.joins)}${pick(lang.days)}`
    const clock = () => pick(lang.clocks)
    const time = () => {
      const one = random() < 0.5 ? clock() : `${clock()}${pick(lang.ranges)}${clock()}`
      return random() < 0.3 ? `${pick(lang.links)}${one}` : one
    }
    const clean = () => `${group()}${pick(SEPARATORS)}${time()}`
    const shapes = [
      clean,
      clean,
      clean,
      clean,
      () => `${group()}${pick(SEPARATORS)}${time()}${pick(lang.joiners)}${group()} ${time()}`,
      () => `${group()} ${time()}${pick(lang.joiners)}${time()}`,
      () => `${group()} ${time()} ${pick(lang.noise)}`,
      () => `${group()} ${pick(lang.noise)}`,
      () => `${pick(lang.noise)} ${time()}`,
      () => `${time()} ${group()}`,
      () => group(),
      () => pick(lang.noise),
      () => `${group()}${pick(lang.joiners)}${group()} ${pick(lang.noise)}`
    ]
    rows.push(pick(shapes)())
  }
  return rows
}
