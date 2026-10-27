<?php

/**
 * @package     Tracy
 * @subpackage  com_users.reset
 *
 * Template override. Step 2 of 3 — the token + username check. The base copies Joomla core and keeps
 * `form-horizontal well`: `.well` is a Bootstrap 3 leftover the T4 legacy sheet still paints as a
 * grey inset box, so the step rendered as a grey slab inside a white page and did not follow the
 * theme at all. Card shell instead, and the labels stack like every other field on the site.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Reset\HtmlView $this */

HTMLHelper::_('behavior.keepalive');
HTMLHelper::_('behavior.formvalidator');
?>
<div class="tracy-auth">
    <div class="com-users-reset-confirm tracy-auth-card <?php echo $this->pageclass_sfx; ?>">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>

        <form action="<?php echo Route::_('index.php?option=com_users&task=reset.confirm'); ?>"
              method="post"
              class="com-users-reset__form tracy-auth-form form-validate">
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
</div>
