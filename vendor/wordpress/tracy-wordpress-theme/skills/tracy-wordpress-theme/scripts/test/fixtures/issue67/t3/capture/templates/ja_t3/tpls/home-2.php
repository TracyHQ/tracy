<?php
defined('_JEXEC') or die;
?>
<body>
  <?php $this->loadBlock('topbar') ?>
  <?php $this->loadBlock('header/header'.$themeInfo) ?>
  <?php $this->loadBlock('hero') ?>
  <?php $this->loadBlock('sections-top') ?>
  <?php $this->loadBlock('mainbody') ?>
  <?php $this->loadBlock('sections-bottom') ?>
  <?php $this->loadBlock('footer') ?>
</body>
