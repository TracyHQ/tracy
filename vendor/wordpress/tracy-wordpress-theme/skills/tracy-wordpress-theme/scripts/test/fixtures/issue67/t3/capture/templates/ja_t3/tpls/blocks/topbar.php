<?php
defined('_JEXEC') or die;
?>
<?php if ($this->countModules('topbar-left')) : ?>
<jdoc:include type="modules" name="<?php $this->_p('topbar-left') ?>" />
<jdoc:include type="modules" name="<?php $this->_p('topbar-right') ?>" />
<?php endif ?>
