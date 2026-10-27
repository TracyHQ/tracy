<?php

/**
 * Tracy — com_wrapper iframe page.
 *
 * Core drops a bare <iframe> straight onto the page, so an embedded site sits on the canvas with no
 * edge at all. Design-spec §6 (wrapper.html) asks for a ringed shell at 18px: the frame goes inside
 * .tracy-wrapper, which carries --radius-lg, the 1px containment ring (--elev-ring, never a
 * shadow) and `overflow:hidden` so the embedded page is clipped to the same corner radius.
 *
 * Everything else is core's: the iframe-height script, the `load` attributes the view builds, and
 * the width/height/lazyloading params stay admin-editable.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;

/** @var \Joomla\Component\Wrapper\Site\View\Wrapper\HtmlView $this */
$this->getDocument()->getWebAssetManager()
    ->registerAndUseScript('com_wrapper.iframe', 'com_wrapper/iframe-height.min.js', [], ['defer' => true]);

$title = $this->escape($this->params->get('page_heading')) ?: $this->escape($this->params->get('page_title'));
?>
<div class="com-wrapper contentpane">

    <?php if ($this->params->get('show_page_heading')) : ?>
        <div class="tracy-view-head">
            <h1 class="tracy-view-head__title"><?php echo $title; ?></h1>
        </div>
    <?php endif; ?>

    <div class="tracy-wrapper">
        <iframe <?php echo $this->wrapper->load; ?>
            id="blockrandom"
            name="iframe"
            src="<?php echo $this->escape($this->wrapper->url); ?>"
            width="<?php echo $this->escape($this->params->get('width')); ?>"
            height="<?php echo $this->escape($this->params->get('height')); ?>"
            loading="<?php echo $this->escape($this->params->get('lazyloading', 'lazy')); ?>"
            title="<?php echo $title; ?>"
            class="com-wrapper__iframe wrapper tracy-wrapper__frame <?php echo $this->pageclass_sfx; ?>">
            <?php echo Text::_('COM_WRAPPER_NO_IFRAMES'); ?>
        </iframe>
    </div>
</div>
