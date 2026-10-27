<?php

/**
 * @package     Tracy
 * @subpackage  com_users.methods
 *
 * Template override of the CORE view — the T4 base theme ships no MFA templates, so without this the
 * page arrived in raw Bootstrap (gotcha #65). Same logic, tokenised chrome: the status strip loses
 * `border border-1 rounded-3 bg-light` (a light slab that stays light on a black page) for the
 * template's --surface panel, and the two Joomla `alert alert-info` boxes become --surface-warm
 * notices. The "remove all" action keeps the danger colour: that one IS destructive.
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
    <?php if (!isset($this->forHMVC) || !$this->forHMVC) : ?>
        <h2 id="com-users-methods-list-head" class="tracy-mfa-title">
            <?php echo Text::_('COM_USERS_MFA_LIST_PAGE_HEAD'); ?>
        </h2>
    <?php endif; ?>

    <div id="com-users-methods-reset-container" class="tracy-mfa-status">
        <p id="com-users-methods-reset-message" class="tracy-mfa-status-text">
            <?php echo Text::_('COM_USERS_MFA_LIST_STATUS_' . ($this->mfaActive ? 'ON' : 'OFF')); ?>
        </p>
        <?php if ($this->mfaActive) : ?>
            <a href="<?php echo Route::_('index.php?option=com_users&task=methods.disable&' . Factory::getApplication()->getFormToken() . '=1' . $returnFragment . '&user_id=' . $this->user->id); ?>"
               class="btn btn-danger tracy-mfa-danger">
                <?php echo Text::_('COM_USERS_MFA_LIST_REMOVEALL'); ?>
            </a>
        <?php endif; ?>
    </div>

    <?php if (!count($this->methods)) : ?>
        <div id="com-users-methods-list-instructions" class="tracy-notice">
            <span class="icon icon-info-circle" aria-hidden="true"></span>
            <?php echo Text::_('COM_USERS_MFA_LIST_INSTRUCTIONS'); ?>
        </div>
    <?php elseif ($this->isMandatoryMFASetup) : ?>
        <div class="tracy-notice">
            <h3 class="tracy-notice-title">
                <?php echo Text::_('COM_USERS_MFA_MANDATORY_NOTICE_HEAD'); ?>
            </h3>
            <p><?php echo Text::_('COM_USERS_MFA_MANDATORY_NOTICE_BODY'); ?></p>
        </div>
    <?php endif; ?>

    <?php $this->setLayout('list'); ?>
    <?php echo $this->loadTemplate(); ?>
</div>
