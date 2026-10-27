/**
 * The public keys a channel file must be signed with before this app takes an update from it
 * (`src/feed-signature.js`). Each is the raw 32-byte Ed25519 public key in base64, as
 * `node build/feed-key.mjs create` prints it. The private key lives only on the iMac, at
 * `~/TracyHQ/.infra/tracy-feed-ed25519.key`, and is read by `build/release.mjs publish`.
 *
 * Empty = this build verifies nothing, so it never updates itself (it keeps running). The release
 * preflight refuses to publish a feed the candidate's own keys do not verify, so an empty list cannot
 * reach a real store unnoticed.
 *
 * Rotating: add the new key here and ship that build signed with the OLD key; once every install has
 * it, sign with the new key and drop the old one in a later build. Removing the only key a published
 * build trusts strands those installs on their version.
 */
const FEED_PUBLIC_KEYS = Object.freeze(['Vs/PmIvqekqz0LJoMJKhX34D3pY4MozMyVeqkPjqjfg='])

module.exports = { FEED_PUBLIC_KEYS }
