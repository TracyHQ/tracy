<?php

/**
 * Resolve the three style parameters of tpl_tracy into a design system id and a layout pair.
 * Shared by index.php and component.php so both documents wear the same look.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\Registry\Registry;

/**
 * @param   Registry  $params  The template style parameters.
 *
 * @return  array{id: string, nav: string, hero: string, dark: bool}
 */
function tpl_tracy_resolve(Registry $params): array
{
    $catalog = tpl_tracy_catalog();

    $navs  = ['top-left', 'top-centered', 'brand-centered', 'sidebar', 'overlay'];
    $heros = ['split', 'centered', 'cover', 'stack'];

    // Never build a file path from a value the catalog does not know.
    $id = (string) $params->get('inspiration', 'default');

    if (!isset($catalog[$id]) || !preg_match('/^[a-z0-9-]+$/', $id)) {
        $id = isset($catalog['default']) ? 'default' : (string) (array_key_first($catalog) ?? 'default');
    }

    // A visitor may try the site in another design system from the address bar: ?style=<id>.
    $id = tpl_tracy_requested_style() ?? $id;

    $meta = $catalog[$id] ?? [];

    $nav = (string) $params->get('nav', 'auto');

    if (!\in_array($nav, $navs, true)) {
        $nav = \in_array($meta['nav'] ?? '', $navs, true) ? $meta['nav'] : 'top-left';
    }

    $hero = (string) $params->get('hero', 'auto');

    if (!\in_array($hero, $heros, true)) {
        $hero = \in_array($meta['hero'] ?? '', $heros, true) ? $meta['hero'] : 'split';
    }

    return ['id' => $id, 'nav' => $nav, 'hero' => $hero, 'dark' => (bool) ($meta['dark'] ?? false)];
}

/**
 * The bundled design systems, keyed by id — inspirations.json, read once.
 *
 * @return  array<string, array{name?: string, category?: string, nav?: string, hero?: string, dark?: bool}>
 */
function tpl_tracy_catalog(): array
{
    static $catalog = null;

    if ($catalog === null) {
        $decoded = json_decode((string) file_get_contents(__DIR__ . '/inspirations.json'), true);
        $catalog = \is_array($decoded) && isset($decoded['systems']) && \is_array($decoded['systems'])
            ? $decoded['systems']
            : [];
    }

    return $catalog;
}

/**
 * The design system the visitor asked for from the address bar, if any: `?style=<id>` on this
 * request, else the `tracy_style` cookie an earlier `?style=` left behind (a day, so following a
 * link keeps the look). `?style=` with no value forgets it. Only ids the catalog knows count —
 * anything else is ignored, and the style's own inspiration stands. Section pages follow this;
 * a design page (fixture, artifact) keeps the system its body was written for.
 *
 * The cookie is a per-visitor preview, not a site setting: it changes nothing in the database.
 * Note for a site behind a page cache: the cache must vary on this cookie, or one visitor's
 * preview is served to the next.
 *
 * @return  string|null  A catalog id, or null when nothing was asked.
 */
function tpl_tracy_requested_style(): ?string
{
    static $resolved = false;
    static $requested = null;

    if ($resolved) {
        return $requested;
    }

    $resolved = true;
    $catalog  = tpl_tracy_catalog();
    $app      = \Joomla\CMS\Factory::getApplication();
    $input    = $app->getInput();
    $query    = $input->get('style', null, 'raw');

    // Joomla's page cache (System - Page Cache, off by default) keys a page on its URL alone.
    // A ?style= URL is its own key, so it caches correctly; a cookie is not part of the key, so
    // a page rendered for one visitor's cookie would be stored for everyone. With that plugin on,
    // the cookie is neither set nor read: the preview lives in the URL only. (A `pagecache`
    // plugin adding the cookie to the key — Joomla's own hook for this — would lift the limit.)
    $cookieSafe = !\Joomla\CMS\Plugin\PluginHelper::isEnabled('system', 'cache');

    if ($query !== null) {
        $query = (string) $query;

        if ($query !== '' && preg_match('/^[a-z0-9-]+$/', $query) && isset($catalog[$query])) {
            $requested = $query;

            if ($cookieSafe) {
                tpl_tracy_remember_style($query, time() + 86400);
            }
        } elseif ($query === '') {
            tpl_tracy_remember_style('', time() - 86400);
        }
    } elseif ($cookieSafe) {
        $cookie = (string) $input->cookie->get('tracy_style', '', 'raw');

        if ($cookie !== '' && preg_match('/^[a-z0-9-]+$/', $cookie) && isset($catalog[$cookie])) {
            $requested = $cookie;
        }
    }

    // A preview is one visitor's: tell proxies and CDNs in front of the site not to keep it.
    if ($requested !== null) {
        $app->allowCache(false);
    }

    return $requested;
}

/**
 * Set or clear the visitor's preview cookie. Joomla buffers the page, so headers are still open.
 */
function tpl_tracy_remember_style(string $id, int $expires): void
{
    if (headers_sent()) {
        return;
    }

    setcookie('tracy_style', $id, [
        'expires'  => $expires,
        'path'     => '/',
        'secure'   => \Joomla\CMS\Uri\Uri::getInstance()->isSsl(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * The design system a design page (fixture or artifact) was written for: its wrapper says so.
 * The page keeps that stylesheet when the template style switches — apple's markup under
 * agentic's stylesheet is broken, not restyled. Bringing the page over to the new system means
 * rewriting its body, which is the seeder's job, not the template's.
 *
 * @param   string  $html      The article body.
 * @param   string  $fallback  The id of the current template style, for a body without a wrapper.
 *
 * @return  string  A catalog id.
 */
function tpl_tracy_page_system(string $html, string $fallback): string
{
    if (
        preg_match('/<div class="tracy-(?:fixture|artifact)"[^>]*\sdata-inspiration="([a-z0-9-]+)"/', $html, $m)
        && isset(tpl_tracy_catalog()[$m[1]])
    ) {
        return $m[1];
    }

    return $fallback;
}

/**
 * Give every active stylesheet of this template a version that changes with its file.
 *
 * WHY (stage 6 acceptance v5, R05, 30/09/2026). A look change rewrites a template stylesheet in place
 * (`css/sections.css`, `css/tracy.css`, …), while the address the page names for it stays the same:
 * the assets declare no version, so Joomla prints its media version, which moves only when Joomla or
 * an extension is updated. Served with `Last-Modified` and no `Cache-Control`, the old copy stays
 * "fresh" in a browser that has seen the page, by the browser's own estimate — on WordPress the sender
 * watched the old size ~10 minutes after Tracy said done. With the file's modification time as the
 * version, the address is a new one the moment the file is rewritten (an undo included), and no cache
 * holds anything under it.
 *
 * Every active style asset whose file lives under this template's media folder (a bare name from
 * joomla.asset.json, or a `media/templates/site/tpl_tracy/…` path registered in PHP) is registered
 * again under the same name, URI, options, attributes and dependencies, with the version added; core,
 * extension and external sheets are left alone. Called last in index.php and component.php, after the
 * component's layout (a design page's fenced sheet) has registered its own.
 *
 * @param   \Joomla\CMS\WebAsset\WebAssetManager  $wa    The document's asset manager.
 * @param   string                                $root  The site root on disk (JPATH_ROOT).
 *
 * @return  void
 */
function tpl_tracy_stamp_styles($wa, string $root): void
{
    $own = 'media/templates/site/tpl_tracy/';

    foreach ($wa->getAssets('style') as $asset) {
        $uri = $asset->getUri(false);

        if ($uri === '' || str_contains($uri, '..') || str_contains($uri, '://') || str_starts_with($uri, '//')) {
            continue;
        }

        $file = str_contains($uri, '/') ? ltrim($uri, '/') : $own . 'css/' . $uri;

        if (!str_starts_with($file, $own) || !is_file($root . '/' . $file)) {
            continue;
        }

        $mtime   = (string) filemtime($root . '/' . $file);
        $version = $asset->getVersion();
        $wa->registerStyle(
            $asset->getName(),
            $uri,
            ['version' => ($version === '' || $version === 'auto' ? '' : $version . '-') . $mtime] + $asset->getOptions(),
            $asset->getAttributes(),
            $asset->getDependencies()
        );
    }
}
