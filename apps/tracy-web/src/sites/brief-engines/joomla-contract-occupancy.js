/**
 * QuickstartContract::checkValue compares occupancy to the sealed sample for every scalar type.
 * Intentional removals go through records; activation needs an explicit records planner. Identity
 * slots are exempt in the plugin. PHP trim deliberately keeps nonbreaking spaces occupied.
 */
const trim = (value) => String(value ?? '').replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, '')
const phpEmpty = (value) => value == null || value === false || value === 0 || value === '' || value === '0'

/** Whether the sealed sample occupies its slot, using the plugin's trim semantics. */
export const occupiedSample = (slot) => trim(slot?.sample) !== ''

/** The occupancy intent the contract refuses, or null when its own rules allow the write. */
export function contractOccupancy(slot, value) {
  if (!slot || !phpEmpty(slot.siteIdentity)) return null
  const occupied = occupiedSample(slot)
  const next = trim(value) !== ''
  return occupied === next ? null : occupied ? 'empty' : 'activate'
}
