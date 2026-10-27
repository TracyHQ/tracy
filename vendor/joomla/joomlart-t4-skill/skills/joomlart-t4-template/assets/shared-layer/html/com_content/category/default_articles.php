<?php
/**
 * Tracy — com_content / category / default_articles
 *
 * Starts from the T4 base default_articles.php. The base renders the article list as
 * `table table-striped table-bordered table-hover` — striping, cell borders and a header rule.
 * design-spec.md §6 (category-list.html) asks for the opposite: "Table-less list; rows separated
 * by --border-soft". Bootstrap's table chrome cannot be tokenised into a hairline; it has to go.
 *
 * So the <table> becomes a <ul> of rows and every column becomes a labelled span. Nothing else
 * changes: the same fields, the same access branch, the same associations/flags, the same
 * publish-state badges, the same create-article icon and pagination.
 *
 * Sorting survives the table's removal — `grid.sort` links move into a capsule chip row above the
 * list (rendered only when the menu item asks for headings), so the function is not lost with the
 * chrome. Chip geometry is --radius-pill, per the design's capsule vocabulary.
 *
 * Language: every key used here is a core com_content / joomla key verified present on this build
 * (gotcha #63) — no bespoke constant reaches the page untranslated.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Associations;
use Joomla\CMS\Language\Multilanguage;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Content\Site\Helper\AssociationHelper;
use T4\Helper\J3J4;

if (!class_exists('ContentHelperRoute')) {
    if (version_compare(JVERSION, '4', 'ge')) {
        abstract class ContentHelperRoute extends \Joomla\Component\Content\Site\Helper\RouteHelper
        {
        };
    } else {
        JLoader::register('ContentHelperRoute', $com_path . '/helpers/route.php');
    }
}

HTMLHelper::addIncludePath(JPATH_COMPONENT . '/helpers');

$listOrder  = $this->escape($this->state->get('list.ordering'));
$listDirn   = $this->escape($this->state->get('list.direction'));
$langFilter = false;

// Tags filtering based on language filter
if (($this->params->get('filter_field') === 'tag') && (Multilanguage::isEnabled())) {
    $tagfilter = ComponentHelper::getParams('com_tags')->get('tag_list_language_filter');

    switch ($tagfilter) {
        case 'current_language':
            $langFilter = Factory::getApplication()->getLanguage()->getTag();
            break;

        case 'all':
            $langFilter = false;
            break;

        default:
            $langFilter = $tagfilter;
    }
}

// Check for at least one editable article
$isEditable = false;

if (!empty($this->items)) {
    foreach ($this->items as $article) {
        if ($article->params->get('access-edit')) {
            $isEditable = true;
            break;
        }
    }
}

$dateField = $this->params->get('list_show_date');
?>

<form action="<?php echo htmlspecialchars(Uri::getInstance()->toString()); ?>" method="post" name="adminForm" id="adminForm" class="com-content-category__articles tracy-catlist__form">

	<?php if ($this->params->get('filter_field') !== 'hide' || $this->params->get('show_pagination_limit')) : ?>
		<fieldset class="com-content-category__filters filters tracy-chips tracy-chips--filters">
			<legend class="visually-hidden"><?php echo Text::_('COM_CONTENT_FORM_FILTER_LEGEND'); ?></legend>

			<?php if ($this->params->get('filter_field') !== 'hide') : ?>
				<div class="tracy-chip tracy-chip--field">
					<?php if ($this->params->get('filter_field') === 'tag') : ?>
						<label class="visually-hidden" for="filter_tag"><?php echo Text::_('JOPTION_SELECT_TAG'); ?></label>
						<select name="filter_tag" id="filter_tag" onchange="document.adminForm.submit();">
							<option value=""><?php echo Text::_('JOPTION_SELECT_TAG'); ?></option>
							<?php echo HTMLHelper::_('select.options', HTMLHelper::_('tag.options', array('filter.published' => array(1), 'filter.language' => $langFilter), true), 'value', 'text', $this->state->get('filter.tag')); ?>
						</select>
					<?php elseif ($this->params->get('filter_field') === 'month') : ?>
						<label class="visually-hidden" for="filter-search"><?php echo Text::_('JOPTION_SELECT_MONTH'); ?></label>
						<select name="filter-search" id="filter-search" onchange="document.adminForm.submit();">
							<option value=""><?php echo Text::_('JOPTION_SELECT_MONTH'); ?></option>
							<?php echo HTMLHelper::_('select.options', HTMLHelper::_('content.months', $this->state), 'value', 'text', $this->state->get('list.filter')); ?>
						</select>
					<?php else : ?>
						<label class="visually-hidden" for="filter-search">
							<?php echo Text::_('COM_CONTENT_' . $this->params->get('filter_field') . '_FILTER_LABEL'); ?>
						</label>
						<input type="text" name="filter-search" id="filter-search" value="<?php echo $this->escape($this->state->get('list.filter')); ?>" onchange="document.adminForm.submit();" title="<?php echo Text::_('COM_CONTENT_FILTER_SEARCH_DESC'); ?>" placeholder="<?php echo Text::_('COM_CONTENT_' . $this->params->get('filter_field') . '_FILTER_LABEL'); ?>">
					<?php endif; ?>
				</div>
			<?php endif; ?>

			<?php if ($this->params->get('show_pagination_limit')) : ?>
				<div class="tracy-chip tracy-chip--field">
					<label class="visually-hidden" for="limit"><?php echo Text::_('JGLOBAL_DISPLAY_NUM'); ?></label>
					<?php echo $this->pagination->getLimitBox(); ?>
				</div>
			<?php endif; ?>

			<input type="hidden" name="filter_order" value="">
			<input type="hidden" name="filter_order_Dir" value="">
			<input type="hidden" name="limitstart" value="">
			<input type="hidden" name="task" value="">
		</fieldset>
	<?php endif; ?>

	<?php if (empty($this->items)) : ?>
		<?php if ($this->params->get('show_no_articles', 1)) : ?>
			<p class="com-content-category__no-articles tracy-empty"><?php echo Text::_('COM_CONTENT_NO_ARTICLES'); ?></p>
		<?php endif; ?>
	<?php else : ?>

		<?php // The table's <thead> carried the sort links. The table is gone; the links are not. ?>
		<?php if ($this->params->get('show_headings')) : ?>
			<div class="tracy-chips tracy-chips--sort">
				<span class="tracy-chips__label"><?php echo Text::_('JGLOBAL_SORT_BY'); ?></span>
				<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'JGLOBAL_TITLE', 'a.title', $listDirn, $listOrder, null, 'asc', '', 'adminForm'); ?></span>
				<?php if ($dateField === 'created') : ?>
					<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'COM_CONTENT_CREATED_DATE', 'a.created', $listDirn, $listOrder); ?></span>
				<?php elseif ($dateField === 'modified') : ?>
					<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'COM_CONTENT_MODIFIED_DATE', 'a.modified', $listDirn, $listOrder); ?></span>
				<?php elseif ($dateField === 'published') : ?>
					<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'COM_CONTENT_PUBLISHED_DATE', 'a.publish_up', $listDirn, $listOrder); ?></span>
				<?php endif; ?>
				<?php if ($this->params->get('list_show_author')) : ?>
					<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'JAUTHOR', 'author', $listDirn, $listOrder); ?></span>
				<?php endif; ?>
				<?php if ($this->params->get('list_show_hits')) : ?>
					<span class="tracy-chip"><?php echo HTMLHelper::_('grid.sort', 'JGLOBAL_HITS', 'a.hits', $listDirn, $listOrder); ?></span>
				<?php endif; ?>
			</div>
		<?php endif; ?>

		<ul class="com-content-category__list tracy-rowlist">
			<?php foreach ($this->items as $i => $article) : ?>
				<li class="tracy-rowlist__row<?php echo J3J4::checkUnpublishedContent($this->items[$i]) ? ' system-unpublished' : ''; ?>">

					<div class="tracy-rowlist__main">
						<?php if (in_array($article->access, $this->user->getAuthorisedViewLevels())) : ?>
							<a class="tracy-rowlist__title" href="<?php echo Route::_(ContentHelperRoute::getArticleRoute($article->slug, $article->catid, $article->language)); ?>">
								<?php echo $this->escape($article->title); ?>
							</a>
						<?php else : ?>
							<span class="tracy-rowlist__title tracy-rowlist__title--locked"><?php echo $this->escape($article->title); ?></span>
							<?php
							$active = Factory::getApplication()->getMenu()->getActive();
							$itemId = $active ? $active->id : 0;
							$link   = new Uri(Route::_('index.php?option=com_users&view=login&Itemid=' . $itemId, false));
							$link->setVar('return', base64_encode(ContentHelperRoute::getArticleRoute($article->slug, $article->catid, $article->language)));
							?>
							<a href="<?php echo $link; ?>" class="register tracy-rowlist__register">
								<?php echo Text::_('COM_CONTENT_REGISTER_TO_READ_MORE'); ?>
							</a>
						<?php endif; ?>

						<?php if (Associations::isEnabled() && $this->params->get('show_associations')) : ?>
							<?php $associations = AssociationHelper::displayAssociations($article->id); ?>
							<?php foreach ($associations as $association) : ?>
								<?php if ($this->params->get('flags', 1) && $association['language']->image) : ?>
									<?php $flag = HTMLHelper::_('image', 'mod_languages/' . $association['language']->image . '.gif', $association['language']->title_native, array('title' => $association['language']->title_native), true); ?>
									<a class="tracy-rowlist__flag" href="<?php echo Route::_($association['item']); ?>"><?php echo $flag; ?></a>
								<?php else : ?>
									<a class="tracy-badge tracy-badge--assoc" href="<?php echo Route::_($association['item']); ?>"><?php echo strtoupper($association['language']->sef); ?></a>
								<?php endif; ?>
							<?php endforeach; ?>
						<?php endif; ?>

						<?php if (J3J4::checkUnpublishedContent($this->items[$i])) : ?>
							<span class="tracy-badge tracy-badge--warn"><?php echo Text::_('JUNPUBLISHED'); ?></span>
						<?php endif; ?>
						<?php if (strtotime($article->publish_up) > strtotime(Factory::getDate())) : ?>
							<span class="tracy-badge tracy-badge--warn"><?php echo Text::_('JNOTPUBLISHEDYET'); ?></span>
						<?php endif; ?>
						<?php if ($article->publish_down && (strtotime($article->publish_down) < strtotime(Factory::getDate())) && $article->publish_down != Factory::getDbo()->getNullDate()) : ?>
							<span class="tracy-badge tracy-badge--warn"><?php echo Text::_('JEXPIRED'); ?></span>
						<?php endif; ?>
					</div>

					<div class="tracy-rowlist__meta">
						<?php if ($dateField) : ?>
							<span class="tracy-rowlist__cell list-date">
								<?php echo HTMLHelper::_('date', $article->displayDate, $this->escape($this->params->get('date_format', Text::_('DATE_FORMAT_LC3')))); ?>
							</span>
						<?php endif; ?>

						<?php if ($this->params->get('list_show_author', 1) && (!empty($article->author) || !empty($article->created_by_alias))) : ?>
							<span class="tracy-rowlist__cell list-author">
								<?php
								$author = $article->created_by_alias ?: $article->author;
								if (!empty($article->contact_link) && $this->params->get('link_author')) {
									echo Text::sprintf('COM_CONTENT_WRITTEN_BY', HTMLHelper::_('link', $article->contact_link, $author));
								} else {
									echo Text::sprintf('COM_CONTENT_WRITTEN_BY', $author);
								}
								?>
							</span>
						<?php endif; ?>

						<?php if ($this->params->get('list_show_hits', 1)) : ?>
							<span class="tracy-rowlist__cell list-hits"><?php echo Text::sprintf('JGLOBAL_HITS_COUNT', (int) $article->hits); ?></span>
						<?php endif; ?>

						<?php if ($this->params->get('list_show_votes', 0) && $this->vote) : ?>
							<span class="tracy-rowlist__cell list-votes"><?php echo Text::sprintf('COM_CONTENT_VOTES_COUNT', (int) $article->rating_count); ?></span>
						<?php endif; ?>

						<?php if ($this->params->get('list_show_ratings', 0) && $this->vote) : ?>
							<span class="tracy-rowlist__cell list-ratings"><?php echo Text::sprintf('COM_CONTENT_RATINGS_COUNT', (int) $article->rating); ?></span>
						<?php endif; ?>

						<?php if ($isEditable && $article->params->get('access-edit')) : ?>
							<span class="tracy-rowlist__cell list-edit"><?php echo HTMLHelper::_('icon.edit', $article, $article->params); ?></span>
						<?php endif; ?>
					</div>
				</li>
			<?php endforeach; ?>
		</ul>
	<?php endif; ?>

	<?php // Code to add a link to submit an article. ?>
	<?php if ($this->category->getParams()->get('access-create')) : ?>
		<div class="tracy-catlist__create"><?php echo HTMLHelper::_('icon.create', $this->category, $this->category->params); ?></div>
	<?php endif; ?>

	<?php // Add pagination links ?>
	<?php if (!empty($this->items)) : ?>
		<?php if (($this->params->def('show_pagination', 2) == 1 || ($this->params->get('show_pagination') == 2)) && ($this->pagination->pagesTotal > 1)) : ?>
			<div class="com-content-category__navigation pagination-wrap tracy-pagination">
				<div class="com-content-category__pagination">
					<?php echo $this->pagination->getPagesLinks(); ?>
				</div>
				<?php if ($this->params->def('show_pagination_results', 1)) : ?>
					<p class="com-content-category__counter counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
				<?php endif; ?>
			</div>
		<?php endif; ?>
	<?php endif; ?>
</form>
