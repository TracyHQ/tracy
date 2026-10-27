/**
 * Host half: intentionally empty.
 *
 * Everything this plugin needs already exists as a door on `cowork-web` — `/api/sites` lists the
 * viewer's seats and `/api/site` switches which one is open. Adding a host route here would put a
 * second copy of that question inside the lane, and a lane answering "which sites do I have?"
 * about a seat book it does not own is a copy that goes stale without saying so.
 */
export const name = '@tracy/dsh-my-sites'
export function apply() {}
