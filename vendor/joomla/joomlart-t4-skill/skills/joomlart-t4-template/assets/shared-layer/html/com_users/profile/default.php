<?php

/**
 * @package     Tracy
 * @subpackage  com_users.profile
 *
 * Template override of the T4 base view. The profile is a reading surface, not a form, so it drops
 * the card and becomes a stack of --surface panels with hairline-separated definition rows
 * (design-spec §6 profile row). The base's edit affordance was a <ul class="btn-toolbar"> holding one
 * button; a one-item list is not a list, so it is a plain capsule link. Factory::getUser() is
 * replaced by the application identity — the former is deprecated in Joomla 6.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Profile\HtmlView $this */

$identity = Factory::getApplication()->getIdentity();
$isSelf   = $identity && (int) $identity->id === (int) $this->data->id;
?>
<div class="com-users-profile tracy-profile">
    <?php if ($this->params->get('show_page_heading') || $isSelf) : ?>
        <header class="tracy-profile-head">
            <?php if ($this->params->get('show_page_heading')) : ?>
                <h1 class="tracy-profile-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            <?php endif; ?>

            <?php if ($isSelf) : ?>
                <a class="com-users-profile__edit btn btn-secondary"
                   href="<?php echo Route::_('index.php?option=com_users&task=profile.edit&user_id=' . (int) $this->data->id); ?>">
                    <span class="icon-user" aria-hidden="true"></span>
                    <?php echo Text::_('COM_USERS_EDIT_PROFILE'); ?>
                </a>
            <?php endif; ?>
        </header>
    <?php endif; ?>

    <?php echo $this->loadTemplate('core'); ?>
    <?php echo $this->loadTemplate('params'); ?>
    <?php echo $this->loadTemplate('custom'); ?>
</div>
