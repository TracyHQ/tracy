/**
 * Vietnamese language pack, host half. Pure UI plugin: the empty apply exists
 * so the row appears in the Loader (and therefore in the client-modules scan);
 * the browser half ships through exports["./client"], declared by the
 * package.json `dsh.client` field.
 */

/** Host plugin body — this surface plugin has no host-side behavior. */
export function apply() {}
