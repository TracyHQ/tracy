/**
 * The sounds a notification can make (Settings › Notifications, the first-run screen's picker):
 * `system` — the system's default — or one of the macOS alert sounds, by name. Electron passes the
 * name to macOS, which finds it among the system's sounds (/System/Library/Sounds); the name is never
 * a path, and only these exact names are accepted. Windows and Linux play their own default
 * (Electron's `sound` option is macOS only: src/notify-bridge.js leaves it out there).
 */

const DEFAULT_SOUND = 'system'

const NOTIFY_SOUNDS = Object.freeze([
  'Basso',
  'Blow',
  'Bottle',
  'Frog',
  'Funk',
  'Glass',
  'Hero',
  'Morse',
  'Ping',
  'Pop',
  'Purr',
  'Sosumi',
  'Submarine',
  'Tink'
])

/** `system`, or exactly one of the names above. */
const isNotifySound = (value) => value === DEFAULT_SOUND || NOTIFY_SOUNDS.includes(value)

module.exports = { NOTIFY_SOUNDS, DEFAULT_SOUND, isNotifySound }
