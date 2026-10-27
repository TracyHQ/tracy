<?php

/**
 * Page: the `page` kind — title, then the article body, in the template's chrome. The same
 * frame as the WordPress theme's page template. The stand seeds Style guide and Contact with it,
 * their bodies being the section library's snippets.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'page');

$item = $this->item;
?>
<section class="tracy-page tracy-container">
    <header class="tracy-page__head">
        <h1 class="tracy-display"><?php echo $this->escape($item->title); ?></h1>
        <?php echo $item->event->afterDisplayTitle; ?>
    </header>
    <?php echo $item->event->beforeDisplayContent; ?>
    <div class="tracy-page__body tracy-prose">
        <?php echo $item->text; ?>
    </div>
    <?php echo $item->event->afterDisplayContent; ?>
</section>
