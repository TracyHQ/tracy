// The three tone definitions (`plain | warm | bold`, TCH #1013) live twice: in the seeder (`tracy-seeder/src/tone.mjs`,
// WordPress and Joomla) and in the EmDash tool (`tools/personalize.mjs` `TONE_RULES`, three templates and the kit), which
// may not import the seeder (ADR 0006). Only TCH sees both, so the check that they say the same thing lives here.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TONES } from '../../packages/cms/tracy-seeder/src/tone.mjs'
import { TONE_RULES } from '../../packages/cms/tracy-emdash-theme-business/tools/personalize.mjs'

test('the EmDash tool defines each tone exactly as the seeder does', () => {
  assert.deepEqual({ ...TONE_RULES }, { ...TONES })
})
