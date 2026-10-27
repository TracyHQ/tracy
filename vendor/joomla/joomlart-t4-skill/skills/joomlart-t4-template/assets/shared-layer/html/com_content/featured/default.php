<?php
/**
 * Tracy — com_content / featured / default
 *
 * Starts from the T4 base featured/default.php. Two things change.
 *
 * FIRST, a real bug (gotcha #46). The base's intro loop writes:
 *     <div class="items-row cols-N <?php echo 'row-' . $row; ?> row">
 *     <div class="item ... column-<?php echo $rowcount; ?>">
 * but neither $row nor $rowcount is ever assigned in that file — they are leftovers from the
 * pre-J4 layout that computed them. Under Joomla 6 an undefined variable is an Error-level
 * warning, so on a site with display_errors on the front page prints two warnings INSIDE the grid
 * markup, and with it off the class comes out as `row-` / `column-` — a selector that matches
 * nothing. Both are computed here, as the author view's own `author_posts.php` already does.
 *
 * SECOND, the design. index.html is a nine-section ACM stack (design-spec.md §6) and the featured
 * view is the shell those sections sit in, so this stays deliberately light: the design's band
 * wrapper class and the same card grid the category blog uses, and nothing else. The card itself
 * lives in featured/default_item.php, which this template already ships.
 */

defined('_JEXEC') or die;

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

$cols = (int) $this->columns;
$col  = $cols > 2 ? 6 : (int) round(12 / max($cols, 1));
?>
<div class="blog-featured tracy-featured" itemscope itemtype="https://schema.org/Blog">
	<?php if ($this->params->get('show_page_heading') != 0) : ?>
		<div class="page-header tracy-featured__pagehead">
			<h1><?php echo $this->escape($this->params->get('page_heading')); ?></h1>
		</div>
	<?php endif; ?>

	<?php if ($this->params->get('page_subheading')) : ?>
		<h2 class="tracy-featured__subhead"><?php echo $this->escape($this->params->get('page_subheading')); ?></h2>
	<?php endif; ?>

	<?php if (!empty($this->lead_items)) : ?>
		<div class="blog-items items-leading tracy-cardgrid tracy-cardgrid--lead <?php echo $this->blog_class_leading; ?>">
			<?php foreach ($this->lead_items as &$item) : ?>
				<div class="blog-item tracy-cardgrid__cell" itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting">
					<div class="blog-item-content">
						<?php
						$this->item = &$item;
						echo $this->loadTemplate('item');
						?>
					</div>
				</div>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>

	<?php if (!empty($this->intro_items)) : ?>
		<?php $counter = 0; ?>
		<div class="blog-items <?php echo $this->blog_class; ?>">
			<div class="items-row cols-<?php echo $cols; ?> tracy-cardgrid row" data-tracy-cols="<?php echo $cols; ?>">
				<?php foreach ($this->intro_items as $key => &$item) : ?>
					<?php
					// gotcha #46: the base reads $rowcount / $row without ever assigning them.
					$rowcount = ((int) $counter % max($cols, 1)) + 1;
					$row      = (int) floor($counter / max($cols, 1));
					?>
					<div class="item col-12 col-md-<?php echo $col; ?> col-lg-<?php echo (int) round(12 / max($cols, 1)); ?> row-<?php echo $row; ?> column-<?php echo $rowcount; ?> tracy-cardgrid__cell<?php echo $item->state == 0 ? ' system-unpublished' : ''; ?>"
						itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting">
						<?php
						$this->item = &$item;
						echo $this->loadTemplate('item');
						?>
					</div>
					<?php $counter++; ?>
				<?php endforeach; ?>
			</div>
		</div>
	<?php endif; ?>

	<?php if (!empty($this->link_items)) : ?>
		<div class="items-more tracy-featured__more">
			<?php echo $this->loadTemplate('links'); ?>
		</div>
	<?php endif; ?>

	<?php if ($this->params->def('show_pagination', 2) == 1 || ($this->params->get('show_pagination') == 2 && $this->pagination->pagesTotal > 1)) : ?>
		<div class="pagination-wrap tracy-pagination">
			<?php echo $this->pagination->getPagesLinks(); ?>
			<?php if ($this->params->def('show_pagination_results', 1)) : ?>
				<p class="counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
			<?php endif; ?>
		</div>
	<?php endif; ?>
</div>
