<?php

/**
 * @package     Tracy
 * @subpackage  com_users.login
 *
 * Template override of the T4 base partial. Same logic, Apple shell: one card on --surface with the
 * 1px containment ring (no shadow), the credentials fieldset rendered as stacked .field rows, and a
 * single capsule submit. The three helper links leave the card and sit under it in --fg-2, NOT in
 * the accent: DESIGN.md §7 caps a screen at two visible accent uses and the submit fill already
 * spends one.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Login\HtmlView $this */

HTMLHelper::_('behavior.keepalive');
HTMLHelper::_('behavior.formvalidator');

$usersConfig = ComponentHelper::getParams('com_users');

$loginDesc = $this->params->get('login_description') ?: '';
$showDesc  = (int) $this->params->get('logindescription_show') === 1 && trim($loginDesc) !== '';
$loginImg  = $this->params->get('login_image') ?: '';
?>
<div class="com-users-login tracy-auth-card">
    <?php if ($this->params->get('show_page_heading') || $showDesc || $loginImg) : ?>
        <header class="tracy-auth-head">
            <?php if ($this->params->get('show_page_heading')) : ?>
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            <?php endif; ?>

            <?php if ($showDesc || $loginImg) : ?>
                <div class="com-users-login__description tracy-auth-lead">
                    <?php if ($showDesc) : ?>
                        <?php echo $loginDesc; ?>
                    <?php endif; ?>

                    <?php if ($loginImg) : ?>
                        <?php
                        $alt = empty($this->params->get('login_image_alt')) && empty($this->params->get('login_image_alt_empty'))
                            ? ''
                            : 'alt="' . htmlspecialchars($this->params->get('login_image_alt'), ENT_COMPAT, 'UTF-8') . '"';
                        ?>
                        <img src="<?php echo $this->escape($loginImg); ?>" class="com-users-login__image tracy-auth-image" <?php echo $alt; ?>>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </header>
    <?php endif; ?>

    <form id="com-users-login__form"
          action="<?php echo Route::_('index.php?option=com_users&task=user.login'); ?>"
          method="post"
          class="com-users-login__form tracy-auth-form form-validate">
        <fieldset class="tracy-auth-fieldset">
            <?php echo $this->form->renderFieldset('credentials', ['class' => 'tracy-field']); ?>

            <?php if (PluginHelper::isEnabled('system', 'remember')) : ?>
                <div class="tracy-auth-remember form-check">
                    <input id="remember" type="checkbox" name="remember" class="form-check-input" value="yes">
                    <label class="form-check-label" for="remember">
                        <?php echo Text::_('COM_USERS_LOGIN_REMEMBER_ME'); ?>
                    </label>
                </div>
            <?php endif; ?>

            <div class="tracy-auth-actions">
                <button type="submit" class="btn btn-primary tracy-auth-submit">
                    <?php echo Text::_('JLOGIN'); ?>
                </button>
            </div>

            <?php if (property_exists($this, 'extraButtons') && !empty($this->extraButtons)) : ?>
                <div class="tracy-auth-alt">
                    <?php foreach ($this->extraButtons as $button) : ?>
                        <?php
                        $dataAttributeKeys = array_filter(
                            array_keys($button),
                            static function ($key) {
                                return substr($key, 0, 5) === 'data-';
                            }
                        );
                        ?>
                        <button type="button"
                                class="btn btn-secondary tracy-auth-submit <?php echo $button['class'] ?? ''; ?>"
                                <?php foreach ($dataAttributeKeys as $key) : ?>
                                    <?php echo $key; ?>="<?php echo $button[$key]; ?>"
                                <?php endforeach; ?>
                                <?php if (!empty($button['onclick'])) : ?>
                                    onclick="<?php echo $button['onclick']; ?>"
                                <?php endif; ?>
                                title="<?php echo Text::_($button['label']); ?>"
                                id="<?php echo $button['id']; ?>">
                            <?php if (!empty($button['icon'])) : ?>
                                <span class="<?php echo $button['icon']; ?>" aria-hidden="true"></span>
                            <?php elseif (!empty($button['image'])) : ?>
                                <?php echo HTMLHelper::_('image', $button['image'], Text::_($button['tooltip'] ?? ''), ['class' => 'icon'], true); ?>
                            <?php elseif (!empty($button['svg'])) : ?>
                                <?php echo $button['svg']; ?>
                            <?php endif; ?>
                            <?php echo Text::_($button['label']); ?>
                        </button>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

            <?php echo $this->form->renderControlFields(); ?>
        </fieldset>
    </form>
</div>

<nav class="tracy-auth-links" aria-label="<?php echo $this->escape(Text::_('JLOGIN')); ?>">
    <a href="<?php echo Route::_('index.php?option=com_users&view=reset'); ?>">
        <?php echo Text::_('COM_USERS_LOGIN_RESET'); ?>
    </a>
    <a href="<?php echo Route::_('index.php?option=com_users&view=remind'); ?>">
        <?php echo Text::_('COM_USERS_LOGIN_REMIND'); ?>
    </a>
    <?php if ($usersConfig->get('allowUserRegistration')) : ?>
        <?php
        $regLinkMenuId = $this->params->get('customRegLinkMenu');
        $regLink       = 'index.php?option=com_users&view=registration';

        if ($regLinkMenuId) {
            $item = Factory::getApplication()->getMenu()->getItem($regLinkMenuId);

            if ($item) {
                $regLink = 'index.php?Itemid=' . $regLinkMenuId;
            }
        }
        ?>
        <a href="<?php echo Route::_($regLink); ?>">
            <?php echo Text::_('COM_USERS_LOGIN_REGISTER'); ?>
        </a>
    <?php endif; ?>
</nav>
