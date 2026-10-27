<?php
/**
 * Tracy — ACM block `story-chapter`, style 2: media LEFT, statement RIGHT.
 *
 * The flipped chapter. Identical fields to style 1 — the owner switches the style in the module
 * editor and the panel mirrors, with no second set of content to maintain.
 *
 * The flip is `.tracy-chapter--flip` in scss/_base.scss, and it applies ONLY from 992px up:
 * below that the grid is a single column and the statement stays FIRST, so a phone reader always
 * meets the words before the picture.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$chapterStyle = 2;
$chapterFlip  = true;

require __DIR__ . '/../chapter.php';
