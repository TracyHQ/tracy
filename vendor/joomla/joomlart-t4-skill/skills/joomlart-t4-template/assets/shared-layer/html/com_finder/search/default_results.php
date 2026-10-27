<?php

/**
 * Tracy — Smart Search result list.
 *
 * Same order of parts as the T4 base override (explained query, empty state, sort box, results,
 * pagination). Changed: the base's `.list-striped` becomes the design's hairline-separated stack, the
 * empty state becomes the shared .tracy-empty panel, and the "Results X - Y of Z" counter drops
 * to --meta at --text-sm instead of body size.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;

/** @var \Joomla\Component\Finder\Site\View\Search\HtmlView $this */
?>
<?php if (($this->suggested && $this->params->get('show_suggested_query', 1)) || ($this->explained && $this->params->get('show_explained_query', 1))) : ?>
    <div id="search-query-explained" class="com-finder__explained tracy-search__explained">
        <?php if ($this->suggested && $this->params->get('show_suggested_query', 1)) : ?>
            <?php
                $uri = Uri::getInstance($this->query->toUri());
                $uri->setVar('q', $this->suggested);
                $link = '<a href="' . Route::_($uri->toString(['path', 'query'])) . '">' . $this->escape($this->suggested) . '</a>';
            ?>
            <?php echo Text::sprintf('COM_FINDER_SEARCH_SIMILAR', $link); ?>
        <?php else : ?>
            <?php echo $this->explained; ?>
        <?php endif; ?>
    </div>
<?php endif; ?>

<?php if (($this->total === 0) || ($this->total === null)) : ?>
    <div id="search-result-empty" class="com-finder__empty tracy-empty">
        <h2 class="tracy-view-head__title"><?php echo Text::_('COM_FINDER_SEARCH_NO_RESULTS_HEADING'); ?></h2>
        <?php $multilang = Factory::getApplication()->getLanguageFilter() ? '_MULTILANG' : ''; ?>
        <p><?php echo Text::sprintf('COM_FINDER_SEARCH_NO_RESULTS_BODY' . $multilang, $this->escape($this->query->input)); ?></p>
    </div>
    <?php return; ?>
<?php endif; ?>

<?php if ($this->params->get('show_sort_order', 0) && !empty($this->sortOrderFields) && !empty($this->results)) : ?>
    <div id="search-sorting" class="com-finder__sorting tracy-filterbar">
        <?php echo $this->loadTemplate('sorting'); ?>
    </div>
<?php endif; ?>

<?php if (!empty($this->query->highlight) && $this->params->get('highlight_terms', 1)) : ?>
    <?php HTMLHelper::_('behavior.highlighter', $this->query->highlight); ?>
<?php endif; ?>

<span id="highlighter-start"></span>
<div class="search-results tracy-results">
    <?php $this->baseUrl = Uri::getInstance()->toString(['scheme', 'host', 'port']); ?>
    <?php foreach ($this->results as $i => $result) : ?>
        <?php
            $this->result          = &$result;
            $this->result->counter = $i + 1;
            $layout                = $this->getLayoutFile($this->result->layout);
        ?>
        <?php echo $this->loadTemplate($layout); ?>
    <?php endforeach; ?>
</div>
<span id="highlighter-end"></span>

<div class="com-finder__navigation search-pagination tracy-pagination">
    <div class="com-finder__pagination">
        <?php echo $this->pagination->getPagesLinks(); ?>
    </div>
    <?php
        $start = (int) $this->pagination->limitstart + 1;
        $total = (int) $this->pagination->total;
        $limit = (int) $this->pagination->limit * $this->pagination->pagesCurrent;
        $limit = (int) ($limit > $total ? $total : $limit);
    ?>
    <p class="com-finder__counter tracy-pagination__counter">
        <?php echo Text::sprintf('COM_FINDER_SEARCH_RESULTS_OF', $start, $limit, $total); ?>
    </p>
</div>
