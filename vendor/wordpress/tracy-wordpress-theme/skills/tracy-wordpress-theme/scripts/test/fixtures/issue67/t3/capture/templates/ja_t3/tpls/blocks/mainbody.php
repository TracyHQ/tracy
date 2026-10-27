<?php
defined('_JEXEC') or die;
if (is_array($this->getParam('skip_component_content')) &&
  in_array(JFactory::getApplication()->input->getInt('Itemid'), $this->getParam('skip_component_content')) &&
	JFactory::getApplication()->input->getString('option') !== "com_config")
return;
?>
<?php
$sidebar1 = 'sidebar-1';
$sidebar2 = 'sidebar-2';
$sidebar1 = $this->countModules($sidebar1) ? $sidebar1 : false;
$sidebar2 = $this->countModules($sidebar2) ? $sidebar2 : false;
$this->loadBlock('mainbody/no-sidebar');
