/**
 * The WORDS inside an owner's mark (spec TracyHQ/tracy#189, COO 29/10/2026): many marks carry their name under or beside
 * the picture (a crest with the club's name and year below the shield). A lockup that set the name again beside them would
 * say it twice.
 *
 *   splitMarkText   the mark cut in bands by empty rows (then empty columns): a band whose ink falls in many separate
 *                   pieces across its length is a line of letters, a band in one or two pieces is the picture. When every
 *                   line of letters lies on one side of the picture, the picture alone is cropped out (`pictorial`).
 *
 * 🔒 THIS IS THE FALLBACK READER. Whether a mark holds words at all is asked of the photo labeller first (`brand-logo-fit.js`
 * `seesText`); this heuristic finds lines of letters set apart from the picture, and cannot see words that run around or
 * through it (a round seal's ring of letters): with no labeller such a mark is taken as wordless.
 */
import sharp from 'sharp'

/** A pixel this opaque is ink. */
const INK_ALPHA = 128
/** A row or column with fewer ink pixels than this share of the other side is empty (antialiasing, a speck). */
const EMPTY = 0.004
/** Empty rows (or columns) at least this share of the mark's height (or width) separate two bands. */
const MIN_GAP = 0.012
/** A band whose ink falls in at least this many separate pieces along it is a line of letters. */
const LETTER_PIECES = 3
/** ...and whose pieces are this narrow against the band's thickness on average (a letter is about as wide as it is tall). */
const LETTER_ASPECT = 2.2

/**
 * Bands of ink along one axis: runs of non-empty lines separated by at least `minGap` empty ones.
 * @param {number[]} counts @param {number} need - the least ink of a non-empty line @param {number} minGap
 * @returns {Array<[number, number]>} first and last line of each band
 */
function bandsOf(counts, need, minGap) {
  const out = []
  let start = -1
  let last = -1
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] < need) continue
    if (start < 0) start = i
    else if (i - last - 1 >= minGap) {
      out.push([start, last])
      start = i
    }
    last = i
  }
  if (start >= 0) out.push(/** @type {[number, number]} */ ([start, last]))
  return out
}

/** Ink counts per row and per column of a box. */
function profile({ data, width }, box) {
  const rows = Array.from({ length: box.height }, () => 0)
  const cols = Array.from({ length: box.width }, () => 0)
  for (let y = 0; y < box.height; y += 1)
    for (let x = 0; x < box.width; x += 1)
      if (data[((box.top + y) * width + box.left + x) * 4 + 3] > INK_ALPHA) {
        rows[y] += 1
        cols[x] += 1
      }
  return { rows, cols }
}

/** Whether a band (a box) reads as a line of letters: many narrow pieces along its length. */
function isLetters(raw, box, horizontal) {
  const { rows, cols } = profile(raw, box)
  const along = horizontal ? cols : rows
  const thick = horizontal ? box.height : box.width
  const pieces = bandsOf(along, 1, 1)
  if (pieces.length < LETTER_PIECES) return false
  const mean = pieces.reduce((sum, [a, b]) => sum + (b - a + 1), 0) / pieces.length
  return mean <= thick * LETTER_ASPECT
}

/**
 * @param {Uint8Array} mark - the mark, trimmed, transparent around it (`readMark`)
 * @returns {Promise<{letters: boolean, pictorial: Buffer | null}>} `letters`: a line of letters set apart from the picture
 *   was found; `pictorial`: the picture alone, cropped, when the letters all lie on one side of it
 */
export async function splitMarkText(mark) {
  const { data, info } = await sharp(Buffer.from(mark))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const raw = { data, width: info.width, height: info.height }
  const whole = { left: 0, top: 0, width: info.width, height: info.height }
  const { rows, cols } = profile(raw, whole)
  for (const horizontal of [true, false]) {
    const counts = horizontal ? rows : cols
    const across = horizontal ? info.width : info.height
    const along = horizontal ? info.height : info.width
    const bands = bandsOf(
      counts,
      Math.max(1, Math.round(across * EMPTY)),
      Math.max(2, Math.round(along * MIN_GAP))
    )
    if (bands.length < 2) continue
    const boxes = bands.map(([a, b]) =>
      horizontal
        ? { left: 0, top: a, width: info.width, height: b - a + 1 }
        : { left: a, top: 0, width: b - a + 1, height: info.height }
    )
    const letters = boxes.map((box) => isLetters(raw, box, horizontal))
    if (!letters.some(Boolean)) continue
    const picture = letters.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0)
    // Separable: the picture's bands are one run, and every line of letters lies before it or after it.
    const first = picture[0]
    const lastPic = picture[picture.length - 1]
    const oneSide =
      picture.length > 0 &&
      picture.every((i, k) => k === 0 || i === picture[k - 1] + 1) &&
      (letters.slice(0, first).every(Boolean) || letters.slice(lastPic + 1).every(Boolean))
    if (!oneSide) return { letters: true, pictorial: null }
    const [a] = bands[first]
    const [, b] = bands[lastPic]
    const crop = horizontal
      ? { left: 0, top: a, width: info.width, height: b - a + 1 }
      : { left: a, top: 0, width: b - a + 1, height: info.height }
    const pictorial = await sharp(Buffer.from(mark))
      .extract(crop)
      .png()
      .toBuffer()
      .then((bytes) => sharp(bytes).trim({ threshold: 1 }).png().toBuffer())
      .catch(() => null)
    return { letters: true, pictorial }
  }
  return { letters: false, pictorial: null }
}
