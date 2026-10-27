<?php

/**
 * Tracy — Smart Search page shell.
 *
 * Same three parts as the T4 base override (heading, form, results) with the base's bare divs
 * replaced by the design's .tracy-search stack, and the J3 branch dropped (this template targets
 * Joomla 6 only). The com_finder asset registration is kept verbatim — the autosuggest and the
 * advanced-filter JS both hang off it.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

/** @var \Joomla\Component\Finder\Site\View\Search\HtmlView $this */
$this->getDocument()->getWebAssetManager()
    ->useStyle('com_finder.finder')
    ->useScript('com_finder.finder');
?>
<div class="com-finder finder tracy-search">

    <?php if ($this->params->get('show_page_heading')) : ?>
        <div class="tracy-view-head">
            <h1 class="tracy-view-head__title">
                <?php echo $this->escape($this->params->get('page_heading') ?: $this->params->get('page_title')); ?>
            </h1>
        </div>
    <?php endif; ?>

    <?php if ($this->params->get('show_search_form', 1)) : ?>
        <div id="search-form" class="com-finder__form">
            <?php echo $this->loadTemplate('form'); ?>
        </div>
    <?php endif; ?>

    <?php if ($this->query->search === true) : ?>
        <div id="search-results" class="com-finder__results">
            <?php echo $this->loadTemplate('results'); ?>
        </div>
    <?php endif; ?>
</div>
