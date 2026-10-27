<?php

/**
 * @package     Tracy Site Identity for Joomla
 * @copyright   (C) 2026 Tracy
 * @license     GPL-2.0-or-later
 */

namespace Tracy\Plugin\System\TracyIdentity\Extension;

use Joomla\CMS\Log\Log;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\Database\DatabaseAwareInterface;
use Joomla\Database\DatabaseAwareTrait;
use Joomla\Event\SubscriberInterface;
use Tracy\Plugin\System\TracyIdentity\Identity;

\defined('_JEXEC') or die;

/**
 * Makes the "[Tracy] Site identity" module the one place a Tracy quickstart site keeps its name,
 * contact and social links.
 *
 * WHY A PLUGIN AND NOT THE TEMPLATE. A Tracy quickstart repeats the site's name in the header, the
 * page title, the footer, module copy, articles and emails. Before this, each of those carried the
 * demo's own name, and several lived where a content write may not go (a hash-locked T4 settings
 * file, `configuration.php`), so a customer's site kept saying the demo's name. Now the archive
 * carries tokens such as `{site.name}`, the module carries the values, and this plugin joins them
 * at render time. It ships inside the quickstart archive rather than with Tracy's Cowork component
 * because the site must stand on its own: someone installing the quickstart by hand has no Cowork,
 * and a customer who removes Cowork must keep a working site.
 *
 * Two jobs, both on the public site only:
 *   - `onAfterInitialise` sets the runtime `sitename` (the page `<title>` and mail sender name).
 *     `configuration.php` is left untouched.
 *   - `onAfterRender` replaces the tokens in the HTML Joomla is about to send (`Identity::render`).
 *
 * ⚠ T4 reads the site name straight from `configuration.php` (`new \JConfig()`) for its default
 * logo and for `og:title`, so the runtime `sitename` does not reach those two. A Tracy template
 * overrides the logo layout, and `og:title` comes from the template style's `og_title` parameter.
 */
final class TracyIdentity extends CMSPlugin implements SubscriberInterface, DatabaseAwareInterface
{
    use DatabaseAwareTrait;

    /** The identity module is found by this note, never by its title — a title is content. */
    public const NOTE = 'tracy:identity';

    /** @var array<string,string>|null|false false until read; null when the site has none */
    private $identity = false;

    /** Whether this request's body has been through `Identity::render` already. */
    private bool $rendered = false;

    public static function getSubscribedEvents(): array
    {
        return [
            'onAfterInitialise' => 'onAfterInitialise',
            'onAfterRender'     => 'onAfterRender',
            'onBeforeRespond'   => 'onBeforeRespond',
        ];
    }

    public function onAfterInitialise(): void
    {
        $app = $this->getApplication();
        if (!$app->isClient('site')) {
            return;
        }
        $name = trim((string) ($this->identity()['site.name'] ?? ''));
        if ($name !== '') {
            $app->set('sitename', $name);
            $app->set('fromname', $name);
        }
    }

    public function onAfterRender(): void
    {
        $this->renderBody();
    }

    /**
     * ⚠ AN ERROR PAGE NEVER REACHES `onAfterRender`. Joomla's ExceptionHandler renders the 404 page
     * and sets the body directly (`libraries/src/Exception/ExceptionHandler.php`), so measured
     * 23/09/2026 on a Business 1.1.0 lab site, `/en/company/careers` showed `{site.name}` raw.
     * `onBeforeRespond` runs on both roads, but on a normal page it runs AFTER gzip compression
     * (`CMSApplication::execute`), so it only catches what `onAfterRender` did not.
     */
    public function onBeforeRespond(): void
    {
        if (!$this->rendered) {
            $this->renderBody();
        }
    }

    private function renderBody(): void
    {
        $app = $this->getApplication();
        if (!$app->isClient('site') || $app->getInput()->getCmd('format', 'html') !== 'html') {
            return;
        }
        $this->rendered = true;
        $identity = $this->identity();
        // No identity module means nothing to show; the tokens stay visible so the fault is.
        if ($identity === null) {
            return;
        }
        $app->setBody(Identity::render((string) $app->getBody(), $identity));
    }

    /** @return array<string,string>|null */
    private function identity(): ?array
    {
        if ($this->identity !== false) {
            return $this->identity;
        }
        $this->identity = null;
        try {
            $db = $this->getDatabase();
            $note = self::NOTE;
            $query = $db->getQuery(true)
                ->select($db->quoteName('params'))
                ->from($db->quoteName('#__modules'))
                ->where($db->quoteName('note') . ' = :note')
                ->where($db->quoteName('client_id') . ' = 0')
                ->where($db->quoteName('published') . ' = 1')
                ->order($db->quoteName('id') . ' ASC')
                ->bind(':note', $note)
                ->setLimit(1);
            $params = $db->setQuery($query)->loadResult();
            if (\is_string($params)) {
                $this->identity = Identity::fromModuleParams($params);
            }
            // Layouts ask `Identity::isBlankToken()` against this, to leave out an empty card.
            Identity::setCurrent($this->identity);
        } catch (\Throwable $e) {
            // Never take a page down over this: the page renders with its tokens showing.
            Log::add('tracyidentity: ' . $e->getMessage(), Log::WARNING, 'tracyidentity');
        }
        return $this->identity;
    }
}
