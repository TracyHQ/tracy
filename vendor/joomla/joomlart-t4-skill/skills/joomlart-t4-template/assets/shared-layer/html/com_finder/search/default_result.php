<?php

/**
 * Tracy — one Smart Search result row.
 *
 * The base override wraps each result in a Bootstrap `.row`/`.col-md-*` pair and prints the taxonomy
 * as `badge badge-secondary`. This renders the same data as a hairline-separated result block: title
 * at --text-lg, description at --fg-2, and BOTH the taxonomy and the URL/date line at --meta —
 * design-spec §6 search row, "result meta at --meta". No literal colour or size appears here; the
 * geometry is in scss/_overrides-misc.scss.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\Component\Finder\Administrator\Indexer\Helper;
use Joomla\String\StringHelper;
use Joomla\Utilities\ArrayHelper;

/** @var \Joomla\Component\Finder\Site\View\Search\HtmlView $this */
$mime            = !empty($this->result->mime) ? 'mime-' . $this->result->mime : '';
$showDescription = $this->params->get('show_description', 1);
$description     = '';

if ($showDescription) {
    $termLength = StringHelper::strlen($this->query->input);
    $descLength = $this->params->get('description_length', 255);
    $padLength  = $termLength < $descLength ? (int) floor(($descLength - $termLength) / 2) : 0;

    if (!empty($this->result->summary) && !empty($this->result->body)) {
        $fullDescription = Helper::parse($this->result->summary . $this->result->body);
    } else {
        $fullDescription = (string) $this->result->description;
    }

    $pos   = $termLength ? StringHelper::strpos(StringHelper::strtolower($fullDescription), StringHelper::strtolower($this->query->input)) : false;
    $start = ($pos && $pos > $padLength) ? $pos - $padLength : 0;
    $space = StringHelper::strpos($fullDescription, ' ', $start > 0 ? $start - 1 : 0);
    $start = ($space && $space < $pos) ? $space + 1 : $start;

    $description = HTMLHelper::_('string.truncate', StringHelper::substr($fullDescription, $start), $descLength, true);
}

$image     = null;
$extraAttr = '';

if ($this->params->get('show_image', 0) && !empty($this->result->imageUrl)) {
    $image = HTMLHelper::cleanImageURL($this->result->imageUrl);

    if (
        (isset($image->attributes['width']) && (int) $image->attributes['width'] > 0)
        && (isset($image->attributes['height']) && (int) $image->attributes['height'] > 0)
    ) {
        $extraAttr = ArrayHelper::toString($image->attributes) . ' loading="lazy"';
    }
}

$taxonomies = $this->result->getTaxonomy();
?>
<div class="result-item tracy-result">

    <h2 class="result-title tracy-result__title <?php echo $mime; ?>">
        <?php if ($this->result->route) : ?>
            <a href="<?php echo Route::_($this->result->route); ?>"><?php echo $this->result->title; ?></a>
        <?php else : ?>
            <?php echo $this->result->title; ?>
        <?php endif; ?>
    </h2>

    <div class="tracy-result__body">
        <?php if ($image !== null) : ?>
            <figure class="tracy-result__media result__image <?php echo $this->escape($this->params->get('image_class', '')); ?>">
                <?php if ($this->params->get('link_image') && $this->result->route) : ?>
                    <a href="<?php echo Route::_($this->result->route); ?>">
                        <img src="<?php echo htmlspecialchars($image->url, ENT_COMPAT, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($this->result->imageAlt, ENT_COMPAT, 'UTF-8'); ?>" <?php echo $extraAttr; ?>>
                    </a>
                <?php else : ?>
                    <img src="<?php echo htmlspecialchars($image->url, ENT_COMPAT, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($this->result->imageAlt, ENT_COMPAT, 'UTF-8'); ?>" <?php echo $extraAttr; ?>>
                <?php endif; ?>
            </figure>
        <?php endif; ?>

        <div class="tracy-result__content">
            <?php if ($showDescription && $description !== '') : ?>
                <p class="result-text tracy-result__text"><?php echo $description; ?></p>
            <?php endif; ?>

            <?php if (count($taxonomies) && $this->params->get('show_taxonomy', 1)) : ?>
                <ul class="result-taxonomy tracy-chips">
                    <?php foreach ($taxonomies as $type => $taxonomy) : ?>
                        <li>
                            <span class="tracy-chip tracy-chip--static">
                                <?php echo $this->escape($type); ?>
                                <span class="tracy-chip__count"><?php echo $this->escape(implode(', ', array_column($taxonomy, 'title'))); ?></span>
                            </span>
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>

            <p class="tracy-result__meta">
                <?php if ($this->result->start_date && $this->params->get('show_date', 1)) : ?>
                    <span class="result-date"><?php echo HTMLHelper::_('date', $this->result->start_date, Text::_('DATE_FORMAT_LC3')); ?></span>
                <?php endif; ?>
                <?php if ($this->params->get('show_url', 1)) : ?>
                    <span class="result-url"><?php echo $this->escape($this->baseUrl . Route::_($this->result->cleanURL)); ?></span>
                <?php endif; ?>
            </p>
        </div>
    </div>
</div>
