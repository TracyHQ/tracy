<?php

/**
 * @package     Tracy
 * @subpackage  com_users.login
 *
 * Template override of the T4 base partial. The logged-in state of the login view. Same card as the
 * sign-in form so the two states of one route read as one page; the base's floated thumbnail becomes
 * a block image inside the card because a float cannot survive a 420px column.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Login\HtmlView $this */

$logoutShow = (int) $this->params->get('logoutdescription_show') === 1;
$logoutDesc = $this->params->get('logout_description') ?: '';
$logoutImg  = $this->params->get('logout_image') ?: '';
$showDesc   = $logoutShow && trim($logoutDesc) !== '';
?>
<div class="com-users-logout tracy-auth-card <?php echo $this->pageclass_sfx; ?>">
    <?php if ($this->params->get('show_page_heading') || $showDesc || $logoutImg) : ?>
        <header class="tracy-auth-head">
            <?php if ($this->params->get('show_page_heading')) : ?>
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            <?php endif; ?>

            <?php if ($showDesc || $logoutImg) : ?>
                <div class="com-users-logout__description tracy-auth-lead">
                    <?php if ($showDesc) : ?>
                        <?php echo $logoutDesc; ?>
                    <?php endif; ?>

                    <?php if ($logoutImg) : ?>
                        <?php
                        $alt = empty($this->params->get('logout_image_alt')) && empty($this->params->get('logout_image_alt_empty'))
                            ? ''
                            : 'alt="' . htmlspecialchars($this->params->get('logout_image_alt'), ENT_COMPAT, 'UTF-8') . '"';
                        ?>
                        <img src="<?php echo $this->escape($logoutImg); ?>" class="com-users-logout__image tracy-auth-image" <?php echo $alt; ?>>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </header>
    <?php endif; ?>

    <form action="<?php echo Route::_('index.php?option=com_users&task=user.logout'); ?>"
          method="post"
          class="com-users-logout__form tracy-auth-form">
        <div class="tracy-auth-actions">
            <button type="submit" class="btn btn-primary tracy-auth-submit">
                <?php echo Text::_('JLOGOUT'); ?>
            </button>
        </div>

        <?php if ($this->params->get('logout_redirect_url')) : ?>
            <input type="hidden" name="return" value="<?php echo base64_encode($this->params->get('logout_redirect_url', $this->form->getValue('return', null, ''))); ?>">
        <?php else : ?>
            <input type="hidden" name="return" value="<?php echo base64_encode($this->params->get('logout_redirect_menuitem', $this->form->getValue('return', null, ''))); ?>">
        <?php endif; ?>
        <?php echo HTMLHelper::_('form.token'); ?>
    </form>
</div>
