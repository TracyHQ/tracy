<?php

/**
 * @package     Tracy Access for Joomla
 * @copyright   (C) 2026 Tracy
 * @license     GPL-2.0-or-later
 */

namespace Tracy\Plugin\System\TracyAccess\Extension;

use Joomla\CMS\Authentication\Authentication;
use Joomla\CMS\Authentication\AuthenticationResponse;
use Joomla\CMS\Factory;
use Joomla\CMS\Log\Log;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\CMS\User\User;
use Joomla\CMS\User\UserHelper;
use Joomla\Database\DatabaseAwareInterface;
use Joomla\Database\DatabaseAwareTrait;
use Joomla\Event\SubscriberInterface;

\defined('_JEXEC') or die;

/**
 * Signs a coworker in to their Tracy site's own copy, from the assertion tracy-web signs for every
 * request it proxies (0.2.0, P0 of the open-source line).
 *
 * 🔒 ONLY THE SIGNED ASSERTION IS BELIEVED. Every site's container could reach every other one over
 * a shared Docker network, and the bare `x-tracy-email/tier/role` headers made whoever sent them a
 * Super User. `x-tracy-assert` + `x-tracy-sig` are HMAC-SHA256 under this site's own key
 * (`/run/tracy-access/key.json`, mounted read-only by the host), bound to this site, host, method and
 * target, 30 s, single-use nonce (`#__tracyaccess_nonce`). No key, no valid assertion, or a nonce
 * already taken → Joomla behaves as it would without the plugin. The Cloudflare Access JWT can only
 * end a session, never start one.
 *
 * This plugin must never reach a customer's own site: it writes to `#__users`.
 */
final class TracyAccess extends CMSPlugin implements SubscriberInterface, DatabaseAwareInterface
{
    use DatabaseAwareTrait;

    /** JWKS is cached this long; Cloudflare rotates keys slowly and a miss refetches anyway. */
    private const JWKS_TTL = 86400;

    public static function getSubscribedEvents(): array
    {
        return ['onAfterInitialise' => 'onAfterInitialise'];
    }

    public function onAfterInitialise(): void
    {
        try {
            $this->syncIdentity();
        } catch (\Throwable $e) {
            // Never let this take a page down. A failure here means the normal Joomla login
            // screen, not a broken site — the same fail-closed rule the verifier follows.
            $this->warn('tracyaccess: ' . $e->getMessage());
        }
    }

    private function syncIdentity(): void
    {
        $app     = $this->getApplication();
        $current = $app->getIdentity();
        $signedIn = $current instanceof User && !$current->guest;
        $clientId = $app->isClient('administrator') ? 1 : 0;

        $claims = $this->vouched();
        if ($claims === null) {
            $jwtEmail = $this->emailFromAccessJwt();
            if ($jwtEmail !== null && $signedIn && strtolower((string) $current->email) === $jwtEmail) {
                $app->logout($current->id, ['clientid' => $clientId]);
            }
            return;
        }

        $email = strtolower($claims['email']);
        $signedInAsThem = $signedIn && $email !== '' && strtolower((string) $current->email) === $email;

        // A viewer, or a lost seat (anonymous `guest`): end the session of the person named AND any
        // session of an account this plugin made, so a revoked seat does not outlive its cookie.
        if ($claims['tier'] !== 'editor') {
            if ($signedInAsThem || ($signedIn && $this->createdHere($current))) {
                $app->logout($current->id, ['clientid' => $clientId]);
            }
            return;
        }

        // The public site stays as a visitor sees it: an editor is logged in to the administrator
        // only. A front-end login changed what Tracy's site preview shows — measured 27/09/2026 on a
        // Tracy Business Joomla site: core `System - Privacy Consent` (enabled there) sends every
        // logged-in user who has not consented to the profile edit form, on every page, so the
        // Browser tab showed that form instead of the site and nothing could be picked. Nothing on
        // the front end needs the login: editing goes through the administrator and the Cowork API.
        // A front-end login the person made themselves is left alone.
        if ($app->isClient('site')) {
            return;
        }

        $user = $this->userForEmail($email, $claims['role']);
        if ($user === null || $signedInAsThem) {
            return;
        }

        // Someone else is in this browser's session. Log them out first, so the new identity
        // does not inherit anything of the old one — two people sharing a machine must not
        // share a login.
        if ($signedIn) {
            $app->logout($current->id, ['clientid' => $clientId]);
        }

        $this->logIn($user);
    }

    /**
     * The verified claims tracy-web vouched for on THIS request, or null: no assertion, no key on
     * this site, a bad assertion (reason logged with the kid, never the key), or a nonce seen before.
     */
    private function vouched(): ?array
    {
        $assert = (string) ($_SERVER['HTTP_X_TRACY_ASSERT'] ?? '');
        $sig    = (string) ($_SERVER['HTTP_X_TRACY_SIG'] ?? '');
        if ($assert === '' && $sig === '') {
            return null;
        }
        require_once __DIR__ . '/../../lib/AccessAssertion.php';
        $key = \TracyAccessAssertion::loadKey(getenv('TRACY_ACCESS_KEY_FILE') ?: '/run/tracy-access/key.json');
        if ($key === null) {
            $this->warn('tracyaccess: assertion refused: this site has no access key');
            return null;
        }
        [$claims, $why] = \TracyAccessAssertion::verify(
            $assert,
            $sig,
            $key,
            (string) ($_SERVER['HTTP_HOST'] ?? ''),
            (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
            (string) ($_SERVER['REQUEST_URI'] ?? ''),
            time()
        );
        if ($claims === null) {
            $this->warn('tracyaccess: assertion refused (' . $why . ', kid ' . $key['kid'] . ')');
            return null;
        }
        if (!$this->takeNonce($claims['nonce'], $claims['exp'])) {
            $this->warn('tracyaccess: assertion refused (replay or nonce store error, kid ' . $key['kid'] . ')');
            return null;
        }
        return $claims;
    }

    /**
     * Takes the nonce once: a primary key on it, so two workers racing one assertion cannot both
     * insert. False on a replay AND on any store error — an assertion that cannot be proven unused is
     * refused. The table is created on first use.
     */
    private function takeNonce(string $nonce, int $exp): bool
    {
        $db = $this->getDatabase();
        $table = $db->quoteName('#__tracyaccess_nonce');
        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                $row = (object) ['nonce' => $nonce, 'exp' => $exp];
                $db->insertObject('#__tracyaccess_nonce', $row);
                if (random_int(1, 50) === 1) {
                    $db->setQuery('DELETE FROM ' . $table . ' WHERE ' . $db->quoteName('exp') . ' < ' . (time() - 30))->execute();
                }
                return true;
            } catch (\Throwable $e) {
                if ($attempt > 0) {
                    return false;
                }
                try {
                    $db->setQuery('CREATE TABLE IF NOT EXISTS ' . $table . ' ('
                        . ' nonce varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,'
                        . ' exp int unsigned NOT NULL, PRIMARY KEY (nonce), KEY exp (exp))')->execute();
                } catch (\Throwable $e2) {
                    return false;
                }
            }
        }
        return false;
    }

    /** True when `$user` is an account this plugin created (not the customer's own). */
    private function createdHere(User $user): bool
    {
        return (int) $user->getParam('tracyaccess_created', 0) === 1;
    }

    /**
     * Logs a verified user in through Joomla's own machinery — not by setting the session by hand.
     *
     * `$session->set('user', ...)` looks like it should work and does not: the administrator app
     * decides on each request whether someone is logged in, and that decision reads more than the
     * session key — it wants the state that a real login sets up (session record, metadata, the
     * events other plugins hang off). Measured on Joomla 4.3.4 (2026-08-11): setting the session
     * user directly left the very page that triggered it still rendering its login form.
     *
     * The JWT IS the authentication, so this skips the password check and goes straight to the
     * step Joomla runs AFTER a password succeeds: fire `onUserLogin`, which `plg_user_joomla`
     * turns into a proper session, then `onUserAfterLogin`. Exactly what `CMSApplication::login()`
     * does once credentials check out.
     */
    private function logIn(User $user): void
    {
        $app = $this->getApplication();

        $response = new AuthenticationResponse();
        $response->status   = Authentication::STATUS_SUCCESS;
        $response->type     = 'TracyAccess';
        $response->username = $user->username;
        $response->email    = $user->email;
        $response->fullname = $user->name;

        $options = ['action' => $app->isClient('administrator') ? 'core.login.admin' : 'core.login.site'];

        PluginHelper::importPlugin('user');
        $results = $app->triggerEvent('onUserLogin', [(array) $response, $options]);

        // A user plugin returning false means the login did not complete (blocked, not authorised
        // for this client). Do not run the after-login events on a login that failed.
        if (!in_array(false, $results, true)) {
            $app->triggerEvent('onUserAfterLogin', [$options]);
        }
    }

    /**
     * The email from the Cloudflare Access JWT, or null — the legacy path of a clone still fronted
     * by Access. It carries no tier and no role, so it can END a matching session, never start one.
     */
    private function emailFromAccessJwt(): ?string
    {
        $token = $this->accessHeader();
        if ($token === null) {
            return null;
        }
        $aud        = trim((string) $this->params->get('aud', ''));
        $teamDomain = trim((string) $this->params->get('team_domain', ''));
        if ($aud === '' || $teamDomain === '') {
            return null;
        }
        require_once __DIR__ . '/../../lib/AccessJwt.php';
        return \AccessJwt::verifiedEmail($token, $this->jwks($teamDomain), $aud, 'https://' . $teamDomain, time());
    }

    /** The raw Access assertion, or null. The bare email header is deliberately ignored. */
    private function accessHeader(): ?string
    {
        $token = $_SERVER['HTTP_CF_ACCESS_JWT_ASSERTION'] ?? '';
        return is_string($token) && $token !== '' ? $token : null;
    }

    /**
     * Finds the Joomla user for this email, creating one the first time.
     *
     * Lazy on purpose: a seat is not a Joomla account until its holder actually opens the clone,
     * so there is nothing to keep in step with the seat book. The password is random and unusable
     * — the only way in is the Access JWT, which is the whole point.
     */
    private function userForEmail(string $email, string $role): ?User
    {
        $db = $this->getDatabase();
        $query = $db->getQuery(true)
            ->select($db->quoteName('id'))
            ->from($db->quoteName('#__users'))
            ->where($db->quoteName('email') . ' = :email')
            ->bind(':email', $email)
            ->setLimit(1);
        $id = (int) $db->setQuery($query)->loadResult();

        if ($id > 0) {
            $existing = new User($id);
            $this->applyGroup($existing, $role);
            return $existing;
        }

        $user = new User();
        // Joomla's User::bind() takes its array BY REFERENCE, so a literal cannot be passed in
        // PHP 8 — the data has to be a variable. Measured against a real Joomla 4.3.4 (2026-08-11):
        // passing a literal throws "could not be passed by reference", caught and swallowed, so
        // the login silently did nothing.
        $data = [
            'name'      => $email,
            'username'  => $email,
            'email'     => $email,
            // A bcrypt of random bytes: a real hash that no password will ever match.
            'password'  => UserHelper::hashPassword(bin2hex(random_bytes(32))),
            // Create in Manager, never straight into the role's real group: Joomla's User::save()
            // refuses, during a guest request, to place a user in a group higher than the acting
            // identity's, so binding Super Users here would fail the whole save. The role's real
            // group is written afterwards by applyGroup, which goes around that guard.
            'groups'    => [$this->groupIdByTitle('Manager', 6)],
            // Marks the rows this plugin owns, so a cleanup can find them and a human can tell
            // them from the customer's own admins.
            // Joomla wraps params into a Registry itself, so this is an array, not a
            // JSON string — passing a string throws inside save().
            'params'    => ['tracyaccess_created' => 1],
        ];
        if (!$user->bind($data) || !$user->save()) {
            $this->warn('tracyaccess: could not create user for ' . $email . ': ' . implode('; ', $user->getErrors()));
            return null;
        }
        $this->applyGroup($user, $role);
        return $user;
    }

    /**
     * Ensures the user holds the group their Role maps to, writing `#__user_usergroup_map` directly.
     *
     * NOT through `User::save()`: Joomla guards that call so a request acting as a guest (which is
     * what this plugin is until the login below runs) cannot place anyone in a group higher than
     * its own — so `save()` silently drops an Owner into nothing above Manager. The map row is the
     * plugin's to write; it already mints these accounts, and the seat book upstream is the
     * authority on the Role. On an account this plugin made, a Role that no longer maps to Super
     * Users takes that group away; the customer's own accounts are only ever granted, never stripped.
     */
    private function applyGroup(User $user, string $role): void
    {
        $groupId = $this->workGroupId($role);
        $super = $this->groupIdByTitle('Super Users', 8);
        if ($groupId !== $super && $this->createdHere($user)
            && in_array($super, array_map('intval', (array) $user->groups), true)) {
            $db = $this->getDatabase();
            $db->setQuery(
                $db->getQuery(true)
                    ->delete($db->quoteName('#__user_usergroup_map'))
                    ->where($db->quoteName('user_id') . ' = ' . (int) $user->id)
                    ->where($db->quoteName('group_id') . ' = ' . $super)
            )->execute();
        }
        if (in_array($groupId, array_map('intval', (array) $user->groups), true)) {
            return;
        }
        $db = $this->getDatabase();
        $userId = (int) $user->id;
        // Values are integers this code casts itself, so they are inlined rather than bound — it
        // keeps the method free of any ParameterType dependency, which the wrapping catch would
        // otherwise swallow as a bare login failure if the class ever resolved differently.
        $exists = (int) $db->setQuery(
            $db->getQuery(true)
                ->select('COUNT(*)')
                ->from($db->quoteName('#__user_usergroup_map'))
                ->where($db->quoteName('user_id') . ' = ' . $userId)
                ->where($db->quoteName('group_id') . ' = ' . (int) $groupId)
        )->loadResult();
        if ($exists > 0) {
            return;
        }
        // insertObject takes its object BY REFERENCE, so — like User::bind above — a literal cannot
        // be passed in PHP 8 ("Only variables should be passed by reference"), which the wrapping
        // catch would swallow as a silent login failure. Hold it in a variable.
        $row = (object) ['user_id' => $userId, 'group_id' => (int) $groupId];
        $db->insertObject('#__user_usergroup_map', $row);
    }

    /**
     * The Joomla group this viewer's Role maps to (ADR 0038, ADR 0085).
     *
     * Owner and Admin — the people who run the site — get `Super Users`: full control of their own
     * site's working copy, which is what "admin" means to the person who owns it. Developer and
     * Editor land in `Manager`, the narrowest backend group that still edits content: a seat is the
     * right to do the WORK (ADR 0023), not automatically the keys to the box. An unrecognised Role
     * falls to Manager, never up.
     *
     * The mapping keys off the signed assertion's `role`; the flat `work_group`
     * param survives only as the Manager-tier override for a site that wants to name that group.
     */
    private function workGroupId(string $role): int
    {
        if ($role === 'owner' || $role === 'admin') {
            return $this->groupIdByTitle('Super Users', 8);
        }
        $title = trim((string) $this->params->get('work_group', 'Manager')) ?: 'Manager';
        return $this->groupIdByTitle($title, 6);
    }

    /** The `#__usergroups` id for a group title, or a known-default id when the title is missing. */
    private function groupIdByTitle(string $title, int $fallback): int
    {
        $db = $this->getDatabase();
        $query = $db->getQuery(true)
            ->select($db->quoteName('id'))
            ->from($db->quoteName('#__usergroups'))
            ->where($db->quoteName('title') . ' = :title')
            ->bind(':title', $title)
            ->setLimit(1);
        $id = (int) $db->setQuery($query)->loadResult();
        // A clone always has the core groups; the numeric fallback (Super Users 8, Manager 6) is a
        // last resort rather than a silent wrong group.
        return $id > 0 ? $id : $fallback;
    }

    /**
     * The team's key set, cached to a file for a day.
     *
     * The one network call this plugin makes, and only when the cache is cold or a `kid` is
     * unknown. Fail-closed: if the keys cannot be fetched and none are cached, it returns an
     * empty set, the verifier trusts nothing, and the normal login screen appears.
     */
    private function jwks(string $teamDomain): array
    {
        $file = $this->cachePath($teamDomain);
        $cached = $this->readCache($file);
        if ($cached !== null) {
            return $cached;
        }

        $url = 'https://' . $teamDomain . '/cdn-cgi/access/certs';
        $body = @file_get_contents($url, false, stream_context_create([
            'http' => ['timeout' => 5, 'ignore_errors' => true],
            'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
        ]));
        $keys = is_string($body) ? (json_decode($body, true)['keys'] ?? null) : null;

        if (is_array($keys) && $keys !== []) {
            @file_put_contents($file, json_encode($keys), LOCK_EX);
            return $keys;
        }

        // Fetch failed. A stale cache is better than none — Cloudflare's keys outlive their TTL,
        // and locking the whole site out because the certs endpoint blinked is the wrong trade.
        return $this->readCache($file, true) ?? [];
    }

    private function cachePath(string $teamDomain): string
    {
        $tmp = Factory::getApplication()->get('tmp_path', sys_get_temp_dir());
        return rtrim($tmp, '/') . '/tracyaccess-jwks-' . substr(sha1($teamDomain), 0, 12) . '.json';
    }

    /** @return array<int,array>|null */
    private function readCache(string $file, bool $ignoreAge = false): ?array
    {
        if (!is_file($file)) {
            return null;
        }
        if (!$ignoreAge && (time() - (int) @filemtime($file)) > self::JWKS_TTL) {
            return null;
        }
        $keys = json_decode((string) @file_get_contents($file), true);
        return is_array($keys) && $keys !== [] ? $keys : null;
    }

    private function warn(string $message): void
    {
        Log::add($message, Log::WARNING, 'plg_system_tracyaccess');
    }
}
