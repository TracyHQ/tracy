<?php
if (is_array($this->getParam('skip_component_content')) && in_array(JFactory::getApplication()->input->getInt('Itemid'), $this->getParam('skip_component_content')) && JFactory::getApplication()->input->getString('option') !== "com_config") return;
// return; "return"
/* return */ $s = 'return';
$h = <<<EOT
return;
EOT;
?>
return <?php if ($this->y()) return; ?>
<jdoc:include type="component" />
