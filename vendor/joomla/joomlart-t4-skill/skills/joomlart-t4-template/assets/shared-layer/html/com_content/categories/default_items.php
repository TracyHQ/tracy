<?php
/**
 * Tracy — com_content / categories / default_items
 *
 * Starts from the T4 base categories/default_items.php, which emits a bare `.item-inner` div per
 * category plus a Bootstrap `badge badge-info` count. design-spec.md §6 (all-categories.html) asks
 * for "Category tree as ringed cards on --surface", so each category becomes an explicit card
 * element the ring/radius rule can bind to, and the count becomes the design's own badge instead
 * of Bootstrap's — `badge-info` is a colour this palette does not own and cannot tokenise.
 *
 * Two defects fixed on the way through:
 *   - `Text::_('COM_CONTENT_NUM_ITEMS')` prints "Article Count:" with the number as a separate
 *     node, and its tooltip key COM_CONTENT_NUM_ITEMS_TIP does not exist in ANY .ini on this build
 *     — so the base renders the literal string COM_CONTENT_NUM_ITEMS_TIP into a title attribute
 *     (gotcha #63, verified by grep over language/ and administrator/language/). Both are replaced
 *     by template keys with a real placeholder.
 *   - `data-toggle` is the Bootstrap 4 attribute and does nothing under BS5. The toggle now carries
 *     the class the view's own script binds to, so it works regardless of the Bootstrap build.
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

if ($this->maxLevelcat != 0 && count($this->items[$this->parent->id]) > 0) :
?>
	<div class="com-content-categories__items tracy-cattree__items">
		<?php foreach ($this->items[$this->parent->id] as $id => $item) : ?>
			<?php if ($this->params->get('show_empty_categories_cat') || $item->numitems || count($item->getChildren())) : ?>
				<div class="com-content-categories__item tracy-cattree__card">
					<div class="item-inner tracy-cattree__inner">

						<?php if ($this->params->get('show_description_image') && $item->getParams()->get('image')) : ?>
							<div class="tracy-cattree__media">
								<img src="<?php echo $item->getParams()->get('image'); ?>" alt="<?php echo htmlspecialchars($item->getParams()->get('image_alt'), ENT_COMPAT, 'UTF-8'); ?>">
							</div>
						<?php endif; ?>

						<h3 class="page-header item-title tracy-cattree__title">
							<a href="<?php echo Route::_(ContentHelperRoute::getCategoryRoute($item->id, $item->language)); ?>">
								<?php echo $this->escape($item->title); ?>
							</a>

							<?php if ($this->params->get('show_cat_num_articles_cat') == 1) : ?>
								<span class="tracy-badge tracy-badge--count" title="<?php echo $this->escape(Text::_('TPL_TRACY_APPLE_CATEGORY_ARTICLE_COUNT_TIP')); ?>">
									<?php echo Text::sprintf('TPL_TRACY_APPLE_CATEGORY_ARTICLE_COUNT', (int) $item->numitems); ?>
								</span>
							<?php endif; ?>

							<?php if (count($item->getChildren()) > 0 && $this->maxLevelcat > 1) : ?>
								<a id="category-btn-<?php echo $item->id; ?>"
									href="#category-<?php echo $item->id; ?>"
									class="tracy-cattree__toggle"
									aria-expanded="false"
									aria-controls="category-<?php echo $item->id; ?>"
									aria-label="<?php echo Text::_('JGLOBAL_EXPAND_CATEGORIES'); ?>"><span class="icon-plus" aria-hidden="true"></span></a>
							<?php endif; ?>
						</h3>

						<?php if ($this->params->get('show_subcat_desc_cat') == 1 && $item->description) : ?>
							<div class="com-content-categories__description category-desc tracy-cattree__desc">
								<?php echo HTMLHelper::_('content.prepare', $item->description, '', 'com_content.categories'); ?>
							</div>
						<?php endif; ?>

						<?php if (count($item->getChildren()) > 0 && $this->maxLevelcat > 1) : ?>
							<div class="com-content-categories__children tracy-cattree__children collapse" id="category-<?php echo $item->id; ?>">
								<?php
								$this->items[$item->id] = $item->getChildren();
								$this->parent           = $item;
								$this->maxLevelcat--;
								echo $this->loadTemplate('items');
								$this->parent = $item->getParent();
								$this->maxLevelcat++;
								?>
							</div>
						<?php endif; ?>
					</div>
				</div>
			<?php endif; ?>
		<?php endforeach; ?>
	</div>
<?php endif; ?>
