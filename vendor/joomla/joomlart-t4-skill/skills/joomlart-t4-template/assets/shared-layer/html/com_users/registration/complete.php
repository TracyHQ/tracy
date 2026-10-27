<?php

/**
 * @package     Tracy
 * @subpackage  com_users.registration
 *
 * Template override of the T4 base view. The base renders a bare <h1> and nothing else, so the
 * "thanks, check your mail" state was the one com_users page with no shell at all. Same card, so the
 * end of the flow looks like the rest of it. The confirmation sentence itself is Joomla's own
 * enqueued system message; this view only holds the frame.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

/** @var \Joomla\Component\Users\Site\View\Registration\HtmlView $this */
?>
<div class="tracy-auth">
    <div class="com-users-registration-complete tracy-auth-card <?php echo $this->pageclass_sfx; ?>">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>
    </div>
</div>
