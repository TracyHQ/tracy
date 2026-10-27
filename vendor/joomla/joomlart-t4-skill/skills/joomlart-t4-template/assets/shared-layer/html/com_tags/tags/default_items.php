<?php

/**
 * Tracy — the tag cloud.
 *
 * The T4 base override lays the tags out as Bootstrap column <ul>s with an <h3> and a Font-Awesome
 * glyph per tag, plus a `badge badge-info` hit count. Design-spec §6 (tags.html) asks for capsule
 * chips instead: one .tracy-chip per tag at --radius-pill with the count at --meta/--text-xs,
 * so the whole cloud reads as one row of controls rather than a stack of headings.
 *
 * Description and hits stay optional exactly as the params say; the per-tag intro image the base
 * floats next to the heading is dropped on purpose — a chip has no room for it, and the base's
 * `json_decode($item->images)` on that path is the unguarded call gotcha #64 warns about.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Tags\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Tags\Site\View\Tags\HtmlView $this */
$this->getDocument()->getWebAssetManager()->useScript('com_tags.tags-default');

$params      = $this->params;
$levels      = $this->getCurrentUser()->getAuthorisedViewLevels();
$showHits    = (bool) $params->get('all_tags_show_tag_hits');
$showDesc    = (int) $params->get('all_tags_show_tag_description', 1) === 1;
$maxChars    = $params->get('all_tags_tag_maximum_characters');
?>
<div class="com-tags__items">

    <?php if ($params->get('filter_field') || $params->get('show_pagination_limit')) : ?>
        <form action="<?php echo htmlspecialchars(Uri::getInstance()->toString(), ENT_COMPAT, 'UTF-8'); ?>" method="post" name="adminForm" id="adminForm">
            <div class="tracy-filterbar com-tags__filters">
                <?php if ($params->get('filter_field')) : ?>
                    <div class="tracy-field">
                        <label for="filter-search"><?php echo Text::_('COM_TAGS_TITLE_FILTER_LABEL'); ?></label>
                        <input type="text" name="filter-search" id="filter-search" class="form-control"
                               value="<?php echo $this->escape($this->state->get('list.filter')); ?>"
                               placeholder="<?php echo $this->escape(Text::_('COM_TAGS_TITLE_FILTER_LABEL')); ?>">
                    </div>
                    <button type="submit" name="filter-search-button" class="btn btn-secondary">
                        <?php echo Text::_('JSEARCH_FILTER_SUBMIT'); ?>
                    </button>
                <?php endif; ?>

                <?php if ($params->get('show_pagination_limit')) : ?>
                    <div class="tracy-field">
                        <label for="limit"><?php echo Text::_('JGLOBAL_DISPLAY_NUM'); ?></label>
                        <?php echo $this->pagination->getLimitBox(); ?>
                    </div>
                <?php endif; ?>

                <input type="hidden" name="filter_order" value="">
                <input type="hidden" name="filter_order_Dir" value="">
                <input type="hidden" name="limitstart" value="">
                <input type="hidden" name="task" value="">
            </div>
        </form>
    <?php endif; ?>

    <?php if (empty($this->items)) : ?>
        <p class="tracy-empty"><?php echo Text::_('COM_TAGS_NO_TAGS'); ?></p>
    <?php else : ?>
        <ul class="tracy-chips com-tags__category all-tags">
            <?php foreach ($this->items as $item) : ?>
                <?php if (empty($item->access) || !in_array($item->access, $levels)) : ?>
                    <?php continue; ?>
                <?php endif; ?>
                <li>
                    <a class="tracy-chip" href="<?php echo Route::_(RouteHelper::getTagRoute($item->id . ':' . $item->alias)); ?>">
                        <?php echo $this->escape($item->title); ?>
                        <?php if ($showHits) : ?>
                            <span class="tracy-chip__count"><?php echo (int) $item->hits; ?></span>
                        <?php endif; ?>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>

        <?php if ($showDesc) : ?>
            <div class="tracy-deflist com-tags__descriptions">
                <?php foreach ($this->items as $item) : ?>
                    <?php if (empty($item->access) || !in_array($item->access, $levels) || empty($item->description)) : ?>
                        <?php continue; ?>
                    <?php endif; ?>
                    <div class="tracy-deflist__row">
                        <span class="tracy-deflist__key"><?php echo $this->escape($item->title); ?></span>
                        <span class="tracy-deflist__val tag-body">
                            <?php echo HTMLHelper::_('string.truncate', $item->description, $maxChars); ?>
                        </span>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    <?php endif; ?>

    <?php if (!empty($this->items) && ($params->def('show_pagination', 2) == 1 || $params->get('show_pagination') == 2) && $this->pagination->pagesTotal > 1) : ?>
        <div class="com-tags__pagination tracy-pagination">
            <?php echo $this->pagination->getPagesLinks(); ?>
            <?php if ($params->def('show_pagination_results', 1)) : ?>
                <p class="tracy-pagination__counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
            <?php endif; ?>
        </div>
    <?php endif; ?>
</div>
