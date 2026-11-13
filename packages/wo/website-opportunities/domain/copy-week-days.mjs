// Whether known opening hours cover all seven days of the week (#594 review W2), for the copy guard: "Open 7 days a
// week" is proven by "Monday to Saturday 07:00-18:00; Sunday 08:00-14:00" as well as by "daily". Day names and their
// short forms in English, German, French, Spanish, Italian and Portuguese; two days joined by a range word (`-`, `to`,
// `bis`, `au`, `a`) stand for every day between them. Pure.

/** Each day of the week (Monday first) as the whole words that name it. */
const DAYS = [
  'monday|mon|montag|mo|lundi|lun|lunes|lunedi|segunda|seg',
  'tuesday|tue|tues|dienstag|di|mardi|mar|martes|martedi|terca|ter',
  'wednesday|wed|mittwoch|mi|mercredi|mer|miercoles|mie|mercoledi|quarta|qua',
  'thursday|thu|thur|thurs|donnerstag|do|jeudi|jeu|jueves|jue|giovedi|gio|quinta|qui',
  'friday|fri|freitag|fr|vendredi|ven|viernes|vie|venerdi|sexta|sex',
  'saturday|sat|samstag|sa|samedi|sam|sabado|sab|sabato',
  'sunday|sun|sonntag|so|dimanche|dim|domingo|dom|domenica'
].map((names) => new RegExp(`^(?:${names})$`))

const RANGE_WORD = /^[\s.]*(?:-|\u2013|to|till|through|thru|bis|au|a|al)[\s.]*$/u

const plain = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()

/** Whether `text` names all seven days, a range of days counting every day it spans. */
export function coversEveryDay(text) {
  const words = [...plain(text).matchAll(/\p{L}+/gu)]
  const days = words
    .map((m) => ({ day: DAYS.findIndex((re) => re.test(m[0])), start: m.index, end: m.index + m[0].length }))
    .filter((d) => d.day !== -1)
  const raw = plain(text)
  const covered = new Set()
  days.forEach((d, i) => {
    covered.add(d.day)
    const next = days[i + 1]
    if (!next || !RANGE_WORD.test(raw.slice(d.end, next.start))) return
    for (let day = d.day; day !== next.day; day = (day + 1) % 7) covered.add(day)
  })
  return covered.size === 7
}
