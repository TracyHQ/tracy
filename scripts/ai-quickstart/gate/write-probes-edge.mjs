// The edge probes of write safety (ticket #586): values a customer could type into a text field that are not markup but
// still break a store, a door or a page: a value three times the field's declared limit and one exactly at it, control
// characters and a Windows line end, the empty value and a single space, format tokens a printf style function reads,
// numbers written as text, an emoji sequence held together by a joiner, right to left text with a direction override,
// and a JA ACM style marker that opens and never closes. Their danger is a server error, a door refusal or a mangled
// page, which write safety classes on its own; only the unbalanced marker can also print as a live element. Pure.
import { COMMON_PROBES, elementProbe, lengthOf } from './write-probes.mjs'

// Invisible and picture characters by their code point, so no formatter turns them into raw characters in the source.
const ch = (code) => String.fromCodePoint(code)
const [JOINER, VARIATION] = [ch(0x200d), ch(0xfe0f)]
const [WOMAN, SHEAF, FLAG, RAINBOW] = [ch(0x1f469), ch(0x1f33e), ch(0x1f3f3), ch(0x1f308)]
const [RIGHT_TO_LEFT_OVERRIDE, POP_DIRECTION] = [ch(0x202e), ch(0x202c)]
const [RIGHT_TO_LEFT_ISOLATE, POP_ISOLATE] = [ch(0x2067), ch(0x2069)]
const CONTROL = ['a', ch(0x01), 'b', ch(0x08), 'c', ch(0x1b), 'd', ch(0x0d), ch(0x0a), 'e'].join('')

/** Filler a limit probe pads with: plain letters, so only the length is under test. */
const pad = (n) => 'x'.repeat(Math.max(0, n))

/** A probe that replaces the whole value with fixed text. */
const wholeProbe = (id, value, why) => ({
  id,
  types: ['text'],
  whole: true,
  text: () => value,
  judge: () => null,
  why
})

/** A probe that adds text after the place's own marker. */
const wordsProbe = (id, value, why) => ({ id, types: ['text'], text: () => value, judge: () => null, why })

/** A probe sized by the place's declared limit: the whole value is `times` the limit long (`limit` ignored). */
const limitProbe = (id, kind, times, why) => ({
  id,
  types: ['text'],
  limit: kind,
  text: (code, { base, limit }) => {
    if (limit == null) return null
    const room = limit * times - lengthOf(base) - 1
    return room >= 1 ? pad(room) : null
  },
  judge: () => null,
  why
})

export const EDGE_PROBES = Object.freeze([
  limitProbe(
    'over-limit',
    'over',
    3,
    'a value three times the declared limit: kept whole, cut, or refused by name'
  ),
  limitProbe('at-limit', 'at', 1, 'a value exactly at the declared limit, which must be kept'),
  wordsProbe('control-characters', CONTROL, 'control characters and a Windows line end in one line of text'),
  wholeProbe('empty', '', 'the empty value'),
  wholeProbe('single-space', ' ', 'a value of one space'),
  wordsProbe('format-tokens', '%s %d %1$s %n', 'format tokens a printf style function reads as arguments'),
  wholeProbe('number-zero', '0', 'zero written as text, which a loose comparison reads as empty'),
  wholeProbe('number-negative', '-1', 'a negative number written as text'),
  wholeProbe('number-huge', '1e309', 'a number past the largest float, written as text'),
  wholeProbe('number-nan', 'NaN', 'not a number, written as text'),
  wordsProbe(
    'emoji-joiner',
    [WOMAN, JOINER, SHEAF, ' ', FLAG, VARIATION, JOINER, RAINBOW].join(''),
    'emoji sequences held together by a zero width joiner, which a store may split'
  ),
  wordsProbe(
    'direction-override',
    [RIGHT_TO_LEFT_OVERRIDE, 'abc', POP_DIRECTION, ' ', RIGHT_TO_LEFT_ISOLATE, 'def', POP_ISOLATE].join(''),
    'right to left text with a direction override and an isolate'
  ),
  elementProbe(
    'acm-unbalanced',
    'u',
    (s) => '((i ' + s + ' never closed',
    'a JA ACM style marker that opens and never closes, which a converter may still turn into a tag'
  )
])

/** The probes of every framework: the markup probes, then the edge probes. */
export const PROBE_CATALOGUE = Object.freeze([...COMMON_PROBES, ...EDGE_PROBES])
