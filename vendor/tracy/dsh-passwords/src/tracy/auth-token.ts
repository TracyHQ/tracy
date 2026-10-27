// L9 (hook H14): a session token for an account whose identity was proved elsewhere — the seat
// door, the Tracy sign-in door. Upstream mints tokens only inside `AuthService.login()`, after a
// password check, and keeps its lifetime in a private `TOKEN_TTL`; this file is the one other
// minting point, and it must hand out exactly what `login()` does: same signing key, same
// lifetime, same `cv` claim (the credential version a revocation moves).
//
// The key comes from the caller (the gateway's `config.jwtSecret`) rather than from a second read
// of the config. The lifetime is a copy of upstream's constant, pinned to a real `login()` by
// `test/tracy/auth-token.test.ts`, so an upstream change to it fails a test instead of drifting.
//
// This function proves nothing by itself. Whoever calls it has already done the proving.
import jwt from 'jsonwebtoken';

/** Upstream `TOKEN_TTL` (`src/auth.ts`). */
export const SESSION_TOKEN_TTL = '12h';

/**
 * Sign a session token for an account, as `login()` would after a correct password.
 * @param user - the account to mint for.
 * @param keys - the gateway's JWT signing key.
 * @returns a signed session token.
 */
export function mintSessionToken(
  user: { id: number; username: string; credential_version: number },
  keys: { jwtSecret: string },
): string {
  return jwt.sign({ sub: String(user.id), username: user.username, cv: user.credential_version }, keys.jwtSecret, {
    expiresIn: SESSION_TOKEN_TTL,
  });
}
