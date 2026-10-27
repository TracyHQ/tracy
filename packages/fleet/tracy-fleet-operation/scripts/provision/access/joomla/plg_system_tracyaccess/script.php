<?php

\defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/**
 * Install script for the auto-login system plugin.
 *
 * Joomla installs a plugin DISABLED, but this one has to run on every request to sign a coworker in
 * before the admin decides authentication — a disabled auto-login is no auto-login. So it enables
 * itself in `postflight`, the same self-arming the component's own script does for its pieces. No
 * params are seeded: identity now arrives on the `x-tracy-email` header the fleet-bar Worker sets
 * (ADR 0085), so `aud`/`team_domain` matter only to the legacy Cloudflare-Access fallback and are
 * left empty here. Idempotent: enabling an already-enabled row is a no-op.
 *
 * Plainly-named class (not `return new class`) to install on both Joomla 3 and 4+, matching
 * `com_claudecoworkInstallerScript`.
 */
class plgSystemTracyAccessInstallerScript
{
    public function install($parent)
    {
        return true;
    }

    public function update($parent)
    {
        return true;
    }

    public function uninstall($parent)
    {
        return true;
    }

    public function preflight($route, $parent)
    {
        return true;
    }

    public function postflight($route, $parent)
    {
        $db = Factory::getDbo();
        $db->setQuery(
            $db->getQuery(true)
                ->update($db->quoteName('#__extensions'))
                ->set($db->quoteName('enabled') . ' = 1')
                ->where($db->quoteName('element') . ' = ' . $db->quote('tracyaccess'))
                ->where($db->quoteName('folder') . ' = ' . $db->quote('system'))
                ->where($db->quoteName('type') . ' = ' . $db->quote('plugin'))
        )->execute();

        return true;
    }
}
