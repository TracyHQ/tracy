<?php

/**
 * Template override of `plg_content_vote`'s voting form.
 *
 * WHAT CHANGED AND WHY. Core ships a `<select>` listing "Vote 1" … "Vote 5" next to a filled
 * `btn-primary` submit, standing beside a star row that is display-only. Two interaction models
 * side by side: stars to read a rating, a dropdown to set one. Nobody reads stars and then opens a
 * menu — in this design's register the star IS the control, and the read-only row above is
 * therefore redundant (`rating.php` stands down on the article for that reason).
 *
 * It also spent the page's accent on a minor control: measured on the article, the Rate button was
 * the ONLY filled accent on screen, sitting directly under the headline, where design-spec.md §2
 * allows two accent uses per screen for the page's real call to action.
 *
 * NO JAVASCRIPT, AND NOTHING ADDED TO THE REQUEST. Five submit buttons named `user_rating` post the
 * same field the dropdown did — `ArticleController::vote()` reads `$this->input->getInt('user_rating')`
 * and nothing else from that form, so `submit_vote` is not needed and is gone. Whichever button is
 * pressed is the only one a browser submits.
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

$uri      = clone Uri::getInstance();
$iconStar = HTMLHelper::_('image', 'plg_content_vote/vote-star.svg', '', '', true, true);

if ($iconStar === null) {
    return;
}

$star   = file_get_contents(JPATH_ROOT . substr($iconStar, strlen(Uri::root(true))));
$rating = (float) $row->rating;
$rcount = (int) $row->rating_count;

// Whole stars: a reader casts 1 to 5 and the average is spelled out in the label, so a half-star
// glyph would be the only thing here that cannot be clicked.
$filled = (int) round($rating);

?>
<form method="post" action="<?php echo htmlspecialchars($uri->toString(), ENT_COMPAT, 'UTF-8'); ?>" class="tracy-rating">
    <span class="tracy-rating__stars" role="group" aria-label="<?php echo Text::_('PLG_VOTE_LABEL'); ?>">
        <?php for ($i = 1; $i <= 5; $i++) : ?>
            <button type="submit"
                name="user_rating"
                value="<?php echo $i; ?>"
                class="tracy-rating__star<?php echo $i <= $filled ? ' is-on' : ''; ?>"
                aria-label="<?php echo Text::sprintf('PLG_VOTE_VOTE', $i); ?>"><?php echo $star; ?></button>
        <?php endfor; ?>
    </span>
    <?php if ($rcount && $this->params->get('show_total_votes', 0)) : ?>
        <span class="tracy-rating__count"><?php echo Text::sprintf('PLG_VOTE_TOTAL_VOTES', $rcount); ?></span>
    <?php endif; ?>
    <input type="hidden" name="task" value="article.vote">
    <input type="hidden" name="hitcount" value="0">
    <input type="hidden" name="url" value="<?php echo htmlspecialchars($uri->toString(), ENT_COMPAT, 'UTF-8'); ?>">
    <?php echo HTMLHelper::_('form.token'); ?>
</form>
