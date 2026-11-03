// save_brand_file gate: the shape rules of the header, name slots, colours and owner tasks. Each case breaks one
// thing in a passing invented case and expects the field named (the recomputed rules are in the other files).
import { test } from 'node:test'
import { assertNames, expectRejected, put } from './_brand-gate-rules.mjs'

/** Rows: [title, case id, mutate, expected field, optional why regex]. */
const ROWS = [
  ['name.from names the brief', '1-padel', put('name.from', 'somewhere'), 'name.from'],
  ['name.slots is an array', '1-padel', put('name.slots', 'none'), 'name.slots', /array/],
  ['colours.decision is one of two', '1-padel', put('colours.decision', 'maybe'), 'colours.decision'],
  ['colours.why is one sentence', '1-padel', put('colours.why', ''), 'colours.why'],
  [
    'the brand colour is #rrggbb',
    '1-padel',
    put('colours.brandColour', 'red'),
    'colours.brandColour',
    /#rrggbb/
  ],
  [
    'the template own accent is kept-template, not an accent',
    '1-padel',
    put('colours.brandColour', '#f44141'),
    'colours.brandColour',
    /template's own accent/
  ],
  [
    'the lift starts from the brand colour',
    '1-padel',
    put('colours.lift.from', '#112233'),
    'colours.lift.from'
  ],
  ['the lift carries a sentence for the owner', '1-padel', put('colours.lift.say', ''), 'colours.lift.say'],
  ['builds is 1 or 2', '1-padel', put('colours.builds', 5), 'colours.builds', /1 or 2/],
  ['shifts is an array', '1-padel', put('colours.shifts', null), 'colours.shifts', /array/],
  ['a shift names its side', '1-padel', put('colours.shifts.0.side', 'middle'), 'colours.shifts[0].side'],
  [
    'a shift says if it is the opening side',
    '1-padel',
    put('colours.shifts.0.opens', 'yes'),
    'colours.shifts[0].opens'
  ],
  ['a shift ends on a colour', '1-padel', put('colours.shifts.0.to', 'blue'), 'colours.shifts[0].to'],
  [
    'a shift names the ground it was measured on',
    '1-padel',
    put('colours.shifts.0.on', ''),
    'colours.shifts[0].on'
  ],
  ['a shift ratio is a number', '1-padel', put('colours.shifts.0.ratio', '4.5'), 'colours.shifts[0].ratio'],
  ['a built module is recorded', '1-padel', put('colours.module', null), 'colours.module'],
  [
    'the module slot is contract@version',
    '1-padel',
    put('colours.module.slot', 'nover'),
    'colours.module.slot'
  ],
  [
    'kept-template has no shifts',
    '3-no-logo',
    put('colours.shifts', [{ side: 'dark' }]),
    'colours.shifts',
    /kept-template/
  ],
  ['kept-template has no module', '3-no-logo', put('colours.module', { file: 'x' }), 'colours.module'],
  [
    'kept-template has no brand colour',
    '3-no-logo',
    put('colours.brandColour', '#336699'),
    'colours.brandColour',
    /null/
  ],
  [
    'kept-template has no lift',
    '3-no-logo',
    put('colours.lift', { from: '#336699' }),
    'colours.lift',
    /kept-template/
  ],
  ['owner tasks are an array', '1-padel', put('ownerTasks', 'later'), 'ownerTasks', /array/],
  ['an owner task has a known kind', '1-padel', put('ownerTasks.0.kind', 'whatever'), 'ownerTasks[0].kind'],
  ['an owner task has a sentence', '1-padel', put('ownerTasks.0.say', ''), 'ownerTasks[0].say'],
  [
    'an icon in the logo colours needs the approval task',
    '2-words-only',
    put('ownerTasks', []),
    'ownerTasks',
    /logo's colours/
  ],
  ['a file path is not empty', '1-padel', put('logo.mark.file', ''), 'logo.mark.file', /missing file path/],
  ['the favicon comes from the mark', '1-padel', put('favicon.from', 'logo'), 'favicon.from'],
  ['tab icons are transparent or tile', '1-padel', put('favicon.tabIcons', 'round'), 'favicon.tabIcons'],
  [
    'tileMarkRecoloured is a boolean',
    '1-padel',
    put('favicon.tileMarkRecoloured', 'yes'),
    'favicon.tileMarkRecoloured'
  ],
  [
    'a tile uses the mark of the opening side',
    '2-words-only',
    put('favicon.tileMark', 'icon/other.png'),
    'favicon.tileMark'
  ],
  [
    'the favicon record has its numbers',
    '1-padel',
    put('favicon.check.final', null),
    'favicon.check.final',
    /bboxShare/
  ],
  [
    'every favicon candidate is recorded',
    '1-padel',
    put('favicon.check.candidates', []),
    'favicon.check.candidates'
  ],
  [
    'a favicon candidate has a known kind',
    '1-padel',
    put('favicon.check.candidates.0.kind', 'round'),
    'favicon.check.candidates[0].kind'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
