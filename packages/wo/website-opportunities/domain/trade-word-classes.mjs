// The ONE dictionary of trade words a brief build rule reads by class (TracyHQ/tracy#242, audit S4); the words a prompt
// uses per trade are `trade-words.mjs`. Rules that must tell what a word of a brief or a page names (a kind of offering,
// a person's role, a page of offerings) read it from here, never from a word list of their own: twelve lists grew apart, each leaning on the first trade measured (lessons,
// classes, coaches), so a law firm's "practice areas" page was no offering page and "our attorneys" no team.
//
// 🔒 BY CLASS, MANY TRADES: each class holds the words of several trades (a gym, a clinic, a bakery, a law firm, a salon,
// a trade service). A new trade adds its words HERE, to its class, never to a rule's own list. A rule may keep a few
// words of its own only when they are not trade words (a modifier such as "private", a function word).
// 🔒 ENGLISH ONLY: the repository's language policy admits no other language in source; a brief in another language is
// read through the business reading the model writes (its services, team roles and nouns), not through this list.
// Pure data and two helpers; no template, business or CMS is named here.

/** Nouns that name a KIND of offering, not which one ("lessons", "treatments", "consultations"), singular and plural. */
export const OFFERING_KIND_NOUNS = Object.freeze([
  ['session', 'sessions'],
  ['lesson', 'lessons'],
  ['class', 'classes'],
  ['coaching', 'coaching'],
  ['course', 'courses'],
  ['programme', 'programmes'],
  ['program', 'programs'],
  ['training', 'trainings'],
  ['workshop', 'workshops'],
  ['membership', 'memberships'],
  ['treatment', 'treatments'],
  ['consultation', 'consultations'],
  ['appointment', 'appointments'],
  ['tour', 'tours'],
  ['service', 'services'],
  ['package', 'packages']
])

/** Nouns that name a person by their role in a trade, singular and plural. */
export const PERSON_ROLE_NOUNS = Object.freeze([
  ['coach', 'coaches'],
  ['trainer', 'trainers'],
  ['instructor', 'instructors'],
  ['teacher', 'teachers'],
  ['tutor', 'tutors'],
  ['doctor', 'doctors'],
  ['dentist', 'dentists'],
  ['hygienist', 'hygienists'],
  ['nurse', 'nurses'],
  ['therapist', 'therapists'],
  ['physiotherapist', 'physiotherapists'],
  ['veterinarian', 'veterinarians'],
  ['stylist', 'stylists'],
  ['barber', 'barbers'],
  ['chef', 'chefs'],
  ['baker', 'bakers'],
  ['lawyer', 'lawyers'],
  ['attorney', 'attorneys'],
  ['solicitor', 'solicitors'],
  ['accountant', 'accountants'],
  ['adviser', 'advisers'],
  ['advisor', 'advisors'],
  ['consultant', 'consultants'],
  ['architect', 'architects'],
  ['designer', 'designers'],
  ['photographer', 'photographers'],
  ['mechanic', 'mechanics'],
  ['technician', 'technicians'],
  ['plumber', 'plumbers'],
  ['electrician', 'electricians'],
  ['specialist', 'specialists'],
  ['expert', 'experts'],
  ['professional', 'professionals']
])

/** Nouns that name the people of a business as a whole. */
export const PEOPLE_GROUP_NOUNS = Object.freeze(['team', 'staff', 'people'])

/** The last part of a page address that says the page lists offerings, in several trades. */
export const OFFERING_PAGE_SLUGS = Object.freeze([
  'services',
  'offerings',
  'menus',
  'products',
  'classes',
  'lessons',
  'courses',
  'programs',
  'programmes',
  'treatments',
  'workshops',
  'practice-areas'
])

/** Every form of a list of [singular, plural] pairs, once each. */
export const formsOf = (/** @type {ReadonlyArray<readonly string[]>} */ pairs) => [...new Set(pairs.flat())]

/**
 * A regular-expression alternation of words, longest first so a longer form wins ("classes" before "class"); `-` in a
 * slug matches a dash, an underscore or a space.
 * @param {ReadonlyArray<string>} words
 */
export const alternationOf = (words) =>
  [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '[- _]'))
    .join('|')
