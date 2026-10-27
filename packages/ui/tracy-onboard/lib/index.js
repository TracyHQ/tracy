/**
 * Host half: intentionally empty.
 *
 * The first-run screen talks to the desktop app's bridge (`window.tracyDesktop.app`) and reads
 * tracy-web's public `GET /api/desktop/config`; it adds no route and no service of its own.
 */
export const name = '@tracy/dsh-onboard'
export function apply() {}
