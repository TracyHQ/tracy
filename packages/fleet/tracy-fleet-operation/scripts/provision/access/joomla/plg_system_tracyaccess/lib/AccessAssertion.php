<?php

/**
 * @package     Tracy Access for Joomla
 * @copyright   (C) 2026 Tracy
 * @license     GPL-2.0-or-later
 *
 * Verifies the assertion tracy-web signs for every request it proxies to this site. Joomla's own
 * copy (WordPress has its own in tracy-access.php); the two share only the contract and the test
 * vectors in packages/fleet/tracy-fleet-operation/test/fixtures/access-signature-vectors.json.
 * No Joomla dependency, so the vectors run against this file with plain PHP.
 */

final class TracyAccessAssertion
{
    const CONTEXT = 'tracy-site-access.v1.';
    const MAX_TTL = 60;
    const SKEW = 30;
    const ASSERT_MAX = 4096;
    const TIERS = ['editor', 'viewer', 'guest'];
    const ROLES = ['', 'owner', 'admin', 'developer', 'editor', 'viewer'];

    /**
     * `[claims, 'ok']`, or `[null, reason]` — reason is one of malformed, signature, version, claims,
     * kid, site, host, method, target, ttl, future, expired. `$key` is what `load_key` returns.
     */
    public static function verify(string $assert, string $sig, array $key, string $host, string $method, string $target, int $now): array
    {
        if ($assert === '' || strlen($assert) > self::ASSERT_MAX || !preg_match('/^[A-Za-z0-9_-]+$/D', $assert)
            || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $sig)) {
            return [null, 'malformed'];
        }
        // Compared as text, not decoded bytes: base64 ignores trailing bits, the text does not.
        $want = rtrim(strtr(base64_encode(hash_hmac('sha256', self::CONTEXT . $assert, $key['key'], true)), '+/', '-_'), '=');
        if (!hash_equals($want, $sig)) {
            return [null, 'signature'];
        }
        $json = base64_decode(strtr($assert, '-_', '+/'), true);
        $c = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($c)) {
            return [null, 'malformed'];
        }
        if (($c['v'] ?? null) !== 1) {
            return [null, 'version'];
        }
        foreach (['kid', 'site', 'email', 'role', 'tier', 'host', 'method', 'target', 'nonce'] as $field) {
            if (!isset($c[$field]) || !is_string($c[$field])) {
                return [null, 'claims'];
            }
        }
        if (!isset($c['iat'], $c['exp']) || !is_int($c['iat']) || !is_int($c['exp'])
            || !preg_match('/^[A-Za-z0-9_-]{16,64}$/D', $c['nonce'])
            || !in_array($c['tier'], self::TIERS, true) || !in_array($c['role'], self::ROLES, true)
            || ($c['email'] !== '' && (strpos($c['email'], '@') === false || strlen($c['email']) > 254))
            || ($c['tier'] === 'editor' && $c['email'] === '')) {
            return [null, 'claims'];
        }
        if (!hash_equals($key['kid'], $c['kid'])) {
            return [null, 'kid'];
        }
        if (!hash_equals($key['site'], $c['site'])) {
            return [null, 'site'];
        }
        if (strtolower($c['host']) !== strtolower($host)) {
            return [null, 'host'];
        }
        if ($c['method'] !== $method) {
            return [null, 'method'];
        }
        if ($c['target'] !== $target) {
            return [null, 'target'];
        }
        if ($c['exp'] <= $c['iat'] || $c['exp'] - $c['iat'] > self::MAX_TTL) {
            return [null, 'ttl'];
        }
        if ($c['iat'] > $now + self::SKEW) {
            return [null, 'future'];
        }
        if ($now > $c['exp'] + self::SKEW) {
            return [null, 'expired'];
        }
        return [$c, 'ok'];
    }

    /** `{kid, site, key}` from the key file the host mounts, or null when it is absent or not exactly that. */
    public static function loadKey(string $file): ?array
    {
        $raw = is_readable($file) ? @file_get_contents($file) : false;
        $doc = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($doc) || ($doc['v'] ?? null) !== 1 || !is_string($doc['kid'] ?? null) || $doc['kid'] === ''
            || !is_string($doc['site'] ?? null) || !preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/D', $doc['site'])
            || !is_string($doc['key'] ?? null)) {
            return null;
        }
        $key = base64_decode(strtr($doc['key'], '-_', '+/'), true);
        return is_string($key) && strlen($key) === 32 ? ['kid' => $doc['kid'], 'site' => $doc['site'], 'key' => $key] : null;
    }
}
