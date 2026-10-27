<?php

/**
 * @package     Tracy Access for Joomla
 * @copyright   (C) 2026 Tracy
 * @license     GPL-2.0-or-later
 */

/**
 * Verifies a Cloudflare Access JWT, in plain PHP with no library.
 *
 * Joomla ships a JWT library, but WHICH one changes between generations — 4.x carries web-token,
 * others lcobucci, and this plugin is meant to run on a clone whatever version it is. RS256 over
 * openssl is the one thing that does not move: verify the signature, then read the claims.
 *
 * No Joomla dependency, so it is tested on its own (see tests/run.php). It fetches nothing and
 * caches nothing — the caller hands it a key set. That keeps the network out of the part that
 * decides whether to trust a token.
 */
final class AccessJwt
{
    /**
     * The verified email, or null. Null is the only failure a caller ever sees.
     *
     * Fail-closed on purpose: a token that cannot be proven is a token that is not there. The
     * one caller (the plugin) treats null as "show the normal login", never as "let them in".
     *
     * Null — not an error — for a token that is valid but carries no `email` claim. That is what
     * a service-token request looks like (Tracy's own reads, authenticated by client id/secret,
     * whose JWT has `common_name` and no email). Auto-login is for people; a program that reached
     * the origin by service token must not have a Joomla user minted for it.
     *
     * @param string             $token        the raw `Cf-Access-Jwt-Assertion` header
     * @param array<int,array>   $jwks         the team's key set (`keys` array from the certs endpoint)
     * @param string             $expectedAud  this clone's Access application tag
     * @param string             $expectedIss  `https://<team_domain>`
     * @param int                $now          current unix time (injectable for tests)
     */
    public static function verifiedEmail(
        string $token,
        array $jwks,
        string $expectedAud,
        string $expectedIss,
        int $now
    ): ?string {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$rawHeader, $rawPayload, $rawSignature] = $parts;

        $header = self::decodeJson($rawHeader);
        $payload = self::decodeJson($rawPayload);
        if ($header === null || $payload === null) {
            return null;
        }

        // RS256 only. Accepting `alg: none`, or an HMAC alg whose "key" is the public modulus,
        // are the two classic JWT forgeries; naming the one algorithm we accept closes both.
        if (($header['alg'] ?? '') !== 'RS256' || !isset($header['kid'])) {
            return null;
        }

        $jwk = self::keyForKid($jwks, (string) $header['kid']);
        if ($jwk === null) {
            return null;
        }

        $pem = self::jwkToPem($jwk);
        if ($pem === null) {
            return null;
        }

        $signature = self::base64UrlDecode($rawSignature);
        $ok = openssl_verify($rawHeader . '.' . $rawPayload, $signature, $pem, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            return null;
        }

        // Signature is genuine — now the claims. A valid signature over the wrong audience is a
        // token minted for another clone, and replaying it here is exactly what `aud` stops.
        if (($payload['iss'] ?? '') !== $expectedIss) {
            return null;
        }
        if (!self::audienceMatches($payload['aud'] ?? null, $expectedAud)) {
            return null;
        }
        if (!isset($payload['exp']) || (int) $payload['exp'] <= $now) {
            return null;
        }
        // `nbf` is optional; honour it when present.
        if (isset($payload['nbf']) && (int) $payload['nbf'] > $now) {
            return null;
        }

        $email = $payload['email'] ?? null;
        return is_string($email) && $email !== '' ? strtolower($email) : null;
    }

    /** `aud` may be a string or an array of strings; match either. */
    private static function audienceMatches($aud, string $expected): bool
    {
        if (is_string($aud)) {
            return hash_equals($expected, $aud);
        }
        if (is_array($aud)) {
            foreach ($aud as $one) {
                if (is_string($one) && hash_equals($expected, $one)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static function keyForKid(array $jwks, string $kid): ?array
    {
        foreach ($jwks as $key) {
            if (is_array($key) && ($key['kid'] ?? null) === $kid && ($key['kty'] ?? null) === 'RSA') {
                return $key;
            }
        }
        return null;
    }

    /**
     * An RSA public JWK (`n`, `e`) as a PEM, built by hand.
     *
     * openssl wants a key, and a JWK is not one — the modulus and exponent have to be wrapped in
     * the ASN.1 DER of a SubjectPublicKeyInfo. It is mechanical: two INTEGERs in a SEQUENCE, that
     * SEQUENCE inside a BIT STRING, beside the RSA algorithm identifier, in an outer SEQUENCE.
     */
    private static function jwkToPem(array $jwk): ?string
    {
        if (!isset($jwk['n'], $jwk['e'])) {
            return null;
        }
        $modulus = self::base64UrlDecode((string) $jwk['n']);
        $exponent = self::base64UrlDecode((string) $jwk['e']);
        if ($modulus === '' || $exponent === '') {
            return null;
        }

        $rsaPublicKey = self::derSequence(
            self::derInteger($modulus) . self::derInteger($exponent)
        );
        // OID 1.2.840.113549.1.1.1 (rsaEncryption) + NULL parameters.
        $algorithm = self::derSequence(
            "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00"
        );
        $spki = self::derSequence($algorithm . self::derBitString($rsaPublicKey));

        $pem = "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($spki), 64, "\n")
            . "-----END PUBLIC KEY-----\n";

        return $pem;
    }

    private static function derLength(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }
        $bytes = '';
        while ($length > 0) {
            $bytes = chr($length & 0xff) . $bytes;
            $length >>= 8;
        }
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    private static function derInteger(string $bytes): string
    {
        // A leading 0x80+ byte would read as a negative integer, so prepend a zero to keep it
        // positive — the standard rule, and the one thing easy to get wrong here.
        if ($bytes !== '' && (ord($bytes[0]) & 0x80)) {
            $bytes = "\x00" . $bytes;
        }
        return "\x02" . self::derLength(strlen($bytes)) . $bytes;
    }

    private static function derSequence(string $contents): string
    {
        return "\x30" . self::derLength(strlen($contents)) . $contents;
    }

    private static function derBitString(string $contents): string
    {
        // The leading 0x00 is the "unused bits" count, always zero for a whole-byte payload.
        return "\x03" . self::derLength(strlen($contents) + 1) . "\x00" . $contents;
    }

    private static function base64UrlDecode(string $value): string
    {
        $padded = strtr($value, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);
        return $decoded === false ? '' : $decoded;
    }

    private static function decodeJson(string $segment): ?array
    {
        $decoded = json_decode(self::base64UrlDecode($segment), true);
        return is_array($decoded) ? $decoded : null;
    }
}
