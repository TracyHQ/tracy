<?php

/**
 * Template override of `plg_content_vote`'s rating summary.
 *
 * WHY THIS FILE EXISTS. Two reasons, and the second is the one that cannot be fixed in CSS.
 *
 * 1. The core layout registers `plg_content_vote/rating.css`, whose entire content is four rules
 *    carrying two hex LITERALS: `fill:#fd7e14` for a full star and `fill:#d3d3d3` for an empty one.
 *    Neither belongs to any design system, and neither flips in dark — measured on a black page,
 *    the empty star was still rgb(211,211,211), brighter than the ink around it. The shared layer
 *    used to fight the first literal with a later rule and never reached the second. Not loading
 *    the sheet at all removes the fight: the stars are painted here, from tokens, once.
 *
 * 2. On an article, `vote.php` renders a SECOND star row immediately below this one — the control.
 *    Core draws both, so the same rating appears twice: once to read and once to set. This file
 *    draws the read-only row only where the control will not follow, which is every view except
 *    the article itself. The condition is copied from `Vote::displayVotingData()`, which is where
 *    the decision actually lives.
 *
 * @package     Tracy
 * @subpackage  plg_content_vote
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Uri\Uri;

/**
 * @var   string   $context  The context of the content being passed to the plugin
 * @var   object   $row      The article object
 * @var   object   $params   The article params
 * @var   integer  $page     The 'page' number
 */

if ($context === 'com_content.categories') {
    return;
}

$rating = (float) $row->rating;
$rcount = (int) $row->rating_count;

// `vote.php` renders under exactly this condition — same test, same source.
$hasControl = $this->getApplication()->getInput()->getString('view', '') === 'article'
    && (int) $row->state === 1;

?>
<?php if ($rcount) : ?>
    <div class="visually-hidden">
        <p itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
            <?php echo Text::sprintf('PLG_VOTE_USER_RATING', '<span itemprop="ratingValue">' . $rating . '</span>', '<span itemprop="bestRating">5</span>'); ?>
            <meta itemprop="ratingCount" content="<?php echo $rcount; ?>">
            <meta itemprop="worstRating" content="1">
        </p>
    </div>
<?php endif; ?>

<?php
if ($hasControl) {
    return;
}

$iconStar = HTMLHelper::_('image', 'plg_content_vote/vote-star.svg', '', '', true, true);

if ($iconStar === null) {
    return;
}

$star = file_get_contents(JPATH_ROOT . substr($iconStar, strlen(Uri::root(true))));

// Whole stars only, with the exact figure carried in the label beside them. Core spends a second
// asset and a negative margin on a half-star overlay to say "3.5" in pictures; the number says it
// exactly, and one glyph is one vote — which is also all a reader can cast.
$filled = (int) round($rating);
?>
<div class="tracy-rating tracy-rating--static" role="img" aria-label="<?php echo Text::sprintf('PLG_VOTE_STAR_RATING', $rating); ?>">
    <span class="tracy-rating__stars">
        <?php for ($i = 1; $i <= 5; $i++) : ?>
            <span class="tracy-rating__star<?php echo $i <= $filled ? ' is-on' : ''; ?>"><?php echo $star; ?></span>
        <?php endfor; ?>
    </span>
    <?php if ($rcount && $this->params->get('show_total_votes', 0)) : ?>
        <span class="tracy-rating__count"><?php echo Text::sprintf('PLG_VOTE_TOTAL_VOTES', $rcount); ?></span>
    <?php endif; ?>
</div>
