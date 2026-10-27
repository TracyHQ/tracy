/**
 * The card's talk with the server (the turns door, the undo door), shared with the Site changes row
 * of the same turn since 06/10/2026: it lives in `@tracy/core/turn-undo` and is re-exported here so
 * this package reads it where it always did.
 */
export { createTurnsBook, outcomeKey, readTurnsAnswer, turnsUrl, undoTurn } from '@tracy/core/turn-undo'

/**
 * @typedef {import('@tracy/core/turn-undo').Target} Target
 * @typedef {import('@tracy/core/turn-undo').ContentWrite} ContentWrite
 * @typedef {import('@tracy/core/turn-undo').Reason} Reason
 * @typedef {import('@tracy/core/turn-undo').Turn} Turn
 * @typedef {import('@tracy/core/turn-undo').TurnsAnswer} TurnsAnswer
 * @typedef {import('@tracy/core/turn-undo').BookEntry} BookEntry
 * @typedef {import('@tracy/core/turn-undo').UndoOutcome} UndoOutcome
 */
