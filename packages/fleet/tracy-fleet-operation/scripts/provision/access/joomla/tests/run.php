<?php

/**
 * Tests for the Access JWT verifier, with real RS256 keys and real signatures.
 *
 *   php tests/run.php
 *
 * The signature is never faked: a plugin that trusts the wrong token lets a stranger into a copy
 * of the customer's whole site, so the one thing that must not be a mock is the crypto. Every
 * case here mints an actual key pair and signs with it.
 */
declare(strict_types=1);

require_once __DIR__ . '/../plg_system_tracyaccess/lib/AccessJwt.php';

$passed = 0;
$failed = 0;

function check(string $name, $got, $want): void
{
    global $passed, $failed;
    if ($got === $want) {
        $passed++;
        echo "  ok   $name\n";
    } else {
        $failed++;
        echo "  FAIL $name\n       got : " . var_export($got, true) . "\n       want: " . var_export($want, true) . "\n";
    }
}

function base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/** A JWK (public half) plus a signer, from a fresh RSA key pair. */
function makeKey(string $kid): array
{
    $res = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $details = openssl_pkey_get_details($res);
    $jwk = [
        'kty' => 'RSA',
        'kid' => $kid,
        'alg' => 'RS256',
        'n'   => base64url($details['rsa']['n']),
        'e'   => base64url($details['rsa']['e']),
    ];
    return ['jwk' => $jwk, 'key' => $res];
}

function mint($key, array $payload, array $headerOverride = []): string
{
    $header = array_merge(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $key['jwk']['kid']], $headerOverride);
    $signingInput = base64url(json_encode($header)) . '.' . base64url(json_encode($payload));
    openssl_sign($signingInput, $signature, $key['key'], OPENSSL_ALGO_SHA256);
    return $signingInput . '.' . base64url($signature);
}

$AUD = 'clone-aud-abc123';
$ISS = 'https://tracy-ai.cloudflareaccess.com';
$NOW = 1_800_000_000;
$key = makeKey('kid-1');
$jwks = [$key['jwk']];

$goodClaims = ['iss' => $ISS, 'aud' => $AUD, 'exp' => $NOW + 3600, 'email' => 'Coworker@Example.com'];

// ── the happy path ──────────────────────────────────────────────────────────────────────────
check(
    'a genuine token yields its email, lower-cased',
    AccessJwt::verifiedEmail(mint($key, $goodClaims), $jwks, $AUD, $ISS, $NOW),
    'coworker@example.com'
);

// ── forgeries the verifier must refuse ──────────────────────────────────────────────────────
$stranger = makeKey('kid-1'); // same kid, different key
check(
    'a signature by the wrong key is refused',
    AccessJwt::verifiedEmail(mint($stranger, $goodClaims), $jwks, $AUD, $ISS, $NOW),
    null
);

check(
    'alg none is refused even with a matching kid',
    AccessJwt::verifiedEmail(
        base64url(json_encode(['alg' => 'none', 'kid' => 'kid-1'])) . '.' . base64url(json_encode($goodClaims)) . '.',
        $jwks,
        $AUD,
        $ISS,
        $NOW
    ),
    null
);

check(
    'a token minted for another clone (wrong aud) is refused',
    AccessJwt::verifiedEmail(mint($key, array_merge($goodClaims, ['aud' => 'some-other-clone'])), $jwks, $AUD, $ISS, $NOW),
    null
);

check(
    'a wrong issuer is refused',
    AccessJwt::verifiedEmail(mint($key, array_merge($goodClaims, ['iss' => 'https://evil.example'])), $jwks, $AUD, $ISS, $NOW),
    null
);

check(
    'an expired token is refused',
    AccessJwt::verifiedEmail(mint($key, array_merge($goodClaims, ['exp' => $NOW - 1])), $jwks, $AUD, $ISS, $NOW),
    null
);

check(
    'a not-yet-valid token is refused',
    AccessJwt::verifiedEmail(mint($key, array_merge($goodClaims, ['nbf' => $NOW + 100])), $jwks, $AUD, $ISS, $NOW),
    null
);

check(
    'a kid with no matching key is refused',
    AccessJwt::verifiedEmail(mint($key, $goodClaims, ['kid' => 'kid-unknown']), $jwks, $AUD, $ISS, $NOW),
    null
);

// ── the service-token shape: valid, but no person behind it ─────────────────────────────────
check(
    'a valid token with no email claim yields null, not a user',
    AccessJwt::verifiedEmail(
        mint($key, ['iss' => $ISS, 'aud' => $AUD, 'exp' => $NOW + 3600, 'common_name' => 'tracy-service-token']),
        $jwks,
        $AUD,
        $ISS,
        $NOW
    ),
    null
);

// ── malformed input never throws ────────────────────────────────────────────────────────────
foreach (['', 'not-a-jwt', 'a.b', 'a.b.c.d', '...'] as $garbage) {
    check("malformed token is refused, not fatal: '$garbage'", AccessJwt::verifiedEmail($garbage, $jwks, $AUD, $ISS, $NOW), null);
}

// ── aud as an array (Cloudflare sometimes sends one) ────────────────────────────────────────
check(
    'aud given as an array matches when it contains the tag',
    AccessJwt::verifiedEmail(mint($key, array_merge($goodClaims, ['aud' => ['other', $AUD]])), $jwks, $AUD, $ISS, $NOW),
    'coworker@example.com'
);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
