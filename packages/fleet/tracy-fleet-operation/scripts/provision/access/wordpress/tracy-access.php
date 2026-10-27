<?php

/**
 * Plugin Name: Tracy Access for WordPress
 * Description: Signs a coworker in to their Tracy site's own copy from the assertion tracy-web signs
 *              for every request it proxies — no WordPress password — honouring the seat's tier.
 *              Keeps a small log of what people change in the admin, for Tracy's site changes.
 * Version:     0.4.0
 * License:     GPL-2.0-or-later
 *
 * A must-use plugin: it ships in wp-content/mu-plugins/, is always active, and cannot be turned
 * off from the admin — the clone's auto-login is not a thing an editor should be able to disable.
 *
 * This is WordPress's own implementation, kept deliberately SEPARATE from the Joomla plugin
 * (plg_system_tracyaccess). The two platforms share no code — only the contract and its test vectors
 * (packages/fleet/tracy-fleet-operation/test/fixtures/access-signature-vectors.json).
 *
 * TRUST MODEL (0.4.0). Only `x-tracy-assert` + `x-tracy-sig`: an assertion HMAC-signed by tracy-web
 * with this site's own key (`/run/tracy-access/key.json`, mounted read-only by the host), bound to
 * this site, host, method and target, 30 s, single-use nonce. The bare `x-tracy-email/tier/role`
 * headers are NOT read: any container that can reach this one could send them. No key or no valid
 * assertion → WordPress behaves as it would with no plugin. The Cloudflare Access JWT can only end a
 * session. Ships only to a site that has a key: `tools/resync-access-plugin.sh` checks readiness.
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Verifies a Cloudflare Access JWT in plain PHP over openssl — no library, no network, no cache.
 *
 * WordPress bundles no JWT verifier, and pulling one in would tie the clone to a Composer setup it
 * does not have. RS256 over openssl is the one primitive always present. WordPress's OWN copy of
 * the routine (the Joomla plugin has its own); shared code between the two platforms is out by
 * design, and a verifier is small enough to own twice rather than couple across a repo boundary.
 */
final class Tracy_Access_Jwt
{
    /**
     * The verified, lowercased email, or null — the only failure a caller sees (fail-closed).
     *
     * Null, not an error, for a valid token with no `email` claim: that is a service token (Tracy's
     * own programmatic reads), and a program must never have a WordPress user minted for it.
     *
     * @param array<int,array> $jwks the team's key set (the `keys` array from the certs endpoint)
     */
    public static function verified_email(string $token, array $jwks, string $expected_aud, string $expected_iss, int $now): ?string
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$raw_header, $raw_payload, $raw_signature] = $parts;

        $header = self::decode_json($raw_header);
        $payload = self::decode_json($raw_payload);
        if ($header === null || $payload === null) {
            return null;
        }

        // RS256 only. `alg: none` and an HMAC alg keyed on the public modulus are the two classic
        // JWT forgeries; naming the single algorithm we accept closes both.
        if (($header['alg'] ?? '') !== 'RS256' || !isset($header['kid'])) {
            return null;
        }

        $jwk = self::key_for_kid($jwks, (string) $header['kid']);
        if ($jwk === null) {
            return null;
        }

        $pem = self::jwk_to_pem($jwk);
        if ($pem === null) {
            return null;
        }

        $signature = self::base64url_decode($raw_signature);
        if (openssl_verify($raw_header . '.' . $raw_payload, $signature, $pem, OPENSSL_ALGO_SHA256) !== 1) {
            return null;
        }

        // The signature is genuine; now the claims. A valid signature over the wrong audience is a
        // token minted for another clone — replaying it here is exactly what `aud` stops.
        if (($payload['iss'] ?? '') !== $expected_iss) {
            return null;
        }
        if (!self::audience_matches($payload['aud'] ?? null, $expected_aud)) {
            return null;
        }
        if (!isset($payload['exp']) || (int) $payload['exp'] <= $now) {
            return null;
        }
        if (isset($payload['nbf']) && (int) $payload['nbf'] > $now) {
            return null;
        }

        $email = $payload['email'] ?? null;
        return is_string($email) && $email !== '' ? strtolower($email) : null;
    }

    /** `aud` may be a string or an array of strings; match either, in constant time. */
    private static function audience_matches($aud, string $expected): bool
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

    private static function key_for_kid(array $jwks, string $kid): ?array
    {
        foreach ($jwks as $key) {
            if (is_array($key) && ($key['kid'] ?? null) === $kid && ($key['kty'] ?? null) === 'RSA') {
                return $key;
            }
        }
        return null;
    }

    /**
     * An RSA public JWK (`n`, `e`) as a PEM, built by hand: the modulus and exponent wrapped in the
     * ASN.1 DER of a SubjectPublicKeyInfo. Two INTEGERs in a SEQUENCE, that inside a BIT STRING,
     * beside the rsaEncryption algorithm identifier, in an outer SEQUENCE.
     */
    private static function jwk_to_pem(array $jwk): ?string
    {
        if (!isset($jwk['n'], $jwk['e'])) {
            return null;
        }
        $modulus = self::base64url_decode((string) $jwk['n']);
        $exponent = self::base64url_decode((string) $jwk['e']);
        if ($modulus === '' || $exponent === '') {
            return null;
        }

        $rsa_public_key = self::der_sequence(self::der_integer($modulus) . self::der_integer($exponent));
        // OID 1.2.840.113549.1.1.1 (rsaEncryption) + NULL parameters.
        $algorithm = self::der_sequence("\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00");
        $spki = self::der_sequence($algorithm . self::der_bit_string($rsa_public_key));

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function der_length(int $length): string
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

    private static function der_integer(string $bytes): string
    {
        // A leading 0x80+ byte would read as negative, so prepend a zero to keep it positive.
        if ($bytes !== '' && (ord($bytes[0]) & 0x80)) {
            $bytes = "\x00" . $bytes;
        }
        return "\x02" . self::der_length(strlen($bytes)) . $bytes;
    }

    private static function der_sequence(string $contents): string
    {
        return "\x30" . self::der_length(strlen($contents)) . $contents;
    }

    private static function der_bit_string(string $contents): string
    {
        // The leading 0x00 is the "unused bits" count, always zero for a whole-byte payload.
        return "\x03" . self::der_length(strlen($contents) + 1) . "\x00" . $contents;
    }

    private static function base64url_decode(string $value): string
    {
        $padded = strtr($value, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);
        return $decoded === false ? '' : $decoded;
    }

    private static function decode_json(string $segment): ?array
    {
        $decoded = json_decode(self::base64url_decode($segment), true);
        return is_array($decoded) ? $decoded : null;
    }
}

/**
 * Verifies the assertion tracy-web signs for every request it proxies to this site (contract and
 * vectors: packages/fleet/tracy-fleet-operation/test/fixtures/access-signature-vectors.json).
 *
 * 🔒 WHY NOT THE BARE HEADERS ANY MORE. Every site's container could reach every other site's over a
 * shared Docker network, and `x-tracy-email/tier/role` were believed from whoever sent them: code in
 * one site made itself administrator of another. The assertion is HMAC-SHA256 under a key only this
 * site and tracy-web hold, bound to this site, the host and request it rides, and lives 30 seconds;
 * its nonce is accepted once. Kept apart from the Joomla copy on purpose, like the JWT verifier.
 */
final class Tracy_Access_Assertion
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
    public static function load_key(string $file): ?array
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

/** This site's access key, read once per request. Null: not issued yet — nobody is signed in. */
function tracy_access_site_key(): ?array
{
    static $key = false;
    if ($key === false) {
        $file = getenv('TRACY_ACCESS_KEY_FILE') ?: '/run/tracy-access/key.json';
        $key = Tracy_Access_Assertion::load_key($file);
    }
    return $key;
}

/**
 * Takes the assertion's nonce once, in `<prefix>tracy_access_nonce` (primary key on the nonce, so two
 * workers racing one nonce cannot both insert it). False on a replay AND on any store error: an
 * assertion that cannot be proven unused is refused.
 */
function tracy_access_take_nonce(string $nonce, int $exp): bool
{
    global $wpdb;
    if (!isset($wpdb) || !is_object($wpdb)) {
        return false;
    }
    $table = $wpdb->prefix . 'tracy_access_nonce';
    $quiet = $wpdb->suppress_errors(true);
    try {
        $row = ['nonce' => $nonce, 'exp' => $exp];
        $ok = $wpdb->insert($table, $row, ['%s', '%d']);
        if ($ok === false) {
            // First use on this site, or the table was dropped: create it and try once more. A replay
            // fails the second insert too.
            $wpdb->query("CREATE TABLE IF NOT EXISTS `$table` (
                nonce varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                exp int unsigned NOT NULL,
                PRIMARY KEY (nonce),
                KEY exp (exp)
            )");
            $ok = $wpdb->insert($table, $row, ['%s', '%d']);
        }
        if ($ok === false || (int) $ok !== 1) {
            return false;
        }
        if (random_int(1, 50) === 1) {
            $wpdb->query($wpdb->prepare("DELETE FROM `$table` WHERE exp < %d", time() - Tracy_Access_Assertion::SKEW));
        }
        return true;
    } catch (Throwable $e) {
        return false;
    } finally {
        $wpdb->suppress_errors($quiet);
    }
}

/**
 * The identity tracy-web vouched for on THIS request: verified claims, or null. Null for no assertion,
 * a bad one (reason logged with the kid, never the key), no key on this site, or a nonce seen before.
 */
function tracy_access_vouched(): ?array
{
    $assert = isset($_SERVER['HTTP_X_TRACY_ASSERT']) ? (string) $_SERVER['HTTP_X_TRACY_ASSERT'] : '';
    $sig = isset($_SERVER['HTTP_X_TRACY_SIG']) ? (string) $_SERVER['HTTP_X_TRACY_SIG'] : '';
    if ($assert === '' && $sig === '') {
        return null;
    }
    $key = tracy_access_site_key();
    if ($key === null) {
        error_log('tracy-access: assertion refused: this site has no access key');
        return null;
    }
    [$claims, $why] = Tracy_Access_Assertion::verify(
        $assert,
        $sig,
        $key,
        (string) ($_SERVER['HTTP_HOST'] ?? ''),
        (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
        (string) ($_SERVER['REQUEST_URI'] ?? ''),
        time()
    );
    if ($claims === null) {
        error_log('tracy-access: assertion refused (' . $why . ', kid ' . $key['kid'] . ')');
        return null;
    }
    if (!tracy_access_take_nonce($claims['nonce'], $claims['exp'])) {
        error_log('tracy-access: assertion refused (replay or nonce store error, kid ' . $key['kid'] . ')');
        return null;
    }
    return $claims;
}

/**
 * The email from the Cloudflare Access JWT, or null — the legacy path of a clone still fronted by
 * Access. It carries no tier and no role, so it can END a matching session but never start one.
 */
function tracy_access_email_from_jwt(): ?string
{
    $token = isset($_SERVER['HTTP_CF_ACCESS_JWT_ASSERTION']) ? (string) $_SERVER['HTTP_CF_ACCESS_JWT_ASSERTION'] : '';
    if ($token === '') {
        return null;
    }
    $aud = trim((string) get_option('tracy_access_aud', ''));
    $team_domain = trim((string) get_option('tracy_access_team_domain', ''));
    if ($aud === '' || $team_domain === '') {
        return null;
    }
    $jwks = tracy_access_jwks($team_domain);
    if ($jwks === null) {
        return null;
    }
    return Tracy_Access_Jwt::verified_email($token, $jwks, $aud, 'https://' . $team_domain, time());
}

/** True when `$user` is an account this plugin created (not the customer's own). */
function tracy_access_created_user(WP_User $user): bool
{
    return (bool) get_user_meta($user->ID, 'tracy_access_created', true);
}

/**
 * Signs the vouched-for person in, on every request, honouring their tier.
 *
 * On `init` and not later: `wp-admin/admin.php` loads WordPress (which fires `init`) and then calls
 * `auth_redirect()` straight away, before `admin_init` — so the sign-in has to be complete by the
 * end of `init`. Logs the person in through WordPress's real machinery (`wp_set_auth_cookie`).
 *
 * ⚠ SETTING THE COOKIE IS NOT ENOUGH FOR THE REQUEST THAT SET IT (#339): see `tracy_access_sign_in`.
 *
 * No assertion, or one that fails: WordPress behaves as it always would (an existing session of the
 * customer's own stays). A valid assertion that is not `editor` — a viewer, a lost seat (anonymous
 * `guest`) — ends the session of the person it names AND any session of an account this plugin
 * created, so a revoked seat does not outlive its CMS cookie.
 */
function tracy_access_sync_identity(): void
{
    $claims = tracy_access_vouched();
    $current = wp_get_current_user();
    $signed_in = $current instanceof WP_User && $current->ID > 0;

    if ($claims === null) {
        $jwt_email = tracy_access_email_from_jwt();
        if ($jwt_email !== null && $signed_in && strtolower((string) $current->user_email) === $jwt_email) {
            wp_logout();
        }
        return;
    }

    $email = strtolower($claims['email']);
    $signed_in_as_them = $signed_in && $email !== '' && strtolower((string) $current->user_email) === $email;

    if ($claims['tier'] !== 'editor') {
        if ($signed_in_as_them || ($signed_in && tracy_access_created_user($current))) {
            wp_logout();
        }
        return;
    }

    $user = tracy_access_user_for_email($email, $claims['role']);
    if ($user === null || $signed_in_as_them) {
        return;
    }

    // Someone else holds this browser's session: clear it before the new identity takes over, so
    // two people sharing a machine never share a login.
    if ($signed_in) {
        wp_logout();
    }

    tracy_access_sign_in($user);
}

/**
 * Logs `$user` in for this response AND this request.
 *
 * The cookie values are the ones `wp_set_auth_cookie` itself minted — captured from its own
 * `set_auth_cookie`/`set_logged_in_cookie` actions, so the scheme (`auth` or `secure_auth`), the
 * expiry and the session token are WordPress's, not recomputed here — and are copied into `$_COOKIE`
 * only when `send_auth_cookies` let WordPress send them. That answer is recorded from the filter
 * run `wp_set_auth_cookie` itself made (last, at `PHP_INT_MAX`), never asked a second time: a
 * stateful filter could answer differently. A site (or plugin) that refuses to send auth cookies
 * gets no request-side cookie either: this never grants more than the browser holds.
 * `auth_redirect()` still runs and still validates the cookie (signature, expiry, session token);
 * nothing here skips it.
 */
function tracy_access_sign_in(WP_User $user): void
{
    $minted = [];
    $capture_auth = static function ($cookie, $expire, $expiration, $user_id, $scheme, $token = '') use (&$minted): void {
        $minted['auth'] = [(string) $cookie, (int) $expire, (int) $expiration, (int) $user_id, (string) $scheme, (string) $token];
    };
    $capture_logged_in = static function ($cookie) use (&$minted): void {
        $minted['logged_in'] = (string) $cookie;
    };
    $capture_send = static function ($send) use (&$minted) {
        $minted['sent'] = (bool) $send;
        return $send;
    };
    add_action('set_auth_cookie', $capture_auth, PHP_INT_MAX, 6);
    add_action('set_logged_in_cookie', $capture_logged_in, PHP_INT_MAX, 1);
    add_filter('send_auth_cookies', $capture_send, PHP_INT_MAX, 1);

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);

    remove_action('set_auth_cookie', $capture_auth, PHP_INT_MAX);
    remove_action('set_logged_in_cookie', $capture_logged_in, PHP_INT_MAX);
    remove_filter('send_auth_cookies', $capture_send, PHP_INT_MAX);

    // Only what `wp_set_auth_cookie` decided to send on the response reaches this request.
    if (isset($minted['auth']) && ($minted['sent'] ?? false)) {
        [$cookie, , , , $scheme] = $minted['auth'];
        $_COOKIE[$scheme === 'secure_auth' ? SECURE_AUTH_COOKIE : AUTH_COOKIE] = $cookie;
        if (isset($minted['logged_in'])) {
            $_COOKIE[LOGGED_IN_COOKIE] = $minted['logged_in'];
        }
    }

    do_action('wp_login', $user->user_login, $user);
}

/**
 * The WordPress role a vouched seat maps to (ADR 0085): owner/admin run the site → `administrator`;
 * everyone else gets the configured work role.
 */
function tracy_access_role_for_seat(string $seat_role): string
{
    return $seat_role === 'owner' || $seat_role === 'admin' ? 'administrator' : tracy_access_work_role();
}

/**
 * The WordPress user for this email, created the first time they open the clone.
 *
 * Lazy on purpose: a seat is not a WordPress account until its holder arrives. The password is long,
 * random and never used. An account THIS plugin created follows the seat both ways (a demoted owner
 * loses `administrator`); the customer's own account with the same email is only ever upgraded —
 * never demote a role a person was given by hand on the site itself.
 */
function tracy_access_user_for_email(string $email, string $seat_role): ?WP_User
{
    $mapped = tracy_access_role_for_seat($seat_role);
    $existing = get_user_by('email', $email);
    if ($existing instanceof WP_User) {
        $has = (array) $existing->roles;
        if (tracy_access_created_user($existing)) {
            if ($has !== [$mapped]) {
                $existing->set_role($mapped);
            }
        } elseif ($mapped === 'administrator' && !in_array('administrator', $has, true)) {
            $existing->set_role('administrator');
        }
        return $existing;
    }

    $user_id = wp_insert_user([
        'user_login' => tracy_access_login_from_email($email),
        'user_email' => $email,
        'user_pass' => wp_generate_password(64, true, true),
        'display_name' => $email,
        'role' => $mapped,
    ]);
    if (is_wp_error($user_id)) {
        return null;
    }
    // A user WordPress made carries a marker, so a later cleanup can tell Tracy's rows from the
    // customer's own accounts — the same intent as the Joomla plugin's `tracyaccess_created` param.
    update_user_meta($user_id, 'tracy_access_created', 1);

    $user = get_user_by('id', $user_id);
    return $user instanceof WP_User ? $user : null;
}

/** A unique, valid login derived from the email — WordPress needs a login even when it keys on email. */
function tracy_access_login_from_email(string $email): string
{
    $base = sanitize_user(current(explode('@', $email)), true);
    if ($base === '') {
        $base = 'coworker';
    }
    $login = $base;
    $suffix = 1;
    while (get_user_by('login', $login) instanceof WP_User) {
        $login = $base . '-' . (++$suffix);
    }
    return $login;
}

/** The role a signed-in editor gets. Set by provision; `editor` when unset. Ignored if not a real role. */
function tracy_access_work_role(): string
{
    $role = trim((string) get_option('tracy_access_work_role', 'editor')) ?: 'editor';
    return wp_roles()->is_role($role) ? $role : 'editor';
}

/**
 * The team's Access signing keys, cached in a transient.
 *
 * Fetched from the team's own certs endpoint. Cached for a day so a request is not a fetch, but a
 * stale-cache miss (a key rotated since) falls through to a live fetch rather than fail. Returns
 * null when there is no usable key set at all — fail-closed, so a fetch outage denies rather than
 * admits.
 */
function tracy_access_jwks(string $team_domain): ?array
{
    $cache_key = 'tracy_access_jwks_' . substr(sha1($team_domain), 0, 12);
    $cached = get_transient($cache_key);
    if (is_array($cached) && !empty($cached)) {
        return $cached;
    }

    $response = wp_remote_get('https://' . $team_domain . '/cdn-cgi/access/certs', ['timeout' => 5]);
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        return null;
    }
    $body = json_decode((string) wp_remote_retrieve_body($response), true);
    $keys = is_array($body) && isset($body['keys']) && is_array($body['keys']) ? $body['keys'] : null;
    if ($keys === null || $keys === []) {
        return null;
    }

    set_transient($cache_key, $keys, DAY_IN_SECONDS);
    return $keys;
}

add_action('init', 'tracy_access_sync_identity', 1);

/**
 * No WordPress toolbar on the front end, for anyone (Akemi, 29/09/2026).
 *
 * This plugin signs a seat holder in as `editor`, and WordPress draws its toolbar for any signed-in
 * editor — so inside Tracy's frame a customer's page opened with a strip of WordPress icons across
 * the top, and the page pushed 32 px down (measured on kineticakemi.tracy.site). Joomla shows no
 * toolbar on its site pages, and Tracy's own frame is where editing happens, so the WordPress site
 * looks the same as its Joomla peers. `/wp-admin/` keeps its own toolbar: this filter only governs
 * the front end.
 *
 * Filtered rather than hidden with CSS: turned off here, WordPress also drops the `admin-bar` body
 * class and the 32 px margin that themes offset their headers by, so no theme is left with a gap.
 * PHP_INT_MAX so a theme's own `show_admin_bar` filter cannot turn it back on.
 */
add_filter('show_admin_bar', static fn (): bool => false, PHP_INT_MAX);

/*
 * ── Admin log ────────────────────────────────────────────────────────────────────────────────────
 *
 * What a PERSON changed in this WordPress outside Tracy's chat — a page saved in the editor, a
 * menu reordered, a plugin switched on, the site title changed — one row each in
 * `<prefix>tracy_admin_log`. WordPress keeps no admin log of its own (Joomla and EmDash do), so
 * this is the WordPress half of site changes plan §6 P2.1. Tracy's host READS the table
 * (`scripts/webroot/cms-log-wordpress.php`, mapped by `apps/tracy-host/src/cms-log.js`, which owns
 * the column contract); nothing here talks to Tracy, holds a token, or knows Tracy's address.
 *
 * NOT TRACY'S OWN WRITES. Tracy's agent edits through the Claude Cowork Apply door
 * (`admin-ajax.php?action=claude_cowork`) and through WP-CLI; both would fire the same hooks, so
 * both are skipped here — by the request, never by the `x-tracy-email` header: that header names
 * the person who opened this admin through Tracy, which is exactly the person this log is for.
 * WP-CLI run by someone over SSH is skipped too; the two cannot be told apart (a stated limit).
 *
 * WHO. The signed-in WordPress user (id + display name), never mapped to a Tracy seat. A row with
 * no user is kept only from WP-Cron — an automatic core/plugin/theme update, a scheduled post going
 * live — because that change is real and nobody typed it. A visitor's request (a form plugin
 * saving an entry, a customer placing an order) changes no site content anyone edits, so only a
 * user who can `edit_posts` is logged.
 *
 * WHAT. Names and ids only: a post's title, a menu's name, a plugin's name. Never post content,
 * never an option's value.
 *
 * WHICH HOOK WROTE IT (schema 2, Site changes V2). Each row names its producer: this file's version
 * (`TRACY_ADMIN_LOG_PRODUCER`), the sha256 of this file, and `context` = `cron` when it was written
 * inside WP-Cron. Tracy reads "no user + cron" as Automatic only when the row itself says so (rows
 * of schema 1 rest on this file's history: every version that wrote the table had the same gate).
 * No new request context is recorded for a signed-in user; `cron` is the only one this hook checks.
 *
 * NEVER IN THE WAY. One INSERT per logged action (plus one DELETE once the ring is full); every
 * database error is swallowed, every exception caught — a log that broke a customer's save would
 * be worse than no log. The table is created on first use and again if it was dropped.
 */

const TRACY_ADMIN_LOG_SCHEMA = '2';
/** This hook's version as each row records it (`producer_version`); keep it equal to `Version:` above. */
const TRACY_ADMIN_LOG_PRODUCER = '0.4.0';
/** Rows kept. The host pulls every few minutes; 5000 is weeks of a busy admin. */
const TRACY_ADMIN_LOG_KEEP = 5000;

/**
 * Options a person changes from Settings or the Customizer that change what the site shows.
 * Everything else (`cron`, `_transient_*`, `active_plugins`, …) is WordPress talking to itself,
 * or is logged by a more precise hook (plugins). `custom_logo` normally lives in the theme mods;
 * it is listed for themes that keep it as an option.
 */
const TRACY_ADMIN_LOG_OPTIONS = [
    'blogname' => 'Site Title',
    'blogdescription' => 'Tagline',
    'show_on_front' => 'Your homepage displays',
    'page_on_front' => 'Homepage',
    'page_for_posts' => 'Posts page',
    'site_icon' => 'Site Icon',
    'custom_logo' => 'Logo',
];

/** Post types that are WordPress bookkeeping, not something a person edits as such. */
const TRACY_ADMIN_LOG_INTERNAL_TYPES = [
    'revision', 'nav_menu_item', 'customize_changeset', 'oembed_cache', 'user_request',
    'wp_font_face', 'wp_font_family',
];

/** True for a request whose writes are Tracy's own (the Apply door) or a shell's (WP-CLI). */
function tracy_admin_log_is_tracy_request(): bool
{
    if (defined('WP_CLI') && WP_CLI) {
        return true;
    }
    return defined('DOING_AJAX') && DOING_AJAX && (string) ($_REQUEST['action'] ?? '') === 'claude_cowork';
}

/**
 * Writes one row, or nothing. `$resource_type`+`$resource_id` is logged once per request: saving
 * a menu fires `wp_update_nav_menu` twice, and the Customizer writes the theme mods once per
 * setting — one Save is one row, and the first op seen (`create` before `update`) wins.
 */
function tracy_admin_log(string $type, string $resource_type, string $resource_id, string $title, string $op): void
{
    static $seen = [];
    try {
        if (tracy_admin_log_is_tracy_request() || (function_exists('wp_installing') && wp_installing())) {
            return;
        }
        $user = wp_get_current_user();
        $user_id = $user instanceof WP_User ? (int) $user->ID : 0;
        if ($user_id === 0) {
            if (!(defined('DOING_CRON') && DOING_CRON)) {
                return;
            }
        } elseif (!current_user_can('edit_posts')) {
            return;
        }
        $key = $resource_type . "\0" . $resource_id;
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        tracy_admin_log_insert([
            'at' => gmdate('Y-m-d H:i:s'),
            'user_id' => $user_id,
            'user_name' => $user_id ? tracy_admin_log_clip((string) $user->display_name, 250) : '',
            'type' => tracy_admin_log_clip($type, 64),
            'resource_type' => tracy_admin_log_clip($resource_type, 64),
            'resource_id' => tracy_admin_log_clip($resource_id, 191),
            'resource_title' => tracy_admin_log_clip($title, 255),
            'op' => $op,
            'producer_version' => TRACY_ADMIN_LOG_PRODUCER,
            'producer_hash' => tracy_admin_log_producer_hash(),
            'context' => (defined('DOING_CRON') && DOING_CRON) ? 'cron' : '',
        ]);
    } catch (Throwable $e) {
        // Swallowed on purpose: see "NEVER IN THE WAY" above.
    }
}

/** sha256 of this file, read once per request; '' when the file cannot be read. */
function tracy_admin_log_producer_hash(): string
{
    static $hash = null;
    if ($hash === null) {
        $hash = is_file(__FILE__) ? (string) hash_file('sha256', __FILE__) : '';
    }
    return $hash;
}

function tracy_admin_log_clip(string $value, int $length): string
{
    $value = trim($value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
}

/** INSERT, creating the table first when this site has never had it or it was dropped since. */
function tracy_admin_log_insert(array $row): void
{
    global $wpdb;
    if (!isset($wpdb) || !is_object($wpdb)) {
        return;
    }
    $table = $wpdb->prefix . 'tracy_admin_log';
    $quiet = $wpdb->suppress_errors(true);
    try {
        $formats = ['%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s'];
        $schema = get_option('tracy_admin_log_schema');
        if ($schema !== TRACY_ADMIN_LOG_SCHEMA) {
            // A table an older schema created gets the new columns; a new one is created with them.
            tracy_admin_log_create($table, $schema !== false);
        }
        $ok = $wpdb->insert($table, $row, $formats);
        if ($ok === false) {
            // The option says the table exists but the INSERT failed: dropped by hand, restored
            // from an older dump, or missing a column. Create it (IF NOT EXISTS: harmless when it is
            // there), add the columns (each ALTER fails harmlessly when it has them) and retry once.
            tracy_admin_log_create($table, true);
            $ok = $wpdb->insert($table, $row, $formats);
        }
        $id = $ok === false ? 0 : (int) $wpdb->insert_id;
        if ($id > TRACY_ADMIN_LOG_KEEP) {
            $wpdb->query($wpdb->prepare("DELETE FROM `$table` WHERE id <= %d", $id - TRACY_ADMIN_LOG_KEEP));
        }
    } finally {
        $wpdb->suppress_errors($quiet);
    }
}

/**
 * The table. 🔒 Its columns are the contract the host reads (`mapWordpress` in
 * apps/tracy-host/src/cms-log.js): change one only together with that reader.
 */
function tracy_admin_log_create(string $table, bool $upgrade = false): void
{
    global $wpdb;
    $wpdb->query(
        "CREATE TABLE IF NOT EXISTS `$table` (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            at datetime NOT NULL,
            user_id bigint(20) unsigned NOT NULL DEFAULT 0,
            user_name varchar(250) NOT NULL DEFAULT '',
            type varchar(64) NOT NULL DEFAULT '',
            resource_type varchar(64) NOT NULL DEFAULT '',
            resource_id varchar(191) NOT NULL DEFAULT '',
            resource_title varchar(255) NOT NULL DEFAULT '',
            op varchar(16) NOT NULL DEFAULT '',
            producer_version varchar(32) NOT NULL DEFAULT '',
            producer_hash varchar(64) NOT NULL DEFAULT '',
            context varchar(16) NOT NULL DEFAULT '',
            PRIMARY KEY  (id)
        ) " . $wpdb->get_charset_collate()
    );
    if ($upgrade) {
        // Schema 1 → 2. One statement per column: MySQL has no ADD COLUMN IF NOT EXISTS, and one
        // column already there must not stop the others. Errors are suppressed by the caller.
        foreach (['producer_version' => 32, 'producer_hash' => 64, 'context' => 16] as $column => $length) {
            $wpdb->query("ALTER TABLE `$table` ADD COLUMN $column varchar($length) NOT NULL DEFAULT ''");
        }
    }
    update_option('tracy_admin_log_schema', TRACY_ADMIN_LOG_SCHEMA, true);
}

/** A post that is bookkeeping: an autosave, a revision, an unsaved draft, an internal type. */
function tracy_admin_log_skips_post($post): bool
{
    return !($post instanceof WP_Post)
        || in_array($post->post_type, TRACY_ADMIN_LOG_INTERNAL_TYPES, true)
        || $post->post_status === 'auto-draft'
        || wp_is_post_revision($post)
        || wp_is_post_autosave($post);
}

/**
 * A post, page, template, … saved. Its first real save — out of the `auto-draft` the editor opens
 * with — is the `create`. Moving it to or out of the trash is logged by the trash hooks instead
 * (they fire this one too), and an attachment's first save is the upload (`add_attachment`).
 *
 * The block editor's Save is TWO requests: the REST save, then `post.php?meta-box-loader=1`
 * saving the classic meta boxes of the same post (measured on WordPress 7.1.2: one click, two
 * `wp_after_insert_post`). The REST save always comes first, so the follow-up is not logged.
 */
add_action('wp_after_insert_post', static function ($post_id, $post, $update, $post_before): void {
    if (tracy_admin_log_skips_post($post) || $post->post_status === 'trash' || !empty($_REQUEST['meta-box-loader'])) {
        return;
    }
    $before = $post_before instanceof WP_Post ? $post_before->post_status : null;
    if ($before === 'trash') {
        return;
    }
    $create = !$update || $before === 'auto-draft' || $before === null;
    if ($create && $post->post_type === 'attachment') {
        return;
    }
    tracy_admin_log('wp_after_insert_post', $post->post_type, (string) $post->ID, (string) $post->post_title, $create ? 'create' : 'update');
}, 10, 4);

add_action('trashed_post', static function ($post_id): void {
    $post = get_post($post_id);
    if (!tracy_admin_log_skips_post($post)) {
        tracy_admin_log('trashed_post', $post->post_type, (string) $post->ID, (string) $post->post_title, 'trash');
    }
}, 10, 1);

add_action('untrashed_post', static function ($post_id): void {
    $post = get_post($post_id);
    if (!tracy_admin_log_skips_post($post)) {
        tracy_admin_log('untrashed_post', $post->post_type, (string) $post->ID, (string) $post->post_title, 'restore');
    }
}, 10, 1);

/** Deleted for good. Attachments are logged by `delete_attachment`, which fires first. */
add_action('deleted_post', static function ($post_id, $post = null): void {
    if (!tracy_admin_log_skips_post($post) && $post->post_type !== 'attachment') {
        tracy_admin_log('deleted_post', $post->post_type, (string) $post->ID, (string) $post->post_title, 'delete');
    }
}, 10, 2);

add_action('add_attachment', static function ($post_id): void {
    $post = get_post($post_id);
    if ($post instanceof WP_Post) {
        tracy_admin_log('add_attachment', 'attachment', (string) $post->ID, (string) $post->post_title, 'upload');
    }
}, 10, 1);

add_action('delete_attachment', static function ($post_id, $post = null): void {
    $post = $post instanceof WP_Post ? $post : get_post($post_id);
    if ($post instanceof WP_Post) {
        tracy_admin_log('delete_attachment', 'attachment', (string) $post->ID, (string) $post->post_title, 'delete');
    }
}, 10, 2);

/** Menus: the menu itself, named. Its items are `nav_menu_item` posts, skipped above. */
function tracy_admin_log_menu(string $type, $menu_id, string $op, string $name = ''): void
{
    if ($name === '' && function_exists('wp_get_nav_menu_object')) {
        $menu = wp_get_nav_menu_object((int) $menu_id);
        $name = $menu ? (string) $menu->name : '';
    }
    tracy_admin_log($type, 'nav_menu', (string) (int) $menu_id, $name, $op);
}

add_action('wp_create_nav_menu', static function ($menu_id, $data = []): void {
    tracy_admin_log_menu('wp_create_nav_menu', $menu_id, 'create', (string) ($data['menu-name'] ?? ''));
}, 10, 2);

add_action('wp_update_nav_menu', static function ($menu_id, $data = []): void {
    tracy_admin_log_menu('wp_update_nav_menu', $menu_id, 'update', (string) (is_array($data) ? ($data['menu-name'] ?? '') : ''));
}, 10, 2);

/** `delete_nav_menu` (the taxonomy's own delete hook) still carries the deleted menu's name. */
add_action('delete_nav_menu', static function ($term_id, $tt_id = 0, $deleted = null): void {
    tracy_admin_log_menu('delete_nav_menu', $term_id, 'delete', is_object($deleted) ? (string) $deleted->name : '');
}, 10, 3);

add_action('switch_theme', static function ($new_name, $new_theme = null): void {
    $slug = is_object($new_theme) && method_exists($new_theme, 'get_stylesheet') ? (string) $new_theme->get_stylesheet() : '';
    tracy_admin_log('switch_theme', 'theme', $slug, (string) $new_name, 'switch');
}, 10, 2);

/** A plugin's display name from its header; the file name when the header cannot be read. */
function tracy_admin_log_plugin_name(string $plugin): string
{
    $file = (defined('WP_PLUGIN_DIR') ? WP_PLUGIN_DIR : '') . '/' . $plugin;
    if (function_exists('get_plugin_data') && is_file($file)) {
        $name = (string) (get_plugin_data($file, false, false)['Name'] ?? '');
        if ($name !== '') {
            return $name;
        }
    }
    return $plugin;
}

add_action('activated_plugin', static function ($plugin): void {
    tracy_admin_log('activated_plugin', 'plugin', (string) $plugin, tracy_admin_log_plugin_name((string) $plugin), 'activate');
}, 10, 1);

add_action('deactivated_plugin', static function ($plugin): void {
    tracy_admin_log('deactivated_plugin', 'plugin', (string) $plugin, tracy_admin_log_plugin_name((string) $plugin), 'deactivate');
}, 10, 1);

/**
 * Core, plugin and theme installs and updates, by a person or by WP-Cron's automatic updates (no
 * user). One row per item. Translation updates are left out: they change no page anyone edits.
 *
 * The op is the upgrader's own `action`: `update` for an update (auto-update included), `install`
 * otherwise. Until 0.3.1 every row said `install`, so an automatic plugin update read "Installed
 * plugin …" in Site changes (found in the V2 round, 02/10).
 */
add_action('upgrader_process_complete', static function ($upgrader, $extra = []): void {
    $kind = (string) ($extra['type'] ?? '');
    $op = (string) ($extra['action'] ?? '') === 'update' ? 'update' : 'install';
    if ($kind === 'core') {
        tracy_admin_log('upgrader_process_complete', 'core', 'wordpress', 'WordPress', $op);
        return;
    }
    $items = [];
    if ($kind === 'plugin') {
        $items = (array) ($extra['plugins'] ?? (isset($extra['plugin']) ? [$extra['plugin']] : []));
        if ($items === [] && is_object($upgrader) && method_exists($upgrader, 'plugin_info')) {
            $items = array_filter([(string) $upgrader->plugin_info()]);
        }
        foreach ($items as $plugin) {
            tracy_admin_log('upgrader_process_complete', 'plugin', (string) $plugin, tracy_admin_log_plugin_name((string) $plugin), $op);
        }
    } elseif ($kind === 'theme') {
        $items = (array) ($extra['themes'] ?? (isset($extra['theme']) ? [$extra['theme']] : []));
        if ($items === [] && is_object($upgrader) && method_exists($upgrader, 'theme_info')) {
            $theme = $upgrader->theme_info();
            $items = is_object($theme) && method_exists($theme, 'get_stylesheet') ? [$theme->get_stylesheet()] : [];
        }
        foreach ($items as $slug) {
            $theme = function_exists('wp_get_theme') ? wp_get_theme((string) $slug) : null;
            $name = is_object($theme) && $theme->exists() ? (string) $theme->get('Name') : (string) $slug;
            tracy_admin_log('upgrader_process_complete', 'theme', (string) $slug, $name, $op);
        }
    }
}, 10, 2);

/**
 * A whitelisted option, or the ACTIVE theme's mods (the Customizer, the logo), changed. Both
 * `updated_option` and `added_option`: an option saved for the first time (the first Site Icon,
 * a theme's first Customizer save) is added, not updated. Only fires when the value really changed.
 *
 * The theme mods count only inside a Customizer publish (`customize_save`). `switch_theme()` and
 * the next admin request's `check_theme_switched()` write them too (sidebars, a block theme's
 * classic sidebars) — measured on WordPress 7.1.2: four such writes around two switches, each of
 * which would have read as a Customizer save. The switch is logged by `switch_theme`.
 */
function tracy_admin_log_option(string $hook, $option): void
{
    $option = (string) $option;
    if (isset(TRACY_ADMIN_LOG_OPTIONS[$option])) {
        tracy_admin_log($hook, 'option', $option, TRACY_ADMIN_LOG_OPTIONS[$option], $hook === 'added_option' ? 'create' : 'update');
        return;
    }
    if (did_action('customize_save') && function_exists('get_stylesheet') && $option === 'theme_mods_' . get_stylesheet()) {
        tracy_admin_log($hook, 'theme_mods', get_stylesheet(), 'Customizer', 'update');
    }
}

add_action('updated_option', static function ($option): void {
    tracy_admin_log_option('updated_option', $option);
}, 10, 1);

add_action('added_option', static function ($option): void {
    tracy_admin_log_option('added_option', $option);
}, 10, 1);
