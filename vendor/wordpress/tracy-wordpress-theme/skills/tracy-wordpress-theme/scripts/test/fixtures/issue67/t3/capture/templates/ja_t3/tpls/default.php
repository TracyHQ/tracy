<?php
defined('_JEXEC') or die;
$themeInfo = '';
?>
<body>
  <?php $this->loadBlock('topbar') ?>
  <?php if (JFile::exists(JPATH_ROOT . '/templates/ja_t3/tpls/blocks/header/header' . $themeInfo . '.php')) :?>
    <?php $this->loadBlock('header/header'.$themeInfo); ?>
  <?php else: ?>
    <?php $this->loadBlock('header/header'); ?>
  <?php endif; ?>
  <?php $this->loadBlock('hero') ?>
  <?php $this->loadBlock('masthead') ?>
  <?php $this->loadBlock('sections-top') ?>
  <?php $this->loadBlock('mainbody') ?>
  <?php $this->loadBlock('sections-bottom') ?>
  <?php $this->loadBlock('navhelper') ?>
  <?php $this->loadBlock('footer') ?>
</body>
