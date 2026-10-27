<?php

/**
 * Category blog: the `listing` page kind — a title and a grid of cards. Leading and intro items
 * are the same card; the split is a Joomla concept the contract does not have.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;

/** @var Joomla\Component\Content\Site\View\Category\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'listing');

$title = $this->params->get('show_page_heading') ? $this->params->get('page_heading') : $this->category->title;
$items = array_merge($this->lead_items, $this->intro_items);
?>
<section class="tracy-listing tracy-container">
    <header class="tracy-listing__head">
        <h1 class="tracy-display"><?php echo $this->escape($title); ?></h1>
        <?php if ($this->params->get('show_description', 1) && $this->category->description) : ?>
            <div class="tracy-lead">
                <?php echo HTMLHelper::_('content.prepare', $this->category->description, '', 'com_content.category'); ?>
            </div>
        <?php endif; ?>
    </header>

    <?php if (empty($items)) : ?>
        <?php if ($this->params->get('show_no_articles', 1)) : ?>
            <p class="tracy-muted"><?php echo Text::_('COM_CONTENT_NO_ARTICLES'); ?></p>
        <?php endif; ?>
    <?php else : ?>
        <ul class="tracy-grid">
            <?php foreach ($items as &$item) : ?>
                <?php $this->item = &$item; ?>
                <?php echo $this->loadTemplate('item'); ?>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>

    <?php if (!empty($this->link_items)) : ?>
        <ul class="tracy-links">
            <?php foreach ($this->link_items as $link) : ?>
                <li><a href="<?php echo \Joomla\CMS\Router\Route::_(\Joomla\Component\Content\Site\Helper\RouteHelper::getArticleRoute($link->slug, $link->catid, $link->language)); ?>"><?php echo $this->escape($link->title); ?></a></li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>

    <?php if (($this->params->def('show_pagination', 2) == 1 || $this->params->get('show_pagination') == 2) && $this->pagination->pagesTotal > 1) : ?>
        <nav class="tracy-pagination" aria-label="<?php echo Text::_('JLIB_HTML_PAGINATION'); ?>">
            <?php echo $this->pagination->getPagesLinks(); ?>
        </nav>
    <?php endif; ?>
</section>
