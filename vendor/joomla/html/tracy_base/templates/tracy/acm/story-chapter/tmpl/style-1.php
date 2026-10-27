<?php
/**
 * Tracy — ACM block `story-chapter`, style 1: statement LEFT, media RIGHT.
 *
 * The default reading order of a chapter. Pair it with style 2 (media left) so a stack of chapters
 * alternates side as well as band surface — that alternation is the template's signature
 * (design-spec.md §6, catalog.md §6.4).
 *
 * Markup and fields live in ../chapter.php, shared with style 2; see the header there for why the
 * partial sits at the block root rather than in tmpl/.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$chapterStyle = 1;
$chapterFlip  = false;

require __DIR__ . '/../chapter.php';
