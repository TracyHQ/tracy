<?php

/**
 * Pricing: the `pricing` page kind. The article body carries the comparison table
 * (<table class="tracy-pricing" data-hot="N">); this layout only frames it. No parsing.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'pricing');

$item = $this->item;
?>
<section class="tracy-pricing-page tracy-container">
    <header class="tracy-pricing-page__head">
        <h1 class="tracy-display"><?php echo $this->escape($item->title); ?></h1>
        <?php echo $item->event->afterDisplayTitle; ?>
    </header>
    <?php echo $item->event->beforeDisplayContent; ?>
    <div class="tracy-pricing-page__body">
        <?php echo $item->text; ?>
    </div>
    <?php echo $item->event->afterDisplayContent; ?>
</section>
<?php
// The section library's closing call to action, as the WordPress pricing template shows it.
$cta = JPATH_THEMES . '/tpl_tracy/sections/cta-final.html';

if (is_file($cta)) {
    echo file_get_contents($cta);
}
?>
