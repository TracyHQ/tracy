<?php

/**
 * Landing: the article body alone, in the template's chrome, no title — for a page built from
 * the section library, which opens with its own hero (the stand's Sections page, seeded from
 * sections/landing.html). The WordPress theme's `landing` template is the same thing. The
 * engine's pixel-exact landing is the `artifact` layout, not this one.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'landing');

$item = $this->item;

echo $item->event->afterDisplayTitle;
echo $item->event->beforeDisplayContent;
echo $item->text;
echo $item->event->afterDisplayContent;
