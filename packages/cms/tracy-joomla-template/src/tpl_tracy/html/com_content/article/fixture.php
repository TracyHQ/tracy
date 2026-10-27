<?php

/**
 * Fixture: the `fixture` page kind — the chosen design system's own components.html, pixel for
 * pixel as the preview dialog showed it. The article body holds the fixture's markup inside
 * <div class="tracy-fixture">; this layout loads the system's fenced stylesheet and draws nothing
 * else: no title, no template chrome around it (index.php hides header and footer on this kind).
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

$app = Factory::getApplication();
$app->set('tracy.page', 'fixture');

require_once JPATH_THEMES . '/tpl_tracy/resolve.php';
$look = tpl_tracy_resolve($app->getTemplate(true)->params);

// The raw body, not $item->text: content plugins rewrite it (Email Cloak turns the
// `you@icloud.com` placeholder of a form field into an obfuscation span and breaks the tag),
// and a verbatim design page must stay verbatim.
$body = (string) $this->item->fulltext !== '' ? (string) $this->item->fulltext : (string) $this->item->introtext;

// The stylesheet of the system the body was written for, not of the current style.
$this->document->getWebAssetManager()->registerAndUseStyle(
    'template.fixture',
    'media/templates/site/tpl_tracy/css/fixtures/' . tpl_tracy_page_system($body, $look['id']) . '.css'
);

echo $body;
