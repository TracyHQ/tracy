// Whether the value a site holds is the value that was ordered. The plugin stores some values in another form than it was
// given, so each form is undone on both sides and nothing else is: a change the page would show stays a difference.
// The forms come from the plugin's ContentSlots.php and QuickstartContract.php.

// The plugin's CAPTURE_SPACE: a whole-unit slot reads back with each run of these collapsed to one space and trimmed. HTML
// shows such a run as one space too, so it is no difference on any text slot.
// oxlint-disable-next-line no-control-regex -- the plugin's own set, control characters included
const SPACE_RUN = /[\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g
const collapsed = (value) => value.replace(SPACE_RUN, ' ').trim()

const NAMED_REFERENCES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** An attribute written from PHP is read as markup, so a complete reference in the order reads back as its character. */
function referencesDecoded(value) {
  return value.replace(/&(?:(amp|lt|gt|quot|apos)|#([0-9]+)|#x([0-9a-f]+));/gi, (whole, name, dec, hex) => {
    if (name) return NAMED_REFERENCES[name.toLowerCase()]
    const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

const isAttribute = (slot) => /\/@[^/]+$/.test(String(slot?.xpath ?? ''))

/** The HTML saver percent-encodes characters of a link it saves; a value that is not valid encoding is kept as it is. */
function percentDecoded(value) {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

/** A picture is its file: Joomla's media suffix (`#joomlaImage://...`) and a leading slash do not change which one. */
const pictureFile = (value) => value.split('#', 1)[0].replace(/^\/+/, '')

/**
 * @param {string} ordered what the write report says was sent
 * @param {string} measured what the site holds now
 * @param {{ type?: string, xpath?: string }} [slot] the slot as inspect lists it
 */
export function sameValue(ordered, measured, slot = {}) {
  const sent = isAttribute(slot) ? referencesDecoded(ordered) : ordered
  if (slot.type === 'image') return pictureFile(sent) === pictureFile(measured)
  if (slot.type === 'url') return percentDecoded(sent.trim()) === percentDecoded(measured.trim())
  return collapsed(sent) === collapsed(measured)
}
