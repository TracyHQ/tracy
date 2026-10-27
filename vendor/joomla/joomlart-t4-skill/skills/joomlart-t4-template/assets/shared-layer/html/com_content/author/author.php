<?php
/**
 * Tracy — com_content / author / author (the AUTHOR DETAIL view)
 *
 * The author view is T4's, not Joomla core's — the only version to start from is
 * plugins/system/t4/themes/base/html/com_content/author/author.php (page-coverage-matrix.md §C1).
 * The base's structure is kept: the AJAX pagination passthrough, the shared
 * `t4.content.author_info` card, the posts subtemplate, the T4 pagination layout. design-spec.md
 * §6 (author.html) asks only for "avatar at 50%, bio at --fg-2", which is CSS — so the change here
 * is the wrapper classes that give scss/_overrides-content.scss a scope, plus three defects:
 *
 *   1. `<div class="alert alert-info">No articles post</div>` is a hard-coded, ungrammatical
 *      English literal in a shipped file — untranslatable, and it renders on any author who has
 *      not published yet. It becomes TPL_TRACY_APPLE_AUTHOR_NO_ARTICLES.
 *   2. `$this->category->title` is read whenever show_category_title is on, but the author view's
 *      model never sets $this->category — on a menu item with that param the page fatals. Guarded.
 *   3. `alert alert-info` is a Bootstrap contextual colour this palette does not own and cannot
 *      tokenise; the empty state uses the design's own .tracy-empty.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\LayoutHelper;
use Joomla\Component\Content\Site\Helper\RouteHelper;
use T4\Helper\Layout;

if (!class_exists('ContentHelperRoute')) {
    if (version_compare(JVERSION, '4', 'ge')) {
        abstract class ContentHelperRoute extends RouteHelper
        {
        };
    } else {
        JLoader::register('ContentHelperRoute', $com_path . '/helpers/route.php');
    }
}

$app = Factory::getApplication();

// process for ajax pagination, just get items content and return to browser
if ($app->input->get('loadpage') !== null) {
    echo $this->loadTemplate('posts');
    exit;
}

$hasCategory = !empty($this->category) && !empty($this->category->title);
?>
<div class="author-detail tracy-author">
	<?php echo LayoutHelper::render('t4.content.author_info', ['author' => $this->author, 'link' => false, 'class' => 'author-block-posts']); ?>
</div>

<?php if (!empty($this->article_items) && count($this->article_items)) : ?>
	<div class="blog author-posts tracy-author__posts" itemscope itemtype="https://schema.org/Blog">
		<?php if ($this->params->get('show_page_heading')) : ?>
			<div class="page-header tracy-author__pagehead">
				<h1><?php echo $this->escape($this->params->get('page_heading')); ?></h1>
			</div>
		<?php endif; ?>

		<?php if (($this->params->get('show_category_title', 1) && $hasCategory) || $this->params->get('page_subheading')) : ?>
			<h2 class="tracy-author__subhead">
				<?php echo $this->escape($this->params->get('page_subheading')); ?>
				<?php if ($this->params->get('show_category_title') && $hasCategory) : ?>
					<span class="subheading-category"><?php echo $this->escape($this->category->title); ?></span>
				<?php endif; ?>
			</h2>
		<?php endif; ?>

		<?php if ($this->params->get('show_cat_tags', 1) && $hasCategory && !empty($this->category->tags->itemTags)) : ?>
			<?php $this->category->tagLayout = new Layout('joomla.content.tags'); ?>
			<div class="tracy-tags"><?php echo $this->category->tagLayout->render($this->category->tags->itemTags); ?></div>
		<?php endif; ?>

		<?php echo $this->loadTemplate('posts'); ?>

		<?php echo LayoutHelper::render('t4.content.pagination', ['params' => $this->params, 'pagination' => $this->pagination, 'elem' => '.author-posts > .content-item']); ?>
	</div>
<?php else : ?>
	<p class="tracy-empty tracy-author__empty"><?php echo Text::_('TPL_TRACY_APPLE_AUTHOR_NO_ARTICLES'); ?></p>
<?php endif; ?>
