<?php
/**
 * Tracy — com_content / category / default (the category LIST view)
 *
 * The base file is three lines: a wrapper div plus a delegation to the shared
 * `joomla.content.category_default` layout, which renders the heading/description/children and
 * then loads the `articles` subtemplate. That delegation is worth keeping — it is exactly the
 * "don't re-author what base already covers" case (gotcha #10) — so the ONLY change here is the
 * design's own wrapper class, which gives scss/_overrides-content.scss a scope to hang the
 * hairline row rules on. The rows themselves are in default_articles.php, because that is the file
 * that holds the <table> the design has to lose.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Layout\LayoutHelper;

?>
<div class="com-content-category category-list tracy-catlist <?php echo $this->pageclass_sfx; ?>">
<?php
$this->subtemplatename = 'articles';
echo LayoutHelper::render('joomla.content.category_default', $this);
?>
</div>
