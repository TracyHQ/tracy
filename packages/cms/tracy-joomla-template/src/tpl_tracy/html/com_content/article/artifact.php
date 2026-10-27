<?php

/**
 * Artifact: the `artifact` page kind — one of the brand engine's page artifacts (landing, form,
 * typography) of the chosen design system, pixel for pixel as the preview dialog showed it. The
 * article body holds the artifact's markup inside <div class="tracy-artifact">; attribs name the
 * kind (`tracy_artifact`). Like the fixture kind: the raw body, the artifact's own stylesheet,
 * nothing of the template's (index.php hides header and footer and loads no template css).
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

$app = Factory::getApplication();
$app->set('tracy.page', 'artifact');

require_once JPATH_THEMES . '/tpl_tracy/resolve.php';
$look = tpl_tracy_resolve($app->getTemplate(true)->params);

$kind = (string) $this->item->params->get('tracy_artifact', 'landing');

if (!\in_array($kind, ['landing', 'form', 'typography'], true)) {
    $kind = 'landing';
}

// The raw body, not $item->text: content plugins would rewrite a verbatim design page.
$body = (string) $this->item->fulltext !== '' ? (string) $this->item->fulltext : (string) $this->item->introtext;

// The stylesheet of the system the body was written for, not of the current style.
$this->document->getWebAssetManager()->registerAndUseStyle(
    'template.artifact',
    'media/templates/site/tpl_tracy/css/artifacts/' . $kind . '/' . tpl_tracy_page_system($body, $look['id']) . '.css'
);

echo $body;
