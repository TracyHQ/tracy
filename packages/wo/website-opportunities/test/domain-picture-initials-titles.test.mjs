// The initials of a person with a title (ticket #595, second review 13/11): honorifics, suffixes, a role before a colon
// and a leading role word are left out before the letters are taken, and a single word is never stripped away.
// Invented names only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-initials-titles.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialsOf } from '../domain/person-avatar.mjs'

const check = (cases) => {
  for (const [name, initials] of cases) assert.equal(initialsOf(name), initials, name)
}

test('honorifics before a name are left out, in every form the review names', () => {
  check([
    ['Dr. Ana Ruiz', 'AR'],
    ['Dr Ana Ruiz', 'AR'],
    ['Mr J. Smith', 'JS'],
    ['Prof. Dr. Hans Mueller', 'HM'],
    ['Ms. Orla Venn', 'OV'],
    ['Mrs Ida Holm', 'IH'],
    ['Miss Ada Fenn', 'AF'],
    ['Mx Rowan Teal', 'RT'],
    ['Herr Kai Brandt', 'KB'],
    ['Frau Lena Vogt', 'LV'],
    ['M. Paul Arnaud', 'PA'],
    ['Mme Claire Roux', 'CR'],
    ['Mlle Ines Moreau', 'IM'],
    ['Sr. Diego Luna', 'DL'],
    ['Sra. Elena Pardo', 'EP'],
    ['Srta. Lucia Vela', 'LV'],
    ['Sig. Marco Fini', 'MF'],
    ['Sig.ra Paola Neri', 'PN'],
    ['Dott. Luca Gallo', 'LG'],
    ['Ing. Pietro Sala', 'PS'],
    ['Don Tomas Rey', 'TR'],
    ['Dona Rita Faro', 'RF'],
    ['Doña Rita Faro', 'RF']
  ])
})

test('suffixes after a name are left out; Sr only as the last word', () => {
  check([
    ['Milo Tarrant Jr.', 'MT'],
    ['Milo Tarrant Jr', 'MT'],
    ['Milo Tarrant Sr.', 'MT'],
    ['Milo Tarrant II', 'MT'],
    ['Milo Tarrant III', 'MT'],
    ['Milo Tarrant IV', 'MT'],
    ['Nora Pell PhD', 'NP'],
    ['Nora Pell MD', 'NP'],
    ['Nora Pell MSc', 'NP'],
    ['Nora Pell BSc', 'NP'],
    ['Nora Pell, PhD', 'NP']
  ])
})

test('a role before a colon, and a leading role word with a name after it, are left out', () => {
  check([
    ['Head Coach: Mia Lee', 'ML'],
    ['Coach Mia', 'M'],
    ['Coach Mia Lee', 'ML'],
    ['Head Coach Mia Lee', 'ML'],
    ['Coach', 'C'],
    ['Dr.', 'D'],
    ['Mia (Mimi', 'M'],
    ['Mia (Mimi) Lee', 'ML'],
    ['Mia Lee (Head coach)', 'ML']
  ])
})

test('the names without a title keep their letters', () => {
  check([
    ['Jean-Luc Picard', 'JP'],
    ['Ludwig van der Berg', 'LB'],
    ['Mohammed bin Salman', 'MS'],
    ['Donna Reyes', 'DR'],
    ['Drew Marsh', 'DM'],
    ['Ines Marlow', 'IM'],
    ['Mia', 'M']
  ])
})
