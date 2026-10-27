<?php

/**
 * @package     Tracy
 * @subpackage  com_users.remind
 *
 * Template override of the T4 base view. "Forgot your username" — the same card shell as login and
 * reset, so the three recovery routes are one flow. The base rendered the fieldset label as a
 * <legend>; here it is the lead sentence, matching reset/default.php.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Remind\HtmlView $this */

HTMLHelper::_('behavior.keepalive');
HTMLHelper::_('behavior.formvalidator');
?>
<div class="tracy-auth">
    <div class="com-users-remind tracy-auth-card <?php echo $this->pageclass_sfx; ?>">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>

        <form id="user-registration"
              action="<?php echo Route::_('index.php?option=com_users&task=remind.remind'); ?>"
              method="post"
              class="com-users-remind__form tracy-auth-form form-validate">
            <?php foreach ($this->form->getFieldsets() as $fieldset) : ?>
                <fieldset class="tracy-auth-fieldset">
                    <?php if (isset($fieldset->label) && ($intro = trim(Text::_($fieldset->label))) !== '') : ?>
                        <p class="tracy-auth-lead"><?php echo $intro; ?></p>
                    <?php endif; ?>
                    <?php echo $this->form->renderFieldset($fieldset->name, ['class' => 'tracy-field']); ?>
                </fieldset>
            <?php endforeach; ?>

            <div class="tracy-auth-actions">
                <button type="submit" class="btn btn-primary validate tracy-auth-submit">
                    <?php echo Text::_('JSUBMIT'); ?>
                </button>
            </div>

            <?php echo $this->form->renderControlFields(); ?>
        </form>
    </div>

    <nav class="tracy-auth-links" aria-label="<?php echo $this->escape(Text::_('JLOGIN')); ?>">
        <a href="<?php echo Route::_('index.php?option=com_users&view=login'); ?>">
            <?php echo Text::_('JLOGIN'); ?>
        </a>
        <a href="<?php echo Route::_('index.php?option=com_users&view=reset'); ?>">
            <?php echo Text::_('COM_USERS_LOGIN_RESET'); ?>
        </a>
    </nav>
</div>
