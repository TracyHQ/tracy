<?php
/**
 * Tracy — com_content / featured / default_item
 *
 * This file was the blank's, byte for byte, while `featured/default.php` beside it carried a note
 * saying "the item lives in featured/default_item.php, which this template already ships". It did
 * not: a scaffolded copy is not authorship, and nothing in the build could tell the two apart.
 *
 * It is the same card as `category/blog_item.php` — one <article class="tracy-postcard"> with an
 * explicit media slot, so design-spec.md §6's card (18px radius, 1px ring, no shadow) binds to one
 * element and the intro image clips to the same corner. The featured view and the blog view show
 * the same kind of thing, so they look the same on purpose; the two files stay separate because
 * Joomla resolves them through different view paths, which is also how core ships them.
 *
 * Not a whole-card <a>: editability-standards.md §5 — a whole-card link forces every child to be
 * restyled or the card renders all-blue.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Associations;
use Joomla\CMS\Layout\LayoutHelper;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use T4\Helper\J3J4;

// Joomla 5 moved the route helper into a namespace; the featured view still addresses it by the
// old global name, so the alias has to exist before the first call. Same guard the base ships.
if (!class_exists('ContentHelperRoute')) {
    if (class_exists('\Joomla\Component\Content\Site\Helper\RouteHelper')) {
        class_alias('\Joomla\Component\Content\Site\Helper\RouteHelper', 'ContentHelperRoute');
    } else {
        $com_path = JPATH_SITE . '/components/com_content';
        JLoader::register('ContentHelperRoute', $com_path . '/helpers/route.php');
    }
}

$params  = $this->item->params;
$canEdit = $params->get('access-edit');
$info    = $params->get('info_block_position', 0);

$assocParam = (Associations::isEnabled() && $params->get('show_associations'));

$timePublishDown = $this->item->publish_down != null ? strtotime($this->item->publish_down) : '';
$timePublishUp   = $this->item->publish_up   != null ? strtotime($this->item->publish_up)   : '';

$isUnpublished = J3J4::checkUnpublishedContent($this->item)
    || $timePublishUp > strtotime(Factory::getDate())
    || (($timePublishDown < strtotime(Factory::getDate())) && $this->item->publish_down != Factory::getDbo()->getNullDate());

$useDefList = ($params->get('show_modify_date') || $params->get('show_publish_date') || $params->get('show_create_date')
    || $params->get('show_hits') || $params->get('show_category') || $params->get('show_parent_category')
    || $params->get('show_author') || $assocParam);

// Rendered ahead of the markup so an article with no intro image gets no empty media slot at all —
// an empty slot would still draw the card's inner hairline.
$media = LayoutHelper::render('joomla.content.intro_image', $this->item);
?>
<article class="tracy-postcard<?php echo $isUnpublished ? ' system-unpublished' : ''; ?>">
	<?php if (trim($media) !== '') : ?>
		<div class="tracy-postcard__media">
			<?php echo $media; ?>
		</div>
	<?php endif; ?>

	<div class="item-content tracy-postcard__body">
		<?php echo LayoutHelper::render('joomla.content.blog_style_default_item_title', $this->item); ?>

		<div class="article-aside tracy-postcard__meta">
			<?php if ($useDefList && ($info == 0 || $info == 2)) : ?>
				<?php echo LayoutHelper::render('joomla.content.info_block', array('item' => $this->item, 'params' => $params, 'position' => 'above')); ?>
			<?php endif; ?>

			<?php if ($canEdit || $params->get('show_print_icon') || $params->get('show_email_icon')) : ?>
				<?php echo LayoutHelper::render('joomla.content.icons', array('params' => $params, 'item' => $this->item, 'print' => false)); ?>
			<?php endif; ?>
		</div>

		<?php if ($info == 0 && $params->get('show_tags', 1) && !empty($this->item->tags->itemTags)) : ?>
			<div class="tracy-tags"><?php echo LayoutHelper::render('joomla.content.tags', $this->item->tags->itemTags); ?></div>
		<?php endif; ?>

		<?php if (!$params->get('show_intro')) : ?>
			<?php echo $this->item->event->afterDisplayTitle; ?>
		<?php endif; ?>

		<?php echo $this->item->event->beforeDisplayContent; ?>

		<div class="item-intro tracy-postcard__intro">
			<?php echo $this->item->introtext; ?>
		</div>

		<?php if ($useDefList && ($info == 1 || $info == 2)) : ?>
			<div class="tracy-postcard__meta">
				<?php echo LayoutHelper::render('joomla.content.info_block', array('item' => $this->item, 'params' => $params, 'position' => 'below')); ?>
			</div>
			<?php if ($params->get('show_tags', 1) && !empty($this->item->tags->itemTags)) : ?>
				<div class="tracy-tags"><?php echo LayoutHelper::render('joomla.content.tags', $this->item->tags->itemTags); ?></div>
			<?php endif; ?>
		<?php endif; ?>

		<?php if ($params->get('show_readmore') && $this->item->readmore) :
			if ($params->get('access-view')) :
				$link = Route::_(ContentHelperRoute::getArticleRoute($this->item->slug, $this->item->catid, $this->item->language));
			else :
				$menu   = Factory::getApplication()->getMenu();
				$active = $menu->getActive();
				$itemId = $active ? $active->id : 0;
				$link   = new Uri(Route::_('index.php?option=com_users&view=login&Itemid=' . $itemId, false));
				$link->setVar('return', base64_encode(ContentHelperRoute::getArticleRoute($this->item->slug, $this->item->catid, $this->item->language)));
			endif; ?>

			<div class="tracy-postcard__action">
				<?php echo LayoutHelper::render('joomla.content.readmore', array('item' => $this->item, 'params' => $params, 'link' => $link)); ?>
			</div>
		<?php endif; ?>
	</div>
</article>

<?php echo $this->item->event->afterDisplayContent; ?>
