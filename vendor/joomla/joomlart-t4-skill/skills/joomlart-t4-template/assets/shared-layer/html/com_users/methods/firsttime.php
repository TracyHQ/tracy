<?php

/**
 * @package     Tracy
 * @subpackage  com_users.methods
 *
 * Template override of the CORE view. The "you have no second factor yet" prompt. The core layout put
 * the whole thing inside one `alert alert-info` — a pale blue slab that neither follows the palette
 * nor flips in dark — and made "not interested" a full-width red button, which reads as the primary
 * action of the page it is trying to talk you out of. Here it is a --surface-warm notice with a quiet
 * secondary opt-out.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Methods\HtmlView $this */

$returnFragment = $this->returnURL ? '&returnurl=' . $this->escape(urlencode($this->returnURL)) : '';
?>
<div id="com-users-methods-list" class="tracy-mfa">
    <?php if (!$this->isAdmin) : ?>
        <h2 id="com-users-methods-list-head" class="tracy-mfa-title">
            <?php echo Text::_('COM_USERS_MFA_FIRSTTIME_PAGE_HEAD'); ?>
        </h2>
    <?php endif; ?>

    <div id="com-users-methods-list-instructions" class="tracy-notice">
        <h3 class="tracy-notice-title">
            <?php echo Text::_('COM_USERS_MFA_FIRSTTIME_INSTRUCTIONS_HEAD'); ?>
        </h3>
        <p><?php echo Text::_('COM_USERS_MFA_FIRSTTIME_INSTRUCTIONS_WHATITDOES'); ?></p>
        <a href="<?php echo Route::_(
                    'index.php?option=com_users&task=methods.doNotShowThisAgain'
                    . $returnFragment
                    . '&user_id=' . $this->user->id
                    . '&' . Factory::getApplication()->getFormToken() . '=1'
                ); ?>"
           class="btn btn-secondary">
            <?php echo Text::_('COM_USERS_MFA_FIRSTTIME_NOTINTERESTED'); ?>
        </a>
    </div>

    <?php $this->setLayout('list'); ?>
    <?php echo $this->loadTemplate(); ?>
</div>
