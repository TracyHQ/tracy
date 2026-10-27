<?php
/**
 * Tracy — com_content / category / blog
 *
 * Starts from the T4 base blog.php. The Joomla plumbing (content-plugin events, category
 * description, leading/intro/link buckets, subcategories, pagination) is unchanged. What changes:
 *
 *   - The intro bucket becomes a CARD GRID (design-spec.md §6, blog.html + services.html +
 *     team.html): 18px radius, 1px ring, NO shadow. The base emits Bootstrap `masonry-N` /
 *     `columns-N` float classes; those fight a real grid, so the row carries .tracy-cardgrid
 *     and the column count reaches CSS as a data attribute instead of a float class.
 *   - Every wrapper that used to be a bare `.item` gets a card class, so the ring/radius rule has
 *     one selector to bind to rather than the framework's generic `.item`.
 *   - `COM_CONTENT_NO_ARTICLES` / `JGLOBAL_SUBCATEGORIES` are kept (both resolve — they are in
 *     com_content.ini / joomla.ini, checked on this build) — gotcha #63.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\FileLayout;
use Joomla\Component\Content\Site\Helper\RouteHelper;

if (!class_exists('ContentHelperRoute')) {
    if (version_compare(JVERSION, '4', 'ge')) {
        abstract class ContentHelperRoute extends RouteHelper
        {
        };
    } else {
        JLoader::register('ContentHelperRoute', $com_path . '/helpers/route.php');
    }
}

// compatible params on joomla 4
$this->columns = !empty($this->columns) ? $this->columns : $this->params->get('num_columns', 1);
if (!$this->columns) {
    $this->columns = 1;
}
$this->blog_class_leading = $this->params->get('blog_class_leading', '');
$this->blog_class         = $this->params->get('blog_class', '');

$app = Factory::getApplication();

$this->category->text = $this->category->description;
$app->triggerEvent('onContentPrepare', array($this->category->extension . '.categories', &$this->category, &$this->params, 0));
$this->category->description = $this->category->text;

$results = $app->triggerEvent('onContentAfterTitle', array($this->category->extension . '.categories', &$this->category, &$this->params, 0));
$afterDisplayTitle = trim(implode("\n", $results));

$results = $app->triggerEvent('onContentBeforeDisplay', array($this->category->extension . '.categories', &$this->category, &$this->params, 0));
$beforeDisplayContent = trim(implode("\n", $results));

$results = $app->triggerEvent('onContentAfterDisplay', array($this->category->extension . '.categories', &$this->category, &$this->params, 0));
$afterDisplayContent = trim(implode("\n", $results));

$htag = $this->params->get('show_page_heading') ? 'h2' : 'h1';
$this->pageclass_sfx = $this->pageclass_sfx != '' ? ' ' . trim($this->pageclass_sfx) : '';

$cols = (int) $this->columns;
$col  = $cols > 2 ? 6 : (int) round(12 / max($cols, 1));
?>
<div class="com-content-category-blog blog tracy-blog<?php echo $this->pageclass_sfx; ?>" itemscope itemtype="https://schema.org/Blog">
	<?php if ($this->params->get('show_page_heading')) : ?>
		<div class="page-header tracy-blog__pagehead">
			<h1><?php echo $this->escape($this->params->get('page_heading')); ?></h1>
		</div>
	<?php endif; ?>

	<?php if ($this->params->get('show_category_title', 1) or $this->params->get('page_subheading')) : ?>
		<div class="page-subheader tracy-blog__subhead">
			<<?php echo $htag; ?> class="page-subtitle"><?php echo $this->escape($this->params->get('page_subheading')); ?>
				<?php if ($this->params->get('show_category_title')) : ?>
					<span class="subheading-category"><?php echo $this->category->title; ?></span>
				<?php endif; ?>
			</<?php echo $htag; ?>>
		</div>
	<?php endif; ?>

	<?php echo $afterDisplayTitle; ?>

	<?php if ($this->params->get('show_cat_tags', 1) && !empty($this->category->tags->itemTags)) : ?>
		<?php $this->category->tagLayout = new FileLayout('joomla.content.tags'); ?>
		<div class="tracy-tags"><?php echo $this->category->tagLayout->render($this->category->tags->itemTags); ?></div>
	<?php endif; ?>

	<?php if ($beforeDisplayContent || $afterDisplayContent || $this->params->get('show_description', 1) || $this->params->def('show_description_image', 1)) : ?>
		<div class="category-desc tracy-blog__desc">
			<?php if ($this->params->get('show_description_image') && $this->category->getParams()->get('image')) : ?>
				<?php $alt = empty($this->category->getParams()->get('image_alt')) && empty($this->category->getParams()->get('image_alt_empty')) ? '' : 'alt="' . htmlspecialchars($this->category->getParams()->get('image_alt'), ENT_COMPAT, 'UTF-8') . '"'; ?>
				<img src="<?php echo $this->category->getParams()->get('image'); ?>" <?php echo $alt; ?>>
			<?php endif; ?>
			<?php echo $beforeDisplayContent; ?>
			<?php if ($this->params->get('show_description') && $this->category->description) : ?>
				<?php echo HTMLHelper::_('content.prepare', $this->category->description, '', 'com_content.category'); ?>
			<?php endif; ?>
			<?php echo $afterDisplayContent; ?>
		</div>
	<?php endif; ?>

	<?php if (empty($this->lead_items) && empty($this->link_items) && empty($this->intro_items)) : ?>
		<?php if ($this->params->get('show_no_articles', 1)) : ?>
			<p class="tracy-empty"><?php echo Text::_('COM_CONTENT_NO_ARTICLES'); ?></p>
		<?php endif; ?>
	<?php endif; ?>

	<?php if (!empty($this->lead_items)) : ?>
		<div class="com-content-category-blog__items blog-items items-leading tracy-cardgrid tracy-cardgrid--lead <?php echo $this->blog_class_leading; ?>">
			<?php foreach ($this->lead_items as &$item) : ?>
				<div class="com-content-category-blog__item blog-item tracy-cardgrid__cell"
					itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting">
					<?php
					$this->item = &$item;
					$this->itemVariant = 'lead';
					echo $this->loadTemplate('item');
					?>
				</div>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>

	<?php if (!empty($this->intro_items)) : ?>
		<div class="com-content-category-blog__items blog-items <?php echo $this->blog_class; ?>">
			<div class="items-row tracy-cardgrid row" data-tracy-cols="<?php echo $cols; ?>">
				<?php foreach ($this->intro_items as $key => &$item) : ?>
					<div class="col-12 col-md-<?php echo $col; ?> col-lg-<?php echo (int) round(12 / max($cols, 1)); ?> tracy-cardgrid__cell">
						<div class="item<?php echo $item->state == 0 ? ' system-unpublished' : ''; ?>" itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting">
							<?php
							$this->item = &$item;
							$this->itemVariant = 'intro';
							echo $this->loadTemplate('item');
							?>
						</div>
					</div>
				<?php endforeach; ?>
			</div>
		</div>
	<?php endif; ?>

	<?php if (!empty($this->link_items)) : ?>
		<div class="items-more tracy-blog__more">
			<?php echo $this->loadTemplate('links'); ?>
		</div>
	<?php endif; ?>

	<?php if ($this->maxLevel != 0 && !empty($this->children[$this->category->id])) : ?>
		<div class="com-content-category-blog__children cat-children tracy-blog__children row">
			<?php if ($this->params->get('show_category_heading_title_text', 1) == 1) : ?>
				<h3><?php echo Text::_('JGLOBAL_SUBCATEGORIES'); ?></h3>
			<?php endif; ?>
			<?php echo $this->loadTemplate('children'); ?>
		</div>
	<?php endif; ?>

	<?php if (($this->params->def('show_pagination', 1) == 1 || ($this->params->get('show_pagination') == 2)) && ($this->pagination->pagesTotal > 1)) : ?>
		<div class="pagination-wrap tracy-pagination">
			<?php echo $this->pagination->getPagesLinks(); ?>
			<?php if ($this->params->def('show_pagination_results', 1)) : ?>
				<p class="counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
			<?php endif; ?>
		</div>
	<?php endif; ?>
</div>
